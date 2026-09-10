package handler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/model"
	"opshub/internal/service"
	"opshub/internal/supervisor"
	"opshub/internal/template"
)

// ServiceHandler manages individual service instances, lifecycle actions, configs, and releases.
type ServiceHandler struct {
	db                *sql.DB
	pipeline          *service.DeployPipeline
	supervisor        supervisor.Supervisor
	systemdSupervisor *supervisor.SystemdSupervisor
	engine            *template.Engine
}

// NewServiceHandler constructs a new ServiceHandler.
func NewServiceHandler(
	db *sql.DB,
	pipeline *service.DeployPipeline,
	sup supervisor.Supervisor,
	systemdSup *supervisor.SystemdSupervisor,
	engine *template.Engine,
) *ServiceHandler {
	return &ServiceHandler{
		db:                db,
		pipeline:          pipeline,
		supervisor:        sup,
		systemdSupervisor: systemdSup,
		engine:            engine,
	}
}

// CreateServiceRequest represents parameters for registering a managed service.
type CreateServiceRequest struct {
	Name            string `json:"name" binding:"required"`
	TemplateID      int64  `json:"template_id" binding:"required"`
	JDKID           *int64 `json:"jdk_id"`
	InstallDir      string `json:"install_dir"`
	Port            int    `json:"port"`
	JVMOptions      string `json:"jvm_options"`
	EnvVars         string `json:"env_vars"`
	SupervisionMode string `json:"supervision_mode"`
}

// UpdateServiceRequest represents parameters for modifying service configuration.
type UpdateServiceRequest struct {
	Name            string `json:"name" binding:"required"`
	TemplateID      int64  `json:"template_id"`
	JDKID           *int64 `json:"jdk_id"`
	InstallDir      string `json:"install_dir"`
	Port            int    `json:"port"`
	JVMOptions      string `json:"jvm_options"`
	EnvVars         string `json:"env_vars"`
	SupervisionMode string `json:"supervision_mode"`
}

// ActionRequest is the payload for deploy and rollback requests.
type ActionRequest struct {
	ArtifactID int `json:"artifact_id" binding:"required"`
}

// ConfigFileRequest represents payload for editing a service configuration file.
type ConfigFileRequest struct {
	File    string `json:"file" binding:"required"`
	Content string `json:"content" binding:"required"`
}

// List returns all services and synchronizes their active execution status.
// GET /api/services
func (h *ServiceHandler) List(c *gin.Context) {
	query := `
		SELECT 
			id, name, template_id, jdk_id, install_dir, 
			COALESCE(port, 0), 
			COALESCE(jvm_options, ''), 
			COALESCE(env_vars, ''), 
			supervision_mode, status, current_artifact_id, 
			COALESCE(pid, 0), created_at, updated_at
		FROM services
		ORDER BY id ASC
	`
	rows, err := h.db.QueryContext(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query services: " + err.Error()})
		return
	}
	defer rows.Close()

	list := make([]model.Service, 0)
	for rows.Next() {
		var s model.Service
		if err := rows.Scan(
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
			&s.CreatedAt,
			&s.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan service: " + err.Error()})
			return
		}

		h.syncServiceRuntimeStatus(c.Request.Context(), &s)
		list = append(list, s)
	}

	c.JSON(http.StatusOK, list)
}

// GetByID retrieves a single service instance.
// GET /api/services/:id
func (h *ServiceHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	s, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.syncServiceRuntimeStatus(c.Request.Context(), s)
	c.JSON(http.StatusOK, s)
}

