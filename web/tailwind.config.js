/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ops: {
          bg: 'var(--ops-bg, #0B0F17)',
          surface: 'var(--ops-surface, #131B2A)',
          card: 'var(--ops-card, #131B2A)',
          'card-hover': 'var(--ops-card-hover, #1A2438)',
          border: 'var(--ops-border, #1E293B)',
          'border-hover': 'var(--ops-border-hover, #334155)',
          cyan: 'var(--ops-primary, #06B6D4)',
          'cyan-dim': 'var(--ops-primary-dim, rgba(6, 182, 212, 0.15))',
          emerald: '#10B981',
          amber: '#F59E0B',
          crimson: '#EF4444',
          'text-main': 'var(--ops-text-main, #F8FAFC)',
          'text-sub': 'var(--ops-text-sub, #CBD5E1)',
          'text-muted': 'var(--ops-text-muted, #94A3B8)',
          // Direct theme color tokens
          muzi: '#4b4e72',      // 木紫
          rongyan: '#606165',   // 熔岩灰
          tianshui: '#5fa3b0',  // 天水碧
          chase: '#aa5140',     // 茶色
          jinghui: '#475061',   // 鲸灰
          wulan: '#2d5678',     // 雾蓝
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px -3px var(--ops-primary-glow, rgba(6, 182, 212, 0.3))',
        'emerald-glow': '0 0 15px -3px rgba(16, 185, 129, 0.3)',
        'amber-glow': '0 0 15px -3px rgba(245, 158, 11, 0.3)',
        'crimson-glow': '0 0 15px -3px rgba(239, 68, 68, 0.3)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
