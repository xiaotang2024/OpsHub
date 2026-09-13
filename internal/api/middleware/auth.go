package middleware

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub/internal/model"
	"opshub/internal/service"
)

// TokenVerifier defines the capability to parse and validate auth tokens.
type TokenVerifier interface {
	VerifyToken(tokenString string) (*service.Claims, error)
}

// AuthMiddleware creates a Gin middleware that extracts and validates a JWT token
// from either the Authorization header (Bearer <token>) or the "token" query parameter (e.g. for WebSockets).
// Upon successful verification, it sets "username", "role", and "claims" on the context.
func AuthMiddleware(verifier TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string
		authHeader := c.GetHeader("Authorization")

		if len(authHeader) >= 7 && strings.EqualFold(authHeader[:7], "bearer ") {
			tokenStr = authHeader[7:]
		} else if authHeader != "" {
			tokenStr = authHeader
		} else {
			tokenStr = c.Query("token")
		}

		tokenStr = strings.TrimSpace(tokenStr)
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing authorization token",
			})
			return
		}

		claims, err := verifier.VerifyToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired token",
			})
			return
		}

		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("claims", claims)
		c.Next()
	}
}

// GetUsername retrieves the authenticated username from the Gin context, or empty string if not found.
func GetUsername(c *gin.Context) string {
	if v, ok := c.Get("username"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// GetRole retrieves the authenticated role from the Gin context, or empty string if not found.
func GetRole(c *gin.Context) string {
	if v, ok := c.Get("role"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// GetClaims retrieves the parsed Claims struct from the Gin context, or nil if not found.
func GetClaims(c *gin.Context) *service.Claims {
	if v, ok := c.Get("claims"); ok {
		if claims, ok := v.(*service.Claims); ok {
			return claims
		}
	}
	return nil
}

// RequireAdmin ensures that the authenticated caller has the admin role.
// Aborts with 403 Forbidden if not.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetRole(c)
		if role != model.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "仅管理员拥有此操作权限",
			})
			return
		}
		c.Next()
	}
}

// RequirePermission ensures that the caller either has the admin role (which bypasses checks)
// or is an active operator with the specified permission.
func RequirePermission(db *sql.DB, requiredPerm string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetRole(c)
		if role == model.RoleAdmin {
			c.Next()
			return
		}
		username := GetUsername(c)
		if username == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}

		if db == nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
			return
		}

		var permStr sql.NullString
		var statusStr sql.NullString
		err := db.QueryRowContext(c.Request.Context(), "SELECT permissions, status FROM users WHERE username = ?", username).Scan(&permStr, &statusStr)
		if err != nil || !statusStr.Valid || statusStr.String != model.UserStatusActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "账号已被禁用或不存在"})
			return
		}

		var perms []string
		if permStr.Valid && strings.TrimSpace(permStr.String) != "" {
			_ = json.Unmarshal([]byte(permStr.String), &perms)
		}
		if len(perms) == 0 {
			perms = model.DefaultOperatorPermissions
		}

		has := false
		for _, p := range perms {
			if p == requiredPerm {
				has = true
				break
			}
		}

		if !has {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": fmt.Sprintf("无权限执行此操作，缺少权限: %s", requiredPerm),
			})
			return
		}
		c.Next()
	}
}

