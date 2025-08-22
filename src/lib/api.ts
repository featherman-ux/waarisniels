// src/lib/api.ts
export function apiUrl(path: string) {
  // In Astro dev server (4321) => praat met Wrangler Pages dev (8788).
  if (typeof window !== 'undefined') {
    if (window.location.port === '4321') {
      return `http://localhost:8788${path}`;
    }
  }
  // In productie op Cloudflare Pages (zelfde domein)
  return path;
}