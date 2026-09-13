package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/service"
)

// UserHandler provides administrative endpoints for managing users and permissions.
type UserHandler struct {
	userService *service.UserService
}

// NewUserHandler constructs a new UserHandler.
func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{
		userService: userService,
	}
}

// CreateUserRequest defines parameters for registering a user account.
type CreateUserRequest struct {
	Username    string   `json:"username" binding:"required"`
	Password    string   `json:"password" binding:"required"`
	Nickname    string   `json:"nickname"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

// UpdatePermissionsRequest defines parameters for updating assigned permissions.
type UpdatePermissionsRequest struct {
	Permissions []string `json:"permissions"`
}

// UpdateStatusRequest defines parameters for updating a user's active/disabled status.
type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// AdminResetPasswordRequest defines parameters for forcefully resetting a user's password.
type AdminResetPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required"`
}

// List returns all registered users in the system.
// GET /api/users
func (h *UserHandler) List(c *gin.Context) {
	users, err := h.userService.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

// Create registers a new user with role and permissions.
// POST /api/users
func (h *UserHandler) Create(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userService.CreateUser(c.Request.Context(), service.CreateUserRequest{
		Username:    req.Username,
		Password:    req.Password,
		Nickname:    req.Nickname,
		Email:       req.Email,
		Role:        req.Role,
		Permissions: req.Permissions,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	middleware.SetAudit(c, "CREATE_USER", "user", strconv.FormatInt(user.ID, 10), fmt.Sprintf("Admin created user %s", user.Username))
	c.JSON(http.StatusCreated, user)
}

// UpdatePermissions modifies the permissions granted to a user.
// PUT /api/users/:id/permissions
func (h *UserHandler) UpdatePermissions(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req UpdatePermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	middleware.SetAudit(c, "UPDATE_PERMISSIONS", "user", strconv.FormatInt(id, 10), fmt.Sprintf("Admin updated permissions for user %d", id))

	if err := h.userService.UpdatePermissions(c.Request.Context(), id, req.Permissions); err != nil {
		if errors.Is(err, sqlErrNotFound(err)) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "permissions updated successfully"})
}

// UpdateStatus changes the active or disabled state of a user.
// PUT /api/users/:id/status
func (h *UserHandler) UpdateStatus(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentAdmin := middleware.GetUsername(c)
	middleware.SetAudit(c, "UPDATE_STATUS", "user", strconv.FormatInt(id, 10), fmt.Sprintf("Admin updated user %d status to %s", id, req.Status))

	if err := h.userService.UpdateStatus(c.Request.Context(), id, req.Status, currentAdmin); err != nil {
		if errors.Is(err, sqlErrNotFound(err)) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "status updated successfully"})
}

// ResetPassword forcefully updates a user's password without old password verification.
// POST /api/users/:id/reset-password
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req AdminResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	middleware.SetAudit(c, "RESET_PASSWORD", "user", strconv.FormatInt(id, 10), fmt.Sprintf("Admin reset password for user %d", id))

	if err := h.userService.ResetPassword(c.Request.Context(), id, req.NewPassword); err != nil {
		if errors.Is(err, sqlErrNotFound(err)) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password reset successfully"})
}

// Delete removes a user account from the system.
// DELETE /api/users/:id
func (h *UserHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	currentAdmin := middleware.GetUsername(c)
	middleware.SetAudit(c, "DELETE_USER", "user", strconv.FormatInt(id, 10), fmt.Sprintf("Admin deleted user %d", id))

	if err := h.userService.DeleteUser(c.Request.Context(), id, currentAdmin); err != nil {
		if errors.Is(err, sqlErrNotFound(err)) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted successfully"})
}

func sqlErrNotFound(err error) error {
	if err != nil && strings.Contains(err.Error(), "user not found") {
		return err
	}
	return nil
}
