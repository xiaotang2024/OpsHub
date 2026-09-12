import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  Edit3,
  Plus,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { Service, Template, ServiceStatus, JDKAsset } from '../../types';
import { toast } from 'sonner';
import { api } from '../../api';
import { StatusBadge } from '../../components/service/StatusBadge';

// Helper to dynamically derive install directory based on service name & template pattern
const computeInstallDir = (newName: string, currentService?: Service | null, tpl?: Template | null): string => {
  const trimmed = newName.trim();
  if (tpl?.install_dir_pattern) {
    let pattern = tpl.install_dir_pattern;
    if (pattern.includes('${SERVICE_NAME}')) {
      return pattern.replace(/\$\{SERVICE_NAME\}/g, trimmed || '${SERVICE_NAME}');
    }
    if (pattern.includes('{{.Name}}')) {
      return pattern.replace(/\{\{\.Name\}\}/g, trimmed || '{{.Name}}');
    }
  }
  if (currentService?.install_dir) {
    const oldName = currentService.name;
    if (oldName && currentService.install_dir.endsWith(oldName)) {
      const prefix = currentService.install_dir.slice(0, -oldName.length);
      return `${prefix}${trimmed}`;
    }
    const parts = currentService.install_dir.split('/');
    if (parts.length > 1) {
      parts[parts.length - 1] = trimmed;
      return parts.join('/');
    }
  }
  return `/opt/apps/${trimmed}`;
};

