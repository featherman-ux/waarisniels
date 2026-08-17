// src/pages/api/admin/posts.ts
// Beveiliging loopt via Cloudflare Access op het pad /api/admin (zie
// docs/cloudflare-setup.md §5) — dit endpoint doet zelf geen auth-check.
import type { APIContext } from 'astro';
import { upsertPost, deletePost, uniqueSlug, slugify, slugTaken } from '../../../lib/db';
import { jsonResponse } from '../_utils';
import { generatePlaceFact } from '../../../lib/place-fact';

export const prerender = false;

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

interface PostPayload {
  id?: string;
  title?: string;
  slug?: string;
  category?: string;
  description?: string;
  body?: string;
  pubDate?: string;
  tags?: string[];
  draft?: boolean;
  location?: { lat: number; lon: number; name: string } | null;
  cover?: { key: string; alt?: string } | null;
  placeFact?: string;
}

export async function POST(context: APIContext) {
  const db = context.locals.runtime.env.DB;

  let payload: PostPayload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Ongeldige JSON' }, 400);
  }

  if (!payload.title?.trim()) return jsonResponse({ error: 'Titel is verplicht' }, 400);
  if (!payload.body?.trim()) return jsonResponse({ error: 'Inhoud is verplicht' }, 400);
  if (!payload.pubDate) return jsonResponse({ error: 'Publicatiedatum is verplicht' }, 400);

  let slug: string;
  if (payload.slug?.trim()) {
    slug = slugify(payload.slug);
    if (await slugTaken(db, slug, payload.id)) {
      return jsonResponse({ error: `Slug "${slug}" is al in gebruik` }, 409);
    }
  } else {
    slug = await uniqueSlug(db, payload.title, payload.id);
  }

  let placeFact = payload.placeFact?.trim() || null;
  const locationName = payload.location?.name?.trim();
  if (!placeFact && locationName) {
    const ai = context.locals.runtime.env.AI;
    placeFact = await generatePlaceFact(ai, locationName);
  }

  try {
    const id = await upsertPost(db, {
      id: payload.id,
      category: payload.category || 'reis',
      title: payload.title.trim(),
      slug,
      description: payload.description?.trim() || null,
      body: payload.body,
      pubDate: payload.pubDate,
      tags: payload.tags ?? [],
      location: payload.location ?? null,
      cover: payload.cover ?? null,
      placeFact,
      draft: !!payload.draft,
    });
    return jsonResponse({ ok: true, id, slug });
  } catch (err) {
    console.error('[api/admin/posts] upsert mislukt', err);
    return jsonResponse({ error: 'Opslaan mislukt' }, 500);
  }
}

export async function DELETE(context: APIContext) {
  const db = context.locals.runtime.env.DB;
  const id = context.url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id ontbreekt' }, 400);
  await deletePost(db, id);
  return jsonResponse({ ok: true });
}
