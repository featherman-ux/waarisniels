// src/lib/place-fact.ts
// Gedeelde prompt-logica voor het AI-plek-weetje. Gebruikt door api/ai-place.ts
// (handmatige "regenereer"-knop) en api/admin/posts.ts (automatisch bij opslaan
// van een post met locatie).

export const PLACE_FACT_FALLBACK =
  'Geen extra weetje beschikbaar – maar dit plekje blijft sowieso magisch mooi!';

interface AiBinding {
  run(model: string, options: Record<string, unknown>): Promise<{ response?: string }>;
}

export async function generatePlaceFact(
  ai: AiBinding,
  place: string,
  notes?: string | null
): Promise<string> {
  const systemPrompt = `Je bent een enthousiaste reisbuddy. Geef één korte alinea (max 35 woorden) over de genoemde plek, met een leuk weetje en waarom het bijzonder is voor reizigers. Gebruik een warme toon, in het Nederlands.`;
  const userPrompt = `Vertel iets speciaals over ${place}. Extra context: ${notes ?? 'geen extra context'}.`;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return response.response?.trim() || PLACE_FACT_FALLBACK;
  } catch (error) {
    console.error('generatePlaceFact mislukt', error);
    return PLACE_FACT_FALLBACK;
  }
}
