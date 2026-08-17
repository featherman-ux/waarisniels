// src/lib/media.ts
// R2-keys -> publieke URL's. Media wordt uitgeserveerd via het R2 custom domain
// media.waarisniels.nl (gratis, geen egress, CDN-cache). Zie docs/cloudflare-setup.md.

export const MEDIA_BASE = 'https://media.waarisniels.nl';

/**
 * R2-keys mogen spaties bevatten (de oude mappen deden dat: "Santa Cruz/bergen.webp"),
 * maar in een URL moeten die geescaped worden. Nieuwe uploads en gemigreerde keys zijn
 * al slug-safe; dit is het vangnet voor de rest.
 */
function encodeKey(key: string): string {
  return key
    .replace(/%(?![0-9a-f]{2})/gi, '%25')
    .replace(/ /g, '%20')
    .replace(/\?/g, '%3F')
    .replace(/#/g, '%23');
}

/** Legacy pad (/images/...) of R2-key -> volledige media-URL. */
export function mediaUrl(key?: string | null): string | undefined {
  if (!key) return undefined;
  const k = key.trim();
  if (!k) return undefined;
  if (/^https?:\/\//i.test(k)) return k;                 // al absoluut
  return `${MEDIA_BASE}/${encodeKey(k.replace(/^\/+/, ''))}`;
}

/**
 * Veiligheidsnet voor gemigreerde bodies: als er ergens nog een oud
 * /images/...-pad in de HTML staat, wordt die alsnog naar R2 gewezen.
 */
export function rewriteLegacyMedia(html: string): string {
  return html.replace(
    /(src|poster|href)=("|')\/images\/([^"']+)\2/gi,
    (_m, attr, q, rest) => `${attr}=${q}${MEDIA_BASE}/images/${encodeKey(rest)}${q}`
  );
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbed(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

/** Bestandsextensie -> mediatype dat we in de media[]-JSON gebruiken. */
export function mediaTypeFor(filename: string): 'photo' | 'video' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif'].includes(ext)) return 'photo';
  if (['mp4', 'mov', 'm4v', 'webm'].includes(ext)) return 'video';
  return null;
}

/** R2-key voor een nieuwe upload: uploads/<jaar>/<maand>/<uuid>.<ext> */
export function newUploadKey(filename: string, at: Date = new Date()): string {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'bin').replace(/[^a-z0-9]/g, '');
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;
}
