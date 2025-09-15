import type { APIContext } from 'astro';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export const prerender = false;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime?.env?.AI;
  
  // FIXED: Added logging to this check
  if (!ai) {
    console.error("AI service binding not found. Did you add [ai] to wrangler.toml?");
    return jsonResponse({ error: 'AI not available' }, 500);
  }

  try {
    const { prompt } = await context.request.json();
    if (!prompt) return jsonResponse({ error: 'Missing prompt' }, 400);

    const response = await ai.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: prompt
    });

    // Convert response to base64
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(response)));
    
    return jsonResponse({ 
      image: `data:image/png;base64,${base64Image}`,
      prompt: prompt,
      model: 'Flux Schnell'
    });

  } catch (error) {
    console.error('AI Image error:', error);
    return jsonResponse({ error: 'Image generation failed' }, 500);
  }
}