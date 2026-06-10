/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Georgia', 'serif'],
      },
      colors: {
        // Skandinaviško minimalizmo paletė
        canvas: '#F4F3EF',   // šilta pilkšvai balta drobė (puslapio fonas)
        surface: '#FFFFFF',  // kortelės
        ink: '#1B1A18',      // beveik juodas tekstas
        hairline: '#E7E4DD', // švelni šilta linija (borders)
        muted: '#8B8780',    // antrinis tekstas
        accent: '#1B1A18',   // vienintelis akcentas — juodas (Scandi)
      },
      boxShadow: {
        // Subtilūs šešėliai vietoj sunkių
        card: '0 1px 2px rgba(27, 26, 24, 0.04)',
        float: '0 8px 30px rgba(27, 26, 24, 0.12)',
      },
      gridTemplateColumns: {
        '31': 'repeat(31, minmax(0, 1fr))',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
