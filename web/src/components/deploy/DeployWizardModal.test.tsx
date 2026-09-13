import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeployWizardModal } from './DeployWizardModal';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getArtifacts: vi.fn(),
    uploadArtifact: vi.fn(),
    deployService: vi.fn(),
    deleteArtifact: vi.fn(),
    checkDeployPermission: vi.fn(),
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
    (api.checkDeployPermission as any).mockResolvedValue({
      has_permission: true,
      can_deploy: true,
      install_dir: '/opt/apps/order-service',
      operator: 'admin',
      role: 'admin',
    });
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

  it('handles deployment failure when record.status is not SUCCESS', async () => {
    (api.deployService as any).mockResolvedValueOnce({
      id: 100,
      service_id: 10,
      artifact_id: 2,
      action: 'DEPLOY',
      operator: 'admin',
      client_ip: '127.0.0.1',
      status: 'FAILED',
      output_log: '[12:00:00.000] Step 1: Pre-flight check passed\n[12:00:05.000] Step 6: Health check timed out',
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

    fireEvent.click(screen.getByText(/选择已有历史版本/i));
    await waitFor(() => {
      expect(screen.getByText('order-service-v1.1.jar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('order-service-v1.1.jar'));

    const deployBtn = screen.getByRole('button', { name: /开始执行 7 步部署/i });
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(screen.getByText('流水线异常中断')).toBeInTheDocument();
      expect(screen.getByText('流水线异常中断').parentElement).toHaveTextContent(/Health check timed out/i);
    });
    expect(screen.queryByText(/部署成功/i)).not.toBeInTheDocument();
  });




  it('resets state when visible becomes false and true again', async () => {
    const { rerender } = render(
      <DeployWizardModal
        visible={true}
        serviceName="order-service"
        currentStep={4}
        onClose={() => {}}
      />
    );

    // Re-render as invisible then visible with currentStep 1
    rerender(
      <DeployWizardModal
        visible={false}
        serviceName="order-service"
        onClose={() => {}}
      />
    );

    rerender(
      <DeployWizardModal
        visible={true}
        serviceName="order-service"
        currentStep={1}
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/1. 预检/i)).toBeInTheDocument();
  });

  it('displays permission warning banner when checkDeployPermission returns has_permission: false', async () => {
    (api.checkDeployPermission as any).mockResolvedValue({
      has_permission: false,
      type: 'directory_permission',
      install_dir: '/opt/apps/order-service',
      error: '无法创建安装目录 /opt/apps/order-service: permission denied',
      suggestion: 'sudo mkdir -p /opt/apps/order-service && sudo chown -R $(whoami) /opt/apps/order-service',
    });

    render(
      <DeployWizardModal
        visible={true}
        serviceId={10}
        serviceName="order-service"
        currentStep={1}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/宿主机发版权限预检未通过/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/无法创建安装目录 \/opt\/apps\/order-service: permission denied/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sudo mkdir -p \/opt\/apps\/order-service/i)
    ).toBeInTheDocument();
  });

  it('allows admin to delete historical artifact in existing artifacts tab', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'admin' }));
    (api.deleteArtifact as any).mockResolvedValue({ message: 'artifact deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <DeployWizardModal
        visible={true}
        serviceId={10}
        currentArtifactId={1}
        onClose={() => {}}
      />
    );

    // Click tab to view existing artifacts
    await waitFor(() => {
      expect(screen.getByText(/选择已有历史版本/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/选择已有历史版本/i));

    // Wait for artifacts to load
    await waitFor(() => {
      expect(screen.getByText('order-service-v1.1.jar')).toBeInTheDocument();
    });

    // Artifact 2 is historical (not currentArtifactId 1), should have delete button
    const delBtn = screen.getByTitle('删除历史制品包（仅管理员）');
    expect(delBtn).toBeInTheDocument();

    fireEvent.click(delBtn);

    await waitFor(() => {
      expect(api.deleteArtifact).toHaveBeenCalledWith(10, 2);
    });
  });

  it('hides delete artifact button for non-admin operator users', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'operator', permissions: ['service:deploy'] }));

    render(
      <DeployWizardModal
        visible={true}
        serviceId={10}
        currentArtifactId={1}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/选择已有历史版本/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/选择已有历史版本/i));

    await waitFor(() => {
      expect(screen.getByText('order-service-v1.1.jar')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('删除历史制品包（仅管理员）')).not.toBeInTheDocument();
  });
});

