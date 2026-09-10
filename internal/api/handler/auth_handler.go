package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/model"
	"opshub/internal/service"
)

// AuthHandler handles authentication, password change, and current user profile.
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler constructs a new AuthHandler.
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// LoginRequest defines credentials submitted for authentication.
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// ChangePasswordRequest defines parameters for updating a user password.
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// Login validates user credentials and returns a JWT access token.
// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password are required"})
		return
	}

	token, err := h.authService.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"username": req.Username,
			"role":     model.RoleAdmin,
		},
	})
}

// ChangePassword updates the authenticated user's password.
// POST /api/auth/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old_password and new_password are required"})
		return
	}

	username := middleware.GetUsername(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	middleware.SetAudit(c, "CHANGE_PASSWORD", "user", username, "User changed password")

	if err := h.authService.ChangePassword(username, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated successfully"})
}

// Me returns the identity and role of the currently authenticated user.
// GET /api/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	username := middleware.GetUsername(c)
	role := middleware.GetRole(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if role == "" {
		role = model.RoleAdmin
	}

	c.JSON(http.StatusOK, gin.H{
		"username": username,
		"role":     role,
	})
}
