// src/lib/journey.ts
// De samenvatting boven de kaart. Was een hardgecodeerde alinea over Cusco.
//
// Opzet: de feiten worden uit de posts gerekend en daar wordt een Nederlandse zin
// van gebouwd. Die zin is altijd juist. Daarna mág een model het mooier proberen
// te zeggen, maar alleen als zijn antwoord door een reeks controles komt — anders
// wordt het weggegooid. Dat is niet overdreven voorzichtig: het model produceerde
// bij de eerste versie "Colombia in augustus 2025, Ecuador in augustus 2025, Peru
// in september 2025 ..." terwijl het die maanden per land nooit gekregen had.

import type { Post } from './db';
import { countryForTag } from './taxonomy';
import { CURRENT_LOCATION } from './place-fact';

/** Zet op false om het model helemaal over te slaan; de zin blijft dan gewoon staan. */
const GEBRUIK_AI = true;

/** Een gat van meer dan dit tussen twee posts scheidt twee reizen. */
const REIS_GAT_DAGEN = 120;

interface AiBinding {
  run(model: string, options: Record<string, unknown>): Promise<{ response?: string }>;
}

export interface JourneyFacts {
  /** Alle landen ooit, in volgorde van eerste post. Voor de regel onder de tekst. */
  countries: string[];
  postCount: number;
  /** De langste aaneengesloten reis: landen, periode en aantal posts. */
  mainCountries: string[];
  mainFirst: Date | null;
  mainLast: Date | null;
  mainPostCount: number;
  currentLocation: string;
}

const MAAND = new Intl.DateTimeFormat('nl-NL', { month: 'long' });
const MAAND_JAAR = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

const TELWOORDEN = [
  'nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes',
  'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf',
];

function landenVan(posts: Post[]): string[] {
  const uit: string[] = [];
  for (const post of posts) {
    for (const tag of post.tags) {
      const land = countryForTag(tag);
      if (land && !uit.includes(land.name)) uit.push(land.name);
    }
  }
  return uit;
}

/**
 * Knipt de posts in reizen. Zonder dit telt een losse post van een jaar later mee
 * in dezelfde adem als de grote reis: "van augustus 2025 tot augustus 2026 door
 * Colombia ... en Noorwegen" leest als één tocht van een jaar, wat het niet was.
 */
function splitsReizen(chronologisch: Post[]): Post[][] {
  if (chronologisch.length === 0) return [];
  const reizen: Post[][] = [[chronologisch[0]]];

  for (let i = 1; i < chronologisch.length; i++) {
    const dagen =
      (chronologisch[i].pubDate.getTime() - chronologisch[i - 1].pubDate.getTime()) / 86_400_000;
    if (dagen > REIS_GAT_DAGEN) reizen.push([chronologisch[i]]);
    else reizen[reizen.length - 1].push(chronologisch[i]);
  }
  return reizen;
}

export function buildJourneyFacts(posts: Post[]): JourneyFacts {
  const chronologisch = [...posts].sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
  const reizen = splitsReizen(chronologisch);

  // De hoofdreis is die met de meeste posts, niet per se de laatste.
  const hoofdreis = reizen.reduce<Post[]>(
    (beste, huidige) => (huidige.length > beste.length ? huidige : beste),
    []
  );

  return {
    countries: landenVan(chronologisch),
    postCount: chronologisch.length,
    mainCountries: landenVan(hoofdreis),
    mainFirst: hoofdreis[0]?.pubDate ?? null,
    mainLast: hoofdreis[hoofdreis.length - 1]?.pubDate ?? null,
    mainPostCount: hoofdreis.length,
    currentLocation: CURRENT_LOCATION,
  };
}

