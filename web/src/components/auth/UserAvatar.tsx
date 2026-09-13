import React from 'react';
import {
  User,
  Zap,
  Terminal,
  Shield,
  Rocket,
  Bot,
  Coffee,
  Cpu,
} from 'lucide-react';

export interface PresetAvatar {
  id: string;
  name: string;
  title: string;
  desc: string;
  description: string;
  iconType: 'ops-chan' | 'zap' | 'terminal' | 'shield' | 'rocket' | 'bot' | 'coffee' | 'cpu';
  gradient: string;
  borderColor: string;
  textColor: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'preset:ops-chan',
    name: '喵小智',
    title: '喵小智',
    desc: 'OpsHub 机甲吉祥物',
    description: 'OpsHub 机甲吉祥物',
    iconType: 'ops-chan',
    gradient: 'from-cyan-950 via-slate-900 to-cyan-900',
    borderColor: 'border-cyan-400/50',
    textColor: 'text-cyan-400',
  },
  {
    id: 'preset:cyber-ninja',
    name: '赛博暗影',
    title: '赛博暗影',
    desc: '极速敏捷突击手',
    description: '极速敏捷突击手',
    iconType: 'zap',
    gradient: 'from-purple-950 via-slate-900 to-indigo-900',
    borderColor: 'border-purple-400/50',
    textColor: 'text-purple-400',
  },
  {
    id: 'preset:matrix-hacker',
    name: '极客代码',
    title: '极客代码',
    desc: '黑客终端专家',
    description: '黑客终端专家',
    iconType: 'terminal',
    gradient: 'from-emerald-950 via-slate-900 to-teal-900',
    borderColor: 'border-emerald-400/50',
    textColor: 'text-emerald-400',
  },
  {
    id: 'preset:shield-guard',
    name: '守护神盾',
    title: '守护神盾',
    desc: '集群安全捍卫者',
    description: '集群安全捍卫者',
    iconType: 'shield',
    gradient: 'from-blue-950 via-slate-900 to-sky-900',
    borderColor: 'border-sky-400/50',
    textColor: 'text-sky-400',
  },
  {
    id: 'preset:star-pilot',
    name: '星际领航',
    title: '星际领航',
    desc: '太空无畏探索者',
    description: '太空无畏探索者',
    iconType: 'rocket',
    gradient: 'from-amber-950 via-slate-900 to-orange-900',
    borderColor: 'border-amber-400/50',
    textColor: 'text-amber-400',
  },
  {
    id: 'preset:terminal-bot',
    name: '智械核心',
    title: '智械核心',
    desc: '高维人工智能',
    description: '高维人工智能',
    iconType: 'bot',
    gradient: 'from-rose-950 via-slate-900 to-pink-900',
    borderColor: 'border-rose-400/50',
    textColor: 'text-rose-400',
  },
  {
    id: 'preset:coffee-dev',
    name: '极客咖啡',
    title: '极客咖啡',
    desc: '代码动力燃料',
    description: '代码动力燃料',
    iconType: 'coffee',
    gradient: 'from-yellow-950 via-stone-900 to-amber-900',
    borderColor: 'border-yellow-400/50',
    textColor: 'text-yellow-400',
  },
  {
    id: 'preset:circuit-pulse',
    name: '量子计算',
    title: '量子计算',
    desc: '并发超频核心',
    description: '并发超频核心',
    iconType: 'cpu',
    gradient: 'from-teal-950 via-slate-900 to-cyan-900',
    borderColor: 'border-teal-400/50',
    textColor: 'text-teal-400',
  },
];

