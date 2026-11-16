/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#070A12',
        surface: '#0B1120',
        elevated: '#111827',
        borderSubtle: '#1E293B',
        viirs: '#F97316',
        modis: '#EF4444',
        tacticalSafe: '#10B981',
        tacticalWarn: '#F59E0B',
        tacticalCrit: '#DC2626',
        orbitalCyan: '#06B6D4',
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
