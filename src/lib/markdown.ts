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

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const html = marked.parse(md) as string;
  return rewriteLegacyMedia(html);
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
