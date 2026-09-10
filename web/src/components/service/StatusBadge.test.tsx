import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import { describe, it, expect } from 'vitest';

describe('StatusBadge', () => {
  it('renders running status with emerald badge and pulsing dot', () => {
    const { container } = render(<StatusBadge status="RUNNING" />);
    expect(screen.getByText(/运行中/i)).toBeInTheDocument();
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
  });

  it('renders starting status with amber spinner and live text', () => {
    const { container } = render(<StatusBadge status="STARTING" />);
    expect(screen.getByText(/启动中/i)).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders stopped status with subtle indicator', () => {
    render(<StatusBadge status="STOPPED" />);
    expect(screen.getByText(/已停止/i)).toBeInTheDocument();
  });

  it('renders failed status with alert beacon', () => {
    render(<StatusBadge status="FAILED" />);
    expect(screen.getByText(/异常/i)).toBeInTheDocument();
  });
});
