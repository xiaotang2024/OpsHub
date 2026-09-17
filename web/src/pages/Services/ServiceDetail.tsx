import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  RotateCw,
  Layers,
  FileCode2,
  Terminal,
  Clock,
  ShieldCheck,
  Check,
  Copy,
  AlertTriangle,
  RotateCcw,
  Activity,
  HardDrive,
  Cpu,
  RefreshCw,
  Sliders,
  FolderTree,
  FileText,
  ExternalLink,
  Info,
  Loader2,
  X,
  ShieldAlert,
  AlertCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Service,
  Template,
  JDKAsset,
  DeployRecord,
  Artifact,
  AuditLog,
  ServiceMetrics,
  DeployPrecheckResult,
  TemplateSyncDiff,
} from '../../types';
import { api } from '../../api';
import { toast } from 'sonner';
import { StatusBadge } from '../../components/service/StatusBadge';
import { DeployWizardModal } from '../../components/deploy/DeployWizardModal';
import { RollbackModal } from '../../components/deploy/RollbackModal';
import { TemplateSyncModal } from '../../components/service/TemplateSyncModal';
import { ProcessTelemetryCard } from '../../components/metrics/ProcessTelemetryCard';
import { ConfigDiffEditor } from '../../components/config/ConfigDiffEditor';
import { LiveLogViewer } from '../../components/terminal/LiveLogViewer';
import { PermissionGate } from '../../components/common/PermissionGate';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { ServiceStartAnimeOverlay } from '../../components/service/ServiceStartAnimeOverlay';
import { usePermission } from '../../hooks/usePermission';
import { useAutoAnimate } from '@formkit/auto-animate/react';

type TabType = 'overview' | 'releases' | 'configs' | 'logs' | 'audit';

const DEFAULT_CONFIG_FILES: string[] = [
  'application.yml',
  'application.yaml',
  'application-dev.yml',
  'application-dev.yaml',
  'application-prod.yml',
  'application-prod.yaml',
];

