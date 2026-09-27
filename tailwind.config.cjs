module.exports = {
  content: ['./app/**/*.{js,jsx}', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {sans: ['Outfit', 'Arial', 'sans-serif'], tech: ['Syncopate', 'Arial', 'sans-serif']},
      colors: {
        glass: {100: 'rgba(255,255,255,0.1)', 200: 'rgba(255,255,255,0.2)', 300: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.5)'},
        brand: {purple: '#7c3aed', pink: '#db2777', cyan: '#06b6d4'},
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 3s infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        float: {'0%, 100%': {transform: 'translateY(0)'}, '50%': {transform: 'translateY(-20px)'}},
        shimmer: {'100%': {transform: 'translateX(100%)'}},
      },
    },
  },
  plugins: [],
};
