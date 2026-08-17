import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';
import { generatePlaceFact, PLACE_FACT_FALLBACK } from '../../lib/place-fact';

export const prerender = false;

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime?.env?.AI;
  if (!ai) {
    console.error('AI binding missing for ai-place endpoint');
    return jsonResponse({ error: 'AI not configured' }, 500);
  }

  try {
    const { place, notes } = await context.request.json();
    if (!place) {
      return jsonResponse({ error: 'Missing `place` in request body' }, 400);
    }

    const highlight = await generatePlaceFact(ai, place, notes);
    return jsonResponse({ highlight });
  } catch (error) {
    console.error('ai-place endpoint failed', error);
    return jsonResponse({ highlight: PLACE_FACT_FALLBACK }, 200);
  }
}