export interface UserAvatarProps {
  avatar?: string | null;
  nickname?: string;
  username?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showBadge?: boolean;
  role?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar,
  nickname,
  username,
  size = 'md',
  className = '',
  showBadge = false,
  role,
}) => {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs rounded-lg',
    md: 'h-10 w-10 text-sm rounded-xl',
    lg: 'h-14 w-14 text-base rounded-2xl',
    xl: 'h-20 w-20 text-xl rounded-2xl',
  }[size];

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
    xl: 'h-10 w-10',
  }[size];

  const trimmedAvatar = avatar?.trim();
  const isPreset = trimmedAvatar?.startsWith('preset:');
  const isCustomImage =
    trimmedAvatar && (trimmedAvatar.startsWith('data:image/') || trimmedAvatar.startsWith('http://') || trimmedAvatar.startsWith('https://'));

  const matchedPreset = isPreset
    ? PRESET_AVATARS.find((p) => p.id === trimmedAvatar) || PRESET_AVATARS[0]
    : null;

  const renderPresetIcon = (iconType: PresetAvatar['iconType']) => {
    switch (iconType) {
      case 'ops-chan':
        return (
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizes} drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]`}
          >
            {/* Cat ears */}
            <path d="M24 38 L34 16 L44 32 Z" fill="#1E293B" stroke="#06B6D4" strokeWidth="3" />
            <path d="M28 35 L34 22 L40 31 Z" fill="#F472B6" />
            <path d="M76 38 L66 16 L56 32 Z" fill="#1E293B" stroke="#06B6D4" strokeWidth="3" />
            <path d="M72 35 L66 22 L60 31 Z" fill="#F472B6" />
            {/* Robot Head */}
            <rect x="20" y="28" width="60" height="48" rx="20" fill="#0F172A" stroke="#38BDF8" strokeWidth="3.5" />
            <rect x="26" y="35" width="48" height="34" rx="14" fill="#050914" stroke="#1E293B" strokeWidth="1.5" />
            {/* Cheeks */}
            <circle cx="33" cy="56" r="3.5" fill="#FB7185" opacity="0.8" />
            <circle cx="67" cy="56" r="3.5" fill="#FB7185" opacity="0.8" />
            {/* Eyes & mouth */}
            <circle cx="37" cy="46" r="3.5" fill="#38BDF8" />
            <circle cx="63" cy="46" r="3.5" fill="#38BDF8" />
            <path d="M46 54 Q48 57 50 54 Q52 57 54 54" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        );
      case 'zap':
        return <Zap className={`${iconSizes} fill-purple-400/20`} />;
      case 'terminal':
        return <Terminal className={`${iconSizes}`} />;
      case 'shield':
        return <Shield className={`${iconSizes} fill-sky-400/20`} />;
      case 'rocket':
        return <Rocket className={`${iconSizes} fill-amber-400/20`} />;
      case 'bot':
        return <Bot className={`${iconSizes} fill-rose-400/20`} />;
      case 'coffee':
        return <Coffee className={`${iconSizes} fill-yellow-400/20`} />;
      case 'cpu':
        return <Cpu className={`${iconSizes} fill-teal-400/20`} />;
      default:
        return <User className={iconSizes} />;
    }
  };

  return (
    <div
      data-testid="user-avatar"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border font-mono font-bold select-none transition-all shadow-sm ${sizeClasses} ${
        isCustomImage
          ? 'border-ops-cyan/40 bg-ops-bg'
          : matchedPreset
          ? `bg-gradient-to-br ${matchedPreset.gradient} ${matchedPreset.borderColor} ${matchedPreset.textColor}`
          : 'bg-gradient-to-br from-cyan-900/80 via-slate-900 to-slate-800 border-ops-cyan/40 text-ops-cyan'
      } ${className}`}
    >
      {isCustomImage ? (
        <img
          src={trimmedAvatar}
          alt={nickname || username || 'Avatar'}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Fallback to default user icon on image load failure
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : matchedPreset ? (
        renderPresetIcon(matchedPreset.iconType)
      ) : (
        <User className={iconSizes} />
      )}

      {/* Role Badge Indicator */}
      {showBadge && (
        <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ops-bg border border-ops-border shadow">
          {role === 'admin' ? (
            <Shield className="h-2.5 w-2.5 text-amber-400 fill-amber-400/30" />
          ) : (
            <Shield className="h-2.5 w-2.5 text-ops-cyan fill-cyan-400/30" />
          )}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
