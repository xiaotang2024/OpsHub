import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TemplateEditorModal } from './TemplateEditorModal';

describe('TemplateEditorModal', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSave: mockOnSave,
    jdkList: [
      { id: 1, name: 'OpenJDK 17', java_home: '/usr/lib/jvm/java-17', bin_path: '/bin/java', version_str: '17.0.2', is_system: true },
      { id: 2, name: 'OpenJDK 21', java_home: '/usr/lib/jvm/java-21', bin_path: '/bin/java', version_str: '21.0.1', is_system: false },
    ],
  };

  it('renders modal with title, basic fields and visual JVM tuner', () => {
    render(<TemplateEditorModal {...defaultProps} />);

    expect(screen.getByText(/配置部署模板/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/模板名称/i)).toBeInTheDocument();
    expect(screen.getByText(/JVM 内存与 GC 调优/i)).toBeInTheDocument();
    expect(screen.getByText(/实时 JVM 参数预览/i)).toBeInTheDocument();
  });

  it('updates dynamic preview box when selecting different GC algorithms', () => {
    render(<TemplateEditorModal {...defaultProps} />);

    // Default GC is G1 -> should show -XX:+UseG1GC
    expect(screen.getByTestId('jvm-preview-text')).toHaveTextContent(/-XX:\+UseG1GC/i);

    // Click ZGC button
    const zgcBtn = screen.getByRole('button', { name: /ZGC/i });
    fireEvent.click(zgcBtn);

    expect(screen.getByTestId('jvm-preview-text')).toHaveTextContent(/-XX:\+UseZGC/i);
  });

  it('updates dynamic preview box when changing heap sliders', () => {
    render(<TemplateEditorModal {...defaultProps} />);

    const heapMinSlider = screen.getByLabelText(/堆初始内存 \(Xms\)/i);
    fireEvent.change(heapMinSlider, { target: { value: '1024' } });

    expect(screen.getByTestId('jvm-preview-text')).toHaveTextContent(/-Xms1024m|-Xms1g/i);
  });

  it('submits form with compiled options and calls onSave', async () => {
    mockOnSave.mockResolvedValueOnce(undefined);
    render(<TemplateEditorModal {...defaultProps} />);

    const nameInput = screen.getByLabelText(/模板名称/i);
    fireEvent.change(nameInput, { target: { value: 'Production-Jar-Template' } });

    const submitBtn = screen.getByRole('button', { name: /保存模板/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    const callArg = mockOnSave.mock.calls[0][0];
    expect(callArg.name).toBe('Production-Jar-Template');
    expect(callArg.jvm_options).toContain('-Xms');
    expect(callArg.jvm_options).toContain('-Xmx');
    const healthConfig = JSON.parse(callArg.health_check_config);
    expect(healthConfig.type).toBe('http');
    expect(healthConfig.port).toBeUndefined();
    expect(healthConfig.path).toBe('/actuator/health');
  });

  it('conditionally displays probe path or informational cards based on healthType', () => {
    render(<TemplateEditorModal {...defaultProps} />);

    const healthTypeSelect = screen.getByLabelText(/探针协议/i);

    // 1. Default is 'http': path is visible, port is hidden
    expect(screen.queryByLabelText(/探测端口/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/HTTP 探测路径/i)).toBeInTheDocument();
    expect(screen.queryByText(/自动探测具体服务实例配置的主监听端口/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/通过系统内核检测进程存活性/i)).not.toBeInTheDocument();

    // 2. Change to 'tcp': both port and path inputs are hidden, TCP notice is displayed
    fireEvent.change(healthTypeSelect, { target: { value: 'tcp' } });
    expect(screen.queryByLabelText(/探测端口/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/HTTP 探测路径/i)).not.toBeInTheDocument();
    expect(screen.getByText(/自动探测具体服务实例配置的主监听端口连通性/i)).toBeInTheDocument();
    expect(screen.queryByText(/通过系统内核检测进程存活性/i)).not.toBeInTheDocument();

    // 3. Change to 'process': both port and path are hidden, process notice is displayed
    fireEvent.change(healthTypeSelect, { target: { value: 'process' } });
    expect(screen.queryByLabelText(/探测端口/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/HTTP 探测路径/i)).not.toBeInTheDocument();
    expect(screen.getByText(/通过系统内核检测进程存活性，无需监听或探测网络端口/i)).toBeInTheDocument();
  });

  it('omits port and path for tcp in saved health_check_config for universal template reuse', async () => {
    mockOnSave.mockReset();
    mockOnSave.mockResolvedValue(undefined);
    render(<TemplateEditorModal {...defaultProps} />);

    const nameInput = screen.getByLabelText(/模板名称/i);
    fireEvent.change(nameInput, { target: { value: 'TCP-Template' } });

    const healthTypeSelect = screen.getByLabelText(/探针协议/i);
    fireEvent.change(healthTypeSelect, { target: { value: 'tcp' } });

    const submitBtn = screen.getByRole('button', { name: /保存模板/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    const savedConfig = JSON.parse(mockOnSave.mock.calls[0][0].health_check_config);
    expect(savedConfig.type).toBe('tcp');
    expect(savedConfig.port).toBeUndefined();
    expect(savedConfig.path).toBeUndefined();
  });

  it('omits port and path for process in saved health_check_config', async () => {
    mockOnSave.mockReset();
    mockOnSave.mockResolvedValue(undefined);
    render(<TemplateEditorModal {...defaultProps} />);

    const nameInput = screen.getByLabelText(/模板名称/i);
    fireEvent.change(nameInput, { target: { value: 'Process-Template' } });

    const healthTypeSelect = screen.getByLabelText(/探针协议/i);
    fireEvent.change(healthTypeSelect, { target: { value: 'process' } });

    const submitBtn = screen.getByRole('button', { name: /保存模板/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    const savedConfig = JSON.parse(mockOnSave.mock.calls[0][0].health_check_config);
    expect(savedConfig.type).toBe('process');
    expect(savedConfig.port).toBeUndefined();
    expect(savedConfig.path).toBeUndefined();
  });

  it('renders built-in placeholders tooltip and dynamically updates start-cmd placeholder for generic_archive', () => {
    render(<TemplateEditorModal {...defaultProps} />);

    // 1. Check help trigger exists
    expect(screen.getByText(/内置变量说明/i)).toBeInTheDocument();
    expect(screen.getByText(/\${JAVA_BIN}/i)).toBeInTheDocument();
    expect(screen.getByText(/\${INSTALL_DIR}/i)).toBeInTheDocument();

    // 2. Default placeholder for java_jar
    const startCmdInput = screen.getByLabelText(/启动命令重载/i);
    expect(startCmdInput).toHaveAttribute('placeholder', expect.stringContaining('${JAVA_BIN}'));

    // 3. Switch to generic_archive
    const typeSelect = screen.getByLabelText(/工程制品类型/i);
    fireEvent.change(typeSelect, { target: { value: 'generic_archive' } });

    // Placeholder now reflects startup.sh
    expect(startCmdInput).toHaveAttribute('placeholder', expect.stringContaining('startup.sh'));

    // 4. Click a variable in the tooltip to insert it into start-cmd
    const javaBinBadge = screen.getByText(/\${JAVA_BIN}/i);
    fireEvent.click(javaBinBadge);
    expect(startCmdInput).toHaveValue('${JAVA_BIN}');
  });
});

