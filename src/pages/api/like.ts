import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

const bad = (msg = 'Bad Request', status = 400) =>
  jsonResponse({ error: msg }, status);

export async function GET(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return bad('KV not bound', 500);

  const url = new URL(context.request.url);
  const key = url.searchParams.get('key')?.trim() || 'site';
  const raw = await kv.get(`likes:${key}`);
  const count = raw ? Number(raw) || 0 : 0;
  return jsonResponse({ key, count });
}

export async function POST(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return bad('KV not bound', 500);

  const body = await context.request.json().catch(() => ({} as any));
  const key = String(body.key || 'site');
  const kvKey = `likes:${key}`;
  const raw = await kv.get(kvKey);
  const current = raw ? Number(raw) || 0 : 0;
  const next = current + 1;

  await kv.put(kvKey, String(next));
  return jsonResponse({ key, count: next });
}
