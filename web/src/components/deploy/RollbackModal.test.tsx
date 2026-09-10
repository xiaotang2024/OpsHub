import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RollbackModal } from './RollbackModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    rollbackService: vi.fn(),
  },
}));

describe('RollbackModal Component', () => {
  const currentArtifact = {
    id: 201,
    service_id: 5,
    filename: 'order-service-v2.0.jar',
    file_size: 1024 * 1024 * 40,
    sha256: '9988aabbccddeeff00112233',
    storage_path: '/opt/pkgs/order-service-v2.0.jar',
    version_tag: 'v2.0',
    upload_time: '2026-09-10T08:00:00Z',
  };

  const targetArtifact = {
    id: 198,
    service_id: 5,
    filename: 'order-service-v1.9.jar',
    file_size: 1024 * 1024 * 38,
    sha256: '11223344556677889900aabb',
    storage_path: '/opt/pkgs/order-service-v1.9.jar',
    version_tag: 'v1.9',
    upload_time: '2026-09-08T08:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders side-by-side version comparison diff card', () => {
    render(
      <RollbackModal
        visible={true}
        serviceId={5}
        serviceName="order-service"
        currentArtifact={currentArtifact}
        targetArtifact={targetArtifact}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/一键版本回滚确认/i)).toBeInTheDocument();
    expect(screen.getByText('当前运行版本')).toBeInTheDocument();
    expect(screen.getByText('order-service-v2.0.jar')).toBeInTheDocument();
    expect(screen.getByText('v2.0')).toBeInTheDocument();

    expect(screen.getByText('目标回滚版本')).toBeInTheDocument();
    expect(screen.getByText('order-service-v1.9.jar')).toBeInTheDocument();
    expect(screen.getByText('v1.9')).toBeInTheDocument();
  });

  it('disables confirmation button until user checks risk acknowledgment', () => {
    render(
      <RollbackModal
        visible={true}
        serviceId={5}
        serviceName="order-service"
        currentArtifact={currentArtifact}
        targetArtifact={targetArtifact}
        onClose={() => {}}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /确认回滚到此版本/i });
    expect(confirmBtn).toBeDisabled();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls api.rollbackService and executes callback upon confirmation', async () => {
    (api.rollbackService as any).mockResolvedValueOnce({
      id: 300,
      service_id: 5,
      artifact_id: 198,
      action: 'ROLLBACK',
      status: 'SUCCESS',
      operator: 'admin',
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <RollbackModal
        visible={true}
        serviceId={5}
        serviceName="order-service"
        currentArtifact={currentArtifact}
        targetArtifact={targetArtifact}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const confirmBtn = screen.getByRole('button', { name: /确认回滚到此版本/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.rollbackService).toHaveBeenCalledWith(5, 198);
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
