// src/pages/api/admin/upload.ts
// Beveiliging loopt via Cloudflare Access op het pad /api/admin (zie
// docs/cloudflare-setup.md §5) — dit endpoint doet zelf geen auth-check.
import type { APIContext } from 'astro';
import { newUploadKey, mediaUrl, mediaTypeFor } from '../../../lib/media';
import { jsonResponse } from '../_utils';

export const prerender = false;

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB — grotere video's via YouTube

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(context: APIContext) {
  const media = context.locals.runtime.env.MEDIA;

  const form = await context.request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonResponse({ error: 'Geen bestand ontvangen' }, 400);
  }

  const type = mediaTypeFor(file.name);
  if (!type) {
    return jsonResponse({ error: 'Bestandstype niet ondersteund' }, 400);
  }

  const max = type === 'video' ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (file.size > max) {
    const maxMb = Math.round(max / (1024 * 1024));
    return jsonResponse({ error: `Bestand te groot (max ${maxMb} MB)` }, 413);
  }

  const key = newUploadKey(file.name);
  await media.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || undefined },
  });

  return jsonResponse({ key, url: mediaUrl(key), type });
}
