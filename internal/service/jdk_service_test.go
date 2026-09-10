package service_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/service"
)

func TestJDKService_RegisterAndList(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	fakeJavaHome := filepath.Join(tmpDir, "fake-jdk-17")
	binDir := filepath.Join(fakeJavaHome, "bin")
	require.NoError(t, os.MkdirAll(binDir, 0755))
	fakeJavaBin := filepath.Join(binDir, "java")
	require.NoError(t, os.WriteFile(fakeJavaBin, []byte("#!/bin/sh\necho openjdk 17.0.9\n"), 0755))

	asset := &model.JDKAsset{
		Name:       "OpenJDK-17",
		JavaHome:   fakeJavaHome,
		BinPath:    fakeJavaBin,
		VersionStr: "17.0.9",
		IsSystem:   false,
	}

	err = svc.Register(asset)
	require.NoError(t, err)
	assert.NotZero(t, asset.ID)
	assert.False(t, asset.CreatedAt.IsZero())

	list, err := svc.List()
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "OpenJDK-17", list[0].Name)
	assert.Equal(t, fakeJavaHome, list[0].JavaHome)
	assert.Equal(t, fakeJavaBin, list[0].BinPath)
	assert.Equal(t, "17.0.9", list[0].VersionStr)
	assert.False(t, list[0].IsSystem)
}

func TestJDKService_GetByID(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	asset := &model.JDKAsset{
		Name:       "Corretto-11",
		JavaHome:   "/opt/corretto-11",
		BinPath:    "/opt/corretto-11/bin/java",
		VersionStr: "11.0.20",
		IsSystem:   false,
	}

	require.NoError(t, svc.Register(asset))

	fetched, err := svc.GetByID(asset.ID)
	require.NoError(t, err)
	assert.Equal(t, asset.ID, fetched.ID)
	assert.Equal(t, "Corretto-11", fetched.Name)
	assert.Equal(t, "/opt/corretto-11", fetched.JavaHome)
	assert.Equal(t, "/opt/corretto-11/bin/java", fetched.BinPath)
	assert.Equal(t, "11.0.20", fetched.VersionStr)

	// Non-existent ID
	notFound, err := svc.GetByID(9999)
	assert.Error(t, err)
	assert.True(t, errors.Is(err, service.ErrNotFound))
	assert.Nil(t, notFound)
}

func TestJDKService_GetByName(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	asset := &model.JDKAsset{
		Name:       "Temurin-21",
		JavaHome:   "/opt/temurin-21",
		BinPath:    "/opt/temurin-21/bin/java",
		VersionStr: "21.0.1",
		IsSystem:   true,
	}

	require.NoError(t, svc.Register(asset))

	fetched, err := svc.GetByName("Temurin-21")
	require.NoError(t, err)
	assert.Equal(t, asset.ID, fetched.ID)
	assert.Equal(t, "Temurin-21", fetched.Name)

	// Non-existent name
	notFound, err := svc.GetByName("non-existent")
	assert.Error(t, err)
	assert.True(t, errors.Is(err, service.ErrNotFound))
	assert.Nil(t, notFound)
}

func TestJDKService_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	asset := &model.JDKAsset{
		Name:       "Oracle-8",
		JavaHome:   "/opt/jdk1.8",
		BinPath:    "/opt/jdk1.8/bin/java",
		VersionStr: "1.8.0_381",
		IsSystem:   false,
	}

	require.NoError(t, svc.Register(asset))

	// Delete existing
	err = svc.Delete(asset.ID)
	require.NoError(t, err)

	// Verify it's gone
	list, err := svc.List()
	require.NoError(t, err)
	assert.Empty(t, list)

	_, err = svc.GetByID(asset.ID)
	assert.Error(t, err)
	assert.True(t, errors.Is(err, service.ErrNotFound))

	// Delete again should return ErrNotFound
	err = svc.Delete(asset.ID)
	assert.Error(t, err)
	assert.True(t, errors.Is(err, service.ErrNotFound))
}

func TestJDKService_RegisterValidation(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	// Nil asset
	err = svc.Register(nil)
	assert.Error(t, err)

	// Empty name
	err = svc.Register(&model.JDKAsset{
		Name:     "",
		JavaHome: "/opt/jdk",
		BinPath:  "/opt/jdk/bin/java",
	})
	assert.Error(t, err)

	// Empty java home
	err = svc.Register(&model.JDKAsset{
		Name:     "TestJDK",
		JavaHome: "",
		BinPath:  "/opt/jdk/bin/java",
	})
	assert.Error(t, err)

	// Empty bin path
	err = svc.Register(&model.JDKAsset{
		Name:     "TestJDK",
		JavaHome: "/opt/jdk",
		BinPath:  "",
	})
	assert.Error(t, err)

	// Duplicate name
	validAsset := &model.JDKAsset{
		Name:       "UniqueJDK",
		JavaHome:   "/opt/jdk-a",
		BinPath:    "/opt/jdk-a/bin/java",
		VersionStr: "17.0.1",
	}
	require.NoError(t, svc.Register(validAsset))

	duplicateAsset := &model.JDKAsset{
		Name:       "UniqueJDK",
		JavaHome:   "/opt/jdk-b",
		BinPath:    "/opt/jdk-b/bin/java",
		VersionStr: "17.0.2",
	}
	err = svc.Register(duplicateAsset)
	assert.Error(t, err)
}

