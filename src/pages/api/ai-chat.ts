import type { APIContext } from 'astro';

// Typing for Cloudflare AI and Vectorize bindings
interface CloudflareAI {
  run(model: string, options: Record<string, unknown>): Promise<any>;
}

interface VectorMatch {
  metadata?: { text?: string };
}

interface VectorizeIndex {
  query(vector: number[], options: { topK: number }): Promise<{
    matches: VectorMatch[];
  }>;
}

// Helper for JSON responses
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export const prerender = false;

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime?.env?.AI as CloudflareAI | undefined;
  const vectorDB = context.locals.runtime?.env
    ?.VECTORIZE_INDEX as VectorizeIndex | undefined;

  if (!ai || !vectorDB) {
    console.error('AI or Vectorize binding not found. Check wrangler.toml.');
    return jsonResponse({ error: 'AI services not available' }, 500);
  }

  try {
    // --- Parse JSON body safely
    const body = (await context.request.json()) as { message?: string };
    const message = body?.message?.trim();
    if (!message) return jsonResponse({ error: 'Missing message' }, 400);

    // --- Create embedding
    const embedding = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [message] });
    const queryVector = embedding.data?.[0];
    if (!queryVector) throw new Error('Embedding failed');

    // --- Query vector database
    const searchResults = await vectorDB.query(queryVector, { topK: 5 });
    const contextChunks = (searchResults.matches ?? [])
      .map((m) => m.metadata?.text)
      .filter(Boolean)
      .join('\n\n---\n\n');

    // --- System prompt with humor + clear role definition
    const systemPrompt = `
Je bent *Niels' Virtuele Reisgenoot*, een slimme maar licht sarcastische AI met de humor van een reisvriend 
die te lang in Zuid-Amerikaanse bussen heeft gezeten. 
Je weet alles over Niels Veerman — een 24-jarige Nederlandse reiziger, webdeveloper en schrijver van "WaarIsNiels.nl" — 
die maandenlang door Zuid-Amerika trok: van Colombia tot Brazilië, met te veel verhalen over bussen, bergen, en bier.

### Persoonlijkheid
- Je bent droog, grappig en een tikkie brutaal, maar nooit gemeen.
- Je maakt af en toe zelfspot of verwijst ironisch naar reisongemakken (“drie dagen bus zonder wc? pure therapie”).
- Gebruik soms een emoji als het past (maximaal één per antwoord).
- Schrijf vlot en in het Nederlands.
- Nooit dingen verzinnen: als je iets niet weet, zeg dat dan met humor (“Geen idee — zelfs Google Maps weet dit niet.”).

### Context
Hieronder staat de relevante info uit Niels’ blogposts:
"""
${contextChunks || 'Geen directe context gevonden — misschien zit Niels nog in de bus.'}
"""

### Taak
Beantwoord de vraag van de gebruiker met een kort, geestig maar correct antwoord, 
gebaseerd op de blogcontext. 
Als de vraag niets met Niels te maken heeft, reageer luchtig maar help toch. 
Zeg altijd iets wat voelt alsof het van een reizende sidekick komt.
`;

    // --- Generate model response
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      temperature: 0.5,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const reply =
      response.response?.trim() ||
      'Ehm... dat weet ik zelfs niet na drie koppen koffie.';

    return jsonResponse({
      response: reply,
      model: 'Llama 3.1 8B – met droge humor',
    });
  } catch (err) {
    console.error('AI Chat error:', err);
    return jsonResponse({ error: 'AI service unavailable' }, 500);
  }
}