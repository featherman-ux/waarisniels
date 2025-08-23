// src/pages/api/likes.ts
import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};

// Functie om het huidige aantal likes op te halen
export const GET: APIRoute = async ({ request, locals }) => {
  const kv = locals.runtime.env.bibbibib;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? 'site';
  const likeKey = `like:${key}`;

  const currentLikes = parseInt(await kv.get(likeKey) || '0', 10);

  return new Response(JSON.stringify({ count: currentLikes }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
};

// Functie om een like toe te voegen
export const POST: APIRoute = async ({ request, locals }) => {
  const kv = locals.runtime.env.bibbibib;
  const body = await request.json().catch(() => ({}));
  const key = body.key ?? 'site';
  const likeKey = `like:${key}`;

  const currentLikes = parseInt(await kv.get(likeKey) || '0', 10);
  const nextLikes = currentLikes + 1;

  await kv.put(likeKey, nextLikes.toString());

  return new Response(JSON.stringify({ count: nextLikes }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
};