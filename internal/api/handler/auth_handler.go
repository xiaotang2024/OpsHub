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

// RegisterRequest defines parameters for user registration.
type RegisterRequest struct {
	Username         string `json:"username" binding:"required"`
	Password         string `json:"password" binding:"required"`
	Nickname         string `json:"nickname"`
	Email            string `json:"email"`
	SecurityQuestion string `json:"security_question" binding:"required"`
	SecurityAnswer   string `json:"security_answer" binding:"required"`
}

// ResetPasswordRequest defines parameters for resetting password via security question.
type ResetPasswordRequest struct {
	Username       string `json:"username" binding:"required"`
	SecurityAnswer string `json:"security_answer" binding:"required"`
	NewPassword    string `json:"new_password" binding:"required"`
}

// UpdateProfileRequest defines parameters for updating current user profile.
type UpdateProfileRequest struct {
	Nickname string `json:"nickname"`
	Email    string `json:"email"`
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

	profile, err := h.authService.GetProfile(req.Username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"token": token,
			"user": gin.H{
				"username": req.Username,
				"role":     model.RoleAdmin,
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  profile,
	})
}

// Register creates a new operator account and returns an access token.
// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "all required registration fields must be provided"})
		return
	}

	user, err := h.authService.Register(
		req.Username,
		req.Password,
		req.Nickname,
		req.Email,
		req.SecurityQuestion,
		req.SecurityAnswer,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authService.Login(user.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusCreated, gin.H{
			"message": "registered successfully",
			"user":    user,
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "registered successfully",
		"token":   token,
		"user":    user,
	})
}

// GetSecurityQuestion returns the security question configured for a user.
// GET /api/auth/security-question?username=xxx
func (h *AuthHandler) GetSecurityQuestion(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username parameter is required"})
		return
	}

	question, err := h.authService.GetSecurityQuestion(username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"username":          username,
		"security_question": question,
	})
}

// ResetPassword verifies the security answer and sets a new password.
// POST /api/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username, security_answer, and new_password are required"})
		return
	}

	if err := h.authService.ResetPasswordWithSecurityAnswer(req.Username, req.SecurityAnswer, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password reset successfully"})
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

// GetProfile returns the profile of the currently authenticated user.
// GET /api/auth/profile
func (h *AuthHandler) GetProfile(c *gin.Context) {
	username := middleware.GetUsername(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	profile, err := h.authService.GetProfile(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, profile)
}

// UpdateProfile updates the profile of the currently authenticated user.
// PUT /api/auth/profile
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	username := middleware.GetUsername(c)
	if username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid profile payload"})
		return
	}

	middleware.SetAudit(c, "UPDATE_PROFILE", "user", username, "User updated profile")

	if err := h.authService.UpdateProfile(username, req.Nickname, req.Email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	profile, err := h.authService.GetProfile(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "profile updated successfully"})
		return
	}

	c.JSON(http.StatusOK, profile)
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

	profile, err := h.authService.GetProfile(username)
	if err == nil {
		c.JSON(http.StatusOK, profile)
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
