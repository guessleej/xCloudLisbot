/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'system-ui', '-apple-system', 'Segoe UI', 'Microsoft JhengHei',
          'PingFang TC', 'Noto Sans TC', 'Roboto', 'Helvetica', 'Arial', 'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,25,23,0.06)',
        pop: '0 4px 14px rgba(28,25,23,0.10)',
        float: '0 12px 28px rgba(28,25,23,0.12)',
      },
    },
  },
  plugins: [],
};
