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

func TestAuthMiddleware_CaseInsensitiveBearerHeader(t *testing.T) {
	authSvc, validToken := setupAuthTestEnv(t)

	r := gin.New()
	r.Use(middleware.AuthMiddleware(authSvc))
	r.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"username": middleware.GetUsername(c),
			"role":     middleware.GetRole(c),
		})
	})

	// Test lowercase "bearer "
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req1.Header.Set("Authorization", "bearer "+validToken)
	r.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)
	assert.Contains(t, w1.Body.String(), `"username":"admin"`)

	// Test uppercase "BEARER "
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req2.Header.Set("Authorization", "BEARER "+validToken)
	r.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
	assert.Contains(t, w2.Body.String(), `"username":"admin"`)
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

func TestRequireAdmin_Middleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("role", c.GetHeader("X-Role"))
		c.Next()
	})
	r.GET("/admin-only", middleware.RequireAdmin(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 1. Admin 放行
	req := httptest.NewRequest("GET", "/admin-only", nil)
	req.Header.Set("X-Role", "admin")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// 2. Operator 拦截为 403
	req2 := httptest.NewRequest("GET", "/admin-only", nil)
	req2.Header.Set("X-Role", "operator")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusForbidden, w2.Code)
	assert.Contains(t, w2.Body.String(), "仅管理员拥有此操作权限")

	// 3. 无角色拦截为 403
	req3 := httptest.NewRequest("GET", "/admin-only", nil)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	assert.Equal(t, http.StatusForbidden, w3.Code)
	assert.Contains(t, w3.Body.String(), "仅管理员拥有此操作权限")
}

func TestRequirePermission_Middleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "perm_mid_test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	// Insert test users
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash, role, permissions, status)
		VALUES 
			('admin_user', 'hash', 'admin', '[]', 'active'),
			('op_custom', 'hash', 'operator', '["service:view","service:control"]', 'active'),
			('op_default', 'hash', 'operator', '', 'active'),
			('op_empty', 'hash', 'operator', '[]', 'active'),
			('op_disabled', 'hash', 'operator', '["service:control"]', 'disabled')
	`)
	require.NoError(t, err)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if role := c.GetHeader("X-Role"); role != "" {
			c.Set("role", role)
		}
		if user := c.GetHeader("X-User"); user != "" {
			c.Set("username", user)
		}
		c.Next()
	})
	r.POST("/service/start", middleware.RequirePermission(db, "service:control"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "started"})
	})
	r.POST("/template/create", middleware.RequirePermission(db, "template:manage"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "created"})
	})

	// 1. Admin bypasses check even if requiredPerm is not explicitly in DB
	reqAdmin := httptest.NewRequest("POST", "/template/create", nil)
	reqAdmin.Header.Set("X-Role", "admin")
	reqAdmin.Header.Set("X-User", "admin_user")
	wAdmin := httptest.NewRecorder()
	r.ServeHTTP(wAdmin, reqAdmin)
	assert.Equal(t, http.StatusOK, wAdmin.Code)

	// 2. Unauthenticated (no username) -> 401
	reqNoUser := httptest.NewRequest("POST", "/service/start", nil)
	reqNoUser.Header.Set("X-Role", "operator")
	wNoUser := httptest.NewRecorder()
	r.ServeHTTP(wNoUser, reqNoUser)
	assert.Equal(t, http.StatusUnauthorized, wNoUser.Code)
	assert.Contains(t, wNoUser.Body.String(), "未登录")

	// 3. Operator with custom permission allowed
	reqOpCustom := httptest.NewRequest("POST", "/service/start", nil)
	reqOpCustom.Header.Set("X-Role", "operator")
	reqOpCustom.Header.Set("X-User", "op_custom")
	wOpCustom := httptest.NewRecorder()
	r.ServeHTTP(wOpCustom, reqOpCustom)
	assert.Equal(t, http.StatusOK, wOpCustom.Code)

	// 4. Operator without required permission -> 403
	reqOpDenied := httptest.NewRequest("POST", "/template/create", nil)
	reqOpDenied.Header.Set("X-Role", "operator")
	reqOpDenied.Header.Set("X-User", "op_custom")
	wOpDenied := httptest.NewRecorder()
	r.ServeHTTP(wOpDenied, reqOpDenied)
	assert.Equal(t, http.StatusForbidden, wOpDenied.Code)
	assert.Contains(t, wOpDenied.Body.String(), "无权限执行此操作，缺少权限: template:manage")

	// 5. Operator with unset permissions falls back to DefaultOperatorPermissions
	// service:control is in default permissions
	reqOpDef1 := httptest.NewRequest("POST", "/service/start", nil)
	reqOpDef1.Header.Set("X-Role", "operator")
	reqOpDef1.Header.Set("X-User", "op_default")
	wOpDef1 := httptest.NewRecorder()
	r.ServeHTTP(wOpDef1, reqOpDef1)
	assert.Equal(t, http.StatusOK, wOpDef1.Code)

	// template:manage is NOT in default permissions
	reqOpDef2 := httptest.NewRequest("POST", "/template/create", nil)
	reqOpDef2.Header.Set("X-Role", "operator")
	reqOpDef2.Header.Set("X-User", "op_default")
	wOpDef2 := httptest.NewRecorder()
	r.ServeHTTP(wOpDef2, reqOpDef2)
	assert.Equal(t, http.StatusForbidden, wOpDef2.Code)
	assert.Contains(t, wOpDef2.Body.String(), "无权限执行此操作，缺少权限: template:manage")

	// 5.1 Operator with explicitly empty permissions '[]' must NOT fallback to default permissions (zero permissions)
	reqOpEmpty := httptest.NewRequest("POST", "/service/start", nil)
	reqOpEmpty.Header.Set("X-Role", "operator")
	reqOpEmpty.Header.Set("X-User", "op_empty")
	wOpEmpty := httptest.NewRecorder()
	r.ServeHTTP(wOpEmpty, reqOpEmpty)
	assert.Equal(t, http.StatusForbidden, wOpEmpty.Code)
	assert.Contains(t, wOpEmpty.Body.String(), "无权限执行此操作，缺少权限: service:control")

	// 6. Disabled operator -> 403
	reqDisabled := httptest.NewRequest("POST", "/service/start", nil)
	reqDisabled.Header.Set("X-Role", "operator")
	reqDisabled.Header.Set("X-User", "op_disabled")
	wDisabled := httptest.NewRecorder()
	r.ServeHTTP(wDisabled, reqDisabled)
	assert.Equal(t, http.StatusForbidden, wDisabled.Code)
	assert.Contains(t, wDisabled.Body.String(), "账号已被禁用或不存在")

	// 7. Non-existent user -> 403
	reqNonExist := httptest.NewRequest("POST", "/service/start", nil)
	reqNonExist.Header.Set("X-Role", "operator")
	reqNonExist.Header.Set("X-User", "ghost_user")
	wNonExist := httptest.NewRecorder()
	r.ServeHTTP(wNonExist, reqNonExist)
	assert.Equal(t, http.StatusForbidden, wNonExist.Code)
	assert.Contains(t, wNonExist.Body.String(), "账号已被禁用或不存在")
}

