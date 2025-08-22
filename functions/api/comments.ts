export interface Env { bibbibib: KVNamespace }

type Comment = {
  id: string;
  slug: string;
  name: string;
  message: string;
  createdAt: string;
  ipHash?: string;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
    ...init,
  });
}
const bad = (msg: string, status = 400) => json({ error: msg }, { status });

function hashIP(ip: string) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0;
  return String(h);
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return bad('Missing slug');

  const key = `comments:${slug}`;
  const raw = (await env.bibbibib.get(key)) || '[]';
  return json(JSON.parse(raw));
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (request.headers.get('content-type')?.includes('application/json') !== true) {
    return bad('Expected JSON body');
  }

  const body = await request.json().catch(() => ({} as any));
  const { slug, name, message, website } = body ?? {};

  if (website) return bad('Spam detected', 422);
  if (!slug) return bad('Missing slug');
  if (typeof message !== 'string' || message.trim().length < 2) return bad('Message too short');

  const cleanMsg = message.trim().slice(0, 1000);
  const cleanName = (typeof name === 'string' ? name : '').trim().slice(0, 60) || 'Anoniem';

  // Throttle: max 1 post / 30s / IP
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipKey = `rate:${hashIP(ip)}`;
  const already = await env.bibbibib.get(ipKey);
  if (already) return bad('Even rustig aan 😉', 429);
  await env.bibbibib.put(ipKey, '1', { expirationTtl: 30 });

  const key = `comments:${slug}`;
  const now = new Date().toISOString();
  const list: Comment[] = JSON.parse((await env.bibbibib.get(key)) || '[]');

  const item: Comment = {
    id: crypto.randomUUID(),
    slug,
    name: cleanName,
    message: cleanMsg,
    createdAt: now,
    ipHash: hashIP(ip),
  };

  const MAX_PER_POST = 500;
  const next = [...list, item].slice(-MAX_PER_POST);

  await env.bibbibib.put(key, JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 730, // 2 years
  });

  return json(item, { status: 201 });
};