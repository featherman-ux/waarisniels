import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    tailwind(),
    react(),
  ],
  markdown: {
    syntaxHighlight: 'shiki',
  },
});
