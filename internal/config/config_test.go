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

func TestDatabaseConfig_DefaultsSQLite(t *testing.T) {
	cfg := config.DefaultConfig()
	assert.Equal(t, "sqlite", cfg.Database.Driver)
	assert.Empty(t, cfg.Database.DSN)

	resolved := cfg.ResolvedDatabaseConfig()
	assert.Equal(t, "sqlite", resolved.Driver)
	assert.Equal(t, cfg.DBPath(), resolved.DSN, "SQLite DSN should default to DBPath()")
}

func TestDatabaseConfig_MySQLFromFile(t *testing.T) {
	tempDir := t.TempDir()
	cfgPath := filepath.Join(tempDir, "opshub.yaml")
	yamlContent := []byte(`
server:
  port: 8080
database:
  driver: mysql
  dsn: "root:password@tcp(127.0.0.1:3306)/opshub?charset=utf8mb4&parseTime=True"
data_dir: "` + tempDir + `"
`)
	err := os.WriteFile(cfgPath, yamlContent, 0644)
	require.NoError(t, err)

	cfg, err := config.LoadConfig(cfgPath)
	require.NoError(t, err)
	assert.Equal(t, "mysql", cfg.Database.Driver)
	assert.Equal(t, "root:password@tcp(127.0.0.1:3306)/opshub?charset=utf8mb4&parseTime=True", cfg.Database.DSN)

	resolved := cfg.ResolvedDatabaseConfig()
	assert.Equal(t, "mysql", resolved.Driver)
	assert.Equal(t, cfg.Database.DSN, resolved.DSN, "MySQL DSN should be used as-is")
}

func TestDatabaseConfig_EmptyDriverDefaultsSQLite(t *testing.T) {
	cfg := &config.AppConfig{
		DataDir: "/opt/opshub/data",
		Database: config.DatabaseConfig{
			Driver: "",
		},
	}
	resolved := cfg.ResolvedDatabaseConfig()
	assert.Equal(t, "sqlite", resolved.Driver)
	assert.Equal(t, "/opt/opshub/data/opshub.db", resolved.DSN)
}

func TestDatabaseConfig_SQLiteWithCustomDSN(t *testing.T) {
	cfg := &config.AppConfig{
		DataDir: "/opt/opshub/data",
		Database: config.DatabaseConfig{
			Driver: "sqlite",
			DSN:    "/custom/path/my.db",
		},
	}
	resolved := cfg.ResolvedDatabaseConfig()
	assert.Equal(t, "sqlite", resolved.Driver)
	assert.Equal(t, "/custom/path/my.db", resolved.DSN, "custom SQLite DSN should be preserved")
}
