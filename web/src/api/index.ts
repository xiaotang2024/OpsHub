import { Template, Service, JDKAsset } from '../types';

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

  // JDKs
  getJDKs: () => request<JDKAsset[]>('/jdks'),
};
