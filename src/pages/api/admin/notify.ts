// src/pages/api/admin/notify.ts
// Stuurt een post naar iedereen op de lijst. Beveiliging loopt via Cloudflare
// Access op /api/admin (zie docs/cloudflare-setup.md §5) — net als de andere
// admin-endpoints doet dit bestand zelf geen auth-check.
//
// POST { slug: "brasil", force?: true, testTo?: "mij@example.com" }
import type { APIContext } from 'astro';
import { getPostBySlug } from '../../../lib/db';
import { mediaUrl } from '../../../lib/media';
import {
  listConfirmed,
  listNotifications,
  markNotified,
  wasNotified,
  countByStatus,
} from '../../../lib/subscribers';
import { newPostMail, sendBatch, sendMail, MailNotConfiguredError } from '../../../lib/mail';
import { jsonResponse, requireAccess } from '../_utils';

export const prerender = false;

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

/** Aantallen + wat er al gemaild is. Voedt de knop in /beheer. */
export async function GET(context: APIContext) {
  const denied = requireAccess(context);
  if (denied) return denied;

  const db = context.locals.runtime.env.DB;
  const [counts, notified] = await Promise.all([countByStatus(db), listNotifications(db)]);
  return jsonResponse({ counts, notified });
}

export async function POST(context: APIContext) {
  const denied = requireAccess(context);
  if (denied) return denied;

  const env = context.locals.runtime.env;
  const db = env.DB;

  let slug = '';
  let force = false;
  let testTo: string | null = null;

  try {
    const body = (await context.request.json()) as Record<string, unknown>;
    slug = String(body.slug ?? '').trim();
    force = body.force === true;
    testTo = body.testTo ? String(body.testTo) : null;
  } catch {
    return jsonResponse({ error: 'Onleesbaar verzoek' }, 400);
  }

  if (!slug) return jsonResponse({ error: 'slug ontbreekt' }, 400);

  const post = await getPostBySlug(db, slug);
  if (!post) return jsonResponse({ error: `Geen gepubliceerde post met slug "${slug}"` }, 404);

  const origin = (import.meta.env.SITE ?? context.url.origin).replace(/\/$/, '');
  const postInput = {
    title: post.title,
    description: post.description,
    url: `${origin}/blog/${post.slug}/`,
    coverUrl: mediaUrl(post.cover?.key, { width: 960 }) ?? null,
    readMinutes: post.readMinutes,
  };

  try {
    // Testmail: één adres, telt niet als verzonden.
    if (testTo) {
      const unsubscribeUrl = `${origin}/nieuwsbrief/afmelden/?token=test`;
      await sendMail(env, {
        to: testTo,
        unsubscribeUrl,
        ...newPostMail(postInput, unsubscribeUrl),
      });
      return jsonResponse({ ok: true, test: true, to: testTo });
    }

    if (!force && (await wasNotified(db, slug))) {
      return jsonResponse(
        { error: 'Deze post is al gemaild. Stuur force: true mee om het toch te doen.' },
        409
      );
    }

    const subscribers = await listConfirmed(db);
    if (subscribers.length === 0) {
      return jsonResponse({ ok: true, sent: 0, message: 'Nog niemand op de lijst.' });
    }

    const mails = subscribers.map((sub) => {
      const unsubscribeUrl = `${origin}/nieuwsbrief/afmelden/?token=${sub.unsubscribeToken}`;
      return {
        to: sub.email,
        unsubscribeUrl,
        ...newPostMail(postInput, unsubscribeUrl),
      };
    });

    const result = await sendBatch(env, mails);
    await markNotified(db, slug, result.sent);

    return jsonResponse({
      ok: result.failed === 0,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      return jsonResponse({ error: String(error.message) }, 503);
    }
    console.error('[notify] mislukt', error);
    return jsonResponse({ error: 'Verzenden mislukt' }, 500);
  }
}
