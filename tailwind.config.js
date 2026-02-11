/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
      colors: {
        // Primary accent - Indigo
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Surface colors for dark mode (blue-tinted slate)
        surface: {
          light: '#ffffff',
          dark: '#0f172a',
          'dark-elevated': '#1e293b',
        },
      },
      backgroundColor: {
        'app-light': '#f8fafc',
        'app-dark': '#020617',
      },
      textColor: {
        'app-primary': {
          light: '#0f172a',
          dark: '#f1f5f9',
        },
        'app-secondary': {
          light: '#475569',
          dark: '#94a3b8',
        },
        'app-muted': {
          light: '#94a3b8',
          dark: '#64748b',
        },
      },
      borderColor: {
        'app': {
          light: '#e2e8f0',
          dark: '#334155',
        },
      },
      transitionProperty: {
        'colors-shadow': 'color, background-color, border-color, text-decoration-color, fill, stroke, box-shadow',
      },
    },
  },
  plugins: [],
}
