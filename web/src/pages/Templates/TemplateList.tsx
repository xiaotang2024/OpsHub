import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCode2,
  Plus,
  Search,
  RefreshCw,
  Copy,
  Edit2,
  Trash2,
  Play,
  Layers,
  Cpu,
  FolderTree,
  Activity,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  Server,
  Zap,
  X,
} from 'lucide-react';
import { Template, JDKAsset, Service } from '../../types';
import { toast } from 'sonner';
import { api } from '../../api';
import { TemplateEditorModal } from './TemplateEditorModal';
import { PermissionGate } from '../../components/common/PermissionGate';
import { ConfirmModal } from '../../components/common/ConfirmModal';

export const TemplateList: React.FC = () => {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [jdks, setJdks] = useState<JDKAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  // Quick Service Creation Modal state
  const [createServiceModalOpen, setCreateServiceModalOpen] = useState(false);
  const [selectedTemplateForService, setSelectedTemplateForService] = useState<Template | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [servicePort, setServicePort] = useState(8080);
  const [serviceInstallDir, setServiceInstallDir] = useState('');
  const [creatingService, setCreatingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tplList, jdkList] = await Promise.all([
        api.getTemplates(),
        api.getJDKs().catch(() => []),
      ]);
      setTemplates(tplList || []);
      setJdks(jdkList || []);
    } catch (err: any) {
      setError(err.message || '加载模板列表失败');
    } finally {
      setLoading(false);
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

  // Filter templates
  const filteredTemplates = useMemo(() => {
    const query = (searchQuery || '').toLowerCase();
    return templates.filter((tpl) => {
      const name = (tpl.name || '').toLowerCase();
      const installDir = (tpl.install_dir_pattern || '').toLowerCase();
      const jvm = (tpl.jvm_options || '').toLowerCase();

      const matchSearch =
        name.includes(query) ||
        installDir.includes(query) ||
        jvm.includes(query);

      const matchType = typeFilter === 'all' || tpl.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [templates, searchQuery, typeFilter]);

  // Handle Create / Edit save
  const handleSaveTemplate = async (templateData: Partial<Template>) => {
    if (editingTemplate && editingTemplate.id) {
      await api.updateTemplate(editingTemplate.id, templateData);
      toast.success('部署模板更新成功');
    } else {
      await api.createTemplate(templateData);
      toast.success('部署模板创建成功');
    }
    await loadData();
  };

  // Handle Duplicate
  const handleDuplicate = async (tpl: Template) => {
    try {
      const copyPayload: Partial<Template> = {
        name: `${tpl.name}_copy`,
        type: tpl.type,
        default_jdk_id: tpl.default_jdk_id,
        install_dir_pattern: tpl.install_dir_pattern,
        jvm_options: tpl.jvm_options,
        env_vars: tpl.env_vars,
        supervision_mode: tpl.supervision_mode,
        start_cmd: tpl.start_cmd,
        stop_cmd: tpl.stop_cmd,
        health_check_config: tpl.health_check_config,
        uninstall_rules: tpl.uninstall_rules,
      };
      await api.createTemplate(copyPayload);
      toast.success(`模板 ${tpl.name} 克隆成功`);
      await loadData();
    } catch (err: any) {
      toast.error(`克隆失败: ${err.message}`);
    }
  };

  // Handle Delete
  const handleConfirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      setIsDeletingTemplate(true);
      await api.deleteTemplate(templateToDelete.id);
      toast.success(`模板 ${templateToDelete.name} 已删除`);
      setTemplateToDelete(null);
      await loadData();
    } catch (err: any) {
      toast.error(`删除失败: ${err.message}`);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  // Open Service Creation Modal
  const handleOpenCreateService = (tpl: Template) => {
    setSelectedTemplateForService(tpl);
    const defaultName = `${tpl.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-instance`;
    setServiceName(defaultName);
    setServicePort(8080);
    setServiceInstallDir(tpl.install_dir_pattern.replace('${SERVICE_NAME}', defaultName));
    setServiceError(null);
    setCreateServiceModalOpen(true);
  };

  const handleServiceNameChange = (val: string) => {
    setServiceName(val);
    if (selectedTemplateForService) {
      setServiceInstallDir(
        selectedTemplateForService.install_dir_pattern.replace('${SERVICE_NAME}', val || '...')
      );
    }
  };

  const handleCreateServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !selectedTemplateForService) return;

    try {
      setCreatingService(true);
      setServiceError(null);

      const payload: Partial<Service> = {
        name: serviceName.trim(),
        template_id: selectedTemplateForService.id,
        jdk_id: selectedTemplateForService.default_jdk_id,
        install_dir: serviceInstallDir,
        port: Number(servicePort),
        jvm_options: selectedTemplateForService.jvm_options,
        env_vars: selectedTemplateForService.env_vars,
        supervision_mode: selectedTemplateForService.supervision_mode,
      };

      await api.createService(payload);
      toast.success(`服务 ${serviceName.trim()} 基于模板创建成功！`);
      setCreateServiceModalOpen(false);
      navigate('/services');
    } catch (err: any) {
      setServiceError(err.message || '创建服务失败');
    } finally {
      setCreatingService(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">部署模板 / Templates</h1>
            <span className="rounded-full bg-cyan-950/60 border border-ops-cyan/30 px-2.5 py-0.5 text-xs font-mono font-medium text-ops-cyan">
              {templates.length} 个模板
            </span>
          </div>
          <p className="text-xs text-ops-text-muted font-mono mt-1">
            JVM 参数预设、运行模式与生命周期标准化配置模版库
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-medium text-ops-text-sub hover:text-white hover:border-ops-border-hover transition-colors"
            title="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-ops-cyan' : ''}`} />
            <span>刷新</span>
          </button>

          <PermissionGate
            permission="template:manage"
            disableOnDenied
            deniedTooltip="无模板管理权限，请联系管理员授予"
          >
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(null);
                setEditorOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>新建模板</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Filter and View Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-ops-border bg-ops-card p-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ops-text-muted" />
          <input
            type="text"
            placeholder="搜索模板名称、JVM 参数或目录..."
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

        {/* Type Filters & View Mode */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center rounded-lg border border-ops-border bg-ops-bg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-ops-surface text-white shadow-sm'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              全部类型
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('java_jar')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                typeFilter === 'java_jar'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              JAR
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('generic_archive')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                typeFilter === 'generic_archive'
                  ? 'bg-ops-surface text-ops-text-sub shadow-sm'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              通用
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-ops-border bg-ops-bg p-0.5 text-ops-text-muted">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md ${
                viewMode === 'cards' ? 'bg-ops-surface text-white' : 'hover:text-white'
              }`}
              title="卡片视图"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md ${
                viewMode === 'table' ? 'bg-ops-surface text-white' : 'hover:text-white'
              }`}
              title="表格视图"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 rounded-xl border border-ops-border bg-ops-card/50 p-5 animate-pulse space-y-4"
            >
              <div className="h-5 bg-slate-800 rounded w-1/2" />
              <div className="h-4 bg-slate-800/60 rounded w-3/4" />
              <div className="h-16 bg-slate-900 rounded" />
              <div className="h-8 bg-slate-800/40 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ops-border bg-ops-card/40 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ops-surface border border-ops-border text-ops-text-muted mb-4">
            <FileCode2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-white">暂未找到匹配的部署模板</h3>
          <p className="text-xs text-ops-text-muted mt-1 max-w-sm">
            您可以新建定制的 JVM 生产模板，或清除筛选条件查看全部。
          </p>
          <PermissionGate
            permission="template:manage"
            disableOnDenied
            deniedTooltip="无模板管理权限，请联系管理员授予"
          >
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(null);
                setEditorOpen(true);
              }}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan/10 border border-ops-cyan/30 text-ops-cyan text-xs font-semibold hover:bg-ops-cyan/20 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>立即创建第一套模板</span>
            </button>
          </PermissionGate>
        </div>
      )}

      {/* Content: Cards View */}
      {!loading && filteredTemplates.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTemplates.map((tpl) => {
            const jdk = jdks.find((j) => j.id === tpl.default_jdk_id);
            return (
              <motion.div
                key={tpl.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="group relative flex flex-col justify-between rounded-xl border border-ops-border bg-ops-card hover:border-ops-border-hover hover:bg-ops-card-hover transition-all duration-200 overflow-hidden shadow-lg"
              >
                {/* Card Top / Header */}
                <div className="p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-white tracking-tight group-hover:text-ops-cyan transition-colors">
                          {tpl.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-ops-text-muted">
                        ID: #{tpl.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Type Badge */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-cyan-950/70 text-ops-cyan border border-ops-cyan/40">
                        {tpl.type.replace('_', ' ')}
                      </span>

                      {/* Supervision Badge */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-ops-surface text-ops-text-muted border border-ops-border">
                        {tpl.supervision_mode === 'systemd' ? 'Systemd' : 'Native'}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Specs */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-ops-text-muted font-mono">
                      <FolderTree className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-ops-text-sub" title={tpl.install_dir_pattern}>
                        {tpl.install_dir_pattern}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-ops-text-muted font-mono">
                      <Cpu className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-ops-text-sub">
                        {jdk ? `${jdk.name} (${jdk.version_str})` : '系统默认 JDK (PATH)'}
                      </span>
                    </div>
                  </div>

                  {/* JVM Options Preview Banner */}
                  <div className="rounded-lg bg-ops-bg/80 border border-ops-border/60 p-2.5">
                    <div className="text-[10px] font-mono text-ops-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>JVM 参数策略</span>
                    </div>
                    <p
                      className="text-[11px] font-mono text-emerald-400/90 line-clamp-2 break-all"
                      title={tpl.jvm_options}
                    >
                      {tpl.jvm_options || '(未配置 JVM 参数)'}
                    </p>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="border-t border-ops-border bg-ops-bg/40 px-4 py-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateService(tpl)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-ops-cyan/15 hover:bg-ops-cyan text-ops-cyan hover:text-slate-950 text-xs font-bold border border-ops-cyan/30 hover:border-ops-cyan transition-all shadow-sm"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>基于此模板创建服务</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <PermissionGate
                      permission="template:manage"
                      disableOnDenied
                      deniedTooltip="无模板管理权限，请联系管理员授予"
                    >
                      <button
                        type="button"
                        onClick={() => handleDuplicate(tpl)}
                        className="p-1.5 rounded-lg text-ops-text-muted hover:text-white hover:bg-ops-surface transition-colors"
                        title="克隆模板"
                        aria-label="克隆"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                    <PermissionGate
                      permission="template:manage"
                      disableOnDenied
                      deniedTooltip="无模板管理权限，请联系管理员授予"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplate(tpl);
                          setEditorOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-ops-text-muted hover:text-white hover:bg-ops-surface transition-colors"
                        title="编辑模板"
                        aria-label="编辑"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                    <PermissionGate
                      permission="template:manage"
                      disableOnDenied
                      deniedTooltip="无模板管理权限，请联系管理员授予"
                    >
                      <button
                        type="button"
                        onClick={() => setTemplateToDelete(tpl)}
                        className="p-1.5 rounded-lg text-ops-text-muted hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        title="删除模板"
                        aria-label="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Content: Table View */}
      {!loading && filteredTemplates.length > 0 && viewMode === 'table' && (
        <div className="rounded-xl border border-ops-border bg-ops-card overflow-hidden shadow-lg">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ops-border bg-ops-bg/80 text-[11px] font-mono uppercase text-ops-text-muted">
              <tr>
                <th className="px-4 py-3">模板名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">监管模式</th>
                <th className="px-4 py-3">默认 JDK</th>
                <th className="px-4 py-3">JVM 参数摘要</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ops-border">
              {filteredTemplates.map((tpl) => {
                const jdk = jdks.find((j) => j.id === tpl.default_jdk_id);
                return (
                  <tr key={tpl.id} className="hover:bg-ops-surface/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">
                      <div>{tpl.name}</div>
                      <div className="text-[10px] font-mono text-ops-text-muted">{tpl.install_dir_pattern}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-ops-cyan">{tpl.type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-ops-text-sub">{tpl.supervision_mode}</td>
                    <td className="px-4 py-3 font-mono text-ops-text-sub">
                      {jdk ? jdk.name : '系统默认'}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-400 max-w-xs truncate">
                      {tpl.jvm_options}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCreateService(tpl)}
                          className="px-2.5 py-1 rounded bg-ops-cyan/10 hover:bg-ops-cyan text-ops-cyan hover:text-slate-950 font-semibold transition-colors"
                        >
                          基于此模板创建服务
                        </button>
                        <PermissionGate
                          permission="template:manage"
                          disableOnDenied
                          deniedTooltip="无模板管理权限，请联系管理员授予"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTemplate(tpl);
                              setEditorOpen(true);
                            }}
                            className="p-1 rounded text-ops-text-muted hover:text-white"
                            title="编辑"
                            aria-label="编辑"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </PermissionGate>
                        <PermissionGate
                          permission="template:manage"
                          disableOnDenied
                          deniedTooltip="无模板管理权限，请联系管理员授予"
                        >
                          <button
                            type="button"
                            onClick={() => handleDuplicate(tpl)}
                            className="p-1 rounded text-ops-text-muted hover:text-white"
                            title="克隆"
                            aria-label="克隆"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </PermissionGate>
                        <PermissionGate
                          permission="template:manage"
                          disableOnDenied
                          deniedTooltip="无模板管理权限，请联系管理员授予"
                        >
                          <button
                            type="button"
                            onClick={() => setTemplateToDelete(tpl)}
                            className="p-1 rounded text-ops-text-muted hover:text-red-400"
                            title="删除"
                            aria-label="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Template Editor Modal */}
      <TemplateEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingTemplate(null);
        }}
        onSave={handleSaveTemplate}
        initialData={editingTemplate}
        jdkList={jdks}
      />

      {/* Quick Create Service Modal */}
      {createServiceModalOpen && selectedTemplateForService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl border border-ops-border bg-ops-surface shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-ops-border pb-3">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-ops-cyan fill-ops-cyan" />
                <h3 className="text-sm font-bold text-white">
                  基于模板创建新服务
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateServiceModalOpen(false)}
                className="text-ops-text-muted hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {serviceError && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                {serviceError}
              </div>
            )}

            <form onSubmit={handleCreateServiceSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-ops-text-sub font-medium mb-1">
                  服务标识名称 (唯一) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => handleServiceNameChange(e.target.value)}
                  placeholder="order-center-api"
                  className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-sm text-white focus:border-ops-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-ops-text-sub font-medium mb-1">
                  对外监听端口 (Port) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={servicePort}
                  onChange={(e) => setServicePort(Number(e.target.value))}
                  className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 font-mono text-sm text-white focus:border-ops-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-ops-text-sub font-medium mb-1">
                  安装落地路径
                </label>
                <input
                  type="text"
                  readOnly
                  value={serviceInstallDir}
                  className="w-full rounded-lg border border-ops-border bg-ops-bg/60 px-3 py-2 font-mono text-xs text-ops-text-muted focus:outline-none"
                />
              </div>

              <div className="rounded-lg bg-ops-bg p-2.5 border border-ops-border text-[11px] text-ops-text-muted space-y-1">
                <div>模板: <span className="text-white font-semibold">{selectedTemplateForService.name}</span></div>
                <div>模式: <span className="text-ops-cyan font-mono">{selectedTemplateForService.supervision_mode}</span></div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateServiceModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-ops-border text-ops-text-sub hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingService}
                  className="px-4 py-1.5 rounded-lg bg-ops-cyan text-slate-950 font-bold hover:bg-cyan-400 disabled:opacity-50"
                >
                  {creatingService ? '正在创建...' : '立即创建并加入舰队'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      <ConfirmModal
        visible={!!templateToDelete}
        title="删除部署模板确认"
        subtitle="高危操作 · 删除后不可恢复"
        message={
          <span>
            确定要彻底删除部署模板 <span className="text-white font-bold">{templateToDelete?.name}</span> 吗？使用该模板创建的已有服务不会受影响，但无法再基于该模板派生新实例。
          </span>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={isDeletingTemplate}
        onConfirm={handleConfirmDeleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
};
