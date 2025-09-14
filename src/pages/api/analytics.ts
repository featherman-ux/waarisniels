import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

export async function OPTIONS() {
  // Allow only POST + OPTIONS
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function POST(context: APIContext) {
  // Bind your KV to ANALYTICS_KV in your env
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return jsonResponse({ error: 'KV not bound' }, 500);

  const evt = await context.request.json().catch(() => ({} as any));
  const id = crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10);

  await kv.put(`analytics:${day}:${id}`, JSON.stringify(evt));
  return jsonResponse({ ok: true });
}
