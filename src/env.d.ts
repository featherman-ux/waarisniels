// src/env.d.ts
/// <reference types="astro/client" />

/**
 * Cloudflare-bindings die in de Worker beschikbaar zijn via
 * `context.locals.runtime.env`. Zie wrangler.toml + docs/cloudflare-setup.md.
 */
type ENV = {
  /** D1: posts + categories (migrations/0001_init.sql) */
  DB: D1Database;
  /** R2: alle foto's en video's, uitgeserveerd via media.waarisniels.nl */
  MEDIA: R2Bucket;
  /** Workers AI: plek-weetje + alt-tekst-suggesties */
  AI: {
    run(model: string, options: Record<string, unknown>): Promise<any>;
  };
  /** KV: view- en like-analytics, plus rate limiting op /api/subscribe */
  ANALYTICS_KV: KVNamespace;
  /** Resend API-key voor de mailnotificatie. Secret, niet in wrangler.toml. */
  RESEND_API_KEY?: string;
  /** Afzender, bv. "Niels <post@waarisniels.nl>". Domein geverifieerd bij Resend. */
  MAIL_FROM?: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<ENV>;

declare namespace App {
  interface Locals extends Runtime {}
}
