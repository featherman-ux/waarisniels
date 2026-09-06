// src/pages/rss.xml.ts
// RSS 2.0-feed van alle gepubliceerde posts. Handmatig opgebouwd i.p.v. via
// @astrojs/rss, om dezelfde reden als de sitemap: de posts staan in D1 en niet
// in astro:content, dus de integratie ziet ze toch niet.
import type { APIContext } from 'astro';
import { listPosts } from '../lib/db';
import { mediaUrl } from '../lib/media';

export const prerender = false;

const FEED_LIMIT = 30;

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const db = context.locals.runtime.env.DB;
  const posts = await listPosts(db, { limit: FEED_LIMIT });
  const site = (import.meta.env.SITE ?? context.url.origin).replace(/\/$/, '');

  const items = posts
    .map((post) => {
      const url = `${site}/blog/${post.slug}/`;
      const cover = mediaUrl(post.cover?.key, { width: 1200 });
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${post.pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(post.description ?? post.title)}</description>
${post.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join('\n')}
${cover ? `      <enclosure url="${escapeXml(cover)}" type="image/jpeg" />` : ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WaarIsNiels</title>
    <link>${site}/</link>
    <description>Reisblog en kaart van Niels Veerman.</description>
    <language>nl-NL</language>
    <lastBuildDate>${(posts[0]?.pubDate ?? new Date()).toUTCString()}</lastBuildDate>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400',
    },
  });
}
