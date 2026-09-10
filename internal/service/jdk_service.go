package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"opshub/internal/model"
)

var (
	// ErrNotFound indicates the requested JDK asset was not found.
	ErrNotFound = errors.New("jdk asset not found")

	// ErrAlreadyExists indicates a JDK asset with the same name already exists.
	ErrAlreadyExists = errors.New("jdk asset already exists")
)

var defaultScanDirectories = []string{
	"/usr/lib/jvm",
	"/usr/java",
	"/Library/Java/JavaVirtualMachines",
	"/Library/Java/Home",
	"/opt/java",
	"/usr/local/opt/openjdk",
	"/opt/homebrew/opt/openjdk",
}

// JDKService manages JDK asset discovery, registration, queries, and deletion.
type JDKService struct {
	db       *sql.DB
	scanDirs []string
}

// NewJDKService creates a new JDKService backed by the given SQLite DB.
func NewJDKService(db *sql.DB) *JDKService {
	return &JDKService{
		db:       db,
		scanDirs: defaultScanDirectories,
	}
}

// SetScanDirs configures the search directories for auto-discovery.
func (s *JDKService) SetScanDirs(dirs ...string) {
	s.scanDirs = dirs
}

// Register persists a new JDKAsset into the database.
func (s *JDKService) Register(asset *model.JDKAsset) error {
	if asset == nil {
		return errors.New("asset cannot be nil")
	}
	if strings.TrimSpace(asset.Name) == "" {
		return errors.New("name cannot be empty")
	}
	if strings.TrimSpace(asset.JavaHome) == "" {
		return errors.New("java_home cannot be empty")
	}
	if strings.TrimSpace(asset.BinPath) == "" {
		return errors.New("bin_path cannot be empty")
	}

	if asset.CreatedAt.IsZero() {
		asset.CreatedAt = time.Now().UTC()
	}

	query := `
		INSERT INTO jdk_assets (name, java_home, bin_path, version_str, is_system, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	res, err := s.db.Exec(query,
		asset.Name,
		asset.JavaHome,
		asset.BinPath,
		asset.VersionStr,
		asset.IsSystem,
		asset.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return fmt.Errorf("%w: %s", ErrAlreadyExists, asset.Name)
		}
		return fmt.Errorf("failed to register jdk asset: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to retrieve last insert id: %w", err)
	}
	asset.ID = id
	return nil
}

// List retrieves all registered JDK assets from the database ordered by ID.
func (s *JDKService) List() ([]model.JDKAsset, error) {
	query := `
		SELECT id, name, java_home, bin_path, version_str, is_system, created_at
		FROM jdk_assets
		ORDER BY id ASC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query jdk assets: %w", err)
	}
	defer rows.Close()

	list := make([]model.JDKAsset, 0)
	for rows.Next() {
		var a model.JDKAsset
		if err := rows.Scan(
			&a.ID,
			&a.Name,
			&a.JavaHome,
			&a.BinPath,
			&a.VersionStr,
			&a.IsSystem,
			&a.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan jdk asset: %w", err)
		}
		list = append(list, a)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration failed: %w", err)
	}
	return list, nil
}

// GetByID retrieves a registered JDK asset by its ID.
func (s *JDKService) GetByID(id int64) (*model.JDKAsset, error) {
	query := `
		SELECT id, name, java_home, bin_path, version_str, is_system, created_at
		FROM jdk_assets
		WHERE id = ?
	`
	var a model.JDKAsset
	err := s.db.QueryRow(query, id).Scan(
		&a.ID,
		&a.Name,
		&a.JavaHome,
		&a.BinPath,
		&a.VersionStr,
		&a.IsSystem,
		&a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get jdk asset by id %d: %w", id, err)
	}
	return &a, nil
}

// GetByName retrieves a registered JDK asset by its name.
func (s *JDKService) GetByName(name string) (*model.JDKAsset, error) {
	query := `
		SELECT id, name, java_home, bin_path, version_str, is_system, created_at
		FROM jdk_assets
		WHERE name = ?
	`
	var a model.JDKAsset
	err := s.db.QueryRow(query, name).Scan(
		&a.ID,
		&a.Name,
		&a.JavaHome,
		&a.BinPath,
		&a.VersionStr,
		&a.IsSystem,
		&a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get jdk asset by name %q: %w", name, err)
	}
	return &a, nil
}

