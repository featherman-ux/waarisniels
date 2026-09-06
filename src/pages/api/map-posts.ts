// src/pages/api/map-posts.ts
// Locatie-posts uit D1 als GeoJSON, voor de tweede markerlaag op /map
// (naast de vaste Zuid-Amerika-route uit /data/route.geojson).
import type { APIContext } from 'astro';
import { getPostsWithLocation } from '../../lib/db';
import { mediaUrl } from '../../lib/media';
import { countryForTag } from '../../lib/taxonomy';

export const prerender = false;

export async function GET(context: APIContext) {
  const db = context.locals.runtime.env.DB;
  const posts = await getPostsWithLocation(db);

  const geojson = {
    type: 'FeatureCollection',
    features: posts.map((post) => {
      const country = post.tags.map((t) => countryForTag(t)).find(Boolean);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [post.location!.lon, post.location!.lat],
        },
        properties: {
          title: post.title,
          slug: post.slug,
          category: post.category,
          placeFact: post.placeFact,
          // Genoeg om een fatsoenlijke popup te bouwen zonder tweede request.
          description: post.description,
          date: post.pubDate.toISOString().slice(0, 10),
          readMinutes: post.readMinutes,
          thumb: mediaUrl(post.cover?.key, { width: 320 }) ?? null,
          placeName: post.location!.name,
          country: country ? { slug: country.slug, name: country.name } : null,
        },
      };
    }),
  };

  return new Response(JSON.stringify(geojson), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
