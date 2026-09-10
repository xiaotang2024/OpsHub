import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  FolderTree,
  Terminal,
  Cpu,
  Activity,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronRight,
  Sliders,
  FileCode2,
  Trash2,
  X,
  Server,
  Check,
  Copy,
} from 'lucide-react';
import { Service, Template, ServiceStatus } from '../../types';
import { api } from '../../api';
import { StatusBadge } from '../../components/service/StatusBadge';

export const ServiceFleet: React.FC = () => {
  const navigate = useNavigate();

  const [services, setServices] = useState<Service[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'STOPPED' | 'FAILED'>('ALL');

  // Optimistic tracking: serviceId -> action type ('start' | 'stop' | 'restart')
  const [inFlightActions, setInFlightActions] = useState<Record<number, string>>({});

  // Details Drawer state (tracked by ID so updates dynamically reflect when service state changes)
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId]
  );
  const [copiedPort, setCopiedPort] = useState(false);

  const loadData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);
      const [svcList, tplList] = await Promise.all([
        api.getServices(),
        api.getTemplates().catch(() => []),
      ]);
      setServices(svcList || []);
      setTemplates(tplList || []);
    } catch (err: any) {
      setError(err.message || '加载服务舰队失败');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleAuthenticated = () => {
      loadData();
    };
    window.addEventListener('opshub:authenticated', handleAuthenticated);
    return () => {
      window.removeEventListener('opshub:authenticated', handleAuthenticated);
    };
  }, []);

  // Summary counts
  const counts = useMemo(() => {
    let running = 0;
    let stopped = 0;
    let failed = 0;

    services.forEach((s) => {
      const st = (s.status || '').toUpperCase();
      if (st === 'RUNNING') running++;
      else if (st === 'STOPPED') stopped++;
      else if (st === 'FAILED' || st === 'UNHEALTHY') failed++;
    });

    return { total: services.length, running, stopped, failed };
  }, [services]);

  // Filtered services with null-safe fallbacks
  const filteredServices = useMemo(() => {
    const query = (searchQuery || '').toLowerCase();
    return services.filter((svc) => {
      const name = (svc.name || '').toLowerCase();
      const port = String(svc.port ?? '');
      const installDir = (svc.install_dir || '').toLowerCase();

      const matchSearch =
        name.includes(query) ||
        port.includes(query) ||
        installDir.includes(query);

      const st = (svc.status || '').toUpperCase();
      let matchStatus = true;
      if (statusFilter === 'RUNNING') matchStatus = st === 'RUNNING';
      else if (statusFilter === 'STOPPED') matchStatus = st === 'STOPPED';
      else if (statusFilter === 'FAILED') matchStatus = st === 'FAILED' || st === 'UNHEALTHY';

      return matchSearch && matchStatus;
    });
  }, [services, searchQuery, statusFilter]);

  // Lifecycle Quick Actions with Optimistic UI
  const handleStart = async (service: Service, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const sid = service.id;
    setInFlightActions((prev) => ({ ...prev, [sid]: 'start' }));

    // Optimistically mark status as STARTING
    setServices((prev) =>
      prev.map((s) => (s.id === sid ? { ...s, status: 'STARTING' } : s))
    );

    try {
      const updated = await api.startService(sid);
      setServices((prev) => prev.map((s) => (s.id === sid ? updated : s)));
    } catch (err: any) {
      alert(`启动服务失败: ${err.message}`);
      await loadData(true);
    } finally {
      setInFlightActions((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
  };

  const handleStop = async (service: Service, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const sid = service.id;
    setInFlightActions((prev) => ({ ...prev, [sid]: 'stop' }));

    // Optimistically mark status as STOPPING
    setServices((prev) =>
      prev.map((s) => (s.id === sid ? { ...s, status: 'STOPPING' } : s))
    );

    try {
      const updated = await api.stopService(sid);
      setServices((prev) => prev.map((s) => (s.id === sid ? updated : s)));
    } catch (err: any) {
      alert(`停止服务失败: ${err.message}`);
      await loadData(true);
    } finally {
      setInFlightActions((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
  };

  const handleRestart = async (service: Service, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const sid = service.id;
    setInFlightActions((prev) => ({ ...prev, [sid]: 'restart' }));

    // Optimistically mark status as STARTING
    setServices((prev) =>
      prev.map((s) => (s.id === sid ? { ...s, status: 'STARTING' } : s))
    );

    try {
      const updated = await api.restartService(sid);
      setServices((prev) => prev.map((s) => (s.id === sid ? updated : s)));
    } catch (err: any) {
      alert(`重启服务失败: ${err.message}`);
      await loadData(true);
    } finally {
      setInFlightActions((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
  };

  const handleDeleteService = async (service: Service) => {
    if (!window.confirm(`确定要彻底注销并停止服务 "${service.name}" 吗？此操作将清理所有历史日志。`)) {
      return;
    }
    try {
      await api.deleteService(service.id);
      setSelectedServiceId(null);
      await loadData(true);
    } catch (err: any) {
      alert(`删除服务失败: ${err.message}`);
    }
  };

  const handleCopyPort = (port: number) => {
    navigator.clipboard?.writeText(String(port));
    setCopiedPort(true);
    setTimeout(() => setCopiedPort(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Fleet Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">服务列表 / Services</h1>
            <span className="rounded-full bg-cyan-950/60 border border-ops-cyan/30 px-2.5 py-0.5 text-xs font-mono font-medium text-ops-cyan">
              {services.length} 运行单元
            </span>
          </div>
          <p className="text-xs text-ops-text-muted font-mono mt-1">
            集群纳管的 JVM 生产服务实例列表与运行状态
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadData(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white hover:border-ops-border-hover transition-colors"
            title="刷新数据"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-ops-cyan' : ''}`} />
            <span>刷新状态</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/templates')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>新建部署服务</span>
          </button>
        </div>
      </div>

      {/* Fleet Health Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            statusFilter === 'ALL'
              ? 'border-ops-cyan/50 bg-cyan-950/20 shadow-cyan-glow'
              : 'border-ops-border bg-ops-card hover:border-ops-border-hover'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ops-text-muted font-mono">
            <span>总服务纳管</span>
            <Layers className="h-4 w-4 text-ops-cyan" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">{counts.total}</div>
        </div>

        <div
          onClick={() => setStatusFilter('RUNNING')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            statusFilter === 'RUNNING'
              ? 'border-emerald-500/50 bg-emerald-950/20 shadow-emerald-glow'
              : 'border-ops-border bg-ops-card hover:border-ops-border-hover'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
            <span>在线运行中</span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">{counts.running}</div>
        </div>

        <div
          onClick={() => setStatusFilter('STOPPED')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            statusFilter === 'STOPPED'
              ? 'border-slate-500/50 bg-slate-900/40'
              : 'border-ops-border bg-ops-card hover:border-ops-border-hover'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ops-text-muted font-mono">
            <span>已停止离线</span>
            <span className="h-2 w-2 rounded-full bg-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-400">{counts.stopped}</div>
        </div>

        <div
          onClick={() => setStatusFilter('FAILED')}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
            statusFilter === 'FAILED'
              ? 'border-red-500/50 bg-red-950/20 shadow-crimson-glow'
              : 'border-ops-border bg-ops-card hover:border-ops-border-hover'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-red-400 font-mono">
            <span>故障异常</span>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-400">{counts.failed}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-ops-border bg-ops-card p-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ops-text-muted" />
          <input
            type="text"
            placeholder="搜索服务名称、端口 (:8080) 或安装目录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-8 py-1.5 text-xs text-white placeholder-ops-text-muted focus:border-ops-cyan focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-ops-text-muted hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center rounded-lg border border-ops-border bg-ops-bg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-ops-surface text-white shadow-sm'
                : 'text-ops-text-muted hover:text-white'
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('RUNNING')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'RUNNING'
                ? 'bg-ops-surface text-emerald-400 shadow-sm'
                : 'text-ops-text-muted hover:text-white'
            }`}
          >
            运行中
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('STOPPED')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'STOPPED'
                ? 'bg-ops-surface text-slate-300 shadow-sm'
                : 'text-ops-text-muted hover:text-white'
            }`}
          >
            已停止
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('FAILED')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'FAILED'
                ? 'bg-ops-surface text-red-400 shadow-sm'
                : 'text-ops-text-muted hover:text-white'
            }`}
          >
            异常
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-56 rounded-xl border border-ops-border bg-ops-card/50 p-5 animate-pulse space-y-4"
            >
              <div className="flex justify-between">
                <div className="h-5 bg-slate-800 rounded w-1/3" />
                <div className="h-5 bg-slate-800 rounded w-1/4" />
              </div>
              <div className="h-4 bg-slate-800/60 rounded w-2/3" />
              <div className="h-10 bg-slate-900 rounded" />
              <div className="h-8 bg-slate-800/40 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredServices.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ops-border bg-ops-card/40 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ops-surface border border-ops-border text-ops-text-muted mb-4">
            <Layers className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-white">暂无部署的服务实例</h3>
          <p className="text-xs text-ops-text-muted mt-1 max-w-sm">
            当前舰队中尚无运行的服务，前往模板工作台快速实例化部署一套 Java 服务。
          </p>
          <button
            type="button"
            onClick={() => navigate('/templates')}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan text-xs font-semibold hover:bg-ops-cyan/20 transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>从模板部署首个服务</span>
          </button>
        </div>
      )}

      {/* Service Cards Grid (Directive Highlight!) */}
      {!loading && filteredServices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredServices.map((svc) => {
            const isRunning = svc.status === 'RUNNING';
            const isStarting = svc.status === 'STARTING';
            const isStopping = svc.status === 'STOPPING';
            const isStopped = svc.status === 'STOPPED';

            const activeAction = inFlightActions[svc.id];
            const isActionInFlight = Boolean(activeAction);

            const tpl = templates.find((t) => t.id === svc.template_id);

            return (
              <motion.div
                key={svc.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedServiceId(svc.id)}
                className="group relative flex flex-col justify-between rounded-xl border border-ops-border bg-ops-card hover:border-ops-border-hover hover:bg-ops-card-hover transition-all duration-200 overflow-hidden shadow-lg cursor-pointer"
              >
                {/* Card Header */}
                <div className="p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-white tracking-tight group-hover:text-ops-cyan transition-colors">
                          {svc.name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-ops-text-muted">
                        {tpl ? `模板: ${tpl.name}` : `模板 ID: #${svc.template_id}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Supervision mode badge */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-ops-text-sub border border-ops-border">
                        {svc.supervision_mode === 'systemd' ? 'Systemd' : 'Native'}
                      </span>

                      {/* StatusBadge with dynamic beacon */}
                      <StatusBadge status={svc.status} />
                    </div>
                  </div>

                  {/* Runtime Spec Grid: Port, PID, Install Dir */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-ops-bg/80 border border-ops-border/60 p-2.5 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-ops-text-muted uppercase block">监听端口</span>
                      <span className="font-bold text-ops-cyan">:{svc.port}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-ops-text-muted uppercase block">系统 PID</span>
                      <span className="font-bold text-white">
                        {svc.pid > 0 ? `#${svc.pid}` : '-'}
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-ops-border/40 text-[11px] truncate text-ops-text-muted">
                      <span className="text-slate-500">路径: </span>
                      <span className="text-ops-text-sub" title={svc.install_dir}>
                        {svc.install_dir}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer (Optimistic Lifecycle Buttons) */}
                <div
                  className="border-t border-ops-border bg-ops-bg/50 px-4 py-2.5 flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    {/* Start Button */}
                    <button
                      type="button"
                      aria-label={`启动服务 ${svc.name}`}
                      disabled={isRunning || isStarting || isActionInFlight}
                      onClick={(e) => handleStart(svc, e)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      {activeAction === 'start' ? (
                        <div className="h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                      <span>启动</span>
                    </button>

                    {/* Stop Button */}
                    <button
                      type="button"
                      aria-label={`停止服务 ${svc.name}`}
                      disabled={isStopped || isStopping || isActionInFlight}
                      onClick={(e) => handleStop(svc, e)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      {activeAction === 'stop' ? (
                        <div className="h-3 w-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Square className="h-3 w-3 fill-current" />
                      )}
                      <span>停止</span>
                    </button>

                    {/* Restart Button */}
                    <button
                      type="button"
                      aria-label={`重启服务 ${svc.name}`}
                      disabled={!isRunning || isActionInFlight}
                      onClick={(e) => handleRestart(svc, e)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      {activeAction === 'restart' ? (
                        <RotateCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCw className="h-3 w-3" />
                      )}
                      <span>重启</span>
                    </button>
                  </div>

                  {/* Click-through details button */}
                  <button
                    type="button"
                    onClick={() => setSelectedServiceId(svc.id)}
                    className="flex items-center gap-1 text-xs text-ops-text-muted hover:text-ops-cyan transition-colors"
                  >
                    <span>详情</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Service Details Drawer / Modal */}
      <AnimatePresence>
        {selectedService && (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => setSelectedServiceId(null)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, x: 400 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 400 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-lg h-full bg-ops-surface border-l border-ops-border shadow-2xl flex flex-col overflow-hidden cursor-default"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-5 border-b border-ops-border bg-ops-bg/80">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {selectedService.name}
                    </h2>
                    <span className="text-xs font-mono text-ops-text-muted">
                      服务实例详细运行态 & 部署参数
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedServiceId(null)}
                  className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
                {/* Current Status Box */}
                <div className="flex items-center justify-between rounded-xl border border-ops-border bg-ops-card p-4">
                  <div className="space-y-1">
                    <span className="text-ops-text-muted font-mono block">运行状态</span>
                    <StatusBadge status={selectedService.status} />
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-ops-text-muted block">活动 PID</span>
                    <span className="text-sm font-bold text-white">
                      {selectedService.pid > 0 ? `#${selectedService.pid}` : '无活动进程'}
                    </span>
                  </div>
                </div>

                {/* Specs list */}
                <div className="space-y-3">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-ops-cyan">
                    网络与运行监管
                  </h4>

                  <div className="rounded-xl border border-ops-border bg-ops-bg/80 divide-y divide-ops-border font-mono">
                    <div className="flex items-center justify-between p-3">
                      <span className="text-ops-text-muted">服务端口</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ops-cyan">:{selectedService.port}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyPort(selectedService.port)}
                          className="text-ops-text-muted hover:text-white"
                          title="复制端口"
                        >
                          {copiedPort ? (
                            <Check className="h-3 w-3 text-ops-emerald" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3">
                      <span className="text-ops-text-muted">监管驱动</span>
                      <span className="text-ops-text-sub font-semibold">
                        {selectedService.supervision_mode === 'systemd'
                          ? 'Linux Systemd Unit'
                          : 'OpsHub Native Supervisor'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3">
                      <span className="text-ops-text-muted">关联模板</span>
                      <span className="text-ops-text-sub">#{selectedService.template_id}</span>
                    </div>
                  </div>
                </div>

                {/* Install dir */}
                <div className="space-y-2">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-ops-cyan">
                    安装路径 (Install Directory)
                  </h4>
                  <div className="rounded-xl border border-ops-border bg-ops-bg p-3 font-mono text-xs text-ops-text-sub break-all select-all">
                    {selectedService.install_dir}
                  </div>
                </div>

                {/* JVM Options */}
                <div className="space-y-2">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-ops-cyan">
                    当前 JVM 参数策略
                  </h4>
                  <div className="rounded-xl border border-ops-border bg-ops-bg p-3 font-mono text-xs text-emerald-400 break-all select-all">
                    {selectedService.jvm_options || '(默认未指定自定义 JVM 参数)'}
                  </div>
                </div>

                {/* Env Vars */}
                {selectedService.env_vars && (
                  <div className="space-y-2">
                    <h4 className="font-mono text-xs uppercase tracking-wider text-ops-cyan">
                      注入环境变量
                    </h4>
                    <pre className="rounded-xl border border-ops-border bg-ops-bg p-3 font-mono text-xs text-ops-text-sub whitespace-pre-wrap">
                      {selectedService.env_vars}
                    </pre>
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-ops-border bg-ops-bg/80 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteService(selectedService)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-950/30 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>注销服务</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sid = selectedService.id;
                      setSelectedServiceId(null);
                      navigate(`/services/${sid}`);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>服务详情与发布</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedServiceId(null)}
                    className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
