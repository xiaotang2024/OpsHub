package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"opshub/internal/api/middleware"
	"opshub/internal/database"
	"opshub/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupAuthTestEnv(t *testing.T) (*service.AuthService, string) {
	t.Helper()
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "auth_mid_test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	authSvc := service.NewAuthService(db, "test-jwt-secret")
	pass, err := authSvc.InitAdminIfNeeded()
	require.NoError(t, err)

	token, err := authSvc.Login("admin", pass)
	require.NoError(t, err)
	return authSvc, token
}

func TestAuthMiddleware_BearerHeader(t *testing.T) {
	authSvc, validToken := setupAuthTestEnv(t)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(authSvc))
	r.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"username": middleware.GetUsername(c),
			"role":     middleware.GetRole(c),
		})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+validToken)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"username":"admin"`)
	assert.Contains(t, w.Body.String(), `"role":"admin"`)
}

func TestAuthMiddleware_QueryToken(t *testing.T) {
	authSvc, validToken := setupAuthTestEnv(t)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(authSvc))
	r.GET("/ws", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"username": middleware.GetUsername(c),
			"role":     middleware.GetRole(c),
		})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/ws?token="+validToken, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"username":"admin"`)
	assert.Contains(t, w.Body.String(), `"role":"admin"`)
}

func TestAuthMiddleware_MissingToken(t *testing.T) {
	authSvc, _ := setupAuthTestEnv(t)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(authSvc))
	r.GET("/protected", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "missing authorization token")
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	authSvc, _ := setupAuthTestEnv(t)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(authSvc))
	r.GET("/protected", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer invalid.jwt.token")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid or expired token")
}
