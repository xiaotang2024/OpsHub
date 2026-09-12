import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Shield,
  Mail,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  X,
  Check,
  AlertCircle,
  Loader2,
  Save,
  HelpCircle,
} from 'lucide-react';
import { api } from '../../api';
import { UserProfile } from '../../types';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  // Edit profile form
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');

  // Change password form
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProfile();
      setProfile(data);
      setNickname(data.nickname || '');
      setEmail(data.email || '');
    } catch (err: any) {
      setError(err.message || '加载个人信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      setError(null);
      setSuccessMsg(null);
      setActiveTab('profile');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle saving profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setError(null);
      const updated = await api.updateProfile({ nickname, email });
      setProfile(updated);
      setSuccessMsg('个人资料更新成功！');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || '更新个人资料失败');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle changing password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      setError('请输入当前旧密码');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('新密码长度必须至少为 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      setChangingPass(true);
      setError(null);
      await api.changePassword(oldPassword, newPassword);
      setSuccessMsg('登录密码修改成功，请妥善保存！');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || '修改密码失败，请核对旧密码是否正确');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 max-h-[90vh] flex flex-col"
        >
          {/* Top Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-ops-text-muted hover:text-white hover:bg-ops-border/60 transition-colors"
            aria-label="关闭个人中心"
          >
            <X className="h-4 w-4" />
          </button>

          {/* User Header Profile Card */}
          <div className="flex items-center gap-4 mb-5 shrink-0">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-900/80 via-slate-900 to-slate-800 border border-ops-cyan/40 text-ops-cyan shadow-cyan-glow">
              <User className="h-7 w-7" />
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ops-bg border border-ops-border">
                <Shield className="h-3 w-3 text-ops-cyan" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white">
                  {profile?.nickname || profile?.username || '个人中心'}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                    profile?.role === 'admin'
                      ? 'bg-amber-950/70 border-amber-500/40 text-amber-400'
                      : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-400'
                  }`}
                >
                  {profile?.role === 'admin' ? '超级管理员' : '运维操作员'}
                </span>
              </div>
              <p className="text-xs text-ops-text-muted font-mono mt-1 flex items-center gap-2">
                <span>@{profile?.username || 'user'}</span>
                {profile?.created_at && (
                  <span className="flex items-center gap-1 text-[11px] text-ops-text-muted/80">
                    <Calendar className="h-3 w-3" />
                    <span>
                      注册于 {new Date(profile.created_at).toLocaleDateString()}
                    </span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex rounded-lg border border-ops-border bg-ops-bg/60 p-1 mb-4 shrink-0 text-xs font-mono">
            <button
              type="button"
              onClick={() => {
                setActiveTab('profile');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'profile'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm border border-ops-cyan/30'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              基本资料与信息
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('password');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'password'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm border border-ops-cyan/30'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              修改登录密码
            </button>
          </div>

          {/* Alert Messages */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300 shrink-0"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="font-mono">{error}</span>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 shrink-0"
            >
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="font-mono">{successMsg}</span>
            </motion.div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-ops-text-muted">
                <Loader2 className="h-6 w-6 animate-spin text-ops-cyan" />
                <span className="text-xs font-mono">正在加载用户资料...</span>
              </div>
            ) : activeTab === 'profile' ? (
              /* TAB 1: Profile Form */
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      用户名 (系统账号)
                    </label>
                    <input
                      type="text"
                      value={profile?.username || ''}
                      disabled
                      className="w-full rounded-lg border border-ops-border bg-ops-bg/60 px-3 py-2 text-xs text-ops-text-muted font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      分配角色权限
                    </label>
                    <input
                      type="text"
                      value={
                        profile?.role === 'admin'
                          ? '平台超级管理员 (admin)'
                          : '运维操作员 (operator)'
                      }
                      disabled
                      className="w-full rounded-lg border border-ops-border bg-ops-bg/60 px-3 py-2 text-xs text-ops-text-muted font-mono cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1">
                    真实姓名 / 平台昵称
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="输入您的姓名或昵称"
                    className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-2 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1">
                    联系邮箱 / Email
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-2 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                </div>

                {profile?.security_question && (
                  <div className="rounded-xl border border-ops-border bg-ops-bg/40 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-ops-cyan">
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>已绑定的密保安全问题：</span>
                    </div>
                    <p className="text-xs text-ops-text-sub font-mono pl-5">
                      {profile.security_question}
                    </p>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                  >
                    {savingProfile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>保存资料设置</span>
                  </button>
                </div>
              </form>
            ) : (
              /* TAB 2: Change Password Form */
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                    当前旧密码 / Current Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                    <input
                      type={showOldPassword ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="请输入当前正在使用的旧密码"
                      disabled={changingPass}
                      className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-8 py-2 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute right-2.5 text-ops-text-muted hover:text-white"
                    >
                      {showOldPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      设置新密码
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="至少 6 位字符"
                        disabled={changingPass}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-8 py-2 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2.5 text-ops-text-muted hover:text-white"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      确认新密码
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="重复新密码"
                        disabled={changingPass}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-2 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={changingPass}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ops-cyan text-slate-950 text-xs font-bold shadow-cyan-glow hover:bg-cyan-400 disabled:opacity-50 transition-all"
                  >
                    {changingPass ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>确认修改密码</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer with Logout */}
          <div className="mt-5 pt-3 border-t border-ops-border flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-mono text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>退出登录会话</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-ops-border text-xs font-mono text-ops-text-muted hover:text-white hover:bg-ops-border/50 transition-colors"
            >
              关闭
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UserProfileModal;
