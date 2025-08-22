export interface Env { bibbibib: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const path = String(url.searchParams.get('path') ?? url.pathname);
  const k = `views:${path}`;
  const current = parseInt((await env.bibbibib.get(k)) || '0', 10) || 0;
  const next = current + 1;
  await env.bibbibib.put(k, String(next));
  return new Response(JSON.stringify({ views: next }), {
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};