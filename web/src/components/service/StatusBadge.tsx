import React from 'react';

export type ServiceStatus =
  | 'RUNNING'
  | 'STARTING'
  | 'STOPPING'
  | 'STOPPED'
  | 'FAILED'
  | 'UNHEALTHY'
  | 'UNINSTALLED'
  | string;

interface StatusBadgeProps {
  status: ServiceStatus;
  className?: string;
  showText?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  showText = true,
}) => {
  const normalizedStatus = (status || '').toUpperCase();

  switch (normalizedStatus) {
    case 'RUNNING':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)] ${className}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          {showText && <span>运行中</span>}
        </span>
      );

    case 'STARTING':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-950/40 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)] ${className}`}
        >
          <svg
            className="animate-spin h-2.5 w-2.5 text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {showText && <span>启动中</span>}
        </span>
      );

    case 'STOPPING':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-950/30 text-amber-400/80 border border-amber-500/20 ${className}`}
        >
          <svg
            className="animate-spin h-2.5 w-2.5 text-amber-400/80"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {showText && <span>停止中</span>}
        </span>
      );

    case 'FAILED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-red-950/40 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)] ${className}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          {showText && <span>异常</span>}
        </span>
      );

    case 'UNHEALTHY':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-orange-950/40 text-orange-400 border border-orange-500/30 ${className}`}
        >
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          {showText && <span>不健康</span>}
        </span>
      );

    case 'UNINSTALLED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-ops-surface text-ops-text-muted border border-ops-border ${className}`}
        >
          <span className="h-2 w-2 rounded-full bg-ops-text-muted/60" />
          {showText && <span>已卸载</span>}
        </span>
      );

    case 'STOPPED':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-ops-surface text-ops-text-muted border border-ops-border ${className}`}
        >
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          {showText && <span>已停止</span>}
        </span>
      );
  }
};
