// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  base: '/',
  output: 'server',     // SSR on Cloudflare Worker
  integrations: [tailwind(), preact()],
  adapter: cloudflare(),// @astrojs/cloudflare
});