func TestJDKService_ScanDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)

	// 1. Standard linux layout: <dir>/fake-linux-jdk/bin/java
	linuxJDKHome := filepath.Join(tmpDir, "fake-linux-jdk")
	linuxBinDir := filepath.Join(linuxJDKHome, "bin")
	require.NoError(t, os.MkdirAll(linuxBinDir, 0755))
	linuxBin := filepath.Join(linuxBinDir, "java")
	require.NoError(t, os.WriteFile(linuxBin, []byte("#!/bin/sh\necho 'openjdk version \"17.0.9\" 2023-10-17'\n"), 0755))

	// 2. macOS bundle layout: <dir>/fake-mac-jdk.jdk/Contents/Home/bin/java
	macJDKBundle := filepath.Join(tmpDir, "fake-mac-jdk.jdk")
	macJDKHome := filepath.Join(macJDKBundle, "Contents", "Home")
	macBinDir := filepath.Join(macJDKHome, "bin")
	require.NoError(t, os.MkdirAll(macBinDir, 0755))
	macBin := filepath.Join(macBinDir, "java")
	require.NoError(t, os.WriteFile(macBin, []byte("#!/bin/sh\necho 'openjdk version \"21.0.2\" 2024-01-16'\n"), 0755))

	// 3. Non-JDK dir: <dir>/empty-dir
	emptyDir := filepath.Join(tmpDir, "empty-dir")
	require.NoError(t, os.MkdirAll(emptyDir, 0755))

	discovered, err := svc.ScanDirectories(tmpDir)
	require.NoError(t, err)
	require.Len(t, discovered, 2)

	versions := map[string]model.JDKAsset{}
	for _, asset := range discovered {
		assert.True(t, asset.IsSystem)
		assert.NotEmpty(t, asset.Name)
		versions[asset.VersionStr] = asset
	}

	assert.Contains(t, versions, "17.0.9")
	assert.Equal(t, linuxJDKHome, versions["17.0.9"].JavaHome)
	assert.Equal(t, linuxBin, versions["17.0.9"].BinPath)

	assert.Contains(t, versions, "21.0.2")
	assert.Equal(t, macJDKHome, versions["21.0.2"].JavaHome)
	assert.Equal(t, macBin, versions["21.0.2"].BinPath)
}

func TestJDKService_ScanSystemJDKs_WithJavaHome(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	svc := service.NewJDKService(db)
	// Isolate scan directories so unit tests don't scan and execute host machine JDK binaries
	svc.SetScanDirs(filepath.Join(tmpDir, "empty-scan"))

	fakeJavaHome := filepath.Join(tmpDir, "custom-jdk-8")
	binDir := filepath.Join(fakeJavaHome, "bin")
	require.NoError(t, os.MkdirAll(binDir, 0755))
	fakeJavaBin := filepath.Join(binDir, "java")
	require.NoError(t, os.WriteFile(fakeJavaBin, []byte("#!/bin/sh\necho 'java version \"1.8.0_381\"'\n"), 0755))

	t.Setenv("JAVA_HOME", fakeJavaHome)

	discovered, err := svc.ScanSystemJDKs()
	require.NoError(t, err)

	require.Len(t, discovered, 1)
	assert.Equal(t, fakeJavaHome, discovered[0].JavaHome)
	assert.Equal(t, fakeJavaBin, discovered[0].BinPath)
	assert.Equal(t, "1.8.0_381", discovered[0].VersionStr)
	assert.True(t, discovered[0].IsSystem)
}

func TestParseJavaVersion(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "standard openjdk 17 output",
			input:    "openjdk version \"17.0.9\" 2023-10-17\nOpenJDK Runtime Environment (build 17.0.9+9)\n",
			expected: "17.0.9",
		},
		{
			name:     "standard oracle java 8 output",
			input:    "java version \"1.8.0_381\"\nJava(TM) SE Runtime Environment (build 1.8.0_381-b09)\n",
			expected: "1.8.0_381",
		},
		{
			name:     "openjdk 25 output",
			input:    "openjdk version \"25.0.2\" 2026-01-20\n",
			expected: "25.0.2",
		},
		{
			name:     "script test output simple",
			input:    "openjdk 17.0.9\n",
			expected: "17.0.9",
		},
		{
			name:     "bare semver",
			input:    "21.0.1",
			expected: "21.0.1",
		},
		{
			name:     "unknown output",
			input:    "something completely invalid",
			expected: "unknown",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := service.ParseJavaVersion(tc.input)
			assert.Equal(t, tc.expected, actual)
		})
	}
}
