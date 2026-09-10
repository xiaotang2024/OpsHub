package database_test

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"opshub/internal/database"
)

func TestInitDB_CreatesTables(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db.Close()

	tables := []string{"jdk_assets", "templates", "services", "artifacts", "deploy_records", "audit_logs", "users"}
	for _, table := range tables {
		var name string
		err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
		require.NoError(t, err, "table %s should exist", table)
		assert.Equal(t, table, name)
	}
}

func TestInitDB_NestedDirCreation(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "nested", "sub", "test.db")

	db, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db.Close()

	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").Scan(&name)
	require.NoError(t, err)
	assert.Equal(t, "users", name)
}

func TestInitDB_Idempotent(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db1, err := database.InitDB(dbPath)
	require.NoError(t, err)
	db1.Close()

	db2, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db2.Close()

	var count int
	err = db2.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table'").Scan(&count)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, 7)
}
