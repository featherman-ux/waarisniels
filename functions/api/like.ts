export interface Env { bibbibib: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { searchParams } = new URL(request.url);
  const key = String(searchParams.get('key') ?? 'site');
  const current = Number((await env.bibbibib.get(`like:${key}`)) ?? 0);
  return new Response(JSON.stringify({ count: current }), {
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? 'site');
  const k = `like:${key}`;
  const current = Number((await env.bibbibib.get(k)) ?? 0);
  const next = current + 1;
  await env.bibbibib.put(k, String(next));
  return new Response(JSON.stringify({ count: next }), {
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};