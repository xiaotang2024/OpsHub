import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode2,
  AlertTriangle,
  Save,
  RotateCcw,
  CheckCircle2,
  Split,
  Edit3,
  Loader2,
  ShieldCheck,
  RefreshCw,
  X,
  Columns,
  AlignLeft,
  Plus,
  HelpCircle,
  Info,
  Trash2,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { ConfigBackupInfo } from '../../types';
import { usePermission } from '../../hooks/usePermission';
import { ConfirmModal } from '../common/ConfirmModal';

export interface ConfigDiffEditorProps {
  serviceId: number;
  files?: string[];
  backups?: ConfigBackupInfo[];
  onSaveSuccess?: (fileName: string) => void;
  onDeleteSuccess?: (fileName: string) => void;
  className?: string;
  readOnly?: boolean;
}

type ViewMode = 'edit' | 'diff';
type DiffStyle = 'split' | 'unified';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  origLineNo?: number;
  modLineNo?: number;
  content: string;
}

export interface SideBySideRow {
  left?: { lineNo: number; content: string; type: 'removed' | 'unchanged' };
  right?: { lineNo: number; content: string; type: 'added' | 'unchanged' };
}

// Robust LCS (Longest Common Subsequence) diff algorithm
export function computeDiff(original: string, modified: string): { unified: DiffLine[]; sideBySide: SideBySideRow[] } {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const m = origLines.length;
  const n = modLines.length;

  // LCS dynamic programming table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to construct minimal edit sequence
  let i = m;
  let j = n;
  const rawDiff: { type: 'added' | 'removed' | 'unchanged'; origIdx?: number; modIdx?: number; content: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      rawDiff.push({
        type: 'unchanged',
        origIdx: i - 1,
        modIdx: j - 1,
        content: origLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.push({
        type: 'added',
        modIdx: j - 1,
        content: modLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.push({
        type: 'removed',
        origIdx: i - 1,
        content: origLines[i - 1],
      });
      i--;
    }
  }

  rawDiff.reverse();

  // Unified diff lines with accurate line numbers
  let origLineNo = 1;
  let modLineNo = 1;
  const unified: DiffLine[] = rawDiff.map((item) => {
    if (item.type === 'unchanged') {
      return {
        type: 'unchanged',
        origLineNo: origLineNo++,
        modLineNo: modLineNo++,
        content: item.content,
      };
    } else if (item.type === 'removed') {
      return {
        type: 'removed',
        origLineNo: origLineNo++,
        content: item.content,
      };
    } else {
      return {
        type: 'added',
        modLineNo: modLineNo++,
        content: item.content,
      };
    }
  });

  // Construct Side-by-side rows aligning changes side by side
  const sideBySide: SideBySideRow[] = [];
  let k = 0;
  while (k < unified.length) {
    const item = unified[k];
    if (item.type === 'unchanged') {
      sideBySide.push({
        left: { lineNo: item.origLineNo!, content: item.content, type: 'unchanged' },
        right: { lineNo: item.modLineNo!, content: item.content, type: 'unchanged' },
      });
      k++;
    } else {
      const removedGroup: DiffLine[] = [];
      const addedGroup: DiffLine[] = [];
      while (k < unified.length && unified[k].type !== 'unchanged') {
        if (unified[k].type === 'removed') {
          removedGroup.push(unified[k]);
        } else {
          addedGroup.push(unified[k]);
        }
        k++;
      }
      const count = Math.max(removedGroup.length, addedGroup.length);
      for (let idx = 0; idx < count; idx++) {
        const rem = removedGroup[idx];
        const add = addedGroup[idx];
        sideBySide.push({
          left: rem ? { lineNo: rem.origLineNo!, content: rem.content, type: 'removed' } : undefined,
          right: add ? { lineNo: add.modLineNo!, content: add.content, type: 'added' } : undefined,
        });
      }
    }
  }

  return { unified, sideBySide };
}

export const DEFAULT_CONFIG_NAMES = [
  'application',
  'application-dev',
  'application-test',
  'application-prod',
];

export const DEFAULT_EXTENSIONS = ['yaml', 'yml', 'properties'] as const;

export function parseFileName(file: string): { name: string; ext: string } {
  if (!file) {
    return { name: 'application', ext: 'yml' };
  }
  const lastDot = file.lastIndexOf('.');
  if (lastDot > 0) {
    return {
      name: file.slice(0, lastDot),
      ext: file.slice(lastDot + 1),
    };
  }
  return {
    name: file,
    ext: 'yml',
  };
}

export const ConfigDiffEditor: React.FC<ConfigDiffEditorProps> = ({
  serviceId,
  files = [],
  backups: propsBackups,
  onSaveSuccess,
  onDeleteSuccess,
  className = '',
  readOnly = false,
}) => {
  const { isAdmin, hasPermission } = usePermission();
  const canConfig = hasPermission('service:config');
  // Custom user-added config names
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [isCustomName, setIsCustomName] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');

  // Initial name and suffix parsed from first file in props if present
  const [selectedName, setSelectedName] = useState<string>(() => {
    return files.length > 0 ? parseFileName(files[0]).name : 'application';
  });
  const [selectedExt, setSelectedExt] = useState<string>(() => {
    return files.length > 0 ? parseFileName(files[0]).ext : 'yml';
  });

  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  // Historical backups & deletion/rollback state
  const [backups, setBackups] = useState<ConfigBackupInfo[]>(propsBackups || []);
  const [showBackupsDropdown, setShowBackupsDropdown] = useState(false);
  const [isDeletingConfig, setIsDeletingConfig] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState<string | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const [backupToRollback, setBackupToRollback] = useState<string | null>(null);
  const [isRollingBackBackup, setIsRollingBackBackup] = useState<string | null>(null);
  const [isDeleteCurrentConfigModalOpen, setIsDeleteCurrentConfigModalOpen] = useState(false);

  const loadBackups = useCallback(async () => {
    if (!serviceId) return;
    try {
      const res = await api.getServiceConfigs(serviceId);
      if (res.backups) {
        setBackups(res.backups);
      }
    } catch {
      // ignore
    }
  }, [serviceId]);

  useEffect(() => {
    if (propsBackups) {
      setBackups(propsBackups);
    } else {
      loadBackups();
    }
  }, [propsBackups, loadBackups]);

  const handleConfirmDeleteBackup = async () => {
    if (!backupToDelete) return;
    const backupFile = backupToDelete;
    setIsDeletingBackup(backupFile);
    try {
      await api.deleteConfig(serviceId, backupFile);
      toast.success(`备份文件 ${backupFile} 已成功删除`);
      setBackupToDelete(null);
      await loadBackups();
    } catch (err: any) {
      toast.error(err.message || '删除备份文件失败');
    } finally {
      setIsDeletingBackup(null);
    }
  };

  const handleConfirmRollbackBackup = async () => {
    if (!backupToRollback) return;
    const bakFile = backupToRollback;
    setIsRollingBackBackup(bakFile);
    try {
      const res = await api.rollbackConfig(serviceId, selectedFile, bakFile);
      toast.success(`配置已成功回滚至快照 ${bakFile}`);
      setBackupToRollback(null);
      setShowBackupsDropdown(false);
      const newContent = res.content ?? '';
      setOriginalContent(newContent);
      setModifiedContent(newContent);
      onSaveSuccess?.(selectedFile);
      await loadBackups();
    } catch (err: any) {
      toast.error(err.message || '回滚配置失败');
    } finally {
      setIsRollingBackBackup(null);
    }
  };

  const handleLoadBackupToEditor = async (bakFile: string) => {
    try {
      const res = await api.getServiceConfigs(serviceId, bakFile);
      if (typeof res.content === 'string') {
        setModifiedContent(res.content);
        setViewMode('diff');
        setShowBackupsDropdown(false);
        toast.info(`已将快照 ${bakFile} 载入对比视图，可审阅差异后保存生效`);
      }
    } catch (err: any) {
      toast.error(err.message || '读取快照内容失败');
    }
  };

  const handleConfirmDeleteCurrentConfig = async () => {
    setIsDeletingConfig(true);
    try {
      await api.deleteConfig(serviceId, selectedFile);
      toast.success(`配置文件 ${selectedFile} 已成功删除`);
      setIsDeleteCurrentConfigModalOpen(false);
      onDeleteSuccess?.(selectedFile);
      const remaining = (files || []).filter((f) => f !== selectedFile);
      if (remaining.length > 0) {
        const { name, ext } = parseFileName(remaining[0]);
        setSelectedName(name);
        setSelectedExt(ext);
      } else {
        setSelectedName('application');
        setSelectedExt('yml');
      }
      setIsCustomName(false);
      setCustomName('');
      await loadBackups();
    } catch (err: any) {
      toast.error(err.message || '删除配置文件失败');
    } finally {
      setIsDeletingConfig(false);
    }
  };

  const gutterRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasInitializedRef = useRef(false);

  // Set of existing files on disk / discovered from backend
  const existingFiles = useMemo(() => new Set<string>(files), [files]);

  // Combined names: defaults + files names + user added
  const nameList = useMemo(() => {
    const set = new Set<string>(DEFAULT_CONFIG_NAMES);
    files.forEach((f) => {
      const { name } = parseFileName(f);
      if (name) set.add(name);
    });
    customNames.forEach((n) => set.add(n));
    return Array.from(set);
  }, [files, customNames]);

  // Combined extensions: default extensions (yaml, yml, properties) + any present in files
  const extList = useMemo(() => {
    const set = new Set<string>(DEFAULT_EXTENSIONS);
    files.forEach((f) => {
      const { ext } = parseFileName(f);
      if (ext) set.add(ext);
    });
    return Array.from(set);
  }, [files]);

  // Derive full current file name
  const selectedFile = useMemo(() => {
    if (isCustomName) {
      const trimmed = customName.trim();
      if (!trimmed) return `未命名.${selectedExt}`;
      const lastDot = trimmed.lastIndexOf('.');
      if (lastDot > 0) {
        return trimmed;
      }
      return `${trimmed}.${selectedExt}`;
    }
    return `${selectedName}.${selectedExt}`;
  }, [isCustomName, customName, selectedName, selectedExt]);

  // Initialize once if files are loaded asynchronously
  useEffect(() => {
    if (files.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const { name, ext } = parseFileName(files[0]);
      setSelectedName(name);
      setSelectedExt(ext);
    }
  }, [files]);

  // Load config content from API
  const loadFileContent = useCallback(
    async (file: string) => {
      if (!serviceId || !file) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getServiceConfigs(serviceId, file);
        const text = res.content || '';
        setOriginalContent(text);
        setModifiedContent(text);
        setBackupMessage(null);
        setIsNewFile(false);
      } catch (err: any) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('not found') || err.status === 404) {
          // File not created yet on disk; initialize empty buffer for creation
          setOriginalContent('');
          setModifiedContent('');
          setBackupMessage(null);
          setIsNewFile(true);
          setError(null);
        } else {
          setError(err.message || '加载配置文件失败');
          setIsNewFile(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [serviceId]
  );

  useEffect(() => {
    if (!isCustomName && selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [isCustomName, selectedFile, loadFileContent]);

  const hasChanges = useMemo(
    () => originalContent !== modifiedContent,
    [originalContent, modifiedContent]
  );

  const { unified: diffLines, sideBySide: sideBySideRows } = useMemo(() => {
    if (!hasChanges) {
      return { unified: [], sideBySide: [] };
    }
    return computeDiff(originalContent, modifiedContent);
  }, [originalContent, modifiedContent, hasChanges]);

  const diffSummary = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  const handleRevert = () => {
    setModifiedContent(originalContent);
  };

  const handleNameChange = (newName: string) => {
    setSelectedName(newName);
    // Smart extension selection:
    // If newName + currentExt exists in existingFiles, keep currentExt.
    // Otherwise, if newName + some supported ext exists in existingFiles, switch to that ext.
    const currentTarget = `${newName}.${selectedExt}`;
    if (!existingFiles.has(currentTarget)) {
      const matched = DEFAULT_EXTENSIONS.find((ext) => existingFiles.has(`${newName}.${ext}`));
      if (matched) {
        setSelectedExt(matched);
      }
    }
  };

  const handleExtChange = (newExt: string) => {
    setSelectedExt(newExt);
  };

  const handleCustomNameBlur = () => {
    const trimmed = customName.trim();
    if (trimmed) {
      const targetFile = trimmed.includes('.') ? trimmed : `${trimmed}.${selectedExt}`;
      if (existingFiles.has(targetFile)) {
        loadFileContent(targetFile);
      }
    }
  };

  const canSave = useMemo(() => {
    if (readOnly || saving || loading) return false;
    if (isCustomName) {
      return customName.trim().length > 0;
    }
    return hasChanges || isNewFile;
  }, [readOnly, saving, loading, isCustomName, customName, hasChanges, isNewFile]);

  const handleSaveClick = () => {
    if (isCustomName) {
      const trimmed = customName.trim();
      if (!trimmed) {
        setError('请输入自定义配置名称');
        return;
      }
      if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
        setError('配置名称不能包含路径分隔符');
        return;
      }
    }
    setConfirmModalOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmModalOpen(false);
    setSaving(true);
    setError(null);
    try {
      let finalName = selectedName;
      let finalExt = selectedExt;

      if (isCustomName) {
        const trimmed = customName.trim();
        const lastDot = trimmed.lastIndexOf('.');
        if (lastDot > 0) {
          finalName = trimmed.slice(0, lastDot);
          const ext = trimmed.slice(lastDot + 1).toLowerCase();
          if (ext) finalExt = ext;
        } else {
          finalName = trimmed;
        }
        setCustomNames((prev) => (prev.includes(finalName) ? prev : [...prev, finalName]));
        setSelectedName(finalName);
        setSelectedExt(finalExt);
        setIsCustomName(false);
      }

      const fileToSave = `${finalName}.${finalExt}`;
      const res = await api.saveServiceConfig(serviceId, fileToSave, modifiedContent);
      setOriginalContent(modifiedContent);
      setIsNewFile(false);
      existingFiles.add(fileToSave);
      const bakPath = res.backup || `${fileToSave}.bak`;
      setBackupMessage(`已成功生成安全备份: ${bakPath}`);
      toast.success('配置保存成功！', {
        description: `已成功生成安全备份: ${bakPath}`,
      });
      onSaveSuccess?.(fileToSave);
      await loadBackups();
    } catch (err: any) {
      const msg = err.message || '保存配置文件失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const lineCount = useMemo(
    () => modifiedContent.split('\n').length,
    [modifiedContent]
  );

  // Line numbers gutter synchronization on scroll
  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div
      className={`rounded-2xl border border-ops-border bg-ops-card shadow-2xl overflow-hidden flex flex-col font-mono text-xs ${className}`}
    >
      {/* Warning Notice Banner (Directive: "修改后需重启服务以使配置生效") */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/40 border-b border-amber-500/30 text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="font-semibold tracking-wide">
          提示：修改后需重启服务以使配置生效
        </span>
        <span className="text-amber-400/70 ml-auto hidden sm:inline text-[11px]">
          每次保存将自动生成防损安全快照备份 (.bak)
        </span>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-950/60 border-b border-red-500/40 text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400/70 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Controls Bar: File Selector, Mode Switcher, Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#080D18] border-b border-ops-border">
        {/* Left: Two-part File Selector (Name + Suffix) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-ops-cyan font-bold text-xs sm:text-sm">
            <FileCode2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">配置文件:</span>
          </div>

          {/* Config Effect & Priority Tooltip Trigger */}
          <div className="relative group inline-block">
            <button
              type="button"
              onClick={() => setShowHelpTooltip((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] text-ops-cyan hover:text-cyan-300 font-mono bg-ops-cyan/10 hover:bg-ops-cyan/20 border border-ops-cyan/30 px-2 py-0.5 rounded-md transition-colors"
              title="点击或悬浮查看配置生效机理与端口优先级说明"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>配置生效与优先级说明</span>
            </button>

            {/* Hover Tooltip Card */}
            <div
              className={`absolute left-0 top-full mt-2 w-80 sm:w-[480px] p-4 rounded-xl border border-ops-border bg-slate-950/95 backdrop-blur-md shadow-2xl z-50 transition-all duration-200 ${
                showHelpTooltip
                  ? 'opacity-100 visible pointer-events-auto'
                  : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between border-b border-ops-border/60 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-ops-cyan" />
                  <h4 className="text-xs font-bold text-white tracking-wide">
                    配置文件生效机制与优先级说明
                  </h4>
                </div>
                {showHelpTooltip && (
                  <button
                    type="button"
                    onClick={() => setShowHelpTooltip(false)}
                    className="text-ops-text-muted hover:text-white text-xs p-0.5 rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-3 text-xs leading-relaxed font-sans">
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-200">
                  <div className="font-bold text-emerald-400 mb-0.5">✅ 配置文件生效范围</div>
                  <div className="text-emerald-300/90 text-[11px]">
                    在此修改并保存的文件将实时写入宿主机服务安装根目录。<strong>应用重启后将自动加载该文件</strong>，常规业务配置（如数据库数据源、Redis 缓存、业务开关、日志级别等）均可正常生效。
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-950/30 text-amber-200">
                  <div className="font-bold text-amber-400 mb-0.5">⚠️ 监听端口 (server.port) 覆盖机制</div>
                  <div className="text-amber-300/90 text-[11px]">
                    对于标准 Java 模板服务，平台在启动命令中默认会传入命令行参数 <code className="px-1 py-0.5 rounded bg-black/40 text-amber-300 font-mono">--server.port=&#123;PORT&#125;</code>。根据 Spring Boot 官方规范，<strong>命令行参数优先级高于配置文件</strong>，因此直接在 YAML 中修改 <code className="px-1 py-0.5 rounded bg-black/40 text-amber-300 font-mono">server.port</code> 会被命令行参数强制覆盖。
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-ops-cyan/30 bg-cyan-950/30 text-cyan-200">
                  <div className="font-bold text-ops-cyan mb-0.5">🛠️ 如何正确修改服务端口？</div>
                  <div className="text-cyan-300/90 text-[11px] space-y-1">
                    <div>
                      • <strong>方式一（推荐平台管理）</strong>：进入左侧「<span className="font-semibold text-white">服务矩阵</span>」列表，点击该服务卡片的「编辑」抽屉，修改「服务监听端口」后重启。
                    </div>
                    <div>
                      • <strong>方式二（完全由配置文件掌控）</strong>：在「部署模板」中将启动命令重载为自定义命令（去除 <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-cyan-300">--server.port</code> 参数），即可完全通过本文件掌控端口。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Part 1: Select Name */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ops-text-muted font-mono">名称:</span>
            {!isCustomName ? (
              <div className="relative">
                <select
                  aria-label="config-name-select"
                  data-testid="config-name-select"
                  value={selectedName}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomName(true);
                      setCustomName('');
                      setIsNewFile(true);
                      setOriginalContent('');
                      setModifiedContent('');
                      setError(null);
                    } else {
                      handleNameChange(e.target.value);
                    }
                  }}
                  className="bg-slate-900 border border-ops-border rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-7 cursor-pointer"
                >
                  {nameList.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value="__custom__">自定义名称</option>
                </select>
                <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
                  ▼
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  data-testid="config-custom-name-input"
                  aria-label="config-custom-name-input"
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value);
                    setError(null);
                  }}
                  onBlur={handleCustomNameBlur}
                  placeholder="输入自定义名称"
                  className="bg-slate-950 border border-ops-cyan rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none w-36 shadow-sm shadow-cyan-500/10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsCustomName(false);
                      setCustomName('');
                      setError(null);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomName(false);
                    setCustomName('');
                    setError(null);
                  }}
                  className="p-1 text-ops-text-muted hover:text-white transition-colors"
                  title="返回名称列表"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Dot Separator */}
          <span className="text-ops-text-muted font-mono text-xs hidden sm:inline">.</span>

          {/* Part 2: Select Suffix */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ops-text-muted font-mono">后缀:</span>
            <div className="relative">
              <select
                aria-label="config-suffix-select"
                data-testid="config-suffix-select"
                value={selectedExt}
                onChange={(e) => handleExtChange(e.target.value)}
                className="bg-slate-900 border border-ops-border rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-7 cursor-pointer"
              >
                {extList.map((ext) => (
                  <option key={ext} value={ext}>
                    {ext}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
                ▼
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => loadFileContent(selectedFile)}
            title="刷新重新加载当前文件"
            className="p-1.5 rounded-lg border border-ops-border bg-slate-900 text-ops-text-muted hover:text-white transition-colors shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Save Button (Moved left next to file selection!) */}
          <button
            type="button"
            disabled={!canSave || readOnly}
            onClick={handleSaveClick}
            title={readOnly ? '无配置修改权限，请联系管理员授予' : undefined}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ops-cyan text-slate-950 font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none shrink-0"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>保存修改</span>
          </button>

          {/* Revert Button (when changed) */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleRevert}
              title="放弃修改并还原"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-ops-border bg-slate-900 text-ops-text-sub hover:text-white transition-colors shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>放弃修改</span>
            </button>
          )}

          {isNewFile && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 border border-purple-500/30 text-purple-300 shrink-0">
              新文件 (保存后生成)
            </span>
          )}

          {/* History Backups Dropdown */}
          <div className="relative inline-block shrink-0">
            <button
              type="button"
              data-testid="config-backups-button"
              onClick={() => setShowBackupsDropdown((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ops-border bg-slate-900 text-ops-text-sub hover:text-white transition-colors text-xs font-mono shrink-0"
              title="查看与管理自动生成的 .bak 历史备份快照"
            >
              <History className="h-3.5 w-3.5 text-purple-400" />
              <span>历史备份 ({backups.length})</span>
            </button>

            {showBackupsDropdown && (
              <div
                data-testid="config-backups-dropdown"
                className="absolute left-0 top-full mt-2 w-96 max-h-80 overflow-y-auto rounded-xl border border-ops-border bg-slate-950/95 backdrop-blur-md shadow-2xl z-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-ops-border/60 pb-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-purple-400" />
                    <span>历史快照备份文件</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBackupsDropdown(false)}
                    className="text-ops-text-muted hover:text-white text-xs p-0.5 rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {backups.length === 0 ? (
                  <div className="text-center py-6 text-xs text-ops-text-muted font-mono">
                    暂无历史备份快照（修改并保存配置后将自动生成）
                  </div>
                ) : (
                  <div className="space-y-1.5 divide-y divide-ops-border/40">
                    {backups.map((bak) => (
                      <div key={bak.file} className="pt-1.5 pb-1 flex items-center justify-between gap-2 text-xs">
                        <div
                          className="min-w-0 flex-1 cursor-pointer group"
                          onClick={() => handleLoadBackupToEditor(bak.file)}
                          title="点击载入此快照至编辑器进行对比"
                        >
                          <div className="font-mono text-white truncate text-[11px] group-hover:text-ops-cyan transition-colors" title={bak.file}>
                            {bak.file}
                          </div>
                          <div className="text-[10px] text-ops-text-muted font-mono flex items-center gap-1.5">
                            <span>{bak.updated_at}</span>
                            <span>·</span>
                            <span>{(bak.size / 1024).toFixed(1)} KB</span>
                            <span>·</span>
                            <span className="text-ops-cyan/80 group-hover:underline">载入对比</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-testid={`rollback-backup-${bak.file}`}
                            disabled={!canConfig || isRollingBackBackup === bak.file}
                            onClick={() => setBackupToRollback(bak.file)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-[0.98] transition-all text-xs font-semibold disabled:opacity-30 disabled:pointer-events-none"
                            title={canConfig ? "一键将当前配置文件回滚至该备份快照" : "无配置修改权限"}
                          >
                            {isRollingBackBackup === bak.file ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span>回滚</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              data-testid={`delete-backup-${bak.file}`}
                              disabled={isDeletingBackup === bak.file}
                              onClick={() => setBackupToDelete(bak.file)}
                              className="p-1 rounded text-ops-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                              title="删除该历史备份快照（仅管理员）"
                            >
                              {isDeletingBackup === bak.file ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delete Current Config File Button (Admin only & file exists on disk) */}
          {isAdmin && existingFiles.has(selectedFile) && !isNewFile && (
            <button
              type="button"
              data-testid="delete-current-config-button"
              disabled={isDeletingConfig}
              onClick={() => setIsDeleteCurrentConfigModalOpen(true)}
              title="删除当前磁盘上的配置文件（仅管理员）"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all text-xs shrink-0"
            >
              {isDeletingConfig ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>删除配置</span>
            </button>
          )}
        </div>

        {/* Right: View Switcher (Edit vs Diff) & Current File Badge */}
        <div className="flex items-center gap-2">
          {/* Current full filename preview badge */}
          <span
            data-testid="config-current-filename"
            className="hidden xl:inline-flex items-center px-2 py-1 rounded bg-slate-900 border border-ops-border/80 text-ops-cyan font-mono text-xs font-semibold"
            title="当前选中的完整配置文件名"
          >
            {isCustomName && !customName.trim() ? `[请输入名称].${selectedExt}` : selectedFile}
          </span>

          <div className="flex items-center bg-slate-900 border border-ops-border rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                viewMode === 'edit'
                  ? 'bg-ops-cyan text-slate-950 shadow-sm'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>编辑源码</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                viewMode === 'diff'
                  ? 'bg-ops-cyan text-slate-950 shadow-sm'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              <Split className="h-3.5 w-3.5" />
              <span>差异对比</span>
              {hasChanges && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-300">
                  +{diffSummary.added} -{diffSummary.removed}
                </span>
              )}
            </button>
          </div>

          {/* Diff Style Switcher (Split vs Unified) */}
          {viewMode === 'diff' && hasChanges && (
            <div className="flex items-center bg-slate-900 border border-ops-border rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setDiffStyle('split')}
                title="并排分栏对比"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  diffStyle === 'split'
                    ? 'bg-slate-800 text-ops-cyan'
                    : 'text-ops-text-muted hover:text-white'
                }`}
              >
                <Columns className="h-3 w-3" />
                <span>并排</span>
              </button>
              <button
                type="button"
                onClick={() => setDiffStyle('unified')}
                title="行内统一对比"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  diffStyle === 'unified'
                    ? 'bg-slate-800 text-ops-cyan'
                    : 'text-ops-text-muted hover:text-white'
                }`}
              >
                <AlignLeft className="h-3 w-3" />
                <span>行内</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className="relative min-h-[420px] max-h-[600px] flex overflow-hidden bg-[#080C14]">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-ops-text-muted gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-ops-cyan" />
            <span>正在读取配置文件内容...</span>
          </div>
        ) : viewMode === 'edit' ? (
          /* Edit Mode with Synchronized Line Numbers Gutter */
          <div className="flex-1 flex overflow-hidden">
            {/* Synchronized Line Numbers Gutter */}
            <div
              ref={gutterRef}
              className="w-12 bg-[#050811] py-4 px-2 text-right text-slate-600 font-mono select-none border-r border-ops-border/60 overflow-hidden"
            >
              {Array.from({ length: lineCount }).map((_, idx) => (
                <div key={idx} className="leading-6">
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Editable code textarea with lockstep scroll handler */}
            <textarea
              ref={textareaRef}
              data-testid="config-editor-textarea"
              aria-label="config-textarea"
              value={modifiedContent}
              onChange={(e) => {
                if (readOnly) return;
                setModifiedContent(e.target.value);
              }}
              readOnly={readOnly}
              onScroll={handleTextareaScroll}
              spellCheck={false}
              className={`flex-1 p-4 bg-transparent text-slate-200 font-mono text-xs leading-6 outline-none resize-none overflow-auto whitespace-pre selection:bg-cyan-950 selection:text-ops-cyan ${
                readOnly ? 'cursor-not-allowed opacity-80' : ''
              }`}
            />
          </div>
        ) : (
          /* Diff Mode */
          <div className="flex-1 flex flex-col overflow-auto p-4 space-y-1">
            {!hasChanges ? (
              <div className="m-auto text-center p-8 text-ops-text-muted space-y-2">
                <ShieldCheck className="h-8 w-8 mx-auto text-emerald-400/60" />
                <div className="text-white font-bold">配置与原文件完全一致</div>
                <p className="text-[11px]">当前未对文件进行任何变更修改。</p>
              </div>
            ) : diffStyle === 'split' ? (
              /* Side-by-Side Split Diff View */
              <div className="space-y-1">
                {/* Header column labels */}
                <div className="grid grid-cols-2 gap-2 pb-2 mb-1 border-b border-ops-border/80 text-[11px] font-bold text-ops-text-muted">
                  <div className="px-2">原始配置 ({selectedFile})</div>
                  <div className="px-2 text-ops-cyan">待保存配置 (Modified)</div>
                </div>

                {sideBySideRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 text-xs leading-6">
                    {/* Left cell (original) */}
                    <div
                      className={`flex items-start gap-2 px-2 py-0.5 rounded font-mono border-l-2 ${
                        row.left?.type === 'removed'
                          ? 'bg-red-950/40 text-red-300 border-red-500'
                          : row.left
                          ? 'text-slate-400 border-transparent'
                          : 'bg-slate-900/30 text-slate-700 border-transparent select-none'
                      }`}
                    >
                      <span className="w-8 text-right select-none text-slate-600 shrink-0">
                        {row.left?.lineNo ?? ''}
                      </span>
                      <pre className="flex-1 whitespace-pre-wrap font-mono break-all">
                        {row.left ? row.left.content || ' ' : ''}
                      </pre>
                    </div>

                    {/* Right cell (modified) */}
                    <div
                      className={`flex items-start gap-2 px-2 py-0.5 rounded font-mono border-l-2 ${
                        row.right?.type === 'added'
                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500'
                          : row.right
                          ? 'text-slate-400 border-transparent'
                          : 'bg-slate-900/30 text-slate-700 border-transparent select-none'
                      }`}
                    >
                      <span className="w-8 text-right select-none text-slate-600 shrink-0">
                        {row.right?.lineNo ?? ''}
                      </span>
                      <pre className="flex-1 whitespace-pre-wrap font-mono break-all">
                        {row.right ? row.right.content || ' ' : ''}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Inline Unified Diff View */
              <div className="space-y-0.5">
                {diffLines.map((line, idx) => {
                  const isAdded = line.type === 'added';
                  const isRemoved = line.type === 'removed';

                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 px-3 py-0.5 rounded leading-6 font-mono text-xs ${
                        isAdded
                          ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500'
                          : isRemoved
                          ? 'bg-red-950/40 text-red-300 border-l-2 border-red-500 line-through opacity-80'
                          : 'text-slate-400'
                      }`}
                    >
                      <span className="w-10 text-right select-none text-slate-600 shrink-0">
                        {line.modLineNo || line.origLineNo}
                      </span>
                      <span className="w-4 select-none font-bold shrink-0">
                        {isAdded ? '+' : isRemoved ? '-' : ' '}
                      </span>
                      <pre className="flex-1 whitespace-pre-wrap font-mono break-all">
                        {line.content || ' '}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Save Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-ops-border bg-ops-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">确认保存配置文件变更？</h3>
                <p className="text-xs text-ops-text-muted font-mono">{selectedFile}</p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl bg-ops-bg p-4 text-xs font-mono text-ops-text-sub border border-ops-border">
              <p className="text-white font-semibold">变更统计：</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-emerald-400 font-bold">+{diffSummary.added} 行新增</span>
                <span className="text-red-400 font-bold">-{diffSummary.removed} 行删除</span>
              </div>
              <p className="text-ops-text-muted pt-2 border-t border-ops-border/60">
                系统将自动生成同名 <span className="text-ops-cyan">.bak</span> 快照备份。保存后需要重新启动目标服务才能使新配置生效。
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-bold text-ops-text-sub hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 transition-colors"
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Backup Confirmation Modal */}
      <ConfirmModal
        visible={!!backupToDelete}
        title="删除备份快照确认"
        subtitle="高危操作 · 快照删除后无法还原"
        message={
          <span>
            确定要永久删除历史备份快照 <span className="text-white font-bold">{backupToDelete}</span> 吗？此操作不可逆！
          </span>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={!!isDeletingBackup}
        onConfirm={handleConfirmDeleteBackup}
        onCancel={() => setBackupToDelete(null)}
      />

      {/* Delete Current Config File Confirmation Modal */}
      <ConfirmModal
        visible={isDeleteCurrentConfigModalOpen}
        title="删除配置文件确认"
        subtitle="高危操作 · 将物理删除配置文件"
        message={
          <span>
            确定要永久删除配置文件 <span className="text-white font-bold">{selectedFile}</span> 吗？此操作将从服务器磁盘物理删除该文件，不可逆！
          </span>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={isDeletingConfig}
        onConfirm={handleConfirmDeleteCurrentConfig}
        onCancel={() => setIsDeleteCurrentConfigModalOpen(false)}
      />

      {/* Rollback Backup Confirmation Modal */}
      <ConfirmModal
        visible={!!backupToRollback}
        title="回滚配置快照确认"
        subtitle="版本覆盖 · 当前内容将自动生成新备份"
        message={
          <span>
            确定要将配置文件 <span className="text-white font-bold">{selectedFile}</span> 回滚至备份快照 <span className="text-white font-bold">{backupToRollback}</span> 吗？当前配置内容将被该快照覆盖生效，同时系统会自动生成一份当前内容的备份快照。
          </span>
        }
        confirmText="确认回滚"
        cancelText="取消"
        variant="warning"
        loading={!!isRollingBackBackup}
        onConfirm={handleConfirmRollbackBackup}
        onCancel={() => setBackupToRollback(null)}
      />
    </div>
  );
};

export default ConfigDiffEditor;
