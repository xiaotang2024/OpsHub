import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProcessTelemetryCard } from './ProcessTelemetryCard';
import { describe, it, expect, vi } from 'vitest';

describe('ProcessTelemetryCard', () => {
  it('renders PID, CPU percentage, and RSS memory values', () => {
    render(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={14.5}
        memoryRssMb={512}
        uptime="2h 15m"
      />
    );
    expect(screen.getByText(/18293/i)).toBeInTheDocument();
    expect(screen.getByText(/14.5%/i)).toBeInTheDocument();
    expect(screen.getByText(/512 MB/i)).toBeInTheDocument();
  });

  it('renders uptime ticker and status', () => {
    render(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={42.0}
        memoryRssMb={1024}
        uptime="3d 4h 12m"
        status="RUNNING"
      />
    );
    expect(screen.getByText(/3d 4h 12m/i)).toBeInTheDocument();
    expect(screen.getByText(/RUNNING/i)).toBeInTheDocument();
  });

  it('copies PID to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={14.5}
        memoryRssMb={512}
        uptime="2h 15m"
      />
    );

    const copyBtn = screen.getByRole('button', { name: /copy-pid/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeTextMock).toHaveBeenCalledWith('18293');
  });

  it('applies color shift for CPU load thresholds', () => {
    const { rerender } = render(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={25}
        memoryRssMb={256}
        uptime="10m"
      />
    );
    // < 60%: emerald class or color
    expect(screen.getByTestId('cpu-gauge')).toHaveAttribute('data-level', 'low');

    rerender(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={72}
        memoryRssMb={256}
        uptime="10m"
      />
    );
    // 60-85%: amber
    expect(screen.getByTestId('cpu-gauge')).toHaveAttribute('data-level', 'medium');

    rerender(
      <ProcessTelemetryCard
        pid={18293}
        cpuPercent={92}
        memoryRssMb={256}
        uptime="10m"
      />
    );
    // > 85%: crimson/high
    expect(screen.getByTestId('cpu-gauge')).toHaveAttribute('data-level', 'high');
  });

  it('ticks uptime dynamically in real time when status is RUNNING', () => {
    vi.useFakeTimers();
    try {
      render(
        <ProcessTelemetryCard
          pid={18293}
          cpuPercent={15}
          memoryRssMb={256}
          uptime="02:15"
          status="RUNNING"
        />
      );

      expect(screen.getByText(/02:15/i)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/02:16/i)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText(/02:18/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders stopped state when service is not running', () => {
    render(
      <ProcessTelemetryCard
        pid={0}
        cpuPercent={0}
        memoryRssMb={0}
        uptime="stopped"
        status="STOPPED"
      />
    );

    expect(screen.getByText('未运行')).toBeInTheDocument();
    expect(screen.getByText('STOPPED')).toBeInTheDocument();
  });
});

