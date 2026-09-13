package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"opshub/internal/api/handler"
	"opshub/internal/database"
	"opshub/internal/model"
	"opshub/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type userTestFixture struct {
	userSvc *service.UserService
	handler *handler.UserHandler
	router  *gin.Engine
}

func setupUserTestFixture(t *testing.T) *userTestFixture {
	t.Helper()
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "user_handler_test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	authSvc := service.NewAuthService(db, "secret")
	_, err = authSvc.InitAdminIfNeeded()
	require.NoError(t, err)

	userSvc := service.NewUserService(db)
	userHandler := handler.NewUserHandler(userSvc)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		role := c.GetHeader("X-Role")
		if role == "" {
			role = model.RoleAdmin
		}
		c.Set("role", role)
		username := c.GetHeader("X-User")
		if username == "" {
			username = "admin"
		}
		c.Set("username", username)
		c.Next()
	})

	users := r.Group("/api/users")
	{
		users.GET("", userHandler.List)
		users.POST("", userHandler.Create)
		users.PUT("/:id/permissions", userHandler.UpdatePermissions)
		users.PUT("/:id/status", userHandler.UpdateStatus)
		users.POST("/:id/reset-password", userHandler.ResetPassword)
		users.DELETE("/:id", userHandler.Delete)
	}

	return &userTestFixture{
		userSvc: userSvc,
		handler: userHandler,
		router:  r,
	}
}

func TestUserHandler_List(t *testing.T) {
	f := setupUserTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var users []*model.User
	err := json.Unmarshal(w.Body.Bytes(), &users)
	require.NoError(t, err)
	assert.Len(t, users, 1)
	assert.Equal(t, "admin", users[0].Username)
}

