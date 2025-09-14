import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    tailwind(),
    mdx({ extension: '.mdx' }),
    sitemap(),
    react(),
  ],
  markdown: {
    syntaxHighlight: 'shiki',
  },
});
