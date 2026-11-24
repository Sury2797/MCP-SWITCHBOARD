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
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          '"Cascadia Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
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
