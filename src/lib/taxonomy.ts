// src/lib/taxonomy.ts
// Tags in D1 zijn vrije tekst en lopen door elkaar heen: landen ("Peru"),
// plaatsen ("Huaraz"), thema's ("Video", "Hiking"). Dit bestand is de enige
// plek die weet welke tag een land is, zodat chips, hubpagina's en de blogindex
// het allemaal op dezelfde manier zien.

import placesData from '../../public/data/places.json';

export interface Country {
  /** URL-segment: /blog/land/<slug>/ */
  slug: string;
  /** Weergavenaam in het Nederlands. */
  name: string;
  /** Tags die naar dit land verwijzen (genormaliseerd vergeleken). */
  aliases: string[];
  region: string;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
  notes?: string;
  country?: string;
}

/**
 * Handmatig, met opzet. Automatisch landen afleiden uit coördinaten vraagt een
 * reverse-geocoder per request; deze lijst is in tien seconden bij te werken als
 * er een land bij komt.
 */
export const COUNTRIES: Country[] = [
  { slug: 'colombia', name: 'Colombia', region: 'Zuid-Amerika', aliases: ['colombia'] },
  { slug: 'ecuador', name: 'Ecuador', region: 'Zuid-Amerika', aliases: ['ecuador', 'galapagos', 'galápagos', 'quito', 'andes'] },
  { slug: 'peru', name: 'Peru', region: 'Zuid-Amerika', aliases: ['peru', 'huaraz', 'cusco', 'machu picchu', 'salkantay'] },
  { slug: 'bolivia', name: 'Bolivia', region: 'Zuid-Amerika', aliases: ['bolivia', 'la paz', 'potosi', 'potosí', 'sucre', 'uyuni', 'isla del sol'] },
  { slug: 'chili', name: 'Chili', region: 'Zuid-Amerika', aliases: ['chili', 'chile', 'atacama'] },
  { slug: 'brazilie', name: 'Brazilië', region: 'Zuid-Amerika', aliases: ['brazilie', 'brazilië', 'brasil', 'rio de janeiro', 'sao paulo', 'são paulo'] },
  { slug: 'noorwegen', name: 'Noorwegen', region: 'Europa', aliases: ['noorwegen', 'norway', 'oslo'] },
  { slug: 'griekenland', name: 'Griekenland', region: 'Europa', aliases: ['griekenland', 'greece', 'athene', 'athens'] },
  { slug: 'nederland', name: 'Nederland', region: 'Europa', aliases: ['nederland', 'holland'] },
];

/** Welk land hoort bij welke stop op de kaart. Zie public/data/places.json. */
export const PLACE_COUNTRY: Record<string, string> = {
  'Medellín': 'colombia',
  'Cocorná': 'colombia',
  'Santa Marta': 'colombia',
  'Riohacha': 'colombia',
  'Cabo de la Vela': 'colombia',
  'Costeño Beach': 'colombia',
  'Cartagena': 'colombia',
  'Quito': 'ecuador',
  'Quilotoa-kratermeer': 'ecuador',
  'Llullu Llama Lodge (Isinliví)': 'ecuador',
  'Santa Cruz (Galápagos)': 'ecuador',
  'Isabela (Puerto Villamil)': 'ecuador',
  'San Cristóbal (Puerto Baquerizo Moreno)': 'ecuador',
  'Guayaquil': 'ecuador',
  'Máncora': 'peru',
  'Huanchaco': 'peru',
  'Huaraz': 'peru',
  'Lima': 'peru',
  'Cusco': 'peru',
  'Isla del Sol': 'bolivia',
  'La Paz': 'bolivia',
  'Uyuni': 'bolivia',
  'Sucre': 'bolivia',
  'Santa Cruz de la Sierra': 'bolivia',
  'San Pedro de Atacama': 'chili',
  'Chañaral': 'chili',
  'Parque Nacional Pan de Azúcar': 'chili',
  'Calama': 'chili',
  'Corumbá (grens Brazilië)': 'brazilie',
  'São Paulo': 'brazilie',
  'Rio de Janeiro': 'brazilie',
  'Salvador': 'brazilie',
  'Itacaré': 'brazilie',
};

/** Accenten en hoofdletters weg, zodat "Brazilië" en "brazilie" matchen. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Slug voor een vrije tag, voor /blog/tag/<slug>/. */
export function tagSlug(tag: string): string {
  return normalize(tag).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ALIAS_INDEX = new Map<string, Country>();
for (const country of COUNTRIES) {
  ALIAS_INDEX.set(normalize(country.name), country);
  for (const alias of country.aliases) ALIAS_INDEX.set(normalize(alias), country);
}

/** Is deze tag een land (of een plaats die eenduidig bij één land hoort)? */
export function countryForTag(tag: string): Country | undefined {
  return ALIAS_INDEX.get(normalize(tag));
}

export function countryBySlug(slug: string): Country | undefined {
  return COUNTRIES.find((c) => c.slug === slug);
}

/**
 * Waar een chip heen linkt. Landen krijgen de hubpagina, al het andere het
 * gewone tagarchief — zo bestaat er precies één pagina per onderwerp.
 */
export function tagHref(tag: string): string {
  const country = countryForTag(tag);
  return country ? `/blog/land/${country.slug}/` : `/blog/tag/${tagSlug(tag)}/`;
}

/** Stops op de route die in dit land liggen, in reisvolgorde. */
export function placesInCountry(slug: string): Place[] {
  return (placesData as Place[]).filter((p) => PLACE_COUNTRY[p.name] === slug);
}

/** Alle stops met hun land erbij, voor de kaart en de blogindex. */
export function allPlaces(): Place[] {
  return (placesData as Place[]).map((p) => ({ ...p, country: PLACE_COUNTRY[p.name] }));
}

/** Hoort deze post bij dit land? Kijkt naar alle tags van de post. */
export function postMatchesCountry(tags: string[], slug: string): boolean {
  return tags.some((t) => countryForTag(t)?.slug === slug);
}

/** De landen waar daadwerkelijk posts over bestaan, in reisvolgorde van COUNTRIES. */
export function countriesWithPosts(posts: { tags: string[] }[]): (Country & { count: number })[] {
  return COUNTRIES.map((country) => ({
    ...country,
    count: posts.filter((p) => postMatchesCountry(p.tags, country.slug)).length,
  })).filter((c) => c.count > 0);
}

/** Alle niet-land-tags met hun aantal, aflopend. Voor het tagoverzicht. */
export function themeTags(posts: { tags: string[] }[]): { label: string; slug: string; count: number }[] {
  const seen = new Map<string, { label: string; slug: string; count: number }>();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (countryForTag(tag)) continue; // landen hebben hun eigen hub
      const slug = tagSlug(tag);
      const entry = seen.get(slug);
      if (entry) entry.count += 1;
      else seen.set(slug, { label: tag, slug, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
