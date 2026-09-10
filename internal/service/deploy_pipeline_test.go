package service_test

import (
	"context"
	"database/sql"
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
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
	require.NoError(t, os.WriteFile(fakeJar, []byte("fake-jar-content"), 0644))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't1', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'demo-svc', 1, '` + installDir + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '` + fakeJar + `', 'v1.0')`)
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

	// Verify current_artifact_id updated to 1
	var currentArtID sql.NullInt64
	err = db.QueryRow("SELECT current_artifact_id FROM services WHERE id = 1").Scan(&currentArtID)
	require.NoError(t, err)
	assert.True(t, currentArtID.Valid)
	assert.Equal(t, int64(1), currentArtID.Int64)
}

func TestDeployPipeline_PreflightCheck_PortConflict(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "port-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "port-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	fakeJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(fakeJar, []byte("fake-jar-content"), 0644))

	// Occupy a port with an external listener
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()
	occupiedPort := ln.Addr().(*net.TCPAddr).Port

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-port', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, port, supervision_mode, status) 
		VALUES (1, 'port-svc', 1, '` + installDir + `', ?, 'native', 'STOPPED')`, occupiedPort)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '` + fakeJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already in use")
	assert.Equal(t, "FAILED", rec.Status)
}

func TestDeployPipeline_PreflightCheck_JDKNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "jdk-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "jdk-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	fakeJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(fakeJar, []byte("fake-jar-content"), 0644))

	_, err = db.Exec(`INSERT INTO jdk_assets (id, name, java_home, bin_path, version_str, is_system)
		VALUES (1, 'missing-jdk', '/opt/non-existent-jdk', '/opt/non-existent-jdk/bin/java', '17', 0)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-jdk', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, jdk_id, install_dir, supervision_mode, status) 
		VALUES (1, 'jdk-svc', 1, 1, '` + installDir + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '` + fakeJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "JDK binary not found")
	assert.Equal(t, "FAILED", rec.Status)
}

func TestDeployPipeline_PreflightCheck_ArtifactNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "missing-art-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	nonExistentFile := filepath.Join(tmpDir, "non-existent-package.jar")

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-art-missing', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'missing-art-svc', 1, '` + installDir + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'missing.jar', 100, 'fake-sha', '` + nonExistentFile + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "artifact file not found")
	assert.Equal(t, "FAILED", rec.Status)
}

func TestDeployPipeline_HealthCheckFailure_AutoRollback(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "rollback-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	// Existing package app.jar that will be backed up
	existingJar := filepath.Join(installDir, "app.jar")
	require.NoError(t, os.WriteFile(existingJar, []byte("previous-version-content"), 0644))

	pkgDir := filepath.Join(tmpDir, "packages", "rollback-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	newJar := filepath.Join(pkgDir, "demo-v2.jar")
	require.NoError(t, os.WriteFile(newJar, []byte("v2-jar-content"), 0644))

	// Health check config points to a non-existent port with very short timeout (200ms)
	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-rb', 'java_jar', '` + installDir + `', 'native', '{"type":"http","port":59999,"path":"/health","timeout":200000000}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status, current_artifact_id) 
		VALUES (1, 'rollback-svc', 1, '` + installDir + `', 'native', 'STOPPED', 1)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha1', '` + existingJar + `', 'v1.0')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (2, 1, 'demo-v2.jar', 100, 'fake-sha2', '` + newJar + `', 'v2.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 2, "admin")
	require.Error(t, err)
	assert.Equal(t, "FAILED", rec.Status)

	// Verify app.jar was rolled back to previous content
	content, readErr := os.ReadFile(existingJar)
	require.NoError(t, readErr)
	assert.Equal(t, "previous-version-content", string(content))

	// Verify backup file app.jar.prev exists
	backupFile := filepath.Join(installDir, "backup", "app.jar.prev")
	assert.FileExists(t, backupFile)

	// Verify current_artifact_id retains previous ID 1 (not upgraded to 2)
	var currentArtID sql.NullInt64
	err = db.QueryRow("SELECT current_artifact_id FROM services WHERE id = 1").Scan(&currentArtID)
	require.NoError(t, err)
	assert.True(t, currentArtID.Valid)
	assert.Equal(t, int64(1), currentArtID.Int64)
}

