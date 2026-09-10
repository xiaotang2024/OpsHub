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
  });
});
