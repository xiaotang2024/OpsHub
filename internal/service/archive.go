package service

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// isArchiveFile checks if a file name or path represents an extractable compressed archive.
func isArchiveFile(filename, storagePath string) bool {
	lowerName := strings.ToLower(filename)
	lowerPath := strings.ToLower(storagePath)

	for _, s := range []string{lowerName, lowerPath} {
		if strings.HasSuffix(s, ".zip") ||
			strings.HasSuffix(s, ".tar.gz") ||
			strings.HasSuffix(s, ".tgz") ||
			strings.HasSuffix(s, ".tar") {
			return true
		}
	}
	return false
}

// unpackArtifact unpacks a zip or tar archive into destDir.
// If the archive contains a single top-level directory, it flattens it so files land directly in destDir.
// It ensures executable permissions for shell scripts (*.sh, bin/*).
func unpackArtifact(srcPath, destDir string) error {
	lower := strings.ToLower(srcPath)
	if strings.HasSuffix(lower, ".zip") {
		return unpackZip(srcPath, destDir)
	}
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") {
		return unpackTar(srcPath, destDir, true)
	}
	if strings.HasSuffix(lower, ".tar") {
		return unpackTar(srcPath, destDir, false)
	}

	// Fallback detection: try zip first, then gzip tar
	if err := unpackZip(srcPath, destDir); err == nil {
		return nil
	}
	return unpackTar(srcPath, destDir, true)
}

// unpackZip extracts a .zip archive into destDir.
func unpackZip(srcPath, destDir string) error {
	r, err := zip.OpenReader(srcPath)
	if err != nil {
		return fmt.Errorf("open zip %s failed: %w", srcPath, err)
	}
	defer r.Close()

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("create dest dir %s failed: %w", destDir, err)
	}

	// Detect if all payload files share a single common top-level directory
	prefix := detectZipSingleTopLevelDir(r.File)

	for _, f := range r.File {
		cleanName := filepath.Clean(f.Name)

		// Prevent Zip Slip
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			continue
		}

		// Skip macOS metadata
		if isMetadataPath(cleanName) {
			continue
		}

		// Strip common prefix if applicable
		relPath := cleanName
		if prefix != "" {
			if !strings.HasPrefix(relPath, prefix) {
				continue
			}
			relPath = strings.TrimPrefix(relPath, prefix)
			relPath = strings.TrimPrefix(relPath, "/")
			relPath = strings.TrimPrefix(relPath, "\\")
		}

		if relPath == "" || relPath == "." {
			continue
		}

		targetPath := filepath.Join(destDir, relPath)

		// Double-check path traversal
		if !strings.HasPrefix(filepath.Clean(targetPath)+string(filepath.Separator), filepath.Clean(destDir)+string(filepath.Separator)) {
			continue
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		mode := f.Mode()
		if strings.HasSuffix(targetPath, ".sh") || strings.Contains(targetPath, "/bin/") || strings.Contains(targetPath, "\\bin\\") {
			mode = mode | 0755
		} else if mode == 0 {
			mode = 0644
		}

		outFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			rc.Close()
			return err
		}

		_, copyErr := io.Copy(outFile, rc)
		closeErr := rc.Close()
		outCloseErr := outFile.Close()

		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if outCloseErr != nil {
			return outCloseErr
		}

		// Ensure permissions applied
		_ = os.Chmod(targetPath, mode)
	}

	return nil
}

// detectZipSingleTopLevelDir checks if all meaningful files in zip share a single top-level directory.
func detectZipSingleTopLevelDir(files []*zip.File) string {
	var firstDir string
	foundFile := false

	for _, f := range files {
		clean := filepath.Clean(f.Name)
		if isMetadataPath(clean) {
			continue
		}

		parts := strings.Split(filepath.ToSlash(clean), "/")
		if len(parts) == 0 || parts[0] == "" || parts[0] == "." {
			continue
		}

		topDir := parts[0]
		if firstDir == "" {
			firstDir = topDir
		} else if firstDir != topDir {
			// Found multiple top-level items
			return ""
		}

		if !f.FileInfo().IsDir() {
			foundFile = true
		}
	}

	if foundFile && firstDir != "" {
		return firstDir + "/"
	}
	return ""
}

// unpackTar extracts a .tar or .tar.gz archive into destDir.
func unpackTar(srcPath, destDir string, isGzip bool) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open tar %s failed: %w", srcPath, err)
	}
	defer f.Close()

	var tr *tar.Reader
	if isGzip {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return fmt.Errorf("open gzip %s failed: %w", srcPath, err)
		}
		defer gz.Close()
		tr = tar.NewReader(gz)
	} else {
		tr = tar.NewReader(f)
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("create dest dir %s failed: %w", destDir, err)
	}

	// We need two passes or in-memory header caching to detect single top-level directory
	type tarEntry struct {
		header *tar.Header
		body   []byte
	}

	var entries []tarEntry
	var firstDir string
	hasMultipleTop := false
	foundFile := false

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		clean := filepath.Clean(hdr.Name)
		if isMetadataPath(clean) {
			continue
		}

		parts := strings.Split(filepath.ToSlash(clean), "/")
		if len(parts) > 0 && parts[0] != "" && parts[0] != "." {
			top := parts[0]
			if firstDir == "" {
				firstDir = top
			} else if firstDir != top {
				hasMultipleTop = true
			}
		}

		if hdr.Typeflag != tar.TypeDir {
			foundFile = true
		}

		var body []byte
		if hdr.Typeflag == tar.TypeReg || hdr.Typeflag == tar.TypeRegA {
			body, err = io.ReadAll(tr)
			if err != nil {
				return err
			}
		}

		entries = append(entries, tarEntry{header: hdr, body: body})
	}

	var prefix string
	if foundFile && firstDir != "" && !hasMultipleTop {
		prefix = firstDir + "/"
	}

	for _, e := range entries {
		cleanName := filepath.Clean(e.header.Name)
		if strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			continue
		}

		relPath := cleanName
		if prefix != "" {
			if !strings.HasPrefix(relPath, prefix) {
				continue
			}
			relPath = strings.TrimPrefix(relPath, prefix)
			relPath = strings.TrimPrefix(relPath, "/")
			relPath = strings.TrimPrefix(relPath, "\\")
		}

		if relPath == "" || relPath == "." {
			continue
		}

		targetPath := filepath.Join(destDir, relPath)
		if !strings.HasPrefix(filepath.Clean(targetPath)+string(filepath.Separator), filepath.Clean(destDir)+string(filepath.Separator)) {
			continue
		}

		if e.header.Typeflag == tar.TypeDir {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		mode := os.FileMode(e.header.Mode)
		if strings.HasSuffix(targetPath, ".sh") || strings.Contains(targetPath, "/bin/") || strings.Contains(targetPath, "\\bin\\") {
			mode = mode | 0755
		} else if mode == 0 {
			mode = 0644
		}

		if err := os.WriteFile(targetPath, e.body, mode); err != nil {
			return err
		}
		_ = os.Chmod(targetPath, mode)
	}

	return nil
}

// isMetadataPath checks if an archive path is OS-generated junk (e.g. macOS __MACOSX or .DS_Store).
func isMetadataPath(p string) bool {
	slash := filepath.ToSlash(p)
	if strings.HasPrefix(slash, "__MACOSX") || strings.Contains(slash, "/__MACOSX/") {
		return true
	}
	if strings.HasSuffix(slash, ".DS_Store") || strings.Contains(slash, "/.DS_Store") {
		return true
	}
	return false
}
