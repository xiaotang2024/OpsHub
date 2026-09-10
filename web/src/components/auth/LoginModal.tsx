import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Mail,
  UserPlus,
  ArrowLeft,
  KeyRound,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../api';

export type AuthMode = 'login' | 'register' | 'forgot-password';

export interface LoginModalProps {
  isOpen: boolean;
  onSuccess?: (token: string, username: string) => void;
  onClose?: () => void;
  canDismiss?: boolean;
  initialMode?: AuthMode;
}

const PRESET_QUESTIONS = [
  '您就读的第一所小学名称？',
  '您出生或长大的城市名称？',
  '您最喜欢的编程语言是什么？',
  '您的第一只宠物叫什么名字？',
  '自定义密保问题...',
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  canDismiss = false,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regUsername, setRegUsername] = useState('');
  const [regNickname, setRegNickname] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(PRESET_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [regAnswer, setRegAnswer] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot password form state
  const [forgotUsername, setForgotUsername] = useState('');
  const [retrievedQuestion, setRetrievedQuestion] = useState<string | null>(null);
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [queryingQuestion, setQueryingQuestion] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const resetAllErrors = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const switchMode = (newMode: AuthMode) => {
    resetAllErrors();
    setMode(newMode);
  };

  // 1. Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!loginPassword) {
      setError('请输入访问密码');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.login(loginUsername.trim(), loginPassword);
      if (res && res.token) {
        localStorage.setItem('opshub_token', res.token);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('opshub:authenticated', {
              detail: { username: loginUsername.trim(), user: res.user },
            })
          );
        }
        if (onSuccess) {
          onSuccess(res.token, loginUsername.trim());
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

  // 2. Submit Register
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || regUsername.trim().length < 3) {
      setError('用户名必须至少包含 3 个字符');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setError('密码长度必须至少为 6 位');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    const question = selectedQuestion === '自定义密保问题...' ? customQuestion.trim() : selectedQuestion;
    if (!question) {
      setError('请提供密保安全问题');
      return;
    }
    if (!regAnswer.trim()) {
      setError('请输入密保安全答案');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.register({
        username: regUsername.trim(),
        password: regPassword,
        nickname: regNickname.trim() || undefined,
        email: regEmail.trim() || undefined,
        security_question: question,
        security_answer: regAnswer.trim(),
      });

      if (res && res.token) {
        localStorage.setItem('opshub_token', res.token);
        setSuccessMsg('注册成功，正在为您自动登录...');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('opshub:authenticated', {
                detail: { username: regUsername.trim(), user: res.user },
              })
            );
          }
          if (onSuccess) {
            onSuccess(res.token, regUsername.trim());
          }
        }, 1000);
      } else {
        setSuccessMsg('注册成功，请使用新账号登录');
        setTimeout(() => switchMode('login'), 1500);
      }
    } catch (err: any) {
      setError(err.message || '注册失败，请检查填写内容');
    } finally {
      setLoading(false);
    }
  };

  // 3. Query Security Question for Forgot Password
  const handleQueryQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setError('请输入要找回密码的用户名');
      return;
    }

    try {
      setQueryingQuestion(true);
      setError(null);
      const res = await api.getSecurityQuestion(forgotUsername.trim());
      if (res && res.security_question) {
        setRetrievedQuestion(res.security_question);
      } else {
        setError('未能查询到该用户的密保安全问题');
      }
    } catch (err: any) {
      setError(err.message || '查询密保问题失败，用户可能不存在或未设置密保');
    } finally {
      setQueryingQuestion(false);
    }
  };

  // 4. Submit Reset Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotAnswer.trim()) {
      setError('请输入密保安全答案');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setError('新密码长度必须至少为 6 位');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.resetPassword({
        username: forgotUsername.trim(),
        security_answer: forgotAnswer.trim(),
        new_password: forgotNewPassword,
      });

      setSuccessMsg('密码重置成功！请使用新密码重新登录');
      setLoginUsername(forgotUsername.trim());
      setLoginPassword('');
      setTimeout(() => switchMode('login'), 1800);
    } catch (err: any) {
      setError(err.message || '重置密码失败，请核对密保答案');
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
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-ops-border bg-ops-surface p-6 shadow-2xl z-10 max-h-[90vh] flex flex-col"
        >
          {/* Cyber Accent Border Top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500" />

          {/* Close button if dismissible */}
          {canDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-ops-text-muted hover:text-white hover:bg-ops-border/60 transition-colors"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Header */}
          <div className="flex items-center gap-3.5 mb-4 shrink-0">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-950/70 border border-ops-cyan/40 text-ops-cyan shadow-cyan-glow">
              {mode === 'login' && <Terminal className="h-6 w-6" />}
              {mode === 'register' && <UserPlus className="h-6 w-6" />}
              {mode === 'forgot-password' && <KeyRound className="h-6 w-6" />}
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-ops-emerald animate-ping" />
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-ops-emerald" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white">
                  {mode === 'login' && 'OpsHub 控制台登录'}
                  {mode === 'register' && '注册 OpsHub 账号'}
                  {mode === 'forgot-password' && '重置与找回密码'}
                </h2>
                <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-ops-cyan border border-ops-cyan/30">
                  {mode === 'login' ? 'AUTH' : mode === 'register' ? 'REGISTER' : 'RECOVERY'}
                </span>
              </div>
              <p className="text-xs text-ops-text-muted font-mono mt-0.5">
                {mode === 'login' && '请输入凭证以验证身份并获取访问 Token'}
                {mode === 'register' && '注册新账号，默认分配普通运维操作员 (operator) 权限'}
                {mode === 'forgot-password' && '通过验证预设密保安全问题重新设置访问密码'}
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex rounded-lg border border-ops-border bg-ops-bg/60 p-1 mb-4 shrink-0 text-xs font-mono">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm border border-ops-cyan/30'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              账号登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm border border-ops-cyan/30'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              用户注册
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot-password')}
              className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                mode === 'forgot-password'
                  ? 'bg-ops-surface text-ops-cyan shadow-sm border border-ops-cyan/30'
                  : 'text-ops-text-muted hover:text-white'
              }`}
            >
              忘记密码
            </button>
          </div>

          {/* Feedback Messages */}
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
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="font-mono">{successMsg}</span>
            </motion.div>
          )}

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto pr-1">
            {/* 1. LOGIN MODE */}
            {mode === 'login' && (
              <div className="space-y-4">
                {/* Tip Notice */}
                <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/30 p-3 text-xs text-cyan-200/90 leading-relaxed font-sans">
                  <span className="font-semibold text-ops-cyan">💡 初始管理员提示：</span>
                  管理员初始口令已在首次启动时于终端打印，默认管理员账号为{' '}
                  <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-white">admin</code>。
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                      用户名 / Username
                    </label>
                    <div className="relative flex items-center">
                      <User className="absolute left-3 h-4 w-4 text-ops-text-muted" />
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="admin"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-mono text-ops-text-muted">
                        密码 / Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot-password')}
                        className="text-xs font-mono text-ops-cyan hover:underline"
                      >
                        忘记密码？
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-4 w-4 text-ops-text-muted" />
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="请输入访问凭据密钥"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-10 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 text-ops-text-muted hover:text-white transition-colors"
                        aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

                  <div className="pt-2 text-center text-xs text-ops-text-muted">
                    还没有运维账号？{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className="font-semibold text-ops-cyan hover:underline"
                    >
                      立即注册新用户
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 2. REGISTER MODE */}
            {mode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      用户名 / Username <span className="text-red-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <User className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="例如: devops_john"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      真实姓名 / 昵称 (选填)
                    </label>
                    <input
                      type="text"
                      value={regNickname}
                      onChange={(e) => setRegNickname(e.target.value)}
                      placeholder="例如: 张三 (运维一组成员)"
                      disabled={loading}
                      className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-ops-text-muted mb-1">
                    电子邮箱 / Email (选填)
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="ops@company.com"
                      disabled={loading}
                      className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      设置登录密码 <span className="text-red-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="至少 6 位字符"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-8 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-2.5 text-ops-text-muted hover:text-white"
                      >
                        {showRegPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-ops-text-muted mb-1">
                      确认密码 <span className="text-red-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="重复输入密码"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none focus:ring-1 focus:ring-ops-cyan"
                      />
                    </div>
                  </div>
                </div>

                {/* Security Question Section */}
                <div className="rounded-xl border border-ops-border/80 bg-ops-bg/40 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ops-cyan font-mono">
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>密保安全验证设置（用于找回密码）</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-ops-text-muted mb-1">
                      选择密保安全问题 <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={selectedQuestion}
                      onChange={(e) => setSelectedQuestion(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-lg border border-ops-border bg-ops-surface px-3 py-1.5 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                    >
                      {PRESET_QUESTIONS.map((q) => (
                        <option key={q} value={q} className="bg-slate-900 text-white">
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedQuestion === '自定义密保问题...' && (
                    <div>
                      <label className="block text-[11px] font-mono text-ops-text-muted mb-1">
                        自定义密保安全问题 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={customQuestion}
                        onChange={(e) => setCustomQuestion(e.target.value)}
                        placeholder="例如: 您的大学室友名字是什么？"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-surface px-3 py-1.5 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-mono text-ops-text-muted mb-1">
                      密保问题答案 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={regAnswer}
                      onChange={(e) => setRegAnswer(e.target.value)}
                      placeholder="请准确牢记，找回密码时需完全匹配"
                      disabled={loading}
                      className="w-full rounded-lg border border-ops-border bg-ops-surface px-3 py-1.5 text-xs text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-ops-cyan px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors shadow-cyan-glow"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>正在创建运维账号...</span>
                    </>
                  ) : (
                    <span>立即注册并登录</span>
                  )}
                </button>

                <div className="text-center text-xs text-ops-text-muted">
                  已有平台账号？{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-ops-cyan hover:underline"
                  >
                    返回登录
                  </button>
                </div>
              </form>
            )}

            {/* 3. FORGOT PASSWORD MODE */}
            {mode === 'forgot-password' && (
              <div className="space-y-4">
                {/* Step 1: Input username and fetch question */}
                {!retrievedQuestion ? (
                  <form onSubmit={handleQueryQuestion} className="space-y-4">
                    <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-3 text-xs text-cyan-200/80 leading-relaxed">
                      第一步：请输入您的平台登录用户名，系统将检索您在注册时绑定的密保安全问题。
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-ops-text-muted mb-1.5">
                        目标用户名 / Target Username
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-3 h-4 w-4 text-ops-text-muted" />
                        <input
                          type="text"
                          value={forgotUsername}
                          onChange={(e) => setForgotUsername(e.target.value)}
                          placeholder="例如: devops_john"
                          disabled={queryingQuestion}
                          className="w-full rounded-lg border border-ops-border bg-ops-bg pl-9 pr-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 focus:border-ops-cyan focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={queryingQuestion}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-ops-cyan px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors shadow-cyan-glow"
                    >
                      {queryingQuestion ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>正在检索安全密保...</span>
                        </>
                      ) : (
                        <span>下一步：检索密保问题</span>
                      )}
                    </button>

                    <div className="text-center text-xs text-ops-text-muted">
                      记起密码了？{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="font-semibold text-ops-cyan hover:underline"
                      >
                        返回登录
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Answer question and reset password */
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-ops-text-muted">
                        当前找回账号: <strong className="text-white">{forgotUsername}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRetrievedQuestion(null);
                          setForgotAnswer('');
                        }}
                        className="text-xs font-mono text-ops-cyan hover:underline"
                      >
                        更换账号
                      </button>
                    </div>

                    <div className="rounded-xl border border-ops-cyan/30 bg-cyan-950/30 p-3.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-ops-cyan font-mono">
                        <HelpCircle className="h-4 w-4 shrink-0" />
                        <span>验证密保安全问题：</span>
                      </div>
                      <p className="text-xs text-white font-mono font-medium pl-5">
                        {retrievedQuestion}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-ops-text-muted mb-1">
                        请输入密保答案 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={forgotAnswer}
                        onChange={(e) => setForgotAnswer(e.target.value)}
                        placeholder="请输入注册时填写的密保答案"
                        disabled={loading}
                        className="w-full rounded-lg border border-ops-border bg-ops-bg px-3 py-1.5 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-mono text-ops-text-muted mb-1">
                          设定新密码 <span className="text-red-400">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                          <input
                            type={showForgotNewPassword ? 'text' : 'password'}
                            value={forgotNewPassword}
                            onChange={(e) => setForgotNewPassword(e.target.value)}
                            placeholder="至少 6 位字符"
                            disabled={loading}
                            className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-8 py-1.5 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                            className="absolute right-2.5 text-ops-text-muted hover:text-white"
                          >
                            {showForgotNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-ops-text-muted mb-1">
                          确认新密码 <span className="text-red-400">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-3.5 w-3.5 text-ops-text-muted" />
                          <input
                            type={showForgotNewPassword ? 'text' : 'password'}
                            value={forgotConfirmPassword}
                            onChange={(e) => setForgotConfirmPassword(e.target.value)}
                            placeholder="重复新密码"
                            disabled={loading}
                            className="w-full rounded-lg border border-ops-border bg-ops-bg pl-8 pr-3 py-1.5 text-xs text-white font-mono focus:border-ops-cyan focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-ops-cyan px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors shadow-cyan-glow"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>正在重置登录凭据...</span>
                        </>
                      ) : (
                        <span>确认重置并更新密码</span>
                      )}
                    </button>

                    <div className="text-center text-xs text-ops-text-muted">
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="inline-flex items-center gap-1 text-ops-cyan hover:underline"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>返回登录界面</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LoginModal;
