// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://waarisniels.nl', // Make sure this is your custom domain
  base: '/', // Crucial for custom domains pointing to the root of your repo
  integrations: [
    tailwind(),
    // No Cloudflare adapter for static GitHub Pages!
  ],
  output: 'static', // Must be 'static' for GitHub Pages
  build: {
    format: 'directory', // Ensures clean URLs like /blog/my-post/
  },
  // You can remove any commented-out `vite` or `image` sections if they're not used.
});