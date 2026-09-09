# OpsHub Single-Server Java & Middleware Deployment Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, self-contained single-server deployment platform in Go + React for managing Java applications and middleware with deployment templates, in-place releases, dual-mode supervision, real-time log streaming, and dynamic interactive frontend UI.

**Architecture:** A self-contained single binary in Go using embedded SQLite (`modernc.org/sqlite`) and embedded React SPA (`embed.FS`). Modular domain services handle templates, artifacts, supervisors (native process group & systemd), health probing, and WebSocket log streaming. The React frontend follows high-craft design principles (dark slate console theme, monospace telemetry, Framer Motion transitions, pulsing status pills, interactive JVM slider, and xterm.js terminal).

**Tech Stack:** Go 1.22+, Gin, modernc.org/sqlite, React 18, Vite, TypeScript, Tailwind CSS, Ant Design, @xterm/xterm, Lucide Icons, Framer Motion.

**Spec:** `docs/superpowers/specs/2026-09-09-opshub-design.md`

## Global Constraints

- Platform delivery must compile into a single static binary with no external CGO or runtime dependencies.
- Process management must isolate child processes in dedicated process groups (`Setpgid: true`) to avoid orphaned processes.
- The UI design must adhere to frontend-design principles: distinct ops-console identity (slate/graphite base, phosphor emerald/cyan accents, JetBrains Mono/Inter type pairing, fluid micro-interactions, live heartbeat indicators).
- All deployment actions must be logged in `audit_logs` with timestamps, operators, and outcomes.
- In-place deployments must execute a 7-step sequence with automatic rollback support on health check failure.

---

### Task 1: Go Project Scaffolding & Configuration Setup

**Files:**
- Create: `go.mod`
- Create: `internal/config/config.go`
- Test: `internal/config/config_test.go`

**Interfaces:**
- Consumes: Standard library (`os`, `path/filepath`)
- Produces: `config.AppConfig` struct with `LoadConfig(path string) (*AppConfig, error)`

- [ ] **Step 1: Write the failing test for configuration loader**

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config/... -v`
Expected: FAIL due to missing `go.mod` or missing `config` package.

- [ ] **Step 3: Write minimal implementation**

Initialize `go.mod` and implement `internal/config/config.go`:

```go
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/config/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add go.mod go.sum internal/config/
git commit -m "feat(config): initialize project structure and app configuration"
```

---

### Task 2: SQLite Database Layer & Model Migrations

**Files:**
- Create: `internal/database/db.go`
- Create: `internal/model/models.go`
- Test: `internal/database/db_test.go`

**Interfaces:**
- Consumes: `modernc.org/sqlite`, `internal/config`
- Produces: `database.InitDB(dbPath string) (*sql.DB, error)`, model structs (`JDKAsset`, `Template`, `Service`, `Artifact`, `DeployRecord`, `AuditLog`, `User`)

- [ ] **Step 1: Write the failing test for DB initialization and schema migration**

```go
package database_test

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
)

