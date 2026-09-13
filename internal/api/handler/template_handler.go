package handler

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/template"
)

// TemplateHandler provides CRUD endpoints for service deployment templates.
type TemplateHandler struct {
	db     *sql.DB
	engine *template.Engine
}

// NewTemplateHandler constructs a new TemplateHandler.
func NewTemplateHandler(db *sql.DB, engine *template.Engine) *TemplateHandler {
	return &TemplateHandler{
		db:     db,
		engine: engine,
	}
}

// TemplateRequest represents the payload for creating or updating a deployment template.
type TemplateRequest struct {
	Name              string `json:"name" binding:"required"`
	Type              string `json:"type" binding:"required"`
	DefaultJDKID      *int64 `json:"default_jdk_id"`
	InstallDirPattern string `json:"install_dir_pattern"`
	JVMOptions        string `json:"jvm_options"`
	EnvVars           string `json:"env_vars"`
	SupervisionMode   string `json:"supervision_mode"`
	StartCmd          string `json:"start_cmd"`
	StopCmd           string `json:"stop_cmd"`
	HealthCheckConfig string `json:"health_check_config"`
	UninstallRules    string `json:"uninstall_rules"`
}

// List returns all templates.
// GET /api/templates
func (h *TemplateHandler) List(c *gin.Context) {
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
		ORDER BY id ASC
	`
	rows, err := h.db.QueryContext(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query templates: " + err.Error()})
		return
	}
	defer rows.Close()

	list := make([]model.Template, 0)
	for rows.Next() {
		var t model.Template
		if err := rows.Scan(
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
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan template: " + err.Error()})
			return
		}
		list = append(list, t)
	}

	c.JSON(http.StatusOK, list)
}

// GetByID returns a single template by ID.
// GET /api/templates/:id
func (h *TemplateHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid template id"})
		return
	}

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
	err = h.db.QueryRowContext(c.Request.Context(), query, id).Scan(
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
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, t)
}

// Create inserts a new template.
// POST /api/templates
func (h *TemplateHandler) Create(c *gin.Context) {
	var req TemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "template name cannot be empty"})
		return
	}

	installDirPattern := strings.TrimSpace(req.InstallDirPattern)
	if installDirPattern == "" {
		installDirPattern = "/opt/apps/${SERVICE_NAME}"
	}

	supervisionMode := strings.TrimSpace(req.SupervisionMode)
	if supervisionMode == "" {
		supervisionMode = model.SupervisionModeNative
	}

	now := time.Now().UTC()
	query := `
		INSERT INTO templates (
			name, type, default_jdk_id, install_dir_pattern, 
			jvm_options, env_vars, supervision_mode, 
			start_cmd, stop_cmd, health_check_config, uninstall_rules, 
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	res, err := h.db.ExecContext(c.Request.Context(), query,
		name,
		strings.TrimSpace(req.Type),
		req.DefaultJDKID,
		installDirPattern,
		req.JVMOptions,
		req.EnvVars,
		supervisionMode,
		req.StartCmd,
		req.StopCmd,
		req.HealthCheckConfig,
		req.UninstallRules,
		now,
		now,
	)
	if err != nil {
		if database.IsUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "template name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "insert template failed: " + err.Error()})
		return
	}

	id, err := res.LastInsertId()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "retrieve template id failed: " + err.Error()})
		return
	}

	middleware.SetAudit(c, "CREATE", "template", strconv.FormatInt(id, 10), fmt.Sprintf("Created template %s (%s)", name, req.Type))

	t := model.Template{
		ID:                id,
		Name:              name,
		Type:              req.Type,
		DefaultJDKID:      req.DefaultJDKID,
		InstallDirPattern: installDirPattern,
		JVMOptions:        req.JVMOptions,
		EnvVars:           req.EnvVars,
		SupervisionMode:   supervisionMode,
		StartCmd:          req.StartCmd,
		StopCmd:           req.StopCmd,
		HealthCheckConfig: req.HealthCheckConfig,
		UninstallRules:    req.UninstallRules,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	c.JSON(http.StatusCreated, t)
}

// Update modifies an existing template.
// PUT /api/templates/:id
func (h *TemplateHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid template id"})
		return
	}

	var req TemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "template name cannot be empty"})
		return
	}

	installDirPattern := strings.TrimSpace(req.InstallDirPattern)
	if installDirPattern == "" {
		installDirPattern = "/opt/apps/${SERVICE_NAME}"
	}

	supervisionMode := strings.TrimSpace(req.SupervisionMode)
	if supervisionMode == "" {
		supervisionMode = model.SupervisionModeNative
	}

	now := time.Now().UTC()
	query := `
		UPDATE templates SET
			name = ?, type = ?, default_jdk_id = ?, install_dir_pattern = ?,
			jvm_options = ?, env_vars = ?, supervision_mode = ?,
			start_cmd = ?, stop_cmd = ?, health_check_config = ?, uninstall_rules = ?,
			updated_at = ?
		WHERE id = ?
	`
	res, err := h.db.ExecContext(c.Request.Context(), query,
		name,
		strings.TrimSpace(req.Type),
		req.DefaultJDKID,
		installDirPattern,
		req.JVMOptions,
		req.EnvVars,
		supervisionMode,
		req.StartCmd,
		req.StopCmd,
		req.HealthCheckConfig,
		req.UninstallRules,
		now,
		id,
	)
	if err != nil {
		if database.IsUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "template name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update template failed: " + err.Error()})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}

	middleware.SetAudit(c, "UPDATE", "template", strconv.FormatInt(id, 10), fmt.Sprintf("Updated template %s (%d)", name, id))

	t := model.Template{
		ID:                id,
		Name:              name,
		Type:              req.Type,
		DefaultJDKID:      req.DefaultJDKID,
		InstallDirPattern: installDirPattern,
		JVMOptions:        req.JVMOptions,
		EnvVars:           req.EnvVars,
		SupervisionMode:   supervisionMode,
		StartCmd:          req.StartCmd,
		StopCmd:           req.StopCmd,
		HealthCheckConfig: req.HealthCheckConfig,
		UninstallRules:    req.UninstallRules,
		UpdatedAt:         now,
	}

	c.JSON(http.StatusOK, t)
}

// Delete removes a template if not used by any service.
// DELETE /api/templates/:id
func (h *TemplateHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid template id"})
		return
	}

	// Check if any service references this template
	var count int
	err = h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM services WHERE template_id = ?", id).Scan(&count)
	if err == nil && count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("template is currently used by %d service(s)", count)})
		return
	}

	middleware.SetAudit(c, "DELETE", "template", strconv.FormatInt(id, 10), fmt.Sprintf("Deleted template %d", id))

	res, err := h.db.ExecContext(c.Request.Context(), "DELETE FROM templates WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete template failed: " + err.Error()})
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "template deleted successfully"})
}
