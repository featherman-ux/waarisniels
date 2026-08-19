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
        display: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // Eén bron: src/styles/tokens.css. Nooit een hex hier hardcoden.
        ink: 'var(--ink)',
        text: 'var(--text)',
        'text-subtle': 'var(--text-subtle)',
        accent: 'var(--accent)',
        amber: 'var(--amber)',
        danger: 'var(--danger)',
        paper: 'var(--paper)',
        'paper-alt': 'var(--paper-alt)',
        card: 'var(--card)',
        line: 'var(--line)',
        // Aliassen naar --accent: fase 1 van TRANSFORMATIE_PLAN.md consolideert
        // deep/mid/sky/orange/orange-ink (allemaal DESIGN_HANDOFF-kleuren) tot één
        // accent. Bestaande text-deep/bg-sky/…-klassen blijven zo werken zonder dat
        // elk bestand met een kleurklasse aangepast hoeft te worden.
        deep: 'var(--accent)',
        mid: 'var(--text-subtle)',
        sky: 'var(--accent)',
        orange: 'var(--accent)',
        'orange-ink': 'var(--accent)',
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
        '80ch': '80ch',
      },
      boxShadow: {
        float: 'var(--shadow-float)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        lg: 'var(--radius-lg)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
