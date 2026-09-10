package middleware_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"opshub/internal/api/middleware"
	"opshub/internal/database"
	"opshub/internal/model"
)

func setupAuditDB(t *testing.T) *sql.DB {
	t.Helper()
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "audit_mid_test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	return db
}

func TestAuditMiddleware_NonMutatingRequest(t *testing.T) {
	db := setupAuditDB(t)

	r := gin.New()
	r.Use(middleware.AuditMiddleware(db))
	r.GET("/api/services", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/api/services", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM audit_logs").Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "GET request should not create audit log entry")
}

func TestAuditMiddleware_MutatingRequest_WithExplicitAudit(t *testing.T) {
	db := setupAuditDB(t)

	r := gin.New()
	// Simulate auth setting username
	r.Use(func(c *gin.Context) {
		c.Set("username", "admin_user")
		c.Next()
	})
	r.Use(middleware.AuditMiddleware(db))

	r.POST("/api/services/:id/deploy", func(c *gin.Context) {
		middleware.SetAudit(c, model.ActionDeploy, "service", c.Param("id"), "deployed artifact 10")
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/services/5/deploy", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var log model.AuditLog
	err := db.QueryRow(`
		SELECT id, operator, client_ip, action, target_type, target_id, details, status
		FROM audit_logs
		ORDER BY id DESC LIMIT 1
	`).Scan(&log.ID, &log.Operator, &log.ClientIP, &log.Action, &log.TargetType, &log.TargetID, &log.Details, &log.Status)
	require.NoError(t, err)

	assert.Equal(t, "admin_user", log.Operator)
	assert.Equal(t, model.ActionDeploy, log.Action)
	assert.Equal(t, "service", log.TargetType)
	assert.Equal(t, "5", log.TargetID)
	assert.Equal(t, "deployed artifact 10", log.Details)
	assert.Equal(t, model.DeployStatusSuccess, log.Status)
}

func TestAuditMiddleware_MutatingRequest_Defaults(t *testing.T) {
	db := setupAuditDB(t)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("username", "operator1")
		c.Next()
	})
	r.Use(middleware.AuditMiddleware(db))

	r.DELETE("/api/services/:id", func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/api/services/42", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)

	var log model.AuditLog
	err := db.QueryRow(`
		SELECT id, operator, action, target_type, target_id, status
		FROM audit_logs
		ORDER BY id DESC LIMIT 1
	`).Scan(&log.ID, &log.Operator, &log.Action, &log.TargetType, &log.TargetID, &log.Status)
	require.NoError(t, err)

	assert.Equal(t, "operator1", log.Operator)
	assert.Equal(t, "DELETE", log.Action)
	assert.Equal(t, "services", log.TargetType)
	assert.Equal(t, "42", log.TargetID)
	assert.Equal(t, "SUCCESS", log.Status)
}

func TestAuditMiddleware_MutatingRequest_Failed(t *testing.T) {
	db := setupAuditDB(t)

	r := gin.New()
	r.Use(middleware.AuditMiddleware(db))

	r.POST("/api/services", func(c *gin.Context) {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "db failure"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/api/services", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var log model.AuditLog
	err := db.QueryRow(`
		SELECT operator, status
		FROM audit_logs
		ORDER BY id DESC LIMIT 1
	`).Scan(&log.Operator, &log.Status)
	require.NoError(t, err)

	assert.Equal(t, "anonymous", log.Operator)
	assert.Equal(t, "FAILED", log.Status)
}
