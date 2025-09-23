import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

const FALLBACK = 'Geen extra weetje beschikbaar – maar dit plekje blijft sowieso magisch mooi!';

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

    const systemPrompt = `Je bent een enthousiaste reisbuddy. Geef één korte alinea (max 35 woorden) over de genoemde plek, met een leuk weetje en waarom het bijzonder is voor reizigers. Gebruik een warme toon, in het Nederlands.`;
    const userPrompt = `Vertel iets speciaals over ${place}. Extra context: ${notes ?? 'geen extra context'}.`;

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const hint = response.response?.trim();
    return jsonResponse({ highlight: hint || FALLBACK });
  } catch (error) {
    console.error('ai-place endpoint failed', error);
    return jsonResponse({ highlight: FALLBACK }, 200);
  }
}
