import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Check,
  Shield,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  Sliders,
  AlertCircle,
  X,
  Loader2,
  Lock,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../../api';
import { toast } from 'sonner';
import { UserProfile, PERMISSIONS, DEFAULT_OPERATOR_PERMISSIONS } from '../../types';
import { UserAvatar } from '../../components/auth/UserAvatar';

export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'service_control',
    name: '服务日常控制',
    description: '服务状态与性能指标查看、启停与重启控制',
    permissions: [
      { key: PERMISSIONS.SERVICE_VIEW, name: '查看服务 (service:view)', description: '查看服务列表、运行指标与实时日志' },
      { key: PERMISSIONS.SERVICE_CONTROL, name: '控制服务 (service:control)', description: '启动、停止与重启运行中的服务实例' },
    ],
  },
  {
    id: 'deploy_rollback',
    name: '发版与回滚',
    description: '应用安装包上传、版本部署发布与历史回滚',
    permissions: [
      { key: PERMISSIONS.SERVICE_DEPLOY, name: '发布版本 (service:deploy)', description: '上传应用安装包并执行发布操作' },
      { key: PERMISSIONS.SERVICE_ROLLBACK, name: '版本回滚 (service:rollback)', description: '一键回滚到指定历史成功构建版本' },
    ],
  },
  {
    id: 'service_config',
    name: '服务配置',
    description: '配置文件编辑及服务生命周期管理',
    permissions: [
      { key: PERMISSIONS.SERVICE_CONFIG, name: '修改配置 (service:config)', description: '编辑和保存服务相关的配置文件' },
      { key: PERMISSIONS.SERVICE_MANAGE, name: '服务管理 (service:manage)', description: '注册新服务、修改服务定义或下线注销' },
    ],
  },
  {
    id: 'template_manage',
    name: '部署模板',
    description: '启动命令与生命周期管控模板维护',
    permissions: [
      { key: PERMISSIONS.TEMPLATE_MANAGE, name: '模板管理 (template:manage)', description: '创建、编辑与删除应用部署模板' },
    ],
  },
  {
    id: 'jdk_manage',
    name: 'JDK 资产',
    description: '宿主机 Java 运行时版本登记与扫描管理',
    permissions: [
      { key: PERMISSIONS.JDK_MANAGE, name: 'JDK 资产 (jdk:manage)', description: '扫描宿主机环境、登记与注销 JDK 版本' },
    ],
  },
  {
    id: 'audit_log',
    name: '审计日志',
    description: '不可篡改操作记录查询与导出',
    permissions: [
      { key: PERMISSIONS.AUDIT_VIEW, name: '审计追踪 (audit:view)', description: '查看系统不可篡改操作审计轨迹及日志导出' },
    ],
  },
];

export const ALL_OPERATOR_PERMISSIONS: string[] = [
  PERMISSIONS.SERVICE_VIEW,
  PERMISSIONS.SERVICE_CONTROL,
  PERMISSIONS.SERVICE_DEPLOY,
  PERMISSIONS.SERVICE_ROLLBACK,
  PERMISSIONS.SERVICE_CONFIG,
  PERMISSIONS.SERVICE_MANAGE,
  PERMISSIONS.TEMPLATE_MANAGE,
  PERMISSIONS.JDK_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
];

export const READONLY_PERMISSIONS: string[] = [
  PERMISSIONS.SERVICE_VIEW,
  PERMISSIONS.AUDIT_VIEW,
];

export const PERMISSION_PRESETS = [
  {
    id: 'standard',
    name: '标准运维',
    description: '基础服务管控、发版回滚、配置及审计查看（常用）',
    permissions: DEFAULT_OPERATOR_PERMISSIONS,
  },
  {
    id: 'readonly',
    name: '只读巡检',
    description: '仅允许查看服务状态与审计日志，禁止破坏性操作',
    permissions: READONLY_PERMISSIONS,
  },
  {
    id: 'full',
    name: '全功能运维',
    description: '拥有全部 9 项运维与资产配置管理权限',
    permissions: ALL_OPERATOR_PERMISSIONS,
  },
];

