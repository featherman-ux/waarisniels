export const onRequestGet: PagesFunction<{ bibbibib: KVNamespace }> = async ({ env }) => {
  const key = 'selftest:key';
  try {
    await env.bibbibib.put(key, 'ok', { expirationTtl: 60 });
    const val = await env.bibbibib.get(key);
    const list = await env.bibbibib.list({ prefix: 'selftest:' });
    await env.bibbibib.delete(key);
    return new Response(JSON.stringify({ put: 'ok', get: val, listCount: list.keys.length }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};