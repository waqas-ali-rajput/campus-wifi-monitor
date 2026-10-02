import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        cond: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#14223b', 2: '#3d4a60', 3: '#66728a', 4: '#98a1b3' },
        paper: '#eef2f6',
        surface: '#ffffff',
        line: { DEFAULT: '#dbe1ea', strong: '#c3ccd9' },
        accent: { DEFAULT: '#1f62c4', soft: '#e3edfb', ink: '#174a96', bright: '#2a78d6' },
        series: { 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100', 5: '#e87ba4', 6: '#008300', 7: '#4a3aa7', 8: '#e34948' },
        st: { excellent: '#15803d', good: '#22c55e', fair: '#eab308', poor: '#ef4444', critical: '#991b1b', unknown: '#9ca3af' },
      },
      boxShadow: {
        card: '0 1px 0 rgba(20,34,59,0.04), 0 1px 2px rgba(20,34,59,0.06)',
        pop: '0 12px 32px -8px rgba(20,34,59,0.28)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { transform: 'scale(0.9)', opacity: '0.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: { rise: 'rise .35s ease-out both', pulseRing: 'pulseRing 1.6s ease-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
