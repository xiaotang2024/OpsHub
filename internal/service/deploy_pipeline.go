package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"opshub/internal/model"
	"opshub/internal/prober"
	"opshub/internal/supervisor"
	"opshub/internal/template"
)

// DeployPipeline coordinates the 7-step in-place deployment and rollback sequence.
type DeployPipeline struct {
	db                *sql.DB
	supervisor        supervisor.Supervisor
	prober            prober.Prober
	engine            *template.Engine
	systemdSupervisor *supervisor.SystemdSupervisor
}

// NewDeployPipeline constructs a new DeployPipeline.
func NewDeployPipeline(
	db *sql.DB,
	sup supervisor.Supervisor,
	prob prober.Prober,
	engine *template.Engine,
	systemdSup ...*supervisor.SystemdSupervisor,
) *DeployPipeline {
	var sysSup *supervisor.SystemdSupervisor
	if len(systemdSup) > 0 && systemdSup[0] != nil {
		sysSup = systemdSup[0]
	} else {
		sysSup = supervisor.NewSystemdSupervisor("")
	}

	return &DeployPipeline{
		db:                db,
		supervisor:        sup,
		prober:            prob,
		engine:            engine,
		systemdSupervisor: sysSup,
	}
}

// SetSystemdSupervisor updates the SystemdSupervisor instance.
func (p *DeployPipeline) SetSystemdSupervisor(s *supervisor.SystemdSupervisor) {
	p.systemdSupervisor = s
}

// Deploy executes the 7-step in-place deployment workflow for a given service and artifact.
func (p *DeployPipeline) Deploy(ctx context.Context, serviceID, artifactID int, operator string) (*model.DeployRecord, error) {
	return p.executePipeline(ctx, serviceID, artifactID, operator, model.ActionDeploy)
}

// Rollback executes the pipeline using a historical artifact version.
func (p *DeployPipeline) Rollback(ctx context.Context, serviceID, targetArtifactID int, operator string) (*model.DeployRecord, error) {
	return p.executePipeline(ctx, serviceID, targetArtifactID, operator, model.ActionRollback)
}

