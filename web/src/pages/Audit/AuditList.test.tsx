import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditList } from './AuditList';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getAuditLogs: vi.fn(),
    exportAuditLogs: vi.fn(),
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

  it('applies fixed layout with sticky table header and internal scroll container', async () => {
    const { container } = render(<AuditList />);

    await waitFor(() => {
      expect(screen.getByText(/order-center/i)).toBeInTheDocument();
    });

    // Check sticky table header
    const tableHeader = container.querySelector('thead');
    expect(tableHeader).toHaveClass('sticky');
    expect(tableHeader).toHaveClass('top-0');

    // Check internal scroll container wrapping the table
    const table = container.querySelector('table');
    const scrollContainer = table?.parentElement;
    expect(scrollContainer).toHaveClass('overflow-auto');

    // Check fixed pagination container
    const pagination = screen.getByText(/显示第/i).parentElement;
    expect(pagination).toHaveClass('shrink-0');
  });

  it('filters audit logs by time range preset (today)', async () => {
    render(<AuditList />);

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalled();
    });

    const timeFilter = screen.getByLabelText('time-range-filter');
    fireEvent.change(timeFilter, { target: { value: 'today' } });

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          start_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2} 00:00:00$/),
          end_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2} 23:59:59$/),
        })
      );
    });
  });

  it('supports custom date range filtering with inline date inputs', async () => {
    render(<AuditList />);

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalled();
    });

    const timeFilter = screen.getByLabelText('time-range-filter');
    fireEvent.change(timeFilter, { target: { value: 'custom' } });

    const startDateInput = screen.getByLabelText('custom-start-date');
    const endDateInput = screen.getByLabelText('custom-end-date');
    expect(startDateInput).toBeInTheDocument();
    expect(endDateInput).toBeInTheDocument();

    fireEvent.change(startDateInput, { target: { value: '2026-09-01' } });
    fireEvent.change(endDateInput, { target: { value: '2026-09-10' } });

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          start_time: '2026-09-01 00:00:00',
          end_time: '2026-09-10 23:59:59',
        })
      );
    });
  });

  it('exports audit logs as CSV when clicking export button', async () => {
    const mockBlob = new Blob(['fake,csv,data'], { type: 'text/csv' });
    (api.exportAuditLogs as any).mockResolvedValue(mockBlob);

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<AuditList />);

    await waitFor(() => {
      expect(screen.getByText(/order-center/i)).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /导出日志/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.exportAuditLogs).toHaveBeenCalled();
      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });

    clickSpy.mockRestore();
  });
});

