/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{ts,tsx,html}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
