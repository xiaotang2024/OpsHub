import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ServiceFleet } from './ServiceFleet';
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
    getServices: vi.fn(),
    getTemplates: vi.fn(),
    getJDKs: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
    updateService: vi.fn(),
    createService: vi.fn(),
    deleteService: vi.fn(),
  },
}));

describe('ServiceFleet Component', () => {
  const mockServices = [
    {
      id: 101,
      name: 'order-center',
      template_id: 1,
      install_dir: '/opt/apps/order-center',
      port: 8081,
      jvm_options: '-Xms1g -Xmx2g -XX:+UseG1GC',
      env_vars: '',
      supervision_mode: 'native',
      status: 'RUNNING',
      pid: 24102,
    },
    {
      id: 102,
      name: 'payment-gateway',
      template_id: 1,
      install_dir: '/opt/apps/payment-gateway',
      port: 8082,
      jvm_options: '-Xms512m -Xmx1g -XX:+UseG1GC',
      env_vars: '',
      supervision_mode: 'systemd',
      status: 'STOPPED',
      pid: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getServices as any).mockResolvedValue(mockServices);
    (api.getTemplates as any).mockResolvedValue([]);
    (api.getJDKs as any).mockResolvedValue([]);
  });

  it('renders service cards with name, StatusBadge, port, PID and supervision mode', async () => {
    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
      expect(screen.getByText('payment-gateway')).toBeInTheDocument();
    });

    // Verify StatusBadge text presence
    expect(screen.getAllByText(/运行中/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/已停止/i).length).toBeGreaterThan(0);

    // Verify Port & PID
    expect(screen.getByText(':8081')).toBeInTheDocument();
    expect(screen.getByText('#24102')).toBeInTheDocument();

    // Verify Supervision mode badges
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText('Systemd')).toBeInTheDocument();
  });

  it('optimistically calls startService when clicking 启动 button on stopped service', async () => {
    (api.startService as any).mockResolvedValueOnce({
      ...mockServices[1],
      status: 'RUNNING',
      pid: 9999,
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('payment-gateway')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /启动服务 payment-gateway/i });
    fireEvent.click(startBtn);

    expect(screen.getByTestId('anime-start-overlay')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.startService).toHaveBeenCalledWith(102);
    });
  });

  it('optimistically calls stopService when clicking 停止 button on running service', async () => {
    (api.stopService as any).mockResolvedValueOnce({
      ...mockServices[0],
      status: 'STOPPED',
      pid: 0,
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const stopBtn = screen.getByRole('button', { name: /停止服务 order-center/i });
    fireEvent.click(stopBtn);

    expect(screen.getByTestId('anime-start-overlay')).toBeInTheDocument();
    expect(screen.getByText(/优雅停机中/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.stopService).toHaveBeenCalledWith(101);
    });
  });

  it('optimistically calls restartService and triggers anime overlay when clicking 重启 button', async () => {
    (api.restartService as any).mockResolvedValueOnce({
      ...mockServices[0],
      status: 'RUNNING',
      pid: 24103,
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const restartBtn = screen.getByRole('button', { name: /重启服务 order-center/i });
    fireEvent.click(restartBtn);

    expect(screen.getByTestId('anime-start-overlay')).toBeInTheDocument();
    expect(screen.getByText(/热启动重装中/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.restartService).toHaveBeenCalledWith(101);
    });
  });

  it('shows failure anime overlay and error toast without success toast when startService fails', async () => {
    (api.startService as any).mockRejectedValueOnce(new Error('服务启动后健康检查失败或未就绪 (health check timed out)'));

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('payment-gateway')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /启动服务 payment-gateway/i });
    fireEvent.click(startBtn);

    // Initial overlay is starting
    expect(screen.getByTestId('anime-start-overlay')).toBeInTheDocument();

    // After failure, error toast is called, and overlay switches to error state
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('启动服务失败: 服务启动后健康检查失败或未就绪'));
    });
    expect(toast.success).not.toHaveBeenCalled();

    // Error message is displayed in the overlay after MIN_ANIME_MS
    await waitFor(
      () => {
        expect(screen.getByText(/health check timed out/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
  });

  it('shows failure anime overlay when startService returns non-RUNNING status', async () => {
    (api.startService as any).mockResolvedValueOnce({
      ...mockServices[1],
      status: 'STOPPED',
      pid: 0,
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('payment-gateway')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /启动服务 payment-gateway/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('未能在预定时间内就绪'));
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('opens details drawer on click and dismisses when backdrop is clicked', async () => {
    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    const card = screen.getByText('order-center');
    fireEvent.click(card);

    expect(screen.getByText('服务实例详细运行态 & 部署参数')).toBeInTheDocument();

    // Click backdrop
    const backdrop = screen.getByText('服务实例详细运行态 & 部署参数').closest('.fixed.inset-0');
    expect(backdrop).toBeInTheDocument();
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    await waitFor(() => {
      expect(screen.queryByText('服务实例详细运行态 & 部署参数')).not.toBeInTheDocument();
    });
  });

  it('allows editing service configuration in drawer and calls api.updateService', async () => {
    (api.updateService as any).mockResolvedValueOnce({
      ...mockServices[0],
      name: 'order-center-v2',
      port: 9090,
      install_dir: '/opt/apps/order-center-v2',
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Open drawer
    fireEvent.click(screen.getByText('order-center'));
    expect(screen.getByText('服务实例详细运行态 & 部署参数')).toBeInTheDocument();

    // Verify only ONE "编辑配置" button exists (top header only)
    const editBtns = screen.getAllByText('编辑配置');
    expect(editBtns).toHaveLength(1);
    fireEvent.click(editBtns[0]);

    // Check that edit mode is active
    expect(screen.getByText(/编辑服务: order-center/i)).toBeInTheDocument();

    // Modify service name and port, verify install_dir updates dynamically
    const nameInput = screen.getByPlaceholderText('例如: order-service');
    fireEvent.change(nameInput, { target: { value: 'order-center-v2' } });

    // Dynamic install directory should reflect the new service name
    expect(screen.getByText('/opt/apps/order-center-v2')).toBeInTheDocument();

    const portInput = screen.getByPlaceholderText('例如: 8080');
    fireEvent.change(portInput, { target: { value: '9090' } });

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /保存修改/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateService).toHaveBeenCalledWith(101, expect.objectContaining({
        name: 'order-center-v2',
        port: 9090,
        install_dir: '/opt/apps/order-center-v2',
      }));
    });
  });

  it('opens styled confirmation modal on delete and calls api.deleteService upon confirmation', async () => {
    (api.deleteService as any).mockResolvedValueOnce({ message: 'deleted' });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Open drawer
    fireEvent.click(screen.getByText('order-center'));
    expect(screen.getByText('服务实例详细运行态 & 部署参数')).toBeInTheDocument();

    // Click "删除服务" in drawer footer
    const deleteBtn = screen.getByRole('button', { name: /删除服务/i });
    fireEvent.click(deleteBtn);

    // Verify custom styled modal is opened with warnings
    expect(screen.getByText('删除服务实例确认')).toBeInTheDocument();
    expect(screen.getByText(/高危操作 · 该操作不可撤销/i)).toBeInTheDocument();
    expect(screen.getByText('操作影响说明')).toBeInTheDocument();

    // Click "确认删除" in modal
    const confirmBtn = screen.getByRole('button', { name: /确认删除/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteService).toHaveBeenCalledWith(101);
    });
  });

  it('opens create service modal, allows actively choosing template and creating service', async () => {
    const mockTemplates = [
      {
        id: 1,
        name: 'Spring Boot Standard',
        install_dir_pattern: '/opt/apps/${SERVICE_NAME}',
        supervision_mode: 'native',
        probe_type: 'http',
        default_jdk_id: 1,
        jvm_options: '-Xms512m -Xmx1g',
        env_vars: 'ENV=prod',
      },
      {
        id: 2,
        name: 'Tomcat WebApp',
        install_dir_pattern: '/opt/tomcat/webapps/${SERVICE_NAME}',
        supervision_mode: 'systemd',
        probe_type: 'tcp',
        default_jdk_id: 1,
        jvm_options: '-Xms1g -Xmx2g',
        env_vars: '',
      },
    ];
    (api.getTemplates as any).mockResolvedValue(mockTemplates);
    (api.createService as any).mockResolvedValueOnce({
      id: 103,
      name: 'analytics-service',
      port: 8083,
      template_id: 2,
      install_dir: '/opt/tomcat/webapps/analytics-service',
    });

    render(
      <BrowserRouter>
        <ServiceFleet />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('order-center')).toBeInTheDocument();
    });

    // Click "新建部署服务" button
    const newServiceBtn = screen.getByRole('button', { name: /新建部署服务/i });
    fireEvent.click(newServiceBtn);

    // Modal should be opened with template selection
    expect(screen.getByText('主动选择模板快速配置并纳管新 Java 服务实例')).toBeInTheDocument();
    expect(screen.getByLabelText(/选择关联部署模板/i)).toBeInTheDocument();

    // Switch template to Tomcat WebApp (#2)
    const templateSelect = screen.getByLabelText(/选择关联部署模板/i);
    fireEvent.change(templateSelect, { target: { value: '2' } });

    // Fill in service name
    const nameInput = screen.getByLabelText(/服务名称/i);
    fireEvent.change(nameInput, { target: { value: 'analytics-service' } });

    // Verify dynamic install directory adapts to chosen template pattern
    expect(screen.getByText('/opt/tomcat/webapps/analytics-service')).toBeInTheDocument();

    // Fill in port
    const portInput = screen.getByLabelText(/监听端口/i);
    fireEvent.change(portInput, { target: { value: '8083' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /立即创建并加入舰队/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createService).toHaveBeenCalledWith(expect.objectContaining({
        name: 'analytics-service',
        template_id: 2,
        port: 8083,
        install_dir: '/opt/tomcat/webapps/analytics-service',
      }));
    });
  });
});