/** Nederlandse opsomming: "A, B en C". */
function joinNl(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} en ${items[items.length - 1]}`;
}

/** "drie maanden", "een jaar" — afgerond, want preciezer doet niemand iets. */
function duurInWoorden(van: Date, tot: Date): string {
  const dagen = Math.max(0, (tot.getTime() - van.getTime()) / 86_400_000);
  const maanden = dagen / 30.44;

  if (maanden < 1.5) return 'een maand';
  if (maanden < 11) {
    const n = Math.max(2, Math.round(maanden));
    return `${TELWOORDEN[n] ?? n} maanden`;
  }
  if (maanden < 18) return 'een jaar';
  const jaren = Math.round(maanden / 12);
  return `${TELWOORDEN[jaren] ?? jaren} jaar`;
}

/**
 * De zin die er altijd staat. Vorm: "Na <duur> door <landen> zit Niels nu in <plek>."
 */
export function fallbackSummary(facts: JourneyFacts): string {
  const { mainCountries, mainFirst, mainLast, currentLocation } = facts;

  if (!mainCountries.length || !mainFirst || !mainLast) {
    return `Niels zit op dit moment in ${currentLocation}.`;
  }

  const duur = duurInWoorden(mainFirst, mainLast);
  const voorzetsel = mainCountries.length === 1 ? 'in' : 'door';

  return `Na ${duur} ${voorzetsel} ${joinNl(mainCountries)} zit Niels nu in ${currentLocation}.`;
}

// ------------------------------------------------------------------ het model

const ALLE_MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function toegestaneMaanden(facts: JourneyFacts): string[] {
  const uit = new Set<string>();
  for (const d of [facts.mainFirst, facts.mainLast]) {
    if (d) uit.add(MAAND.format(d).toLowerCase());
  }
  return [...uit];
}

function toegestaneJaren(facts: JourneyFacts): string[] {
  const uit = new Set<string>();
  for (const d of [facts.mainFirst, facts.mainLast]) {
    if (d) uit.add(String(d.getFullYear()));
  }
  return [...uit];
}

/**
 * Twee zinnen is genoeg; daarboven is het model aan het doorratelen. Dubbele
 * zinnen worden eruit gegooid: een model dat blijft hangen herhaalt zichzelf, en
 * na afkappen op twee zinnen paste dat nog binnen de lengtegrens.
 */
function eersteTweeZinnen(tekst: string): string {
  const schoon = tekst.trim().replace(/^["'“”]|["'“”]$/g, '');
  const zinnen = schoon.match(/[^.!?]+[.!?]+/g);
  if (!zinnen) return schoon;

  const uniek: string[] = [];
  for (const zin of zinnen) {
    const genormaliseerd = zin.trim().toLowerCase().replace(/\s+/g, ' ');
    if (uniek.some((z) => z.trim().toLowerCase().replace(/\s+/g, ' ') === genormaliseerd)) continue;
    uniek.push(zin.trim());
    if (uniek.length === 2) break;
  }
  return uniek.join(' ').trim();
}

/**
 * Alles moet kloppen, anders gaat het antwoord de prullenbak in. Dit is de reden
 * dat er nooit onzin op de kaartpagina kan komen te staan.
 */
function isBruikbaar(tekst: string, facts: JourneyFacts): boolean {
  if (!tekst) return false;
  if (tekst.length > 240) return false;

  const laag = tekst.toLowerCase();

  // Moet zeggen waar hij nu is — dat is de helft van de opdracht.
  if (!laag.includes(facts.currentLocation.toLowerCase())) return false;

  // Geen maand noemen die niet in de feiten stond. Hier ging het eerder mis:
  // het model plakte er per land een verzonnen maand bij.
  const maandOk = toegestaneMaanden(facts);
  for (const maand of ALLE_MAANDEN) {
    if (laag.includes(maand) && !maandOk.includes(maand)) return false;
  }

  // Geen jaartal dat we niet gegeven hebben.
  const jaarOk = toegestaneJaren(facts);
  for (const jaar of laag.match(/\b(19|20)\d{2}\b/g) ?? []) {
    if (!jaarOk.includes(jaar)) return false;
  }

  // Geen land dat niet in de lijst staat.
  const landenLaag = facts.countries.map((c) => c.toLowerCase());
  const bekendeLanden = [
    'colombia', 'ecuador', 'peru', 'bolivia', 'chili', 'brazilie', 'brazilië',
    'noorwegen', 'griekenland', 'nederland', 'argentinie', 'argentinië',
    'mexico', 'spanje', 'portugal', 'italie', 'italië', 'frankrijk', 'duitsland',
  ];
  for (const land of bekendeLanden) {
    if (laag.includes(land) && !landenLaag.some((c) => c.includes(land) || land.includes(c))) {
      return false;
    }
  }

  return true;
}

function bouwPrompt(facts: JourneyFacts): { system: string; user: string } {
  const system = [
    'Je schrijft één zin Nederlands voor bovenaan een reisblog.',
    'Vorm: eerst kort waar de reiziger is geweest, dan waar hij nu is.',
    'Nuchtere, droge toon. Geen uitroeptekens. Maximaal 30 woorden.',
    'Verboden woorden: magisch, adembenemend, prachtig, avontuur, onvergetelijk.',
    'Noem GEEN maanden of jaartallen per land — die weet je niet.',
    'Gebruik uitsluitend de gegeven feiten en verzin niets.',
    'Antwoord met alleen die ene zin, zonder aanhalingstekens.',
  ].join(' ');

  const user = [
    `Landen in reisvolgorde: ${facts.mainCountries.join(', ') || 'onbekend'}.`,
    facts.mainFirst && facts.mainLast
      ? `Duur van de reis: ${duurInWoorden(facts.mainFirst, facts.mainLast)}.`
      : '',
    `Waar hij nu is: ${facts.currentLocation}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return { system, user };
}

/**
 * Eén keer per dag ververst via KV. De sleutel bevat de datum, het aantal posts en
 * de woonplaats, zodat een nieuwe post of een verhuizing meteen doorwerkt.
 */
export async function getJourneySummary(
  env: { ANALYTICS_KV?: KVNamespace; AI?: AiBinding },
  facts: JourneyFacts,
  ctx?: { waitUntil?: (p: Promise<unknown>) => void }
): Promise<string> {
  const terugval = fallbackSummary(facts);
  if (!GEBRUIK_AI || !env.AI) return terugval;

  const vandaag = new Date().toISOString().slice(0, 10);
  const key = `journey:v2:${vandaag}:${facts.postCount}:${facts.currentLocation.toLowerCase()}`;
  const kv = env.ANALYTICS_KV;

  if (kv) {
    const gecachet = await kv.get(key);
    if (gecachet) return gecachet;
  }

  const { system, user } = bouwPrompt(facts);

  const bezig = (async () => {
    try {
      const res = await env.AI!.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const tekst = eersteTweeZinnen(res.response ?? '');
      if (!isBruikbaar(tekst, facts)) {
        console.warn('[journey] antwoord afgekeurd, terugval gebruikt:', tekst.slice(0, 120));
        return terugval;
      }
      if (kv) await kv.put(key, tekst, { expirationTtl: 60 * 60 * 48 });
      return tekst;
    } catch (error) {
      console.error('[journey] samenvatting mislukt', error);
      return terugval;
    }
  })();

  ctx?.waitUntil?.(bezig);

  // Nooit langer dan 2,5s wachten: de kaartpagina moet staan.
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(terugval), 2500));
  return Promise.race([bezig, timeout]);
}
