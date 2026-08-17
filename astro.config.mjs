import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    tailwind(),
    mdx({ extension: '.mdx' }),
    react(),
  ],
  markdown: {
    syntaxHighlight: 'shiki',
  },
});
