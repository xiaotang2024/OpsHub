import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeployWizardModal } from './DeployWizardModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getArtifacts: vi.fn(),
    uploadArtifact: vi.fn(),
    deployService: vi.fn(),
  },
}));

describe('DeployWizardModal', () => {
  const mockArtifacts = [
    {
      id: 1,
      service_id: 10,
      filename: 'order-service-v1.0.jar',
      file_size: 1024 * 1024 * 32,
      sha256: 'abcd1234ef5678',
      storage_path: '/opt/pkgs/order-service-v1.0.jar',
      version_tag: 'v1.0',
      upload_time: '2026-09-08T10:00:00Z',
    },
    {
      id: 2,
      service_id: 10,
      filename: 'order-service-v1.1.jar',
      file_size: 1024 * 1024 * 35,
      sha256: 'ef789012cd3456',
      storage_path: '/opt/pkgs/order-service-v1.1.jar',
      version_tag: 'v1.1',
      upload_time: '2026-09-09T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getArtifacts as any).mockResolvedValue(mockArtifacts);
  });

  it('renders all 7 deployment pipeline steps', () => {
    render(
      <DeployWizardModal
        visible={true}
        serviceName="order-service"
        currentStep={3}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/1. 预检/i)).toBeInTheDocument();
    expect(screen.getByText(/2. 备份/i)).toBeInTheDocument();
    expect(screen.getByText(/3. 停机/i)).toBeInTheDocument();
    expect(screen.getByText(/4. 制品分发/i)).toBeInTheDocument();
    expect(screen.getByText(/5. 启动新版本/i)).toBeInTheDocument();
    expect(screen.getByText(/6. 就绪探测/i)).toBeInTheDocument();
    expect(screen.getByText(/7. 记录生效/i)).toBeInTheDocument();
  });

  it('allows switching to existing artifact tab and selecting an artifact', async () => {
    render(
      <DeployWizardModal
        visible={true}
        serviceId={10}
        serviceName="order-service"
        onClose={() => {}}
      />
    );

    // Switch to existing artifact tab
    const existingTab = screen.getByText(/选择已有历史版本/i);
    fireEvent.click(existingTab);

    await waitFor(() => {
      expect(screen.getByText('order-service-v1.0.jar')).toBeInTheDocument();
      expect(screen.getByText('order-service-v1.1.jar')).toBeInTheDocument();
    });

    // Select second artifact
    fireEvent.click(screen.getByText('order-service-v1.1.jar'));

    // Verify deploy button is enabled and can trigger deployment
    const deployBtn = screen.getByRole('button', { name: /开始执行 7 步部署/i });
    expect(deployBtn).not.toBeDisabled();
  });

  it('expands live console log stream accordion on click', () => {
    render(
      <DeployWizardModal
        visible={true}
        serviceName="order-service"
        onClose={() => {}}
      />
    );

    const logToggleBtn = screen.getByText(/实时流水线控制台日志/i);
    fireEvent.click(logToggleBtn);

    expect(screen.getByText(/流水线日志输出缓冲区空闲/i)).toBeInTheDocument();
  });

  it('executes deployment when an artifact is selected and deploy button is clicked', async () => {
    (api.deployService as any).mockResolvedValueOnce({
      id: 99,
      service_id: 10,
      artifact_id: 2,
      action: 'DEPLOY',
      operator: 'admin',
      client_ip: '127.0.0.1',
      status: 'SUCCESS',
      output_log: '[12:00:00.000] Step 1: Pre-flight check passed\n[12:00:01.000] Step 7: Finalized',
      started_at: '2026-09-10T12:00:00Z',
    });

    render(
      <DeployWizardModal
        visible={true}
        serviceId={10}
        serviceName="order-service"
        onClose={() => {}}
      />
    );

    // Switch to existing tab
    fireEvent.click(screen.getByText(/选择已有历史版本/i));

    await waitFor(() => {
      expect(screen.getByText('order-service-v1.1.jar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('order-service-v1.1.jar'));

    const deployBtn = screen.getByRole('button', { name: /开始执行 7 步部署/i });
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(api.deployService).toHaveBeenCalledWith(10, 2);
      expect(screen.getByText(/部署成功/i)).toBeInTheDocument();
    });
  });
});
