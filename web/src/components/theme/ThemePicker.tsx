import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Check } from 'lucide-react';

export type ThemeId = 'default' | 'celadon-blue' | 'purple-tea';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  nameEn: string;
  desc: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'default',
    name: '极客暗夜',
    nameEn: 'Cyber Slate',
    desc: '经典暗夜青蓝 · 极客纯黑',
    colors: {
      primary: '#06B6D4',
      secondary: '#10B981',
      accent: '#1E293B',
    },
  },
  {
    id: 'celadon-blue',
    name: '天水雾蓝',
    nameEn: 'Mist & Celadon',
    desc: '天水碧 · 雾蓝 · 鲸灰',
    colors: {
      primary: '#5fa3b0', // 天水碧
      secondary: '#2d5678', // 雾蓝
      accent: '#475061', // 鲸灰
    },
  },
  {
    id: 'purple-tea',
    name: '木紫茶岩',
    nameEn: 'Wood & Terracotta',
    desc: '木紫 · 茶色 · 熔岩灰',
    colors: {
      primary: '#aa5140', // 茶色
      secondary: '#4b4e72', // 木紫
      accent: '#606165', // 熔岩灰
    },
  },
];

export const ThemePicker: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('opshub_theme') as ThemeId;
      if (saved && (saved === 'default' || saved === 'celadon-blue' || saved === 'purple-tea')) {
        return saved;
      }
    }
    return 'default';
  });

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const applyTheme = (themeId: ThemeId) => {
    setCurrentTheme(themeId);
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('opshub_theme', themeId);
      window.dispatchEvent(new CustomEvent('opshub:theme-changed', { detail: { theme: themeId } }));
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', currentTheme);
    }
  }, [currentTheme]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeOption = THEME_OPTIONS.find((t) => t.id === currentTheme) || THEME_OPTIONS[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-ops-border bg-ops-surface/80 px-2.5 py-1.5 text-xs font-mono text-ops-text-muted hover:border-ops-cyan hover:text-white transition-all shadow-sm"
        aria-label="选择界面主题"
        aria-expanded={isOpen}
      >
        <Palette className="h-3.5 w-3.5 text-ops-cyan" />
        <span className="hidden md:inline text-[11px] font-sans text-ops-text-sub font-medium">
          {activeOption.name}
        </span>
        {/* Color preview dot */}
        <span
          className="h-2.5 w-2.5 rounded-full border border-white/20 shadow-sm"
          style={{ backgroundColor: activeOption.colors.primary }}
          title={activeOption.name}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-ops-border bg-ops-surface p-2 shadow-2xl z-50 backdrop-blur-md"
          >
            <div className="px-2 py-1.5 mb-1 border-b border-ops-border/60 flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ops-text-muted">
                界面风格主题 / THEME
              </span>
              <span className="text-[10px] font-mono text-ops-cyan">3 种配色</span>
            </div>

            <div className="space-y-1">
              {THEME_OPTIONS.map((theme) => {
                const isSelected = theme.id === currentTheme;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      applyTheme(theme.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left flex items-start justify-between rounded-lg p-2.5 transition-colors group ${
                      isSelected
                        ? 'bg-ops-card-hover border border-ops-cyan/40 text-white'
                        : 'hover:bg-ops-bg/60 border border-transparent text-ops-text-sub'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{theme.name}</span>
                        <span className="text-[10px] font-mono text-ops-text-muted/80">
                          {theme.nameEn}
                        </span>
                      </div>
                      <span className="text-[11px] text-ops-text-muted font-sans line-clamp-1">
                        {theme.desc}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      {/* Swatch pills */}
                      <div className="flex items-center -space-x-1">
                        <span
                          className="h-3 w-3 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: theme.colors.primary }}
                        />
                        <span
                          className="h-3 w-3 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: theme.colors.secondary }}
                        />
                        <span
                          className="h-3 w-3 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: theme.colors.accent }}
                        />
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-ops-cyan shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemePicker;
