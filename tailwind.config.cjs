// tailwind.config.cjs
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
  ],
  darkMode: 'class', // or 'media' if you prefer OS-level dark mode
  theme: {
    extend: {
      fontFamily: {
        // Fix: Replace 'usig' with the correct font definition
        // You should have already imported the fonts via <link> in BaseLayout.astro's <head>
        sans: ['Inter', ...defaultTheme.fontFamily.sans], // Using Inter font with fallbacks
        // mono: [...defaultTheme.fontFamily.mono], // Uncomment and configure if you need mono font
      },
      colors: {
        primary: {
 DEFAULT: '#1E40AF', // Example: Blue-700
 light: '#3B82F6', // Example: Blue-500
 dark: '#1D4ED8',  // Example: Blue-800
        },
        secondary: {
 DEFAULT: '#9333EA', // Example: Purple-600
        },
        // Add more custom colors as needed
      },
      // Extend other properties like spacing, typography, etc.
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // For styling Markdown content
  ],
};