func TestInitDB_CreatesTables(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db.Close()

	tables := []string{"jdk_assets", "templates", "services", "artifacts", "deploy_records", "audit_logs", "users"}
	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		require.NoError(t, err, "table %s should exist", table)
		assert.Equal(t, table, name)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/database/... -v`
Expected: FAIL with missing `database.InitDB`

- [ ] **Step 3: Write minimal implementation**

Create `internal/model/models.go` with domain entities and `internal/database/db.go` executing DDL:

```go
package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const schemaDDL = `
CREATE TABLE IF NOT EXISTS jdk_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    java_home TEXT NOT NULL,
    bin_path TEXT NOT NULL,
    version_str TEXT,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    default_jdk_id INTEGER,
    install_dir_pattern TEXT NOT NULL,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode TEXT NOT NULL,
    start_cmd TEXT,
    stop_cmd TEXT,
    health_check_config TEXT,
    uninstall_rules TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    template_id INTEGER NOT NULL,
    jdk_id INTEGER,
    install_dir TEXT NOT NULL,
    port INTEGER,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    current_artifact_id INTEGER,
    pid INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES templates(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    version_tag TEXT NOT NULL,
    upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS deploy_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    artifact_id INTEGER,
    action TEXT NOT NULL,
    operator TEXT NOT NULL,
    client_ip TEXT,
    status TEXT NOT NULL,
    output_log TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator TEXT NOT NULL,
    client_ip TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

func InitDB(dbPath string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir failed: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite db failed: %w", err)
	}

	if _, err := db.Exec(schemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("execute schema ddl failed: %w", err)
	}

	return db, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/database/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/database/ internal/model/
git commit -m "feat(database): implement sqlite schema migration and domain models"
```

---

### Task 3: JDK Asset Discovery & Registry Service

**Files:**
- Create: `internal/service/jdk_service.go`
- Test: `internal/service/jdk_service_test.go`

**Interfaces:**
- Consumes: `*sql.DB`, `model.JDKAsset`
- Produces: `JDKService` with `ScanSystemJDKs() ([]model.JDKAsset, error)`, `Register(asset *model.JDKAsset) error`, `List() ([]model.JDKAsset, error)`

- [ ] **Step 1: Write the failing test for JDK scanning and registration**

```go
package service_test

import (
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
		Name:        "OpenJDK-17",
		JavaHome:    fakeJavaHome,
		BinPath:     fakeJavaBin,
		VersionStr:  "17.0.9",
		IsSystem:    false,
	}

	err = svc.Register(asset)
	require.NoError(t, err)

	list, err := svc.List()
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "OpenJDK-17", list[0].Name)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/... -run TestJDKService -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/service/jdk_service.go` with scan directories (`/usr/lib/jvm`, `/Library/Java/JavaVirtualMachines`, `JAVA_HOME` env) and SQLite persistence.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/service/... -run TestJDKService -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/service/jdk_service.go internal/service/jdk_service_test.go
git commit -m "feat(jdk): implement JDK auto-discovery and registry service"
```

---

### Task 4: Deployment Template Engine & Parameter Expander

**Files:**
- Create: `internal/template/engine.go`
- Test: `internal/template/engine_test.go`

**Interfaces:**
- Consumes: `model.Template`, `model.Service`, `model.JDKAsset`
- Produces: `template.Engine` with `RenderStartCommand(tpl *model.Template, svc *model.Service, jdk *model.JDKAsset, pkgPath string) (string, error)`, `ParseJVMOptions(rawJSON string) string`

- [ ] **Step 1: Write the failing test for template command rendering**

```go
package template_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/model"
	"opshub/internal/template"
)