func TestDeployPipeline_HealthCheckFailure_NoBackup(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "fresh-fail-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "fresh-fail-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	pkgJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(pkgJar, []byte("fresh-fail-jar"), 0644))

	// Health check config points to non-existent port
	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-nobak', 'java_jar', '` + installDir + `', 'native', '{"type":"http","port":59998,"path":"/health","timeout":200000000}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status, current_artifact_id) 
		VALUES (1, 'fresh-fail-svc', 1, '` + installDir + `', 'native', 'STOPPED', NULL)`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha1', '` + pkgJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.Error(t, err)
	assert.Equal(t, "FAILED", rec.Status)

	// Since hasBackup is false (initial deploy failed), status should be FAILED and pid 0
	var status string
	var pid int
	var currentArtID sql.NullInt64
	err = db.QueryRow("SELECT status, pid, current_artifact_id FROM services WHERE id = 1").Scan(&status, &pid, &currentArtID)
	require.NoError(t, err)
	assert.Equal(t, "FAILED", status)
	assert.Equal(t, 0, pid)
	assert.False(t, currentArtID.Valid)
}

func TestDeployPipeline_Rollback_Manual(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "manual-rb")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "manual-rb")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	histJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(histJar, []byte("jar-v1-hist"), 0644))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-mrb', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'manual-rb', 1, '` + installDir + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha1', '` + histJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Rollback(context.Background(), 1, 1, "admin")
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", rec.Status)
	assert.Equal(t, "ROLLBACK", rec.Action)

	content, err := os.ReadFile(filepath.Join(installDir, "app.jar"))
	require.NoError(t, err)
	assert.Equal(t, "jar-v1-hist", string(content))
}

func TestDeployPipeline_StopRunningService(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "stop-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "stop-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	fakeJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(fakeJar, []byte("fake-jar-content"), 0644))

	sup := supervisor.NewNativeSupervisor()
	oldPID, err := sup.Start(context.Background(), installDir, "sleep 30", nil, "")
	require.NoError(t, err)
	assert.True(t, sup.IsRunning(oldPID))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-stop', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status, pid) 
		VALUES (1, 'stop-svc', 1, '` + installDir + `', 'native', 'RUNNING', ?)`, oldPID)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '` + fakeJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		sup,
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "admin")
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", rec.Status)

	// Old PID should be stopped
	assert.False(t, sup.IsRunning(oldPID))
}

func TestDeployPipeline_AuditAndDeployRecords(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	installDir := filepath.Join(tmpDir, "apps", "audit-svc")
	require.NoError(t, os.MkdirAll(installDir, 0755))

	pkgDir := filepath.Join(tmpDir, "packages", "audit-svc")
	require.NoError(t, os.MkdirAll(pkgDir, 0755))
	fakeJar := filepath.Join(pkgDir, "demo-v1.jar")
	require.NoError(t, os.WriteFile(fakeJar, []byte("fake-jar-content"), 0644))

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode, health_check_config, start_cmd) 
		VALUES (1, 't-audit', 'java_jar', '` + installDir + `', 'native', '{"type":"process"}', 'sleep 30')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'audit-svc', 1, '` + installDir + `', 'native', 'STOPPED')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO artifacts (id, service_id, filename, file_size, sha256, storage_path, version_tag) 
		VALUES (1, 1, 'demo-v1.jar', 100, 'fake-sha', '` + fakeJar + `', 'v1.0')`)
	require.NoError(t, err)

	pipeline := service.NewDeployPipeline(
		db,
		supervisor.NewNativeSupervisor(),
		prober.NewProber(),
		template.NewEngine(),
	)

	rec, err := pipeline.Deploy(context.Background(), 1, 1, "deployer-alice")
	require.NoError(t, err)
	assert.Greater(t, rec.ID, int64(0))
	assert.Equal(t, "deployer-alice", rec.Operator)
	assert.Contains(t, rec.OutputLog, "Step 1: Pre-flight checks passed")
	assert.Contains(t, rec.OutputLog, "Step 7")

	// Verify deploy_records table
	var dbStatus, dbOperator string
	err = db.QueryRow(`SELECT status, operator FROM deploy_records WHERE id = ?`, rec.ID).Scan(&dbStatus, &dbOperator)
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", dbStatus)
	assert.Equal(t, "deployer-alice", dbOperator)

	// Verify audit_logs table
	var auditAction, auditStatus string
	err = db.QueryRow(`SELECT action, status FROM audit_logs WHERE target_id = '1' ORDER BY id DESC LIMIT 1`).Scan(&auditAction, &auditStatus)
	require.NoError(t, err)
	assert.Equal(t, "DEPLOY", auditAction)
	assert.Equal(t, "SUCCESS", auditStatus)
}
