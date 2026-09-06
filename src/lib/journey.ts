// src/lib/journey.ts
// De "AI Reisbuddy" op /map. Was een hardgecodeerde alinea over Cusco die al
// maanden niet meer klopte, met als terugval een los weetje over één plek.
//
// Nu: een samenvatting van de reis zelf, afgeleid uit de posts. Eerst worden de
// feiten uitgerekend (welke landen, in welke volgorde, tussen welke maanden,
// hoeveel posts) — daarna mag het model daar twee zinnen van maken. Lukt dat
// niet, dan staat er nog steeds een kloppende zin, want die is uit de data
// opgebouwd en niet uit het model.

import type { Post } from './db';
import { countryForTag } from './taxonomy';
import { CURRENT_LOCATION } from './place-fact';

interface AiBinding {
  run(model: string, options: Record<string, unknown>): Promise<{ response?: string }>;
}

export interface JourneyFacts {
  /** Landen in de volgorde waarin ze voor het eerst voorkomen. */
  countries: string[];
  firstDate: Date | null;
  lastDate: Date | null;
  postCount: number;
  lastPlace: string | null;
  currentLocation: string;
}

const MONTH = new Intl.DateTimeFormat('nl-NL', { month: 'long' });
const MONTH_YEAR = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

export function buildJourneyFacts(posts: Post[]): JourneyFacts {
  // posts komt aflopend op datum binnen; voor een reisvolgorde willen we oplopend.
  const chronological = [...posts].sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());

  const countries: string[] = [];
  for (const post of chronological) {
    for (const tag of post.tags) {
      const country = countryForTag(tag);
      if (country && !countries.includes(country.name)) countries.push(country.name);
    }
  }

  const withPlace = [...chronological].reverse().find((p) => p.location?.name);

  return {
    countries,
    firstDate: chronological[0]?.pubDate ?? null,
    lastDate: chronological[chronological.length - 1]?.pubDate ?? null,
    postCount: chronological.length,
    lastPlace: withPlace?.location?.name ?? null,
    currentLocation: CURRENT_LOCATION,
  };
}

/** Nederlandse opsomming: "A, B en C". */
function joinNl(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} en ${items[items.length - 1]}`;
}

/**
 * De versie zonder model. Deze staat er altijd, ook als Workers AI eruit ligt of
 * traag is — een kloppende zin is beter dan een verzonnen zin.
 */
export function fallbackSummary(facts: JourneyFacts): string {
  const { countries, firstDate, lastDate, postCount, currentLocation } = facts;

  if (!countries.length || !firstDate || !lastDate) {
    return `Niels zit op dit moment in ${currentLocation}.`;
  }

  // "van augustus tot augustus 2026" leest als één maand; zodra de jaren
  // verschillen moet het jaartal er aan beide kanten bij staan.
  const sameMonth = MONTH_YEAR.format(firstDate) === MONTH_YEAR.format(lastDate);
  const sameYear = firstDate.getFullYear() === lastDate.getFullYear();
  const periode = sameMonth
    ? MONTH_YEAR.format(lastDate)
    : sameYear
      ? `${MONTH.format(firstDate)} tot ${MONTH_YEAR.format(lastDate)}`
      : `${MONTH_YEAR.format(firstDate)} tot ${MONTH_YEAR.format(lastDate)}`;

  return `Van ${periode} ging de route door ${joinNl(countries)}, verspreid over ${postCount} ${
    postCount === 1 ? 'post' : 'posts'
  }. Nu zit Niels in ${currentLocation}.`;
}

function buildPrompt(facts: JourneyFacts): { system: string; user: string } {
  const system = [
    'Je vat een reisblog samen in exact twee zinnen Nederlands.',
    'Zin 1: waar de reiziger is geweest, in de gegeven volgorde, met de periode erbij.',
    'Zin 2: waar hij nu is. Begin die zin niet met "En".',
    'Nuchtere, droge toon. Geen uitroeptekens.',
    'Verboden woorden: magisch, adembenemend, prachtig, avontuur, onvergetelijk, betoverend.',
    'Gebruik uitsluitend de gegeven feiten. Verzin geen plaatsen, data of gebeurtenissen.',
    'Antwoord met alleen die twee zinnen, zonder inleiding of aanhalingstekens.',
  ].join(' ');

  const user = [
    `Landen in reisvolgorde: ${facts.countries.join(', ') || 'onbekend'}.`,
    facts.firstDate && facts.lastDate
      ? `Periode: ${MONTH_YEAR.format(facts.firstDate)} tot ${MONTH_YEAR.format(facts.lastDate)}.`
      : '',
    `Aantal posts: ${facts.postCount}.`,
    facts.lastPlace ? `Laatste plek met een post: ${facts.lastPlace}.` : '',
    `Waar hij nu is: ${facts.currentLocation}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return { system, user };
}

/** Twee zinnen zijn genoeg; alles daarboven is het model dat doorratelt. */
function firstTwoSentences(text: string): string {
  const cleaned = text.trim().replace(/^["'“”]|["'“”]$/g, '');
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return cleaned;
  return sentences.slice(0, 2).join(' ').trim();
}

/**
 * Eén keer per dag ververst via KV, net als het plek-weetje op de homepage. De
 * sleutel bevat de datum, het aantal posts en de huidige woonplaats, zodat een
 * nieuwe post of een verhuizing meteen een nieuwe samenvatting oplevert.
 */
export async function getJourneySummary(
  env: { ANALYTICS_KV?: KVNamespace; AI?: AiBinding },
  facts: JourneyFacts,
  ctx?: { waitUntil?: (p: Promise<unknown>) => void }
): Promise<string> {
  const fallback = fallbackSummary(facts);
  if (!env.AI) return fallback;

  const today = new Date().toISOString().slice(0, 10);
  const key = `journey:v1:${today}:${facts.postCount}:${facts.currentLocation.toLowerCase()}`;
  const kv = env.ANALYTICS_KV;

  if (kv) {
    const cached = await kv.get(key);
    if (cached) return cached;
  }

  const { system, user } = buildPrompt(facts);

  const pending = (async () => {
    try {
      const res = await env.AI!.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = firstTwoSentences(res.response ?? '');

      // Het model moet de huidige plek noemen; doet het dat niet, dan heeft het
      // iets anders verzonnen en gebruiken we onze eigen zin.
      if (!text || !text.toLowerCase().includes(facts.currentLocation.toLowerCase())) {
        return fallback;
      }
      if (kv) await kv.put(key, text, { expirationTtl: 60 * 60 * 48 });
      return text;
    } catch (error) {
      console.error('[journey] samenvatting mislukt', error);
      return fallback;
    }
  })();

  ctx?.waitUntil?.(pending);

  // Nooit langer dan 2,5s op het model wachten: de kaartpagina moet staan.
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(fallback), 2500));
  return Promise.race([pending, timeout]);
}
