// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://waarisniels.nl',   // your canonical domain
  base: '/',                        // root deploy (keep '/')
  output: 'static',                 // static build; CF Pages will serve it
  build: {
    format: 'directory',            // clean URLs: /page/ instead of /page.html
  },
  integrations: [
    tailwind(),
    preact(),                       // enables islands (use client:* in components)
  ],
});