function getCurrentUsername(): string {
  if (typeof window === 'undefined') return 'admin';
  const direct = localStorage.getItem('opshub_username');
  if (direct) return direct;
  try {
    const userStr = localStorage.getItem('opshub_user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed.username) return parsed.username;
    }
  } catch {
    // ignore
  }
  return 'admin';
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    nickname: '',
    role: 'operator' as 'admin' | 'operator',
    permissions: [...DEFAULT_OPERATOR_PERMISSIONS],
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Edit Permissions Modal
  const [permModalUser, setPermModalUser] = useState<UserProfile | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Reset Password Modal
  const [resetModalUser, setResetModalUser] = useState<UserProfile | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete Confirm Modal
  const [deleteModalUser, setDeleteModalUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Current logged-in user
  const currentUsername = useMemo(() => getCurrentUsername(), []);

  const loadUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await api.getUsers();
      setUsers(data || []);
    } catch (err: any) {
      const msg = err.message || '加载用户列表失败';
      setError(msg);
      toast.error(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const isProtectedUser = useCallback(
    (user: UserProfile) => {
      return user.username === 'admin' || user.username === currentUsername;
    },
    [currentUsername]
  );

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q);

      const matchRole = !roleFilter || u.role === roleFilter;
      const matchStatus = !statusFilter || (u.status || 'active') === statusFilter;

      return matchQuery && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Handle Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username.trim()) {
      toast.error('请输入用户名');
      return;
    }
    if (!createForm.password || createForm.password.length < 6) {
      toast.error('密码长度至少为 6 个字符');
      return;
    }

    try {
      setCreating(true);
      await api.createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        nickname: createForm.nickname.trim() || undefined,
        role: createForm.role,
        permissions: createForm.role === 'admin' ? undefined : createForm.permissions,
      });

      toast.success(`用户 [${createForm.username}] 创建成功`);
      setCreateModalOpen(false);
      setCreateForm({
        username: '',
        password: '',
        nickname: '',
        role: 'operator',
        permissions: [...DEFAULT_OPERATOR_PERMISSIONS],
      });
      await loadUsers(true);
    } catch (err: any) {
      toast.error(err.message || '创建用户失败');
    } finally {
      setCreating(false);
    }
  };

  // Handle Edit Permissions
  const handleOpenPermModal = (user: UserProfile) => {
    if (user.role === 'admin') {
      toast.info('系统管理员默认拥有全部功能权限，无需单独配置');
      return;
    }
    setPermModalUser(user);
    setSelectedPerms(user.permissions ? [...user.permissions] : [...DEFAULT_OPERATOR_PERMISSIONS]);
  };

  const handleSavePermissions = async () => {
    if (!permModalUser || !permModalUser.id) return;
    try {
      setSavingPerms(true);
      await api.updateUserPermissions(permModalUser.id, selectedPerms);
      toast.success(`用户 [${permModalUser.username}] 权限更新成功`);
      setPermModalUser(null);
      await loadUsers(true);
    } catch (err: any) {
      toast.error(err.message || '更新权限失败');
    } finally {
      setSavingPerms(false);
    }
  };

  const togglePermission = (key: string) => {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleCreatePermission = (key: string) => {
    setCreateForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  };

  // Handle Toggle Status
  const handleToggleStatus = async (user: UserProfile) => {
    if (isProtectedUser(user)) {
      toast.warning('无法修改系统管理员或当前登录用户的状态');
      return;
    }
    if (!user.id) return;

    const newStatus = (user.status || 'active') === 'active' ? 'disabled' : 'active';
    try {
      await api.updateUserStatus(user.id, newStatus);
      toast.success(`用户 [${user.username}] 已${newStatus === 'active' ? '启用' : '停用'}`);
      await loadUsers(true);
    } catch (err: any) {
      toast.error(err.message || '更新状态失败');
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !resetModalUser.id) return;
    if (!resetPasswordVal || resetPasswordVal.length < 6) {
      toast.error('新密码长度至少为 6 个字符');
      return;
    }

    try {
      setResettingPassword(true);
      await api.resetUserPassword(resetModalUser.id, resetPasswordVal);
      toast.success(`用户 [${resetModalUser.username}] 密码重置成功`);
      setResetModalUser(null);
      setResetPasswordVal('');
    } catch (err: any) {
      toast.error(err.message || '重置密码失败');
    } finally {
      setResettingPassword(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!deleteModalUser || !deleteModalUser.id) return;
    if (isProtectedUser(deleteModalUser)) {
      toast.warning('无法删除系统管理员或当前登录用户');
      return;
    }

    try {
      setDeletingUser(true);
      await api.deleteUser(deleteModalUser.id);
      toast.success(`用户 [${deleteModalUser.username}] 已删除`);
      setDeleteModalUser(null);
      await loadUsers(true);
    } catch (err: any) {
      toast.error(err.message || '删除用户失败');
    } finally {
      setDeletingUser(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div data-testid="user-management-page" className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ops-surface border border-ops-border text-ops-cyan shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">用户与权限管理 / Users</h1>
            <span className="rounded-full bg-ops-surface border border-ops-border px-2.5 py-0.5 text-xs font-mono font-medium text-ops-cyan">
              {users.length} 个用户
            </span>
          </div>
          <p className="text-xs text-ops-text-muted font-mono mt-1">
            系统访问身份管控、RBAC 细粒度权限配置与账号安全生命周期管理
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadUsers()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ops-border bg-ops-surface text-ops-text-main text-xs font-mono font-semibold hover:border-ops-cyan hover:text-ops-cyan transition-all shadow-sm"
          >
            <RotateCcw className={`h-3.5 w-3.5 text-ops-cyan ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateForm({
                username: '',
                password: '',
                nickname: '',
                role: 'operator',
                permissions: [...DEFAULT_OPERATOR_PERMISSIONS],
              });
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>新建用户</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-ops-border bg-ops-surface/80 p-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ops-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用户名或昵称..."
            className="w-full pl-9 pr-4 py-2 bg-ops-bg border border-ops-border rounded-lg text-xs font-mono text-white placeholder:text-ops-text-muted/60 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <div className="relative">
            <select
              aria-label="role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-ops-bg border border-ops-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              <option value="">全部角色 (All Roles)</option>
              <option value="admin">管理员 (admin)</option>
              <option value="operator">运维人员 (operator)</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
              ▼
            </div>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              aria-label="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-ops-bg border border-ops-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-ops-cyan focus:outline-none appearance-none pr-8 cursor-pointer"
            >
              <option value="">全部状态 (All Status)</option>
              <option value="active">正常 (active)</option>
              <option value="disabled">已停用 (disabled)</option>
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-text-muted text-[10px]">
              ▼
            </div>
          </div>

          {(searchQuery || roleFilter || statusFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('');
                setStatusFilter('');
              }}
              className="px-3 py-2 rounded-lg border border-ops-border bg-ops-surface text-xs font-mono text-ops-text-muted hover:text-white transition-colors"
            >
              重置
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* User Table Container */}
      <div className="rounded-xl border border-ops-border bg-ops-card overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-xs font-mono text-ops-text-muted space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-ops-cyan mx-auto" />
            <p>正在读取用户安全目录与权限策略...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-xs font-mono text-ops-text-muted space-y-3">
            <Users className="h-8 w-8 text-ops-border-hover mx-auto" />
            <p className="text-white font-medium text-sm">暂无符合条件的用户</p>
            <p className="text-ops-text-muted text-xs">请尝试调整搜索关键字或筛选条件，或点击右上角新建用户。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-ops-border bg-ops-card/95 backdrop-blur-sm text-ops-text-muted uppercase text-[11px] shadow-sm">
                <tr>
                  <th className="px-4 py-3.5">用户信息</th>
                  <th className="px-4 py-3.5">角色</th>
                  <th className="px-4 py-3.5">权限摘要</th>
                  <th className="px-4 py-3.5">账号状态</th>
                  <th className="px-4 py-3.5">创建时间</th>
                  <th className="px-4 py-3.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-border/70 text-ops-text-sub">
                {filteredUsers.map((user) => {
                  const isAdmin = user.role === 'admin';
                  const isActive = (user.status || 'active') === 'active';
                  const isProtected = isProtectedUser(user);
                  const perms = user.permissions || [];

                  return (
                    <tr
                      key={user.id || user.username}
                      className="hover:bg-ops-surface/60 transition-colors group"
                    >
                      {/* User Info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            avatar={user.avatar}
                            nickname={user.nickname}
                            username={user.username}
                            role={user.role}
                            size="sm"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-bold tracking-wide">
                                {user.username}
                              </span>
                              {user.username === currentUsername && (
                                <span className="rounded bg-cyan-950/80 px-1.5 py-0.2 text-[10px] text-ops-cyan border border-ops-cyan/30">
                                  当前账号
                                </span>
                              )}
                            </div>
                            {user.nickname && (
                              <div className="text-[11px] text-ops-text-muted mt-0.5">
                                {user.nickname}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-950/60 border border-ops-cyan/40 text-ops-cyan font-bold text-xs shadow-sm">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>管理员</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300 text-xs">
                            <Shield className="h-3.5 w-3.5 text-slate-400" />
                            <span>运维人员</span>
                          </span>
                        )}
                      </td>

                      {/* Permissions Summary */}
                      <td className="px-4 py-3.5">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-ops-cyan text-xs">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>全部权限 (Admin 超级管理)</span>
                          </span>
                        ) : perms.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-ops-text-muted text-xs">
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-500/70" />
                            <span>无权限</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-ops-surface border border-ops-border px-2 py-0.5 text-xs text-white font-bold">
                              {perms.length} 项权限
                            </span>
                            <span className="text-[11px] text-ops-text-muted truncate max-w-[200px]" title={perms.join(', ')}>
                              {perms.slice(0, 3).join(', ')}{perms.length > 3 ? '...' : ''}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>正常</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/50 border border-red-500/30 text-red-300 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            <span>已停用</span>
                          </span>
                        )}
                      </td>

                      {/* Created Time */}
                      <td className="px-4 py-3.5 text-ops-text-muted text-[11px]">
                        {formatDate(user.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Permissions Config Button */}
                          <button
                            type="button"
                            data-testid={`edit-perm-${user.username}`}
                            disabled={isAdmin}
                            onClick={() => handleOpenPermModal(user)}
                            className={`p-1.5 rounded-lg border border-ops-border text-xs transition-colors ${
                              isAdmin
                                ? 'opacity-30 cursor-not-allowed text-ops-text-muted'
                                : 'hover:border-ops-cyan hover:text-ops-cyan text-ops-text-main bg-ops-surface'
                            }`}
                            title={isAdmin ? '管理员拥有全部权限，无需单独配置' : '配置用户功能权限'}
                          >
                            <Sliders className="h-3.5 w-3.5" />
                          </button>

                          {/* Status Toggle Button */}
                          <button
                            type="button"
                            data-testid={`toggle-status-${user.username}`}
                            disabled={isProtected}
                            onClick={() => handleToggleStatus(user)}
                            className={`px-2 py-1 rounded-lg border text-xs font-mono transition-colors ${
                              isProtected
                                ? 'opacity-30 cursor-not-allowed border-ops-border text-ops-text-muted'
                                : isActive
                                ? 'border-amber-500/30 text-amber-300 hover:bg-amber-950/30'
                                : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30'
                            }`}
                            title={isProtected ? '无法停用当前登录用户或系统管理员' : isActive ? '停用此用户' : '启用此用户'}
                          >
                            {isActive ? (
                              <span className="flex items-center gap-1">
                                <UserX className="h-3 w-3" />
                                <span>停用</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                <span>启用</span>
                              </span>
                            )}
                          </button>

                          {/* Reset Password Button */}
                          <button
                            type="button"
                            data-testid={`reset-pwd-${user.username}`}
                            onClick={() => {
                              setResetPasswordVal('');
                              setResetModalUser(user);
                            }}
                            className="p-1.5 rounded-lg border border-ops-border bg-ops-surface text-ops-text-main hover:border-ops-cyan hover:text-ops-cyan text-xs transition-colors"
                            title="重置用户登录密码"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete User Button */}
                          <button
                            type="button"
                            data-testid={`delete-user-${user.username}`}
                            disabled={isProtected}
                            onClick={() => setDeleteModalUser(user)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors ${
                              isProtected
                                ? 'opacity-30 cursor-not-allowed border-ops-border text-ops-text-muted'
                                : 'border-ops-border bg-ops-surface text-ops-text-muted hover:border-red-500/50 hover:text-red-400 hover:bg-red-950/30'
                            }`}
                            title={isProtected ? '系统管理员和当前登录用户不可删除' : '注销/删除用户'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Create User Modal */}
      <AnimatePresence>
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateModalOpen(false)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 space-y-5"
            >
              <div className="flex items-center justify-between pb-4 border-b border-ops-border">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">新建系统用户</h2>
                    <p className="text-xs text-ops-text-muted font-mono">创建新的运维账号并为其分配角色与功能权限</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                      用户名 / Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      aria-label="username-input"
                      value={createForm.username}
                      onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                      placeholder="例如: dev_ops_01"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                  </div>

                  {/* Nickname */}
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                      昵称 / Nickname (可选)
                    </label>
                    <input
                      type="text"
                      aria-label="nickname-input"
                      value={createForm.nickname}
                      onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
                      placeholder="例如: 张三 (中间件运维)"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    登录密码 / Password <span className="text-red-400">* (至少 6 位)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      aria-label="password-input"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="请输入初始登录密码"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 pr-10 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ops-text-muted hover:text-white transition-colors"
                    >
                      {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-2">
                    用户角色 / Role <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, role: 'operator' })}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        createForm.role === 'operator'
                          ? 'border-ops-cyan bg-cyan-950/20 text-white ring-1 ring-ops-cyan'
                          : 'border-ops-border bg-ops-bg text-ops-text-muted hover:border-ops-border-hover'
                      }`}
                    >
                      <Shield className={`h-5 w-5 mt-0.5 ${createForm.role === 'operator' ? 'text-ops-cyan' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-bold text-xs">运维人员 (Operator)</div>
                        <div className="text-[11px] text-ops-text-muted mt-0.5">
                          细粒度功能权限管控，适合日常发布、日常巡检与维护人员
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, role: 'admin' })}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        createForm.role === 'admin'
                          ? 'border-ops-cyan bg-cyan-950/20 text-white ring-1 ring-ops-cyan'
                          : 'border-ops-border bg-ops-bg text-ops-text-muted hover:border-ops-border-hover'
                      }`}
                    >
                      <ShieldCheck className={`h-5 w-5 mt-0.5 ${createForm.role === 'admin' ? 'text-ops-cyan' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-bold text-xs">管理员 (Admin)</div>
                        <div className="text-[11px] text-ops-text-muted mt-0.5">
                          自动拥有全系统全部功能、资产与用户权限管理等最高权限
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Initial Permissions (Only for Operator) */}
                {createForm.role === 'operator' && (
                  <div className="space-y-3 pt-2 border-t border-ops-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-white">初始权限配置</span>
                        <span className="text-xs text-ops-text-muted ml-2 font-mono">
                          (已选 {createForm.permissions.length} / 9 项)
                        </span>
                      </div>
                      {/* Presets */}
                      <div className="flex items-center gap-1.5">
                        {PERMISSION_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              setCreateForm((prev) => ({ ...prev, permissions: [...preset.permissions] }))
                            }
                            className="px-2.5 py-1 rounded bg-ops-bg border border-ops-border hover:border-ops-cyan text-[11px] font-mono text-ops-text-main transition-colors"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Grouped Checkboxes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                      {PERMISSION_GROUPS.map((group) => (
                        <div
                          key={group.id}
                          className="rounded-lg border border-ops-border/60 bg-ops-bg/60 p-2.5 space-y-2"
                        >
                          <div className="text-[11px] font-bold text-ops-cyan">{group.name}</div>
                          <div className="space-y-1.5">
                            {group.permissions.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-start gap-2 text-xs text-ops-text-main cursor-pointer hover:text-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={createForm.permissions.includes(perm.key)}
                                  onChange={() => toggleCreatePermission(perm.key)}
                                  className="mt-0.5 rounded border-ops-border bg-ops-bg text-ops-cyan focus:ring-ops-cyan"
                                />
                                <div>
                                  <div className="text-[11px] font-medium">{perm.name}</div>
                                  <div className="text-[10px] text-ops-text-muted">{perm.description}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-2 border-t border-ops-border">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                  >
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>确认创建</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Edit Permissions Modal */}
      <AnimatePresence>
        {permModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPermModalUser(null)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 space-y-5"
            >
              <div className="flex items-center justify-between pb-4 border-b border-ops-border">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <Sliders className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">配置权限 - {permModalUser.username}</h2>
                    <p className="text-xs text-ops-text-muted font-mono">
                      {permModalUser.nickname ? `昵称: ${permModalUser.nickname} | ` : ''}调整该运维账号的功能准入控制
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPermModalUser(null)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Template Presets Bar */}
              <div className="rounded-xl border border-ops-border bg-ops-bg/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white">快捷权限模板</span>
                  <span className="text-xs font-mono text-ops-cyan">
                    已勾选 {selectedPerms.length} / 9 项
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PERMISSION_PRESETS.map((preset) => {
                    const isFullyMatched =
                      preset.permissions.length === selectedPerms.length &&
                      preset.permissions.every((p) => selectedPerms.includes(p));

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPerms([...preset.permissions])}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          isFullyMatched
                            ? 'border-ops-cyan bg-cyan-950/30 ring-1 ring-ops-cyan'
                            : 'border-ops-border bg-ops-surface hover:border-ops-border-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{preset.name}</span>
                          {isFullyMatched && <Check className="h-3 w-3 text-ops-cyan" />}
                        </div>
                        <div className="text-[10px] text-ops-text-muted mt-1 leading-snug">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Granular Permission Checkboxes by Group */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white">权限分类细则</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPerms([...ALL_OPERATOR_PERMISSIONS])}
                      className="text-[11px] font-mono text-ops-cyan hover:underline"
                    >
                      全部全选
                    </button>
                    <span className="text-ops-border">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPerms([])}
                      className="text-[11px] font-mono text-ops-text-muted hover:text-white hover:underline"
                    >
                      清空选择
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {PERMISSION_GROUPS.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-xl border border-ops-border/70 bg-ops-bg/60 p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-ops-border/40 pb-1.5">
                        <span className="text-xs font-bold text-ops-cyan">{group.name}</span>
                        <span className="text-[10px] font-mono text-ops-text-muted">
                          {group.permissions.filter((p) => selectedPerms.includes(p.key)).length} /{' '}
                          {group.permissions.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.permissions.map((perm) => {
                          const isChecked = selectedPerms.includes(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-2.5 p-1.5 rounded-lg cursor-pointer transition-colors ${
                                isChecked ? 'bg-cyan-950/20' : 'hover:bg-ops-surface/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                aria-label={`perm-${perm.key}`}
                                checked={isChecked}
                                onChange={() => togglePermission(perm.key)}
                                className="mt-0.5 rounded border-ops-border bg-ops-bg text-ops-cyan focus:ring-ops-cyan"
                              />
                              <div>
                                <div className="text-xs font-medium text-white">{perm.name}</div>
                                <div className="text-[10px] text-ops-text-muted">{perm.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex justify-end gap-2 border-t border-ops-border">
                <button
                  type="button"
                  onClick={() => setPermModalUser(null)}
                  className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPerms}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                >
                  {savingPerms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>保存权限</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 3: Reset Password Modal */}
      <AnimatePresence>
        {resetModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setResetModalUser(null)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-ops-border">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/70 border border-ops-cyan/30 text-ops-cyan">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">重置密码 - {resetModalUser.username}</h2>
                    <p className="text-xs text-ops-text-muted font-mono">为该用户强制设置新的登录口令</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="rounded-lg p-1.5 text-ops-text-muted hover:bg-ops-border hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    新密码 / New Password <span className="text-red-400">* (至少 6 位)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      aria-label="new-password-input"
                      value={resetPasswordVal}
                      onChange={(e) => setResetPasswordVal(e.target.value)}
                      placeholder="请输入新的登录密码"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 pr-10 text-xs text-white font-mono placeholder:text-ops-text-muted/50 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ops-text-muted hover:text-white transition-colors"
                    >
                      {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-ops-border">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={resettingPassword}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                  >
                    {resettingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>确认重置</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 4: Delete User Confirmation Dialog */}
      <AnimatePresence>
        {deleteModalUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteModalUser(null)}
              className="fixed inset-0 bg-slate-950/45 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-500/30 bg-ops-surface p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/60 border border-red-500/40 text-red-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">确认删除用户</h3>
                  <p className="text-xs text-ops-text-muted font-mono">该操作将永久注销用户身份凭证</p>
                </div>
              </div>

              <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-3.5 text-xs text-red-200 leading-relaxed font-mono">
                确定要注销/删除用户 [{deleteModalUser.username}] 吗？此操作无法撤回，该用户将被永久清除且无法再次登录。
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-ops-border">
                <button
                  type="button"
                  onClick={() => setDeleteModalUser(null)}
                  className="px-4 py-2 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deletingUser}
                  onClick={handleDeleteUser}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 disabled:opacity-50 transition-all"
                >
                  {deletingUser ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>确认删除</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserManagement;
