export type TemplateType = 'java_jar' | 'java_war' | 'generic_archive' | string;
export type SupervisionMode = 'native' | 'systemd' | string;

export interface Template {
  id: number;
  name: string;
  type: TemplateType;
  default_jdk_id?: number | null;
  install_dir_pattern: string;
  jvm_options: string;
  env_vars: string;
  supervision_mode: SupervisionMode;
  start_cmd: string;
  stop_cmd: string;
  health_check_config: string;
  uninstall_rules: string;
  created_at?: string;
  updated_at?: string;
}

export type ServiceStatus =
  | 'RUNNING'
  | 'STARTING'
  | 'STOPPING'
  | 'STOPPED'
  | 'FAILED'
  | 'UNHEALTHY'
  | 'UNINSTALLED'
  | string;

export interface Service {
  id: number;
  name: string;
  template_id: number;
  jdk_id?: number | null;
  install_dir: string;
  port: number;
  jvm_options: string;
  env_vars: string;
  supervision_mode: SupervisionMode;
  status: ServiceStatus;
  current_artifact_id?: number | null;
  pid: number;
  created_at?: string;
  updated_at?: string;
}

export interface JDKAsset {
  id: number;
  name: string;
  java_home: string;
  bin_path: string;
  version_str: string;
  is_system: boolean;
  created_at?: string;
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'process';
  port?: number;
  path?: string;
  interval_sec?: number;
  timeout_sec?: number;
}

export interface Artifact {
  id: number;
  service_id: number;
  filename: string;
  file_size: number;
  sha256: string;
  storage_path: string;
  version_tag: string;
  upload_time: string;
}

export interface DeployRecord {
  id: number;
  service_id: number;
  artifact_id?: number | null;
  action: string;
  operator: string;
  client_ip: string;
  status: 'SUCCESS' | 'FAILED' | string;
  output_log: string;
  started_at: string;
  finished_at?: string | null;
}

export interface AuditLog {
  id: number;
  operator: string;
  client_ip: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  status: string;
  created_at: string;
}

export interface ServiceMetrics {
  pid: number;
  status: string;
  cpu_percent: number;
  memory_rss_mb: number;
  uptime: string;
}

export interface UserProfile {
  id?: number;
  username: string;
  role: 'admin' | 'operator' | string;
  nickname?: string;
  email?: string;
  security_question?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  security_question: string;
  security_answer: string;
}

export interface ResetPasswordPayload {
  username: string;
  security_answer: string;
  new_password: string;
}

export interface UpdateProfilePayload {
  nickname: string;
  email: string;
}