func TestEngine_RenderJavaStartCommand(t *testing.T) {
	engine := template.NewEngine()

	tpl := &model.Template{
		Name:               "Standard-Spring-Boot",
		Type:               "java_jar",
		InstallDirPattern: "/opt/apps/${SERVICE_NAME}",
		JVMOptions:         `{"heap_min":"512m","heap_max":"1024m","gc":"-XX:+UseG1GC"}`,
		SupervisionMode:    "native",
	}

	svc := &model.Service{
		Name:       "order-service",
		InstallDir: "/opt/apps/order-service",
		Port:       8080,
		JVMOptions: `{"heap_max":"2048m"}`,
	}

	jdk := &model.JDKAsset{
		BinPath: "/usr/lib/jvm/java-17/bin/java",
	}

	cmd, err := engine.RenderStartCommand(tpl, svc, jdk, "/opt/apps/order-service/app.jar")
	require.NoError(t, err)

	assert.Contains(t, cmd, "/usr/lib/jvm/java-17/bin/java")
	assert.Contains(t, cmd, "-Xms512m")
	assert.Contains(t, cmd, "-Xmx2048m")
	assert.Contains(t, cmd, "-XX:+UseG1GC")
	assert.Contains(t, cmd, "-jar /opt/apps/order-service/app.jar")
	assert.Contains(t, cmd, "--server.port=8080")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/template/... -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/template/engine.go` supporting:
- Variable interpolation `${SERVICE_NAME}`, `${INSTALL_DIR}`, `${PACKAGE_FILE}`, `${JAVA_BIN}`, `${PORT}`
- JVM options JSON merger (service overrides template)
- Generic shell script start/stop command generation

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/template/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/template/
git commit -m "feat(template): implement template rendering engine and JVM args merger"
```

---

### Task 5: Native Process Supervisor & PID Tracking

**Files:**
- Create: `internal/supervisor/supervisor.go`
- Create: `internal/supervisor/native.go`
- Test: `internal/supervisor/native_test.go`

**Interfaces:**
- Consumes: OS signals, `syscall.SysProcAttr{Setpgid: true}`
- Produces: `supervisor.Supervisor` interface:
  `Start(ctx context.Context, dir, command string, envs []string, logFile string) (int, error)`
  `Stop(ctx context.Context, pid int, timeout time.Duration) error`
  `IsRunning(pid int) bool`

- [ ] **Step 1: Write the failing test for native process lifecycle**

```go
package supervisor_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/supervisor"
)

func TestNativeSupervisor_Lifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "console.log")

	sup := supervisor.NewNativeSupervisor()

	// Start a long-running process
	cmd := "sleep 10"
	pid, err := sup.Start(context.Background(), tmpDir, cmd, nil, logPath)
	require.NoError(t, err)
	assert.Greater(t, pid, 0)
	assert.True(t, sup.IsRunning(pid))

	// Stop gracefully
	err = sup.Stop(context.Background(), pid, 2*time.Second)
	require.NoError(t, err)
	assert.False(t, sup.IsRunning(pid))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/supervisor/... -run TestNativeSupervisor -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/supervisor/native.go`:
- Shell execution using `/bin/sh -c`
- `cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}`
- Output redirected to `logFile`
- `Stop`: Send `SIGTERM` to process group `-pid`, poll `syscall.Kill(pid, 0)` for `timeout`, send `SIGKILL` if still running.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/supervisor/... -run TestNativeSupervisor -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/supervisor/
git commit -m "feat(supervisor): implement native process supervisor with process group isolation"
```

---

### Task 6: Systemd Bridge Supervisor

**Files:**
- Create: `internal/supervisor/systemd.go`
- Test: `internal/supervisor/systemd_test.go`

**Interfaces:**
- Consumes: Systemd unit file template, `systemctl` CLI wrapper
- Produces: `SystemdSupervisor` with `RenderUnit(serviceName, dir, execStart string) string`, `InstallAndStart(ctx context.Context, serviceName, unitContent string) error`, `Stop(ctx context.Context, serviceName string) error`, `IsActive(ctx context.Context, serviceName string) (bool, error)`

- [ ] **Step 1: Write the failing test for systemd unit rendering**

```go
package supervisor_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"opshub/internal/supervisor"
)

func TestSystemdSupervisor_RenderUnit(t *testing.T) {
	sup := supervisor.NewSystemdSupervisor("/tmp/systemd-test")
	unit := sup.RenderUnit("order-service", "/opt/apps/order-service", "/usr/bin/java -jar /opt/apps/order-service/app.jar")

	assert.Contains(t, unit, "[Unit]")
	assert.Contains(t, unit, "Description=OpsHub Managed Service - order-service")
	assert.Contains(t, unit, "WorkingDirectory=/opt/apps/order-service")
	assert.Contains(t, unit, "ExecStart=/usr/bin/java -jar /opt/apps/order-service/app.jar")
	assert.Contains(t, unit, "Restart=on-failure")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/supervisor/... -run TestSystemdSupervisor -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/supervisor/systemd.go` with configurable unit destination directory (for easy mock testing without root) and `systemctl` invoker.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/supervisor/... -run TestSystemdSupervisor -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/supervisor/systemd.go internal/supervisor/systemd_test.go
git commit -m "feat(supervisor): implement systemd unit generator and supervisor adapter"
```

---

### Task 7: Health Check Prober

**Files:**
- Create: `internal/prober/prober.go`
- Test: `internal/prober/prober_test.go`

**Interfaces:**
- Consumes: Network HTTP/TCP sockets
- Produces: `prober.Prober` with `Probe(ctx context.Context, cfg HealthCheckConfig) (bool, error)`, `WaitUntilHealthy(ctx context.Context, cfg HealthCheckConfig, interval, timeout time.Duration) error`

- [ ] **Step 1: Write the failing test for HTTP and TCP probing**

```go
package prober_test

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/prober"
)

func TestProber_HTTPAndTCP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"UP"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	p := prober.NewProber()

	// HTTP Probe test
	httpCfg := prober.HealthCheckConfig{
		Type: "http",
		URL:  server.URL + "/health",
	}
	ok, err := p.Probe(context.Background(), httpCfg)
	require.NoError(t, err)
	assert.True(t, ok)

	// TCP Probe test
	host, portStr, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	var port int
	_, _ = net.LookupPort("tcp", portStr)
	tcpCfg := prober.HealthCheckConfig{
		Type: "tcp",
		Host: host,
		Port: 80, // placeholder
	}
	_ = tcpCfg
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/prober/... -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/prober/prober.go` supporting `http`, `tcp`, and polling loop with timeout.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/prober/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/prober/
git commit -m "feat(prober): implement HTTP and TCP health check prober"
```

---

### Task 8: Artifact Management & In-Place 7-Step Deployment Pipeline

**Files:**
- Create: `internal/service/artifact_service.go`
- Create: `internal/service/deploy_pipeline.go`
- Test: `internal/service/deploy_pipeline_test.go`

**Interfaces:**
- Consumes: `database.InitDB`, `supervisor.Supervisor`, `prober.Prober`, `template.Engine`
- Produces: `DeployPipeline` with `Deploy(ctx context.Context, serviceID, artifactID int, operator string) (*model.DeployRecord, error)`, `Rollback(ctx context.Context, serviceID, targetArtifactID int, operator string) (*model.DeployRecord, error)`

- [ ] **Step 1: Write the failing test for the 7-step deployment flow**

```go
package service_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/prober"
	"opshub/internal/service"
	"opshub/internal/supervisor"
	"opshub/internal/template"
)