// executePipeline performs the sequential deployment / rollback workflow.
func (p *DeployPipeline) executePipeline(
	ctx context.Context,
	serviceID, artifactID int,
	operator, action string,
) (*model.DeployRecord, error) {
	startedAt := time.Now().UTC()
	var logs strings.Builder

	logStep := func(step int, format string, a ...interface{}) {
		timestamp := time.Now().UTC().Format("15:04:05.000")
		line := fmt.Sprintf("[%s] Step %d: %s\n", timestamp, step, fmt.Sprintf(format, a...))
		logs.WriteString(line)
	}

	record := &model.DeployRecord{
		ServiceID: int64(serviceID),
		Action:    action,
		Operator:  operator,
		ClientIP:  "127.0.0.1",
		StartedAt: startedAt,
		Status:    model.DeployStatusFailed,
	}
	if artifactID > 0 {
		artID := int64(artifactID)
		record.ArtifactID = &artID
	}

	finalize := func(err error) (*model.DeployRecord, error) {
		if err == nil {
			logStep(7, "Deployment completed successfully. Recording outcome in deploy_records and audit_logs")
		} else {
			logStep(7, "Deployment failed: %v. Recording outcome in deploy_records and audit_logs", err)
		}
		finishedAt := time.Now().UTC()
		record.FinishedAt = &finishedAt
		record.OutputLog = logs.String()

		// 7. Record outcome in deploy_records and audit_logs
		if p.db != nil {
			recQuery := `
				INSERT INTO deploy_records (service_id, artifact_id, action, operator, client_ip, status, output_log, started_at, finished_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
			res, dbErr := p.db.ExecContext(ctx, recQuery,
				record.ServiceID,
				record.ArtifactID,
				record.Action,
				record.Operator,
				record.ClientIP,
				record.Status,
				record.OutputLog,
				record.StartedAt,
				record.FinishedAt,
			)
			if dbErr == nil {
				if lastID, idErr := res.LastInsertId(); idErr == nil {
					record.ID = lastID
				}
			}

			auditQuery := `
				INSERT INTO audit_logs (operator, client_ip, action, target_type, target_id, details, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`
			details := fmt.Sprintf("%s artifact %d for service %d: %s", action, artifactID, serviceID, record.Status)
			_, _ = p.db.ExecContext(ctx, auditQuery,
				operator,
				record.ClientIP,
				action,
				"service",
				strconv.Itoa(serviceID),
				details,
				record.Status,
				finishedAt,
			)
		}

		return record, err
	}

	if p.db == nil {
		logStep(1, "Database connection is nil")
		return finalize(errors.New("database connection is nil"))
	}

	// Fetch service
	svc, err := p.getService(ctx, int64(serviceID))
	if err != nil {
		logStep(1, "Failed to load service %d: %v", serviceID, err)
		return finalize(err)
	}

	// Fetch template
	tpl, err := p.getTemplate(ctx, svc.TemplateID)
	if err != nil {
		logStep(1, "Failed to load template %d: %v", svc.TemplateID, err)
		return finalize(err)
	}

	// Fetch artifact
	art, err := p.getArtifact(ctx, int64(artifactID))
	if err != nil {
		logStep(1, "Failed to load artifact %d: %v", artifactID, err)
		return finalize(err)
	}

	// Fetch JDK if specified
	var jdk *model.JDKAsset
	if svc.JDKID != nil && *svc.JDKID > 0 {
		jdk, _ = p.getJDK(ctx, *svc.JDKID)
	} else if tpl.DefaultJDKID != nil && *tpl.DefaultJDKID > 0 {
		jdk, _ = p.getJDK(ctx, *tpl.DefaultJDKID)
	}

	installDir := svc.InstallDir
	if strings.TrimSpace(installDir) == "" {
		installDir = p.engine.RenderInstallDir(tpl.InstallDirPattern, svc.Name)
	}

	targetFile := filepath.Join(installDir, "app.jar")
	backupDir := filepath.Join(installDir, "backup")
	backupFile := filepath.Join(backupDir, "app.jar.prev")

	// ==========================================
	// Step 1: Pre-flight check
	// ==========================================
	logStep(1, "Running pre-flight checks (disk space, permissions, JDK, port)...")
	if err := p.runPreflightCheck(ctx, svc, tpl, art, jdk, installDir); err != nil {
		logStep(1, "Pre-flight check failed: %v", err)
		return finalize(fmt.Errorf("pre-flight check failed: %w", err))
	}
	logStep(1, "Pre-flight checks passed successfully")

	// ==========================================
	// Step 2: Backup current package
	// ==========================================
	logStep(2, "Checking for existing package to back up at %s...", targetFile)
	hasBackup := false
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		logStep(2, "Failed to create backup directory %s: %v", backupDir, err)
		return finalize(fmt.Errorf("create backup directory failed: %w", err))
	}

	if _, err := os.Stat(targetFile); err == nil {
		if err := copyFile(targetFile, backupFile); err != nil {
			logStep(2, "Failed to create backup at %s: %v", backupFile, err)
			return finalize(fmt.Errorf("backup failed: %w", err))
		}
		hasBackup = true
		logStep(2, "Current package backed up to %s", backupFile)
	} else {
		logStep(2, "No existing package found at %s, skipping backup", targetFile)
	}

	// ==========================================
	// Step 3: Stop current running service instance
	// ==========================================
	logStep(3, "Stopping existing service instance if running...")
	if err := p.stopService(ctx, svc); err != nil {
		logStep(3, "Failed to stop existing service instance: %v", err)
		return finalize(fmt.Errorf("stop existing service failed: %w", err))
	}
	logStep(3, "Service instance is stopped")

	// ==========================================
	// Step 4: Copy/unpack target artifact from packages repo into install_dir/app.jar
	// ==========================================
	logStep(4, "Copying artifact %s (%s) to %s...", art.Filename, art.StoragePath, targetFile)
	if err := copyFile(art.StoragePath, targetFile); err != nil {
		logStep(4, "Failed to copy artifact: %v", err)
		return finalize(fmt.Errorf("copy artifact failed: %w", err))
	}
	logStep(4, "Artifact copied successfully to %s", targetFile)

	// ==========================================
	// Step 5: Start service via Supervisor with dynamically rendered command
	// ==========================================
	logStep(5, "Rendering startup command and starting service via supervisor...")
	startCmd, err := p.engine.RenderStartCommand(tpl, svc, jdk, targetFile)
	if err != nil {
		logStep(5, "Failed to render start command: %v", err)
		return finalize(fmt.Errorf("render start command failed: %w", err))
	}

	envMap, err := p.engine.RenderEnvVars(tpl, svc)
	if err != nil {
		logStep(5, "Failed to render environment variables: %v", err)
		return finalize(fmt.Errorf("render env vars failed: %w", err))
	}
	var envSlice []string
	for k, v := range envMap {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, v))
	}

	logFile := filepath.Join(installDir, "logs", "console.log")
	if err := os.MkdirAll(filepath.Dir(logFile), 0755); err != nil {
		logStep(5, "Failed to create log directory: %v", err)
		return finalize(fmt.Errorf("create log directory failed: %w", err))
	}

	var newPID int
	if svc.SupervisionMode == model.SupervisionModeSystemd && p.systemdSupervisor != nil {
		unitContent := p.systemdSupervisor.RenderUnit(svc.Name, installDir, startCmd)
		if err := p.systemdSupervisor.InstallAndStart(ctx, svc.Name, unitContent); err != nil {
			logStep(5, "Failed to start service via systemd: %v", err)
			return finalize(fmt.Errorf("start systemd service failed: %w", err))
		}
	} else {
		pid, err := p.supervisor.Start(ctx, installDir, startCmd, envSlice, logFile)
		if err != nil {
			logStep(5, "Failed to start service via native supervisor: %v", err)
			return finalize(fmt.Errorf("start native supervisor failed: %w", err))
		}
		newPID = pid
	}

	// Do NOT update current_artifact_id here; wait until Step 6 health probe passes
	_, _ = p.db.ExecContext(ctx,
		"UPDATE services SET status = ?, pid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		model.ServiceStatusStarting, newPID, svc.ID,
	)
	logStep(5, "Service started successfully with PID %d (command: %s)", newPID, startCmd)

	// ==========================================
	// Step 6: Probe health check using Prober.WaitUntilHealthy
	// ==========================================
	logStep(6, "Initiating health check probing...")
	rawHealthCheck := tpl.HealthCheckConfig
	if strings.TrimSpace(svc.HealthCheckConfig) != "" {
		rawHealthCheck = svc.HealthCheckConfig
	}
	hcCfg := p.parseHealthCheckConfig(rawHealthCheck, newPID, svc.Port)

	probeInterval := 200 * time.Millisecond
	probeTimeout := 10 * time.Second
	if hcCfg.Timeout > 0 {
		probeTimeout = hcCfg.Timeout
	}

	probeErr := p.prober.WaitUntilHealthy(ctx, hcCfg, probeInterval, probeTimeout)
	if probeErr != nil {
		logStep(6, "Health check failed or timed out: %v. Initiating automatic rollback...", probeErr)

		// 1. Stop the failing new instance
		if svc.SupervisionMode == model.SupervisionModeSystemd && p.systemdSupervisor != nil {
			_ = p.systemdSupervisor.Stop(ctx, svc.Name)
		} else if newPID > 0 {
			_ = p.supervisor.Stop(ctx, newPID, 3*time.Second)
		}

		// 2. Rollback to backup app.jar.prev if available
		if hasBackup {
			logStep(6, "Restoring previous package from %s...", backupFile)
			if err := copyFile(backupFile, targetFile); err == nil {
				logStep(6, "Previous package restored to %s", targetFile)

				// Relaunch the previous version
				prevCmd, _ := p.engine.RenderStartCommand(tpl, svc, jdk, targetFile)

				if svc.SupervisionMode == model.SupervisionModeSystemd && p.systemdSupervisor != nil {
					prevUnit := p.systemdSupervisor.RenderUnit(svc.Name, installDir, prevCmd)
					_ = p.systemdSupervisor.InstallAndStart(ctx, svc.Name, prevUnit)
					_, _ = p.db.ExecContext(ctx,
						"UPDATE services SET status = ?, current_artifact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
						model.ServiceStatusFailed, svc.CurrentArtifactID, svc.ID,
					)
				} else {
					prevPID, _ := p.supervisor.Start(ctx, installDir, prevCmd, envSlice, logFile)
					_, _ = p.db.ExecContext(ctx,
						"UPDATE services SET status = ?, pid = ?, current_artifact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
						model.ServiceStatusFailed, prevPID, svc.CurrentArtifactID, svc.ID,
					)
				}
				logStep(6, "Previous package relaunched after rollback")
			}
		} else {
			// No backup available: service remains stopped/failed with pid = 0
			_, _ = p.db.ExecContext(ctx,
				"UPDATE services SET status = ?, pid = 0, current_artifact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
				model.ServiceStatusFailed, svc.CurrentArtifactID, svc.ID,
			)
		}

		return finalize(fmt.Errorf("health check failed: %w", probeErr))
	}

	// Health check passed! Only now update current_artifact_id and status to RUNNING
	_, _ = p.db.ExecContext(ctx,
		"UPDATE services SET status = ?, pid = ?, current_artifact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		model.ServiceStatusRunning, newPID, art.ID, svc.ID,
	)
	record.Status = model.DeployStatusSuccess
	logStep(6, "Health check succeeded. Service is in RUNNING state")

	return finalize(nil)
}

func (p *DeployPipeline) runPreflightCheck(
	ctx context.Context,
	svc *model.Service,
	tpl *model.Template,
	art *model.Artifact,
	jdk *model.JDKAsset,
	installDir string,
) error {
	// 1. Check install dir write permission
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return fmt.Errorf("cannot create install directory %s: %w", installDir, err)
	}
	testFile := filepath.Join(installDir, fmt.Sprintf(".opshub_test_%d", time.Now().UnixNano()))
	if err := os.WriteFile(testFile, []byte("ok"), 0644); err != nil {
		return fmt.Errorf("install directory %s is not writable: %w", installDir, err)
	}
	_ = os.Remove(testFile)

	// 2. Check disk space
	var stat syscall.Statfs_t
	if err := syscall.Statfs(installDir, &stat); err == nil {
		freeBytes := uint64(stat.Bavail) * uint64(stat.Bsize)
		minRequired := uint64(art.FileSize) + 10*1024*1024 // artifact size + 10MB safety margin
		if freeBytes < minRequired {
			return fmt.Errorf("insufficient disk space on %s: %d bytes available, %d bytes required", installDir, freeBytes, minRequired)
		}
	}

	// 3. Check JDK binary if configured
	if jdk != nil && strings.TrimSpace(jdk.BinPath) != "" {
		if _, err := os.Stat(jdk.BinPath); err != nil {
			return fmt.Errorf("configured JDK binary not found at %s: %w", jdk.BinPath, err)
		}
	}

	// 4. Check port availability if configured and service is not already running
	if svc.Port > 0 {
		isSelfRunning := false
		if svc.SupervisionMode == model.SupervisionModeSystemd && p.systemdSupervisor != nil {
			if active, _ := p.systemdSupervisor.IsActive(ctx, svc.Name); active {
				isSelfRunning = true
			}
		} else if svc.PID > 0 && p.supervisor != nil && p.supervisor.IsRunning(svc.PID) {
			isSelfRunning = true
		}

		if !isSelfRunning {
			addr := fmt.Sprintf("127.0.0.1:%d", svc.Port)
			ln, err := net.Listen("tcp", addr)
			if err != nil {
				return fmt.Errorf("port %d is already in use by another process", svc.Port)
			}
			_ = ln.Close()
		}
	}

	// 5. Check target artifact file exists, is a regular file, and is readable
	info, err := os.Stat(art.StoragePath)
	if err != nil {
		return fmt.Errorf("artifact file not found at %s: %w", art.StoragePath, err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("artifact at %s is not a regular file", art.StoragePath)
	}
	f, err := os.Open(art.StoragePath)
	if err != nil {
		return fmt.Errorf("artifact file at %s is not readable: %w", art.StoragePath, err)
	}
	_ = f.Close()

	return nil
}

func (p *DeployPipeline) stopService(ctx context.Context, svc *model.Service) error {
	if svc.SupervisionMode == model.SupervisionModeSystemd && p.systemdSupervisor != nil {
		_ = p.systemdSupervisor.Stop(ctx, svc.Name)
	} else if svc.PID > 0 && p.supervisor != nil && p.supervisor.IsRunning(svc.PID) {
		if err := p.supervisor.Stop(ctx, svc.PID, 15*time.Second); err != nil {
			return err
		}
	}

	_, err := p.db.ExecContext(ctx,
		"UPDATE services SET status = ?, pid = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		model.ServiceStatusStopped, svc.ID,
	)
	return err
}

func (p *DeployPipeline) parseHealthCheckConfig(raw string, pid, port int) prober.HealthCheckConfig {
	var cfg prober.HealthCheckConfig
	if strings.TrimSpace(raw) != "" {
		_ = json.Unmarshal([]byte(raw), &cfg)
	}

	if strings.TrimSpace(cfg.Type) == "" {
		cfg.Type = "process"
	}

	if cfg.Type == "process" {
		cfg.PID = pid
	}
	if cfg.Port == 0 && port > 0 {
		cfg.Port = port
	}

	return cfg
}

func (p *DeployPipeline) getService(ctx context.Context, id int64) (*model.Service, error) {
	query := `
		SELECT 
			id, name, template_id, jdk_id, install_dir, 
			COALESCE(port, 0), 
			COALESCE(jvm_options, ''), 
			COALESCE(env_vars, ''), 
			supervision_mode, status, current_artifact_id, 
			COALESCE(pid, 0),
			COALESCE(health_check_config, ''),
			template_sync_ignored_at,
			created_at, updated_at
		FROM services
		WHERE id = ?
	`
	var s model.Service
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&s.ID,
		&s.Name,
		&s.TemplateID,
		&s.JDKID,
		&s.InstallDir,
		&s.Port,
		&s.JVMOptions,
		&s.EnvVars,
		&s.SupervisionMode,
		&s.Status,
		&s.CurrentArtifactID,
		&s.PID,
		&s.HealthCheckConfig,
		&s.TemplateSyncIgnoredAt,
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("service %d not found", id)
		}
		return nil, err
	}
	return &s, nil
}

func (p *DeployPipeline) getTemplate(ctx context.Context, id int64) (*model.Template, error) {
	query := `
		SELECT 
			id, name, type, default_jdk_id, install_dir_pattern, 
			COALESCE(jvm_options, ''), 
			COALESCE(env_vars, ''), 
			supervision_mode, 
			COALESCE(start_cmd, ''), 
			COALESCE(stop_cmd, ''), 
			COALESCE(health_check_config, ''), 
			COALESCE(uninstall_rules, ''), 
			created_at, updated_at
		FROM templates
		WHERE id = ?
	`
	var t model.Template
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&t.ID,
		&t.Name,
		&t.Type,
		&t.DefaultJDKID,
		&t.InstallDirPattern,
		&t.JVMOptions,
		&t.EnvVars,
		&t.SupervisionMode,
		&t.StartCmd,
		&t.StopCmd,
		&t.HealthCheckConfig,
		&t.UninstallRules,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("template %d not found", id)
		}
		return nil, err
	}
	return &t, nil
}

func (p *DeployPipeline) getArtifact(ctx context.Context, id int64) (*model.Artifact, error) {
	query := `
		SELECT id, service_id, filename, file_size, sha256, storage_path, version_tag, upload_time
		FROM artifacts
		WHERE id = ?
	`
	var a model.Artifact
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&a.ID,
		&a.ServiceID,
		&a.Filename,
		&a.FileSize,
		&a.SHA256,
		&a.StoragePath,
		&a.VersionTag,
		&a.UploadTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("artifact %d not found", id)
		}
		return nil, err
	}
	return &a, nil
}

func (p *DeployPipeline) getJDK(ctx context.Context, id int64) (*model.JDKAsset, error) {
	query := `
		SELECT id, name, java_home, bin_path, version_str, is_system, created_at
		FROM jdk_assets
		WHERE id = ?
	`
	var a model.JDKAsset
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&a.ID,
		&a.Name,
		&a.JavaHome,
		&a.BinPath,
		&a.VersionStr,
		&a.IsSystem,
		&a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}