// Create registers a new service instance.
// POST /api/services
func (h *ServiceHandler) Create(c *gin.Context) {
	var req CreateServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "service name cannot be empty"})
		return
	}

	// Fetch template to derive defaults
	tpl, err := h.getTemplate(c.Request.Context(), req.TemplateID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid template_id: " + err.Error()})
		return
	}

	installDir := strings.TrimSpace(req.InstallDir)
	if installDir == "" {
		installDir = h.engine.RenderInstallDir(tpl.InstallDirPattern, name)
	}

	supervisionMode := strings.TrimSpace(req.SupervisionMode)
	if supervisionMode == "" {
		supervisionMode = tpl.SupervisionMode
	}
	if supervisionMode == "" {
		supervisionMode = model.SupervisionModeNative
	}

	jdkID := req.JDKID
	if jdkID == nil && tpl.DefaultJDKID != nil {
		jdkID = tpl.DefaultJDKID
	}

	now := time.Now().UTC()
	query := `
		INSERT INTO services (
			name, template_id, jdk_id, install_dir, port, 
			jvm_options, env_vars, supervision_mode, status, 
			current_artifact_id, pid, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)
	`
	res, err := h.db.ExecContext(c.Request.Context(), query,
		name,
		req.TemplateID,
		jdkID,
		installDir,
		req.Port,
		req.JVMOptions,
		req.EnvVars,
		supervisionMode,
		model.ServiceStatusStopped,
		now,
		now,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			c.JSON(http.StatusConflict, gin.H{"error": "service name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "insert service failed: " + err.Error()})
		return
	}

	id, err := res.LastInsertId()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "retrieve service id failed: " + err.Error()})
		return
	}

	middleware.SetAudit(c, "CREATE", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Created service %s", name))

	svc := model.Service{
		ID:              id,
		Name:            name,
		TemplateID:      req.TemplateID,
		JDKID:           jdkID,
		InstallDir:      installDir,
		Port:            req.Port,
		JVMOptions:      req.JVMOptions,
		EnvVars:         req.EnvVars,
		SupervisionMode: supervisionMode,
		Status:          model.ServiceStatusStopped,
		PID:             0,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	c.JSON(http.StatusCreated, svc)
}

// Update modifies an existing service's configuration.
// PUT /api/services/:id
func (h *ServiceHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	var req UpdateServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "service name cannot be empty"})
		return
	}

	now := time.Now().UTC()
	query := `
		UPDATE services SET
			name = ?, install_dir = ?, port = ?, jdk_id = ?,
			jvm_options = ?, env_vars = ?, supervision_mode = ?,
			updated_at = ?
		WHERE id = ?
	`
	res, err := h.db.ExecContext(c.Request.Context(), query,
		name,
		strings.TrimSpace(req.InstallDir),
		req.Port,
		req.JDKID,
		req.JVMOptions,
		req.EnvVars,
		strings.TrimSpace(req.SupervisionMode),
		now,
		id,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			c.JSON(http.StatusConflict, gin.H{"error": "service name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update service failed: " + err.Error()})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
		return
	}

	middleware.SetAudit(c, "UPDATE", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Updated service %s (%d)", name, id))

	updated, err := h.getService(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "updated successfully"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// Delete stops and unregisters a service.
// DELETE /api/services/:id
func (h *ServiceHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Stop process if running
	if svc.SupervisionMode == model.SupervisionModeSystemd && h.systemdSupervisor != nil {
		_ = h.systemdSupervisor.Stop(c.Request.Context(), svc.Name)
	} else if svc.PID > 0 && h.supervisor != nil && h.supervisor.IsRunning(svc.PID) {
		_ = h.supervisor.Stop(c.Request.Context(), svc.PID, 5*time.Second)
	}

	middleware.SetAudit(c, "DELETE", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Deleted service %s (%d)", svc.Name, id))

	// Clean up related records
	_, _ = h.db.ExecContext(c.Request.Context(), "DELETE FROM deploy_records WHERE service_id = ?", id)
	_, _ = h.db.ExecContext(c.Request.Context(), "DELETE FROM artifacts WHERE service_id = ?", id)

	res, err := h.db.ExecContext(c.Request.Context(), "DELETE FROM services WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete service: " + err.Error()})
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "service deleted successfully"})
}

