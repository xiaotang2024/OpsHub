import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { TemplateList } from './TemplateList';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getJDKs: vi.fn(),
    createService: vi.fn(),
  },
}));

describe('TemplateList Component', () => {
  const mockTemplates = [
    {
      id: 1,
      name: 'Standard-SpringBoot',
      type: 'java_jar',
      default_jdk_id: 1,
      install_dir_pattern: '/opt/apps/${SERVICE_NAME}',
      jvm_options: '-Xms1g -Xmx2g -XX:+UseG1GC',
      env_vars: 'SPRING_PROFILES_ACTIVE=prod',
      supervision_mode: 'native',
      start_cmd: '',
      stop_cmd: '',
      health_check_config: '{"type":"http","port":8080,"path":"/health"}',
      uninstall_rules: '',
    },
    {
      id: 2,
      name: 'Generic-Microservice',
      type: 'generic_archive',
      default_jdk_id: null,
      install_dir_pattern: '/opt/apps/${SERVICE_NAME}',
      jvm_options: '-Xms2g -Xmx4g -XX:+UseG1GC',
      env_vars: '',
      supervision_mode: 'systemd',
      start_cmd: '',
      stop_cmd: '',
      health_check_config: '',
      uninstall_rules: '',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
    vi.clearAllMocks();
    (api.getTemplates as any).mockResolvedValue(mockTemplates);
    (api.getJDKs as any).mockResolvedValue([{ id: 1, name: 'OpenJDK 17', version_str: '17.0.2' }]);
  });

  it('renders template list cards with names and action buttons', async () => {
    render(
      <BrowserRouter>
        <TemplateList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Standard-SpringBoot')).toBeInTheDocument();
      expect(screen.getByText('Generic-Microservice')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: /编辑/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /基于此模板创建服务/i })).toHaveLength(2);
  });

  it('filters templates when searching by name', async () => {
    render(
      <BrowserRouter>
        <TemplateList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Standard-SpringBoot')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/搜索模板名称/i);
    fireEvent.change(searchInput, { target: { value: 'Microservice' } });

    expect(screen.queryByText('Standard-SpringBoot')).not.toBeInTheDocument();
    expect(screen.getByText('Generic-Microservice')).toBeInTheDocument();
  });

  it('opens TemplateEditorModal when clicking 新建模板', async () => {
    render(
      <BrowserRouter>
        <TemplateList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Standard-SpringBoot')).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /新建模板/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/配置部署模板/i)).toBeInTheDocument();
  });

  describe('Permission Guarding', () => {
    it('disables 新建模板, 编辑, and 删除 buttons with tooltip when user lacks template:manage permission', async () => {
      localStorage.setItem(
        'opshub_user',
        JSON.stringify({
          username: 'operator1',
          role: 'operator',
          permissions: ['service:view'],
        })
      );

      render(
        <BrowserRouter>
          <TemplateList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Standard-SpringBoot')).toBeInTheDocument();
      });

      // "新建模板" should be disabled
      const createBtn = screen.getByRole('button', { name: /新建模板/i });
      expect(createBtn).toBeDisabled();

      // "编辑" and "删除" buttons should be disabled
      const editButtons = screen.getAllByRole('button', { name: /编辑/i });
      editButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });

        const deleteButtons = screen.getAllByRole('button', { name: /删除/i });
        deleteButtons.forEach((btn) => {
          expect(btn).toBeDisabled();
        });

        // Tooltips for template management
        const tooltips = screen.getAllByTitle(/无模板管理权限/i);
        expect(tooltips.length).toBeGreaterThanOrEqual(3);
      });

      it('opens ConfirmModal and deletes template on confirmation for authorized user', async () => {
        localStorage.setItem(
          'opshub_user',
          JSON.stringify({
            username: 'admin',
            role: 'admin',
            permissions: [],
          })
        );
        (api.deleteTemplate as any).mockResolvedValue({ message: 'template deleted' });

        render(
          <BrowserRouter>
            <TemplateList />
          </BrowserRouter>
        );

        await waitFor(() => {
          expect(screen.getByText('Standard-SpringBoot')).toBeInTheDocument();
        });

        const deleteButtons = screen.getAllByRole('button', { name: /删除/i });
        fireEvent.click(deleteButtons[0]);

        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText(/确定要彻底删除部署模板/i)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('confirm-modal-btn'));

        await waitFor(() => {
          expect(api.deleteTemplate).toHaveBeenCalledWith(1);
        });
      });
    });
  });

