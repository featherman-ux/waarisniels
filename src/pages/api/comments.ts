import type { APIContext } from 'astro';

// Helper function (this was in your _utils file, pasted here for clarity)
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

const bad = (msg = 'Bad Request', status = 400) =>
  jsonResponse({ error: msg }, status);

export const prerender = false;

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

// --- GET Function (Fixed with try/catch) ---
export async function GET(context: APIContext) {
  // This line was already correct
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("Comments GET: KV binding not found");
    return bad('KV not bound', 500);
  }

  // --- FIX: Added try/catch block for safety ---
  try {
    const url = new URL(context.request.url);
    const slug = url.searchParams.get('slug')?.trim();
    if (!slug) return bad('Missing slug');

    const raw = await kv.get(`comments:${slug}`);
    // This JSON.parse can fail if data is corrupt
    const list = raw ? JSON.parse(raw) : []; 
    return jsonResponse(list);

  } catch (error) {
    console.error("Comments GET failed:", error);
    return bad("Could not retrieve comments", 500);
  }
}

// --- POST Function (Fixed Binding Path AND Added try/catch) ---
export async function POST(context: APIContext) {
  // --- FIX 1: Changed this to the correct path (context.locals.runtime.env. ...) ---
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  
  if (!kv) {
    console.error("Comments POST: KV binding not found");
    return bad('KV not bound', 500);
  }

  // --- FIX 2: Added try/catch block for safety ---
  try {
    const body = (await context.request.json().catch(() => null)) as {
      slug?: unknown;
      message?: unknown;
      name?: unknown;
      website?: unknown;
    } | null;

    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const website = typeof body?.website === 'string' ? body.website.trim() : '';

    if (!slug) return bad('Missing slug');
    if (!message) return bad('Message required');
    if (website) return bad('Spam blocked'); // Honeypot caught spam

    const key = `comments:${slug}`;
    const raw = await kv.get(key);
     // This JSON.parse can fail
    const list = raw ? JSON.parse(raw) : [];

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    list.push({ id, slug, name: name || undefined, message, createdAt: now });

    await kv.put(key, JSON.stringify(list, null, 2));
    return jsonResponse({ ok: true, count: list.length, id }, 201);

  } catch (error) {
    console.error("Comments POST failed:", error);
    return bad("Could not save comment", 500);
  }
}
