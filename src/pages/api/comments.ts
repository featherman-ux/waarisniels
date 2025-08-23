// src/pages/api/comments.ts
import type { APIContext } from 'astro';

export const prerender = false;

type Comment = {
  id: string;
  slug: string;
  name?: string;
  message: string;
  createdAt: string;
};

const ok = (json: any, status = 200) =>
  new Response(JSON.stringify(json), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

const bad = (msg = 'Bad Request', status = 400) => ok({ error: msg }, status);

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(context: APIContext) {
  const env = (context.locals as any)?.runtime?.env as { bibbibib?: KVNamespace } | undefined;
  const kv = env?.bibbibib;
  if (!kv) return bad('KV not bound', 500);

  const url = new URL(context.request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) return bad('Missing slug');

  const key = `comments:${slug}`;
  const raw = await kv.get(key);
  const list: Comment[] = raw ? JSON.parse(raw) : [];
  return ok(list);
}

export async function POST(context: APIContext) {
  const env = (context.locals as any)?.runtime?.env as { bibbibib?: KVNamespace } | undefined;
  const kv = env?.bibbibib;
  if (!kv) return bad('KV not bound', 500);

  const body = await context.request.json().catch(() => ({} as any));
  const slug = String(body?.slug || '').trim();
  const message = String(body?.message || '').trim();
  const name = String(body?.name || '').trim();
  const website = String(body?.website || '').trim(); // honeypot

  if (!slug) return bad('Missing slug');
  if (!message) return bad('Message required');
  if (website) return bad('Spam blocked');

  const key = `comments:${slug}`;
  const raw = await kv.get(key);
  const list: Comment[] = raw ? JSON.parse(raw) : [];

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  list.push({ id, slug, name: name || undefined, message, createdAt: now });

  await kv.put(key, JSON.stringify(list, null, 2));
  return ok({ ok: true, count: list.length, id }, 201);
}