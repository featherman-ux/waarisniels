export interface Env { bibbibib: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const evt = await request.json().catch(() => ({}));
  const ts = Date.now();
  const dayKey = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD

  const raw = (await env.bibbibib.get(`analytics:${dayKey}`)) ?? '[]';
  const arr = JSON.parse(raw);
  arr.push({ ts, ...evt });
  await env.bibbibib.put(`analytics:${dayKey}`, JSON.stringify(arr));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
};