package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opshub/internal/model"
)

var (
	// ErrArtifactNotFound indicates the requested artifact was not found.
	ErrArtifactNotFound = errors.New("artifact not found")

	// ErrArtifactInUse indicates the artifact is currently deployed and cannot be deleted.
	ErrArtifactInUse = errors.New("artifact is currently deployed")
)

// ArtifactService manages package uploads, checksum validation, metadata persistence,
// and artifact retention policies.
type ArtifactService struct {
	db           *sql.DB
	packagesDir  string
	maxRetention int
}

// NewArtifactService creates a new ArtifactService.
// If maxRetention is not specified or <= 0, a default limit of 10 is used.
func NewArtifactService(db *sql.DB, packagesDir string, maxRetention ...int) *ArtifactService {
	retention := 10
	if len(maxRetention) > 0 && maxRetention[0] > 0 {
		retention = maxRetention[0]
	}
	if strings.TrimSpace(packagesDir) == "" {
		packagesDir = filepath.Join(".", "data", "packages")
	}

	return &ArtifactService{
		db:           db,
		packagesDir:  packagesDir,
		maxRetention: retention,
	}
}

// PackagesDir returns the base directory where packages are stored.
func (s *ArtifactService) PackagesDir() string {
	return s.packagesDir
}

// MaxRetention returns the configured maximum artifact retention limit per service.
func (s *ArtifactService) MaxRetention() int {
	return s.maxRetention
}

// SetMaxRetention adjusts the retention limit.
func (s *ArtifactService) SetMaxRetention(limit int) {
	if limit > 0 {
		s.maxRetention = limit
	}
}