export const ServiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const serviceId = Number(id);

  const [releasesListRef] = useAutoAnimate();
  const [auditListRef] = useAutoAnimate();

  const { hasPermission, isAdmin } = usePermission();

  const [artifactToDelete, setArtifactToDelete] = useState<{ id: number; filename: string } | null>(null);
  const [isDeletingArtifact, setIsDeletingArtifact] = useState(false);

  const [auditLogToDelete, setAuditLogToDelete] = useState<AuditLog | null>(null);
  const [isDeletingAuditLog, setIsDeletingAuditLog] = useState(false);

  const handleConfirmDeleteArtifact = async () => {
    if (!service || !artifactToDelete) return;
    try {
      setIsDeletingArtifact(true);
      await api.deleteArtifact(service.id, artifactToDelete.id);
      toast.success(`历史制品 ${artifactToDelete.filename} 已成功删除`);
      setArtifactToDelete(null);
      loadServiceData(true);
    } catch (err: any) {
      toast.error(err.message || '删除制品失败');
    } finally {
      setIsDeletingArtifact(false);
    }
  };

  const handleConfirmDeleteAuditLog = async () => {
    if (!auditLogToDelete) return;
    try {
      setIsDeletingAuditLog(true);
      await api.deleteAuditLog(auditLogToDelete.id);
      toast.success(`审计日志 #${auditLogToDelete.id} 已成功删除`);
      setAuditLogToDelete(null);
      if (auditLogs.length === 1 && auditPage > 1) {
        setAuditPage((prev) => prev - 1);
        loadAuditLogs(auditPage - 1, auditPageSize);
      } else {
        loadAuditLogs(auditPage, auditPageSize);
      }
    } catch (err: any) {
      toast.error(err.message || '删除审计日志失败');
    } finally {
      setIsDeletingAuditLog(false);
    }
  };
  const canConfig = hasPermission('service:config');

  // Core data
  const [service, setService] = useState<Service | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [jdk, setJdk] = useState<JDKAsset | null>(null);
  const [releases, setReleases] = useState<DeployRecord[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [configFiles, setConfigFiles] = useState<string[]>([]);

  // Releases Pagination State
  const [releasePage, setReleasePage] = useState<number>(1);
  const [releasePageSize, setReleasePageSize] = useState<number>(10);

  // Audit Logs Pagination State
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditPageSize, setAuditPageSize] = useState<number>(10);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  const releaseTotal = releases.length;
  const releaseTotalPages = Math.max(1, Math.ceil(releaseTotal / releasePageSize));
  const currentReleasePage = Math.min(releasePage, releaseTotalPages);

  const paginatedReleases = useMemo(() => {
    const startIndex = (currentReleasePage - 1) * releasePageSize;
    return releases.slice(startIndex, startIndex + releasePageSize);
  }, [releases, currentReleasePage, releasePageSize]);

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  const currentAuditPage = Math.min(auditPage, auditTotalPages);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [inFlightAction, setInFlightAction] = useState<string | null>(null);
  const [copiedPort, setCopiedPort] = useState(false);
  const [actionAnimeState, setActionAnimeState] = useState<{
    serviceName: string;
    action: 'start' | 'stop' | 'restart';
    status: 'starting' | 'stopping' | 'restarting' | 'success' | 'error';
    errorMessage?: string;
  } | null>(null);

  // Modals
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [rollbackModalVisible, setRollbackModalVisible] = useState(false);
  const [targetRollbackArtifact, setTargetRollbackArtifact] = useState<Artifact | null>(null);

  // Deploy Precheck State
  const [isCheckingDeployPerm, setIsCheckingDeployPerm] = useState(false);
  const [permCheckError, setPermCheckError] = useState<DeployPrecheckResult | null>(null);
  const [copiedFixCmd, setCopiedFixCmd] = useState(false);

  // Template Sync State
  const [syncDiff, setSyncDiff] = useState<TemplateSyncDiff | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);

  const loadAuditLogs = useCallback(
    async (pageToLoad: number = auditPage, sizeToLoad: number = auditPageSize) => {
      if (!serviceId) return;
      try {
        setAuditLoading(true);
        const res = await api.getAuditLogs({
          target_type: 'service',
          target_id: String(serviceId),
          page: pageToLoad,
          page_size: sizeToLoad,
        });
        setAuditLogs(res.items || []);
        setAuditTotal(res.total || 0);
      } catch {
        setAuditLogs([]);
        setAuditTotal(0);
      } finally {
        setAuditLoading(false);
      }
    },
    [serviceId, auditPage, auditPageSize]
  );

  // Load all service data
  const loadServiceData = useCallback(async (isBackground = false) => {
    if (!serviceId) return;
    try {
      if (!isBackground) setLoading(true);
      setError(null);

      const [svc, allTemplates, allJdks, relList, artList, diffData] = await Promise.all([
        api.getService(serviceId),
        api.getTemplates().catch(() => []),
        api.getJDKs().catch(() => []),
        api.getReleases(serviceId).catch(() => []),
        api.getArtifacts(serviceId).catch(() => []),
        api.getTemplateSyncDiff(serviceId).catch(() => null),
      ]);

      setService(svc);
      setReleases(relList || []);
      setArtifacts(artList || []);
      if (diffData) {
        setSyncDiff(diffData);
      }

      if (svc.template_id) {
        const foundTpl = allTemplates.find((t) => t.id === svc.template_id);
        if (foundTpl) setTemplate(foundTpl);
      }

      const activeJdkId = svc.jdk_id;
      if (activeJdkId) {
        const foundJdk = allJdks.find((j) => j.id === activeJdkId);
        if (foundJdk) setJdk(foundJdk);
      }

      // Load metrics
      api.getServiceMetrics(serviceId)
        .then((m) => setMetrics(m))
        .catch(() => setMetrics(null));

      // Load configs
      api.getServiceConfigs(serviceId)
        .then((res) => setConfigFiles(res.files || []))
        .catch(() => setConfigFiles([]));

      // Load audit logs for this service
      api.getAuditLogs({
        target_type: 'service',
        target_id: String(serviceId),
        page: auditPage,
        page_size: auditPageSize,
      })
        .then((res) => {
          setAuditLogs(res.items || []);
          setAuditTotal(res.total || 0);
        })
        .catch(() => {
          setAuditLogs([]);
          setAuditTotal(0);
        });
    } catch (err: any) {
      setError(err.message || '加载服务详情失败');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [serviceId, auditPage, auditPageSize]);

  useEffect(() => {
    loadServiceData();

    const handleAuthenticated = () => {
      loadServiceData();
    };
    window.addEventListener('opshub:authenticated', handleAuthenticated);
    return () => {
      window.removeEventListener('opshub:authenticated', handleAuthenticated);
    };
  }, [loadServiceData]);

  // Real-time periodic polling for live metrics when service is running
  useEffect(() => {
    if (!serviceId || service?.status !== 'RUNNING') return;

    const interval = setInterval(() => {
      api.getServiceMetrics(serviceId)
        .then((m) => {
          if (m) setMetrics(m);
        })
        .catch(() => {
          // ignore background polling error
        });
    }, 5000);

    return () => clearInterval(interval);
  }, [serviceId, service?.status]);

  // Current active artifact
  const currentArtifact = useMemo(() => {
    if (!service || !service.current_artifact_id) return null;
    return artifacts.find((a) => a.id === service.current_artifact_id) || null;
  }, [service, artifacts]);

  // Memoize config files to ensure discovered files are listed alongside common profiles
  const effectiveConfigFiles = useMemo(() => {
    return Array.from(new Set([...configFiles, ...DEFAULT_CONFIG_FILES]));
  }, [configFiles]);

  // Lifecycle actions
  const handleStart = async () => {
    if (!service) return;
    setInFlightAction('start');
    setService((prev) => (prev ? { ...prev, status: 'STARTING' } : prev));
    setActionAnimeState({
      serviceName: service.name,
      action: 'start',
      status: 'starting',
    });

    const startTime = Date.now();
    const MIN_ANIME_MS = 1200;

    try {
      const updated = await api.startService(service.id);
      if (updated.status !== 'RUNNING') {
        throw new Error('服务启动后未能在预定时间内就绪或探针健康检查未通过');
      }
      setService(updated);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'start',
          status: 'success',
        });
        toast.success(`服务 ${service.name} 启动成功，运行就绪`);
        setTimeout(() => {
          setActionAnimeState(null);
        }, 1200);
      }, remaining);
      await loadServiceData(true);
    } catch (err: any) {
      toast.error(`启动服务失败: ${err.message || '未知异常'}`);
      await loadServiceData(true);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'start',
          status: 'error',
          errorMessage: err.message,
        });
        setTimeout(() => {
          setActionAnimeState(null);
        }, 3500);
      }, remaining);
    } finally {
      setInFlightAction(null);
    }
  };

  const handleStop = async () => {
    if (!service) return;
    setInFlightAction('stop');
    setService((prev) => (prev ? { ...prev, status: 'STOPPING' } : prev));
    setActionAnimeState({
      serviceName: service.name,
      action: 'stop',
      status: 'stopping',
    });

    const startTime = Date.now();
    const MIN_ANIME_MS = 1200;

    try {
      const updated = await api.stopService(service.id);
      if (updated.status !== 'STOPPED') {
        throw new Error('服务未能成功停止');
      }
      setService(updated);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'stop',
          status: 'success',
        });
        toast.success(`服务 ${service.name} 已成功停止`);
        setTimeout(() => {
          setActionAnimeState(null);
        }, 1200);
      }, remaining);
      await loadServiceData(true);
    } catch (err: any) {
      toast.error(`停止服务失败: ${err.message || '未知异常'}`);
      await loadServiceData(true);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'stop',
          status: 'error',
          errorMessage: err.message,
        });
        setTimeout(() => {
          setActionAnimeState(null);
        }, 3500);
      }, remaining);
    } finally {
      setInFlightAction(null);
    }
  };

  const handleRestart = async () => {
    if (!service) return;
    setInFlightAction('restart');
    setService((prev) => (prev ? { ...prev, status: 'STARTING' } : prev));
    setActionAnimeState({
      serviceName: service.name,
      action: 'restart',
      status: 'restarting',
    });

    const startTime = Date.now();
    const MIN_ANIME_MS = 1200;

    try {
      const updated = await api.restartService(service.id);
      if (updated.status !== 'RUNNING') {
        throw new Error('服务重启后未能在预定时间内就绪或探针健康检查未通过');
      }
      setService(updated);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'restart',
          status: 'success',
        });
        toast.success(`服务 ${service.name} 重启成功，运行就绪`);
        setTimeout(() => {
          setActionAnimeState(null);
        }, 1200);
      }, remaining);
      await loadServiceData(true);
    } catch (err: any) {
      toast.error(`重启服务失败: ${err.message || '未知异常'}`);
      await loadServiceData(true);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_ANIME_MS - elapsed);
      setTimeout(() => {
        setActionAnimeState({
          serviceName: service.name,
          action: 'restart',
          status: 'error',
          errorMessage: err.message,
        });
        setTimeout(() => {
          setActionAnimeState(null);
        }, 3500);
      }, remaining);
    } finally {
      setInFlightAction(null);
    }
  };

  const handleCopyPort = (port: number) => {
    navigator.clipboard?.writeText(String(port));
    setCopiedPort(true);
    toast.success(`端口号 :${port} 已复制到剪贴板`);
    setTimeout(() => setCopiedPort(false), 2000);
  };

  const openRollbackForArtifact = (artifact: Artifact) => {
    setTargetRollbackArtifact(artifact);
    setRollbackModalVisible(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-slate-800/60 rounded animate-pulse" />
        <div className="h-32 rounded-xl border border-ops-border bg-ops-card p-6 animate-pulse" />
        <div className="h-96 rounded-xl border border-ops-border bg-ops-card p-6 animate-pulse" />
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="inline-flex items-center gap-1.5 text-xs text-ops-text-muted hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>返回服务舰队列表</span>
        </button>
        <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
          <h3 className="text-base font-bold text-white">未能加载指定服务</h3>
          <p className="text-xs text-red-300 font-mono">{error || '服务未找到'}</p>
        </div>
      </div>
    );
  }

  const isRunning = service.status === 'RUNNING';
  const isStopped = service.status === 'STOPPED';
  const isStarting = service.status === 'STARTING';
  const isStopping = service.status === 'STOPPING';
  const isActionBusy = Boolean(inFlightAction);

  const handleOpenDeployModal = async () => {
    if (!service) return;
    setIsCheckingDeployPerm(true);
    try {
      const res = await api.checkDeployPermission(service.id);
      if (res.has_permission) {
        setPermCheckError(null);
        setDeployModalVisible(true);
      } else {
        setPermCheckError(res);
      }
    } catch (err: any) {
      setPermCheckError({
        has_permission: false,
        error: err.message || '检测发版部署权限失败，请检查网络或后端服务状态',
        suggestion: '请检查系统后端是否正常运行并稍后重试',
      });
    } finally {
      setIsCheckingDeployPerm(false);
    }
  };

  const handleCopyFixCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedFixCmd(true);
    setTimeout(() => setCopiedFixCmd(false), 2000);
  };

  const handleIgnoreSync = async () => {
    if (!service) return;
    try {
      await api.syncTemplate(service.id, { ignore_update: true });
      toast.success('已忽略当前模板版本更新提醒');
      setSyncDiff((prev) => (prev ? { ...prev, ignored: true } : null));
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    }
  };

  const isFixedViewportTab = activeTab === 'releases' || activeTab === 'audit' || activeTab === 'overview';

  return (
    <div
      className={
        isFixedViewportTab
          ? 'h-[calc(100vh-6rem)] md:h-[calc(100vh-7rem)] min-h-[480px] flex flex-col gap-3.5 overflow-hidden'
          : 'flex flex-col gap-3.5 min-h-full'
      }
    >
      {/* Fixed Top Zone: Header, Sync Alert, Hero Banner & Tabs Navigation */}
      <div className="shrink-0 space-y-3">
        {/* Top Breadcrumb & Return Nav */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/services')}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-ops-text-muted hover:text-ops-cyan transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回服务舰队</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadServiceData(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ops-border bg-ops-surface text-xs text-ops-text-sub hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* Template Sync Notification Banner */}
        {syncDiff?.has_update && !syncDiff.ignored && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-200 shadow-md">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-300">
                  所属部署模板「{syncDiff.template_name}」有新配置可同步
                </span>
                <p className="text-[11px] text-amber-300/70 mt-0.5">
                  检测到模板中的{' '}
                  <span className="font-semibold text-amber-300">
                    {(() => {
                      const diffItems = [];
                      if (syncDiff.jvm_diff.is_different && syncDiff.template_type !== 'generic_archive') diffItems.push('JVM 参数');
                      if (syncDiff.health_check_diff.is_different && !syncDiff.health_check_diff.inherited) {
                        diffItems.push('健康检查探针');
                      }
                      return diffItems.length > 0 ? diffItems.join('及') : '配置';
                    })()}
                  </span>{' '}
                  已更新，您可以选择性同步到当前服务。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleIgnoreSync}
                className="px-2.5 py-1.5 rounded-lg text-amber-300/80 hover:text-white hover:bg-amber-900/40 transition-colors"
              >
                忽略本次
              </button>
              <button
                type="button"
                onClick={() => setSyncModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 font-semibold hover:bg-amber-500/30 transition-colors shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>查看并同步配置</span>
              </button>
            </div>
          </div>
        )}

        {/* Service Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-ops-border bg-ops-card p-4 sm:p-5 shadow-xl space-y-4">
        <AnimatePresence>
          {actionAnimeState && (
            <ServiceStartAnimeOverlay
              serviceName={actionAnimeState.serviceName}
              action={actionAnimeState.action}
              status={actionAnimeState.status}
              errorMessage={actionAnimeState.errorMessage}
              onClose={() => setActionAnimeState(null)}
            />
          )}
        </AnimatePresence>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-950/80 border border-ops-cyan/40 text-ops-cyan shadow-cyan-glow">
              <Server className="h-7 w-7" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white">{service.name}</h1>
                <StatusBadge status={service.status} />
                <span className="rounded-md bg-ops-surface border border-ops-border px-2.5 py-0.5 text-xs font-mono text-ops-text-muted">
                  ID: #{service.id}
                </span>
                <span className="rounded-md bg-ops-surface border border-ops-border px-2.5 py-0.5 text-xs font-mono text-ops-text-sub">
                  {service.supervision_mode === 'systemd' ? 'Linux Systemd' : 'Native Supervisor'}
                </span>
              </div>

              <div className="text-xs font-mono text-ops-text-muted flex flex-wrap items-center gap-3 mt-1">
                <span>模板: {template ? template.name : `#${service.template_id}`}</span>
                <span>•</span>
                <span>当前制品: {currentArtifact ? currentArtifact.filename : '暂无活跃包'}</span>
                {currentArtifact?.version_tag && (
                  <>
                    <span>•</span>
                    <span className="text-ops-cyan font-semibold">
                      Tag: {currentArtifact.version_tag}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Lifecycle & Deployment Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Start */}
            <PermissionGate
              permission="service:control"
              disableOnDenied
              deniedTooltip="无服务控制权限，请联系管理员授予"
            >
              <button
                type="button"
                disabled={isRunning || isStarting || isActionBusy}
                onClick={handleStart}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                {inFlightAction === 'start' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                <span>启动</span>
              </button>
            </PermissionGate>

            {/* Stop */}
            <PermissionGate
              permission="service:control"
              disableOnDenied
              deniedTooltip="无服务控制权限，请联系管理员授予"
            >
              <button
                type="button"
                disabled={isStopped || isStopping || isActionBusy}
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 bg-red-950/30 text-red-400 hover:bg-red-500/20 text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                {inFlightAction === 'stop' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5 fill-current" />
                )}
                <span>停止</span>
              </button>
            </PermissionGate>

            {/* Restart */}
            <PermissionGate
              permission="service:control"
              disableOnDenied
              deniedTooltip="无服务控制权限，请联系管理员授予"
            >
              <button
                type="button"
                disabled={!isRunning || isActionBusy}
                onClick={handleRestart}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                {inFlightAction === 'restart' ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                <span>重启</span>
              </button>
            </PermissionGate>

            {/* Deploy New Version (Directive Highlight!) */}
            <PermissionGate
              permission="service:deploy"
              disableOnDenied
              deniedTooltip="无发版部署权限，请联系管理员授予"
            >
              <button
                type="button"
                disabled={isCheckingDeployPerm}
                onClick={handleOpenDeployModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isCheckingDeployPerm ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
                <span>{isCheckingDeployPerm ? '检测权限中...' : '部署新版本'}</span>
              </button>
            </PermissionGate>
          </div>
        </div>

        {/* Real-time Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-ops-border font-mono text-xs">
          <div className="rounded-xl border border-ops-border/70 bg-ops-bg/70 p-3">
            <span className="text-ops-text-muted block text-[10px] uppercase">监听服务端口</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base font-bold text-ops-cyan">:{service.port}</span>
              <button
                type="button"
                onClick={() => handleCopyPort(service.port)}
                className="text-ops-text-muted hover:text-white"
                title="复制端口"
              >
                {copiedPort ? (
                  <Check className="h-3.5 w-3.5 text-ops-emerald" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-ops-border/70 bg-ops-bg/70 p-3">
            <span className="text-ops-text-muted block text-[10px] uppercase">操作系统 PID</span>
            <div className="mt-1 text-base font-bold text-white">
              {service.pid > 0 ? `#${service.pid}` : '未运行'}
            </div>
          </div>

          <div className="rounded-xl border border-ops-border/70 bg-ops-bg/70 p-3">
            <span className="text-ops-text-muted block text-[10px] uppercase">内存占用 (RSS)</span>
            <div className="mt-1 text-base font-bold text-emerald-400">
              {metrics?.memory_rss_mb ? `${metrics.memory_rss_mb} MB` : '-'}
            </div>
          </div>

          <div className="rounded-xl border border-ops-border/70 bg-ops-bg/70 p-3">
            <span className="text-ops-text-muted block text-[10px] uppercase">CPU 负载 & 存活</span>
            <div className="mt-1 text-base font-bold text-slate-300">
              {metrics?.uptime ? `${metrics.uptime}` : isRunning ? '在线' : '离线'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center border-b border-ops-border gap-2 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-ops-cyan text-ops-cyan'
              : 'border-transparent text-ops-text-muted hover:text-white'
          }`}
        >
          <Info className="h-4 w-4" />
          <span>概览</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('releases')}
          className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'releases'
              ? 'border-ops-cyan text-ops-cyan'
              : 'border-transparent text-ops-text-muted hover:text-white'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>版本与发布</span>
          {releases.length > 0 && (
            <span className="rounded-full bg-slate-800 px-2 py-0.2 text-[10px] text-slate-300">
              {releases.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('configs')}
          className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'configs'
              ? 'border-ops-cyan text-ops-cyan'
              : 'border-transparent text-ops-text-muted hover:text-white'
          }`}
        >
          <FileCode2 className="h-4 w-4" />
          <span>配置文件</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-ops-cyan text-ops-cyan'
              : 'border-transparent text-ops-text-muted hover:text-white'
          }`}
        >
          <Terminal className="h-4 w-4" />
          <span>实时日志</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-ops-cyan text-ops-cyan'
              : 'border-transparent text-ops-text-muted hover:text-white'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>审计轨迹</span>
        </button>
      </div>
    </div>

    {/* Tab Content Panels */}
    <div className={isFixedViewportTab ? 'flex-1 min-h-0 flex flex-col' : 'space-y-4'}>
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="h-full overflow-y-auto pr-1 space-y-5">
            {/* Live Process Telemetry Gauges Card */}
            <ProcessTelemetryCard
              pid={service.pid}
              cpuPercent={metrics?.cpu_percent ?? 0}
              memoryRssMb={metrics?.memory_rss_mb ?? 0}
              uptime={metrics?.uptime || (isRunning ? '在线' : '离线')}
              status={service.status}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Runtime Environment Info */}
              <div className="rounded-xl border border-ops-border bg-ops-card p-5 space-y-4">
                <h3 className="font-mono text-xs uppercase tracking-wider text-ops-cyan font-bold">
                  运行拓扑与 JDK 资产
                </h3>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-2 border-b border-ops-border/60">
                    <span className="text-ops-text-muted">纳管模式</span>
                    <span className="text-white font-semibold">
                      {service.supervision_mode === 'systemd' ? 'Linux Systemd Unit' : 'OpsHub Native Supervisor'}
                    </span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-ops-border/60">
                    <span className="text-ops-text-muted">已选 JDK 资产</span>
                    <span className="text-emerald-400 font-semibold">
                      {jdk ? `${jdk.name} (${jdk.version_str || 'JDK'})` : '系统默认 JDK'}
                    </span>
                  </div>

                  <div className="flex justify-between py-2 border-b border-ops-border/60">
                    <span className="text-ops-text-muted">关联应用模板</span>
                    <span className="text-ops-cyan font-semibold">
                      {template ? template.name : `#${service.template_id}`}
                    </span>
                  </div>

                  <div className="py-2">
                    <span className="text-ops-text-muted block mb-1">安装部署根路径</span>
                    <div className="rounded-lg bg-ops-bg p-2.5 text-[11px] text-ops-text-sub break-all select-all">
                      {service.install_dir}
                    </div>
                  </div>
                </div>
              </div>

              {/* JVM Parameter Strategy & Health Check */}
              <div className="rounded-xl border border-ops-border bg-ops-card p-5 space-y-4">
                {template?.type !== 'generic_archive' && (
                <>
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-ops-cyan font-bold">
                    JVM 内存与系统调优参数
                  </h3>
                  {template && (
                    <button
                      type="button"
                      onClick={() => setSyncModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan hover:bg-ops-cyan/20 transition-colors"
                      title="打开模板差异对比与同步弹窗"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>同步模板配置</span>
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-ops-border bg-ops-bg p-3.5 font-mono text-xs text-emerald-400 break-all select-all leading-relaxed">
                  {service.jvm_options || '(未指定个性化 JVM 参数，将默认沿用模板配置)'}
                </div>
                </>
                )}

                <div className="flex items-center justify-between pt-2">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-ops-cyan font-bold">
                    健康检测探针配置 (Health Check)
                  </h3>
                  {template?.type === 'generic_archive' && template && (
                    <button
                      type="button"
                      onClick={() => setSyncModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan hover:bg-ops-cyan/20 transition-colors"
                      title="打开模板差异对比与同步弹窗"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>同步模板配置</span>
                    </button>
                  )}
                </div>
                <div className="rounded-xl border border-ops-border bg-ops-bg p-3.5 font-mono text-xs text-ops-text-sub break-all select-all leading-relaxed">
                  {service.health_check_config || template?.health_check_config || '(默认沿用模板端口/进程探针)'}
                </div>

                <h3 className="font-mono text-xs uppercase tracking-wider text-ops-cyan font-bold pt-2">
                  环境变量 (Environment Variables)
                </h3>
                <pre className="rounded-xl border border-ops-border bg-ops-bg p-3.5 font-mono text-xs text-ops-text-sub whitespace-pre-wrap">
                  {service.env_vars || '(无自定义环境变量注入)'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Releases (Directive Highlight: Release history timeline & RollbackModal integration) */}
        {activeTab === 'releases' && (
          <div className="h-full flex flex-col space-y-3 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">发布历史与制品时间线</h3>
                <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                  记录不可篡改的 7 步部署与回滚执行明细
                </p>
              </div>

              <PermissionGate
                permission="service:deploy"
                disableOnDenied
                deniedTooltip="无发版部署权限，请联系管理员授予"
              >
                <button
                  type="button"
                  disabled={isCheckingDeployPerm}
                  onClick={handleOpenDeployModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50"
                >
                  {isCheckingDeployPerm ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Layers className="h-3.5 w-3.5" />
                  )}
                  <span>{isCheckingDeployPerm ? '检测权限中...' : '部署新版本'}</span>
                </button>
              </PermissionGate>
            </div>

            {releases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ops-border bg-ops-card/50 p-12 text-center space-y-3">
                <Layers className="h-8 w-8 text-ops-text-muted mx-auto" />
                <div className="text-sm font-bold text-white">暂无发布记录</div>
                <p className="text-xs text-ops-text-muted font-mono">
                  点击右上角“部署新版本”按钮，开始首次流水线发布。
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-ops-border bg-ops-card overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 z-10 border-b border-ops-border bg-ops-bg text-ops-text-muted shadow-sm">
                      <tr>
                        <th className="px-4 py-3 bg-ops-bg">流水号</th>
                        <th className="px-4 py-3 bg-ops-bg">类型</th>
                        <th className="px-4 py-3 bg-ops-bg">对应制品 / 版本</th>
                        <th className="px-4 py-3 bg-ops-bg">执行操作人</th>
                        <th className="px-4 py-3 bg-ops-bg">状态</th>
                        <th className="px-4 py-3 bg-ops-bg">开始时间</th>
                        <th className="px-4 py-3 bg-ops-bg text-right">回滚操作</th>
                      </tr>
                    </thead>
                    <tbody ref={releasesListRef} className="divide-y divide-ops-border text-ops-text-sub">
                      {paginatedReleases.map((rec) => {
                        const isDeploy = rec.action === 'DEPLOY';
                        const isSuccess = rec.status === 'SUCCESS';
                        const matchedArtifact = artifacts.find((a) => a.id === rec.artifact_id);
                        const isCurrentActive = service.current_artifact_id === rec.artifact_id;

                        return (
                          <tr key={rec.id} className="hover:bg-ops-surface/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-white">#{rec.id}</td>

                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isDeploy
                                    ? 'bg-cyan-950 border border-ops-cyan/40 text-ops-cyan'
                                    : 'bg-amber-950 border border-amber-500/40 text-amber-400'
                                }`}
                              >
                                {rec.action}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">
                                  {matchedArtifact ? matchedArtifact.filename : `制品 #${rec.artifact_id || '-'}`}
                                </span>
                                {!matchedArtifact && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ops-surface border border-ops-border text-ops-text-muted"
                                    title="该制品的物理文件与元数据已从服务器清理，仅保留发版审计流水"
                                  >
                                    实体包已清理
                                  </span>
                                )}
                              </div>
                              {matchedArtifact?.version_tag ? (
                                <div className="text-[10px] text-ops-text-muted">
                                  Tag: {matchedArtifact.version_tag}
                                </div>
                              ) : (
                                <div className="text-[10px] text-ops-text-muted">
                                  已保留发版审计记录
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="text-white">{rec.operator}</div>
                              <div className="text-[10px] text-ops-text-muted">{rec.client_ip}</div>
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isSuccess
                                    ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-400'
                                    : 'bg-red-950/60 border border-red-500/40 text-red-400'
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-ops-text-muted">
                              {new Date(rec.started_at).toLocaleString()}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {matchedArtifact && !isCurrentActive && (
                                <div className="inline-flex items-center gap-2 justify-end">
                                  <PermissionGate
                                    permission="service:rollback"
                                    disableOnDenied
                                    deniedTooltip="无版本回滚权限，请联系管理员授予"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openRollbackForArtifact(matchedArtifact)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      <span>一键回滚</span>
                                    </button>
                                  </PermissionGate>

                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => setArtifactToDelete({ id: matchedArtifact.id, filename: matchedArtifact.filename })}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-bold transition-colors"
                                      title="删除历史制品包（仅管理员）"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      <span>删除</span>
                                    </button>
                                  )}
                                </div>
                              )}
                              {isCurrentActive && (
                                <span className="rounded px-2 py-0.5 text-[10px] bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                                  当前活跃
                                </span>
                              )}
                              {!matchedArtifact && !isCurrentActive && (
                                <span className="text-[11px] font-mono text-ops-text-muted/70">
                                  包已清理 (不可回滚)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Releases Pagination Bar */}
                <div className="shrink-0 border-t border-ops-border bg-ops-card/90 backdrop-blur-sm px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ops-text-muted">
                  <div>
                    显示第 {releaseTotal > 0 ? (currentReleasePage - 1) * releasePageSize + 1 : 0} -{' '}
                    {Math.min(currentReleasePage * releasePageSize, releaseTotal)} 条，共{' '}
                    <span className="text-white font-bold">{releaseTotal}</span> 条发布记录
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span>每页</span>
                      <select
                        aria-label="发布记录每页条数"
                        value={releasePageSize}
                        onChange={(e) => {
                          setReleasePageSize(Number(e.target.value));
                          setReleasePage(1);
                        }}
                        className="bg-ops-surface border border-ops-border rounded px-2 py-1 text-white font-mono text-xs focus:outline-none"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <span>条</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentReleasePage <= 1}
                        onClick={() => setReleasePage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="上一页"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <span className="px-2 py-1 text-white font-bold">
                        {currentReleasePage} / {releaseTotalPages}
                      </span>

                      <button
                        type="button"
                        disabled={currentReleasePage >= releaseTotalPages}
                        onClick={() => setReleasePage((p) => Math.min(releaseTotalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="下一页"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Configs */}
        {activeTab === 'configs' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-ops-border bg-ops-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-950 border border-purple-500/30 text-purple-400">
                  <FileCode2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">配置文件中心 (Config Center)</h3>
                  <p className="text-xs text-ops-text-muted font-mono">
                    在线修改 Spring Boot / JVM 配置，支持版本差异比对与 .bak 安全快照备份
                  </p>
                </div>
              </div>

              <ConfigDiffEditor
                serviceId={service.id}
                files={effectiveConfigFiles}
                readOnly={!canConfig}
                onSaveSuccess={() => {
                  loadServiceData(true);
                }}
                onDeleteSuccess={() => {
                  loadServiceData(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Tab 4: Logs */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-surface border border-ops-border text-ops-cyan">
                  <Terminal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ops-text-main">实时控制台终端 (Live Terminal)</h3>
                  <p className="text-xs text-ops-text-muted font-mono">
                    基于 WebSocket 与 xterm.js 的全双工低延迟实时运维终端
                  </p>
                </div>
              </div>
            </div>

            <LiveLogViewer
              serviceId={service.id}
              serviceName={service.name}
            />
          </div>
        )}

        {/* Tab 5: Audit (Audit logs table) */}
        {activeTab === 'audit' && (
          <div className="h-full flex flex-col space-y-3 min-h-0">
            <div className="shrink-0">
              <h3 className="text-sm font-bold text-white tracking-tight">服务操作审计日志</h3>
              <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                记录对该服务实例的所有启动、停止、发布及回滚操作记录
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ops-border bg-ops-card p-8 text-center text-xs font-mono text-ops-text-muted">
                当前服务暂无审计轨迹记录
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-ops-border bg-ops-card overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 z-10 border-b border-ops-border bg-ops-bg text-ops-text-muted shadow-sm">
                      <tr>
                        <th className="px-4 py-3 bg-ops-bg">序号</th>
                        <th className="px-4 py-3 bg-ops-bg">操作动作</th>
                        <th className="px-4 py-3 bg-ops-bg">执行操作人</th>
                        <th className="px-4 py-3 bg-ops-bg">来源 IP</th>
                        <th className="px-4 py-3 bg-ops-bg">状态</th>
                        <th className="px-4 py-3 bg-ops-bg">时间</th>
                        <th className="px-4 py-3 bg-ops-bg">详情说明</th>
                        {isAdmin && (
                          <th className="px-4 py-3 bg-ops-bg text-right whitespace-nowrap min-w-[80px]">
                            操作
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody ref={auditListRef} className="divide-y divide-ops-border text-ops-text-sub">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-ops-surface/50">
                          <td className="px-4 py-3 text-white">#{log.id}</td>
                          <td className="px-4 py-3 font-semibold text-ops-cyan">{log.action}</td>
                          <td className="px-4 py-3 text-white">{log.operator}</td>
                          <td className="px-4 py-3 text-ops-text-muted">{log.client_ip}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.status === 'SUCCESS' || log.status === 'RUNNING'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-red-950 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ops-text-muted">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-slate-400 truncate max-w-xs" title={log.details}>
                            {log.details}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                aria-label="删除服务审计日志"
                                onClick={() => setAuditLogToDelete(log)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-ops-bg border border-red-500/30 text-red-400 hover:bg-red-950/40 hover:border-red-500 transition-colors text-[11px]"
                                title="删除该审计日志记录"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>删除</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Audit Pagination Bar */}
                <div className="shrink-0 border-t border-ops-border bg-ops-card/90 backdrop-blur-sm px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ops-text-muted">
                  <div>
                    显示第 {auditTotal > 0 ? (currentAuditPage - 1) * auditPageSize + 1 : 0} -{' '}
                    {Math.min(currentAuditPage * auditPageSize, auditTotal)} 条，共{' '}
                    <span className="text-white font-bold">{auditTotal}</span> 条记录
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span>每页</span>
                      <select
                        aria-label="审计日志每页条数"
                        value={auditPageSize}
                        onChange={(e) => {
                          const newSize = Number(e.target.value);
                          setAuditPageSize(newSize);
                          setAuditPage(1);
                          loadAuditLogs(1, newSize);
                        }}
                        className="bg-ops-surface border border-ops-border rounded px-2 py-1 text-white font-mono text-xs focus:outline-none"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <span>条</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentAuditPage <= 1 || auditLoading}
                        onClick={() => {
                          const prevPage = Math.max(1, currentAuditPage - 1);
                          setAuditPage(prevPage);
                          loadAuditLogs(prevPage, auditPageSize);
                        }}
                        className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="上一页"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <span className="px-2 py-1 text-white font-bold">
                        {currentAuditPage} / {auditTotalPages}
                      </span>

                      <button
                        type="button"
                        disabled={currentAuditPage >= auditTotalPages || auditLoading}
                        onClick={() => {
                          const nextPage = Math.min(auditTotalPages, currentAuditPage + 1);
                          setAuditPage(nextPage);
                          loadAuditLogs(nextPage, auditPageSize);
                        }}
                        className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-sub hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        title="下一页"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deployment Wizard Modal */}
      {deployModalVisible && (
        <DeployWizardModal
          visible={deployModalVisible}
          serviceId={service.id}
          serviceName={service.name}
          currentArtifactId={service.current_artifact_id}
          onClose={() => setDeployModalVisible(false)}
          onSuccess={() => {
            loadServiceData(true);
          }}
        />
      )}

      {/* Rollback Confirmation Modal */}
      {rollbackModalVisible && targetRollbackArtifact && (
        <RollbackModal
          visible={rollbackModalVisible}
          serviceId={service.id}
          serviceName={service.name}
          currentArtifact={currentArtifact}
          targetArtifact={targetRollbackArtifact}
          onClose={() => {
            setRollbackModalVisible(false);
            setTargetRollbackArtifact(null);
          }}
          onSuccess={() => {
            loadServiceData(true);
          }}
        />
      )}

      {/* Deploy Permission Precheck Alert Modal */}
      {permCheckError && (() => {
        const alertContent = (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md !m-0">
            <div className="relative w-full max-w-lg rounded-2xl border border-rose-500/30 bg-ops-surface shadow-2xl p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-400 shadow-rose-950/50">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-wide">
                      发版部署权限检测未通过
                    </h3>
                    <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                      {permCheckError.type === 'directory_permission'
                        ? '宿主机安装目录缺少写入或创建权限'
                        : permCheckError.type === 'user_role_permission'
                        ? '当前用户角色权限不足'
                        : '账号未认证或发版权限受限'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPermCheckError(null)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Error detail */}
              <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/30 space-y-1.5 font-mono text-xs">
                <div className="text-rose-400 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>检测结果：</span>
                </div>
                <div className="text-rose-200/90 break-words leading-relaxed pl-5">
                  {permCheckError.error || '未满足发版部署前置权限要求'}
                </div>
                {permCheckError.install_dir && (
                  <div className="text-[11px] text-rose-300/70 pt-1 border-t border-rose-500/20 pl-5">
                    目标安装目录：<span className="text-rose-200 font-semibold">{permCheckError.install_dir}</span>
                  </div>
                )}
              </div>

              {/* Suggestion / Fix Command */}
              {permCheckError.suggestion && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-ops-cyan" />
                      <span>建议修复方案（在服务器终端执行）：</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyFixCmd(permCheckError.suggestion!)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-ops-border bg-ops-bg text-[11px] font-mono text-ops-cyan hover:border-ops-cyan/50 hover:bg-cyan-950/30 transition-colors"
                    >
                      {copiedFixCmd ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>复制命令</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="relative rounded-xl border border-ops-border bg-black/80 p-3 font-mono text-xs text-emerald-400 break-all select-all shadow-inner">
                    {permCheckError.suggestion}
                  </div>
                  <p className="text-[11px] text-ops-text-muted font-mono leading-relaxed">
                    💡 执行修复命令后，点击下方【重新检测】按钮，通过后将自动打开部署向导。
                  </p>
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-ops-border">
                <button
                  type="button"
                  onClick={() => setPermCheckError(null)}
                  className="px-4 py-2 rounded-lg border border-ops-border bg-ops-card text-xs font-semibold text-ops-text-sub hover:text-white hover:bg-ops-card-hover transition-colors"
                >
                  关闭
                </button>
                <button
                  type="button"
                  disabled={isCheckingDeployPerm}
                  onClick={handleOpenDeployModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  {isCheckingDeployPerm ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>{isCheckingDeployPerm ? '检测中...' : '重新检测'}</span>
                </button>
              </div>
            </div>
          </div>
        );
        if (typeof document !== 'undefined') {
          return createPortal(alertContent, document.body);
        }
        return alertContent;
      })()}

      {/* Template Sync Modal */}
      {syncModalOpen && service && (
        <TemplateSyncModal
          isOpen={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          service={service}
          diff={syncDiff}
          templateType={template?.type}
          onSuccess={(updated) => {
            setService(updated);
            loadServiceData(true);
          }}
          onIgnored={() => {
            loadServiceData(true);
          }}
        />
      )}

      {/* Delete Artifact Confirmation Modal */}
      <ConfirmModal
        visible={!!artifactToDelete}
        title="删除历史制品确认"
        subtitle="高危操作 · 物理删除后无法找回"
        message={
          <span>
            确定要永久删除历史制品包 <span className="text-white font-bold">{artifactToDelete?.filename}</span> 吗？此操作将从服务器磁盘物理移除该包，不可逆！
          </span>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={isDeletingArtifact}
        onConfirm={handleConfirmDeleteArtifact}
        onCancel={() => setArtifactToDelete(null)}
      />

      {/* Delete Audit Log Confirmation Modal */}
      <ConfirmModal
        visible={!!auditLogToDelete}
        title="确认删除审计日志"
        subtitle={`审计日志 #${auditLogToDelete?.id || ''}`}
        message="删除后该审计记录将永久移除且不可恢复。确定要删除此条审计日志吗？"
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={isDeletingAuditLog}
        onConfirm={handleConfirmDeleteAuditLog}
        onCancel={() => {
          if (!isDeletingAuditLog) setAuditLogToDelete(null);
        }}
      />

    </div>
  );
};

export default ServiceDetail;
