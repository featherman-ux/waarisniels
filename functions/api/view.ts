export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const kv = env.bibbibib as KVNamespace; // <— verander als je een andere binding-naam hebt
  const url = new URL(request.url);
  const key = `views:${url.searchParams.get("path") || url.pathname}`;

  // incr atomisch
  const current = (await kv.get(key)) || "0";
  const next = (parseInt(current, 10) || 0) + 1;
  await kv.put(key, String(next));

  return new Response(JSON.stringify({ views: next }), {
    headers: { "content-type": "application/json" },
  });
};