// SaveArtifact streams package data from reader, calculates SHA-256 hash, saves to packages/<service_name>/,
// records artifact metadata into SQLite, and enforces retention limits.
func (s *ArtifactService) SaveArtifact(ctx context.Context, serviceID int64, filename string, r io.Reader, versionTag string) (*model.Artifact, error) {
	if s.db == nil {
		return nil, errors.New("database connection is nil")
	}
	if r == nil {
		return nil, errors.New("reader cannot be nil")
	}

	cleanFilename := filepath.Base(strings.TrimSpace(filename))
	if cleanFilename == "" || cleanFilename == "." || cleanFilename == "/" {
		return nil, errors.New("invalid artifact filename")
	}

	// 1. Verify service exists and fetch service name
	var serviceName string
	err := s.db.QueryRowContext(ctx, "SELECT name FROM services WHERE id = ?", serviceID).Scan(&serviceName)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("service with id %d not found", serviceID)
		}
		return nil, fmt.Errorf("query service failed: %w", err)
	}

	// 2. Prepare destination directory: packages/<service_name>/
	svcPkgDir := filepath.Join(s.packagesDir, serviceName)
	if err := os.MkdirAll(svcPkgDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create packages directory %s: %w", svcPkgDir, err)
	}

	// Generate version tag if omitted
	now := time.Now().UTC()
	if strings.TrimSpace(versionTag) == "" {
		versionTag = fmt.Sprintf("v%s", now.Format("20060102150405"))
	}

	// Target storage path
	var destFilename string
	if strings.HasPrefix(cleanFilename, versionTag) {
		destFilename = cleanFilename
	} else {
		destFilename = fmt.Sprintf("%s_%s", versionTag, cleanFilename)
	}
	destPath := filepath.Join(svcPkgDir, destFilename)

	// 3. Stream content to disk while calculating SHA-256 and byte count
	tmpFile, err := os.CreateTemp(svcPkgDir, ".upload-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary upload file: %w", err)
	}
	tmpFilePath := tmpFile.Name()

	hasher := sha256.New()
	tee := io.TeeReader(r, hasher)

	written, copyErr := io.Copy(tmpFile, tee)
	closeErr := tmpFile.Close()

	if copyErr != nil {
		_ = os.Remove(tmpFilePath)
		return nil, fmt.Errorf("failed to write upload stream: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmpFilePath)
		return nil, fmt.Errorf("failed to close upload file: %w", closeErr)
	}

	// Rename temp file to destination path
	if err := os.Rename(tmpFilePath, destPath); err != nil {
		_ = os.Remove(tmpFilePath)
		return nil, fmt.Errorf("failed to persist artifact to %s: %w", destPath, err)
	}

	sha256Checksum := hex.EncodeToString(hasher.Sum(nil))

	// 4. Record into artifacts table
	query := `
		INSERT INTO artifacts (service_id, filename, file_size, sha256, storage_path, version_tag, upload_time)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	res, err := s.db.ExecContext(ctx, query,
		serviceID,
		cleanFilename,
		written,
		sha256Checksum,
		destPath,
		versionTag,
		now,
	)
	if err != nil {
		_ = os.Remove(destPath)
		return nil, fmt.Errorf("failed to insert artifact record: %w", err)
	}

	artifactID, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get artifact last insert id: %w", err)
	}

	artifact := &model.Artifact{
		ID:          artifactID,
		ServiceID:   serviceID,
		Filename:    cleanFilename,
		FileSize:    written,
		SHA256:      sha256Checksum,
		StoragePath: destPath,
		VersionTag:  versionTag,
		UploadTime:  now,
	}

	// 5. Enforce retention limits
	_ = s.EnforceRetention(ctx, serviceID)

	return artifact, nil
}

// GetByID fetches an artifact record by ID.
func (s *ArtifactService) GetByID(ctx context.Context, id int64) (*model.Artifact, error) {
	query := `
		SELECT id, service_id, filename, file_size, sha256, storage_path, version_tag, upload_time
		FROM artifacts
		WHERE id = ?
	`
	var a model.Artifact
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&a.ID,
		&a.ServiceID,
		&a.Filename,
		&a.FileSize,
		&a.SHA256,
		&a.StoragePath,
		&a.VersionTag,
		&a.UploadTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrArtifactNotFound
		}
		return nil, fmt.Errorf("get artifact %d failed: %w", id, err)
	}
	return &a, nil
}

// ListByServiceID returns all artifacts associated with a service, newest first.
func (s *ArtifactService) ListByServiceID(ctx context.Context, serviceID int64) ([]model.Artifact, error) {
	query := `
		SELECT id, service_id, filename, file_size, sha256, storage_path, version_tag, upload_time
		FROM artifacts
		WHERE service_id = ?
		ORDER BY id DESC
	`
	rows, err := s.db.QueryContext(ctx, query, serviceID)
	if err != nil {
		return nil, fmt.Errorf("query artifacts failed: %w", err)
	}
	defer rows.Close()

	list := make([]model.Artifact, 0)
	for rows.Next() {
		var a model.Artifact
		if err := rows.Scan(
			&a.ID,
			&a.ServiceID,
			&a.Filename,
			&a.FileSize,
			&a.SHA256,
			&a.StoragePath,
			&a.VersionTag,
			&a.UploadTime,
		); err != nil {
			return nil, fmt.Errorf("scan artifact failed: %w", err)
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

// Delete removes an artifact from disk and database, protecting against deleting the currently deployed version.
func (s *ArtifactService) Delete(ctx context.Context, id int64) error {
	artifact, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check if this artifact is currently deployed
	var currentArtifactID sql.NullInt64
	err = s.db.QueryRowContext(ctx, "SELECT current_artifact_id FROM services WHERE id = ?", artifact.ServiceID).Scan(&currentArtifactID)
	if err == nil && currentArtifactID.Valid && currentArtifactID.Int64 == id {
		return ErrArtifactInUse
	}

	// Remove physical file
	_ = os.Remove(artifact.StoragePath)

	// Remove DB record
	res, err := s.db.ExecContext(ctx, "DELETE FROM artifacts WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete artifact %d failed: %w", id, err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrArtifactNotFound
	}

	return nil
}

// EnforceRetention deletes artifacts exceeding the retention limit for a service,
// keeping the latest N artifacts while preserving any active deployed artifact.
func (s *ArtifactService) EnforceRetention(ctx context.Context, serviceID int64) error {
	if s.maxRetention <= 0 {
		return nil
	}

	artifacts, err := s.ListByServiceID(ctx, serviceID)
	if err != nil {
		return err
	}

	if len(artifacts) <= s.maxRetention {
		return nil
	}

	var currentArtifactID sql.NullInt64
	_ = s.db.QueryRowContext(ctx, "SELECT current_artifact_id FROM services WHERE id = ?", serviceID).Scan(&currentArtifactID)

	// Artifacts beyond the retention threshold (ordered descending by ID)
	candidates := artifacts[s.maxRetention:]
	for _, a := range candidates {
		// Do not prune the currently deployed artifact
		if currentArtifactID.Valid && currentArtifactID.Int64 == a.ID {
			continue
		}

		_ = os.Remove(a.StoragePath)
		_, _ = s.db.ExecContext(ctx, "DELETE FROM artifacts WHERE id = ?", a.ID)
	}

	return nil
}