func TestUserHandler_Create(t *testing.T) {
	f := setupUserTestFixture(t)

	// 1. Successful creation with default operator permissions
	createBody := bytes.NewBufferString(`{
		"username": "op_test",
		"password": "Password123",
		"nickname": "Test Op",
		"email": "test@opshub.dev",
		"role": "operator"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/users", createBody)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	var created model.User
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	assert.Equal(t, "op_test", created.Username)
	assert.Equal(t, "operator", created.Role)
	assert.Equal(t, model.UserStatusActive, created.Status)
	assert.ElementsMatch(t, model.DefaultOperatorPermissions, created.Permissions)

	// 2. Duplicate username returns 400
	dupBody := bytes.NewBufferString(`{
		"username": "op_test",
		"password": "Password123"
	}`)
	reqDup := httptest.NewRequest(http.MethodPost, "/api/users", dupBody)
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	f.router.ServeHTTP(wDup, reqDup)
	assert.Equal(t, http.StatusBadRequest, wDup.Code)
	assert.Contains(t, wDup.Body.String(), "already exists")

	// 3. Invalid payload (missing password) returns 400
	badBody := bytes.NewBufferString(`{"username": "short"}`)
	reqBad := httptest.NewRequest(http.MethodPost, "/api/users", badBody)
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()
	f.router.ServeHTTP(wBad, reqBad)
	assert.Equal(t, http.StatusBadRequest, wBad.Code)
}

func TestUserHandler_UpdatePermissions(t *testing.T) {
	f := setupUserTestFixture(t)

	// Create operator first
	u, err := f.userSvc.CreateUser(httptest.NewRequest(http.MethodGet, "/", nil).Context(), service.CreateUserRequest{
		Username: "op_perm",
		Password: "Password123",
		Role:     model.RoleOperator,
	})
	require.NoError(t, err)

	// Update permissions
	newPerms := `{"permissions": ["service:view", "service:control"]}`
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/users/%d/permissions", u.ID), bytes.NewBufferString(newPerms))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "permissions updated successfully")

	// Verify update in DB
	updated, err := f.userSvc.GetUserByID(httptest.NewRequest(http.MethodGet, "/", nil).Context(), u.ID)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"service:view", "service:control"}, updated.Permissions)

	// Non-existent user -> 404
	req404 := httptest.NewRequest(http.MethodPut, "/api/users/99999/permissions", bytes.NewBufferString(newPerms))
	req404.Header.Set("Content-Type", "application/json")
	w404 := httptest.NewRecorder()
	f.router.ServeHTTP(w404, req404)
	assert.Equal(t, http.StatusNotFound, w404.Code)
}

func TestUserHandler_UpdateStatus(t *testing.T) {
	f := setupUserTestFixture(t)

	// Create operator
	u, err := f.userSvc.CreateUser(httptest.NewRequest(http.MethodGet, "/", nil).Context(), service.CreateUserRequest{
		Username: "op_status",
		Password: "Password123",
		Role:     model.RoleOperator,
	})
	require.NoError(t, err)

	// 1. Disable operator
	disBody := `{"status": "disabled"}`
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/users/%d/status", u.ID), bytes.NewBufferString(disBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify status in DB
	updated, err := f.userSvc.GetUserByID(httptest.NewRequest(http.MethodGet, "/", nil).Context(), u.ID)
	require.NoError(t, err)
	assert.Equal(t, model.UserStatusDisabled, updated.Status)

	// 2. Anti-lockout: disable super admin -> 400
	reqAdmin := httptest.NewRequest(http.MethodPut, "/api/users/1/status", bytes.NewBufferString(disBody))
	reqAdmin.Header.Set("Content-Type", "application/json")
	wAdmin := httptest.NewRecorder()
	f.router.ServeHTTP(wAdmin, reqAdmin)
	assert.Equal(t, http.StatusBadRequest, wAdmin.Code)
	assert.Contains(t, wAdmin.Body.String(), "cannot disable super admin")

	// 3. Non-existent user -> 404
	req404 := httptest.NewRequest(http.MethodPut, "/api/users/99999/status", bytes.NewBufferString(disBody))
	req404.Header.Set("Content-Type", "application/json")
	w404 := httptest.NewRecorder()
	f.router.ServeHTTP(w404, req404)
	assert.Equal(t, http.StatusNotFound, w404.Code)
}

func TestUserHandler_ResetPassword(t *testing.T) {
	f := setupUserTestFixture(t)

	u, err := f.userSvc.CreateUser(httptest.NewRequest(http.MethodGet, "/", nil).Context(), service.CreateUserRequest{
		Username: "op_reset",
		Password: "Password123",
		Role:     model.RoleOperator,
	})
	require.NoError(t, err)

	// 1. Successful reset
	resetBody := `{"new_password": "NewSecretPass456"}`
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/users/%d/reset-password", u.ID), bytes.NewBufferString(resetBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "password reset successfully")

	// 2. Short password -> 400
	shortBody := `{"new_password": "123"}`
	reqShort := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/users/%d/reset-password", u.ID), bytes.NewBufferString(shortBody))
	reqShort.Header.Set("Content-Type", "application/json")
	wShort := httptest.NewRecorder()
	f.router.ServeHTTP(wShort, reqShort)
	assert.Equal(t, http.StatusBadRequest, wShort.Code)

	// 3. Non-existent user -> 404
	req404 := httptest.NewRequest(http.MethodPost, "/api/users/99999/reset-password", bytes.NewBufferString(resetBody))
	req404.Header.Set("Content-Type", "application/json")
	w404 := httptest.NewRecorder()
	f.router.ServeHTTP(w404, req404)
	assert.Equal(t, http.StatusNotFound, w404.Code)
}

func TestUserHandler_Delete(t *testing.T) {
	f := setupUserTestFixture(t)

	u, err := f.userSvc.CreateUser(httptest.NewRequest(http.MethodGet, "/", nil).Context(), service.CreateUserRequest{
		Username: "op_del",
		Password: "Password123",
		Role:     model.RoleOperator,
	})
	require.NoError(t, err)

	// 1. Anti-lockout: delete admin -> 400
	reqAdmin := httptest.NewRequest(http.MethodDelete, "/api/users/1", nil)
	wAdmin := httptest.NewRecorder()
	f.router.ServeHTTP(wAdmin, reqAdmin)
	assert.Equal(t, http.StatusBadRequest, wAdmin.Code)
	assert.Contains(t, wAdmin.Body.String(), "cannot delete super admin")

	// 2. Successful delete
	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/users/%d", u.ID), nil)
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "user deleted successfully")

	// 3. Verify user no longer exists -> 404 on repeat delete
	reqRepeat := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/users/%d", u.ID), nil)
	wRepeat := httptest.NewRecorder()
	f.router.ServeHTTP(wRepeat, reqRepeat)
	assert.Equal(t, http.StatusNotFound, wRepeat.Code)
}
