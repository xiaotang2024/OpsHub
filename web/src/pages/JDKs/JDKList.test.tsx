import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { JDKList } from './JDKList';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getJDKs: vi.fn(),
    createJDK: vi.fn(),
    scanJDKs: vi.fn(),
    deleteJDK: vi.fn(),
  },
}));

describe('JDKList Component', () => {
  const mockJDKs = [
    {
      id: 1,
      name: 'OpenJDK 17',
      version_str: '17.0.10',
      java_home: '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
      bin_path: '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java',
      is_system: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Corretto 21',
      version_str: '21.0.2',
      java_home: '/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home',
      bin_path: '/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home/bin/java',
      is_system: false,
      created_at: '2026-01-02T00:00:00Z',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
    vi.clearAllMocks();
    (api.getJDKs as any).mockResolvedValue(mockJDKs);
  });

  it('renders JDK asset cards and statistics', async () => {
    render(
      <BrowserRouter>
        <JDKList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenJDK 17')).toBeInTheDocument();
      expect(screen.getByText('Corretto 21')).toBeInTheDocument();
    });

    expect(screen.getByText('17.0.10')).toBeInTheDocument();
    expect(screen.getByText('21.0.2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /扫描系统 JDK/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /注册 JDK/i })).toBeInTheDocument();
  });

  it('filters JDK list when searching', async () => {
    render(
      <BrowserRouter>
        <JDKList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenJDK 17')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/按 JDK 名称、版本号、JAVA_HOME 快速检索/i);
    fireEvent.change(searchInput, { target: { value: 'Corretto' } });

    expect(screen.queryByText('OpenJDK 17')).not.toBeInTheDocument();
    expect(screen.getByText('Corretto 21')).toBeInTheDocument();
  });

  it('opens registration modal and registers a new JDK manually', async () => {
    (api.createJDK as any).mockResolvedValue({ id: 3, name: 'Custom JDK 8' });

    render(
      <BrowserRouter>
        <JDKList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenJDK 17')).toBeInTheDocument();
    });

    // Click "注册 JDK"
    const registerBtn = screen.getByRole('button', { name: /注册 JDK/i });
    fireEvent.click(registerBtn);

    // Modal title should appear
    expect(screen.getByText('注册 JDK 资产')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/例如: OpenJDK-17-LTS/i), {
      target: { value: 'Custom JDK 8' },
    });
    fireEvent.change(screen.getByPlaceholderText(/例如: \/usr\/lib\/jvm\/java-17-openjdk/i), {
      target: { value: '/usr/local/opt/openjdk@8' },
    });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /^确认注册$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createJDK).toHaveBeenCalledWith({
        name: 'Custom JDK 8',
        java_home: '/usr/local/opt/openjdk@8',
        bin_path: undefined,
        version_str: undefined,
        is_system: false,
      });
    });
  });

  it('opens scan modal and registers discovered JDKs', async () => {
    const discovered = [
      {
        name: 'Discovered JDK 11',
        version_str: '11.0.22',
        java_home: '/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home',
        bin_path: '/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home/bin/java',
        is_system: true,
      },
    ];
    (api.scanJDKs as any).mockResolvedValue(discovered);
    (api.createJDK as any).mockResolvedValue({ id: 4, name: 'Discovered JDK 11' });

    render(
      <BrowserRouter>
        <JDKList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('OpenJDK 17')).toBeInTheDocument();
    });

    // Click "扫描系统 JDK"
    const scanBtn = screen.getByRole('button', { name: /扫描系统 JDK/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(api.scanJDKs).toHaveBeenCalled();
      expect(screen.getByText('系统 JDK 自动扫描发现')).toBeInTheDocument();
      expect(screen.getByText('Discovered JDK 11')).toBeInTheDocument();
    });

    // Click "一键入库"
    const importBtn = screen.getByRole('button', { name: /一键入库/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(api.createJDK).toHaveBeenCalledWith({
        name: 'Discovered JDK 11',
        java_home: '/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home',
        bin_path: '/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home/bin/java',
        version_str: '11.0.22',
        is_system: true,
      });
    });
  });

  it('opens delete confirmation modal and deletes a JDK', async () => {
    (api.deleteJDK as any).mockResolvedValue({});

    render(
      <BrowserRouter>
        <JDKList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Corretto 21')).toBeInTheDocument();
    });

    // Click delete button on Corretto 21
    const deleteButtons = screen.getAllByTitle('注销该 JDK 资产');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[1]); // Corretto 21

    await waitFor(() => {
      expect(screen.getByText('确认注销该 JDK 资产？')).toBeInTheDocument();
    });

    // Click confirm delete
    const confirmBtn = screen.getByRole('button', { name: /确认注销/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteJDK).toHaveBeenCalledWith(2);
    });
  });

  describe('Permission Guarding', () => {
    it('disables 扫描系统 JDK and 注册 JDK buttons with tooltip when user lacks jdk:manage permission', async () => {
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
          <JDKList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('OpenJDK 17')).toBeInTheDocument();
      });

      const scanBtn = screen.getByRole('button', { name: /扫描系统 JDK/i });
      const registerBtn = screen.getByRole('button', { name: /注册 JDK/i });

      expect(scanBtn).toBeDisabled();
      expect(registerBtn).toBeDisabled();

      const tooltips = screen.getAllByTitle(/无 JDK 管理权限/i);
      expect(tooltips.length).toBeGreaterThanOrEqual(2);
    });

    it('disables 注销 JDK button with tooltip when user lacks jdk:manage permission', async () => {
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
          <JDKList />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Corretto 21')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /注销 JDK/i });
      expect(deleteButtons.length).toBeGreaterThan(0);
      deleteButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });

      const tooltips = screen.getAllByTitle(/无 JDK 管理权限/i);
      expect(tooltips.length).toBeGreaterThanOrEqual(1);
    });
  });
});
