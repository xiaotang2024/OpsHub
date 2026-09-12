import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateSyncModal } from './TemplateSyncModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';
import type { Service, TemplateSyncDiff } from '../../types';

vi.mock('../../api', () => ({
  api: {
    syncTemplate: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TemplateSyncModal Component', () => {
  const mockService: Service = {
    id: 10,
    name: 'order-service',
    template_id: 1,
    install_dir: '/opt/apps/order-service',
    port: 8080,
    jvm_options: '-Xms512m -Xmx1g',
    env_vars: '',
    supervision_mode: 'native',
    status: 'RUNNING',
    pid: 12345,
    health_check_config: '{"type":"tcp","port":8080}',
  };

  const mockDiff: TemplateSyncDiff = {
    has_update: true,
    template_id: 1,
    template_name: 'Spring Boot 标准模板',
    template_updated_at: '2026-09-13T02:00:00Z',
    ignored: false,
    jvm_diff: {
      current: '-Xms512m -Xmx1g',
      template: '-Xms1g -Xmx2g -XX:+UseG1GC',
      is_different: true,
    },
    health_check_diff: {
      current: '{"type":"tcp","port":8080}',
      template: '{"type":"http","port":8080,"path":"/actuator/health"}',
      is_different: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with diff comparison and checkboxes', () => {
    render(
      <TemplateSyncModal
        isOpen={true}
        onClose={() => {}}
        service={mockService}
        diff={mockDiff}
        onSuccess={() => {}}
      />
    );

    expect(screen.getByText(/同步模板配置/i)).toBeInTheDocument();
    expect(screen.getByText(/Spring Boot 标准模板/i)).toBeInTheDocument();
    expect(screen.getByText('-Xms512m -Xmx1g')).toBeInTheDocument();
    expect(screen.getByText('-Xms1g -Xmx2g -XX:+UseG1GC')).toBeInTheDocument();
    expect(screen.getByText('仅同步配置')).toBeInTheDocument();
    expect(screen.getByText('同步并立即重启')).toBeInTheDocument();
    expect(screen.getByText('不再提示本次更新')).toBeInTheDocument();
  });

  it('submits sync configuration when clicking 仅同步配置', async () => {
    (api.syncTemplate as any).mockResolvedValueOnce({
      ...mockService,
      jvm_options: '-Xms1g -Xmx2g -XX:+UseG1GC',
    });
    const onSuccess = vi.fn();

    render(
      <TemplateSyncModal
        isOpen={true}
        onClose={() => {}}
        service={mockService}
        diff={mockDiff}
        onSuccess={onSuccess}
      />
    );

    const syncBtn = screen.getByText('仅同步配置');
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.syncTemplate).toHaveBeenCalledWith(10, {
        sync_jvm: true,
        sync_health_check: true,
        restart_now: false,
        ignore_update: false,
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('calls ignore_update when clicking 不再提示本次更新', async () => {
    (api.syncTemplate as any).mockResolvedValueOnce(mockService);
    const onIgnored = vi.fn();

    render(
      <TemplateSyncModal
        isOpen={true}
        onClose={() => {}}
        service={mockService}
        diff={mockDiff}
        onSuccess={() => {}}
        onIgnored={onIgnored}
      />
    );

    const ignoreBtn = screen.getByText('不再提示本次更新');
    fireEvent.click(ignoreBtn);

    await waitFor(() => {
      expect(api.syncTemplate).toHaveBeenCalledWith(10, {
        ignore_update: true,
      });
      expect(onIgnored).toHaveBeenCalled();
    });
  });
});
