// src/lib/markdown.ts
// Posts komen als markdown uit D1 en worden op request gerenderd (output: 'server').
// Rauwe HTML blijft toegestaan: de bestaande posts gebruiken <div class="photo-grid">,
// <video> en YouTube-<iframe>. Het is uitsluitend eigen content, geen user input.

import { marked } from 'marked';
import { rewriteLegacyMedia } from './media';

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
  return addImageLoadingHints(autoGroupImages(rewriteLegacyMedia(html)));
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