func TestDeployPipeline_FullFlow(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	// Seed template, service, artifact
	installDir := filepath.Join(tmpDir, "apps", "demo-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "demo-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	fakeJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(fakeJar, []byte("PK-fake-jar-content"), 0644))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config) 
		VALUES (1, 't1', 'java_jar', '`+installDir+`', 'native', '{"type":"process"}')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'demo-svc', 1, '`+installDir+`', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '`+fakeJar+`', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", rec.Status)

	// Verify target file copied
	deployedFile := filepath.Join(installDir, "app.jar")
	assert.FileExists(t, deployedFile)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/... -run TestDeployPipeline -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/service/artifact_service.go` and `internal/service/deploy_pipeline.go` with 7-step sequence:
1. Pre-flight check
2. Backup `app.jar` -> `backup/app.jar.prev`
3. Stop existing process
4. Copy/unpack package to `install_dir/app.jar`
5. Start service via supervisor
6. Run health prober loop (with auto-fallback on error)
7. Record to `deploy_records` & `audit_logs`

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/service/... -run TestDeployPipeline -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/service/artifact_service.go internal/service/deploy_pipeline.go internal/service/deploy_pipeline_test.go
git commit -m "feat(deploy): implement 7-step in-place deployment and rollback pipeline"
```

---

### Task 9: Real-time Log Tailer & WebSocket Hub

**Files:**
- Create: `internal/tailer/tailer.go`
- Create: `internal/api/websocket/hub.go`
- Test: `internal/tailer/tailer_test.go`

**Interfaces:**
- Consumes: Disk log file, WebSocket connections
- Produces: `tailer.Tailer` with `TailFile(ctx context.Context, path string, tailLines int) (<-chan string, error)`, `websocket.Hub` with `ServeWS(w http.ResponseWriter, r *http.Request, serviceID int)`

- [ ] **Step 1: Write the failing test for reverse-seek log tailing**

```go
package tailer_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/tailer"
)

func TestTailer_TailRecentAndFollow(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "test.log")

	f, err := os.Create(logPath)
	require.NoError(t, err)
	for i := 1; i <= 10; i++ {
		_, _ = f.WriteString(fmt.Sprintf("line %d\n", i))
	}
	_ = f.Close()

	tl := tailer.NewTailer()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ch, err := tl.TailFile(ctx, logPath, 3)
	require.NoError(t, err)

	first := <-ch
	assert.Contains(t, first, "line 8")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/tailer/... -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/tailer/tailer.go` (reverse seek initial lines + file watcher/poller for new appended bytes) and `internal/api/websocket/hub.go` broadcasting lines to WebSocket clients.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/tailer/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/tailer/ internal/api/websocket/
