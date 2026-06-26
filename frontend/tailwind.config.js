/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0d1117',
        panel:   '#161b22',
        border:  '#21262d',
        muted:   '#30363d',
        text:    '#e6edf3',
        sub:     '#8b949e',
        accent:  '#58a6ff',
        green:   '#3fb950',
        yellow:  '#d29922',
        red:     '#f85149',
        purple:  '#bc8cff',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
