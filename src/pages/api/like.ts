import type { APIContext } from 'astro';
// Assuming this helper file is in: /src/pages/api/_utils.ts
import { jsonResponse } from './_utils'; 

export const prerender = false;

const bad = (msg = 'Bad Request', status = 400) =>
  jsonResponse({ error: msg }, status);

export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("Like GET: KV binding not found");
    return bad('KV not bound', 500);
  }

  try {
    const url = new URL(context.request.url);
    const key = url.searchParams.get('key')?.trim() || 'site';
    const raw = await kv.get(`likes:${key}`);
    const count = raw ? Number(raw) || 0 : 0;
    return jsonResponse({ key, count });

  } catch (error) {
    console.error("Like GET failed:", error);
    return bad("Could not retrieve likes", 500);
  }
}

export async function POST(context: APIContext) {
  // --- THIS IS OUR NEW TEST LINE ---
  console.log("--- LIKE FUNCTION STARTED (NEW DEPLOYMENT) ---"); 

  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  
  if (!kv) {
    console.error("Like POST: KV binding not found");
    return bad('KV not bound', 500);
  }

  try {
    const body = await context.request.json().catch(() => ({} as any));
    const key = String(body.key || 'site');
    const kvKey = `likes:${key}`;
    const raw = await kv.get(kvKey);
    const current = raw ? Number(raw) || 0 : 0;
    const next = current + 1;

    await kv.put(kvKey, String(next));
    return jsonResponse({ key, count: next });

  } catch (error) {
    console.error("Like POST failed:", error);
    return bad("Could not update like count", 500);
  }
}