// Start launches a stopped service instance.
// POST /api/services/:id/start
func (h *ServiceHandler) Start(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Check if already running
	if svc.PID > 0 && h.supervisor != nil && h.supervisor.IsRunning(svc.PID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "service is already running"})
		return
	}
	if svc.SupervisionMode == model.SupervisionModeSystemd && h.systemdSupervisor != nil {
		if active, _ := h.systemdSupervisor.IsActive(c.Request.Context(), svc.Name); active {
			c.JSON(http.StatusBadRequest, gin.H{"error": "service is already running"})
			return
		}
	}

	tpl, err := h.getTemplate(c.Request.Context(), svc.TemplateID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "template not found: " + err.Error()})
		return
	}

	var jdk *model.JDKAsset
	if svc.JDKID != nil && *svc.JDKID > 0 {
		jdk, _ = h.getJDK(c.Request.Context(), *svc.JDKID)
	} else if tpl.DefaultJDKID != nil && *tpl.DefaultJDKID > 0 {
		jdk, _ = h.getJDK(c.Request.Context(), *tpl.DefaultJDKID)
	}

	installDir := svc.InstallDir
	if strings.TrimSpace(installDir) == "" {
		installDir = h.engine.RenderInstallDir(tpl.InstallDirPattern, svc.Name)
	}
	targetFile := filepath.Join(installDir, "app.jar")

	startCmd, err := h.engine.RenderStartCommand(tpl, svc, jdk, targetFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to render start command: " + err.Error()})
		return
	}

	envMap, err := h.engine.RenderEnvVars(tpl, svc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to render env vars: " + err.Error()})
		return
	}
	var envSlice []string
	for k, v := range envMap {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, v))
	}

	logFile := filepath.Join(installDir, "logs", "console.log")
	_ = os.MkdirAll(filepath.Dir(logFile), 0755)

	var newPID int
	if svc.SupervisionMode == model.SupervisionModeSystemd && h.systemdSupervisor != nil {
		unitContent := h.systemdSupervisor.RenderUnit(svc.Name, installDir, startCmd)
		if err := h.systemdSupervisor.InstallAndStart(c.Request.Context(), svc.Name, unitContent); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "start systemd service failed: " + err.Error()})
			return
		}
	} else {
		pid, err := h.supervisor.Start(c.Request.Context(), installDir, startCmd, envSlice, logFile)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "start supervisor failed: " + err.Error()})
			return
		}
		newPID = pid
	}

	_, _ = h.db.ExecContext(c.Request.Context(),
		"UPDATE services SET status = ?, pid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		model.ServiceStatusRunning, newPID, id,
	)

	middleware.SetAudit(c, "START", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Started service %s (PID %d)", svc.Name, newPID))

	svc.Status = model.ServiceStatusRunning
	svc.PID = newPID
	c.JSON(http.StatusOK, svc)
}

// Stop terminates a running service instance.
// POST /api/services/:id/stop
func (h *ServiceHandler) Stop(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if svc.SupervisionMode == model.SupervisionModeSystemd && h.systemdSupervisor != nil {
		_ = h.systemdSupervisor.Stop(c.Request.Context(), svc.Name)
	} else if svc.PID > 0 && h.supervisor != nil && h.supervisor.IsRunning(svc.PID) {
		if err := h.supervisor.Stop(c.Request.Context(), svc.PID, 10*time.Second); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "stop service failed: " + err.Error()})
			return
		}
	}

	_, _ = h.db.ExecContext(c.Request.Context(),
		"UPDATE services SET status = ?, pid = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		model.ServiceStatusStopped, id,
	)

	middleware.SetAudit(c, "STOP", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Stopped service %s", svc.Name))

	svc.Status = model.ServiceStatusStopped
	svc.PID = 0
	c.JSON(http.StatusOK, svc)
}

// Restart stops then starts the service.
// POST /api/services/:id/restart
func (h *ServiceHandler) Restart(c *gin.Context) {
	h.Stop(c)
	if c.IsAborted() {
		return
	}
	h.Start(c)
}

// GetConfigs reads a configuration file or lists available configuration files.
// GET /api/services/:id/configs
func (h *ServiceHandler) GetConfigs(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	reqFile := strings.TrimSpace(c.Query("file"))
	if reqFile != "" {
		cleaned := filepath.Clean(reqFile)
		if filepath.IsAbs(cleaned) || strings.Contains(cleaned, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file path: directory traversal prohibited"})
			return
		}

		targetPath := filepath.Join(svc.InstallDir, cleaned)
		if _, err := os.Stat(targetPath); os.IsNotExist(err) {
			// Try under config/
			altPath := filepath.Join(svc.InstallDir, "config", cleaned)
			if _, err2 := os.Stat(altPath); err2 == nil {
				targetPath = altPath
			} else {
				c.JSON(http.StatusNotFound, gin.H{"error": "config file not found: " + reqFile})
				return
			}
		}

		data, err := os.ReadFile(targetPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read config file: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"file":    cleaned,
			"path":    targetPath,
			"content": string(data),
		})
		return
	}

	// Discover config files in install_dir and install_dir/config
	files := discoverConfigFiles(svc.InstallDir)
	c.JSON(http.StatusOK, gin.H{
		"files": files,
	})
}

