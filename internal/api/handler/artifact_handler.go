package handler

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"opshub/internal/api/middleware"
	"opshub/internal/service"
)

// ArtifactHandler manages artifact upload, listing, and removal.
type ArtifactHandler struct {
	artifactService *service.ArtifactService
	db              *sql.DB
}

// NewArtifactHandler constructs a new ArtifactHandler.
func NewArtifactHandler(artifactService *service.ArtifactService, db *sql.DB) *ArtifactHandler {
	return &ArtifactHandler{
		artifactService: artifactService,
		db:              db,
	}
}

// Upload handles multipart package upload for a service.
// POST /api/services/:id/artifacts
func (h *ArtifactHandler) Upload(c *gin.Context) {
	serviceID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file form field is required"})
		return
	}
	defer file.Close()

	versionTag := strings.TrimSpace(c.PostForm("version_tag"))

	artifact, err := h.artifactService.SaveArtifact(c.Request.Context(), serviceID, header.Filename, file, versionTag)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save artifact: " + err.Error()})
		return
	}

	middleware.SetAudit(c, "UPLOAD_ARTIFACT", "service", strconv.FormatInt(serviceID, 10), fmt.Sprintf("Uploaded artifact %s (tag: %s)", header.Filename, artifact.VersionTag))

	c.JSON(http.StatusCreated, artifact)
}

// ListByService returns all package versions for a service.
// GET /api/services/:id/artifacts
func (h *ArtifactHandler) ListByService(c *gin.Context) {
	serviceID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid service id"})
		return
	}

	artifacts, err := h.artifactService.ListByServiceID(c.Request.Context(), serviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list artifacts: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, artifacts)
}

// Delete removes an artifact package version.
// DELETE /api/services/:id/artifacts/:artifactId
// DELETE /api/artifacts/:id
func (h *ArtifactHandler) Delete(c *gin.Context) {
	artifactIDStr := c.Param("artifactId")
	if artifactIDStr == "" {
		artifactIDStr = c.Param("id")
	}

	artifactID, err := strconv.ParseInt(artifactIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid artifact id"})
		return
	}

	middleware.SetAudit(c, "DELETE_ARTIFACT", "artifact", strconv.FormatInt(artifactID, 10), fmt.Sprintf("Deleted artifact %d", artifactID))

	if err := h.artifactService.Delete(c.Request.Context(), artifactID); err != nil {
		if errors.Is(err, service.ErrArtifactNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "artifact not found"})
			return
		}
		if errors.Is(err, service.ErrArtifactInUse) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete currently deployed artifact"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "artifact deleted successfully"})
}
