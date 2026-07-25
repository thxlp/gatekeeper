/** @type {import('tailwindcss').Config} */

// Neutral palette tokens are CSS variables (set in globals.css under :root /
// .dark) so the same class names (bg-surface, text-ink, ...) resolve to
// light or dark values depending on the `dark` class on <html>. Accent
// colors (primary/allow/warn/danger/purple) stay static hex — verified they
// still clear ~4.3:1+ against the dark palette below, so no separate dark
// variant is needed for those.
function withOpacity(varName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${varName}))` : `rgb(var(${varName}) / ${opacityValue})`;
}

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: withOpacity('--color-ink'),
        'ink-soft': withOpacity('--color-ink-soft'),
        'ink-alt': withOpacity('--color-ink-alt'),
        muted: withOpacity('--color-muted'),
        'muted-2': withOpacity('--color-muted-2'),
        'muted-3': withOpacity('--color-muted-3'),

        page: withOpacity('--color-page'),
        'page-alt': withOpacity('--color-page-alt'),
        surface: withOpacity('--color-surface'),

        border: {
          DEFAULT: withOpacity('--color-border'),
          alt: withOpacity('--color-border-alt'),
        },
        'input-border': withOpacity('--color-input-border'),
        'input-fill': withOpacity('--color-input-fill'),

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
        sans: ['Inter', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // ยกพื้นตัวเล็กขึ้น 2px จาก default ของ Tailwind (xs 12→14, sm 14→15.5)
        // ให้สอดคล้องกับขนาด arbitrary px ที่ขยับ +2px ทั้งแอป
        // (sm หยุดที่ 15.5 กันชนกับ base 16)
        xs: ['14px', { lineHeight: '19px' }],
        sm: ['15.5px', { lineHeight: '22px' }],
      },
    },
  },
  plugins: [],
};
