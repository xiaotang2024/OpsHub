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
          bg: '#0B0F17',
          surface: '#131B2A',
          card: '#131B2A',
          'card-hover': '#1A2438',
          border: '#1E293B',
          'border-hover': '#334155',
          cyan: '#06B6D4',
          emerald: '#10B981',
          amber: '#F59E0B',
          crimson: '#EF4444',
          'text-main': '#F8FAFC',
          'text-sub': '#CBD5E1',
          'text-muted': '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px -3px rgba(6, 182, 212, 0.3)',
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