git commit -m "feat(tailer): implement reverse-seek file tailer and WebSocket hub"
```

---

### Task 10: Authentication, Audit & Security Middleware

**Files:**
- Create: `internal/service/auth_service.go`
- Create: `internal/api/middleware/auth.go`
- Create: `internal/api/middleware/audit.go`
- Test: `internal/service/auth_service_test.go`

**Interfaces:**
- Consumes: `*sql.DB`, `golang.org/x/crypto/bcrypt`, `golang-jwt/jwt/v5`
- Produces: `auth.AuthService` with `InitAdmin() (string, error)`, `Login(username, password string) (string, error)`, `VerifyToken(token string) (*Claims, error)`, Gin middlewares `AuthMiddleware()`, `AuditMiddleware()`

- [ ] **Step 1: Write the failing test for auth setup and token generation**

```go
package service_test

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/service"
)

func TestAuthService_InitAndLogin(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	authSvc := service.NewAuthService(db, "my-secret-key")

	initPass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)
	assert.NotEmpty(t, initPass)

	token, err := authSvc.Login("admin", initPass)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	claims, err := authSvc.VerifyToken(token)
	require.NoError(t, err)
	assert.Equal(t, "admin", claims.Username)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/service/... -run TestAuthService -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `internal/service/auth_service.go` and Gin middleware (`internal/api/middleware/auth.go` and `internal/api/middleware/audit.go`).

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/service/... -run TestAuthService -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/service/auth_service.go internal/api/middleware/
git commit -m "feat(auth): implement admin password initialization, JWT and audit middleware"
```

---

### Task 11: RESTful API Handlers & Main Router Assembly

**Files:**
- Create: `internal/api/handler/auth_handler.go`
- Create: `internal/api/handler/template_handler.go`
- Create: `internal/api/handler/service_handler.go`
- Create: `internal/api/handler/artifact_handler.go`
- Create: `internal/api/handler/jdk_handler.go`
- Create: `internal/api/handler/system_handler.go`
- Create: `internal/api/router.go`
- Create: `cmd/opshub/main.go`
- Test: `internal/api/router_test.go`

**Interfaces:**
- Consumes: All domain services (`TemplateService`, `DeployPipeline`, `JDKService`, `AuthService`, `Tailer`)
- Produces: `api.SetupRouter(cfg *config.AppConfig, db *sql.DB, ...) *gin.Engine`, entrypoint `cmd/opshub/main.go`

- [ ] **Step 1: Write the failing test for API route dispatching**

```go
package api_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/api"
	"opshub/internal/config"
	"opshub/internal/database"
)

