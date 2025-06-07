import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: '/', // because it's deployed to the root of the domain
});