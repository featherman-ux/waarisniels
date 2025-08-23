// src/pages/api/comments.ts
import type { APIRoute } from 'astro';

// Definieer je types, net zoals je al had
type Comment = {
  id: string;
  slug: string;
  name: string;
  message: string;
  createdAt: string;
  ipHash?: string;
};

// CORS headers voor cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Functie voor een JSON-response
const jsonResponse = (data: unknown, init: ResponseInit = {}) => {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
    ...init,
  });
};
const badRequest = (msg: string, status = 400) => jsonResponse({ error: msg }, { status });

// Functie om het IP-adres te hashen
const hashIP = async (ip: string) => {
  const msgUint8 = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Handler voor OPTIONS (preflight requests voor CORS)
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};

// Handler voor GET requests (ophalen van comments)
export const GET: APIRoute = async ({ request, locals }) => {
  const kv = locals.runtime.env.bibbibib; // Toegang tot KV via locals
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) return badRequest('Missing slug');

  const key = `comments:${slug}`;
  const comments = await kv.get(key, { type: 'json' }) || [];
  return jsonResponse(comments);
};

// Handler voor POST requests (plaatsen van een comment)
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const kv = locals.runtime.env.bibbibib;

  const body = await request.json().catch(() => ({}));
  const { slug, name, message, website } = body ?? {};

  if (website) return badRequest('Spam detected', 422); // Honeypot
  if (!slug) return badRequest('Missing slug');
  if (typeof message !== 'string' || message.trim().length < 2) return badRequest('Message too short');

  // Rate limiting
  const ipHash = await hashIP(clientAddress);
  const rateLimitKey = `rate:${ipHash}`;
  if (await kv.get(rateLimitKey)) {
    return badRequest('Je plaatst reacties te snel.', 429);
  }
  await kv.put(rateLimitKey, '1', { expirationTtl: 30 }); // 30 seconden cooldown

  const item: Comment = {
    id: crypto.randomUUID(),
    slug,
    name: (String(name || 'Anoniem')).trim().slice(0, 60),
    message: String(message).trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };

  const commentsKey = `comments:${slug}`;
  const existingComments: Comment[] = await kv.get(commentsKey, { type: 'json' }) || [];
  const newComments = [...existingComments, item].slice(-500); // Max 500 comments

  await kv.put(commentsKey, JSON.stringify(newComments));

  return jsonResponse(item, { status: 201 });
};