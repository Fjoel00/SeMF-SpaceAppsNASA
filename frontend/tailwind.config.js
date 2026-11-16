/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bgMain: '#F7F8FA',
        surface: '#FFFFFF',
        textMain: '#202938',
        textSub: '#687385',
        borderSoft: '#E7EAF0',
        brand: '#F36B35',
        brandLight: '#FDF2EC',
        brandDark: '#D9531E',
        safe: '#16A36A',
        safeLight: '#ECFDF5',
        caution: '#E5A000',
        cautionLight: '#FFFBEB',
        danger: '#DC4545',
        dangerLight: '#FEF2F2',
        info: '#3978D5',
        infoLight: '#EFF6FF',
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        card: '0 2px 6px 0 rgba(32, 41, 56, 0.06), 0 1px 2px 0 rgba(32, 41, 56, 0.04)',
        drawer: '0 -4px 20px 0 rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
