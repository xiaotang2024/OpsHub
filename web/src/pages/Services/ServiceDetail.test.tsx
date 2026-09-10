import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ServiceDetail } from './ServiceDetail';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getService: vi.fn(),
    getTemplates: vi.fn(),
    getJDKs: vi.fn(),
    getReleases: vi.fn(),
    getArtifacts: vi.fn(),
    getServiceMetrics: vi.fn(),
    getServiceConfigs: vi.fn(),
    getAuditLogs: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
  },
}));

describe('ServiceDetail Component', () => {
  const mockService = {
    id: 10,
    name: 'order-center',
    template_id: 1,
    jdk_id: 2,
    install_dir: '/opt/apps/order-center',
    port: 8088,
    jvm_options: '-Xms2g -Xmx4g',
    env_vars: 'SPRING_PROFILES_ACTIVE=prod',
    supervision_mode: 'native',
    status: 'RUNNING',
    current_artifact_id: 101,
    pid: 54321,
  };

  const mockTemplate = {
    id: 1,
    name: 'Spring Boot Standard',
    type: 'java_jar',
    install_dir_pattern: '/opt/apps/{{.Name}}',
    jvm_options: '',
    env_vars: '',
    supervision_mode: 'native',
    start_cmd: '',
    stop_cmd: '',
    health_check_config: '',
    uninstall_rules: '',
  };

  const mockArtifacts = [
    {
      id: 101,
      service_id: 10,
      filename: 'order-center-v1.1.jar',
      file_size: 1024 * 1024 * 45,
      sha256: 'abc123',
      storage_path: '/opt/pkgs/order-center-v1.1.jar',
      version_tag: 'v1.1',
      upload_time: '2026-09-10T08:00:00Z',
    },
    {
      id: 100,
      service_id: 10,
      filename: 'order-center-v1.0.jar',
      file_size: 1024 * 1024 * 42,
      sha256: 'def456',
      storage_path: '/opt/pkgs/order-center-v1.0.jar',
      version_tag: 'v1.0',
      upload_time: '2026-09-08T08:00:00Z',
    },
  ];

  const mockReleases = [
    {
      id: 50,
      service_id: 10,
      artifact_id: 101,
      action: 'DEPLOY',
      operator: 'admin',
      client_ip: '127.0.0.1',
      status: 'SUCCESS',
      output_log: 'Deploy ok',
      started_at: '2026-09-10T08:05:00Z',
    },
    {
      id: 49,
      service_id: 10,
      artifact_id: 100,
      action: 'DEPLOY',
      operator: 'admin',
      client_ip: '127.0.0.1',
      status: 'SUCCESS',
      output_log: 'Initial deploy',
      started_at: '2026-09-08T08:05:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getService as any).mockResolvedValue(mockService);
    (api.getTemplates as any).mockResolvedValue([mockTemplate]);
    (api.getJDKs as any).mockResolvedValue([]);
    (api.getReleases as any).mockResolvedValue(mockReleases);
    (api.getArtifacts as any).mockResolvedValue(mockArtifacts);
    (api.getServiceMetrics as any).mockResolvedValue({
      pid: 54321,
      status: 'RUNNING',
      cpu_percent: 1.5,
      memory_rss_mb: 512.4,
      uptime: '3d 12h',
    });
    (api.getServiceConfigs as any).mockResolvedValue({ files: ['application.yml'] });
    (api.getAuditLogs as any).mockResolvedValue({
      items: [
        {
          id: 1,
          operator: 'admin',
          client_ip: '127.0.0.1',
          action: 'DEPLOY',
          target_type: 'service',
          target_id: '10',
          details: 'Deploy v1.1',
          status: 'SUCCESS',
          created_at: '2026-09-10T08:05:00Z',
        },
      ],
      total: 1,
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/services/10']}>
        <Routes>
          <Route path="/services/:id" element={<ServiceDetail />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders service overview with name, port, PID, status, and telemetry', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
      expect(screen.getByText(':8088')).toBeInTheDocument();
      expect(screen.getByText('#54321')).toBeInTheDocument();
      expect(screen.getByText('512.4 MB')).toBeInTheDocument();
      expect(screen.getByText('3d 12h')).toBeInTheDocument();
    });

    // Check quick action buttons
    expect(screen.getByRole('button', { name: /启动/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /停止/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重启/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /部署新版本/i })).toBeInTheDocument();
  });

  it('switches between tabs and shows release timeline with rollback button', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Switch to releases tab
    const releasesTab = screen.getByRole('button', { name: /版本与发布/i });
    fireEvent.click(releasesTab);

    expect(screen.getByText('发布历史与制品时间线')).toBeInTheDocument();
    expect(screen.getByText('order-center-v1.1.jar')).toBeInTheDocument();
    expect(screen.getByText('order-center-v1.0.jar')).toBeInTheDocument();

    // Release for 100 should have '一键回滚' button
    expect(screen.getByRole('button', { name: /一键回滚/i })).toBeInTheDocument();

    // Switch to configs tab
    const configsTab = screen.getByRole('button', { name: /配置文件/i });
    fireEvent.click(configsTab);
    expect(screen.getByText(/配置文件中心/i)).toBeInTheDocument();
    expect(screen.getByText('application.yml')).toBeInTheDocument();

    // Switch to logs tab
    const logsTab = screen.getByRole('button', { name: /实时日志/i });
    fireEvent.click(logsTab);
    expect(screen.getByText(/实时控制台终端/i)).toBeInTheDocument();

    // Switch to audit tab
    const auditTab = screen.getByRole('button', { name: /审计轨迹/i });
    fireEvent.click(auditTab);
    expect(screen.getByText('服务操作审计日志')).toBeInTheDocument();
    expect(screen.getByText('Deploy v1.1')).toBeInTheDocument();
  });

  it('opens rollback modal when clicking 一键回滚 on historical release', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Switch to releases tab
    const releasesTab = screen.getByRole('button', { name: /版本与发布/i });
    fireEvent.click(releasesTab);

    const rollbackBtn = screen.getByRole('button', { name: /一键回滚/i });
    fireEvent.click(rollbackBtn);

    expect(screen.getByText(/一键版本回滚确认/i)).toBeInTheDocument();
    expect(screen.getAllByText('order-center-v1.0.jar').length).toBeGreaterThanOrEqual(1);
  });

  it('integrates ProcessTelemetryCard, ConfigDiffEditor, and LiveLogViewer into corresponding tabs', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Overview has ProcessTelemetryCard
    expect(screen.getByText(/进程实时遥测/i)).toBeInTheDocument();
    expect(screen.getByTestId('cpu-gauge')).toBeInTheDocument();
    expect(screen.getByTestId('mem-gauge')).toBeInTheDocument();

    // Configs tab has ConfigDiffEditor with warning banner
    const configsTab = screen.getByRole('button', { name: /配置文件/i });
    fireEvent.click(configsTab);
    expect(screen.getByText(/修改后需重启服务以使配置生效/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存修改/i })).toBeInTheDocument();

    // Logs tab has LiveLogViewer with toolbar
    const logsTab = screen.getByRole('button', { name: /实时日志/i });
    fireEvent.click(logsTab);
    expect(screen.getByText(/OPSHUB CONSOLE/i)).toBeInTheDocument();
    expect(screen.getByTestId('ws-status-badge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auto-scroll/i })).toBeInTheDocument();
  });
});

