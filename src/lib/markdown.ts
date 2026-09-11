// src/lib/markdown.ts
// Posts komen als markdown uit D1 en worden op request gerenderd (output: 'server').
// Rauwe HTML blijft toegestaan: de bestaande posts gebruiken <div class="photo-grid">,
// <video> en YouTube-<iframe>. Het is uitsluitend eigen content, geen user input.

import { marked } from 'marked';
import { MEDIA_BASE, rewriteLegacyMedia } from './media';

marked.setOptions({
  gfm: true,
  breaks: true,   // enkele newline = <br>, past bij hoe Niels schrijft
});

/**
 * Marked zet losse markdown-afbeeldingen achter elkaar in één <p> met <br>'s
 * ertussen. Zo'n paragraaf met twee of meer foto's en verder niets is bedoeld
 * als fotoblok, dus die wordt automatisch een .photo-grid. Daardoor hoeft er in
 * een nieuwe post geen rauwe HTML meer getypt te worden: gewoon een paar
 * ![](...)-regels onder elkaar en het staat goed.
 *
 * Bestaande posts die de <div class="photo-grid"> al met de hand hebben blijven
 * werken — die raken we niet aan.
 */
function autoGroupImages(html: string): string {
  return html.replace(
    /<p>((?:\s|<br\s*\/?>|<img\b[^>]*>)+)<\/p>/gi,
    (whole, inner: string) => {
      const withoutImages = inner.replace(/<img\b[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '').trim();
      if (withoutImages) return whole; // er staat ook tekst in, met rust laten

      const images = inner.match(/<img\b[^>]*>/gi) ?? [];
      if (images.length < 2) return whole;

      return `<div class="photo-grid">${images.join('')}</div>`;
    }
  );
}

/**
 * Foto's in een postbody kwamen tot nu toe op ware grootte binnen: gemeten op
 * /blog/colombia/ een bestand van 1536x2048 voor een cel van ~350px breed. Op een
 * telefoon is dat het verschil tussen een pagina die meteen staat en een die
 * seconden staat te laden.
 *
 * rewriteLegacyMedia() zet /images/... om naar het mediadomein, maar zonder
 * transformatie. Hier gaat elke media-URL alsnog door Cloudflare Image
 * Transformations, met een srcset zodat de browser zelf de juiste maat kiest.
 * Al getransformeerde URL's (/cdn-cgi/image/...) worden overgeslagen.
 */
const BODY_WIDTHS = [480, 768, 1200, 1600];

/**
 * Wat een foto écht aan ruimte krijgt, zodat de browser niet standaard de
 * 1200px-variant pakt. Zie global.css: .photo-grid is twee kolommen onder 768px
 * en drie daarboven (container max 1100px), en de openingsfoto van een grid met
 * drie of meer foto's loopt over de volle breedte. Een losse foto staat in de
 * leeskolom van 68ch.
 *
 * Hiervoor stond op alles "100vw" voor mobiel — een cel van ~190px kreeg zo de
 * 1200px-variant binnen: op de Santa Cruz-post ruim een megabyte aan foto's.
 */
const SIZES_GRID_LEAD = '(min-width: 768px) min(1100px, 100vw), 100vw';
const SIZES_GRID_CELL = '(min-width: 768px) 360px, 50vw';
const SIZES_SOLO = '(min-width: 768px) 680px, 92vw';

function transformed(path: string, width: number): string {
  return `${MEDIA_BASE}/cdn-cgi/image/width=${width},format=auto,quality=80/${path}`;
}

const mediaSrcPattern = new RegExp(
  `src=("|')${MEDIA_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"']+)\\1`,
  'gi'
);

/** Eén <img> voorzien van srcset + sizes. Laat tags met rust die al klaar zijn. */
function withSources(tag: string, sizes: string): string {
  if (/\bsrcset\s*=/i.test(tag)) return tag;          // al geregeld
  if (tag.includes('/cdn-cgi/image/')) return tag;      // al getransformeerd

  let path: string | null = null;
  tag.replace(mediaSrcPattern, (_m, _q, p: string) => {
    path = p;
    return _m;
  });
  if (!path) return tag;

  const srcset = BODY_WIDTHS.map((w) => `${transformed(path!, w)} ${w}w`).join(', ');

  return tag
    .replace(/<img\b/i, `<img srcset="${srcset}" sizes="${sizes}"`)
    .replace(mediaSrcPattern, `src="${transformed(path, 1200)}"`);
}

function addResponsiveSources(html: string): string {
  // Eerst de fotogrids: daarbinnen hangt de juiste maat af van de positie, dus
  // die kunnen niet over één kam met de losse foto's eronder.
  const withGrids = html.replace(
    /(<div\b[^>]*class="[^"]*photo-grid[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/gi,
    (_whole, open: string, inner: string, close: string) => {
      const count = (inner.match(/<img\b[^>]*>/gi) ?? []).length;
      const leadIsFullWidth = count >= 3; // zie de :has()-regel in global.css
      let index = 0;
      const next = inner.replace(/<img\b[^>]*>/gi, (tag) =>
        withSources(tag, index++ === 0 && leadIsFullWidth ? SIZES_GRID_LEAD : SIZES_GRID_CELL)
      );
      return open + next + close;
    }
  );

  // Wat nu nog geen srcset heeft staat los in de leeskolom.
  return withGrids.replace(/<img\b[^>]*>/gi, (tag) => withSources(tag, SIZES_SOLO));
}

/**
 * Elke foto in een postbody lui laden en asynchroon decoderen. Scheelt op een
 * post met twintig foto's het grootste deel van het laadwerk bij de eerste paint.
 */
function addImageLoadingHints(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
    let next = attrs;
    if (!/\bloading\s*=/i.test(next)) next += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(next)) next += ' decoding="async"';
    if (!/\balt\s*=/i.test(next)) next += ' alt=""';
    return `<img${next}>`;
  });
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const html = marked.parse(md) as string;
  return addImageLoadingHints(addResponsiveSources(autoGroupImages(rewriteLegacyMedia(html))));
}

/** Platte tekst, voor excerpts / AI-prompts / meta-descriptions. */
export function stripMarkdown(md: string, maxLen = 300): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*`_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trimEnd()}…` : text;
}
