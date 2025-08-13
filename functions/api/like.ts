// Increment like counter
export async function onRequestPost({ request, env }: { request: Request; env: any }) {
  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? 'site');

  const current = Number((await env.bibbibib.get(key)) ?? 0);
  const next = current + 1;

  await env.bibbibib.put(key, String(next));
  return new Response(JSON.stringify({ count: next }), {
    headers: { 'content-type': 'application/json' },
  });
}

// Get current like count
export async function onRequestGet({ request, env }: { request: Request; env: any }) {
  const { searchParams } = new URL(request.url);
  const key = String(searchParams.get('key') ?? 'site');

  const current = Number((await env.bibbibib.get(key)) ?? 0);
  return new Response(JSON.stringify({ count: current }), {
    headers: { 'content-type': 'application/json' },
  });
}