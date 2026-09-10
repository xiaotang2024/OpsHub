package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/config"
)

func TestLoadConfig_DefaultsAndFile(t *testing.T) {
	tempDir := t.TempDir()
	cfgPath := filepath.Join(tempDir, "opshub.yaml")
	yamlContent := []byte(`
server:
  port: 9090
  jwt_secret: "test-secret-key-123"
data_dir: "` + tempDir + `"
`)
	err := os.WriteFile(cfgPath, yamlContent, 0644)
	require.NoError(t, err)

	cfg, err := config.LoadConfig(cfgPath)
	require.NoError(t, err)
	assert.Equal(t, 9090, cfg.Server.Port)
	assert.Equal(t, "test-secret-key-123", cfg.Server.JWTSecret)
	assert.Equal(t, tempDir, cfg.DataDir)
	assert.Equal(t, filepath.Join(tempDir, "packages"), cfg.PackagesDir())
}

func TestLoadConfig_EmptyPath(t *testing.T) {
	cfg, err := config.LoadConfig("")
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "opshub-default-jwt-secret-replace-me", cfg.Server.JWTSecret)
	assert.NotEmpty(t, cfg.DataDir)
}

func TestLoadConfig_NonExistentFile(t *testing.T) {
	cfg, err := config.LoadConfig("/path/to/nonexistent/config.yaml")
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.Equal(t, 8080, cfg.Server.Port)
}

func TestLoadConfig_InvalidYAML(t *testing.T) {
	tempDir := t.TempDir()
	cfgPath := filepath.Join(tempDir, "invalid.yaml")
	err := os.WriteFile(cfgPath, []byte("invalid: [unclosed"), 0644)
	require.NoError(t, err)

	cfg, err := config.LoadConfig(cfgPath)
	assert.Error(t, err)
	assert.Nil(t, cfg)
}

func TestLoadConfig_ReadError(t *testing.T) {
	tempDir := t.TempDir()
	// Reading a directory as a file produces an error that is not os.ErrNotExist
	cfg, err := config.LoadConfig(tempDir)
	assert.Error(t, err)
	assert.Nil(t, cfg)
}

func TestAppConfig_HelperMethods(t *testing.T) {
	cfg := &config.AppConfig{
		DataDir: "/opt/opshub/data",
	}
	assert.Equal(t, "/opt/opshub/data/opshub.db", cfg.DBPath())
	assert.Equal(t, "/opt/opshub/data/packages", cfg.PackagesDir())
	assert.Equal(t, "/opt/opshub/data/logs", cfg.LogsDir())
}
