package database_test

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/go-sql-driver/mysql"
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
		nickname, email, avatar, secQ, secA sql.NullString
		updatedAt                           sql.NullTime
	)
	err = newDb.QueryRow(
		"SELECT nickname, email, avatar, security_question, security_answer_hash, updated_at FROM users WHERE username = 'legacy_admin'",
	).Scan(&nickname, &email, &avatar, &secQ, &secA, &updatedAt)
	require.NoError(t, err)
	assert.True(t, updatedAt.Valid, "updated_at should be backfilled from created_at")
}

func TestInitDB_MigrateOldServicesTable(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "legacy_services.db")

	oldDb, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)

	_, err = oldDb.Exec(`
		CREATE TABLE templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			type TEXT NOT NULL,
			install_dir_pattern TEXT NOT NULL,
			supervision_mode TEXT NOT NULL
		);
		CREATE TABLE services (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			template_id INTEGER NOT NULL,
			install_dir TEXT NOT NULL,
			supervision_mode TEXT NOT NULL,
			status TEXT NOT NULL
		);
		INSERT INTO templates (name, type, install_dir_pattern, supervision_mode) VALUES ('t1', 'java_jar', '/opt/apps/t1', 'native');
		INSERT INTO services (name, template_id, install_dir, supervision_mode, status) VALUES ('s1', 1, '/opt/apps/s1', 'native', 'STOPPED');
	`)
	require.NoError(t, err)
	oldDb.Close()

	newDb, err := database.InitDB(dbPath)
	require.NoError(t, err, "migration of old services table should succeed")
	defer newDb.Close()

	var (
		hcConfig   sql.NullString
		syncIgnore sql.NullTime
	)
	err = newDb.QueryRow("SELECT health_check_config, template_sync_ignored_at FROM services WHERE name = 's1'").Scan(&hcConfig, &syncIgnore)
	require.NoError(t, err)
	assert.Equal(t, "", hcConfig.String)
	assert.False(t, syncIgnore.Valid)
}


func TestInitDBWithDriver_SQLite(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "driver_test.db")

	db, err := database.InitDBWithDriver("sqlite", dbPath)
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

func TestInitDBWithDriver_EmptyDriverDefaultsSQLite(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "empty_driver.db")

	db, err := database.InitDBWithDriver("", dbPath)
	require.NoError(t, err)
	defer db.Close()

	var name string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").Scan(&name)
	require.NoError(t, err)
	assert.Equal(t, "users", name)
}

func TestInitDBWithDriver_UnsupportedDriver(t *testing.T) {
	_, err := database.InitDBWithDriver("postgres", "host=localhost")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported database driver")
}

func TestInitDBWithDriver_MySQLEmptyDSN(t *testing.T) {
	_, err := database.InitDBWithDriver("mysql", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "mysql DSN must not be empty")
}

func TestIsUniqueViolation(t *testing.T) {
	assert.False(t, database.IsUniqueViolation(nil), "nil error is not a violation")
	assert.False(t, database.IsUniqueViolation(errors.New("table not found")), "unrelated error is not a violation")

	// SQLite error patterns
	assert.True(t, database.IsUniqueViolation(errors.New("UNIQUE constraint failed: services.name")))
	assert.True(t, database.IsUniqueViolation(errors.New("unique constraint failed: templates.name")))

	// MySQL string error patterns
	assert.True(t, database.IsUniqueViolation(errors.New("Error 1062 (23000): Duplicate entry 'nginx' for key 'services.name'")))
	assert.True(t, database.IsUniqueViolation(errors.New("duplicate entry 'admin' for key 'PRIMARY'")))

	// MySQL typed error
	mysqlTypedErr := &mysql.MySQLError{
		Number:  1062,
		Message: "Duplicate entry 'test' for key 'name'",
	}
	assert.True(t, database.IsUniqueViolation(mysqlTypedErr))

	// Other MySQL error
	mysqlOtherErr := &mysql.MySQLError{
		Number:  1146,
		Message: "Table 'test' doesn't exist",
	}
	assert.False(t, database.IsUniqueViolation(mysqlOtherErr))
}


