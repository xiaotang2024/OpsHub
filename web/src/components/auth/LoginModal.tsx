import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
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
import { toast } from 'sonner';
import { InteractiveCanvasBackground } from './InteractiveCanvasBackground';
import { AnimatedGradientBackground } from './AnimatedGradientBackground';
import { AnimatedCharacters } from './AnimatedCharacters';
import { InteractiveHoverButton } from '../ui/InteractiveHoverButton';
import { OpsHubLogo } from '../common/OpsHubLogo';

export type AuthMode = 'login' | 'register' | 'forgot-password';

export interface LoginThemeConfig {
  id: string;
  name: string;
  character: string;
  badgeLabel: string;
  bgGradient: string;
  glowOrbs: {
    className: string;
  }[];
  particleColors: string[];
  gradientVariant: 'cyber' | 'celadon-blue' | 'sunset' | 'emerald' | 'tactical-light';
  cardBorder: string;
  cardShadow: string;
  topAccentGradient: string;
  leftPanelBg: string;
  leftPanelBorder: string;
  brandIconBg: string;
  brandIconBorder: string;
  brandIconText: string;
  brandBadgeBg: string;
  brandBadgeBorder: string;
  brandBadgeText: string;
  footerAccentText: string;
  rightPanelBg: string;
  tabActiveBg: string;
  tabActiveText: string;
  tabActiveBorder: string;
  tabIndicatorIconBg: string;
  tabIndicatorIconBorder: string;
  tabIndicatorIconText: string;
  tipNoticeBg: string;
  tipNoticeBorder: string;
  tipNoticeText: string;
  tipNoticeHighlight: string;
  inputFocusBorder: string;
  inputFocusRing: string;
  submitButtonGradient: string;
  accentText: string;
  secQuestionBg: string;
  secQuestionBorder: string;
}

