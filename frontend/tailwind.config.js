/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // warm/cream light theme (gatemock redesign) — replaces the old dark
        // terminal palette. Anchored to gatemock/app/globals.css body colors
        // (#f8f7f3 / #33302b) and the primary blue used as a literal stroke
        // color in the account usage chart (#4A90E2). Status colors reuse the
        // exact rgba() hues gatemock tints its badges with, at full opacity.
        ink: '#33302B',
        'ink-soft': '#524D44',
        'ink-alt': '#443F37',
        muted: '#8A8478',
        'muted-2': '#9C948A',
        'muted-3': '#B7B2A7',

        page: '#F8F7F3',
        'page-alt': '#F1EFE8',
        surface: '#FFFFFF',

        border: {
          DEFAULT: '#EFEDE6',
          alt: '#E3DFD5',
        },
        'input-border': '#E3DED2',
        'input-fill': '#FBFAF7',

        primary: {
          DEFAULT: '#4A90E2',
          hover: '#3A7BC8',
        },
        purple: '#8B5CF6',

        'allow-text': '#73A98C',
        'allow-dot': '#73A98C',
        'warn-text': '#E0B976',
        'warn-dot': '#E0B976',
        'danger-text': '#D66D52',
        'danger-dot': '#D66D52',

        rail: '#21201C',
        'rail-idle': '#8B8579',

        'term-bg': '#23211C',
        'term-text': '#C9C4B8',
      },
      boxShadow: {
        card: '0 1px 2px rgba(51,48,43,.04)',
        'card-soft': '0 1px 3px rgba(51,48,43,.05)',
        auth: '0 20px 60px rgba(0,0,0,.35)',
        node: '0 1px 3px rgba(51,48,43,.08)',
        'node-central': '0 4px 20px rgba(74,144,226,.18)',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, #DDD8CC 1px, transparent 1px)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
