/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070B18',
          900: '#0B1026',
          800: '#111936',
          700: '#1A2342',
          600: '#243052',
        },
        brand: {
          blue: '#38BDF8',
          violet: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        'countdown-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.18)', opacity: '0.85' },
        },
        'fade-slide-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'reveal-pop': {
          '0%': { transform: 'scale(0.94)', opacity: '0.6' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Phase 2: juicy countdown numbers — punch in, hold, shrink out.
        'countdown-zoom': {
          '0%': { transform: 'scale(2.4)', opacity: '0' },
          '18%': { transform: 'scale(1)', opacity: '1' },
          '75%': { transform: 'scale(0.96)', opacity: '1' },
          '100%': { transform: 'scale(0.88)', opacity: '0' },
        },
        // Floating "+1,250" points feedback.
        'float-up': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '15%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-30px)', opacity: '0' },
        },
        // Winner banner entrance.
        'winner-pop': {
          '0%': { transform: 'scale(0.4) rotate(-8deg)', opacity: '0' },
          '55%': { transform: 'scale(1.12) rotate(3deg)', opacity: '1' },
          '75%': { transform: 'scale(0.96) rotate(-1deg)' },
          '100%': { transform: 'scale(1) rotate(0)', opacity: '1' },
        },
        // Brief flash for leaderboard rows that moved rank.
        'row-flash': {
          '0%': { backgroundColor: 'rgba(139, 92, 246, 0.22)' },
          '100%': { backgroundColor: 'transparent' },
        },
        // Slim "next question" progress bar (4s server pause).
        'next-bar': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'countdown-pulse': 'countdown-pulse 1s ease-in-out infinite',
        'fade-slide-in': 'fade-slide-in 0.25s ease-out',
        'reveal-pop': 'reveal-pop 0.35s ease-out',
        'toast-in': 'toast-in 0.2s ease-out',
        'countdown-zoom': 'countdown-zoom 0.95s cubic-bezier(0.22, 1, 0.36, 1)',
        'float-up': 'float-up 1.25s ease-out forwards',
        'winner-pop': 'winner-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        'row-flash': 'row-flash 1.6s ease-out',
        'next-bar': 'next-bar 4s linear forwards',
      },
    },
  },
  plugins: [],
};
