import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cpu,
  Sliders,
  Terminal,
  Check,
  Copy,
  FolderTree,
  Activity,
  Server,
  Zap,
  HelpCircle,
  AlertTriangle,
  Info,
  Radio,
} from 'lucide-react';
import { Template, JDKAsset } from '../../types';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Template>) => Promise<void>;
  initialData?: Partial<Template> | null;
  jdkList?: JDKAsset[];
}

type GCStrategy = 'G1' | 'ZGC' | 'Parallel' | 'CMS' | 'Custom';

const GC_OPTIONS: { id: GCStrategy; name: string; flag: string; desc: string }[] = [
  { id: 'G1', name: 'G1 GC', flag: '-XX:+UseG1GC', desc: '大堆低延迟与吞吐平衡，现代 JDK 默认推荐' },
  { id: 'ZGC', name: 'ZGC', flag: '-XX:+UseZGC', desc: '亚毫秒级最大停顿，超低延迟首选 (JDK 15+)' },
  { id: 'Parallel', name: 'Parallel', flag: '-XX:+UseParallelGC', desc: '多线程吞吐优先，适合批处理与计算任务' },
  { id: 'CMS', name: 'CMS', flag: '-XX:+UseConcMarkSweepGC', desc: '老年代并发标记清除 (旧版本兼容)' },
  { id: 'Custom', name: '自定义', flag: '', desc: '不显式注入 GC 策略或完全手动指定' },
];

interface PlaceholderVar {
  name: string;
  desc: string;
  example: string;
}

const BUILTIN_VARIABLES: PlaceholderVar[] = [
  { name: '${JAVA_BIN}', desc: '绑定的 JDK 可执行程序绝对路径', example: '/usr/bin/java' },
  { name: '${INSTALL_DIR}', desc: '服务在宿主机的实际安装目录绝对路径', example: '/opt/apps/order-service' },
  { name: '${JVM_OPTS}', desc: '调优计算编译出的完整 JVM 启动参数', example: '-Xms1024m -Xmx2048m -XX:+UseG1GC' },
  { name: '${PORT}', desc: '服务配置的主监听业务端口号', example: '8080' },
  { name: '${SERVICE_NAME}', desc: '当前服务唯一英文标识名', example: 'order-service' },
  { name: '${PACKAGE_FILE}', desc: '部署包目标文件存储绝对路径', example: '.../app.jar' },
  { name: '${PID}', desc: '当前运行进程 PID（停止命令专用）', example: '12345' },
  { name: '${ENV_xxx}', desc: '自定义注入的环境变量（如 ${ENV_SPRING_PROFILES_ACTIVE}）', example: 'prod' },
];

function formatMemoryString(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) {
    return `${mb / 1024}g`;
  }
  return `${mb}m`;
}

function parseMemoryMB(arg: string, prefix: string): number | null {
  const regex = new RegExp(`${prefix}(\\d+)([mMgG])`);
  const match = arg.match(regex);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'g') return val * 1024;
  return val;
}

