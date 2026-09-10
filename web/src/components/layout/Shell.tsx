import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  FileCode2,
  Cpu,
  ShieldCheck,
  Terminal,
  Activity,
  Menu,
  X,
  ChevronRight,
  Clock,
  User,
  LogOut,
} from 'lucide-react';
import { LoginModal } from '../auth/LoginModal';
import { api } from '../../api';

interface ShellProps {
  children?: React.ReactNode;
}

interface NavItem {
  name: string;
  nameEn: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: '服务列表', nameEn: 'Services', path: '/services', icon: Layers },
  { name: '部署模板', nameEn: 'Templates', path: '/templates', icon: FileCode2 },
  { name: 'JDK 资产', nameEn: 'JDKs', path: '/jdks', icon: Cpu },
  { name: '审计日志', nameEn: 'Audit', path: '/audit', icon: ShieldCheck },
];

export const Shell: React.FC<ShellProps> = ({ children }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('opshub_username') || (localStorage.getItem('opshub_token') ? 'admin' : null);
  });
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('opshub_token');
    if (!token) {
      setIsLoginOpen(true);
    } else {
      api
        .getMe()
        .then((user) => {
          if (user && user.username) {
            setCurrentUser(user.username);
            localStorage.setItem('opshub_username', user.username);
          }
        })
        .catch(() => {
          setIsLoginOpen(true);
        });
    }

    const handleUnauthorized = () => {
      localStorage.removeItem('opshub_token');
      setCurrentUser(null);
      setIsLoginOpen(true);
    };

    const handleAuthenticated = (e: any) => {
      const u = e.detail?.username || 'admin';
      setCurrentUser(u);
      localStorage.setItem('opshub_username', u);
      setIsLoginOpen(false);
    };

    window.addEventListener('opshub:unauthorized', handleUnauthorized);
    window.addEventListener('opshub:authenticated', handleAuthenticated);
    return () => {
      window.removeEventListener('opshub:unauthorized', handleUnauthorized);
      window.removeEventListener('opshub:authenticated', handleAuthenticated);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('opshub_token');
    localStorage.removeItem('opshub_username');
    setCurrentUser(null);
    setIsLoginOpen(true);
  };

  const currentNav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
  const activeTitle = currentNav ? currentNav.name : '控制台';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ops-bg text-ops-text-main font-sans antialiased">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ops-border bg-ops-surface/95 backdrop-blur-md transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-ops-border">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/60 border border-ops-cyan/40 text-ops-cyan shadow-cyan-glow">
              <Terminal className="h-5 w-5" />
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-ops-emerald animate-ping" />
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-ops-emerald" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-wider text-white">OpsHub</span>
                <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-ops-cyan border border-ops-cyan/30">
                  v1.0
                </span>
              </div>
              <span className="text-[10px] text-ops-text-muted font-mono tracking-tight">
                极简高性能运维引擎
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-ops-text-muted hover:bg-ops-border hover:text-white md:hidden"
            aria-label="关闭侧边栏"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live System Indicator */}
        <div className="mx-3 mt-4 mb-2 rounded-lg border border-ops-border bg-ops-bg/70 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ops-emerald opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-ops-emerald"></span>
              </span>
              <span className="font-mono text-[11px] text-ops-emerald font-medium tracking-wide">
                系统正常 · SYSTEM NORMAL
              </span>
            </div>
            <Activity className="h-3.5 w-3.5 text-ops-emerald" />
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-2 pb-1.5 pt-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-ops-text-muted">
            控制中心 / NAVIGATION
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive: navActive }) => {
                  const active = navActive || isActive;
                  return `group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-ops-cyan/10 text-white border border-ops-cyan/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'text-ops-text-muted hover:bg-ops-border/60 hover:text-ops-text-sub border border-transparent'
                  }`;
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition-colors duration-200 ${
                      isActive ? 'text-ops-cyan' : 'text-ops-text-muted group-hover:text-white'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-ops-text-muted/60 group-hover:text-ops-text-muted">
                    {item.nameEn}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="h-1.5 w-1.5 rounded-full bg-ops-cyan shadow-[0_0_6px_#06B6D4]"
                    />
                  )}
                </div>
              </NavLink>
            );
          })}
        </div>

        {/* User profile & session footer */}
        <div className="border-t border-ops-border p-3 bg-ops-bg/50">
          <div className="flex items-center justify-between rounded-lg border border-ops-border bg-ops-surface p-2.5 hover:border-ops-border-hover transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-900 to-slate-800 text-ops-cyan border border-ops-cyan/30">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">运维管理员</span>
                <span className="font-mono text-[10px] text-ops-cyan">
                  {currentUser ? `Ops Admin (${currentUser})` : 'Ops Admin'}
                </span>
              </div>
            </div>
            {currentUser ? (
              <button
                type="button"
                onClick={handleLogout}
                title="退出登录"
                className="rounded p-1 text-ops-text-muted hover:bg-red-950/50 hover:text-red-400 transition-colors"
                aria-label="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="text-[11px] font-mono text-ops-cyan hover:underline"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top App Header */}
        <header className="flex h-16 items-center justify-between border-b border-ops-border bg-ops-surface/60 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-ops-text-muted hover:bg-ops-border hover:text-white md:hidden"
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ops-text-muted hover:text-white transition-colors">平台控制台</span>
              <ChevronRight className="h-3.5 w-3.5 text-ops-text-muted" />
              <span className="font-medium text-white">{activeTitle}</span>
            </div>
          </div>

          {/* Right Header Quick Stats & Clock */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 rounded-md border border-ops-border bg-ops-bg/80 px-2.5 py-1 text-xs font-mono text-ops-text-muted">
              <Clock className="h-3.5 w-3.5 text-ops-cyan" />
              <span>{currentTime || '00:00:00'}</span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-ops-emerald/30 bg-ops-emerald/10 px-3 py-1 text-xs font-mono text-ops-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-ops-emerald animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content with Framer Motion Transition */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex-1 overflow-auto bg-ops-bg p-4 md:p-6"
        >
          {children || <Outlet />}
        </motion.main>
      </div>

      {/* Global Login Authentication Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        canDismiss={!!currentUser}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={(token, username) => {
          setCurrentUser(username);
          setIsLoginOpen(false);
        }}
      />
    </div>
  );
};

export default Shell;
