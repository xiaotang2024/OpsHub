import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Rocket,
  RotateCcw,
  FileCode2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Globe,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Copy,
  Check,
  Filter,
  Layers,
  Activity,
} from 'lucide-react';
import { AuditLog } from '../../types';
import { api } from '../../api';
import NumberFlow from '@number-flow/react';
import { toast } from 'sonner';

export const AuditList: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');

  // Selected Log Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copiedDetail, setCopiedDetail] = useState(false);

  // Global Macro Statistics (Uncoupled from pagination)
  const [globalStats, setGlobalStats] = useState<{
    total: number;
    today: number;
    deploy: number;
    failed: number;
  }>({
    total: 0,
    today: 0,
    deploy: 0,
    failed: 0,
  });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAuditLogs({
        page,
        page_size: pageSize,
        action: actionFilter || undefined,
        status: statusFilter || undefined,
        target_type: targetTypeFilter || undefined,
      });
      setLogs(res.items || []);
      setTotal(res.total || 0);
      if (res.stats) {
        setGlobalStats(res.stats);
      } else {
        // Fallback for tests or when stats not returned
        setGlobalStats({
          total: res.total || 0,
          today: (res.items || []).filter(
            (i) => new Date(i.created_at).toDateString() === new Date().toDateString()
          ).length,
          deploy: (res.items || []).filter(
            (i) => i.action === 'DEPLOY' || i.action === 'ROLLBACK'
          ).length,
          failed: (res.items || []).filter((i) => i.status === 'FAILED').length,
        });
      }
    } catch (err: any) {
      const msg = err.message || '获取审计日志失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, statusFilter, targetTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Client-side quick search filtering by keyword in details or operator
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase().trim();
    return logs.filter((log) => {
      return (
        log.operator?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q) ||
        log.client_ip?.toLowerCase().includes(q) ||
        log.target_id?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery]);

  const handleCopyDetail = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedDetail(true);
    toast.success('审计明细已复制到剪贴板');
    setTimeout(() => setCopiedDetail(false), 2000);
  };

  const getActionBadge = (action: string) => {
    switch (action.toUpperCase()) {
      case 'START':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
            <Play className="h-3 w-3 fill-current" />
            <span>START</span>
          </span>
        );
      case 'STOP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/60 text-rose-400 border border-rose-500/30">
            <Square className="h-3 w-3 fill-current" />
            <span>STOP</span>
          </span>
        );
      case 'RESTART':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-400 border border-amber-500/30">
            <RotateCw className="h-3 w-3" />
            <span>RESTART</span>
          </span>
        );
      case 'DEPLOY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/60 text-ops-cyan border border-ops-cyan/30">
            <Rocket className="h-3 w-3" />
            <span>DEPLOY</span>
          </span>
        );
      case 'ROLLBACK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/60 text-purple-400 border border-purple-500/30">
            <RotateCcw className="h-3 w-3" />
            <span>ROLLBACK</span>
          </span>
        );
      case 'CONFIG_CHANGE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-yellow-950/60 text-yellow-400 border border-yellow-500/30">
            <FileCode2 className="h-3 w-3" />
            <span>CONFIG</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <Activity className="h-3 w-3" />
            <span>{action}</span>
          </span>
        );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-7rem)] flex flex-col gap-3.5 overflow-hidden">
      {/* Fixed Zone 1: Top Header & Metrics Summary Cards */}
      <div className="shrink-0 space-y-3">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-white">审计日志 / Audit Logs</h1>
              <span className="rounded-full bg-cyan-950/60 border border-ops-cyan/30 px-2.5 py-0.5 text-xs font-mono font-medium text-ops-cyan">
                不可篡改运维合规
              </span>
            </div>
            <p className="text-xs text-ops-text-muted font-mono mt-1">
              记录集群内所有服务启停、发版部署、配置热更与生命周期操作记录
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white hover:border-ops-border-hover transition-colors"
              title="刷新审计日志"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-ops-cyan' : ''}`} />
              <span>刷新日志</span>
            </button>
          </div>
        </div>

        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-ops-border bg-ops-card p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-ops-text-muted font-mono">
              <span>总审计记录</span>
              <ShieldCheck className="h-4 w-4 text-ops-cyan" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">
              <NumberFlow value={globalStats.total || total} />
            </div>
          </div>

          <div className="rounded-xl border border-ops-border bg-ops-card p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
              <span>今日操作数</span>
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
              <NumberFlow value={globalStats.today} />
            </div>
          </div>

          <div className="rounded-xl border border-ops-border bg-ops-card p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-ops-cyan font-mono">
              <span>发版部署动作</span>
              <Rocket className="h-4 w-4 text-ops-cyan" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-ops-cyan">
              <NumberFlow value={globalStats.deploy} />
            </div>
          </div>

          <div className="rounded-xl border border-ops-border bg-ops-card p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-rose-400 font-mono">
              <span>异常拦截</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
              <NumberFlow value={globalStats.failed} />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Zone 2: Filters Bar */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-ops-border bg-ops-card p-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ops-text-muted" />
          <input
            type="text"
            placeholder="搜索操作人、IP、详情关键词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-4 py-2 text-xs text-white placeholder-ops-text-muted focus:border-ops-cyan focus:outline-none font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter */}
          <div className="relative">
            <select
              aria-label="action-filter"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="bg-ops-bg border border-ops-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              <option value="">全部动作 (All Actions)</option>
              <option value="START">启动 (START)</option>
              <option value="STOP">停止 (STOP)</option>
              <option value="RESTART">重启 (RESTART)</option>
              <option value="DEPLOY">发版部署 (DEPLOY)</option>
              <option value="ROLLBACK">回滚 (ROLLBACK)</option>
              <option value="CONFIG_CHANGE">配置变更 (CONFIG)</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
              ▼
            </div>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              aria-label="status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-ops-bg border border-ops-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              <option value="">全部状态 (All Status)</option>
              <option value="SUCCESS">执行成功 (SUCCESS)</option>
              <option value="FAILED">执行失败 (FAILED)</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
              ▼
            </div>
          </div>

          {/* Target Type Filter */}
          <div className="relative">
            <select
              aria-label="target-type-filter"
              value={targetTypeFilter}
              onChange={(e) => {
                setTargetTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-ops-bg border border-ops-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              <option value="">全部资源 (All Targets)</option>
              <option value="service">服务 (service)</option>
              <option value="template">模板 (template)</option>
              <option value="jdk">JDK 资产 (jdk)</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
              ▼
            </div>
          </div>

          {(actionFilter || statusFilter || targetTypeFilter || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActionFilter('');
                setStatusFilter('');
                setTargetTypeFilter('');
                setSearchQuery('');
                setPage(1);
              }}
              className="px-2.5 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-mono text-ops-text-muted hover:text-white transition-colors"
            >
              重置
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="shrink-0 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Zone 3: Main Table & Pagination Card (Fixed Outer, Scrollable Inner Data) */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-ops-border bg-ops-card overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-12 text-center text-xs font-mono text-ops-text-muted space-y-3">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-ops-cyan" />
            <p>正在拉取不可篡改审计追踪记录...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-12 text-center text-xs font-mono text-ops-text-muted space-y-3">
            <ShieldCheck className="h-8 w-8 mx-auto text-ops-border-hover" />
            <p className="text-white font-medium text-sm">暂无符合条件的审计日志</p>
            <p className="text-ops-text-muted text-xs">尝试更换筛选条件或触发一次运维操作后再次查看。</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 z-10 border-b border-ops-border bg-ops-card/95 backdrop-blur-sm text-ops-text-muted uppercase text-[11px] shadow-sm">
                <tr>
                  <th className="px-4 py-3.5 bg-ops-card/95">序号</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">操作动作</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">目标对象</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">操作人</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">客户端 IP</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">执行结果</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">记录时间</th>
                  <th className="px-4 py-3.5 bg-ops-card/95">详情摘要</th>
                  <th className="px-4 py-3.5 text-right bg-ops-card/95">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-border/70 text-ops-text-sub">
                {filteredLogs.map((log) => {
                  const isSuccess = log.status?.toUpperCase() === 'SUCCESS';
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-ops-surface/60 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5 text-white font-bold">#{log.id}</td>
                      <td className="px-4 py-3.5">{getActionBadge(log.action)}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 text-ops-cyan">
                          <Layers className="h-3.5 w-3.5 opacity-70" />
                          <span>
                            {log.target_type} #{log.target_id || '-'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-white">
                          <User className="h-3 w-3 text-ops-text-muted" />
                          <span>{log.operator || 'system'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-ops-text-muted">{log.client_ip || '-'}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isSuccess
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-400 border-rose-500/40'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          <span>{log.status || 'UNKNOWN'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-ops-text-muted whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td
                        className="px-4 py-3.5 text-slate-300 max-w-xs truncate"
                        title={log.details}
                      >
                        {log.details || '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          aria-label="查看详情"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-ops-bg border border-ops-border text-ops-cyan hover:border-ops-cyan transition-colors text-[11px]"
                        >
                          <Eye className="h-3 w-3" />
                          <span>详情</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Fixed Zone 4: Pagination Bar */}
        <div className="shrink-0 border-t border-ops-border bg-ops-card/90 backdrop-blur-sm px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ops-text-muted">
          <div>
            显示第 {total > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
            {Math.min(page * pageSize, total)} 条，共{' '}
            <span className="text-white font-bold">{total}</span> 条记录
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-ops-surface border border-ops-border rounded px-2 py-1 text-white font-mono text-xs focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>条</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="px-2 py-1 text-white font-bold">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Slide-Over Drawer */}
      <AnimatePresence>
        {selectedLog && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#080D1A] border-l border-ops-border shadow-2xl z-50 flex flex-col font-mono text-xs"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-ops-border bg-ops-bg/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950/60 border border-ops-cyan/40 text-ops-cyan">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      审计详情 #{selectedLog.id}
                    </h3>
                    <p className="text-[11px] text-ops-text-muted">
                      记录不可篡改审计追踪明细
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="p-1.5 rounded-lg text-ops-text-muted hover:text-white hover:bg-ops-surface transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Meta Grid */}
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-ops-border bg-ops-bg/60">
                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">操作动作</span>
                    <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">执行结果</span>
                    <span
                      className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        selectedLog.status?.toUpperCase() === 'SUCCESS'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                          : 'bg-rose-950/60 text-rose-400 border-rose-500/40'
                      }`}
                    >
                      {selectedLog.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">操作人</span>
                    <span className="text-white font-bold block mt-1">
                      {selectedLog.operator || 'system'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">来源 IP</span>
                    <span className="text-ops-cyan block mt-1">
                      {selectedLog.client_ip || '-'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">目标资源</span>
                    <span className="text-white block mt-1">
                      {selectedLog.target_type} #{selectedLog.target_id || '-'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-ops-text-muted block">记录时间</span>
                    <span className="text-slate-300 block mt-1">
                      {new Date(selectedLog.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Details Content Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      操作详情 / Output Details
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyDetail(selectedLog.details)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ops-surface border border-ops-border text-ops-text-muted hover:text-white transition-colors text-[11px]"
                    >
                      {copiedDetail ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedDetail ? '已复制' : '复制详情'}</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-ops-border bg-[#050811] text-slate-200 font-mono text-xs whitespace-pre-wrap break-all leading-relaxed max-h-[360px] overflow-y-auto selection:bg-cyan-950 selection:text-ops-cyan">
                    {selectedLog.details || '（无附加详情文本）'}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-ops-border bg-ops-bg/80 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 rounded-lg bg-ops-surface border border-ops-border text-white text-xs font-medium hover:border-ops-border-hover transition-colors"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuditList;
