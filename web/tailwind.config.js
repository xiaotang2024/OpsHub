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
          bg: 'var(--ops-bg, #1e1c2b)',
          surface: 'var(--ops-surface, #2b273d)',
          card: 'var(--ops-card, #2b273d)',
          'card-hover': 'var(--ops-card-hover, #38334f)',
          'editor-bg': 'var(--ops-editor-bg, #555363)',
          'editor-gutter': 'var(--ops-editor-gutter, #494754)',
          'editor-selection': 'var(--ops-editor-selection, #aa5140)',
          'editor-selection-text': 'var(--ops-editor-selection-text, #ffffff)',
          tooltip: 'var(--ops-tooltip-bg, #2b273d)',
          border: 'var(--ops-border, #606165)',
          'border-hover': 'var(--ops-border-hover, #aa5140)',
          cyan: 'var(--ops-primary, #aa5140)',
          'cyan-dim': 'var(--ops-primary-dim, rgba(170, 81, 64, 0.28))',
          emerald: '#10B981',
          amber: '#F59E0B',
          crimson: '#EF4444',
          'text-main': 'var(--ops-text-main, #FFFDFD)',
          'text-sub': 'var(--ops-text-sub, #E5DEE3)',
          'text-muted': 'var(--ops-text-muted, #B2A7B0)',
          // Direct theme color tokens
          muzi: '#4b4e72',      // 木紫
          rongyan: '#606165',   // 熔岩灰
          chase: '#aa5140',     // 茶色
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px -3px var(--ops-primary-glow, rgba(170, 81, 64, 0.55))',
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
