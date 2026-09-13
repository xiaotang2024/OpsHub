import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ServiceDetail } from './ServiceDetail';
import { api } from '../../api';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../api', () => ({
  api: {
    getService: vi.fn(),
    getTemplates: vi.fn(),
    getJDKs: vi.fn(),
    getReleases: vi.fn(),
    getArtifacts: vi.fn(),
    deleteArtifact: vi.fn(),
    getServiceMetrics: vi.fn(),
    getServiceConfigs: vi.fn(),
    getAuditLogs: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
    checkDeployPermission: vi.fn(),
    getTemplateSyncDiff: vi.fn(),
    syncTemplate: vi.fn(),
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
    localStorage.clear();
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
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
    (api.checkDeployPermission as any).mockResolvedValue({
      has_permission: true,
      can_deploy: true,
      install_dir: '/opt/apps/order-center',
      operator: 'admin',
      role: 'admin',
    });
    (api.getTemplateSyncDiff as any).mockResolvedValue({
      has_update: false,
      template_id: 1,
      template_name: 'Spring Boot Standard',
      template_updated_at: '2026-09-10T08:00:00Z',
      ignored: false,
      jvm_diff: { current: '', template: '', is_different: false },
      health_check_diff: { current: '', template: '', is_different: false },
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

  it('shows permission alert modal with error and suggestion when deploy permission precheck fails', async () => {
    (api.checkDeployPermission as any).mockResolvedValue({
      has_permission: false,
      type: 'directory_permission',
      install_dir: '/opt/apps/order-center',
      error: '无法创建安装目录 /opt/apps/order-center: permission denied',
      suggestion: 'sudo mkdir -p /opt/apps/order-center && sudo chown -R $(whoami) /opt/apps/order-center',
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const deployButtons = screen.getAllByRole('button', { name: /部署新版本/i });
    fireEvent.click(deployButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/发版部署权限检测未通过/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/宿主机安装目录缺少写入或创建权限/i)).toBeInTheDocument();
    expect(screen.getByText(/无法创建安装目录 \/opt\/apps\/order-center: permission denied/i)).toBeInTheDocument();
    expect(screen.getByText(/sudo mkdir -p \/opt\/apps\/order-center && sudo chown -R \$\(whoami\) \/opt\/apps\/order-center/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制命令/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新检测/i })).toBeInTheDocument();
  });

  it('opens deploy wizard modal when deploy permission precheck succeeds', async () => {
    (api.checkDeployPermission as any).mockResolvedValue({
      has_permission: true,
      can_deploy: true,
      install_dir: '/opt/apps/order-center',
      operator: 'admin',
      role: 'admin',
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const deployButtons = screen.getAllByRole('button', { name: /部署新版本/i });
    fireEvent.click(deployButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/1. 预检/i)).toBeInTheDocument();
    });
  });

  it('displays template sync banner when template update is detected and opens sync modal', async () => {
    (api.getTemplateSyncDiff as any).mockResolvedValue({
      has_update: true,
      template_id: 1,
      template_name: 'Spring Boot Standard',
      template_updated_at: '2026-09-13T02:00:00Z',
      ignored: false,
      jvm_diff: { current: '-Xms512m -Xmx1g', template: '-Xms1g -Xmx2g', is_different: true },
      health_check_diff: { current: '', template: '{"type":"http","port":8080}', is_different: true },
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/所属部署模板「Spring Boot Standard」有新配置可同步/i)).toBeInTheDocument();
    });

    const syncBtn = screen.getByRole('button', { name: /查看并同步配置/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByText('/ Sync Template Settings')).toBeInTheDocument();
    });
  });

  describe('Permission Guarding', () => {
    it('disables start, stop, and restart buttons with tooltip when user lacks service:control permission', async () => {
      localStorage.setItem(
        'opshub_user',
        JSON.stringify({
          username: 'operator1',
          role: 'operator',
          permissions: ['service:view', 'service:deploy'],
        })
      );

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('order-center')).toBeInTheDocument();
      });

      const startBtn = screen.getByRole('button', { name: /启动/i });
      const stopBtn = screen.getByRole('button', { name: /停止/i });
      const restartBtn = screen.getByRole('button', { name: /重启/i });

      expect(startBtn).toBeDisabled();
      expect(stopBtn).toBeDisabled();
      expect(restartBtn).toBeDisabled();

      const tooltips = screen.getAllByTitle(/无服务控制权限/i);
      expect(tooltips.length).toBeGreaterThanOrEqual(3);
    });

    it('disables deploy buttons with tooltip when user lacks service:deploy permission', async () => {
      localStorage.setItem(
        'opshub_user',
        JSON.stringify({
          username: 'operator1',
          role: 'operator',
          permissions: ['service:view', 'service:control'],
        })
      );

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('order-center')).toBeInTheDocument();
      });

      const deployButtons = screen.getAllByRole('button', { name: /部署新版本/i });
      expect(deployButtons[0]).toBeDisabled();
      expect(screen.getAllByTitle(/无发版部署权限/i).length).toBeGreaterThanOrEqual(1);
    });

    it('disables rollback button with tooltip when user lacks service:rollback permission', async () => {
      localStorage.setItem(
        'opshub_user',
        JSON.stringify({
          username: 'operator1',
          role: 'operator',
          permissions: ['service:view'],
        })
      );

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('order-center')).toBeInTheDocument();
      });

      const releasesTab = screen.getByRole('button', { name: /版本与发布/i });
      fireEvent.click(releasesTab);

      const rollbackBtn = screen.getByRole('button', { name: /一键回滚/i });
      expect(rollbackBtn).toBeDisabled();
      expect(screen.getByTitle(/无版本回滚权限/i)).toBeInTheDocument();
    });

    it('disables config saving with tooltip when user lacks service:config permission', async () => {
      localStorage.setItem(
        'opshub_user',
        JSON.stringify({
          username: 'operator1',
          role: 'operator',
          permissions: ['service:view'],
        })
      );

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('order-center')).toBeInTheDocument();
      });

      const configsTab = screen.getByRole('button', { name: /配置文件/i });
      fireEvent.click(configsTab);

      await waitFor(() => {
        const saveBtn = screen.getByRole('button', { name: /保存修改/i });
        expect(saveBtn).toBeDisabled();
      });

      expect(screen.getByTitle(/无配置修改权限/i)).toBeInTheDocument();
    });
  });

  it('displays failure anime overlay and error toast without success toast when startService fails', async () => {
    (api.getService as any).mockResolvedValueOnce({
      ...mockService,
      status: 'STOPPED',
      pid: 0,
    });
    (api.startService as any).mockRejectedValueOnce(new Error('服务启动后立即退出 (PID 9999)'));

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /^启动$/i });
    fireEvent.click(startBtn);

    // Initial overlay is starting
    expect(screen.getByTestId('anime-start-overlay')).toBeInTheDocument();

    // After failure, error toast is called, and overlay switches to error state
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('启动服务失败: 服务启动后立即退出'));
    });
    expect(toast.success).not.toHaveBeenCalled();

    // Error message is displayed in the overlay after MIN_ANIME_MS
    await waitFor(
      () => {
        expect(screen.getByText(/PID 9999/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
  });

  it('allows admin to delete historical artifact in releases tab', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'admin' }));
    (api.deleteArtifact as any).mockResolvedValue({ message: 'artifact deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Switch to Releases tab
    fireEvent.click(screen.getByRole('button', { name: /版本与发布/i }));

    await waitFor(() => {
      expect(screen.getByText(/order-center-v1\.0\.jar/i)).toBeInTheDocument();
    });

    // The historical artifact has "删除" button
    const delBtn = screen.getByRole('button', { name: /删除/i });
    expect(delBtn).toBeInTheDocument();

    fireEvent.click(delBtn);

    await waitFor(() => {
      expect(api.deleteArtifact).toHaveBeenCalledWith(10, 100);
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('已成功删除'));
    });
  });

  it('hides delete artifact button in releases tab for non-admin operator', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'operator', permissions: ['service:deploy', 'service:rollback'] }));

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /版本与发布/i }));

    await waitFor(() => {
      expect(screen.getByText(/order-center-v1\.0\.jar/i)).toBeInTheDocument();
    });

    // Rollback button is shown, but delete button is not
    expect(screen.getByRole('button', { name: /一键回滚/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^删除$/i })).not.toBeInTheDocument();
  });
});

