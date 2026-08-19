// tailwind.config.cjs
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['"Playfair Display"', ...defaultTheme.fontFamily.serif],
      },
      colors: {
        // Eén bron: src/styles/tokens.css. Nooit een hex hier hardcoden.
        ink: 'var(--ink)',
        deep: 'var(--deep)',
        mid: 'var(--mid)',
        sky: 'var(--sky)',
        amber: 'var(--amber)',
        orange: 'var(--orange)',
        'orange-ink': 'var(--orange-ink)',
        danger: 'var(--danger)',
        paper: 'var(--paper)',
        card: 'var(--card)',
        line: 'var(--line)',
        text: 'var(--text)',
        'text-subtle': 'var(--text-subtle)',
      },
      fontSize: {
        'step-0': 'var(--step-0)',
        'step-1': 'var(--step-1)',
        'step-2': 'var(--step-2)',
        'step-3': 'var(--step-3)',
        'step-4': 'var(--step-4)',
      },
      maxWidth: {
        '68ch': '68ch',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
