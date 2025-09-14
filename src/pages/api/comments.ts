import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

type Comment = {
  id: string;
  slug: string;
  name?: string;
  message: string;
  createdAt: string;
};

const bad = (msg = 'Bad Request', status = 400) =>
  jsonResponse({ error: msg }, status);

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function GET(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return bad('KV not bound', 500);

  const url = new URL(context.request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) return bad('Missing slug');

  const raw = await kv.get(`comments:${slug}`);
  const list: Comment[] = raw ? JSON.parse(raw) : [];
  return jsonResponse(list);
}

export async function POST(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return bad('KV not bound', 500);

  const body = await context.request.json().catch(() => ({} as any));
  const slug = String(body.slug || '').trim();
  const message = String(body.message || '').trim();
  const name = String(body.name || '').trim();
  const website = String(body.website || '').trim(); // honeypot

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
  return jsonResponse({ ok: true, count: list.length, id }, 201);
}
