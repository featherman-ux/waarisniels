// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  base: '/',

  // 👇 DIT IS DE BELANGRIJKSTE WIJZIGING
  output: 'server',

  integrations: [
    tailwind(),
    preact(),
  ],

  adapter: cloudflare(),
});