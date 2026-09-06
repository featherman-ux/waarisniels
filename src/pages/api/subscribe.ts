// src/pages/api/subscribe.ts
// Aanmelden voor een mailtje bij een nieuwe post. Dubbele opt-in: pas na een
// klik in de bevestigingsmail staat iemand echt op de lijst.
import type { APIContext } from 'astro';
import { isValidEmail, normalizeEmail, startSubscription } from '../../lib/subscribers';
import { confirmMail, sendMail, MailNotConfiguredError } from '../../lib/mail';
import { jsonResponse } from './_utils';

export const prerender = false;

/** Hetzelfde antwoord voor elk geldig adres — of iemand al op de lijst staat
 *  is niets wat een willekeurige bezoeker via dit endpoint hoort te kunnen testen. */
const OK_MESSAGE = 'Check je mail — er staat een bevestigingslink klaar.';

const RATE_LIMIT_PER_HOUR = 5;

export async function OPTIONS() {
  // 204 mag geen body hebben, dus niet via jsonResponse.
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function overRateLimit(kv: KVNamespace | undefined, ip: string): Promise<boolean> {
  if (!kv) return false;
  const key = `subscribe:rate:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const current = Number((await kv.get(key)) ?? '0');
  if (current >= RATE_LIMIT_PER_HOUR) return true;
  await kv.put(key, String(current + 1), { expirationTtl: 3600 });
  return false;
}

export async function POST(context: APIContext) {
  const env = context.locals.runtime.env;
  const db = env.DB;

  let email = '';
  let honeypot = '';
  let source: string | null = null;

  try {
    const contentType = context.request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await context.request.json()) as Record<string, unknown>;
      email = String(body.email ?? '');
      honeypot = String(body.website ?? '');
      source = body.source ? String(body.source).slice(0, 120) : null;
    } else {
      const form = await context.request.formData();
      email = String(form.get('email') ?? '');
      honeypot = String(form.get('website') ?? '');
      source = form.get('source') ? String(form.get('source')).slice(0, 120) : null;
    }
  } catch {
    return jsonResponse({ error: 'Onleesbaar verzoek' }, 400);
  }

  // Honeypot: een echt mens ziet dit veld niet en vult het dus nooit in.
  // Bewust een 200 terug, zodat een bot niet leert dat hij herkend is.
  if (honeypot.trim()) return jsonResponse({ ok: true, message: OK_MESSAGE });

  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Dat lijkt geen geldig e-mailadres.' }, 400);
  }

  const ip = context.request.headers.get('cf-connecting-ip') ?? 'onbekend';
  if (await overRateLimit(env.ANALYTICS_KV, ip)) {
    return jsonResponse({ error: 'Even wachten — probeer het over een uur nog eens.' }, 429);
  }

  const normalized = normalizeEmail(email);

  try {
    const { subscriber, alreadyConfirmed } = await startSubscription(db, normalized, source);

    if (!alreadyConfirmed) {
      const origin = (import.meta.env.SITE ?? context.url.origin).replace(/\/$/, '');
      const confirmUrl = `${origin}/nieuwsbrief/bevestigen/?token=${subscriber.confirmToken}`;
      await sendMail(env, { to: subscriber.email, ...confirmMail(confirmUrl) });
    }

    return jsonResponse({ ok: true, message: OK_MESSAGE });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      console.error('[subscribe] mail niet geconfigureerd', error);
      return jsonResponse(
        { error: 'Aanmelden kan nu even niet. Probeer het later nog eens.' },
        503
      );
    }
    console.error('[subscribe] mislukt', error);
    return jsonResponse({ error: 'Er ging iets mis. Probeer het later nog eens.' }, 500);
  }
}