function formatEnvVarsForDisplay(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
      }
    } catch {
      return raw;
    }
  }
  return raw;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  jdkList = [],
}) => {
  // Basic metadata
  const [name, setName] = useState('');
  const [type, setType] = useState<Template['type']>('java_jar');
  const [defaultJdkId, setDefaultJdkId] = useState<number | undefined>(undefined);
  const [installDirPattern, setInstallDirPattern] = useState('/opt/apps/${SERVICE_NAME}');
  const [supervisionMode, setSupervisionMode] = useState<Template['supervision_mode']>('native');
  const [startCmd, setStartCmd] = useState('');
  const [stopCmd, setStopCmd] = useState('');
  const [envVars, setEnvVars] = useState('SPRING_PROFILES_ACTIVE=prod');
  const [uninstallRules, setUninstallRules] = useState('{"keep_logs": true, "backup_config": true}');

  // Visual JVM Tuner states
  const [heapMin, setHeapMin] = useState<number>(512); // MB
  const [heapMax, setHeapMax] = useState<number>(1024); // MB
  const [gcStrategy, setGcStrategy] = useState<string>('G1');
  const [extraJvmArgs, setExtraJvmArgs] = useState<string>('-XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Health check config
  const [healthType, setHealthType] = useState<'http' | 'tcp' | 'process'>('http');
  const [healthPath, setHealthPath] = useState<string>('/actuator/health');
  const [healthInterval, setHealthInterval] = useState<number>(5);
  const [showVarTooltip, setShowVarTooltip] = useState(false);

  const handleInsertVar = (varName: string) => {
    setStartCmd((prev) => (prev ? `${prev} ${varName}` : varName));
  };

  const startCmdPlaceholder =
    type === 'generic_archive'
      ? '留空则按 ${INSTALL_DIR}/bin/startup.sh 自动执行'
      : '留空则按 ${JAVA_BIN} ${JVM_OPTS} -jar app.jar 自动生成';

  const stopCmdPlaceholder =
    type === 'generic_archive'
      ? '留空向 PID 发送 SIGTERM，可填 ${INSTALL_DIR}/bin/shutdown.sh'
      : '例如: kill -15 ${PID} (留空自动向 PID 发送优雅 SIGTERM)';

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setType(initialData.type || 'java_jar');
      setDefaultJdkId(initialData.default_jdk_id ?? undefined);
      setInstallDirPattern(initialData.install_dir_pattern || '/opt/apps/${SERVICE_NAME}');
      setSupervisionMode(initialData.supervision_mode || 'native');
      setStartCmd(initialData.start_cmd || '');
      setStopCmd(initialData.stop_cmd || '');
      setEnvVars(formatEnvVarsForDisplay(initialData.env_vars));
      setUninstallRules(initialData.uninstall_rules || '{"keep_logs": true, "backup_config": true}');

      // Parse JVM options
      const jvm = initialData.jvm_options || '';
      if (jvm) {
        const parsedMin = parseMemoryMB(jvm, '-Xms');
        const parsedMax = parseMemoryMB(jvm, '-Xmx');
        if (parsedMin) setHeapMin(parsedMin);
        if (parsedMax) setHeapMax(parsedMax);

        if (jvm.includes('-XX:+UseZGC')) setGcStrategy('ZGC');
        else if (jvm.includes('-XX:+UseParallelGC')) setGcStrategy('Parallel');
        else if (jvm.includes('-XX:+UseConcMarkSweepGC')) setGcStrategy('CMS');
        else if (jvm.includes('-XX:+UseG1GC')) setGcStrategy('G1');
        else setGcStrategy('Custom');

        // Extract extra args without -Xms, -Xmx, GC flag
        const cleaned = jvm
          .replace(/-Xms\S+/g, '')
          .replace(/-Xmx\S+/g, '')
          .replace(/-XX:\+Use(G1|Z|Parallel|ConcMarkSweep)GC/g, '')
          .trim();
        setExtraJvmArgs(cleaned);
      } else {
        setHeapMin(512);
        setHeapMax(1024);
        setGcStrategy('G1');
        setExtraJvmArgs('-XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8');
      }

      // Parse health check config
      try {
        if (initialData.health_check_config) {
          const hc = JSON.parse(initialData.health_check_config);
          if (hc.type) setHealthType(hc.type);
          if (hc.path) setHealthPath(hc.path);
          if (hc.interval_sec) setHealthInterval(hc.interval_sec);
        }
      } catch {
        // ignore parse error
      }
    } else {
      // Default new template state
      setName('');
      setType('java_jar');
      setDefaultJdkId(undefined);
      setInstallDirPattern('/opt/apps/${SERVICE_NAME}');
      setSupervisionMode('native');
      setStartCmd('');
      setStopCmd('');
      setEnvVars('SPRING_PROFILES_ACTIVE=prod');
      setHeapMin(512);
      setHeapMax(1024);
      setGcStrategy('G1');
      setExtraJvmArgs('-XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8');
      setHealthType('http');
      setHealthPath('/actuator/health');
      setHealthInterval(5);
    }
    setValidationError(null);
  }, [initialData, isOpen]);

  // Real-time rendered JVM string
  const renderedJvmOptions = useMemo(() => {
    const parts: string[] = [];
    parts.push(`-Xms${formatMemoryString(heapMin)}`);
    parts.push(`-Xmx${formatMemoryString(heapMax)}`);

    const selectedGC = GC_OPTIONS.find((g) => g.id === gcStrategy);
    if (selectedGC && selectedGC.flag) {
      parts.push(selectedGC.flag);
    }

    if (extraJvmArgs.trim()) {
      parts.push(extraJvmArgs.trim());
    }

    return parts.join(' ');
  }, [heapMin, heapMax, gcStrategy, extraJvmArgs]);

  // Copy rendered preview to clipboard
  const handleCopy = () => {
    navigator.clipboard?.writeText(renderedJvmOptions);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Quick heap presets
  const applyPreset = (min: number, max: number) => {
    setHeapMin(min);
    setHeapMax(max);
  };

  // Pre-flight validation & submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError('模板名称不能为空');
      return;
    }
    if (heapMin > heapMax) {
      setValidationError('初始堆内存 (Xms) 不能大于最大堆内存 (Xmx)');
      return;
    }
    setValidationError(null);

    const healthConfig: Record<string, any> = {
      type: healthType,
      interval_sec: healthInterval,
    };
    if (healthType === 'http') {
      healthConfig.path = healthPath;
    }
    const healthConfigStr = JSON.stringify(healthConfig);

    const payload: Partial<Template> = {
      name: name.trim(),
      type,
      default_jdk_id: defaultJdkId || null,
      install_dir_pattern: installDirPattern.trim(),
      jvm_options: renderedJvmOptions,
      env_vars: envVars.trim(),
      supervision_mode: supervisionMode,
      start_cmd: startCmd.trim(),
      stop_cmd: stopCmd.trim(),
      health_check_config: healthConfigStr,
      uninstall_rules: uninstallRules,
    };

    try {
      setIsSubmitting(true);
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || '保存失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {/* Stable Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
          />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-ops-border bg-ops-surface shadow-2xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ops-border bg-ops-bg/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan shadow-cyan-glow">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {initialData?.id ? '编辑部署模板' : '配置部署模板'}
                </h2>
                <p className="text-xs text-ops-text-muted font-mono">
                  JVM 内存调优、垃圾收集算法策略及标准进程生命周期规范
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body (Scrollable) */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Validation Error Alert */}
            {validationError && (
              <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Section 1: Template Basic Metadata */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-ops-cyan">
                <Server className="h-3.5 w-3.5" />
                <span>基础模板元数据 / Basic Metadata</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="template-name" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    模板名称 <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="template-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如: SpringBoot-Standard-Service"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3.5 py-2 text-sm text-white placeholder-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="template-type" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    工程制品类型
                  </label>
                  <select
                    id="template-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-sm text-white focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                  >
                    <option value="java_jar">Java 可执行 JAR (java_jar)</option>
                    <option value="generic_archive">通用压缩包 (generic_archive)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="template-jdk" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    默认运行 JDK
                  </label>
                  <select
                    id="template-jdk"
                    value={defaultJdkId ?? ''}
                    onChange={(e) => setDefaultJdkId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-sm text-white focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                  >
                    <option value="">跟随主机系统默认 (PATH 查找)</option>
                    {jdkList.map((jdk) => (
                      <option key={jdk.id} value={jdk.id}>
                        {jdk.name} ({jdk.version_str})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="template-supervision" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    守护监管模式
                  </label>
                  <select
                    id="template-supervision"
                    value={supervisionMode}
                    onChange={(e) => setSupervisionMode(e.target.value)}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-sm text-white focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                  >
                    <option value="native">原生守护 (Native Process Supervisor)</option>
                    <option value="systemd">Systemd 服务单元 (Linux Systemd Unit)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="template-install-dir" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    安装目录模式
                  </label>
                  <input
                    id="template-install-dir"
                    type="text"
                    value={installDirPattern}
                    onChange={(e) => setInstallDirPattern(e.target.value)}
                    placeholder="/opt/apps/${SERVICE_NAME}"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3.5 py-2 text-sm font-mono text-white placeholder-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Visual JVM Memory & GC Tuner (Highlights!) */}
            <div className="rounded-xl border border-ops-border bg-ops-bg/60 p-4 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ops-cyan/10 text-ops-cyan border border-ops-cyan/30">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      JVM 内存与 GC 调优 / Visual JVM Tuner
                    </h3>
                    <p className="text-[11px] text-ops-text-muted">
                      动态滑块调节堆内存限制，自适应计算并生成生产级 JVM 参数
                    </p>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-ops-text-muted mr-1 hidden sm:inline">常用规格:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset(512, 1024)}
                    className="px-2 py-0.5 text-[11px] font-mono rounded bg-ops-surface border border-ops-border hover:border-ops-cyan text-ops-text-sub hover:text-white transition-colors"
                  >
                    512M-1G
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(1024, 2048)}
                    className="px-2 py-0.5 text-[11px] font-mono rounded bg-ops-surface border border-ops-border hover:border-ops-cyan text-ops-text-sub hover:text-white transition-colors"
                  >
                    1G-2G
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(2048, 4096)}
                    className="px-2 py-0.5 text-[11px] font-mono rounded bg-ops-surface border border-ops-border hover:border-ops-cyan text-ops-text-sub hover:text-white transition-colors"
                  >
                    2G-4G
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(4096, 8192)}
                    className="px-2 py-0.5 text-[11px] font-mono rounded bg-ops-surface border border-ops-border hover:border-ops-cyan text-ops-text-sub hover:text-white transition-colors"
                  >
                    4G-8G
                  </button>
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                {/* Heap Min Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="heap-min-slider" className="font-medium text-ops-text-sub">
                      堆初始内存 (Xms)
                    </label>
                    <span className="font-mono text-sm font-semibold text-ops-cyan bg-cyan-950/40 px-2 py-0.5 rounded border border-ops-cyan/30">
                      {formatMemoryString(heapMin)} ({heapMin} MB)
                    </span>
                  </div>
                  <input
                    id="heap-min-slider"
                    type="range"
                    min="256"
                    max="16384"
                    step="256"
                    value={heapMin}
                    onChange={(e) => setHeapMin(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-ops-cyan"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-ops-text-muted">
                    <span>256M</span>
                    <span>4G</span>
                    <span>8G</span>
                    <span>16G</span>
                  </div>
                </div>

                {/* Heap Max Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="heap-max-slider" className="font-medium text-ops-text-sub">
                      堆最大内存 (Xmx)
                    </label>
                    <span className="font-mono text-sm font-semibold text-ops-emerald bg-emerald-950/40 px-2 py-0.5 rounded border border-ops-emerald/30">
                      {formatMemoryString(heapMax)} ({heapMax} MB)
                    </span>
                  </div>
                  <input
                    id="heap-max-slider"
                    type="range"
                    min="512"
                    max="32768"
                    step="512"
                    value={heapMax}
                    onChange={(e) => setHeapMax(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-ops-emerald"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-ops-text-muted">
                    <span>512M</span>
                    <span>8G</span>
                    <span>16G</span>
                    <span>32G</span>
                  </div>
                </div>
              </div>

              {/* GC Strategy Selection Pills */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ops-text-sub">垃圾收集器策略 (Garbage Collector)</span>
                  <span className="text-[11px] text-ops-text-muted">
                    {GC_OPTIONS.find((g) => g.id === gcStrategy)?.desc}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {GC_OPTIONS.map((gc) => {
                    const isSelected = gcStrategy === gc.id;
                    return (
                      <button
                        key={gc.id}
                        type="button"
                        onClick={() => setGcStrategy(gc.id)}
                        className={`group relative flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-mono font-medium transition-all ${
                          isSelected
                            ? 'bg-ops-cyan/15 text-ops-cyan border-ops-cyan shadow-cyan-glow'
                            : 'bg-ops-surface text-ops-text-muted border-ops-border hover:border-ops-border-hover hover:text-white'
                        }`}
                      >
                        <span className="font-bold">{gc.name}</span>
                        <span className="text-[10px] text-ops-text-muted group-hover:text-ops-text-sub truncate max-w-full mt-0.5">
                          {gc.flag || '无'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Extra JVM Arguments */}
              <div className="pt-1">
                <label htmlFor="extra-jvm-args" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                  附加 JVM 诊断与系统参数
                </label>
                <input
                  id="extra-jvm-args"
                  type="text"
                  value={extraJvmArgs}
                  onChange={(e) => setExtraJvmArgs(e.target.value)}
                  placeholder="-Dfile.encoding=UTF-8 -XX:+HeapDumpOnOutOfMemoryError"
                  className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white placeholder-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                />
              </div>

              {/* Real-time Dynamic Preview Box (Directive highlight!) */}
              <div className="rounded-lg border border-ops-cyan/30 bg-slate-950/80 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-ops-cyan" />
                    <span className="text-xs font-mono font-semibold text-ops-cyan">
                      实时 JVM 参数预览 / Rendered Command String
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] font-mono text-ops-text-muted hover:text-ops-cyan transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-ops-emerald" />
                        <span className="text-ops-emerald">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
                <div
                  data-testid="jvm-preview-text"
                  className="p-2.5 rounded bg-ops-bg/90 border border-ops-border/60 text-xs font-mono text-emerald-400 break-all select-all selection:bg-ops-cyan/30"
                >
                  {renderedJvmOptions}
                </div>
              </div>
            </div>

            {/* Section 3: Health Check & Process Lifecycle */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-ops-cyan">
                <Activity className="h-3.5 w-3.5" />
                <span>健康检查与探测策略 / Health Check Probe</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="health-type" className="block text-xs font-medium text-ops-text-sub mb-1">
                    探针协议
                  </label>
                  <select
                    id="health-type"
                    value={healthType}
                    onChange={(e) => setHealthType(e.target.value as any)}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white focus:border-ops-cyan focus:outline-none"
                  >
                    <option value="http">HTTP 接口探测</option>
                    <option value="tcp">TCP 端口连通</option>
                    <option value="process">仅进程存活 (PID)</option>
                  </select>
                </div>

                {/* 仅在 TCP 协议时的提示说明 */}
                {healthType === 'tcp' && (
                  <motion.div
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="sm:col-span-2 flex flex-col justify-between"
                  >
                    <label className="block text-xs font-medium text-ops-text-sub mb-1">
                      探测机制与端口策略
                    </label>
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-ops-cyan/35 bg-cyan-950/25 text-xs shadow-sm transition-colors">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ops-cyan/15 text-ops-cyan border border-ops-cyan/30">
                        <Radio className="h-3.5 w-3.5 animate-pulse" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-ops-cyan/20 text-ops-cyan border border-ops-cyan/40 shrink-0">
                          动态端口
                        </span>
                        <span className="text-xs text-ops-text-sub leading-snug">
                          自动探测具体服务实例配置的主监听端口连通性（四层 TCP 握手），无需在此指定端口
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* 仅在 HTTP 协议时显示 HTTP 探测路径 */}
                {healthType === 'http' && (
                  <motion.div
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="sm:col-span-2"
                  >
                    <label htmlFor="health-path" className="block text-xs font-medium text-ops-text-sub mb-1">
                      HTTP 探测路径
                    </label>
                    <input
                      id="health-path"
                      type="text"
                      value={healthPath}
                      onChange={(e) => setHealthPath(e.target.value)}
                      placeholder="/actuator/health"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs font-mono text-white focus:border-ops-cyan focus:outline-none"
                    />
                  </motion.div>
                )}

                {/* 仅进程存活 (PID) 时的提示说明 */}
                {healthType === 'process' && (
                  <motion.div
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="sm:col-span-2 flex flex-col justify-between"
                  >
                    <label className="block text-xs font-medium text-ops-text-sub mb-1">
                      存活性探测机制
                    </label>
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-emerald-500/35 bg-emerald-950/25 text-xs shadow-sm transition-colors">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-ops-emerald border border-emerald-500/30">
                        <Cpu className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-ops-emerald border border-emerald-500/40 shrink-0">
                          内核探活
                        </span>
                        <span className="text-xs text-ops-text-sub leading-snug">
                          通过系统内核检测进程存活性，无需监听或探测网络端口
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="start-cmd" className="block text-xs font-medium text-ops-text-sub">
                      启动命令重载 (默认留空自动渲染)
                    </label>

                    {/* 内置变量说明 Tooltip Trigger */}
                    <div className="relative group inline-block">
                      <button
                        type="button"
                        onClick={() => setShowVarTooltip((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-ops-cyan hover:text-cyan-300 transition-colors py-0.5 px-1.5 rounded hover:bg-ops-cyan/10"
                        title="点击或悬浮查看内置占位符变量"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>内置变量说明</span>
                      </button>

                      {/* Floating Tooltip Card */}
                      <div
                        className={`absolute right-0 sm:left-0 bottom-full mb-2 w-80 sm:w-[450px] p-4 rounded-xl border border-ops-border bg-slate-950/95 backdrop-blur-md shadow-2xl z-50 transition-all duration-200 ${
                          showVarTooltip
                            ? 'opacity-100 visible pointer-events-auto'
                            : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto pointer-events-none'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-ops-border/60 pb-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-ops-cyan" />
                            <h4 className="text-xs font-bold text-white tracking-wide">
                              内置运行时占位符 (点击快速插入)
                            </h4>
                          </div>
                          {showVarTooltip && (
                            <button
                              type="button"
                              onClick={() => setShowVarTooltip(false)}
                              className="text-ops-text-muted hover:text-white text-xs p-1"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {type === 'generic_archive' && (
                          <div className="mb-2.5 p-2 rounded-lg border border-amber-500/30 bg-amber-950/30 text-amber-200 text-[11px] leading-relaxed">
                            <span className="font-bold text-amber-400">📦 通用压缩包模式提示：</span>
                            若解压后包含启动脚本，推荐在启动命令中填入安装目录下的脚本（如 bin/startup.sh）；亦可通过 JDK 绝对路径执行特定主类。
                          </div>
                        )}

                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                          {BUILTIN_VARIABLES.map((v) => (
                            <div
                              key={v.name}
                              className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900/60 border border-transparent hover:border-ops-border/60 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleInsertVar(v.name)}
                                    className="px-1.5 py-0.5 rounded bg-ops-cyan/15 hover:bg-ops-cyan/30 text-ops-cyan border border-ops-cyan/40 font-mono text-[11px] font-bold transition-all shrink-0 active:scale-95"
                                    title="点击插入到启动命令"
                                  >
                                    {v.name}
                                  </button>
                                  <span className="text-xs text-slate-200 truncate">{v.desc}</span>
                                </div>
                                <div className="text-[10px] text-ops-text-muted font-mono mt-0.5 pl-0.5">
                                  示例: <span className="text-slate-400">{v.example}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <input
                    id="start-cmd"
                    type="text"
                    value={startCmd}
                    onChange={(e) => setStartCmd(e.target.value)}
                    placeholder={startCmdPlaceholder}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3.5 py-2 text-xs font-mono text-white placeholder-ops-text-muted/40 focus:border-ops-cyan focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="stop-cmd" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                    停止命令重载 (默认留空自动向 PID 发送优雅 SIGTERM)
                  </label>
                  <input
                    id="stop-cmd"
                    type="text"
                    value={stopCmd}
                    onChange={(e) => setStopCmd(e.target.value)}
                    placeholder={stopCmdPlaceholder}
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3.5 py-2 text-xs font-mono text-white placeholder-ops-text-muted/40 focus:border-ops-cyan focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="env-vars" className="block text-xs font-medium text-ops-text-sub mb-1.5">
                  默认注入环境变量 (每行一个 KEY=VALUE)
                </label>
                <textarea
                  id="env-vars"
                  rows={2}
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  placeholder="SPRING_PROFILES_ACTIVE=prod&#10;SERVER_PORT=8080"
                  className="w-full rounded-lg border border-ops-border bg-ops-bg p-2.5 text-xs font-mono text-white placeholder-ops-text-muted/40 focus:border-ops-cyan focus:outline-none"
                />
              </div>
            </div>
          </form>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-ops-border bg-ops-bg/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-sm font-medium text-ops-text-sub hover:text-white hover:bg-ops-border transition-colors"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-ops-cyan text-slate-950 text-sm font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap className="h-4 w-4 fill-slate-950" />
              )}
              <span>保存模板</span>
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};
