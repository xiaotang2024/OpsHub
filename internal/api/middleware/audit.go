package middleware

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub/internal/model"
)

const (
	AuditActionKey     = "audit_action"
	AuditTargetTypeKey = "audit_target_type"
	AuditTargetIDKey   = "audit_target_id"
	AuditDetailsKey    = "audit_details"
	AuditStatusKey     = "audit_status"
)

// SetAudit allows handlers to attach detailed audit context to the current request.
func SetAudit(c *gin.Context, action, targetType, targetID, details string) {
	if action != "" {
		c.Set(AuditActionKey, action)
	}
	if targetType != "" {
		c.Set(AuditTargetTypeKey, targetType)
	}
	if targetID != "" {
		c.Set(AuditTargetIDKey, targetID)
	}
	if details != "" {
		c.Set(AuditDetailsKey, details)
	}
}

// SetAuditStatus explicitly sets the final audit outcome status (e.g. model.DeployStatusSuccess or model.DeployStatusFailed).
func SetAuditStatus(c *gin.Context, status string) {
	if status != "" {
		c.Set(AuditStatusKey, status)
	}
}

// AuditMiddleware records all mutating requests (POST, PUT, DELETE, PATCH) into the audit_logs table.
func AuditMiddleware(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method != http.MethodPost && method != http.MethodPut &&
			method != http.MethodDelete && method != http.MethodPatch {
			c.Next()
			return
		}

		// Execute downstream handlers first to capture the response status and any audit metadata
		c.Next()

		if db == nil {
			return
		}

		operator := c.GetString("username")
		if operator == "" {
			operator = "anonymous"
		}

		clientIP := c.ClientIP()

		action := c.GetString(AuditActionKey)
		if action == "" {
			action = method
		}

		targetType := c.GetString(AuditTargetTypeKey)
		targetID := c.GetString(AuditTargetIDKey)

		// Parse path segments for default target extraction if not provided
		path := strings.Trim(c.Request.URL.Path, "/")
		var segments []string
		if path != "" {
			segments = strings.Split(path, "/")
		}

		if targetType == "" {
			if len(segments) > 1 && segments[0] == "api" {
				targetType = segments[1]
			} else if len(segments) > 0 {
				targetType = segments[0]
			} else {
				targetType = "unknown"
			}
		}

		if targetID == "" {
			if idParam := c.Param("id"); idParam != "" {
				targetID = idParam
			} else if len(segments) > 2 && segments[0] == "api" {
				targetID = segments[2]
			} else {
				targetID = "-"
			}
		}

		status := c.GetString(AuditStatusKey)
		if status == "" {
			if c.Writer.Status() >= 200 && c.Writer.Status() < 400 {
				status = model.DeployStatusSuccess
			} else {
				status = model.DeployStatusFailed
			}
		}

		details := c.GetString(AuditDetailsKey)
		if details == "" {
			if len(c.Errors) > 0 {
				details = c.Errors.String()
			} else {
				details = fmt.Sprintf("%s %s", method, c.Request.URL.Path)
			}
		}

		query := `
			INSERT INTO audit_logs (operator, client_ip, action, target_type, target_id, details, status)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`
		_, _ = db.ExecContext(c.Request.Context(), query,
			operator,
			clientIP,
			action,
			targetType,
			targetID,
			details,
			status,
		)
	}
}
