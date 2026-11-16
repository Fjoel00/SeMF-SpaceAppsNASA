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
        background: '#0A0E14',
        surface: {
          DEFAULT: '#101722',
          card: 'rgba(16, 23, 34, 0.85)',
          glass: 'rgba(255, 255, 255, 0.04)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.12)',
        },
        fire: {
          DEFAULT: '#FF5A1F',
          dark: '#E0480F',
          glow: 'rgba(255, 90, 31, 0.35)',
        },
        amber: {
          alert: '#FFB020',
        },
        cyan: {
          info: '#22D3EE',
        },
        danger: {
          DEFAULT: '#FF2D55',
          glow: 'rgba(255, 45, 85, 0.45)',
        },
        safe: {
          DEFAULT: '#10B981',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'fire-glow': '0 0 25px rgba(255, 90, 31, 0.45)',
        'sos-glow': '0 0 35px rgba(255, 45, 85, 0.6)',
      },
    },
  },
  plugins: [],
}
