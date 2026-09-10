package service_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
	"opshub/internal/service"
)

func TestArtifactService_SaveAndGet(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	// Seed service
	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (1, 'tpl', 'java_jar', '/opt/app', 'native')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'my-svc', 1, '/opt/app', 'native', 'STOPPED')`)
	require.NoError(t, err)

	pkgBaseDir := filepath.Join(tmpDir, "packages")
	svc := service.NewArtifactService(db, pkgBaseDir, 5)

	content := []byte("PK-my-service-test-jar-bytes-12345")
	hasher := sha256.New()
	hasher.Write(content)
	expectedSHA := hex.EncodeToString(hasher.Sum(nil))

	art, err := svc.SaveArtifact(context.Background(), 1, "my-svc-1.0.jar", bytes.NewReader(content), "v1.0")
	require.NoError(t, err)
	assert.Greater(t, art.ID, int64(0))
	assert.Equal(t, int64(1), art.ServiceID)
	assert.Equal(t, "my-svc-1.0.jar", art.Filename)
	assert.Equal(t, int64(len(content)), art.FileSize)
	assert.Equal(t, expectedSHA, art.SHA256)
	assert.Equal(t, "v1.0", art.VersionTag)
	assert.FileExists(t, art.StoragePath)

	// Fetch by ID
	fetched, err := svc.GetByID(context.Background(), art.ID)
	require.NoError(t, err)
	assert.Equal(t, art.ID, fetched.ID)
	assert.Equal(t, art.Filename, fetched.Filename)
	assert.Equal(t, expectedSHA, fetched.SHA256)

	// List by service ID
	list, err := svc.ListByServiceID(context.Background(), 1)
	require.NoError(t, err)
	assert.Len(t, list, 1)
	assert.Equal(t, art.ID, list[0].ID)
}

func TestArtifactService_RetentionLimit(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (1, 'tpl', 'java_jar', '/opt/app', 'native')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'retention-svc', 1, '/opt/app', 'native', 'STOPPED')`)
	require.NoError(t, err)

	pkgBaseDir := filepath.Join(tmpDir, "packages")
	// Set retention limit to 3
	svc := service.NewArtifactService(db, pkgBaseDir, 3)

	var createdPaths []string
	var createdIDs []int64
	for i := 1; i <= 5; i++ {
		content := []byte("version-" + string(rune('0'+i)))
		art, err := svc.SaveArtifact(context.Background(), 1, "app.jar", bytes.NewReader(content), "v"+string(rune('0'+i)))
		require.NoError(t, err)
		createdPaths = append(createdPaths, art.StoragePath)
		createdIDs = append(createdIDs, art.ID)
	}

	// Should only retain 3 latest artifacts (IDs: 3, 4, 5)
	list, err := svc.ListByServiceID(context.Background(), 1)
	require.NoError(t, err)
	assert.Len(t, list, 3)

	// Verify older files on disk are removed
	assert.NoFileExists(t, createdPaths[0])
	assert.NoFileExists(t, createdPaths[1])

	// Verify newest files on disk still exist
	assert.FileExists(t, createdPaths[2])
	assert.FileExists(t, createdPaths[3])
	assert.FileExists(t, createdPaths[4])
}

func TestArtifactService_RetentionPreservesActiveArtifact(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (1, 'tpl', 'java_jar', '/opt/app', 'native')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'preserve-svc', 1, '/opt/app', 'native', 'STOPPED')`)
	require.NoError(t, err)

	pkgBaseDir := filepath.Join(tmpDir, "packages")
	svc := service.NewArtifactService(db, pkgBaseDir, 2)

	// Save artifact 1
	art1, err := svc.SaveArtifact(context.Background(), 1, "v1.jar", bytes.NewReader([]byte("v1")), "v1.0")
	require.NoError(t, err)

	// Mark artifact 1 as currently deployed in services table
	_, err = db.Exec(`UPDATE services SET current_artifact_id = ? WHERE id = 1`, art1.ID)
	require.NoError(t, err)

	// Save artifact 2 and 3 (retention limit is 2)
	art2, err := svc.SaveArtifact(context.Background(), 1, "v2.jar", bytes.NewReader([]byte("v2")), "v2.0")
	require.NoError(t, err)
	art3, err := svc.SaveArtifact(context.Background(), 1, "v3.jar", bytes.NewReader([]byte("v3")), "v3.0")
	require.NoError(t, err)

	// Art1 is currently deployed so its physical file should NOT be deleted!
	assert.FileExists(t, art1.StoragePath)
	assert.FileExists(t, art2.StoragePath)
	assert.FileExists(t, art3.StoragePath)
}

func TestArtifactService_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.InitDB(filepath.Join(tmpDir, "test.db"))
	require.NoError(t, err)
	defer db.Close()

	_, err = db.Exec(`INSERT INTO templates (id, name, type, install_dir_pattern, supervision_mode) 
		VALUES (1, 'tpl', 'java_jar', '/opt/app', 'native')`)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO services (id, name, template_id, install_dir, supervision_mode, status) 
		VALUES (1, 'del-svc', 1, '/opt/app', 'native', 'STOPPED')`)
	require.NoError(t, err)

	pkgBaseDir := filepath.Join(tmpDir, "packages")
	svc := service.NewArtifactService(db, pkgBaseDir, 10)

	art, err := svc.SaveArtifact(context.Background(), 1, "app.jar", bytes.NewReader([]byte("bytes")), "v1")
	require.NoError(t, err)

	// Mark as current deployed -> delete should fail
	_, err = db.Exec(`UPDATE services SET current_artifact_id = ? WHERE id = 1`, art.ID)
	require.NoError(t, err)

	err = svc.Delete(context.Background(), art.ID)
	require.Error(t, err)
	assert.ErrorIs(t, err, service.ErrArtifactInUse)

	// Unmark as current deployed -> delete should succeed
	_, err = db.Exec(`UPDATE services SET current_artifact_id = NULL WHERE id = 1`)
	require.NoError(t, err)

	err = svc.Delete(context.Background(), art.ID)
	require.NoError(t, err)
	assert.NoFileExists(t, art.StoragePath)

	_, err = svc.GetByID(context.Background(), art.ID)
	require.ErrorIs(t, err, service.ErrArtifactNotFound)
}
