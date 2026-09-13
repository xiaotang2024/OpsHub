package model

import "time"

// Template types
const (
	TemplateTypeJavaJar        = "java_jar"
	TemplateTypeJavaWar        = "java_war"
	TemplateTypeGenericArchive = "generic_archive"
)

// Supervision modes
const (
	SupervisionModeNative  = "native"
	SupervisionModeSystemd = "systemd"
)

// Service statuses
const (
	ServiceStatusStopped     = "STOPPED"
	ServiceStatusStarting    = "STARTING"
	ServiceStatusRunning     = "RUNNING"
	ServiceStatusUnhealthy   = "UNHEALTHY"
	ServiceStatusStopping    = "STOPPING"
	ServiceStatusFailed      = "FAILED"
	ServiceStatusUninstalled = "UNINSTALLED"
)

// Deploy/Audit actions
const (
	ActionDeploy     = "DEPLOY"
	ActionRollback   = "ROLLBACK"
	ActionStart      = "START"
	ActionStop       = "STOP"
	ActionRestart    = "RESTART"
	ActionUninstall  = "UNINSTALL"
	ActionConfigEdit = "CONFIG_EDIT"
)

// Deploy execution status
const (
	DeployStatusSuccess = "SUCCESS"
	DeployStatusFailed  = "FAILED"
)

// User roles
const (
	RoleAdmin    = "admin"
	RoleOperator = "operator"

	UserStatusActive   = "active"
	UserStatusDisabled = "disabled"

	PermServiceView     = "service:view"
	PermServiceControl  = "service:control"
	PermServiceDeploy   = "service:deploy"
	PermServiceRollback = "service:rollback"
	PermServiceConfig   = "service:config"
	PermServiceManage   = "service:manage"
	PermTemplateManage  = "template:manage"
	PermJDKManage       = "jdk:manage"
	PermAuditView       = "audit:view"
)

var DefaultOperatorPermissions = []string{
	PermServiceView,
	PermServiceControl,
	PermServiceDeploy,
	PermServiceRollback,
	PermServiceConfig,
	PermAuditView,
}

// User represents an authenticated operator or administrator.
type User struct {
	ID                 int64     `json:"id" db:"id"`
	Username           string    `json:"username" db:"username"`
	PasswordHash       string    `json:"-" db:"password_hash"`
	Role               string    `json:"role" db:"role"`
	Permissions        []string  `json:"permissions" db:"permissions"`
	Status             string    `json:"status" db:"status"`
	Nickname           string    `json:"nickname" db:"nickname"`
	Email              string    `json:"email" db:"email"`
	Avatar             string    `json:"avatar" db:"avatar"`
	SecurityQuestion   string    `json:"security_question,omitempty" db:"security_question"`
	SecurityAnswerHash string    `json:"-" db:"security_answer_hash"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

// JDKAsset represents a registered or discovered JDK installation.
type JDKAsset struct {
	ID         int64     `json:"id" db:"id"`
	Name       string    `json:"name" db:"name"`
	JavaHome   string    `json:"java_home" db:"java_home"`
	BinPath    string    `json:"bin_path" db:"bin_path"`
	VersionStr string    `json:"version_str" db:"version_str"`
	IsSystem   bool      `json:"is_system" db:"is_system"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// Template represents a service deployment template definition.
type Template struct {
	ID                int64     `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	Type              string    `json:"type" db:"type"`
	DefaultJDKID      *int64    `json:"default_jdk_id,omitempty" db:"default_jdk_id"`
	InstallDirPattern string    `json:"install_dir_pattern" db:"install_dir_pattern"`
	JVMOptions        string    `json:"jvm_options" db:"jvm_options"`
	EnvVars           string    `json:"env_vars" db:"env_vars"`
	SupervisionMode   string    `json:"supervision_mode" db:"supervision_mode"`
	StartCmd          string    `json:"start_cmd" db:"start_cmd"`
	StopCmd           string    `json:"stop_cmd" db:"stop_cmd"`
	HealthCheckConfig string    `json:"health_check_config" db:"health_check_config"`
	UninstallRules    string    `json:"uninstall_rules" db:"uninstall_rules"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// Service represents an individual managed service instance.
type Service struct {
	ID                int64     `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	TemplateID        int64     `json:"template_id" db:"template_id"`
	JDKID             *int64    `json:"jdk_id,omitempty" db:"jdk_id"`
	InstallDir        string    `json:"install_dir" db:"install_dir"`
	Port              int       `json:"port" db:"port"`
	JVMOptions        string    `json:"jvm_options" db:"jvm_options"`
	EnvVars           string    `json:"env_vars" db:"env_vars"`
	SupervisionMode   string    `json:"supervision_mode" db:"supervision_mode"`
	Status            string    `json:"status" db:"status"`
	CurrentArtifactID     *int64     `json:"current_artifact_id,omitempty" db:"current_artifact_id"`
	PID                   int        `json:"pid" db:"pid"`
	HealthCheckConfig     string     `json:"health_check_config" db:"health_check_config"`
	TemplateSyncIgnoredAt *time.Time `json:"template_sync_ignored_at,omitempty" db:"template_sync_ignored_at"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`
}

// Artifact represents a package/binary version stored for a service.
type Artifact struct {
	ID          int64     `json:"id" db:"id"`
	ServiceID   int64     `json:"service_id" db:"service_id"`
	Filename    string    `json:"filename" db:"filename"`
	FileSize    int64     `json:"file_size" db:"file_size"`
	SHA256      string    `json:"sha256" db:"sha256"`
	StoragePath string    `json:"storage_path" db:"storage_path"`
	VersionTag  string    `json:"version_tag" db:"version_tag"`
	UploadTime  time.Time `json:"upload_time" db:"upload_time"`
}

// DeployRecord represents an audit and history record for deployment operations.
type DeployRecord struct {
	ID         int64      `json:"id" db:"id"`
	ServiceID  int64      `json:"service_id" db:"service_id"`
	ArtifactID *int64     `json:"artifact_id,omitempty" db:"artifact_id"`
	Action     string     `json:"action" db:"action"`
	Operator   string     `json:"operator" db:"operator"`
	ClientIP   string     `json:"client_ip" db:"client_ip"`
	Status     string     `json:"status" db:"status"`
	OutputLog  string     `json:"output_log" db:"output_log"`
	StartedAt  time.Time  `json:"started_at" db:"started_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty" db:"finished_at"`
}

// AuditLog records security, administrative, and operator audit trail entries.
type AuditLog struct {
	ID         int64     `json:"id" db:"id"`
	Operator   string    `json:"operator" db:"operator"`
	ClientIP   string    `json:"client_ip" db:"client_ip"`
	Action     string    `json:"action" db:"action"`
	TargetType string    `json:"target_type" db:"target_type"`
	TargetID   string    `json:"target_id" db:"target_id"`
	Details    string    `json:"details" db:"details"`
	Status     string    `json:"status" db:"status"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

