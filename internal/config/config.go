package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type ServerConfig struct {
	Port      int    `yaml:"port"`
	JWTSecret string `yaml:"jwt_secret"`
}

// DatabaseConfig holds the database driver and connection settings.
// Driver can be "sqlite" (default) or "mysql".
// For sqlite, DSN is optional and defaults to the data_dir path.
// For mysql, DSN should be a valid go-sql-driver/mysql connection string,
// e.g. "user:password@tcp(127.0.0.1:3306)/opshub?charset=utf8mb4&parseTime=True"
type DatabaseConfig struct {
	Driver string `yaml:"driver"` // "sqlite" or "mysql", default "sqlite"
	DSN    string `yaml:"dsn"`    // connection string; optional for sqlite
}

type AppConfig struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	DataDir  string         `yaml:"data_dir"`
}

func (c *AppConfig) DBPath() string {
	return filepath.Join(c.DataDir, "opshub.db")
}

func (c *AppConfig) PackagesDir() string {
	return filepath.Join(c.DataDir, "packages")
}

func (c *AppConfig) LogsDir() string {
	return filepath.Join(c.DataDir, "logs")
}

// ResolvedDatabaseConfig returns a DatabaseConfig with defaults filled in.
// For sqlite, if DSN is empty it defaults to the standard DBPath.
func (c *AppConfig) ResolvedDatabaseConfig() DatabaseConfig {
	cfg := c.Database
	if cfg.Driver == "" {
		cfg.Driver = "sqlite"
	}
	if cfg.Driver == "sqlite" && cfg.DSN == "" {
		cfg.DSN = c.DBPath()
	}
	return cfg
}

func DefaultConfig() *AppConfig {
	home, _ := os.UserHomeDir()
	defaultDataDir := filepath.Join(home, ".opshub", "data")
	return &AppConfig{
		Server: ServerConfig{
			Port:      8080,
			JWTSecret: "opshub-default-jwt-secret-replace-me",
		},
		Database: DatabaseConfig{
			Driver: "sqlite",
		},
		DataDir: defaultDataDir,
	}
}

// ResolveConfigPath locates the configuration file to load.
// If path is non-empty, it returns path directly.
// Otherwise, it checks for "config.yaml" and "config/config.yaml" in the current working directory.
func ResolveConfigPath(path string) string {
	return resolveConfigPath(path, "")
}

func resolveConfigPath(path, baseDir string) string {
	if path != "" {
		if baseDir != "" && !filepath.IsAbs(path) {
			return filepath.Join(baseDir, path)
		}
		return path
	}
	candidates := []string{
		"config.yaml",
		filepath.Join("config", "config.yaml"),
	}
	for _, candidate := range candidates {
		checkPath := candidate
		if baseDir != "" {
			checkPath = filepath.Join(baseDir, candidate)
		}
		if fi, err := os.Stat(checkPath); err == nil && !fi.IsDir() {
			return checkPath
		}
	}
	return ""
}

// LoadConfig loads application configuration from the specified path,
// or automatically searches for "config.yaml" and "config/config.yaml" if path is empty.
func LoadConfig(path string) (*AppConfig, error) {
	return LoadConfigFromDir(path, "")
}

// LoadConfigFromDir loads configuration relative to a base directory (useful for testing and specific working directories).
func LoadConfigFromDir(path, baseDir string) (*AppConfig, error) {
	cfg := DefaultConfig()
	targetPath := resolveConfigPath(path, baseDir)
	if targetPath == "" {
		return cfg, nil
	}

	data, err := os.ReadFile(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config %s: %w", targetPath, err)
	}
	return cfg, nil
}

