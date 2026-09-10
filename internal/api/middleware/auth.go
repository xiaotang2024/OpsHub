package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

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

		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
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
