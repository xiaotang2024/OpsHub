import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  FileCheck,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Layers,
  ArrowRight,
  Clock,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { Artifact, DeployRecord } from '../../types';
import { api } from '../../api';

export interface DeployWizardModalProps {
  visible: boolean;
  serviceId?: number;
  serviceName?: string;
  currentStep?: number;
  onClose: () => void;
  onSuccess?: (record: DeployRecord) => void;
}

export const PIPELINE_STEPS = [
  {
    id: 1,
    key: 'preflight',
    title: '1. 预检',
    subtitle: 'Pre-flight Check',
    desc: '检查磁盘可用空间、安装目录写入权限、JDK 运行时路径与端口占用',
  },
  {
    id: 2,
    key: 'backup',
    title: '2. 备份',
    subtitle: 'In-place Backup',
    desc: '就地安全备份现有运行包 app.jar 至 backup/app.jar.prev',
  },
  {
    id: 3,
    key: 'stop',
    title: '3. 停机',
    subtitle: 'Stop Existing Service',
    desc: '通过 Supervisor 或 Systemd 优雅停止当前实例进程',
  },
  {
    id: 4,
    key: 'distribute',
    title: '4. 制品分发',
    subtitle: 'Distribute Artifact',
    desc: '将目标制品安全同步复制至目标运行目录',
  },
  {
    id: 5,
    key: 'launch',
    title: '5. 启动新版本',
    subtitle: 'Launch New Version',
    desc: '注入环境变量、JVM 调优参数并拉起全新版本进程',
  },
  {
    id: 6,
    key: 'probe',
    title: '6. 就绪探测',
    subtitle: 'Health Check Probe',
    desc: '主动探测 HTTP/TCP 就绪探针，若超时失败立即触发安全自愈回退',
  },
  {
    id: 7,
    key: 'finalize',
    title: '7. 记录生效',
    subtitle: 'Finalize Release',
    desc: '持久化发布元数据与不可篡改审计追踪记录',
  },
];

