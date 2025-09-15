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
  
  // FIXED: This now logs the error
  if (!ai) {
    console.error("AI service binding not found. Did you add [ai] to wrangler.toml?");
    return jsonResponse({ error: 'AI not available' }, 500);
  }

  try {
    const { message } = await context.request.json();
    if (!message) return jsonResponse({ error: 'Missing message' }, 400);

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are Niels AI assistant, a helpful and friendly chatbot on Niels\' website. Keep responses concise and helpful.'
        },
        {
          role: 'user',
          content: message
        }
      ]
    });

    return jsonResponse({ 
      response: response.response || 'Sorry, I could not process your request.',
      model: 'Llama 3.1 8B'
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    return jsonResponse({ error: 'AI service unavailable' }, 500);
  }
}