// SaveConfig writes updated configuration content and automatically creates a .bak backup.
// POST /api/services/:id/configs
func (h *ServiceHandler) SaveConfig(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var req ConfigFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cleaned := filepath.Clean(strings.TrimSpace(req.File))
	if filepath.IsAbs(cleaned) || strings.Contains(cleaned, "..") || cleaned == "." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file path: directory traversal prohibited"})
		return
	}

	targetPath := filepath.Join(svc.InstallDir, cleaned)
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		altPath := filepath.Join(svc.InstallDir, "config", cleaned)
		if _, err2 := os.Stat(altPath); err2 == nil {
			targetPath = altPath
		}
	}

	// Create parent directory
	_ = os.MkdirAll(filepath.Dir(targetPath), 0755)

	var backupPath string
	if _, err := os.Stat(targetPath); err == nil {
		timestamp := time.Now().Format("20060102150405")
		backupPath = fmt.Sprintf("%s.bak.%s", targetPath, timestamp)
		_ = copyFileHelper(targetPath, backupPath)
		// Also update default .bak
		_ = copyFileHelper(targetPath, targetPath+".bak")
	}

	if err := os.WriteFile(targetPath, []byte(req.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write config file: " + err.Error()})
		return
	}

	middleware.SetAudit(c, "CONFIG_EDIT", "service", strconv.FormatInt(id, 10), fmt.Sprintf("Updated config %s for service %s", cleaned, svc.Name))

	c.JSON(http.StatusOK, gin.H{
		"message": "config saved successfully",
		"file":    cleaned,
		"backup":  backupPath,
	})
}

// Releases returns the deployment and rollback history of a service.
// GET /api/services/:id/releases
func (h *ServiceHandler) Releases(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	query := `
		SELECT id, service_id, artifact_id, action, operator, client_ip, status, output_log, started_at, finished_at
		FROM deploy_records
		WHERE service_id = ?
		ORDER BY id DESC
	`
	rows, err := h.db.QueryContext(c.Request.Context(), query, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query release records: " + err.Error()})
		return
	}
	defer rows.Close()

	list := make([]model.DeployRecord, 0)
	for rows.Next() {
		var rec model.DeployRecord
		if err := rows.Scan(
			&rec.ID,
			&rec.ServiceID,
			&rec.ArtifactID,
			&rec.Action,
			&rec.Operator,
			&rec.ClientIP,
			&rec.Status,
			&rec.OutputLog,
			&rec.StartedAt,
			&rec.FinishedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan release record: " + err.Error()})
			return
		}
		list = append(list, rec)
	}

	c.JSON(http.StatusOK, list)
}

// Deploy triggers the 7-step deployment pipeline.
// POST /api/services/:id/deploy
func (h *ServiceHandler) Deploy(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	var req ActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	operator := middleware.GetUsername(c)
	if operator == "" {
		operator = "admin"
	}

	record, deployErr := h.pipeline.Deploy(c.Request.Context(), int(id), req.ArtifactID, operator)
	if deployErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  deployErr.Error(),
			"record": record,
		})
		return
	}

	c.JSON(http.StatusOK, record)
}

// Rollback triggers rollback to a target artifact version.
// POST /api/services/:id/rollback
func (h *ServiceHandler) Rollback(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	var req ActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	operator := middleware.GetUsername(c)
	if operator == "" {
		operator = "admin"
	}

	record, rollbackErr := h.pipeline.Rollback(c.Request.Context(), int(id), req.ArtifactID, operator)
	if rollbackErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  rollbackErr.Error(),
			"record": record,
		})
		return
	}

	c.JSON(http.StatusOK, record)
}

