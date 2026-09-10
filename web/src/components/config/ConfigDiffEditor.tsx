import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCode2,
  AlertTriangle,
  Save,
  RotateCcw,
  CheckCircle2,
  FileText,
  Split,
  Eye,
  Edit3,
  Loader2,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../../api';

export interface ConfigDiffEditorProps {
  serviceId: number;
  files?: string[];
  onSaveSuccess?: (fileName: string) => void;
  className?: string;
}

type ViewMode = 'edit' | 'diff';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  origLineNo?: number;
  modLineNo?: number;
  content: string;
}

// Simple line-by-line diff computation
function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  const diff: DiffLine[] = [];
  const maxLines = Math.max(origLines.length, modLines.length);

  // Use a clean LCS or straightforward match-lookahead for practical config files
  let i = 0;
  let j = 0;
  let origLineNo = 1;
  let modLineNo = 1;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      diff.push({
        type: 'unchanged',
        origLineNo: origLineNo++,
        modLineNo: modLineNo++,
        content: origLines[i],
      });
      i++;
      j++;
    } else {
      // Lookahead to find matches
      let matchInMod = -1;
      let matchInOrig = -1;

      for (let look = 1; look <= 5; look++) {
        if (j + look < modLines.length && i < origLines.length && modLines[j + look] === origLines[i]) {
          matchInMod = j + look;
          break;
        }
        if (i + look < origLines.length && j < modLines.length && origLines[i + look] === modLines[j]) {
          matchInOrig = i + look;
          break;
        }
      }

      if (matchInMod !== -1) {
        // Elements in mod were added
        while (j < matchInMod) {
          diff.push({
            type: 'added',
            modLineNo: modLineNo++,
            content: modLines[j],
          });
          j++;
        }
      } else if (matchInOrig !== -1) {
        // Elements in orig were removed
        while (i < matchInOrig) {
          diff.push({
            type: 'removed',
            origLineNo: origLineNo++,
            content: origLines[i],
          });
          i++;
        }
      } else {
        // Modification
        if (i < origLines.length) {
          diff.push({
            type: 'removed',
            origLineNo: origLineNo++,
            content: origLines[i],
          });
          i++;
        }
        if (j < modLines.length) {
          diff.push({
            type: 'added',
            modLineNo: modLineNo++,
            content: modLines[j],
          });
          j++;
        }
      }
    }
  }

  return diff;
}

export const ConfigDiffEditor: React.FC<ConfigDiffEditorProps> = ({
  serviceId,
  files = [],
  onSaveSuccess,
  className = '',
}) => {
  const [fileList, setFileList] = useState<string[]>(files);
  const [selectedFile, setSelectedFile] = useState<string>(files[0] || 'application.yml');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync prop files if changed
  useEffect(() => {
    if (files.length > 0) {
      setFileList(files);
      if (!files.includes(selectedFile)) {
        setSelectedFile(files[0]);
      }
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
      } catch (err: any) {
        setError(err.message || '加载配置文件失败');
      } finally {
        setLoading(false);
      }
    },
    [serviceId]
  );

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [selectedFile, loadFileContent]);

  const hasChanges = useMemo(
    () => originalContent !== modifiedContent,
    [originalContent, modifiedContent]
  );

  const diffLines = useMemo(() => {
    if (!hasChanges) return [];
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

  const handleConfirmSave = async () => {
    setConfirmModalOpen(false);
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveServiceConfig(serviceId, selectedFile, modifiedContent);
      setOriginalContent(modifiedContent);
      const bakPath = res.backup || `${selectedFile}.bak`;
      setBackupMessage(`已成功生成安全备份: ${bakPath}`);
      onSaveSuccess?.(selectedFile);
    } catch (err: any) {
      setError(err.message || '保存配置文件失败');
    } finally {
      setSaving(false);
    }
  };

  const lineCount = useMemo(
    () => modifiedContent.split('\n').length,
    [modifiedContent]
  );

  return (
    <div
      className={`rounded-2xl border border-ops-border bg-ops-card shadow-2xl overflow-hidden flex flex-col font-mono text-xs ${className}`}
    >
      {/* Warning Notice Banner (Directive Highlight: "修改后需重启服务以使配置生效") */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/40 border-b border-amber-500/30 text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="font-semibold tracking-wide">
          提示：修改后需重启服务以使配置生效
        </span>
        <span className="text-amber-400/70 ml-auto hidden sm:inline text-[11px]">
          每次保存将自动生成防损安全快照备份 (.bak)
        </span>
      </div>

      {/* Backup Notification Toast / Banner */}
      {backupMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-emerald-950/60 border-b border-emerald-500/40 text-emerald-300 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="font-bold">配置保存成功！</span>
            <span className="font-mono text-[11px] text-emerald-400/90">{backupMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBackupMessage(null)}
            className="text-emerald-400/70 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
        {/* Left: File Selector Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-ops-cyan font-bold">
            <FileCode2 className="h-4 w-4" />
            <span className="hidden sm:inline">配置文件:</span>
          </div>

          <div className="relative">
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="bg-slate-900 border border-ops-border rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              {fileList.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted">
              ▾
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadFileContent(selectedFile)}
            title="刷新重新加载当前文件"
            className="p-1.5 rounded-lg border border-ops-border bg-slate-900 text-ops-text-muted hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Center: View Switcher (Edit vs Diff) */}
        <div className="flex items-center bg-slate-900 border border-ops-border rounded-lg p-0.5">
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

        {/* Right: Actions (Revert, Save) */}
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={handleRevert}
              title="放弃修改并还原"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ops-border bg-slate-900 text-ops-text-sub hover:text-white transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>放弃修改</span>
            </button>
          )}

          <button
            type="button"
            disabled={!hasChanges || saving || loading}
            onClick={() => setConfirmModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-ops-cyan text-slate-950 font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>保存修改</span>
          </button>
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
          /* Edit Mode with Line Numbers */
          <div className="flex-1 flex overflow-hidden">
            {/* Line numbers gutter */}
            <div className="w-12 bg-[#050811] py-4 px-2 text-right text-slate-600 font-mono select-none border-r border-ops-border/60 overflow-hidden">
              {Array.from({ length: lineCount }).map((_, idx) => (
                <div key={idx} className="leading-6">
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Editable code textarea */}
            <textarea
              data-testid="config-editor-textarea"
              aria-label="config-textarea"
              value={modifiedContent}
              onChange={(e) => setModifiedContent(e.target.value)}
              spellCheck={false}
              className="flex-1 p-4 bg-transparent text-slate-200 font-mono text-xs leading-6 outline-none resize-none overflow-auto whitespace-pre selection:bg-cyan-950 selection:text-ops-cyan"
            />
          </div>
        ) : (
          /* Diff Mode (Side-by-side or visual diff highlight) */
          <div className="flex-1 flex flex-col overflow-auto p-4 space-y-1">
            {!hasChanges ? (
              <div className="m-auto text-center p-8 text-ops-text-muted space-y-2">
                <ShieldCheck className="h-8 w-8 mx-auto text-emerald-400/60" />
                <div className="text-white font-bold">配置与原文件完全一致</div>
                <p className="text-[11px]">当前未对文件进行任何变更修改。</p>
              </div>
            ) : (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
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
    </div>
  );
};

export default ConfigDiffEditor;
