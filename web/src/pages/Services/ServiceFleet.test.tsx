import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ServiceFleet } from './ServiceFleet';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getServices: vi.fn(),
    getTemplates: vi.fn(),
    getJDKs: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
    updateService: vi.fn(),
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

    await waitFor(() => {
      expect(api.stopService).toHaveBeenCalledWith(101);
    });
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
});
