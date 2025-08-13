export async function onRequestPost({ request, env }: { request: Request; env: any }) {
  const evt = await request.json().catch(() => ({}));
  const ts = Date.now();

  // Schrijf een eenvoudige log onder een dag-key
  const dayKey = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = (await env.bibbibib.get(dayKey)) ?? '[]';
  const arr = JSON.parse(raw);
  arr.push({ ts, ...evt });
  await env.bibbibib.put(dayKey, JSON.stringify(arr));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
}