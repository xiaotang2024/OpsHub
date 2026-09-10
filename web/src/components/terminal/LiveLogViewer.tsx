import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import {
  Play,
  Pause,
  Trash2,
  Download,
  Search,
  Lock,
  Unlock,
  RefreshCw,
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

export interface LiveLogViewerProps {
  serviceId: number;
  serviceName?: string;
  wsUrl?: string;
  token?: string;
  height?: string | number;
  className?: string;
}

type ConnectionStatus = 'CONNECTING' | 'STREAMING' | 'CLOSED';

export const LiveLogViewer: React.FC<LiveLogViewerProps> = ({
  serviceId,
  serviceName = 'service',
  wsUrl,
  token,
  height = '520px',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [matchCount, setMatchCount] = useState<number>(0);
  const [bufferedCount, setBufferedCount] = useState<number>(0);

  const autoScrollRef = useRef<boolean>(true);
  const isPausedRef = useRef<boolean>(false);
  const pausedBufferRef = useRef<string[]>([]);
  const fullLogAccumulatorRef = useRef<string[]>([]);

  // Keep refs synchronized with state
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Terminal initialization
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#080C14',
        foreground: '#E2E8F0',
        cursor: '#00F5FF',
        selectionBackground: 'rgba(0, 245, 255, 0.3)',
        black: '#080C14',
        red: '#EF4444',
        green: '#10B981',
        yellow: '#F59E0B',
        blue: '#3B82F6',
        magenta: '#A855F7',
        cyan: '#06B6D4',
        white: '#F8FAFC',
      },
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    try {
      term.open(containerRef.current);
      fitAddon.fit();
    } catch {
      // Safe fallback for testing environments without full canvas/DOM measurements
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Terminal initial welcome banner
    term.writeln('\x1b[36m[OpsHub Kernel]\x1b[0m Initializing Live Terminal Channel...');
    term.writeln(`\x1b[90mService: ${serviceName} (#${serviceId}) | Protocol: WebSocket Tailer\x1b[0m\r\n`);

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        term.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [serviceId, serviceName]);

  // WebSocket connection & streaming lifecycle
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setStatus('CONNECTING');

    let endpoint = wsUrl;
    if (!endpoint) {
      const isSecure = window.location.protocol === 'https:';
      const proto = isSecure ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:8080';
      const jwt = token || localStorage.getItem('opshub_token') || '';
      endpoint = `${proto}//${host}/api/services/${serviceId}/logs/ws?token=${encodeURIComponent(jwt)}`;
    }

    try {
      const socket = new WebSocket(endpoint);
      wsRef.current = socket;

      socket.onopen = () => {
        setStatus('STREAMING');
        termRef.current?.writeln(
          '\x1b[32m[OpsHub Kernel]\x1b[0m WebSocket stream established. Tailing console output...\r\n'
        );
      };

      socket.onmessage = (event) => {
        const text = String(event.data || '');
        fullLogAccumulatorRef.current.push(text);
        // Bounded ring-buffer / cap to 10,000 log chunks to prevent memory leaks on long streams
        if (fullLogAccumulatorRef.current.length > 10000) {
          fullLogAccumulatorRef.current = fullLogAccumulatorRef.current.slice(-10000);
        }

        if (isPausedRef.current) {
          pausedBufferRef.current.push(text);
          setBufferedCount(pausedBufferRef.current.length);
        } else {
          termRef.current?.write(text);
          if (autoScrollRef.current) {
            termRef.current?.scrollToBottom();
          }
        }
      };

      socket.onclose = () => {
        setStatus('CLOSED');
      };

      socket.onerror = () => {
        setStatus('CLOSED');
      };
    } catch {
      setStatus('CLOSED');
    }
  }, [serviceId, wsUrl, token]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  // Toggle Auto-Scroll
  const handleToggleAutoScroll = () => {
    setAutoScroll((prev) => {
      const next = !prev;
      if (next && termRef.current) {
        termRef.current.scrollToBottom();
      }
      return next;
    });
  };

  // Toggle Stream Pause / Resume (Pure state updater with explicit side-effects in event handler)
  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);

    if (!nextPaused) {
      // Resuming: flush paused buffer to terminal directly in event handler
      if (pausedBufferRef.current.length > 0 && termRef.current) {
        const flushed = pausedBufferRef.current.join('');
        termRef.current.write(flushed);
        pausedBufferRef.current = [];
        setBufferedCount(0);
        if (autoScrollRef.current) {
          termRef.current.scrollToBottom();
        }
      }
    }
  };

  // Clear Screen
  const handleClearScreen = () => {
    if (termRef.current) {
      termRef.current.clear();
    }
  };

  // Debounce search query changes by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search logic executed against debounced query
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      setMatchCount(0);
      return;
    }

    // Count occurrences across bounded accumulated logs
    const fullText = fullLogAccumulatorRef.current.join('');
    try {
      const regex = new RegExp(debouncedSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = fullText.match(regex);
      setMatchCount(matches ? matches.length : 0);
    } catch {
      setMatchCount(0);
    }

    if (searchAddonRef.current) {
      searchAddonRef.current.findNext(debouncedSearchQuery, { incremental: true });
    }
  }, [debouncedSearchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchNext = () => {
    const query = debouncedSearchQuery || searchQuery;
    if (searchAddonRef.current && query) {
      searchAddonRef.current.findNext(query);
    }
  };

  const handleSearchPrev = () => {
    const query = debouncedSearchQuery || searchQuery;
    if (searchAddonRef.current && query) {
      searchAddonRef.current.findPrevious(query);
    }
  };

  // Download Log File
  const handleDownloadLog = () => {
    const content = fullLogAccumulatorRef.current.join('');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `${serviceName}-logs-${timestamp}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (window.URL?.revokeObjectURL) {
      window.URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-ops-border bg-[#050811] shadow-2xl overflow-hidden flex flex-col font-mono ${className}`}
    >
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#080D18] border-b border-ops-border text-xs">
        {/* Left: Terminal Brand & Connection Status Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-ops-cyan font-bold">
            <TerminalIcon className="h-4 w-4" />
            <span className="tracking-wide">OPSHUB CONSOLE</span>
          </div>

          {/* Connection Status Badge */}
          <div
            data-testid="ws-status-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              status === 'STREAMING'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                : status === 'CONNECTING'
                ? 'bg-amber-950/80 border-amber-500/40 text-amber-400'
                : 'bg-red-950/80 border-red-500/40 text-red-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === 'STREAMING'
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'CONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-red-400'
              }`}
            />
            <span>
              {status === 'STREAMING'
                ? 'Streaming'
                : status === 'CONNECTING'
                ? 'Connecting'
                : 'Closed'}
            </span>

            {status === 'CLOSED' && (
              <button
                type="button"
                onClick={connectWebSocket}
                title="重新连接终端"
                className="ml-1 text-xs hover:text-white underline underline-offset-2 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>重连</span>
              </button>
            )}
          </div>

          {/* Paused buffer alert */}
          {isPaused && (
            <span className="text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] animate-pulse">
              流已暂停 {bufferedCount > 0 ? `(${bufferedCount} 条已缓存)` : ''}
            </span>
          )}
        </div>

        {/* Center: Real-time Search Bar */}
        <div className="flex items-center gap-1.5 bg-[#0D1527] border border-ops-border/80 rounded-lg px-2.5 py-1">
          <Search className="h-3.5 w-3.5 text-ops-text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="搜索控制台日志 (如 ERROR / Exception)"
            className="bg-transparent border-none outline-none text-white text-xs w-44 sm:w-60 placeholder:text-slate-600 font-mono"
          />
          {searchQuery && (
            <div className="flex items-center gap-1 pl-1 border-l border-ops-border">
              <span
                className="text-[10px] bg-cyan-950 border border-ops-cyan/30 text-ops-cyan px-1.5 py-0.2 rounded truncate max-w-[180px]"
                title={`${matchCount} matches for "${searchQuery}"`}
              >
                {`${matchCount} matches for "${searchQuery}"`}
              </span>
              <button
                type="button"
                onClick={handleSearchPrev}
                title="上一个匹配项"
                className="text-ops-text-muted hover:text-white p-0.5"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleSearchNext}
                title="下一个匹配项"
                className="text-ops-text-muted hover:text-white p-0.5"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Auto-scroll Pin */}
          <button
            type="button"
            aria-label="auto-scroll"
            data-active={autoScroll ? 'true' : 'false'}
            onClick={handleToggleAutoScroll}
            title={autoScroll ? '锁定到底部滚动 (已开启)' : '自动滚动已暂停'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${
              autoScroll
                ? 'bg-cyan-950/60 border-ops-cyan/50 text-ops-cyan shadow-sm'
                : 'bg-slate-900 border-ops-border text-ops-text-muted hover:text-white'
            }`}
          >
            {autoScroll ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">锁定滚动</span>
          </button>

          {/* Pause / Resume stream */}
          <button
            type="button"
            aria-label="pause-stream"
            data-paused={isPaused ? 'true' : 'false'}
            onClick={handleTogglePause}
            title={isPaused ? '恢复控制台流' : '暂停控制台流'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${
              isPaused
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-400'
                : 'bg-slate-900 border-ops-border text-ops-text-sub hover:text-white'
            }`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isPaused ? '恢复流' : '暂停流'}</span>
          </button>

          {/* Clear screen */}
          <button
            type="button"
            aria-label="clear-screen"
            onClick={handleClearScreen}
            title="清除当前屏幕日志"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-ops-border bg-slate-900 text-ops-text-sub hover:text-white text-xs transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">清屏</span>
          </button>

          {/* Download log */}
          <button
            type="button"
            aria-label="download-log"
            onClick={handleDownloadLog}
            title="导出全部控制台日志"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-ops-cyan/40 bg-cyan-950/40 text-ops-cyan hover:bg-cyan-500/20 text-xs font-bold transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>导出日志</span>
          </button>
        </div>
      </div>

      {/* Terminal Canvas Viewport */}
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full p-2 bg-[#080C14] overflow-hidden select-text"
      />
    </div>
  );
};

export default LiveLogViewer;
