// src/pages/api/like.ts
import type { APIContext } from 'astro';

export const prerender = false;

const ok = (json: any, status = 200) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
const bad = (msg = 'Bad Request', status = 400) => ok({ error: msg }, status);

export async function GET(context: APIContext) {
  const env = (context.locals as any)?.runtime?.env as { bibbibib?: KVNamespace } | undefined;
  const kv = env?.bibbibib;
  if (!kv) return bad('KV not bound', 500);

  const url = new URL(context.request.url);
  const key = url.searchParams.get('key')?.trim() || 'site';
  const kvKey = `likes:${key}`;
  const raw = await kv.get(kvKey);
  const count = raw ? Number(raw) || 0 : 0;
  return ok({ key, count });
}

export async function POST(context: APIContext) {
  const env = (context.locals as any)?.runtime?.env as { bibbibib?: KVNamespace } | undefined;
  const kv = env?.bibbibib;
  if (!kv) return bad('KV not bound', 500);

  const body = await context.request.json().catch(() => ({} as any));
  const key = String(body?.key || 'site');
  const kvKey = `likes:${key}`;
  const raw = await kv.get(kvKey);
  const current = raw ? Number(raw) || 0 : 0;
  const next = current + 1;
  await kv.put(kvKey, String(next));
  return ok({ key, count: next });
}