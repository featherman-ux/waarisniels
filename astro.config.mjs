import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: '/', // 👈 not '/waarisniels/' if you're using waarisniels.nl
});