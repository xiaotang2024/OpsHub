import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  RefreshCw,
  Cpu,
  Activity,
  AlertTriangle,
  RotateCcw,
  EyeOff,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import type { Service, TemplateSyncDiff } from '../../types';

export interface TemplateSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service;
  diff: TemplateSyncDiff | null;
  onSuccess: (updatedService: Service) => void;
  onIgnored?: () => void;
}

export const TemplateSyncModal: React.FC<TemplateSyncModalProps> = ({
  isOpen,
  onClose,
  service,
  diff,
  onSuccess,
  onIgnored,
}) => {
  const [syncJVM, setSyncJVM] = useState<boolean>(diff?.jvm_diff.is_different ?? false);
  const [syncHealthCheck, setSyncHealthCheck] = useState<boolean>(
    diff?.health_check_diff.is_different ?? false
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !diff) return null;

  const isRunning = service.status === 'RUNNING';
  const hasSelectedAny = syncJVM || syncHealthCheck;

  const handleSync = async (restartNow: boolean) => {
    if (!hasSelectedAny) {
      toast.error('请至少勾选一项需要同步的配置');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.syncTemplate(service.id, {
        sync_jvm: syncJVM,
        sync_health_check: syncHealthCheck,
        restart_now: restartNow,
        ignore_update: false,
      });

      if (restartNow) {
        toast.success(`模板参数已同步至 ${service.name} 并已触发服务重启！`);
      } else {
        toast.success(`模板参数已同步至 ${service.name}，将在下次启动时生效`);
      }
      onSuccess(res);
      onClose();
    } catch (err: any) {
      toast.error(err.message || '同步模板配置失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIgnore = async () => {
    try {
      setIsSubmitting(true);
      await api.syncTemplate(service.id, {
        ignore_update: true,
      });
      toast.success('已忽略当前模板版本更新提醒');
      onIgnored?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative w-full max-w-2xl rounded-2xl border border-ops-border bg-ops-card p-6 shadow-2xl overflow-hidden text-white"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-ops-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                  <span>同步模板配置</span>
                  <span className="text-xs font-mono font-normal text-ops-text-muted">
                    / Sync Template Settings
                  </span>
                </h3>
                <p className="text-xs text-ops-text-muted mt-0.5">
                  依赖模板 <span className="text-ops-cyan font-medium">{diff.template_name}</span>{' '}
                  检测到配置变更，请选择需要加载更新的项
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ops-text-muted hover:bg-ops-surface hover:text-white transition-colors"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body: Selectable Parameters Diff */}
          <div className="my-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. JVM Parameter Item */}
            <div
              onClick={() => setSyncJVM(!syncJVM)}
              className={`rounded-xl border p-4 transition-all cursor-pointer ${
                syncJVM
                  ? 'border-ops-cyan/60 bg-ops-cyan/5 shadow-md shadow-cyan-950/20'
                  : 'border-ops-border bg-ops-surface/60 hover:border-ops-border-hover'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="text-ops-cyan"
                    aria-label={syncJVM ? '取消勾选 JVM 参数' : '勾选 JVM 参数'}
                  >
                    {syncJVM ? (
                      <CheckSquare className="h-4 w-4 fill-ops-cyan/20 text-ops-cyan" />
                    ) : (
                      <Square className="h-4 w-4 text-ops-text-muted" />
                    )}
                  </button>
                  <Cpu className="h-4 w-4 text-ops-cyan shrink-0" />
                  <span className="text-xs font-bold text-white tracking-wide">
                    JVM 内存与调优参数 (JVM Options)
                  </span>
                </div>
                <div>
                  {diff.jvm_diff.is_different ? (
                    <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                      存在变更
                    </span>
                  ) : (
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-ops-text-muted">
                      无差异
                    </span>
                  )}
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono mt-2 pt-2 border-t border-ops-border/60">
                <div className="rounded-lg bg-ops-bg p-2.5 border border-ops-border/60">
                  <span className="text-[10px] text-ops-text-muted block mb-1">
                    当前服务配置:
                  </span>
                  <div className="text-amber-300/90 break-all select-all text-[11px]">
                    {diff.jvm_diff.current || '(未指定个性化参数，沿用模板)'}
                  </div>
                </div>
                <div
                  className={`rounded-lg bg-ops-bg p-2.5 border ${
                    diff.jvm_diff.is_different ? 'border-ops-cyan/30' : 'border-ops-border/60'
                  }`}
                >
                  <span
                    className={`text-[10px] block mb-1 ${
                      diff.jvm_diff.is_different ? 'text-ops-cyan' : 'text-ops-text-muted'
                    }`}
                  >
                    {diff.jvm_diff.is_different ? '模板最新参数 (将更新为):' : '模板最新参数 (无变更):'}
                  </span>
                  <div
                    className={`break-all select-all text-[11px] ${
                      diff.jvm_diff.is_different ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {diff.jvm_diff.template || '(模板未配置)'}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Health Check Config Item */}
            <div
              onClick={() => setSyncHealthCheck(!syncHealthCheck)}
              className={`rounded-xl border p-4 transition-all cursor-pointer ${
                syncHealthCheck
                  ? 'border-ops-cyan/60 bg-ops-cyan/5 shadow-md shadow-cyan-950/20'
                  : 'border-ops-border bg-ops-surface/60 hover:border-ops-border-hover'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="text-ops-cyan"
                    aria-label={syncHealthCheck ? '取消勾选健康检测' : '勾选健康检测'}
                  >
                    {syncHealthCheck ? (
                      <CheckSquare className="h-4 w-4 fill-ops-cyan/20 text-ops-cyan" />
                    ) : (
                      <Square className="h-4 w-4 text-ops-text-muted" />
                    )}
                  </button>
                  <Activity className="h-4 w-4 text-ops-cyan shrink-0" />
                  <span className="text-xs font-bold text-white tracking-wide">
                    健康检测探针参数 (Health Check)
                  </span>
                </div>
                <div>
                  {diff.health_check_diff.is_different ? (
                    <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                      存在变更
                    </span>
                  ) : (
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-ops-text-muted">
                      无差异
                    </span>
                  )}
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono mt-2 pt-2 border-t border-ops-border/60">
                <div className="rounded-lg bg-ops-bg p-2.5 border border-ops-border/60">
                  <span className="text-[10px] text-ops-text-muted block mb-1">
                    当前服务配置:
                  </span>
                  <div className="text-amber-300/90 break-all select-all text-[11px]">
                    {diff.health_check_diff.current || '(默认沿用模板探测策略)'}
                  </div>
                </div>
                <div
                  className={`rounded-lg bg-ops-bg p-2.5 border ${
                    diff.health_check_diff.is_different ? 'border-ops-cyan/30' : 'border-ops-border/60'
                  }`}
                >
                  <span
                    className={`text-[10px] block mb-1 ${
                      diff.health_check_diff.is_different ? 'text-ops-cyan' : 'text-ops-text-muted'
                    }`}
                  >
                    {diff.health_check_diff.is_different
                      ? '模板最新探针 (将更新为):'
                      : '模板探针配置 (已沿用):'}
                  </span>
                  <div
                    className={`break-all select-all text-[11px] ${
                      diff.health_check_diff.is_different ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {diff.health_check_diff.template || '(模板未配置)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Note alert */}
            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 text-xs text-ops-text-sub">
              <AlertTriangle className="h-4 w-4 shrink-0 text-ops-cyan" />
              <span>
                提示：更新配置后不会破坏当前正在运行的进程，将在下一次启动或重新部署时正式生效。
              </span>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-ops-border pt-4">
            <button
              type="button"
              onClick={handleIgnore}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-ops-text-muted hover:text-white hover:bg-ops-surface border border-transparent hover:border-ops-border transition-colors disabled:opacity-50"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span>不再提示本次更新</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-ops-text-sub hover:bg-ops-surface transition-colors"
              >
                取消
              </button>

              <button
                type="button"
                onClick={() => handleSync(false)}
                disabled={isSubmitting || !hasSelectedAny}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-ops-surface border border-ops-border hover:bg-ops-surface-hover hover:border-ops-cyan/50 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>仅同步配置</span>
              </button>

              {isRunning && (
                <button
                  type="button"
                  onClick={() => handleSync(true)}
                  disabled={isSubmitting || !hasSelectedAny}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-ops-cyan text-slate-950 hover:bg-ops-cyan/90 transition-all shadow-md shadow-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>同步并立即重启</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
