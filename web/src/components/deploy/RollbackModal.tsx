import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCode,
  Clock,
  HardDrive,
  ShieldAlert,
  Loader2,
  X,
  Hash,
} from 'lucide-react';
import { Artifact, DeployRecord } from '../../types';
import { api } from '../../api';

export interface RollbackModalProps {
  visible: boolean;
  serviceId: number;
  serviceName: string;
  currentArtifact?: Artifact | null;
  targetArtifact: Artifact;
  onClose: () => void;
  onSuccess?: (record: DeployRecord) => void;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTimeDelta(targetDateStr: string, currentDateStr?: string) {
  try {
    const target = new Date(targetDateStr).getTime();
    const current = currentDateStr ? new Date(currentDateStr).getTime() : Date.now();
    const diffSec = Math.floor((current - target) / 1000);
    if (diffSec < 60) return `${diffSec} 秒前`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    return `${Math.floor(diffSec / 86400)} 天前`;
  } catch {
    return '未知时间差';
  }
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  visible,
  serviceId,
  serviceName,
  currentArtifact,
  targetArtifact,
  onClose,
  onSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedRisk, setConfirmedRisk] = useState(false);

  if (!visible) return null;

  const handleConfirmRollback = async () => {
    if (!serviceId || !targetArtifact) return;

    setSubmitting(true);
    setError(null);

    try {
      const record = await api.rollbackService(serviceId, targetArtifact.id);
      if (onSuccess) {
        onSuccess(record);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '回滚操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-2xl rounded-2xl border border-amber-500/30 bg-ops-surface shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ops-border bg-ops-bg/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400 shadow-amber-glow">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  一键版本回滚确认
                </h2>
                <span className="rounded-full bg-amber-950/70 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-mono font-medium text-amber-400">
                  {serviceName}
                </span>
              </div>
              <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                执行就地安全版本还原，并自动完成健康探测校验
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white disabled:opacity-30 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Warning Banner */}
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 flex items-start gap-3 text-xs text-amber-300 shadow-inner">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">高敏运维风险提示</span>
              <p className="text-amber-200/90 leading-relaxed">
                回滚操作将平滑停机当前运行实例，就地切换二进制制品至指定历史快照，并执行 7 步就绪探针。若探测失败，系统将保护性中止并告警。
              </p>
            </div>
          </div>

          {/* Side-by-Side Diff Card */}
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-ops-text-muted">
              版本差异对比 (Version Diff Comparison)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Active Version */}
              <div className="rounded-xl border border-ops-border bg-ops-bg/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase font-bold text-slate-400">
                    当前运行版本
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700">
                    CURRENT
                  </span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-ops-text-muted block text-[10px]">制品文件名</span>
                    <span className="font-bold text-white truncate block">
                      {currentArtifact ? currentArtifact.filename : '当前包 (app.jar)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-ops-text-muted block text-[10px]">版本 Tag</span>
                      <span className="text-ops-cyan font-semibold">
                        {currentArtifact?.version_tag || '未打标'}
                      </span>
                    </div>
                    {currentArtifact?.file_size && (
                      <div className="text-right">
                        <span className="text-ops-text-muted block text-[10px]">包体大小</span>
                        <span className="text-ops-text-sub">
                          {formatBytes(currentArtifact.file_size)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-ops-text-muted block text-[10px]">发布时间</span>
                    <span className="text-ops-text-sub">
                      {currentArtifact?.upload_time
                        ? new Date(currentArtifact.upload_time).toLocaleString()
                        : '运行中历史包'}
                    </span>
                  </div>

                  {currentArtifact?.sha256 && (
                    <div className="pt-2 border-t border-ops-border/60">
                      <span className="text-ops-text-muted block text-[10px]">SHA-256 校验码</span>
                      <span className="text-[10px] text-slate-400 font-mono break-all">
                        {currentArtifact.sha256.substring(0, 24)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Target Historical Version */}
              <div className="rounded-xl border border-amber-500/50 bg-amber-950/20 p-4 space-y-3 shadow-amber-glow relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase font-bold text-amber-400">
                    目标回滚版本
                  </span>
                  <span className="rounded bg-amber-950 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono text-amber-400 font-bold">
                    TARGET
                  </span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-ops-text-muted block text-[10px]">制品文件名</span>
                    <span className="font-bold text-amber-300 truncate block">
                      {targetArtifact.filename}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-ops-text-muted block text-[10px]">版本 Tag</span>
                      <span className="text-amber-400 font-semibold">
                        {targetArtifact.version_tag || 'none'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-ops-text-muted block text-[10px]">包体大小</span>
                      <span className="text-ops-text-sub">
                        {formatBytes(targetArtifact.file_size)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-ops-text-muted block text-[10px]">构建产生时间</span>
                    <div className="flex items-center gap-1.5 text-ops-text-sub">
                      <span>{new Date(targetArtifact.upload_time).toLocaleString()}</span>
                      <span className="text-[10px] text-amber-400 font-semibold">
                        ({formatTimeDelta(targetArtifact.upload_time, currentArtifact?.upload_time)})
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-500/20">
                    <span className="text-ops-text-muted block text-[10px]">SHA-256 校验码</span>
                    <span className="text-[10px] text-amber-200/80 font-mono break-all">
                      {targetArtifact.sha256 ? `${targetArtifact.sha256.substring(0, 24)}...` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <div className="rounded-xl border border-ops-border bg-ops-card p-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmedRisk}
                onChange={(e) => setConfirmedRisk(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ops-border bg-ops-bg text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs text-ops-text-sub leading-relaxed">
                我已确认回滚目标版本无安全缺陷，已知晓执行回滚将导致服务秒级短暂重启，确认回滚操作。
              </span>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-400 font-mono">
              回滚失败: {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ops-border bg-ops-bg/80 px-6 py-4">
          <div className="text-xs font-mono text-ops-text-muted">
            目标制品 ID: #{targetArtifact.id}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-ops-border bg-ops-surface px-4 py-2 text-xs font-medium text-ops-text-sub hover:text-white hover:border-ops-border-hover transition-colors"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleConfirmRollback}
              disabled={submitting || !confirmedRisk}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-amber-glow hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在回滚...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>确认回滚到此版本</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RollbackModal;
