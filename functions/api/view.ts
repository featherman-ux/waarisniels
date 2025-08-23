// src/pages/api/views.ts
import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const GET: APIRoute = async ({ request, locals }) => {
  const kv = locals.runtime.env.bibbibib;
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? url.pathname;
  const key = `views:${path}`;

  // Haal de huidige waarde op, of 0 als deze niet bestaat
  const currentViews = parseInt(await kv.get(key) || '0', 10);
  const nextViews = currentViews + 1;

  // Sla de nieuwe waarde op
  await kv.put(key, nextViews.toString());

  return new Response(JSON.stringify({ views: nextViews }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
};