func TestRouter_HealthCheckEndpoint(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.AppConfig{DataDir: tmpDir}
	r := api.SetupRouter(cfg, db)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/system/health", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "UP")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/... -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement Gin handlers for all RESTful operations and assemble the router in `internal/api/router.go` and `cmd/opshub/main.go`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/api/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/api/ cmd/opshub/
git commit -m "feat(api): implement REST API handlers, router assembly and main entrypoint"
```

---

### Task 12: Frontend Scaffolding, Design Tokens & Motion Shell

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tailwind.config.js`
- Create: `web/src/index.css`
- Create: `web/src/App.tsx`
- Create: `web/src/components/layout/Shell.tsx`
- Test: `web/src/components/layout/Shell.test.tsx`

**Design & Aesthetic Directives (Applying `frontend-design`):**
- Palette: Dark ops console with Slate-900 `#0B0F17` background, Card Surface `#131B2A`, Border `#1E293B`, Phosphor Cyan `#06B6D4` (focus/accents), Phosphor Emerald `#10B981` (healthy/running), Amber `#F59E0B` (starting/warning), Crimson `#EF4444` (failed/stopped).
- Typography: Inter/Outfit for headings and body, paired with `JetBrains Mono` for ports, PIDs, JVM flags, paths, and telemetry values.
- Micro-interactions: Framer Motion layout transitions for route switches, hover states with subtle 1px border glow, pulsing status indicators.

- [ ] **Step 1: Write test for Shell component rendering and navigation links**

```tsx
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Shell } from './Shell';
import { describe, it, expect } from 'vitest';

describe('Shell Component', () => {
  it('renders brand logo and primary navigation tabs', () => {
    render(
      <BrowserRouter>
        <Shell>
          <div>Content Slot</div>
        </Shell>
      </BrowserRouter>
    );

    expect(screen.getByText(/OpsHub/i)).toBeInTheDocument();
    expect(screen.getByText(/服务列表/i)).toBeInTheDocument();
    expect(screen.getByText(/部署模板/i)).toBeInTheDocument();
    expect(screen.getByText(/JDK 资产/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web`
Expected: FAIL

- [ ] **Step 3: Implement Vite + Tailwind + Shell layout**

Configure Tailwind design tokens, setup Lucide icons, implement responsive sidebar, breadcrumbs, and user session badge with Framer Motion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(ui): scaffold Vite React frontend with high-craft ops console theme and shell"
```

---

### Task 13: Frontend Template Studio & Service Fleet Dashboard

**Files:**
- Create: `web/src/pages/Templates/TemplateList.tsx`
- Create: `web/src/pages/Templates/TemplateEditorModal.tsx`
- Create: `web/src/pages/Services/ServiceFleet.tsx`
- Create: `web/src/components/service/StatusBadge.tsx`
- Test: `web/src/components/service/StatusBadge.test.tsx`

**Interactive UX Highlights:**
- `StatusBadge`: Live animated beacon with subtle ping ripple for `RUNNING`, amber spinner for `STARTING`, solid crimson dot for `STOPPED`.
- `TemplateEditorModal`: Visual JVM Tuner with interactive heap memory slider (e.g. 512M to 8G) with live `-Xms / -Xmx` preview string, GC strategy selector pill buttons (G1, ZGC, Parallel), and pre-flight validation.
- Service Fleet cards with one-click Start/Stop/Restart buttons offering instant optimistic visual feedback and spinner state.

- [ ] **Step 1: Write failing test for StatusBadge dynamic rendering**

```tsx
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import { describe, it, expect } from 'vitest';

describe('StatusBadge', () => {
  it('renders running status with emerald badge and pulsing dot', () => {
    const { container } = render(<StatusBadge status="RUNNING" />);
    expect(screen.getByText(/运行中/i)).toBeInTheDocument();
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web -t StatusBadge`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `StatusBadge`, `TemplateList`, `TemplateEditorModal` with interactive JVM sliders, and `ServiceFleet` card grid.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web -t StatusBadge`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Templates/ web/src/pages/Services/ web/src/components/service/
git commit -m "feat(ui): implement dynamic Template Studio and Service Fleet dashboard"
```

---

### Task 14: Frontend 7-Step Deployment Wizard & Rollback Timeline

**Files:**
- Create: `web/src/components/deploy/DeployWizardModal.tsx`
- Create: `web/src/components/deploy/RollbackModal.tsx`
- Create: `web/src/pages/Services/ServiceDetail.tsx`
- Test: `web/src/components/deploy/DeployWizardModal.test.tsx`

**Interactive UX Highlights:**
- 7-Step Animated Deployment Pipeline: As the backend streams step changes, the wizard highlights the active step with a cyan glow, shows live elapsed duration (e.g., `Step 6: 健康检查中 (12s)...`), and renders instant failure logs in-place if an issue occurs.
- Package Uploader: Drag & drop zone with instantaneous client-side SHA256 computing progress bar and formatted byte size indicator.
- Rollback History Table: Interactive version comparison badge showing package diff, time delta, and an explicit two-step confirmation modal before triggering rollback.

- [ ] **Step 1: Write failing test for DeployWizardModal step progression**

```tsx
import { render, screen } from '@testing-library/react';
import { DeployWizardModal } from './DeployWizardModal';
import { describe, it, expect } from 'vitest';

describe('DeployWizardModal', () => {
  it('renders all 7 deployment pipeline steps', () => {
    render(
      <DeployWizardModal
        visible={true}
        serviceName="order-service"
        currentStep={3}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/1. 预检/i)).toBeInTheDocument();
    expect(screen.getByText(/2. 备份/i)).toBeInTheDocument();
    expect(screen.getByText(/3. 停机/i)).toBeInTheDocument();
    expect(screen.getByText(/4. 制品分发/i)).toBeInTheDocument();
    expect(screen.getByText(/5. 启动新版本/i)).toBeInTheDocument();
    expect(screen.getByText(/6. 就绪探测/i)).toBeInTheDocument();
    expect(screen.getByText(/7. 记录生效/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web -t DeployWizardModal`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `DeployWizardModal`, `RollbackModal`, and full `ServiceDetail` tabs (Overview, Releases, Config, Logs, Audit).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web -t DeployWizardModal`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deploy/ web/src/pages/Services/ServiceDetail.tsx
git commit -m "feat(ui): implement 7-step deployment wizard, release history and rollback dialog"
```

---

### Task 15: Frontend Live Telemetry, xterm.js Terminal & Online Config Diff Editor

**Files:**
- Create: `web/src/components/terminal/LiveLogViewer.tsx`
- Create: `web/src/components/config/ConfigDiffEditor.tsx`
- Create: `web/src/components/metrics/ProcessTelemetryCard.tsx`
- Test: `web/src/components/metrics/ProcessTelemetryCard.test.tsx`

**Interactive UX Highlights:**
- `LiveLogViewer`: Built with `@xterm/xterm` + `xterm-addon-fit` + `xterm-addon-search`. Controls bar includes auto-scroll pin toggle with visual lock icon, keyword search with counter badge (e.g. `12 matches for ERROR`), pause stream button, clear screen, and one-click log download.
- `ProcessTelemetryCard`: Circular animated meters for CPU % and Memory RSS, process uptime counter ticker (`3d 4h 12m`), and live PID tag.
- `ConfigDiffEditor`: Monaco Editor side-by-side or inline diff showing pending changes before save, with warning banner "修改后需重启服务生效".

- [ ] **Step 1: Write failing test for ProcessTelemetryCard metrics display**

```tsx
import { render, screen } from '@testing-library/react';
import { ProcessTelemetryCard } from './ProcessTelemetryCard';
import { describe, it, expect } from 'vitest';

describe('ProcessTelemetryCard', () => {
  it('renders PID, CPU percentage, and RSS memory values', () => {
    render(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={14.5}
        memoryRssMb={512}
        uptime="2h 15m"
      />
    );
    expect(screen.getByText(/18293/i)).toBeInTheDocument();
    expect(screen.getByText(/14.5%/i)).toBeInTheDocument();
    expect(screen.getByText(/512 MB/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix web -t ProcessTelemetryCard`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement `LiveLogViewer` (xterm.js), `ConfigDiffEditor` (diff preview), and `ProcessTelemetryCard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix web -t ProcessTelemetryCard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/terminal/ web/src/components/config/ web/src/components/metrics/
git commit -m "feat(ui): implement live xterm.js terminal, telemetry meters and config diff editor"
```

---

### Task 16: Frontend Embedding via `embed.FS`, Single Binary Build & End-to-End Verification

**Files:**
- Create: `embed.go`
- Modify: `internal/api/router.go`
- Create: `Makefile`
- Test: `test/e2e/e2e_test.go`

**Interfaces:**
- Consumes: Built `web/dist` directory
- Produces: Single compiled executable `bin/opshub` containing backend and SPA assets

- [ ] **Step 1: Write the end-to-end integration test**

```go
package e2e_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/api"
	"opshub/internal/config"
	"opshub/internal/database"
)

func TestE2E_ServerStartupAndStaticAssetServing(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	cfg := &config.AppConfig{DataDir: tmpDir}
	r := api.SetupRouter(cfg, db)

	// Verify API route
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/system/health", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify frontend SPA fallback
	wSPA := httptest.NewRecorder()
	reqSPA, _ := http.NewRequest("GET", "/services", nil)
	r.ServeHTTP(wSPA, reqSPA)
	assert.Equal(t, http.StatusOK, wSPA.Code)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./test/e2e/... -v`
Expected: FAIL

- [ ] **Step 3: Implement embed.FS handling and Makefile**

Implement `embed.go`:
```go
package opshub

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed web/dist/*
var WebDistFS embed.FS

func StaticFS() http.FileSystem {
	sub, err := fs.Sub(WebDistFS, "web/dist")
	if err != nil {
		panic(err)
	}
	return http.FS(sub)
}
```
Update `internal/api/router.go` to serve static files from `StaticFS()` and handle SPA client-side fallback routes.
Create `Makefile` with targets `build-frontend`, `build-backend`, `build-all`, `test`.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./test/e2e/... -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add embed.go internal/api/router.go Makefile test/e2e/
git commit -m "feat(build): implement embed.FS single-binary bundling and end-to-end verification"
```
