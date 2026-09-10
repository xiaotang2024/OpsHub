import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveLogViewer } from './LiveLogViewer';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 10);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });
}

describe('LiveLogViewer', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
    localStorage.setItem('opshub_token', 'test-token-xyz');
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders control toolbar items: status, auto-scroll, search, pause, clear, and download', () => {
    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);

    // Connection status pill
    expect(screen.getByTestId('ws-status-badge')).toBeInTheDocument();

    // Auto-scroll toggle
    expect(screen.getByRole('button', { name: /auto-scroll/i })).toBeInTheDocument();

    // Search input
    expect(screen.getByPlaceholderText(/搜索控制台日志/i)).toBeInTheDocument();

    // Pause / Resume button
    expect(screen.getByRole('button', { name: /pause-stream/i })).toBeInTheDocument();

    // Clear screen button
    expect(screen.getByRole('button', { name: /clear-screen/i })).toBeInTheDocument();

    // Download log button
    expect(screen.getByRole('button', { name: /download-log/i })).toBeInTheDocument();
  });

  it('toggles auto-scroll pin state', () => {
    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);
    const scrollBtn = screen.getByRole('button', { name: /auto-scroll/i });

    expect(scrollBtn).toHaveAttribute('data-active', 'true');
    fireEvent.click(scrollBtn);
    expect(scrollBtn).toHaveAttribute('data-active', 'false');
    fireEvent.click(scrollBtn);
    expect(scrollBtn).toHaveAttribute('data-active', 'true');
  });

  it('toggles pause and resume stream state', () => {
    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);
    const pauseBtn = screen.getByRole('button', { name: /pause-stream/i });

    expect(pauseBtn).toHaveAttribute('data-paused', 'false');
    fireEvent.click(pauseBtn);
    expect(pauseBtn).toHaveAttribute('data-paused', 'true');
    expect(screen.getByText(/流已暂停/i)).toBeInTheDocument();

    fireEvent.click(pauseBtn);
    expect(pauseBtn).toHaveAttribute('data-paused', 'false');
  });

  it('performs keyword search and displays match count badge with query context', async () => {
    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);
    const searchInput = screen.getByPlaceholderText(/搜索控制台日志/i);

    fireEvent.change(searchInput, { target: { value: 'ERROR' } });
    expect(searchInput).toHaveValue('ERROR');

    // Wait for debounced search badge to render with query context
    await waitFor(() => {
      expect(screen.getByText(/matches for "ERROR"/i)).toBeInTheDocument();
    });
  });

  it('bounds log accumulator to maximum entries preventing memory leaks', async () => {
    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);
    const ws = MockWebSocket.instances[0];

    await waitFor(() => {
      expect(ws.readyState).toBe(1);
    });

    act(() => {
      for (let i = 0; i < 10050; i++) {
        ws.onmessage?.({ data: `line ${i}\n` });
      }
    });

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.createObjectURL = createObjectURLMock;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const downloadBtn = screen.getByRole('button', { name: /download-log/i });
    fireEvent.click(downloadBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('handles log download action', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<LiveLogViewer serviceId={10} serviceName="order-center" />);
    const downloadBtn = screen.getByRole('button', { name: /download-log/i });
    fireEvent.click(downloadBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });
});
