package handler

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/model"
	"opshub/internal/service"
)

// JDKHandler manages JDK asset endpoints.
type JDKHandler struct {
	jdkService *service.JDKService
}

// NewJDKHandler constructs a new JDKHandler.
func NewJDKHandler(jdkService *service.JDKService) *JDKHandler {
	return &JDKHandler{
		jdkService: jdkService,
	}
}

// CreateJDKRequest represents parameters for registering a new JDK.
type CreateJDKRequest struct {
	Name       string `json:"name" binding:"required"`
	JavaHome   string `json:"java_home" binding:"required"`
	BinPath    string `json:"bin_path"`
	VersionStr string `json:"version_str"`
	IsSystem   bool   `json:"is_system"`
}

// List returns all registered JDK assets.
// GET /api/jdks
func (h *JDKHandler) List(c *gin.Context) {
	list, err := h.jdkService.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// GetByID returns details of a single JDK asset.
// GET /api/jdks/:id
func (h *JDKHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid jdk id"})
		return
	}

	asset, err := h.jdkService.GetByID(id)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "jdk asset not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, asset)
}

// Create registers a new JDK asset.
// POST /api/jdks
func (h *JDKHandler) Create(c *gin.Context) {
	var req CreateJDKRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	binPath := strings.TrimSpace(req.BinPath)
	if binPath == "" {
		candidate1 := filepath.Join(req.JavaHome, "bin", "java")
		candidate2 := filepath.Join(req.JavaHome, "Contents", "Home", "bin", "java")
		if _, err := os.Stat(candidate1); err == nil {
			binPath = candidate1
		} else if _, err := os.Stat(candidate2); err == nil {
			binPath = candidate2
		} else {
			binPath = candidate1
		}
	}

	versionStr := strings.TrimSpace(req.VersionStr)
	if versionStr == "" {
		versionStr = "unknown"
	}

	asset := &model.JDKAsset{
		Name:       strings.TrimSpace(req.Name),
		JavaHome:   strings.TrimSpace(req.JavaHome),
		BinPath:    binPath,
		VersionStr: versionStr,
		IsSystem:   req.IsSystem,
	}

	if err := h.jdkService.Register(asset); err != nil {
		if errors.Is(err, service.ErrAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	middleware.SetAudit(c, "CREATE", "jdk", strconv.FormatInt(asset.ID, 10), fmt.Sprintf("Registered JDK %s (%s)", asset.Name, asset.JavaHome))
	c.JSON(http.StatusCreated, asset)
}

// Delete removes a registered JDK asset.
// DELETE /api/jdks/:id
func (h *JDKHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid jdk id"})
		return
	}

	middleware.SetAudit(c, "DELETE", "jdk", strconv.FormatInt(id, 10), fmt.Sprintf("Deleted JDK asset %d", id))

	if err := h.jdkService.Delete(id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "jdk asset not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "jdk asset deleted"})
}

// Scan searches the local machine for installed JDKs.
// GET /api/jdks/scan
func (h *JDKHandler) Scan(c *gin.Context) {
	discovered, err := h.jdkService.ScanSystemJDKs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, discovered)
}
