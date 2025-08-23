// src/pages/api/analytics.ts
import type { APIRoute } from 'astro';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const kv = locals.runtime.env.bibbibib;
  const eventData = await request.json().catch(() => ({}));

  const timestamp = Date.now();
  const dayKey = new Date(timestamp).toISOString().slice(0, 10); // Formaat: YYYY-MM-DD
  const analyticsKey = `analytics:${dayKey}`;

  // Haal de bestaande data voor vandaag op
  const existingData: any[] = await kv.get(analyticsKey, { type: 'json' }) || [];

  // Voeg de nieuwe gebeurtenis toe
  existingData.push({
    timestamp,
    ...eventData,
  });

  // Sla de bijgewerkte lijst op
  await kv.put(analyticsKey, JSON.stringify(existingData));

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
};