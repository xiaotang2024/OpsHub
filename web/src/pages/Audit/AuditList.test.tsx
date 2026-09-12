import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditList } from './AuditList';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getAuditLogs: vi.fn(),
  },
}));

describe('AuditList Component', () => {
  const mockAuditLogs = [
    {
      id: 101,
      operator: 'admin',
      client_ip: '127.0.0.1',
      action: 'DEPLOY',
      target_type: 'service',
      target_id: '1',
      details: 'Successfully deployed artifact v1.0.2 to service order-center',
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    },
    {
      id: 102,
      operator: 'developer_tang',
      client_ip: '192.168.1.100',
      action: 'STOP',
      target_type: 'service',
      target_id: '2',
      details: 'Stopped service payment-gateway due to maintenance',
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    },
    {
      id: 103,
      operator: 'admin',
      client_ip: '10.0.0.5',
      action: 'START',
      target_type: 'service',
      target_id: '3',
      details: 'Failed to start service timer-server: port 8080 already in use',
      status: 'FAILED',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getAuditLogs as any).mockResolvedValue({
      items: mockAuditLogs,
      total: 3,
      page: 1,
      page_size: 20,
      stats: {
        total: 100,
        today: 25,
        deploy: 14,
        failed: 3,
      },
    });
  });

  it('renders page header, summary cards and audit table rows', async () => {
    render(<AuditList />);

    expect(screen.getByText(/审计日志 \/ Audit Logs/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/order-center/i)).toBeInTheDocument();
      expect(screen.getByText(/payment-gateway/i)).toBeInTheDocument();
      expect(screen.getByText(/timer-server/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/DEPLOY/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/admin/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/127.0.0.1/i)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('allows filtering by action and updates api query', async () => {
    render(<AuditList />);

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalled();
    });

    const actionSelect = screen.getByLabelText('action-filter');
    fireEvent.change(actionSelect, { target: { value: 'DEPLOY' } });

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPLOY',
        })
      );
    });
  });

  it('opens detail drawer when clicking a log row', async () => {
    render(<AuditList />);

    await waitFor(() => {
      expect(screen.getByText(/order-center/i)).toBeInTheDocument();
    });

    const viewDetailBtn = screen.getAllByRole('button', { name: /查看详情/i })[0];
    fireEvent.click(viewDetailBtn);

    await waitFor(() => {
      expect(screen.getByText(/审计详情/i)).toBeInTheDocument();
      expect(screen.getAllByText(/order-center/i)[0]).toBeInTheDocument();
    });
  });

  it('navigates pagination while preserving global stats across pages', async () => {
    (api.getAuditLogs as any)
      .mockResolvedValueOnce({
        items: mockAuditLogs.slice(0, 2),
        total: 30,
        page: 1,
        page_size: 2,
        stats: {
          total: 30,
          today: 10,
          deploy: 5,
          failed: 1,
        },
      })
      .mockResolvedValueOnce({
        items: mockAuditLogs.slice(2, 3),
        total: 30,
        page: 2,
        page_size: 2,
        stats: {
          total: 30,
          today: 10,
          deploy: 5,
          failed: 1,
        },
      });

    render(<AuditList />);

    await waitFor(() => {
      expect(screen.getAllByText('30')[0]).toBeInTheDocument();
      expect(screen.getAllByText('10')[0]).toBeInTheDocument();
    });

    const nextBtn = screen.getByTitle('下一页');
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
      // Stats remain consistent on page 2
      expect(screen.getAllByText('30')[0]).toBeInTheDocument();
      expect(screen.getAllByText('10')[0]).toBeInTheDocument();
    });
  });
});
