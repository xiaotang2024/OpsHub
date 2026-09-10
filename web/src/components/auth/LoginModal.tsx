import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Lock, User, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../api';

export interface LoginModalProps {
  isOpen: boolean;
  onSuccess?: (token: string, username: string) => void;
  onClose?: () => void;
  canDismiss?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  canDismiss = false,
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!password) {
      setError('请输入访问密码');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.login(username.trim(), password);
      if (res && res.token) {
        localStorage.setItem('opshub_token', res.token);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('opshub:authenticated', { detail: { username: username.trim() } }));
        }
        if (onSuccess) {
          onSuccess(res.token, username.trim());
        }
      } else {
        setError('登录响应异常，未能获取有效 Token');
      }
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名或密码');
    } finally {
      setLoading(false);
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
          onClick={() => {
            if (canDismiss && onClose) onClose();
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10"
        >
          {/* Cyber Accent Border Top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500" />

          {/* Header */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950/70 border border-ops-cyan/40 text-ops-cyan shadow-cyan-glow">
              <Terminal className="h-6 w-6" />
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-ops-emerald animate-ping" />
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-ops-emerald" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white">OpsHub 控制台登录</h2>
                <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-ops-cyan border border-ops-cyan/30">
                  AUTH
                </span>
              </div>
              <p className="text-xs text-ops-text-muted font-mono mt-0.5">请输入凭证以验证身份并获取访问 Token</p>
            </div>
          </div>

          {/* Tip Notice */}
          <div className="mb-5 rounded-lg border border-cyan-900/60 bg-cyan-950/30 p-3 text-xs text-cyan-200/90 leading-relaxed font-sans">
            <span className="font-semibold text-ops-cyan">💡 初始凭据提示：</span>
            管理员初始密码已在服务端首次启动时于终端控制台高亮打印。默认用户名为{' '}
            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-white">admin</code>。
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="font-mono">{error}</span>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                用户名 / Username
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3 h-4 w-4 text-ops-text-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  disabled={loading}
                  className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                密码 / Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 h-4 w-4 text-ops-text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入访问凭据密钥"
                  disabled={loading}
                  className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-10 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-ops-text-muted hover:text-white transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-ops-cyan px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-cyan-glow"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-mono">正在验证凭据...</span>
                </>
              ) : (
                <span className="font-mono">确认登录 / Login</span>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LoginModal;
