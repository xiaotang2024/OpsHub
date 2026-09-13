import {
  Template,
  Service,
  JDKAsset,
  Artifact,
  DeployRecord,
  AuditLog,
  ServiceMetrics,
  UserProfile,
  RegisterPayload,
  ResetPasswordPayload,
  UpdateProfilePayload,
  DeployPrecheckResult,
  TemplateSyncDiff,
  SyncTemplateRequest,
  CreateUserPayload,
  UpdatePermissionsPayload,
  UpdateUserStatusPayload,
  ResetUserPasswordPayload,
  ConfigBackupInfo,
} from '../types';

const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('opshub_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errData = await res.json();
      if (errData && errData.error) {
        errorMsg = errData.error;
      }
    } catch {
      // ignore json parse error
    }

    const publicAuthPaths = ['/auth/login', '/auth/register', '/auth/security-question', '/auth/reset-password'];
    if (res.status === 401 && !publicAuthPaths.some((p) => path.startsWith(p)) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('opshub:unauthorized'));
    }

    throw new Error(errorMsg);
  }

  // Check if response is JSON
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return {} as T;
}

// Templates API
export const api = {
  // Templates
  getTemplates: () => request<Template[]>('/templates'),
  getTemplate: (id: number) => request<Template>(`/templates/${id}`),
  createTemplate: (data: Partial<Template>) =>
    request<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: number, data: Partial<Template>) =>
    request<Template>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: number) =>
    request<{ message: string }>(`/templates/${id}`, {
      method: 'DELETE',
    }),

  // Services
  getServices: () => request<Service[]>('/services'),
  getService: (id: number) => request<Service>(`/services/${id}`),
  createService: (data: Partial<Service>) =>
    request<Service>('/services', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateService: (id: number, data: Partial<Service>) =>
    request<Service>(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteService: (id: number) =>
    request<{ message: string }>(`/services/${id}`, {
      method: 'DELETE',
    }),
  startService: (id: number) =>
    request<Service>(`/services/${id}/start`, {
      method: 'POST',
    }),
  stopService: (id: number) =>
    request<Service>(`/services/${id}/stop`, {
      method: 'POST',
    }),
  restartService: (id: number) =>
    request<Service>(`/services/${id}/restart`, {
      method: 'POST',
    }),
  getTemplateSyncDiff: (id: number) =>
    request<TemplateSyncDiff>(`/services/${id}/template-sync`),
  syncTemplate: (id: number, data: SyncTemplateRequest) =>
    request<Service>(`/services/${id}/template-sync`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // JDKs
  getJDKs: () => request<JDKAsset[]>('/jdks'),
  getJDK: (id: number) => request<JDKAsset>(`/jdks/${id}`),
  createJDK: (data: {
    name: string;
    java_home: string;
    bin_path?: string;
    version_str?: string;
    is_system?: boolean;
  }) =>
    request<JDKAsset>('/jdks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  scanJDKs: () => request<JDKAsset[]>('/jdks/scan'),
  deleteJDK: (id: number) =>
    request<{ message: string }>(`/jdks/${id}`, {
      method: 'DELETE',
    }),

  // Releases & Deployment
  checkDeployPermission: (serviceId: number) =>
    request<DeployPrecheckResult>(`/services/${serviceId}/deploy-precheck`),
  getReleases: (serviceId: number) =>
    request<DeployRecord[]>(`/services/${serviceId}/releases`),
  deployService: (serviceId: number, artifactId: number) =>
    request<DeployRecord>(`/services/${serviceId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ artifact_id: artifactId }),
    }),
  rollbackService: (serviceId: number, artifactId: number) =>
    request<DeployRecord>(`/services/${serviceId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ artifact_id: artifactId }),
    }),

  // Artifacts
  getArtifacts: (serviceId: number) =>
    request<Artifact[]>(`/services/${serviceId}/artifacts`),
  uploadArtifact: async (serviceId: number, formData: FormData): Promise<Artifact> => {
    const token = localStorage.getItem('opshub_token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}/services/${serviceId}/artifacts`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errData = await res.json();
        if (errData && errData.error) errorMsg = errData.error;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    return res.json();
  },
  deleteArtifact: (serviceId: number, artifactId: number) =>
    request<{ message: string }>(`/services/${serviceId}/artifacts/${artifactId}`, {
      method: 'DELETE',
    }),

  // Configs
  getServiceConfigs: (serviceId: number, file?: string) =>
    request<{ files?: string[]; backups?: ConfigBackupInfo[]; file?: string; path?: string; content?: string }>(
      `/services/${serviceId}/configs${file ? `?file=${encodeURIComponent(file)}` : ''}`
    ),
  saveServiceConfig: (serviceId: number, file: string, content: string) =>
    request<{ message: string; file: string; backup?: string }>(`/services/${serviceId}/configs`, {
      method: 'POST',
      body: JSON.stringify({ file, content }),
    }),
  deleteConfig: (serviceId: number, file: string) =>
    request<{ message: string; file: string }>(
      `/services/${serviceId}/configs?file=${encodeURIComponent(file)}`,
      {
        method: 'DELETE',
      }
    ),

  // Metrics
  getServiceMetrics: (serviceId: number) =>
    request<ServiceMetrics>(`/services/${serviceId}/metrics`),

  // Audit Logs
  getAuditLogs: (params: {
    target_type?: string;
    target_id?: string;
    action?: string;
    status?: string;
    operator?: string;
    start_time?: string;
    end_time?: string;
    page?: number;
    page_size?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.target_type) query.set('target_type', params.target_type);
    if (params.target_id) query.set('target_id', params.target_id);
    if (params.action) query.set('action', params.action);
    if (params.status) query.set('status', params.status);
    if (params.operator) query.set('operator', params.operator);
    if (params.start_time) query.set('start_time', params.start_time);
    if (params.end_time) query.set('end_time', params.end_time);
    if (params.page) query.set('page', String(params.page));
    if (params.page_size) query.set('page_size', String(params.page_size));
    const qStr = query.toString();
    return request<{
      items: AuditLog[];
      total: number;
      page: number;
      page_size: number;
      stats?: {
        total: number;
        today: number;
        deploy: number;
        failed: number;
      };
    }>(`/audit-logs${qStr ? `?${qStr}` : ''}`);
  },

  exportAuditLogs: async (params: {
    target_type?: string;
    target_id?: string;
    action?: string;
    status?: string;
    operator?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.target_type) query.set('target_type', params.target_type);
    if (params.target_id) query.set('target_id', params.target_id);
    if (params.action) query.set('action', params.action);
    if (params.status) query.set('status', params.status);
    if (params.operator) query.set('operator', params.operator);
    if (params.start_time) query.set('start_time', params.start_time);
    if (params.end_time) query.set('end_time', params.end_time);
    if (params.limit) query.set('limit', String(params.limit));
    const qStr = query.toString();

    const token = localStorage.getItem('opshub_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/audit-logs/export${qStr ? `?${qStr}` : ''}`, {
      headers,
    });
    if (!res.ok) {
      throw new Error(`导出失败 (${res.status} ${res.statusText})`);
    }
    return res.blob();
  },

  // Auth
  login: (username: string, password: string) =>
    request<{ token: string; user?: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (payload: RegisterPayload) =>
    request<{ token: string; user: UserProfile; message?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSecurityQuestion: (username: string) =>
    request<{ username: string; security_question: string }>(
      `/auth/security-question?username=${encodeURIComponent(username)}`
    ),
  resetPassword: (payload: ResetPasswordPayload) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMe: () => request<UserProfile>('/auth/me'),
  getProfile: () => request<UserProfile>('/auth/profile'),
  updateProfile: (payload: UpdateProfilePayload) =>
    request<UserProfile>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),

  // Users & RBAC API
  getUsers: () => request<UserProfile[]>('/users'),
  createUser: (data: CreateUserPayload) =>
    request<UserProfile>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUserPermissions: (id: number, data: string[] | UpdatePermissionsPayload) =>
    request<{ message: string }>(`/users/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(Array.isArray(data) ? { permissions: data } : data),
    }),
  updateUserStatus: (id: number, data: string | UpdateUserStatusPayload) =>
    request<{ message: string }>(`/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(typeof data === 'string' ? { status: data } : data),
    }),
  resetUserPassword: (id: number, data: string | ResetUserPasswordPayload) =>
    request<{ message: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(typeof data === 'string' ? { new_password: data } : data),
    }),
  deleteUser: (id: number) =>
    request<{ message: string }>(`/users/${id}`, {
      method: 'DELETE',
    }),
};

