// src/lib/place-fact.ts
// Funfact over een bestemming. Gebruikt door:
//  - api/ai-place.ts          (handmatige "regenereer"-knop)
//  - api/admin/posts.ts       (automatisch bij opslaan van een post met locatie)
//  - pages/index.astro        (het "Funfact laatste bestemming"-blok, via KV-cache)

export const PLACE_FACT_FALLBACK = '';

interface AiBinding {
  run(model: string, options: Record<string, unknown>): Promise<{ response?: string }>;
}

export async function generatePlaceFact(
  ai: AiBinding,
  place: string,
  notes?: string | null
): Promise<string> {
  const systemPrompt = [
    'Geef één verrassende funfact over de genoemde plek: iets wat een reiziger niet',
    'zomaar weet. Eén zin, maximaal 30 woorden, in het Nederlands.',
    'Nuchtere toon: geen uitroeptekens, geen reisbrochure-woorden als "magisch",',
    '"adembenemend" of "prachtig", geen inleiding als "Wist je dat".',
    'Alleen het feit zelf. Weet je niets zeker over deze plek, verzin dan niets:',
    'antwoord dan exact met het woord GEEN.',
  ].join(' ');
  const userPrompt = `Plek: ${place}. Extra context: ${notes ?? 'geen'}.`;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const fact = response.response?.trim() ?? '';
    if (!fact || /^geen\b/i.test(fact)) return PLACE_FACT_FALLBACK;
    return fact;
  } catch (error) {
    console.error('generatePlaceFact mislukt', error);
    return PLACE_FACT_FALLBACK;
  }
}

/** Waar Niels nu woont, voor het "Niels zit nu in"-blok op de homepage. */
export const CURRENT_LOCATION = 'Athene';

/**
 * Feitje over de huidige woonplaats, één keer per dag ververst uit KV i.p.v. een
 * live AI-call per bezoeker — de key bevat de datum, dus elke dag levert vanzelf
 * een nieuwe (mogelijk andere) funfact op.
 *
 * Bij een cache-miss wachten we maximaal 2,5s zodat de homepage nooit op het model
 * blijft hangen; de call zelf loopt via waitUntil door en vult de cache, zodat de
 * eerstvolgende bezoeker 'm wél ziet.
 */
export async function getCurrentLocationFact(
  env: { ANALYTICS_KV?: KVNamespace; AI?: AiBinding },
  ctx?: { waitUntil?: (p: Promise<unknown>) => void }
): Promise<string> {
  if (!env.AI) return PLACE_FACT_FALLBACK;

  const today = new Date().toISOString().slice(0, 10);
  const key = `placefact:v1:daily:${CURRENT_LOCATION.toLowerCase()}:${today}`;
  const kv = env.ANALYTICS_KV;

  if (kv) {
    const cached = await kv.get(key);
    if (cached !== null) return cached;
  }

  const pending = generatePlaceFact(env.AI, CURRENT_LOCATION).then(async (fact) => {
    if (kv && fact) {
      await kv.put(key, fact, { expirationTtl: 60 * 60 * 48 });
    }
    return fact;
  });

  ctx?.waitUntil?.(pending);

  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(PLACE_FACT_FALLBACK), 2500));
  return Promise.race([pending, timeout]);
}