export const ServiceFleet: React.FC = () => {
  const navigate = useNavigate();

  const [services, setServices] = useState<Service[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jdks, setJdks] = useState<JDKAsset[]>([]);
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

  // Drawer Inline Editing State (only modifying name, port; install_dir automatically follows)
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPort, setEditPort] = useState<number>(8080);
  const [editInstallDir, setEditInstallDir] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Delete Service Confirmation Modal State
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create Service Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState<number | null>(null);
  const [createName, setCreateName] = useState('');
  const [createPort, setCreatePort] = useState<number>(8080);
  const [createInstallDir, setCreateInstallDir] = useState('');
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [createServiceError, setCreateServiceError] = useState<string | null>(null);

  const loadData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);
      const [svcList, tplList, jdkList] = await Promise.all([
        Promise.resolve().then(() => api.getServices()),
        Promise.resolve().then(() => (api.getTemplates ? api.getTemplates() : [])).catch(() => []),
        Promise.resolve().then(() => (api.getJDKs ? api.getJDKs() : [])).catch(() => []),
      ]);
      setServices(svcList || []);
      setTemplates(tplList || []);
      setJdks(jdkList || []);
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
      toast.success(`服务 ${service.name} 启动指令已下发`);
    } catch (err: any) {
      toast.error(`启动服务失败: ${err.message}`);
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
      toast.success(`服务 ${service.name} 停止指令已下发`);
    } catch (err: any) {
      toast.error(`停止服务失败: ${err.message}`);
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
      toast.success(`服务 ${service.name} 重启指令已下发`);
    } catch (err: any) {
      toast.error(`重启服务失败: ${err.message}`);
      await loadData(true);
    } finally {
      setInFlightActions((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    }
  };

  const handleDeleteService = (service: Service) => {
    setServiceToDelete(service);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!serviceToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.deleteService(serviceToDelete.id);
      toast.success(`服务 ${serviceToDelete.name} 已从舰队注销并删除`);
      setServiceToDelete(null);
      setSelectedServiceId(null);
      await loadData(true);
    } catch (err: any) {
      setDeleteError(err.message || '删除服务失败');
      toast.error(err.message || '删除服务失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyPort = (port: number) => {
    navigator.clipboard?.writeText(String(port));
    setCopiedPort(true);
    toast.success(`端口号 :${port} 已复制到剪贴板`);
    setTimeout(() => setCopiedPort(false), 2000);
  };

  useEffect(() => {
    if (selectedService) {
      setIsEditing(false);
      setEditError(null);
      setEditSuccessMsg(null);
      setEditName(selectedService.name || '');
      setEditPort(selectedService.port || 8080);
      setEditInstallDir(selectedService.install_dir || '');
    }
  }, [selectedService]);

  const handleNameChange = (newName: string) => {
    setEditName(newName);
    if (selectedService) {
      const tpl = templates.find((t) => t.id === selectedService.template_id);
      setEditInstallDir(computeInstallDir(newName, selectedService, tpl));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    if (!editName.trim()) {
      setEditError('服务名称不能为空');
      return;
    }
    if (editPort <= 0 || editPort > 65535) {
      setEditError('请输入有效的端口号 (1-65535)');
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);

      const payload: Partial<Service> = {
        name: editName.trim(),
        port: Number(editPort),
        install_dir: editInstallDir.trim() || selectedService.install_dir,
        template_id: selectedService.template_id,
        jdk_id: selectedService.jdk_id,
        supervision_mode: selectedService.supervision_mode,
        jvm_options: selectedService.jvm_options,
        env_vars: selectedService.env_vars,
      };

      await api.updateService(selectedService.id, payload);
      await loadData(true);
      setIsEditing(false);
      setEditSuccessMsg(
        '服务配置已成功保存！' +
          (selectedService.status === 'RUNNING' ? '（将在服务下次重启后生效）' : '')
      );
      setTimeout(() => setEditSuccessMsg(null), 5000);
    } catch (err: any) {
      setEditError(err.message || '更新服务失败');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOpenCreateModal = () => {
    setCreateServiceError(null);
    if (templates.length > 0) {
      const defaultTpl = templates[0];
      setCreateTemplateId(defaultTpl.id);
      const defaultName = `${defaultTpl.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-service`;
      setCreateName(defaultName);
      setCreatePort(8080 + services.length);
      setCreateInstallDir(computeInstallDir(defaultName, null, defaultTpl));
    } else {
      setCreateTemplateId(null);
      setCreateName('');
      setCreatePort(8080);
      setCreateInstallDir('');
    }
    setIsCreateModalOpen(true);
  };

  const handleTemplateSelectChange = (tplId: number) => {
    setCreateTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    setCreateInstallDir(computeInstallDir(createName, null, tpl));
  };

  const handleCreateNameChange = (newName: string) => {
    setCreateName(newName);
    const tpl = templates.find((t) => t.id === createTemplateId);
    setCreateInstallDir(computeInstallDir(newName, null, tpl));
  };

  const handleCreateServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateServiceError('服务名称不能为空');
      return;
    }
    if (createPort <= 0 || createPort > 65535) {
      setCreateServiceError('请输入有效的端口号 (1-65535)');
      return;
    }
    const selectedTpl = templates.find((t) => t.id === createTemplateId);
    if (!selectedTpl) {
      setCreateServiceError('请选择有效的部署模板');
      return;
    }

    try {
      setIsCreatingService(true);
      setCreateServiceError(null);

      const payload: Partial<Service> = {
        name: createName.trim(),
        template_id: selectedTpl.id,
        jdk_id: selectedTpl.default_jdk_id,
        install_dir: createInstallDir.trim() || `/opt/apps/${createName.trim()}`,
        port: Number(createPort),
        jvm_options: selectedTpl.jvm_options,
        env_vars: selectedTpl.env_vars,
        supervision_mode: selectedTpl.supervision_mode,
      };

      await api.createService(payload);
      toast.success(`服务 ${createName.trim()} 创建成功！`);
      setIsCreateModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      const msg = err.message || '创建部署服务失败';
      setCreateServiceError(msg);
      toast.error(msg);
    } finally {
      setIsCreatingService(false);
    }
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
            onClick={handleOpenCreateModal}
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
            onClick={handleOpenCreateModal}
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
                    {isEditing ? <Edit3 className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {isEditing ? `编辑服务: ${selectedService.name}` : selectedService.name}
                    </h2>
                    <span className="text-xs font-mono text-ops-text-muted">
                      {isEditing ? '修改服务实例的运行配置与环境规格' : '服务实例详细运行态 & 部署参数'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ops-cyan/40 bg-cyan-950/40 text-ops-cyan hover:bg-ops-cyan/20 text-xs font-semibold transition-colors"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>编辑配置</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(null);
                      setIsEditing(false);
                    }}
                    className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
                {/* Success Notification Banner */}
                {editSuccessMsg && !isEditing && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-950/40 border border-ops-emerald/40 text-xs text-ops-emerald font-medium">
                    <Check className="h-4 w-4 shrink-0" />
                    <span>{editSuccessMsg}</span>
                  </div>
                )}

                {isEditing ? (
                  /* Edit Mode Form */
                  <form id="edit-service-form" onSubmit={handleSaveEdit} className="space-y-4">
                    {editError && (
                      <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-400 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{editError}</span>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="edit-service-name" className="block text-xs font-medium text-ops-text-sub mb-1">
                          服务名称 <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="edit-service-name"
                          type="text"
                          value={editName}
                          onChange={(e) => handleNameChange(e.target.value)}
                          className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none transition-colors"
                          placeholder="例如: order-service"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="edit-service-port" className="block text-xs font-medium text-ops-text-sub mb-1">
                          监听端口 <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="edit-service-port"
                          type="number"
                          value={editPort}
                          onChange={(e) => setEditPort(Number(e.target.value))}
                          className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none transition-colors"
                          placeholder="例如: 8080"
                          min={1}
                          max={65535}
                          required
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-ops-text-sub">
                            安装部署路径
                          </label>
                          <span className="text-[10px] font-mono text-ops-cyan/80 bg-cyan-950/50 px-2 py-0.5 rounded border border-ops-cyan/20">
                            跟随服务名称联动更新
                          </span>
                        </div>
                        <div
                          className="w-full rounded-lg border border-ops-border/70 bg-ops-bg/60 px-3 py-2 text-xs font-mono text-ops-text-sub break-all select-all"
                          title="安装路径跟随服务名称自动更新"
                        >
                          {editInstallDir || '(自动跟随服务名称生成)'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-950/20 border border-ops-cyan/30 text-xs text-ops-text-muted">
                        <Info className="h-4 w-4 text-ops-cyan shrink-0" />
                        <span>修改服务名称与端口后，运行中的服务将在下次重启时生效；部署安装路径会同步跟随服务名称变更。</span>
                      </div>
                    </div>
                  </form>
                ) : (
                  /* View Mode Content */
                  <>
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
                          <span className="text-ops-text-sub">
                            {templates.find((t) => t.id === selectedService.template_id)?.name ||
                              `#${selectedService.template_id}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-3">
                          <span className="text-ops-text-muted">运行 JDK</span>
                          <span className="text-ops-text-sub">
                            {jdks.find((j) => j.id === selectedService.jdk_id)?.name || '继承模板默认'}
                          </span>
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
                  </>
                )}
              </div>

              {/* Drawer Footer Actions */}
              {isEditing ? (
                <div className="p-4 border-t border-ops-border bg-ops-bg/80 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white transition-colors"
                  >
                    取消
                  </button>

                  <button
                    type="submit"
                    form="edit-service-form"
                    disabled={isSavingEdit}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50"
                  >
                    {isSavingEdit ? (
                      <>
                        <div className="h-3 w-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>保存修改</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-4 border-t border-ops-border bg-ops-bg/80 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleDeleteService(selectedService)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-950/30 text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>删除服务</span>
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
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Service Confirmation Modal */}
      <AnimatePresence>
        {serviceToDelete && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-default"
            onClick={() => {
              if (!isDeleting) {
                setServiceToDelete(null);
                setDeleteError(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-ops-surface shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-ops-border bg-ops-bg/90 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/80 border border-red-500/40 text-red-400 shadow-crimson-glow">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      删除服务实例确认
                    </h3>
                    <p className="text-[11px] font-mono text-red-400/80">
                      高危操作 · 该操作不可撤销
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setServiceToDelete(null);
                    setDeleteError(null);
                  }}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4 text-xs">
                {deleteError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}

                <div className="text-slate-300 leading-relaxed">
                  确定要从舰队中注销并永久删除服务{' '}
                  <span className="font-bold font-mono text-white bg-slate-800 px-1.5 py-0.5 rounded border border-ops-border">
                    {serviceToDelete.name}
                  </span>{' '}
                  吗？
                </div>

                {/* Service Specs Brief */}
                <div className="rounded-xl border border-ops-border bg-ops-bg/80 p-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center text-ops-text-muted">
                    <span>服务端口</span>
                    <span className="font-bold text-ops-cyan">:{serviceToDelete.port}</span>
                  </div>
                  <div className="flex justify-between items-center text-ops-text-muted">
                    <span>运行状态</span>
                    <StatusBadge status={serviceToDelete.status} />
                  </div>
                  <div className="flex justify-between items-center text-ops-text-muted pt-1 border-t border-ops-border/40 text-[11px]">
                    <span>安装目录</span>
                    <span className="truncate max-w-[220px] text-ops-text-sub" title={serviceToDelete.install_dir}>
                      {serviceToDelete.install_dir}
                    </span>
                  </div>
                </div>

                {/* Safety Warning */}
                <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-3 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-red-400">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>操作影响说明</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5 font-mono">
                    <li>若服务正在运行，系统将立即强制终止运行中进程</li>
                    <li>自动注销监管驱动（Native 或 Linux Systemd）</li>
                    <li>清空该服务的所有部署版本历史与关联日志</li>
                  </ul>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-ops-border bg-ops-bg/80 px-5 py-3.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setServiceToDelete(null);
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white transition-colors disabled:opacity-40"
                >
                  取消
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-crimson-glow transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>正在删除...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>确认删除</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Service from Template Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-default"
            onClick={() => {
              if (!isCreatingService) {
                setIsCreateModalOpen(false);
                setCreateServiceError(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-2xl border border-ops-border bg-ops-surface shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-ops-border bg-ops-bg/90 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/80 border border-ops-cyan/30 text-ops-cyan shadow-cyan-glow">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      新建部署服务
                    </h3>
                    <p className="text-[11px] font-mono text-ops-text-muted">
                      主动选择模板快速配置并纳管新 Java 服务实例
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCreatingService}
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateServiceError(null);
                  }}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 text-xs">
                {createServiceError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{createServiceError}</span>
                  </div>
                )}

                {templates.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 text-center space-y-3">
                    <p className="text-amber-400">
                      系统中暂无可用部署模板。新建服务需要基于模板进行环境与监管规范的配置。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateModalOpen(false);
                        navigate('/templates');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold transition-colors"
                    >
                      <span>前往创建模板</span>
                    </button>
                  </div>
                ) : (
                  <form id="create-service-fleet-form" onSubmit={handleCreateServiceSubmit} className="space-y-4">
                    {/* Template Selection */}
                    <div>
                      <label htmlFor="create-fleet-template" className="block text-xs font-medium text-ops-text-sub mb-1">
                        选择关联部署模板 <span className="text-red-400">*</span>
                      </label>
                      <select
                        id="create-fleet-template"
                        value={createTemplateId ?? ''}
                        onChange={(e) => handleTemplateSelectChange(Number(e.target.value))}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none"
                        required
                      >
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} (#{tpl.id}) - {tpl.supervision_mode === 'systemd' ? 'Systemd' : 'Native'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Template Spec Summary Card */}
                    {(() => {
                      const selectedTpl = templates.find((t) => t.id === createTemplateId);
                      if (!selectedTpl) return null;
                      return (
                        <div className="rounded-xl border border-ops-border/70 bg-ops-bg/80 p-3 space-y-2 font-mono text-xs">
                          <div className="flex justify-between items-center text-ops-text-muted">
                            <span>监管驱动</span>
                            <span className="font-semibold text-white">
                              {selectedTpl.supervision_mode === 'systemd' ? 'Linux Systemd Unit' : 'OpsHub Native Supervisor'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-ops-text-muted">
                            <span>应用类型</span>
                            <span className="text-ops-cyan font-bold">
                              {selectedTpl.type ? selectedTpl.type.toUpperCase() : 'JAVA_JAR'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-ops-text-muted">
                            <span>默认 JDK</span>
                            <span className="text-ops-text-sub">
                              {jdks.find((j) => j.id === selectedTpl.default_jdk_id)?.name || '模板预设 JDK'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-ops-text-muted pt-1 border-t border-ops-border/40 text-[11px]">
                            <span>路径规则</span>
                            <span className="text-ops-text-sub truncate max-w-[240px]" title={selectedTpl.install_dir_pattern}>
                              {selectedTpl.install_dir_pattern}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Service Name & Port Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="create-fleet-name" className="block text-xs font-medium text-ops-text-sub mb-1">
                          服务名称 <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="create-fleet-name"
                          type="text"
                          required
                          value={createName}
                          onChange={(e) => handleCreateNameChange(e.target.value)}
                          placeholder="例如: order-center-service"
                          className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="create-fleet-port" className="block text-xs font-medium text-ops-text-sub mb-1">
                          监听端口 <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="create-fleet-port"
                          type="number"
                          required
                          min={1}
                          max={65535}
                          value={createPort}
                          onChange={(e) => setCreatePort(Number(e.target.value))}
                          placeholder="例如: 8080"
                          className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Auto-derived Install Directory */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-ops-text-sub">
                          安装部署路径
                        </label>
                        <span className="text-[10px] font-mono text-ops-cyan/80 bg-cyan-950/50 px-2 py-0.5 rounded border border-ops-cyan/20">
                          跟随模板与名称自动生成
                        </span>
                      </div>
                      <div
                        className="w-full rounded-lg border border-ops-border/70 bg-ops-bg/60 px-3 py-2 text-xs font-mono text-ops-text-sub break-all select-all"
                        title="安装路径跟随模板规则与服务名称生成"
                      >
                        {createInstallDir || '(自动生成)'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-950/20 border border-ops-cyan/30 text-xs text-ops-text-muted">
                      <Info className="h-4 w-4 text-ops-cyan shrink-0" />
                      <span>创建成功后，服务实例将直接纳入集群舰队并继承模板运行参数，可在卡片详情中进一步维护。</span>
                    </div>
                  </form>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-ops-border bg-ops-bg/80 px-6 py-4">
                <button
                  type="button"
                  disabled={isCreatingService}
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateServiceError(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white transition-colors disabled:opacity-40"
                >
                  取消
                </button>

                {templates.length > 0 && (
                  <button
                    type="submit"
                    form="create-service-fleet-form"
                    disabled={isCreatingService}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isCreatingService ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>正在创建...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        <span>立即创建并加入舰队</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
