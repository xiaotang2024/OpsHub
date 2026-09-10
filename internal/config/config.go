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

type AppConfig struct {
	Server  ServerConfig `yaml:"server"`
	DataDir string       `yaml:"data_dir"`
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

func DefaultConfig() *AppConfig {
	home, _ := os.UserHomeDir()
	defaultDataDir := filepath.Join(home, ".opshub", "data")
	return &AppConfig{
		Server: ServerConfig{
			Port:      8080,
			JWTSecret: "opshub-default-jwt-secret-replace-me",
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
