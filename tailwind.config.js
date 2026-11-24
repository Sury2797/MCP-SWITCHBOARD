/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      screens: {
        xs: '440px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Segoe UI Variable Text"',
          '"Segoe UI Variable"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Cascadia Code"',
          '"SF Mono"',
          'Consolas',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      spacing: {
        '4.5': '1.125rem',
        '7.5': '1.875rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      colors: {
        graphite: {
          50: '#f6f7f9',
          100: '#eceff3',
          200: '#dce0e8',
          300: '#bcc4d2',
          400: '#8e98aa',
          500: '#646f82',
          600: '#495264',
          700: '#272c36',
          800: '#1b1f27',
          850: '#151820',
          900: '#11141a',
          950: '#0b0d11',
        },
      },
    },
  },
  plugins: [],
};
