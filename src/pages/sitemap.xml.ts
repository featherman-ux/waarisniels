// src/pages/sitemap.xml.ts
// @astrojs/sitemap leest astro:content en ziet de D1-posts niet, dus bouwen
// we de sitemap zelf op basis van D1 + de statische pagina's + de hubs.
import type { APIContext } from 'astro';
import { listPosts } from '../lib/db';
import { countriesWithPosts, themeTags } from '../lib/taxonomy';

export const prerender = false;

const STATIC_PATHS = ['/', '/blog/', '/map/', '/about/', '/colofon/'];

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
  // Hubs horen er ook in: het zijn de pagina's die de losse posts per onderwerp
  // bundelen, en zonder sitemap-vermelding vindt een crawler ze alleen via chips.
  const countryEntries = countriesWithPosts(posts).map(
    (c) => `  <url><loc>${site}/blog/land/${c.slug}/</loc></url>`
  );
  const tagEntries = themeTags(posts).map(
    (t) => `  <url><loc>${site}/blog/tag/${t.slug}/</loc></url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...countryEntries, ...tagEntries, ...postEntries].join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400',
    },
  });
}