function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export const DeployWizardModal: React.FC<DeployWizardModalProps> = ({
  visible,
  serviceId,
  serviceName = '服务',
  currentStep: externalCurrentStep,
  onClose,
  onSuccess,
}) => {
  // Stepper state
  const [activeStep, setActiveStep] = useState<number>(externalCurrentStep ?? 1);
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [pipelineFinished, setPipelineFinished] = useState<boolean>(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Tab: upload new artifact vs select existing
  const [artifactTab, setArtifactTab] = useState<'upload' | 'existing'>('upload');
  const [existingArtifacts, setExistingArtifacts] = useState<Artifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [versionTag, setVersionTag] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [hashProgress, setHashProgress] = useState<number>(0);
  const [fileSha256, setFileSha256] = useState<string>('');
  const [isComputingHash, setIsComputingHash] = useState(false);

  // Live timer & logs
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [stepDurations, setStepDurations] = useState<Record<number, number>>({});
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [isLogExpanded, setIsLogExpanded] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Reset all modal state whenever visible changes
  useEffect(() => {
    if (visible) {
      setActiveStep(externalCurrentStep ?? 1);
      setPipelineRunning(false);
      setPipelineFinished(false);
      setPipelineError(null);
      setFile(null);
      setVersionTag('');
      setHashProgress(0);
      setFileSha256('');
      setIsComputingHash(false);
      setElapsedSeconds(0);
      setStepDurations({});
      setPipelineLogs([]);
      setIsLogExpanded(false);
      setArtifactTab('upload');
    }
  }, [visible, externalCurrentStep]);

  // Sync external currentStep if provided
  useEffect(() => {
    if (externalCurrentStep !== undefined) {
      setActiveStep(externalCurrentStep);
    }
  }, [externalCurrentStep]);

  // Load existing artifacts when modal opens or tab changes
  useEffect(() => {
    if (visible && serviceId) {
      setLoadingArtifacts(true);
      api
        .getArtifacts(serviceId)
        .then((data) => {
          setExistingArtifacts(data || []);
          if (data && data.length > 0 && !selectedArtifactId) {
            setSelectedArtifactId(data[0].id);
          }
        })
        .catch(() => {
          setExistingArtifacts([]);
        })
        .finally(() => setLoadingArtifacts(false));
    }
  }, [visible, serviceId]);

  // Ticker for active step duration
  useEffect(() => {
    let timer: any = null;
    if (pipelineRunning) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
        setStepDurations((prev) => ({
          ...prev,
          [activeStep]: (prev[activeStep] || 0) + 1,
        }));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [pipelineRunning, activeStep]);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (isLogExpanded && typeof logsEndRef.current?.scrollIntoView === 'function') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pipelineLogs, isLogExpanded]);

  if (!visible) return null;

  // Compute file SHA256 in browser
  const computeSHA256 = async (selectedFile: File) => {
    setIsComputingHash(true);
    setHashProgress(10);
    try {
      const buffer = await selectedFile.arrayBuffer();
      setHashProgress(60);
      const digestBuffer = await crypto.subtle.digest('SHA-256', buffer);
      setHashProgress(90);
      const hashArray = Array.from(new Uint8Array(digestBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      setFileSha256(hashHex);
      setHashProgress(100);
    } catch {
      // Fallback
      setFileSha256('hash-computation-unavailable');
      setHashProgress(100);
    } finally {
      setIsComputingHash(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    // Auto populate version tag from filename if empty
    if (!versionTag) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setVersionTag(cleanName);
    }
    computeSHA256(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Trigger real or simulated deploy execution
  const handleStartDeploy = async () => {
    if (!serviceId) {
      alert('未指定服务 ID，无法触发部署');
      return;
    }

    let targetArtifactId = selectedArtifactId;
    let stepProgressionInterval: any = null;

    setPipelineRunning(true);
    setPipelineError(null);
    setPipelineFinished(false);
    setActiveStep(1);
    setElapsedSeconds(0);
    setStepDurations({});
    setIsLogExpanded(true);
    setPipelineLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 初始化部署流水线，目标服务: ${serviceName} (#${serviceId})`,
    ]);

    try {
      // If uploading new package, upload first
      if (artifactTab === 'upload') {
        if (!file) {
          throw new Error('请选择待部署的安装包制品');
        }
        setPipelineLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 📦 正在上传制品: ${file.name} (${formatBytes(file.size)})...`,
        ]);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('version_tag', versionTag || file.name);
        const uploaded = await api.uploadArtifact(serviceId, formData);
        targetArtifactId = uploaded.id;
        setPipelineLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ✅ 制品上传成功 (ID: #${uploaded.id}, Tag: ${uploaded.version_tag})`,
        ]);
      }

      if (!targetArtifactId) {
        throw new Error('未选定可部署的制品 ID');
      }

      // Step progression simulation during backend execution
      stepProgressionInterval = setInterval(() => {
        setActiveStep((prev) => {
          if (prev < 6) return prev + 1;
          return prev;
        });
      }, 1200);

      setPipelineLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚙️ 触发后端 7 步部署流水线...`,
      ]);

      const record = await api.deployService(serviceId, targetArtifactId);

      if (stepProgressionInterval) {
        clearInterval(stepProgressionInterval);
        stepProgressionInterval = null;
      }

      if (record.output_log) {
        const lines = record.output_log.split('\n').filter(Boolean);
        setPipelineLogs((prev) => [...prev, ...lines]);
      }

      // Verify record.status
      if (record.status && record.status !== 'SUCCESS') {
        setPipelineFinished(false);
        setPipelineRunning(false);
        const errMsg = record.output_log || `部署失败 (状态: ${record.status})`;
        setPipelineError(errMsg);
        setPipelineLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ❌ 部署失败 (状态: ${record.status})`,
        ]);
        return;
      }

      setActiveStep(7);
      setPipelineFinished(true);
      setPipelineRunning(false);

      if (!record.output_log) {
        setPipelineLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🎉 部署流水线全部 7 步顺利完成，服务已正常上线！`,
        ]);
      }

      if (onSuccess) {
        onSuccess(record);
      }
    } catch (err: any) {
      if (stepProgressionInterval) {
        clearInterval(stepProgressionInterval);
        stepProgressionInterval = null;
      }
      setPipelineRunning(false);
      setPipelineFinished(false);
      setPipelineError(err.message || '部署流水线执行失败');
      setPipelineLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ 异常中断: ${err.message || '部署失败'}`,
      ]);
    } finally {
      if (stepProgressionInterval) {
        clearInterval(stepProgressionInterval);
        stepProgressionInterval = null;
      }
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-4xl rounded-2xl border border-ops-border bg-ops-surface shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-ops-border bg-ops-bg/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/80 border border-ops-cyan/30 text-ops-cyan shadow-cyan-glow">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  7 步高可用部署流水线
                </h2>
                <span className="rounded-full bg-cyan-950/70 border border-ops-cyan/40 px-2 py-0.5 text-[11px] font-mono font-medium text-ops-cyan">
                  {serviceName}
                </span>
              </div>
              <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                预检 → 备份 → 停机 → 分发 → 启动 → 探针就绪 → 记录审计
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={pipelineRunning}
            className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white disabled:opacity-30 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 7-Step Animated Stepper Directives */}
          <div className="rounded-xl border border-ops-border bg-ops-card p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ops-text-muted">
                流水线执行状态 (Pipeline Pipeline Stages)
              </span>
              {pipelineRunning && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-ops-cyan animate-pulse">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Step {activeStep}: {PIPELINE_STEPS[activeStep - 1]?.subtitle} ({elapsedSeconds}s)
                  </span>
                </div>
              )}
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
              {PIPELINE_STEPS.map((step) => {
                const isCompleted = step.id < activeStep || (step.id === 7 && pipelineFinished);
                const isActive = step.id === activeStep && !pipelineFinished;
                const isFailed = pipelineError !== null && step.id === activeStep;
                const duration = stepDurations[step.id];

                return (
                  <div
                    key={step.id}
                    className={`relative flex flex-col justify-between rounded-xl p-3 border transition-all duration-200 ${
                      isActive
                        ? 'border-ops-cyan bg-cyan-950/40 shadow-cyan-glow'
                        : isCompleted
                        ? 'border-emerald-500/40 bg-emerald-950/20'
                        : isFailed
                        ? 'border-red-500/50 bg-red-950/30 shadow-crimson-glow'
                        : 'border-ops-border/60 bg-ops-bg/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-ops-text-muted">
                        0{step.id}
                      </span>
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-ops-emerald shrink-0" />
                      ) : isFailed ? (
                        <AlertCircle className="h-4 w-4 text-ops-crimson shrink-0" />
                      ) : isActive ? (
                        <div className="relative flex h-4 w-4 items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ops-cyan opacity-75" />
                          <Loader2 className="h-3.5 w-3.5 text-ops-cyan animate-spin" />
                        </div>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-600" />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div
                        className={`text-xs font-bold leading-snug ${
                          isActive
                            ? 'text-ops-cyan font-extrabold'
                            : isCompleted
                            ? 'text-emerald-400'
                            : isFailed
                            ? 'text-red-400'
                            : 'text-ops-text-sub'
                        }`}
                      >
                        {step.title}
                      </div>
                      <div className="text-[10px] font-mono text-ops-text-muted truncate">
                        {step.subtitle}
                      </div>
                    </div>

                    {/* Step duration ticker badge */}
                    {duration !== undefined && duration > 0 && (
                      <div className="mt-2 text-[10px] font-mono text-ops-text-muted text-right">
                        {duration}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Package Selection & Upload Area */}
          {!pipelineRunning && !pipelineFinished && (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex items-center gap-2 border-b border-ops-border pb-2 text-xs">
                <button
                  type="button"
                  onClick={() => setArtifactTab('upload')}
                  className={`pb-1 px-2 font-medium transition-colors border-b-2 ${
                    artifactTab === 'upload'
                      ? 'border-ops-cyan text-ops-cyan font-bold'
                      : 'border-transparent text-ops-text-muted hover:text-white'
                  }`}
                >
                  上传新制品包 (Upload New Artifact)
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactTab('existing')}
                  className={`pb-1 px-2 font-medium transition-colors border-b-2 ${
                    artifactTab === 'existing'
                      ? 'border-ops-cyan text-ops-cyan font-bold'
                      : 'border-transparent text-ops-text-muted hover:text-white'
                  }`}
                >
                  选择已有历史版本 ({existingArtifacts.length})
                </button>
              </div>

              {artifactTab === 'upload' ? (
                <div className="space-y-4">
                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
                      isDragging
                        ? 'border-ops-cyan bg-cyan-950/30'
                        : file
                        ? 'border-emerald-500/50 bg-emerald-950/10'
                        : 'border-ops-border hover:border-ops-border-hover bg-ops-card'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".jar,.war,.tar.gz,.zip,.tar"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileSelect(e.target.files[0]);
                        }
                      }}
                    />

                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ops-surface border border-ops-border text-ops-cyan">
                        {file ? <FileCheck className="h-6 w-6 text-emerald-400" /> : <UploadCloud className="h-6 w-6" />}
                      </div>

                      {file ? (
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-white">{file.name}</div>
                          <div className="text-xs font-mono text-emerald-400">
                            大小: {formatBytes(file.size)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-semibold text-white">
                            点击上传或拖拽二进制包至此处
                          </div>
                          <div className="text-xs font-mono text-ops-text-muted mt-0.5">
                            支持 .jar, .war, .tar.gz 等标准发布包格式
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Client-side SHA256 computing indicator */}
                  {(isComputingHash || fileSha256) && (
                    <div className="rounded-xl border border-ops-border bg-ops-bg/80 p-3 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between text-ops-text-muted">
                        <span>客户端 SHA-256 完整性校验</span>
                        <span>{hashProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-ops-cyan transition-all duration-300"
                          style={{ width: `${hashProgress}%` }}
                        />
                      </div>
                      {fileSha256 && (
                        <div className="text-[11px] text-ops-text-sub truncate">
                          Hash: <span className="text-ops-cyan">{fileSha256}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Version Tag Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-ops-text-muted">
                      版本标识 (Version Tag)
                    </label>
                    <input
                      type="text"
                      placeholder="如: v1.4.2 或 git-commit-c4e12"
                      value={versionTag}
                      onChange={(e) => setVersionTag(e.target.value)}
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white placeholder-ops-text-muted focus:border-ops-cyan focus:outline-none font-mono"
                    />
                  </div>
                </div>
              ) : (
                /* Select Existing Artifacts */
                <div className="space-y-2">
                  {loadingArtifacts && (
                    <div className="py-8 text-center text-xs text-ops-text-muted font-mono flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-ops-cyan" />
                      <span>正在检索制品仓库历史...</span>
                    </div>
                  )}

                  {!loadingArtifacts && existingArtifacts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-ops-border p-6 text-center text-xs text-ops-text-muted font-mono">
                      该服务暂无历史保存制品，请先上传新版本二进制包。
                    </div>
                  )}

                  {!loadingArtifacts && existingArtifacts.length > 0 && (
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-ops-border bg-ops-bg divide-y divide-ops-border">
                      {existingArtifacts.map((art) => {
                        const isSelected = selectedArtifactId === art.id;
                        return (
                          <div
                            key={art.id}
                            onClick={() => setSelectedArtifactId(art.id)}
                            className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-cyan-950/40 text-white'
                                : 'hover:bg-ops-surface text-ops-text-sub'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                  isSelected ? 'border-ops-cyan bg-ops-cyan' : 'border-slate-600'
                                }`}
                              >
                                {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-black" />}
                              </div>
                              <div>
                                <div className="text-xs font-semibold">{art.filename}</div>
                                <div className="text-[10px] font-mono text-ops-text-muted">
                                  Tag: {art.version_tag || 'none'} | 大小: {formatBytes(art.file_size)}
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] font-mono text-ops-text-muted">
                              {new Date(art.upload_time).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {pipelineError && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 flex items-start gap-3 text-xs text-red-300">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">流水线异常中断</div>
                <div>{pipelineError}</div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {pipelineFinished && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 flex items-center gap-3 text-xs text-emerald-300 shadow-emerald-glow">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-sm">部署成功 (Deployment Succeeded)</div>
                <div className="text-emerald-400/80 font-mono mt-0.5">
                  服务已成功切换至新版本，就绪探针健康检测通过，元数据与审计记录已同步记入。
                </div>
              </div>
            </div>
          )}

          {/* Live Log Accordion / Drawer */}
          <div className="rounded-xl border border-ops-border bg-black/90 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsLogExpanded(!isLogExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-950/90 text-xs font-mono text-ops-text-muted hover:text-white border-b border-ops-border transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-ops-cyan" />
                <span className="font-bold text-slate-200">实时流水线控制台日志 (Console Stream)</span>
                <span className="text-[11px] text-ops-text-muted font-normal">
                  ({pipelineLogs.length} 行)
                </span>
              </div>
              {isLogExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {isLogExpanded && (
              <div className="p-4 font-mono text-xs text-slate-300 max-h-56 overflow-y-auto space-y-1 leading-relaxed selection:bg-cyan-950">
                {pipelineLogs.length === 0 ? (
                  <div className="text-slate-600">流水线日志输出缓冲区空闲...</div>
                ) : (
                  pipelineLogs.map((line, idx) => {
                    const isError = line.includes('❌') || line.toLowerCase().includes('fail');
                    const isSuccess = line.includes('✅') || line.includes('🎉') || line.includes('successfully');
                    return (
                      <div
                        key={idx}
                        className={`${
                          isError ? 'text-red-400 font-bold' : isSuccess ? 'text-emerald-400' : ''
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-ops-border bg-ops-bg/80 px-6 py-4">
          <div className="text-xs font-mono text-ops-text-muted">
            {pipelineRunning
              ? '流水线运行中，请勿刷新或关闭窗口...'
              : pipelineFinished
              ? '部署已生效'
              : '就绪探测失败将自动触发零停机秒级回滚保护'}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pipelineRunning}
              className="rounded-lg border border-ops-border bg-ops-surface px-4 py-2 text-xs font-medium text-ops-text-sub hover:text-white hover:border-ops-border-hover disabled:opacity-30 transition-colors"
            >
              {pipelineFinished ? '完成并返回' : '取消'}
            </button>

            {!pipelineFinished && (
              <button
                type="button"
                onClick={handleStartDeploy}
                disabled={
                  pipelineRunning ||
                  (artifactTab === 'upload' && !file) ||
                  (artifactTab === 'existing' && !selectedArtifactId)
                }
                className="flex items-center gap-2 rounded-lg bg-ops-cyan px-5 py-2 text-xs font-bold text-slate-950 shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all"
              >
                {pipelineRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>执行中...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>开始执行 7 步部署</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DeployWizardModal;