// Metrics returns live process telemetry (CPU, RSS, uptime) for a service.
// GET /api/services/:id/metrics
func (h *ServiceHandler) Metrics(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	svc, err := h.getService(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "service not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.syncServiceRuntimeStatus(c.Request.Context(), svc)

	if svc.PID <= 0 || svc.Status != model.ServiceStatusRunning {
		c.JSON(http.StatusOK, gin.H{
			"pid":           svc.PID,
			"status":        svc.Status,
			"cpu_percent":   0.0,
			"memory_rss_mb": 0.0,
			"uptime":        "stopped",
		})
		return
	}

	cpu, rssMb, uptime := getProcessMetrics(svc.PID)
	c.JSON(http.StatusOK, gin.H{
		"pid":           svc.PID,
		"status":        svc.Status,
		"cpu_percent":   cpu,
		"memory_rss_mb": rssMb,
		"uptime":        uptime,
	})
}

func (h *ServiceHandler) syncServiceRuntimeStatus(ctx context.Context, svc *model.Service) {
	if svc == nil {
		return
	}

	if svc.SupervisionMode == model.SupervisionModeSystemd && h.systemdSupervisor != nil {
		active, _ := h.systemdSupervisor.IsActive(ctx, svc.Name)
		newStatus := model.ServiceStatusStopped
		if active {
			newStatus = model.ServiceStatusRunning
		}
		if svc.Status != newStatus && svc.Status != model.ServiceStatusStarting && svc.Status != model.ServiceStatusFailed {
			svc.Status = newStatus
			_, _ = h.db.ExecContext(ctx, "UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", newStatus, svc.ID)
		}
	} else if svc.PID > 0 && h.supervisor != nil {
		if !h.supervisor.IsRunning(svc.PID) {
			if svc.Status == model.ServiceStatusRunning {
				svc.Status = model.ServiceStatusStopped
				svc.PID = 0
				_, _ = h.db.ExecContext(ctx, "UPDATE services SET status = ?, pid = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", model.ServiceStatusStopped, svc.ID)
			}
		}
	}
}

func (h *ServiceHandler) getService(ctx context.Context, id int64) (*model.Service, error) {
	query := `
		SELECT 
			id, name, template_id, jdk_id, install_dir, 
			COALESCE(port, 0), 
			COALESCE(jvm_options, ''), 
			COALESCE(env_vars, ''), 
			supervision_mode, status, current_artifact_id, 
			COALESCE(pid, 0), created_at, updated_at
		FROM services
		WHERE id = ?
	`
	var s model.Service
	err := h.db.QueryRowContext(ctx, query, id).Scan(
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
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (h *ServiceHandler) getTemplate(ctx context.Context, id int64) (*model.Template, error) {
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
	err := h.db.QueryRowContext(ctx, query, id).Scan(
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
		return nil, err
	}
	return &t, nil
}

func (h *ServiceHandler) getJDK(ctx context.Context, id int64) (*model.JDKAsset, error) {
	query := `
		SELECT id, name, java_home, bin_path, version_str, is_system, created_at
		FROM jdk_assets
		WHERE id = ?
	`
	var a model.JDKAsset
	err := h.db.QueryRowContext(ctx, query, id).Scan(
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

func discoverConfigFiles(installDir string) []string {
	validExts := map[string]bool{
		".yml":        true,
		".yaml":       true,
		".properties": true,
		".conf":       true,
		".json":       true,
		".env":        true,
		".xml":        true,
		".ini":        true,
		".toml":       true,
	}

	results := make([]string, 0)
	searchDirs := []string{installDir, filepath.Join(installDir, "config")}

	seen := make(map[string]bool)
	for _, dir := range searchDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if validExts[ext] {
				rel := e.Name()
				if dir != installDir {
					rel = filepath.Join("config", e.Name())
				}
				if !seen[rel] {
					seen[rel] = true
					results = append(results, rel)
				}
			}
		}
	}
	return results
}

func getProcessMetrics(pid int) (float64, float64, string) {
	if pid <= 0 {
		return 0, 0, "stopped"
	}

	// Try ps command
	cmd := exec.Command("ps", "-o", "%cpu=,rss=,etime=", "-p", strconv.Itoa(pid))
	out, err := cmd.Output()
	if err == nil {
		fields := strings.Fields(string(out))
		if len(fields) >= 3 {
			cpu, _ := strconv.ParseFloat(fields[0], 64)
			rssKb, _ := strconv.ParseFloat(fields[1], 64)
			rssMb := rssKb / 1024.0
			uptime := fields[2]
			return mathRound(cpu, 1), mathRound(rssMb, 1), uptime
		}
	}

	return 0.0, 0.0, "unknown"
}

func copyFileHelper(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	_ = os.MkdirAll(filepath.Dir(dst), 0755)
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
