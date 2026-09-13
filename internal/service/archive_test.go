package service

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsArchiveFile(t *testing.T) {
	assert.True(t, isArchiveFile("app.zip", "/path/to/app.zip"))
	assert.True(t, isArchiveFile("app.tar.gz", "/path/to/app.tar.gz"))
	assert.True(t, isArchiveFile("app.tgz", "/path/to/app.tgz"))
	assert.True(t, isArchiveFile("app.tar", "/path/to/app.tar"))
	assert.True(t, isArchiveFile("APP.ZIP", "/path/to/APP.ZIP"))

	assert.False(t, isArchiveFile("app.jar", "/path/to/app.jar"))
	assert.False(t, isArchiveFile("app.war", "/path/to/app.war"))
	assert.False(t, isArchiveFile("app.sh", "/path/to/app.sh"))
}

func TestUnpackArtifact_ZipSingleTopLevelDir(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "test.zip")
	destDir := filepath.Join(tmpDir, "installed")

	// Create a zip with top level "timer-server-v2/"
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	files := []struct {
		name string
		body string
		mode os.FileMode
	}{
		{"timer-server-v2/bin/start.sh", "#!/bin/bash\necho start", 0644},
		{"timer-server-v2/bin/shutdown.sh", "#!/bin/bash\necho stop", 0644},
		{"timer-server-v2/application.yaml", "server:\n  port: 8090", 0644},
		{"timer-server-v2/timer-1.0.0.jar", "fake-jar-data", 0644},
		{"__MACOSX/timer-server-v2/._start.sh", "mac-junk", 0644},
		{"timer-server-v2/.DS_Store", "mac-junk", 0644},
	}

	for _, f := range files {
		h := &zip.FileHeader{
			Name:   f.name,
			Method: zip.Deflate,
		}
		h.SetMode(f.mode)
		w, err := zw.CreateHeader(h)
		require.NoError(t, err)
		_, err = w.Write([]byte(f.body))
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
	require.NoError(t, os.WriteFile(zipPath, buf.Bytes(), 0644))

	// Unpack
	err := unpackArtifact(zipPath, destDir)
	require.NoError(t, err)

	// Verify prefix stripped and files exist directly in destDir
	assert.FileExists(t, filepath.Join(destDir, "bin", "start.sh"))
	assert.FileExists(t, filepath.Join(destDir, "bin", "shutdown.sh"))
	assert.FileExists(t, filepath.Join(destDir, "application.yaml"))
	assert.FileExists(t, filepath.Join(destDir, "timer-1.0.0.jar"))

	// Verify macOS junk was NOT extracted
	assert.NoFileExists(t, filepath.Join(destDir, ".DS_Store"))
	assert.NoDirExists(t, filepath.Join(destDir, "__MACOSX"))

	// Verify executable permission was automatically applied to shell scripts
	info, err := os.Stat(filepath.Join(destDir, "bin", "start.sh"))
	require.NoError(t, err)
	assert.True(t, info.Mode()&0111 != 0, "start.sh should be executable")
}

func TestUnpackArtifact_ZipFlat(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "flat.zip")
	destDir := filepath.Join(tmpDir, "installed")

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	files := []struct {
		name string
		body string
	}{
		{"bin/startup.sh", "#!/bin/bash\necho start"},
		{"config/app.conf", "key=value"},
	}

	for _, f := range files {
		w, err := zw.Create(f.name)
		require.NoError(t, err)
		_, err = w.Write([]byte(f.body))
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
	require.NoError(t, os.WriteFile(zipPath, buf.Bytes(), 0644))

	err := unpackArtifact(zipPath, destDir)
	require.NoError(t, err)

	assert.FileExists(t, filepath.Join(destDir, "bin", "startup.sh"))
	assert.FileExists(t, filepath.Join(destDir, "config", "app.conf"))
}

func TestUnpackArtifact_TarGz(t *testing.T) {
	tmpDir := t.TempDir()
	tarPath := filepath.Join(tmpDir, "app.tar.gz")
	destDir := filepath.Join(tmpDir, "installed")

	buf := new(bytes.Buffer)
	gw := gzip.NewWriter(buf)
	tw := tar.NewWriter(gw)

	files := []struct {
		name string
		body string
		mode int64
	}{
		{"my-app/bin/run.sh", "#!/bin/sh\necho running", 0755},
		{"my-app/conf/app.properties", "port=8080", 0644},
	}

	for _, f := range files {
		hdr := &tar.Header{
			Name: f.name,
			Mode: f.mode,
			Size: int64(len(f.body)),
		}
		require.NoError(t, tw.WriteHeader(hdr))
		_, err := tw.Write([]byte(f.body))
		require.NoError(t, err)
	}
	require.NoError(t, tw.Close())
	require.NoError(t, gw.Close())
	require.NoError(t, os.WriteFile(tarPath, buf.Bytes(), 0644))

	err := unpackArtifact(tarPath, destDir)
	require.NoError(t, err)

	assert.FileExists(t, filepath.Join(destDir, "bin", "run.sh"))
	assert.FileExists(t, filepath.Join(destDir, "conf", "app.properties"))
}
