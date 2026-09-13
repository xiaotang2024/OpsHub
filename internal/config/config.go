package config

import (
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

func LoadConfig(path string) (*AppConfig, error) {
	cfg := DefaultConfig()
	if path == "" {
		return cfg, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
