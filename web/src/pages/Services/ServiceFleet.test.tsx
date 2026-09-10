import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ServiceFleet } from './ServiceFleet';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getServices: vi.fn(),
    getTemplates: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    restartService: vi.fn(),
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
});
