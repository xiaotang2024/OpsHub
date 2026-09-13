import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu,
  Search,
  Plus,
  Trash2,
  Check,
  Copy,
  RefreshCw,
  FolderSearch,
  Sparkles,
  AlertCircle,
  X,
  Loader2,
  Terminal,
} from 'lucide-react';
import { api } from '../../api';
import { toast } from 'sonner';
import { JDKAsset } from '../../types';

export const JDKList: React.FC = () => {
  const [jdks, setJdks] = useState<JDKAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Register Modal state
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    java_home: '',
    bin_path: '',
    version_str: '',
  });
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Scan Modal state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedJdks, setScannedJdks] = useState<JDKAsset[]>([]);
  const [registeringScanId, setRegisteringScanId] = useState<string | null>(null);

  // Delete Confirm Modal state
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  // Copied path feedback tracker
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await api.getJDKs();
      setJdks(data || []);
    } catch (err: any) {
      setError(err.message || '加载 JDK 资产列表失败');
    } finally {
      if (!silent) setLoading(false);
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

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Trigger System Scan
  const handleStartScan = async () => {
    try {
      setScanning(true);
      setError(null);
      setScanModalOpen(true);
      const discovered = await api.scanJDKs();
      setScannedJdks(discovered || []);
    } catch (err: any) {
      setError(err.message || '系统 JDK 扫描失败');
    } finally {
      setScanning(false);
    }
  };

  // Register single scanned JDK
  const handleRegisterScanned = async (item: JDKAsset) => {
    try {
      setRegisteringScanId(item.name);
      await api.createJDK({
        name: item.name,
        java_home: item.java_home,
        bin_path: item.bin_path,
        version_str: item.version_str,
        is_system: true,
      });
      setSuccessMsg(`成功入库 JDK: ${item.name}`);
      toast.success(`成功入库 JDK: ${item.name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadData(true);
    } catch (err: any) {
      const msg = err.message || `注册 JDK [${item.name}] 失败`;
      setError(msg);
      toast.error(msg);
    } finally {
      setRegisteringScanId(null);
    }
  };

  // Register all newly scanned JDKs
  const handleRegisterAllScanned = async () => {
    const existingHomes = new Set(jdks.map((j) => j.java_home));
    const unregistered = scannedJdks.filter((s) => !existingHomes.has(s.java_home));
    if (unregistered.length === 0) return;

    try {
      setScanning(true);
      for (const item of unregistered) {
        await api.createJDK({
          name: item.name,
          java_home: item.java_home,
          bin_path: item.bin_path,
          version_str: item.version_str,
          is_system: true,
        });
      }
      const msg = `成功批量入库 ${unregistered.length} 个系统 JDK`;
      setSuccessMsg(msg);
      toast.success(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadData(true);
      setScanModalOpen(false);
    } catch (err: any) {
      const msg = err.message || '批量入库部分 JDK 失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  // Manual Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name.trim()) {
      setRegisterError('请输入 JDK 名称');
      return;
    }
    if (!registerForm.java_home.trim()) {
      setRegisterError('请输入 JAVA_HOME 路径');
      return;
    }

    try {
      setSubmitting(true);
      setRegisterError(null);
      await api.createJDK({
        name: registerForm.name.trim(),
        java_home: registerForm.java_home.trim(),
        bin_path: registerForm.bin_path.trim() || undefined,
        version_str: registerForm.version_str.trim() || undefined,
        is_system: false,
      });
      setSuccessMsg(`成功注册 JDK: ${registerForm.name}`);
      toast.success(`成功注册 JDK: ${registerForm.name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setRegisterModalOpen(false);
      setRegisterForm({ name: '', java_home: '', bin_path: '', version_str: '' });
      await loadData(true);
    } catch (err: any) {
      const msg = err.message || '注册 JDK 失败';
      setRegisterError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete JDK
  const handleDeleteJDK = async (id: number) => {
    try {
      setDeletingLoading(true);
      await api.deleteJDK(id);
      setSuccessMsg('JDK 资产已成功注销');
      toast.success('JDK 资产已成功注销');
      setTimeout(() => setSuccessMsg(null), 3000);
      setDeletingId(null);
      await loadData(true);
    } catch (err: any) {
      const msg = err.message || '删除 JDK 资产失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingLoading(false);
    }
  };

  // Filtered list
  const filteredJdks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return jdks;
    return jdks.filter(
      (j) =>
        (j.name || '').toLowerCase().includes(q) ||
        (j.version_str || '').toLowerCase().includes(q) ||
        (j.java_home || '').toLowerCase().includes(q) ||
        (j.bin_path || '').toLowerCase().includes(q)
    );
  }, [jdks, searchQuery]);

  // Set of registered java_home for scan matching
  const registeredHomes = useMemo(() => new Set(jdks.map((j) => j.java_home)), [jdks]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">JDK 资产 / JDKs</h1>
            <span className="rounded-full bg-ops-surface border border-ops-border px-2.5 py-0.5 text-xs font-mono font-medium text-ops-cyan">
              {jdks.length} 个版本
            </span>
          </div>
          <p className="text-xs text-ops-text-muted font-mono mt-1">
            宿主机多版本 Java 运行时环境统一登记、自动检索与启动绑定
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Scan Button */}
          <button
            type="button"
            onClick={handleStartScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-ops-border bg-ops-surface text-ops-text-main text-xs font-mono font-semibold hover:border-ops-cyan hover:text-ops-cyan transition-all shadow-sm"
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ops-cyan" />
            ) : (
              <FolderSearch className="h-3.5 w-3.5 text-ops-cyan" />
            )}
            <span>扫描系统 JDK</span>
          </button>

          {/* Register Button */}
          <button
            type="button"
            onClick={() => {
              setRegisterError(null);
              setRegisterModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>注册 JDK</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300"
        >
          <Check className="h-4 w-4 shrink-0 text-ops-emerald" />
          <span>{successMsg}</span>
        </motion.div>
      )}

      {/* Error Alert */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-ops-border bg-ops-surface/50 p-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ops-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="按 JDK 名称、版本号、JAVA_HOME 快速检索..."
            className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-ops-text-muted/60 font-mono focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={() => loadData(false)}
          className="flex items-center gap-1 text-xs font-mono text-ops-text-muted hover:text-white transition-colors"
          title="刷新列表"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">刷新</span>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-ops-text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-ops-cyan mb-3" />
          <span className="text-xs font-mono">正在加载系统 JDK 资产清单...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredJdks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ops-border bg-ops-surface/40 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-950/60 border border-ops-cyan/30 text-ops-cyan mb-4 shadow-cyan-glow">
            <Cpu className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">尚未注册任何 JDK 运行时</h3>
          <p className="text-xs text-ops-text-muted font-mono mt-1.5 max-w-sm">
            OpsHub 需至少注册一个 Java 运行时环境以驱动 Java 应用服务的启动与发布
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartScan}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 transition-all"
            >
              <FolderSearch className="h-4 w-4" />
              <span>自动扫描系统 JDK</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRegisterError(null);
                setRegisterModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ops-border bg-ops-surface text-white text-xs font-mono hover:border-ops-cyan transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>手动注册 JDK</span>
            </button>
          </div>
        </div>
      )}

      {/* JDK Cards Grid */}
      {!loading && filteredJdks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJdks.map((jdk) => {
            const isSystem = jdk.is_system;
            const isCopiedHome = copiedKey === `home-${jdk.id}`;
            const isCopiedBin = copiedKey === `bin-${jdk.id}`;

            return (
              <motion.div
                key={jdk.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group relative flex flex-col justify-between rounded-xl border border-ops-border bg-ops-surface/80 p-5 hover:border-ops-border-hover hover:bg-ops-card-hover transition-all shadow-sm"
              >
                <div>
                  {/* Card Top */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-bg border border-ops-border group-hover:border-ops-cyan/40 group-hover:text-ops-cyan text-ops-text-sub transition-colors">
                        <Cpu className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white tracking-wide group-hover:text-ops-cyan transition-colors">
                          {jdk.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] font-mono text-ops-cyan border border-ops-cyan/30">
                            {jdk.version_str || 'Java'}
                          </span>
                          {isSystem && (
                            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-ops-text-muted border border-slate-700">
                              SYSTEM
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingId(jdk.id)}
                      className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-ops-text-muted hover:bg-red-950/40 hover:text-red-400 transition-all"
                      title="注销该 JDK 资产"
                      aria-label="注销 JDK"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Paths Info */}
                  <div className="space-y-2 mt-4 text-xs font-mono">
                    {/* JAVA_HOME */}
                    <div className="rounded-lg border border-ops-border/60 bg-ops-bg/80 p-2.5">
                      <div className="flex items-center justify-between text-[10px] text-ops-text-muted mb-1">
                        <span>JAVA_HOME</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(`home-${jdk.id}`, jdk.java_home)}
                          className="hover:text-white transition-colors"
                          title="复制路径"
                        >
                          {isCopiedHome ? (
                            <Check className="h-3 w-3 text-ops-emerald" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="truncate text-ops-text-main text-[11px]" title={jdk.java_home}>
                        {jdk.java_home}
                      </div>
                    </div>

                    {/* Bin Path */}
                    <div className="rounded-lg border border-ops-border/60 bg-ops-bg/80 p-2.5">
                      <div className="flex items-center justify-between text-[10px] text-ops-text-muted mb-1">
                        <span>BIN_PATH</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(`bin-${jdk.id}`, jdk.bin_path)}
                          className="hover:text-white transition-colors"
                          title="复制路径"
                        >
                          {isCopiedBin ? (
                            <Check className="h-3 w-3 text-ops-emerald" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="truncate text-ops-text-sub text-[11px]" title={jdk.bin_path}>
                        {jdk.bin_path}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="mt-4 pt-3 border-t border-ops-border/40 flex items-center justify-between text-[10px] font-mono text-ops-text-muted">
                  <span>ID: #{jdk.id}</span>
                  <span>{jdk.created_at ? new Date(jdk.created_at).toLocaleDateString('zh-CN') : '已入库'}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Manual Register Modal */}
      <AnimatePresence>
        {registerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRegisterModalOpen(false)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b border-ops-border">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">注册 JDK 资产</h2>
                    <p className="text-xs text-ops-text-muted font-mono">登记本地安装的 Java 开发环境运行时</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(false)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {registerError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{registerError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    JDK 别名 / Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                    placeholder="例如: OpenJDK-17-LTS"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    JAVA_HOME 目录路径 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.java_home}
                    onChange={(e) => setRegisterForm({ ...registerForm, java_home: e.target.value })}
                    placeholder="例如: /usr/lib/jvm/java-17-openjdk"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    Java 执行路径 / Bin Path (可选，留空时系统自动检索 bin/java)
                  </label>
                  <input
                    type="text"
                    value={registerForm.bin_path}
                    onChange={(e) => setRegisterForm({ ...registerForm, bin_path: e.target.value })}
                    placeholder="留空自动探测: /usr/lib/jvm/java-17-openjdk/bin/java"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    版本标识 / Version Tag (可选)
                  </label>
                  <input
                    type="text"
                    value={registerForm.version_str}
                    onChange={(e) => setRegisterForm({ ...registerForm, version_str: e.target.value })}
                    placeholder="例如: 17.0.8"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-ops-border">
                  <button
                    type="button"
                    onClick={() => setRegisterModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>确认注册</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* System Scan Result Modal */}
      <AnimatePresence>
        {scanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setScanModalOpen(false)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 max-h-[85vh] flex flex-col"
            >
              {/* Scan Header */}
              <div className="flex items-center justify-between pb-4 border-b border-ops-border shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <FolderSearch className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">系统 JDK 自动扫描发现</h2>
                    <p className="text-xs text-ops-text-muted font-mono">
                      自动检索 $JAVA_HOME、/usr/lib/jvm 与系统标准运行环境
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScanModalOpen(false)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scanning indicator */}
              {scanning && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-ops-cyan mb-3" />
                  <span className="text-xs font-mono text-ops-text-sub">正在检索系统 JVM 目录...</span>
                </div>
              )}

              {/* Scan List */}
              {!scanning && (
                <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                  {scannedJdks.length === 0 ? (
                    <div className="text-center py-12 text-ops-text-muted text-xs font-mono">
                      系统未在标准路径发现任何未登记的 JDK 运行时，您可通过手动注册录入路径。
                    </div>
                  ) : (
                    scannedJdks.map((item, idx) => {
                      const isAlreadyRegistered = registeredHomes.has(item.java_home);
                      const isRegistering = registeringScanId === item.name;

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 rounded-xl border border-ops-border bg-ops-bg/70 p-3.5 hover:border-ops-cyan/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">{item.name}</span>
                              <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-ops-cyan border border-ops-cyan/30">
                                {item.version_str || 'Java'}
                              </span>
                              {isAlreadyRegistered ? (
                                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-mono text-ops-emerald border border-emerald-800">
                                  已入库
                                </span>
                              ) : (
                                <span className="rounded bg-blue-950 px-2 py-0.5 text-[10px] font-mono text-cyan-300 border border-blue-800 flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  新发现
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-ops-text-muted truncate mt-1" title={item.java_home}>
                              {item.java_home}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {isAlreadyRegistered ? (
                              <span className="text-xs font-mono text-ops-text-muted flex items-center gap-1 px-3 py-1.5">
                                <Check className="h-3.5 w-3.5 text-ops-emerald" />
                                已激活
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRegisterScanned(item)}
                                disabled={isRegistering}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold hover:bg-cyan-400 disabled:opacity-50 transition-all shadow-sm"
                              >
                                {isRegistering ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                <span>一键入库</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Scan Modal Footer */}
              <div className="pt-4 border-t border-ops-border flex items-center justify-between shrink-0">
                <span className="text-xs font-mono text-ops-text-muted">
                  扫描结果: 共发现 {scannedJdks.length} 个本地运行环境
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScanModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                  >
                    关闭
                  </button>
                  {scannedJdks.some((s) => !registeredHomes.has(s.java_home)) && (
                    <button
                      type="button"
                      onClick={handleRegisterAllScanned}
                      disabled={scanning}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 transition-all"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>全部批量入库</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm rounded-2xl border border-red-500/40 bg-ops-surface p-6 shadow-2xl z-10 text-center"
            >
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-950/60 border border-red-500/40 text-red-400 mb-3">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white">确认注销该 JDK 资产？</h3>
              <p className="text-xs text-ops-text-muted font-mono mt-1.5">
                注销后不会删除物理文件，但已绑定此 JDK 的应用服务可能无法正常启动。
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteJDK(deletingId)}
                  disabled={deletingLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-500 disabled:opacity-50 transition-all"
                >
                  {deletingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>确认注销</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default JDKList;
