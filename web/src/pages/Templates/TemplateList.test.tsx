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
      name: 'Legacy-Tomcat-War',
      type: 'java_war',
      default_jdk_id: null,
      install_dir_pattern: '/opt/tomcat/webapps/${SERVICE_NAME}',
      jvm_options: '-Xms2g -Xmx4g -XX:+UseParallelGC',
      env_vars: '',
      supervision_mode: 'systemd',
      start_cmd: '',
      stop_cmd: '',
      health_check_config: '',
      uninstall_rules: '',
    },
  ];

  beforeEach(() => {
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
      expect(screen.getByText('Legacy-Tomcat-War')).toBeInTheDocument();
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
    fireEvent.change(searchInput, { target: { value: 'Tomcat' } });

    expect(screen.queryByText('Standard-SpringBoot')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy-Tomcat-War')).toBeInTheDocument();
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
});