export const TACTICAL_LIGHT_LOGIN_THEME: LoginThemeConfig = {
  id: 'tactical-light',
  name: '战术光棱',
  character: '战术光棱',
  badgeLabel: '战术光棱 · 极昼控制台',
  bgGradient: 'from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0]',
  glowOrbs: [
    { className: '-top-36 -left-36 w-[540px] h-[540px] bg-[#00687a]/10 blur-[130px]' },
    { className: '-bottom-36 -right-36 w-[600px] h-[600px] bg-[#06b6d4]/12 blur-[140px]' },
    { className: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] bg-[#006c49]/8 blur-[160px]' },
  ],
  particleColors: ['#00687a', '#008ba3', '#006c49', '#64748b', '#0891b2'],
  gradientVariant: 'tactical-light',
  cardBorder: 'border-slate-200/90',
  cardShadow: 'shadow-[0_20px_60px_rgba(15,23,42,0.08),0_1px_3px_rgba(0,0,0,0.05)]',
  topAccentGradient: 'from-[#00687a] via-[#06b6d4] to-[#006c49]',
  leftPanelBg: 'from-[#f8fafc] to-[#f1f5f9]',
  leftPanelBorder: 'border-slate-200/80',
  brandIconBg: 'bg-white',
  brandIconBorder: 'border-[#00687a]/20',
  brandIconText: 'text-[#00687a]',
  brandBadgeBg: 'bg-[#00687a]/10',
  brandBadgeBorder: 'border-[#00687a]/25',
  brandBadgeText: 'text-[#00687a]',
  footerAccentText: 'text-[#00687a]',
  rightPanelBg: 'from-white via-[#fcfdff] to-[#f8fafc]',
  tabActiveBg: 'bg-white',
  tabActiveText: 'text-[#00687a]',
  tabActiveBorder: 'border-slate-200/80',
  tabIndicatorIconBg: 'bg-[#00687a]/10',
  tabIndicatorIconBorder: 'border-[#00687a]/20',
  tabIndicatorIconText: 'text-[#00687a]',
  tipNoticeBg: 'from-cyan-50/80 to-blue-50/60',
  tipNoticeBorder: 'border-cyan-200',
  tipNoticeText: 'text-cyan-950',
  tipNoticeHighlight: 'text-[#00687a]',
  inputFocusBorder: 'focus:border-[#00687a]',
  inputFocusRing: 'focus:ring-[#00687a]/30',
  submitButtonGradient: 'bg-gradient-to-r from-[#00687a] to-[#0891b2] hover:from-[#005a6b] hover:to-[#00687a]',
  accentText: 'text-[#00687a]',
  secQuestionBg: 'bg-slate-50',
  secQuestionBorder: 'border-slate-200',
};

export const LOGIN_THEMES: LoginThemeConfig[] = [TACTICAL_LIGHT_LOGIN_THEME];

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
  const currentTheme = TACTICAL_LIGHT_LOGIN_THEME;

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

  // Animated Characters interactive states
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerTyping = () => {
    setIsTyping(true);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 900);
  };

  const activeShowPassword =
    mode === 'login'
      ? showLoginPassword
      : mode === 'register'
      ? showRegPassword
      : showForgotNewPassword;

  const activePasswordLength =
    mode === 'login'
      ? loginPassword.length
      : mode === 'register'
      ? regPassword.length
      : forgotNewPassword.length;

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

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
        toast.success('登录成功，欢迎回来！');
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

      setSuccessMsg('注册成功！正在为您自动登录系统...');
      toast.success('注册成功！正在为您自动登录系统...');
      if (res && res.token) {
        localStorage.setItem('opshub_token', res.token);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('opshub:authenticated', {
              detail: { username: res.user?.username || regUsername.trim(), user: res.user },
            })
          );
        }
        setTimeout(() => {
          if (onSuccess) {
            onSuccess(res.token, res.user?.username || regUsername.trim());
          }
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || '注册失败，该用户名可能已被占用');
    } finally {
      setLoading(false);
    }
  };

  // 3. Forgot Password - Step 1: Query Security Question
  const handleQueryQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setError('请输入需要找回密码的用户名');
      return;
    }

    try {
      setQueryingQuestion(true);
      setError(null);
      const res = await api.getSecurityQuestion(forgotUsername.trim());
      if (res && res.security_question) {
        setRetrievedQuestion(res.security_question);
      } else {
        setError('该用户尚未设置安全密保问题，请联系系统超级管理员进行离线口令重置');
      }
    } catch (err: any) {
      setError(err.message || '未找到该用户或密保信息');
    } finally {
      setQueryingQuestion(false);
    }
  };

  // 4. Forgot Password - Step 2: Reset Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotAnswer.trim()) {
      setError('请输入密保安全问题答案');
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
      toast.success('密码重置成功！请使用新密码重新登录');
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
      <div
        data-testid="login-modal-root"
        className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-gradient-to-br ${currentTheme.bgGradient} transition-colors duration-700`}
      >
        {/* Dynamic Ambient Glowing Lights */}
        <div className={`fixed rounded-full pointer-events-none transition-all duration-700 ${currentTheme.glowOrbs[0].className}`} />
        <div className={`fixed rounded-full pointer-events-none transition-all duration-700 ${currentTheme.glowOrbs[1].className}`} />
        <div className={`fixed rounded-full pointer-events-none transition-all duration-700 ${currentTheme.glowOrbs[2].className}`} />

        {/* Dynamic Interactive Constellation Background (Transparent overlay) */}
        <InteractiveCanvasBackground transparent={true} particleColors={currentTheme.particleColors} />

        {/* Subtle Semi-transparent Backdrop overlay for depth */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (canDismiss && onClose) onClose();
          }}
          className="fixed inset-0 bg-slate-900/10 backdrop-blur-[1px]"
        />

        {/* Dual-Panel Split Modal Card */}
        <div className="relative w-full max-w-5xl z-10 my-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`relative w-full overflow-hidden rounded-2xl border ${currentTheme.cardBorder} bg-white/95 backdrop-blur-2xl ${currentTheme.cardShadow} grid grid-cols-1 lg:grid-cols-12 max-h-[92vh] transition-all duration-500`}
          >
            {/* Top Accent Gradient Border */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${currentTheme.topAccentGradient} z-30 transition-all duration-500`} />

            {/* Close button if dismissible */}
            {canDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors z-40"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* ================= LEFT PANEL: CareerCompass 4-Character Stage ================= */}
            <div className={`relative hidden lg:flex lg:col-span-5 flex-col justify-between p-8 overflow-hidden bg-gradient-to-b ${currentTheme.leftPanelBg} border-r ${currentTheme.leftPanelBorder} select-none transition-colors duration-500`}>
              {/* Dynamic Breathing Gradient Background with Tech Grid */}
              <AnimatedGradientBackground showGrid={true} variant={currentTheme.gradientVariant} />

              {/* Brand Header */}
              <div className="relative z-20 flex items-center gap-3">
                <OpsHubLogo size="lg" showGlow={false} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-slate-900 tracking-wide">OpsHub Gateway</span>
                    <span className={`rounded ${currentTheme.brandBadgeBg} px-1.5 py-0.5 text-[10px] font-mono ${currentTheme.brandBadgeText} border ${currentTheme.brandBadgeBorder}`}>
                      v1.0
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">企业级轻量自动化运维平台</p>
                </div>
              </div>

              {/* Character Stage: 4 Interactive Characters */}
              <div className="relative z-20 flex-1 flex items-end justify-center min-h-[350px] pb-2">
                <AnimatedCharacters
                  isTyping={isTyping}
                  showPassword={activeShowPassword}
                  passwordLength={activePasswordLength}
                  scale={0.82}
                />
              </div>

              {/* Footer interactive hints */}
              <div className="relative z-20 flex items-center justify-between text-xs text-slate-500 font-mono border-t border-slate-200/80 pt-3.5">
                <div className={`flex items-center gap-1.5 ${currentTheme.footerAccentText} transition-colors duration-300`}>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{currentTheme.badgeLabel}</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">OpsHub Control Plane</span>
              </div>
            </div>

            {/* ================= RIGHT PANEL: Form Controls & Switcher ================= */}
            <div className={`col-span-1 lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto max-h-[92vh] bg-gradient-to-b ${currentTheme.rightPanelBg} transition-colors duration-500`}>
              {/* Mobile compact character stage */}
              <div className={`lg:hidden relative mb-4 flex items-end justify-center h-[170px] overflow-hidden rounded-xl bg-gradient-to-b ${currentTheme.leftPanelBg} border ${currentTheme.brandIconBorder}`}>
                <AnimatedGradientBackground showGrid={false} variant={currentTheme.gradientVariant} />
                <div className="relative z-10">
                  <AnimatedCharacters
                    isTyping={isTyping}
                    showPassword={activeShowPassword}
                    passwordLength={activePasswordLength}
                    scale={0.44}
                  />
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${currentTheme.tabIndicatorIconBg} border ${currentTheme.tabIndicatorIconBorder} ${currentTheme.tabIndicatorIconText} shadow-sm transition-colors duration-300`}>
                    {mode === 'login' && <Terminal className="h-4 w-4" />}
                    {mode === 'register' && <UserPlus className="h-4 w-4" />}
                    {mode === 'forgot-password' && <KeyRound className="h-4 w-4" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-wide">
                      {mode === 'login' && 'OpsHub 控制台登录'}
                      {mode === 'register' && '注册 OpsHub 账号'}
                      {mode === 'forgot-password' && '重置与找回密码'}
                    </h2>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      mode === 'login'
                        ? `${currentTheme.tabActiveBg} ${currentTheme.tabActiveText} font-bold border ${currentTheme.tabActiveBorder} shadow-sm`
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      mode === 'register'
                        ? `${currentTheme.tabActiveBg} ${currentTheme.tabActiveText} font-bold border ${currentTheme.tabActiveBorder} shadow-sm`
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    用户注册
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot-password')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      mode === 'forgot-password'
                        ? `${currentTheme.tabActiveBg} ${currentTheme.tabActiveText} font-bold border ${currentTheme.tabActiveBorder} shadow-sm`
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    忘记密码
                  </button>
                </div>
              </div>

              {/* Alert Feedback Messages */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 shrink-0"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="font-mono">{error}</span>
                </motion.div>
              )}

              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700 shrink-0"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="font-mono">{successMsg}</span>
                </motion.div>
              )}

              {/* Scrollable Form Area */}
              <div className="flex-1 overflow-y-auto pr-1">
                {/* 1. LOGIN MODE */}
                {mode === 'login' && (
                  <div className="space-y-4">
                    {/* Tip Notice */}
                    <div className={`rounded-lg border ${currentTheme.tipNoticeBorder} bg-gradient-to-r ${currentTheme.tipNoticeBg} p-3 text-xs ${currentTheme.tipNoticeText} leading-relaxed font-sans shadow-sm transition-all duration-300`}>
                      <span className={`font-semibold ${currentTheme.tipNoticeHighlight}`}>💡 初始管理员提示：</span>
                      管理员初始口令已在首次启动时于终端打印，默认管理员账号为{' '}
                      <code className="rounded bg-cyan-100/90 px-1 py-0.5 font-mono text-[#00687a]">admin</code>。
                    </div>

                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      <div>
                        <label className="block text-xs font-mono text-slate-600 mb-1.5">
                          用户名 / Username
                        </label>
                        <div className="relative flex items-center">
                          <User className="absolute left-3 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            value={loginUsername}
                            onChange={(e) => {
                              setLoginUsername(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="admin"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-sm text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing} transition-colors`}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-mono text-slate-600">
                            密码 / Password
                          </label>
                          <button
                            type="button"
                            onClick={() => switchMode('forgot-password')}
                            className={`text-xs font-mono ${currentTheme.accentText} hover:underline`}
                          >
                            忘记密码？
                          </button>
                        </div>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-4 w-4 text-slate-400" />
                          <input
                            type={showLoginPassword ? 'text' : 'password'}
                            value={loginPassword}
                            onChange={(e) => {
                              setLoginPassword(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="请输入访问凭据密钥"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-9 pr-10 py-2 text-sm text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing} transition-colors`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="absolute right-3 text-slate-400 hover:text-slate-700 transition-colors"
                            aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                          >
                            {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <InteractiveHoverButton
                        type="submit"
                        loading={loading}
                        text="确认登录 / Login"
                        className={`mt-3 ${currentTheme.submitButtonGradient} font-semibold text-white shadow-md shadow-[#00687a]/20 transition-all duration-300`}
                      />

                      <div className="pt-2 text-center text-xs text-slate-500">
                        还没有运维账号？{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('register')}
                          className={`font-semibold ${currentTheme.accentText} hover:underline`}
                        >
                          立即注册新用户
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* 2. REGISTER MODE */}
                {mode === 'register' && (
                  <form onSubmit={handleRegisterSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-mono text-slate-600 mb-1">
                          用户名 / Username <span className="text-red-500">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <User className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            value={regUsername}
                            onChange={(e) => {
                              setRegUsername(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="例如: devops_john"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-slate-600 mb-1">
                          真实姓名 / 昵称 (选填)
                        </label>
                        <input
                          type="text"
                          value={regNickname}
                          onChange={(e) => {
                            setRegNickname(e.target.value);
                            triggerTyping();
                          }}
                          placeholder="例如: 张三"
                          disabled={loading}
                          className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-600 mb-1">
                        电子邮箱 / Email (选填)
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => {
                            setRegEmail(e.target.value);
                            triggerTyping();
                          }}
                          placeholder="ops@company.com"
                          disabled={loading}
                          className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-mono text-slate-600 mb-1">
                          设置登录密码 <span className="text-red-500">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type={showRegPassword ? 'text' : 'password'}
                            value={regPassword}
                            onChange={(e) => {
                              setRegPassword(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="至少 6 位字符"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-8 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-700"
                          >
                            {showRegPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-slate-600 mb-1">
                          确认密码 <span className="text-red-500">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <Lock className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type={showRegPassword ? 'text' : 'password'}
                            value={regConfirmPassword}
                            onChange={(e) => {
                              setRegConfirmPassword(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="重复输入密码"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Security Question Section */}
                    <div className={`rounded-xl border ${currentTheme.secQuestionBorder} ${currentTheme.secQuestionBg} p-3 space-y-2.5 transition-colors duration-300`}>
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${currentTheme.accentText} font-mono`}>
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>密保安全验证设置（用于找回密码）</span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-slate-600 mb-1">
                          选择密保安全问题 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={selectedQuestion}
                          onChange={(e) => setSelectedQuestion(e.target.value)}
                          disabled={loading}
                          className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 font-mono ${currentTheme.inputFocusBorder} focus:outline-none`}
                        >
                          {PRESET_QUESTIONS.map((q) => (
                            <option key={q} value={q} className="bg-white text-slate-900">
                              {q}
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedQuestion === '自定义密保问题...' && (
                        <div>
                          <label className="block text-[11px] font-mono text-slate-600 mb-1">
                            自定义密保安全问题 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={customQuestion}
                            onChange={(e) => {
                              setCustomQuestion(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="例如: 您的大学室友名字是什么？"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 font-mono ${currentTheme.inputFocusBorder} focus:outline-none`}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-mono text-slate-600 mb-1">
                          密保问题答案 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={regAnswer}
                          onChange={(e) => {
                            setRegAnswer(e.target.value);
                            triggerTyping();
                          }}
                          placeholder="请准确牢记，答案区分大小写"
                          disabled={loading}
                          className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:outline-none`}
                        />
                      </div>
                    </div>

                    <InteractiveHoverButton
                      type="submit"
                      loading={loading}
                      text="立即注册并登录 / Register"
                      className={`mt-2 ${currentTheme.submitButtonGradient} font-semibold text-white shadow-md shadow-[#00687a]/20 transition-all duration-300`}
                    />

                    <div className="text-center text-xs text-slate-500 pt-1">
                      已有账号？{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className={`font-semibold ${currentTheme.accentText} hover:underline`}
                      >
                        直接登录
                      </button>
                    </div>
                  </form>
                )}

                {/* 3. FORGOT PASSWORD MODE */}
                {mode === 'forgot-password' && (
                  <div className="space-y-3.5">
                    {!retrievedQuestion ? (
                      /* Step 1: Query username's security question */
                      <form onSubmit={handleQueryQuestion} className="space-y-3.5">
                        <div className={`rounded-lg border ${currentTheme.tipNoticeBorder} bg-gradient-to-r ${currentTheme.tipNoticeBg} p-3 text-xs ${currentTheme.tipNoticeText} leading-relaxed font-sans`}>
                          请输入您注册时填写的账号用户名。系统将检索该账号绑定的安全密保问题，验证正确后即可直接重置密码。
                        </div>

                        <div>
                          <label className="block text-xs font-mono text-slate-600 mb-1">
                            找回账号的用户名 / Username <span className="text-red-500">*</span>
                          </label>
                          <div className="relative flex items-center">
                            <User className="absolute left-3 h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              value={forgotUsername}
                              onChange={(e) => {
                                setForgotUsername(e.target.value);
                                triggerTyping();
                              }}
                              placeholder="例如: devops_john"
                              disabled={queryingQuestion}
                              className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none focus:ring-1 ${currentTheme.inputFocusRing}`}
                            />
                          </div>
                        </div>

                        <InteractiveHoverButton
                          type="submit"
                          loading={queryingQuestion}
                          text="检索密保问题"
                          className={`mt-2 ${currentTheme.submitButtonGradient} font-semibold text-white shadow-md shadow-[#00687a]/20 transition-all duration-300`}
                        />

                        <div className="text-center text-xs text-slate-500 pt-2">
                          想起密码了？{' '}
                          <button
                            type="button"
                            onClick={() => switchMode('login')}
                            className={`font-semibold ${currentTheme.accentText} hover:underline`}
                          >
                            返回登录
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Step 2: Answer question and reset password */
                      <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
                        <div className="flex items-center justify-between pb-1">
                          <span className={`text-xs font-mono ${currentTheme.accentText}`}>
                            当前账号: <span className="text-slate-900 font-semibold">{forgotUsername}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRetrievedQuestion(null)}
                            className="flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-slate-800"
                          >
                            <ArrowLeft className="h-3 w-3" />
                            重新输入账号
                          </button>
                        </div>

                        {/* Retrieved Question Box */}
                        <div className={`rounded-xl border ${currentTheme.secQuestionBorder} ${currentTheme.secQuestionBg} p-3 space-y-1 transition-colors duration-300`}>
                          <div className={`flex items-center gap-1.5 text-xs ${currentTheme.accentText} font-mono font-semibold`}>
                            <HelpCircle className="h-3.5 w-3.5" />
                            <span>密保安全问题:</span>
                          </div>
                          <div className="text-sm text-slate-900 font-medium font-sans pl-5">{retrievedQuestion}</div>
                        </div>

                        <div>
                          <label className="block text-xs font-mono text-slate-600 mb-1">
                            密保问题答案 / Security Answer <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={forgotAnswer}
                            onChange={(e) => {
                              setForgotAnswer(e.target.value);
                              triggerTyping();
                            }}
                            placeholder="请输入注册时填写的密保答案"
                            disabled={loading}
                            className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none`}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-mono text-slate-600 mb-1">
                              设置新密码 <span className="text-red-500">*</span>
                            </label>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                              <input
                                type={showForgotNewPassword ? 'text' : 'password'}
                                value={forgotNewPassword}
                                onChange={(e) => {
                                  setForgotNewPassword(e.target.value);
                                  triggerTyping();
                                }}
                                placeholder="至少 6 位字符"
                                disabled={loading}
                                className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-8 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                                className="absolute right-2.5 text-slate-400 hover:text-slate-700"
                              >
                                {showForgotNewPassword ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-mono text-slate-600 mb-1">
                              确认新密码 <span className="text-red-500">*</span>
                            </label>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                              <input
                                type={showForgotNewPassword ? 'text' : 'password'}
                                value={forgotConfirmPassword}
                                onChange={(e) => {
                                  setForgotConfirmPassword(e.target.value);
                                  triggerTyping();
                                }}
                                placeholder="重复新密码"
                                disabled={loading}
                                className={`w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 ${currentTheme.inputFocusBorder} focus:bg-white focus:outline-none`}
                              />
                            </div>
                          </div>
                        </div>

                        <InteractiveHoverButton
                          type="submit"
                          loading={loading}
                          text="确认重置并更新密码"
                          className={`mt-2 ${currentTheme.submitButtonGradient} font-semibold text-white shadow-md shadow-[#00687a]/20 transition-all duration-300`}
                        />
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default LoginModal;
