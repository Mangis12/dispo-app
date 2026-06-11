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
        display: ['Fraunces', 'Georgia', 'serif'], // premium antikva — lого ir antraštės
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        // Etihad įkvėpta premium paletė: dykumos smėlis + bronza/auksas + grafitas
        canvas: '#F2ECE1',   // šiltas smėlio/kremo fonas
        surface: '#FBF8F2',  // švelnus kremas — kortelės
        ink: '#272219',      // šiltas espresso grafitas (tekstas / tamsūs mygtukai)
        hairline: '#E6DDCC', // šilta smėlio linija (borders)
        muted: '#938876',    // šiltas taupe — antrinis tekstas
        gold: {
          DEFAULT: '#9C7B36', // gili bronza/auksas — vienintelis prabangos akcentas
          soft: '#BE9B5A',    // šviesesnis auksas
          pale: '#EDE2C9',    // labai šviesus auksinis fonas
        },
        accent: '#9C7B36',
      },
      boxShadow: {
        // Subtilūs, šilti šešėliai
        card: '0 1px 2px rgba(39, 34, 25, 0.05)',
        float: '0 12px 40px rgba(39, 34, 25, 0.14)',
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
