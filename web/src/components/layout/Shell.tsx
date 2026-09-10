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
  Sparkles,
  Clock,
  LogOut,
  User,
} from 'lucide-react';

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

  const currentNav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
  const activeTitle = currentNav ? currentNav.name : '控制台';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0F17] text-[#F8FAFC] font-sans antialiased">
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#1E293B] bg-[#131B2A]/95 backdrop-blur-md transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/60 border border-[#06B6D4]/40 text-[#06B6D4] shadow-[0_0_12px_rgba(6,182,212,0.25)]">
              <Terminal className="h-5 w-5" />
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#10B981] animate-ping" />
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#10B981]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-wider text-white">OpsHub</span>
                <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#06B6D4] border border-[#06B6D4]/30">
                  v1.0
                </span>
              </div>
              <span className="text-[10px] text-[#94A3B8] font-mono tracking-tight">
                极简高性能运维引擎
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white md:hidden"
            aria-label="关闭侧边栏"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live System Indicator */}
        <div className="mx-3 mt-4 mb-2 rounded-lg border border-[#1E293B] bg-[#0B0F17]/70 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]"></span>
              </span>
              <span className="font-mono text-[11px] text-[#10B981] font-medium tracking-wide">
                系统正常 · SYSTEM NORMAL
              </span>
            </div>
            <Activity className="h-3.5 w-3.5 text-[#10B981]" />
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="px-2 pb-1.5 pt-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#94A3B8]">
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
                      ? 'bg-[#06B6D4]/10 text-white border border-[#06B6D4]/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'text-[#94A3B8] hover:bg-[#1E293B]/60 hover:text-[#CBD5E1] border border-transparent'
                  }`;
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition-colors duration-200 ${
                      isActive ? 'text-[#06B6D4]' : 'text-[#94A3B8] group-hover:text-white'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#94A3B8]/60 group-hover:text-[#94A3B8]">
                    {item.nameEn}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="h-1.5 w-1.5 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]"
                    />
                  )}
                </div>
              </NavLink>
            );
          })}
        </div>

        {/* User profile & session footer */}
        <div className="border-t border-[#1E293B] p-3 bg-[#0B0F17]/50">
          <div className="flex items-center justify-between rounded-lg border border-[#1E293B] bg-[#131B2A] p-2.5 hover:border-[#334155] transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-900 to-slate-800 text-[#06B6D4] border border-[#06B6D4]/30">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">运维管理员</span>
                <span className="font-mono text-[10px] text-[#06B6D4]">Ops Admin</span>
              </div>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-[#10B981]" title="在线" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top App Header */}
        <header className="flex h-16 items-center justify-between border-b border-[#1E293B] bg-[#131B2A]/60 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-white md:hidden"
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#94A3B8] hover:text-white transition-colors">平台控制台</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />
              <span className="font-medium text-white">{activeTitle}</span>
            </div>
          </div>

          {/* Right Header Quick Stats & Clock */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 rounded-md border border-[#1E293B] bg-[#0B0F17]/80 px-2.5 py-1 text-xs font-mono text-[#94A3B8]">
              <Clock className="h-3.5 w-3.5 text-[#06B6D4]" />
              <span>{currentTime || '00:00:00'}</span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-mono text-[#10B981]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
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
          className="flex-1 overflow-auto bg-[#0B0F17] p-4 md:p-6"
        >
          {children || <Outlet />}
        </motion.main>
      </div>
    </div>
  );
};

export default Shell;