// Delete removes a registered JDK asset by its ID.
func (s *JDKService) Delete(id int64) error {
	res, err := s.db.Exec("DELETE FROM jdk_assets WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete jdk asset %d: %w", id, err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ScanSystemJDKs searches common system locations and JAVA_HOME to discover installed JDKs.
func (s *JDKService) ScanSystemJDKs() ([]model.JDKAsset, error) {
	dirs := make([]string, 0, len(s.scanDirs)+1)
	if jh := os.Getenv("JAVA_HOME"); jh != "" {
		dirs = append(dirs, jh)
	}
	dirs = append(dirs, s.scanDirs...)
	return s.ScanDirectories(dirs...)
}

// ScanDirectories inspects the provided directory paths for JDK installations.
func (s *JDKService) ScanDirectories(dirs ...string) ([]model.JDKAsset, error) {
	discovered := make([]model.JDKAsset, 0)
	seenBins := make(map[string]bool)
	nameCounts := make(map[string]int)

	for _, dir := range dirs {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			continue
		}

		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			continue
		}

		// Check if the directory itself is directly a JDK home
		if asset, ok := inspectJDKDir(dir); ok {
			s.appendIfUnique(&discovered, asset, seenBins, nameCounts)
			continue
		}

		// Otherwise inspect immediate subdirectories
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			entryPath := filepath.Join(dir, entry.Name())
			if asset, ok := inspectJDKDir(entryPath); ok {
				s.appendIfUnique(&discovered, asset, seenBins, nameCounts)
			}
		}
	}

	return discovered, nil
}

func (s *JDKService) appendIfUnique(list *[]model.JDKAsset, asset *model.JDKAsset, seenBins map[string]bool, nameCounts map[string]int) {
	canonicalBin := asset.BinPath
	if realPath, err := filepath.EvalSymlinks(asset.BinPath); err == nil {
		canonicalBin = realPath
	}

	if seenBins[canonicalBin] {
		return
	}
	seenBins[canonicalBin] = true

	// Ensure unique asset name
	count := nameCounts[asset.Name]
	nameCounts[asset.Name]++
	if count > 0 {
		asset.Name = fmt.Sprintf("%s-%d", asset.Name, count+1)
	}

	*list = append(*list, *asset)
}

func inspectJDKDir(dir string) (*model.JDKAsset, bool) {
	// 1. Standard layout: <dir>/bin/java
	candidateBin := filepath.Join(dir, "bin", "java")
	candidateHome := dir

	info, err := os.Stat(candidateBin)
	if err != nil || info.IsDir() {
		// 2. macOS bundle layout: <dir>/Contents/Home/bin/java
		candidateBin = filepath.Join(dir, "Contents", "Home", "bin", "java")
		candidateHome = filepath.Join(dir, "Contents", "Home")

		info, err = os.Stat(candidateBin)
		if err != nil || info.IsDir() {
			return nil, false
		}
	}

	versionStr := detectJavaVersion(candidateBin)
	name := "JDK-" + versionStr
	if versionStr == "unknown" {
		name = "JDK-" + filepath.Base(candidateHome)
	}

	return &model.JDKAsset{
		Name:       name,
		JavaHome:   candidateHome,
		BinPath:    candidateBin,
		VersionStr: versionStr,
		IsSystem:   true,
	}, true
}

func detectJavaVersion(binPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, binPath, "-version")
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		// Fallback: try executing with no args
		ctx2, cancel2 := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel2()
		out, _ = exec.CommandContext(ctx2, binPath).CombinedOutput()
	}

	return ParseJavaVersion(string(out))
}

var (
	// Regex pattern 1: matches version in quotes, e.g. version "17.0.9" or "25.0.2"
	reQuotedVersion = regexp.MustCompile(`(?i)(?:openjdk|java)?\s*version\s*\"([^\"]+)\"`)

	// Regex pattern 2: matches unquoted version after openjdk/java, e.g. openjdk 17.0.9
	reUnquotedVersion = regexp.MustCompile(`(?i)(?:openjdk|java)\s+(?:version\s+)?([0-9][0-9a-zA-Z_.\-+]*)`)

	// Regex pattern 3: fallback semver / version pattern
	reSemver = regexp.MustCompile(`([0-9]+(?:\.[0-9]+)+(?:_[0-9]+)?(?:[a-zA-Z0-9.\-+]*)?)`)
)

// ParseJavaVersion extracts the version number string from java output.
func ParseJavaVersion(output string) string {
	output = strings.TrimSpace(output)
	if output == "" {
		return "unknown"
	}

	if m := reQuotedVersion.FindStringSubmatch(output); len(m) > 1 {
		return m[1]
	}

	if m := reUnquotedVersion.FindStringSubmatch(output); len(m) > 1 {
		return m[1]
	}

	if m := reSemver.FindStringSubmatch(output); len(m) > 1 {
		return m[1]
	}

	return "unknown"
}
