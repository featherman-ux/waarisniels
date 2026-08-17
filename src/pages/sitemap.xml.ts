// src/pages/sitemap.xml.ts
// @astrojs/sitemap leest astro:content en ziet de D1-posts niet, dus bouwen
// we de sitemap zelf op basis van D1 + de statische pagina's.
import type { APIContext } from 'astro';
import { listPosts } from '../lib/db';

export const prerender = false;

const STATIC_PATHS = ['/', '/blog/', '/map/', '/about/'];

export async function GET(context: APIContext) {
  const db = context.locals.runtime.env.DB;
  const posts = await listPosts(db, { limit: 1000 });
  const site = (import.meta.env.SITE ?? context.url.origin).replace(/\/$/, '');

  const staticEntries = STATIC_PATHS.map(
    (path) => `  <url><loc>${site}${path}</loc></url>`
  );
  const postEntries = posts.map(
    (post) =>
      `  <url><loc>${site}/blog/${post.slug}/</loc><lastmod>${post.updatedAt.slice(0, 10)}</lastmod></url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...postEntries].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
