package database_test

import (
	"database/sql"
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

func TestInitDB_ForeignKeysEnforced(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := database.InitDB(dbPath)
	require.NoError(t, err)
	defer db.Close()

	// Verify foreign_keys pragma is ON
	var fkEnabled int
	err = db.QueryRow("PRAGMA foreign_keys").Scan(&fkEnabled)
	require.NoError(t, err)
	assert.Equal(t, 1, fkEnabled)

	// Attempt to insert a service referencing a non-existent template_id
	_, err = db.Exec(`INSERT INTO services (name, template_id, install_dir, supervision_mode, status) 
		VALUES ('orphan-svc', 999999, '/opt/apps/orphan', 'native', 'STOPPED')`)
	require.Error(t, err, "inserting record with invalid foreign key should fail")
}

func TestInitDB_MigrateOldUsersTable(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "old.db")

	// 1. Create a database with the old schema (before adding nickname, email, security columns, updated_at)
	oldDb, err := database.InitDB(dbPath)
	require.NoError(t, err)

	// Recreate table with old columns only
	_, err = oldDb.Exec(`
		DROP TABLE users;
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'admin',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		INSERT INTO users (username, password_hash, role) VALUES ('legacy_admin', 'hash123', 'admin');
	`)
	require.NoError(t, err)
	oldDb.Close()

	// 2. Run InitDB on the existing database; migration must succeed without SQL logic errors
	newDb, err := database.InitDB(dbPath)
	require.NoError(t, err, "migration of old users table should succeed")
	defer newDb.Close()

	// 3. Verify that new columns exist and can be queried
	var (
		nickname, email, secQ, secA sql.NullString
		updatedAt                   sql.NullTime
	)
	err = newDb.QueryRow(
		"SELECT nickname, email, security_question, security_answer_hash, updated_at FROM users WHERE username = 'legacy_admin'",
	).Scan(&nickname, &email, &secQ, &secA, &updatedAt)
	require.NoError(t, err)
	assert.True(t, updatedAt.Valid, "updated_at should be backfilled from created_at")
}


