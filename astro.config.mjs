// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://waarisniels.nl',
  base: '/',
  output: 'server',
  // Remove the earlier string form; if you want to disable processing entirely, use the object form:
  // image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [tailwind(), preact()],
  adapter: cloudflare(),
});