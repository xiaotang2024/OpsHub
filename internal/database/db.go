package database

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

// --------------------------------------------------------------------------
// Schema DDL — SQLite
// --------------------------------------------------------------------------

const sqliteSchemaDDL = `
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

// --------------------------------------------------------------------------
// Schema DDL — MySQL
// --------------------------------------------------------------------------

var mysqlSchemaDDL = []string{
	`CREATE TABLE IF NOT EXISTS jdk_assets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    java_home VARCHAR(512) NOT NULL,
    bin_path VARCHAR(512) NOT NULL,
    version_str VARCHAR(255),
    is_system TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    default_jdk_id INT,
    install_dir_pattern VARCHAR(512) NOT NULL,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode VARCHAR(50) NOT NULL,
    start_cmd TEXT,
    stop_cmd TEXT,
    health_check_config TEXT,
    uninstall_rules TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    template_id INT NOT NULL,
    jdk_id INT,
    install_dir VARCHAR(512) NOT NULL,
    port INT,
    jvm_options TEXT,
    env_vars TEXT,
    supervision_mode VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    current_artifact_id INT,
    pid INT DEFAULT 0,
    health_check_config TEXT,
    template_sync_ignored_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS artifacts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    service_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    version_tag VARCHAR(255) NOT NULL,
    upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS deploy_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    service_id INT NOT NULL,
    artifact_id INT,
    action VARCHAR(100) NOT NULL,
    operator VARCHAR(255) NOT NULL,
    client_ip VARCHAR(45),
    status VARCHAR(50) NOT NULL,
    output_log LONGTEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    operator VARCHAR(255) NOT NULL,
    client_ip VARCHAR(45),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    details TEXT,
    status VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

	`CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    nickname VARCHAR(255) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    avatar LONGTEXT,
    security_question VARCHAR(512) DEFAULT '',
    security_answer_hash VARCHAR(255) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

// InitDB initialises a SQLite database at dbPath.
// Retained for backward compatibility (tests, legacy callers).
func InitDB(dbPath string) (*sql.DB, error) {
	return initSQLite(dbPath)
}

// InitDBWithDriver initialises a database using the specified driver and DSN.
// Supported drivers: "sqlite" (default), "mysql".
func InitDBWithDriver(driver, dsn string) (*sql.DB, error) {
	switch strings.ToLower(driver) {
	case "mysql":
		return initMySQL(dsn)
	case "sqlite", "":
		return initSQLite(dsn)
	default:
		return nil, fmt.Errorf("unsupported database driver: %q (supported: sqlite, mysql)", driver)
	}
}

// IsUniqueViolation checks whether an error is caused by a unique constraint or duplicate key violation
// across both SQLite ("UNIQUE constraint failed") and MySQL (error 1062 / "Duplicate entry").
func IsUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "unique constraint failed") ||
		strings.Contains(msg, "duplicate entry") ||
		strings.Contains(msg, "1062") {
		return true
	}
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
		return true
	}
	return false
}

// --------------------------------------------------------------------------
// SQLite initialisation
// --------------------------------------------------------------------------

func initSQLite(dbPath string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir failed: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite db failed: %w", err)
	}

	if _, err := db.Exec(sqliteSchemaDDL); err != nil {
		db.Close()
		return nil, fmt.Errorf("execute schema ddl failed: %w", err)
	}

	if err := migrateSQLiteUsersTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate users table failed: %w", err)
	}

	if err := migrateSQLiteServicesTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate services table failed: %w", err)
	}

	return db, nil
}

// --------------------------------------------------------------------------
// MySQL initialisation
// --------------------------------------------------------------------------

func initMySQL(dsn string) (*sql.DB, error) {
	if dsn == "" {
		return nil, fmt.Errorf("mysql DSN must not be empty; set database.dsn in config")
	}

	// Ensure parseTime is in the DSN so time.Time scanning works correctly
	if !strings.Contains(dsn, "parseTime") {
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		dsn = dsn + sep + "parseTime=True"
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open mysql db failed: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect to mysql failed: %w", err)
	}

	// Execute each CREATE TABLE individually (MySQL does not support multi-statement by default)
	for _, ddl := range mysqlSchemaDDL {
		if _, err := db.Exec(ddl); err != nil {
			db.Close()
			return nil, fmt.Errorf("execute mysql schema ddl failed: %w\nDDL: %s", err, ddl)
		}
	}

	if err := migrateMySQLUsersTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate users table failed: %w", err)
	}

	if err := migrateMySQLServicesTable(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate services table failed: %w", err)
	}

	return db, nil
}

// --------------------------------------------------------------------------
// SQLite migration helpers
// --------------------------------------------------------------------------

func migrateSQLiteServicesTable(db *sql.DB) error {
	existingCols, err := sqliteTableColumns(db, "services")
	if err != nil {
		return err
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

func migrateSQLiteUsersTable(db *sql.DB) error {
	existingCols, err := sqliteTableColumns(db, "users")
	if err != nil {
		return err
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

func sqliteTableColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols := make(map[string]bool)
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
			return nil, err
		}
		cols[name] = true
	}
	return cols, nil
}

// --------------------------------------------------------------------------
// MySQL migration helpers
// --------------------------------------------------------------------------

func migrateMySQLServicesTable(db *sql.DB) error {
	existingCols, err := mysqlTableColumns(db, "services")
	if err != nil {
		return err
	}

	migrations := []struct {
		colName string
		colDef  string
	}{
		{"health_check_config", "TEXT"},
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

func migrateMySQLUsersTable(db *sql.DB) error {
	existingCols, err := mysqlTableColumns(db, "users")
	if err != nil {
		return err
	}

	migrations := []struct {
		colName string
		colDef  string
	}{
		{"nickname", "VARCHAR(255) DEFAULT ''"},
		{"email", "VARCHAR(255) DEFAULT ''"},
		{"avatar", "LONGTEXT"},
		{"security_question", "VARCHAR(512) DEFAULT ''"},
		{"security_answer_hash", "VARCHAR(255) DEFAULT ''"},
		{"updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
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

func mysqlTableColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(
		"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
		table,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		cols[name] = true
	}
	return cols, nil
}
