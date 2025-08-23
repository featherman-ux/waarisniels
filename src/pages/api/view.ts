// src/pages/api/view.ts
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
  const path = url.searchParams.get('path')?.trim();
  if (!path) return bad('Missing path');

  const key = `views:${path}`;
  const raw = await kv.get(key);
  const views = raw ? Number(raw) || 0 : 0;

  // optional: increment on each read
  await kv.put(key, String(views + 1));

  return ok({ path, views: views + 1 });
}