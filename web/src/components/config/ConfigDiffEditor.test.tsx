import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigDiffEditor } from './ConfigDiffEditor';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getServiceConfigs: vi.fn(),
    saveServiceConfig: vi.fn(),
  },
}));

describe('ConfigDiffEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getServiceConfigs as any).mockImplementation((_serviceId: number, file?: string) => {
      if (!file) {
        return Promise.resolve({
          files: ['application.yml', 'application-prod.yml'],
        });
      }
      if (file === 'application.yml') {
        return Promise.resolve({
          file: 'application.yml',
          content: 'server:\n  port: 8080\nspring:\n  profiles: active\n',
        });
      }
      return Promise.resolve({
        file,
        content: 'custom: true\n',
      });
    });

    (api.saveServiceConfig as any).mockResolvedValue({
      message: 'config saved successfully',
      file: 'application.yml',
      backup: '/opt/apps/order-center/application.yml.bak',
    });
  });

  it('renders file selector dropdown and warning banner', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml', 'application-prod.yml']} />);

    expect(screen.getByText(/修改后需重启服务以使配置生效/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue('application.yml')).toBeInTheDocument();
    });
  });

  it('loads file content and enables diff view when edits are made', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    let textarea!: HTMLTextAreaElement;
    await waitFor(() => {
      textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('port: 8080');
    });

    fireEvent.change(textarea, {
      target: { value: 'server:\n  port: 9090\nspring:\n  profiles: active\n' },
    });

    // Switch to diff view tab
    const diffTab = screen.getByRole('button', { name: /差异对比/i });
    fireEvent.click(diffTab);

    // Diff view should highlight the changes
    expect(screen.getByText(/port: 9090/)).toBeInTheDocument();
    expect(screen.getByText(/port: 8080/)).toBeInTheDocument();
  });

  it('saves modified config and shows backup notification', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    let textarea!: HTMLTextAreaElement;
    await waitFor(() => {
      textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('port: 8080');
    });

    fireEvent.change(textarea, {
      target: { value: 'server:\n  port: 9090\nspring:\n  profiles: active\n' },
    });

    // Click Save button
    const saveBtn = screen.getByRole('button', { name: /保存修改/i });
    fireEvent.click(saveBtn);

    // Confirmation modal appears
    const confirmBtn = screen.getByRole('button', { name: /确认保存/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.saveServiceConfig).toHaveBeenCalledWith(
        10,
        'application.yml',
        'server:\n  port: 9090\nspring:\n  profiles: active\n'
      );
    });

    // Check backup notification
    await waitFor(() => {
      expect(screen.getByText(/已成功生成安全备份/i)).toBeInTheDocument();
    });
  });

  it('allows reverting unsaved changes', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    let textarea!: HTMLTextAreaElement;
    await waitFor(() => {
      textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('port: 8080');
    });

    fireEvent.change(textarea, {
      target: { value: 'temp content that will be reverted' },
    });
    expect(textarea.value).toBe('temp content that will be reverted');

    const revertBtn = screen.getByRole('button', { name: /放弃修改/i });
    fireEvent.click(revertBtn);

    expect(textarea.value).toContain('port: 8080');
  });
});
