package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const schemaDDL = `
CREATE TABLE IF NOT EXISTS jdk_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    java_home TEXT NOT NULL,
    bin_path TEXT NOT NULL,
    version_str TEXT,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    default_jdk_id INTEGER,
    install_dir_pattern TEXT NOT NULL,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode TEXT NOT NULL,
    start_cmd TEXT,
    stop_cmd TEXT,
    health_check_config TEXT,
    uninstall_rules TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    template_id INTEGER NOT NULL,
    jdk_id INTEGER,
    install_dir TEXT NOT NULL,
    port INTEGER,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    current_artifact_id INTEGER,
    pid INTEGER DEFAULT 0,
    health_check_config TEXT,
    template_sync_ignored_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES templates(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    version_tag TEXT NOT NULL,
    upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS deploy_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    artifact_id INTEGER,
    action TEXT NOT NULL,
    operator TEXT NOT NULL,
    client_ip TEXT,
    status TEXT NOT NULL,
    output_log TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator TEXT NOT NULL,
    client_ip TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    nickname TEXT DEFAULT '',
    email TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    security_question TEXT DEFAULT '',
    security_answer_hash TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

func InitDB(dbPath string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir failed: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite db failed: %w", err)
	}

	if _, err := db.Exec(schemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("execute schema ddl failed: %w", err)
	}

	if err := migrateUsersTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate users table failed: %w", err)
	}

	if err := migrateServicesTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate services table failed: %w", err)
	}

	return db, nil
}

func migrateServicesTable(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(services)")
	if err != nil {
		return err
	}
	defer rows.Close()

	existingCols := make(map[string]bool)
	for rows.Next() {
		var (
			cid       int
			name      string
			colType   string
			notNull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return err
		}
		existingCols[name] = true
	}

	migrations := []struct {
		colName string
		colDef  string
	}{
		{"health_check_config", "TEXT DEFAULT ''"},
		{"template_sync_ignored_at", "DATETIME"},
	}

	for _, m := range migrations {
		if !existingCols[m.colName] {
			alterSQL := fmt.Sprintf("ALTER TABLE services ADD COLUMN %s %s", m.colName, m.colDef)
			if _, err := db.Exec(alterSQL); err != nil {
				return fmt.Errorf("add column %s failed: %w", m.colName, err)
			}
		}
	}

	return nil
}

func migrateUsersTable(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()

	existingCols := make(map[string]bool)
	for rows.Next() {
		var (
			cid       int
			name      string
			colType   string
			notNull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return err
		}
		existingCols[name] = true
	}

	migrations := []struct {
		colName string
		colDef  string
	}{
		{"nickname", "TEXT DEFAULT ''"},
		{"email", "TEXT DEFAULT ''"},
		{"avatar", "TEXT DEFAULT ''"},
		{"security_question", "TEXT DEFAULT ''"},
		{"security_answer_hash", "TEXT DEFAULT ''"},
		{"updated_at", "DATETIME"},
	}

	for _, m := range migrations {
		if !existingCols[m.colName] {
			alterSQL := fmt.Sprintf("ALTER TABLE users ADD COLUMN %s %s", m.colName, m.colDef)
			if _, err := db.Exec(alterSQL); err != nil {
				return fmt.Errorf("add column %s failed: %w", m.colName, err)
			}
		}
	}

	// Backfill updated_at for existing records where updated_at is NULL
	if _, err := db.Exec("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL"); err != nil {
		return fmt.Errorf("backfill updated_at failed: %w", err)
	}

	return nil
}
