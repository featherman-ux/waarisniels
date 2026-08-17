// src/pages/api/admin/alt-text.ts
// Beveiliging loopt via Cloudflare Access op het pad /api/admin (zie
// docs/cloudflare-setup.md §5) — dit endpoint doet zelf geen auth-check.
//
// Knopje-per-foto in /beheer: genereert een korte NL alt-tekst voor een
// zojuist geüploade foto. Bewust niet automatisch voor een hele batch —
// kost een Workers AI-call per foto, en niet elke foto heeft een alt-tekst
// nodig (zie CLAUDE_CODE_HANDOFF.md P2.4).
import type { APIContext } from 'astro';
import { jsonResponse } from '../_utils';

export const prerender = false;

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime.env.AI;
  const media = context.locals.runtime.env.MEDIA;

  let payload: { key?: string };
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Ongeldige JSON' }, 400);
  }

  if (!payload.key) {
    return jsonResponse({ error: 'key ontbreekt' }, 400);
  }

  const object = await media.get(payload.key);
  if (!object) {
    return jsonResponse({ error: 'Bestand niet gevonden in R2' }, 404);
  }

  try {
    const buffer = await object.arrayBuffer();
    const response = await ai.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: [...new Uint8Array(buffer)],
      prompt:
        'Describe this photo in one short, natural sentence in Dutch, for use as alt text. No preamble, just the description.',
      max_tokens: 100,
    });

    const alt = (response as { description?: string }).description?.trim();
    if (!alt) return jsonResponse({ error: 'Geen beschrijving gegenereerd' }, 502);
    return jsonResponse({ alt });
  } catch (err) {
    console.error('[api/admin/alt-text] mislukt', err);
    return jsonResponse({ error: 'Alt-tekst genereren mislukt' }, 500);
  }
}
