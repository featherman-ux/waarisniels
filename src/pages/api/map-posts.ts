// src/pages/api/map-posts.ts
// Locatie-posts uit D1 als GeoJSON, voor de tweede markerlaag op /map
// (naast de vaste Zuid-Amerika-route uit /data/route.geojson).
import type { APIContext } from 'astro';
import { getPostsWithLocation } from '../../lib/db';
import { jsonResponse } from './_utils';

export const prerender = false;

export async function GET(context: APIContext) {
  const db = context.locals.runtime.env.DB;
  const posts = await getPostsWithLocation(db);

  const geojson = {
    type: 'FeatureCollection',
    features: posts.map((post) => ({
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
      },
    })),
  };

  return jsonResponse(geojson);
}
