import React, { useState } from 'react';
import NumberFlow from '@number-flow/react';
import {
  Cpu,
  HardDrive,
  Clock,
  Copy,
  Check,
  Activity,
} from 'lucide-react';

export interface ProcessTelemetryCardProps {
  pid: number;
  cpuPercent: number;
  memoryRssMb: number;
  maxMemoryMb?: number;
  uptime: string;
  status?: string;
  onRefresh?: () => void;
  className?: string;
}

export const ProcessTelemetryCard: React.FC<ProcessTelemetryCardProps> = ({
  pid,
  cpuPercent,
  memoryRssMb,
  maxMemoryMb = 2048,
  uptime,
  status = 'RUNNING',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  // CPU Level & Color computation
  const getCpuLevel = (val: number): { level: 'low' | 'medium' | 'high'; color: string; strokeColor: string } => {
    if (val < 60) {
      return { level: 'low', color: 'text-emerald-400', strokeColor: '#10B981' };
    }
    if (val <= 85) {
      return { level: 'medium', color: 'text-amber-400', strokeColor: '#F59E0B' };
    }
    return { level: 'high', color: 'text-red-400', strokeColor: '#EF4444' };
  };

  const cpuInfo = getCpuLevel(cpuPercent);

  // SVG Gauge calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76
  const clampedCpu = Math.max(0, Math.min(100, cpuPercent));
  const cpuOffset = circumference - (clampedCpu / 100) * circumference;

  const memPercent = Math.max(0, Math.min(100, Math.round((memoryRssMb / maxMemoryMb) * 100)));
  const memOffset = circumference - (memPercent / 100) * circumference;

  const handleCopyPid = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(pid));
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const isRunning = status.toUpperCase() === 'RUNNING';

  return (
    <div
      className={`rounded-2xl border border-ops-border bg-ops-card p-5 shadow-xl relative overflow-hidden backdrop-blur-sm ${className}`}
    >
      {/* Subtle background ambient glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-ops-cyan/5 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl" />

      {/* Header bar: Title, PID tag, Uptime ticker */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-ops-border/70">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ops-surface border border-ops-border text-ops-cyan shadow-sm">
            <Activity className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wider uppercase text-ops-text-muted font-mono">
                进程实时遥测 (Telemetry)
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isRunning
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                  }`}
                />
                <span>{status}</span>
              </span>
            </div>
          </div>
        </div>

        {/* PID Tag with copy action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-ops-border bg-ops-bg px-2.5 py-1 text-xs font-mono text-ops-text-sub">
            <span className="font-bold text-white tracking-wide">PID: {pid}</span>
            <button
              type="button"
              aria-label="copy-pid"
              onClick={handleCopyPid}
              title="复制进程号 PID"
              className="ml-2 text-ops-text-muted hover:text-ops-cyan transition-colors"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-ops-emerald" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Uptime Ticker */}
          <div className="flex items-center gap-1.5 rounded-lg border border-ops-border bg-ops-bg px-2.5 py-1 text-xs font-mono text-ops-cyan">
            <Clock className="h-3.5 w-3.5 text-ops-cyan/70" />
            <span className="text-white font-bold">运行 {uptime}</span>
          </div>
        </div>
      </div>

      {/* Main Gauges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5">
        {/* Gauge 1: CPU Utilization */}
        <div
          data-testid="cpu-gauge"
          data-level={cpuInfo.level}
          className="flex items-center gap-4 rounded-xl border border-ops-border/60 bg-ops-bg/60 p-4 transition-all hover:border-ops-border"
        >
          {/* Radial SVG Meter */}
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 96 96">
              {/* Background circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="text-slate-800"
                strokeWidth="7"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Animated Progress circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke={cpuInfo.strokeColor}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={cpuOffset}
                strokeLinecap="round"
                fill="transparent"
                style={{
                  transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease',
                }}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <Cpu className={`h-4 w-4 ${cpuInfo.color} mb-0.5`} />
              <span className={`text-[10px] font-mono font-bold uppercase ${cpuInfo.color}`}>
                {cpuInfo.level}
              </span>
            </div>
          </div>

          {/* Labels and Load Status */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-ops-text-muted">CPU 负载</span>
              <span className={`font-mono text-[11px] font-bold uppercase ${cpuInfo.color}`}>
                {cpuInfo.level === 'low' ? 'Normal' : cpuInfo.level === 'medium' ? 'Elevated' : 'High Load'}
              </span>
            </div>
            <div className="text-base font-bold font-mono text-white flex items-baseline">
              <NumberFlow value={cpuPercent} suffix="%" />
            </div>
            <div className="text-[11px] font-mono text-ops-text-muted truncate">
              {cpuInfo.level === 'low'
                ? 'CPU 负载在平稳运行区间'
                : cpuInfo.level === 'medium'
                ? '运算负载较活跃'
                : '检测到高计算密集负载'}
            </div>
          </div>
        </div>

        {/* Gauge 2: Memory RSS Utilization */}
        <div
          data-testid="mem-gauge"
          className="flex items-center gap-4 rounded-xl border border-ops-border/60 bg-ops-bg/60 p-4 transition-all hover:border-ops-border"
        >
          {/* Radial SVG Meter */}
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 96 96">
              {/* Background circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="text-slate-800"
                strokeWidth="7"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Animated Progress circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="#06B6D4"
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={memOffset}
                strokeLinecap="round"
                fill="transparent"
                style={{
                  transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <HardDrive className="h-4 w-4 text-ops-cyan mb-0.5" />
              <span className="text-[11px] font-mono font-bold text-ops-cyan flex items-baseline justify-center">
                <NumberFlow value={memPercent} suffix="%" />
              </span>
            </div>
          </div>

          {/* Labels and Memory Metrics */}
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-ops-text-muted">物理常驻内存 (RSS)</span>
              <span className="font-mono text-[11px] text-ops-text-muted">
                / {maxMemoryMb} MB
              </span>
            </div>
            <div className="text-base font-bold font-mono text-emerald-400 flex items-baseline">
              <NumberFlow value={memoryRssMb} prefix="RSS: " suffix=" MB" />
            </div>
            <div className="text-[11px] font-mono text-ops-text-muted truncate">
              已占用预估分配 {memPercent}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessTelemetryCard;
