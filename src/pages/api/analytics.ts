// src/pages/api/analytics.ts
import type { APIContext } from 'astro';

export const prerender = false;

type Json = Record<string, any>;
const ok = (json: Json, status = 200) =>
  new Response(JSON.stringify(json), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(context: APIContext) {
  const env = (context.locals as any)?.runtime?.env as { bibbibib?: KVNamespace } | undefined;
  const kv = env?.bibbibib;
  if (!kv) return ok({ error: 'KV not bound' }, 500);

  const evt = await context.request.json().catch(() => ({} as any));
  const id = crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  await kv.put(`analytics:${day}:${id}`, JSON.stringify(evt));
  return ok({ ok: true });
}