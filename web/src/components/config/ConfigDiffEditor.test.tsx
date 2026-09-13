import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigDiffEditor } from './ConfigDiffEditor';
import { api } from '../../api';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../../api', () => ({
  api: {
    getServiceConfigs: vi.fn(),
    saveServiceConfig: vi.fn(),
    deleteConfig: vi.fn(),
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

  it('renders file selector with name and suffix dropdowns and warning banner', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml', 'application-prod.yml']} />);

    expect(screen.getByText(/修改后需重启服务以使配置生效/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('config-name-select')).toHaveValue('application');
      expect(screen.getByTestId('config-suffix-select')).toHaveValue('yml');
      expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application.yml');
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

    // Check backup notification toast
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '配置保存成功！',
        expect.objectContaining({
          description: expect.stringContaining('/opt/apps/order-center/application.yml.bak'),
        })
      );
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

  it('synchronizes line number gutter on textarea scroll', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    let textarea!: HTMLTextAreaElement;
    await waitFor(() => {
      textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('port: 8080');
    });

    fireEvent.scroll(textarea, { target: { scrollTop: 120 } });
    expect(textarea.scrollTop).toBe(120);
  });

  it('supports toggling between side-by-side and unified diff views', async () => {
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

    // Default is side-by-side view with header columns
    expect(screen.getByText(/原始配置/i)).toBeInTheDocument();
    expect(screen.getByText(/待保存配置/i)).toBeInTheDocument();

    // Switch to unified view
    const unifiedBtn = screen.getByRole('button', { name: /行内/i });
    fireEvent.click(unifiedBtn);

    expect(screen.getByText(/port: 9090/)).toBeInTheDocument();
    expect(screen.getByText(/port: 8080/)).toBeInTheDocument();
  });

  it('allows changing suffix to yaml or properties and loads corresponding file', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    await waitFor(() => {
      expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application.yml');
    });

    const suffixSelect = screen.getByTestId('config-suffix-select');
    fireEvent.change(suffixSelect, { target: { value: 'yaml' } });

    await waitFor(() => {
      expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application.yaml');
      expect(api.getServiceConfigs).toHaveBeenCalledWith(10, 'application.yaml');
    });

    fireEvent.change(suffixSelect, { target: { value: 'properties' } });

    await waitFor(() => {
      expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application.properties');
      expect(api.getServiceConfigs).toHaveBeenCalledWith(10, 'application.properties');
    });
  });

  it('allows selecting different profile name such as application-dev', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    await waitFor(() => {
      expect(screen.getByTestId('config-name-select')).toHaveValue('application');
    });

    const nameSelect = screen.getByTestId('config-name-select');
    fireEvent.change(nameSelect, { target: { value: 'application-dev' } });

    await waitFor(() => {
      expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application-dev.yml');
    });
  });

  it('allows selecting "自定义名称", typing name and saving directly', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    await waitFor(() => {
      expect(screen.getByTestId('config-name-select')).toHaveValue('application');
    });

    // Select "自定义名称" from dropdown
    fireEvent.change(screen.getByTestId('config-name-select'), {
      target: { value: '__custom__' },
    });

    const input = screen.getByTestId('config-custom-name-input');
    expect(input).toBeInTheDocument();

    // Type invalid name with path traversal and attempt save
    fireEvent.change(input, { target: { value: '../bad_name' } });
    const saveBtn = screen.getByRole('button', { name: /保存修改/i });
    fireEvent.click(saveBtn);
    expect(screen.getByText(/配置名称不能包含路径分隔符/i)).toBeInTheDocument();

    // Now type valid name: bootstrap
    fireEvent.change(input, { target: { value: 'bootstrap' } });
    expect(screen.getByTestId('config-current-filename')).toHaveTextContent('bootstrap.yml');

    // Type config content into editor
    const textarea = screen.getByTestId('config-editor-textarea');
    fireEvent.change(textarea, { target: { value: 'spring:\n  application:\n    name: demo\n' } });

    // Directly click save
    fireEvent.click(saveBtn);

    // Confirm modal appears
    const confirmBtn = screen.getByRole('button', { name: /确认保存/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.saveServiceConfig).toHaveBeenCalledWith(
        10,
        'bootstrap.yml',
        'spring:\n  application:\n    name: demo\n'
      );
    });

    // Custom name is now in the dropdown list and selected
    await waitFor(() => {
      expect(screen.getByTestId('config-name-select')).toHaveValue('bootstrap');
    });
  });

  it('gracefully handles 404 for new files and enables saving them to disk', async () => {
    (api.getServiceConfigs as any).mockImplementation((_serviceId: number, file?: string) => {
      if (file === 'application-dev.yaml') {
        const err: any = new Error('config file not found');
        err.status = 404;
        return Promise.reject(err);
      }
      return Promise.resolve({
        file: file || 'application.yml',
        content: 'server:\n  port: 8080\n',
      });
    });

    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    await waitFor(() => {
      expect(screen.getByTestId('config-name-select')).toHaveValue('application');
    });

    // Switch name to application-dev
    fireEvent.change(screen.getByTestId('config-name-select'), {
      target: { value: 'application-dev' },
    });

    // Switch suffix to yaml
    fireEvent.change(screen.getByTestId('config-suffix-select'), {
      target: { value: 'yaml' },
    });

    expect(screen.getByTestId('config-current-filename')).toHaveTextContent('application-dev.yaml');

    // Verify badge appears indicating new file
    await waitFor(() => {
      expect(screen.getByText(/新文件 \(保存后生成\)/i)).toBeInTheDocument();
    });

    // Empty buffer ready for typing
    const textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, {
      target: { value: 'spring:\n  profiles:\n    active: dev\n' },
    });

    // Save
    fireEvent.click(screen.getByRole('button', { name: /保存修改/i }));
    fireEvent.click(screen.getByRole('button', { name: /确认保存/i }));

    await waitFor(() => {
      expect(api.saveServiceConfig).toHaveBeenCalledWith(
        10,
        'application-dev.yaml',
        'spring:\n  profiles:\n    active: dev\n'
      );
    });
  });

  it('disables saving and makes editor read-only when readOnly prop is true', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} readOnly={true} />);

    await waitFor(() => {
      const textarea = screen.getByTestId('config-editor-textarea') as HTMLTextAreaElement;
      expect(textarea).toHaveAttribute('readonly');
    });

    const saveBtn = screen.getByRole('button', { name: /保存修改/i });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByTitle('无配置修改权限，请联系管理员授予')).toBeInTheDocument();
  });

  it('renders config effect and port priority hover tooltip with guidance', async () => {
    render(<ConfigDiffEditor serviceId={10} files={['application.yml']} />);

    await waitFor(() => {
      // Trigger button should be present
      expect(screen.getByText(/配置生效与优先级说明/i)).toBeInTheDocument();

      // Tooltip content items should be present in document
      expect(screen.getByText(/配置文件生效范围/i)).toBeInTheDocument();
      expect(screen.getAllByText(/监听端口/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/server\.port/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/服务矩阵/i)).toBeInTheDocument();
    });
  });

  it('allows admin to view backups and delete backup snapshot', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'admin' }));
    (api.deleteConfig as any).mockResolvedValue({ message: 'backup deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <ConfigDiffEditor
        serviceId={10}
        files={['application.yml']}
        backups={[{ file: 'application.yml.bak.20260913', size: 2048, updated_at: '2026-09-13 19:00:00' }]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('config-backups-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('config-backups-button'));

    expect(screen.getByTestId('config-backups-dropdown')).toBeInTheDocument();
    expect(screen.getByText('application.yml.bak.20260913')).toBeInTheDocument();

    const delBackupBtn = screen.getByTestId('delete-backup-application.yml.bak.20260913');
    fireEvent.click(delBackupBtn);

    await waitFor(() => {
      expect(api.deleteConfig).toHaveBeenCalledWith(10, 'application.yml.bak.20260913');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('已成功删除'));
    });
  });

  it('allows admin to delete an existing configuration file from disk', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'admin' }));
    (api.deleteConfig as any).mockResolvedValue({ message: 'config deleted' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleteSuccess = vi.fn();

    render(
      <ConfigDiffEditor
        serviceId={10}
        files={['application.yml', 'application-prod.yml']}
        onDeleteSuccess={onDeleteSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-current-config-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('delete-current-config-button'));

    await waitFor(() => {
      expect(api.deleteConfig).toHaveBeenCalledWith(10, 'application.yml');
      expect(onDeleteSuccess).toHaveBeenCalledWith('application.yml');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('已成功删除'));
    });
  });

  it('hides delete buttons for non-admin operator users', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ role: 'operator', permissions: ['service:config'] }));

    render(
      <ConfigDiffEditor
        serviceId={10}
        files={['application.yml']}
        backups={[{ file: 'application.yml.bak.20260913', size: 2048, updated_at: '2026-09-13 19:00:00' }]}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId('delete-current-config-button')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('config-backups-button'));
    expect(screen.getByTestId('config-backups-dropdown')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-backup-application.yml.bak.20260913')).not.toBeInTheDocument();
  });
});
