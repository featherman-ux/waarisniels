import type { APIContext } from 'astro';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export const prerender = false;

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime?.env?.AI;
  const vectorDB = context.locals.runtime?.env?.VECTORIZE_INDEX as VectorizeIndex | undefined;

  if (!ai || !vectorDB) {
    console.error("AI or Vectorize binding not found. Did you add them to wrangler.toml?");
    return jsonResponse({ error: 'AI services not available' }, 500);
  }

  try {
    const { message } = await context.request.json();
    if (!message) return jsonResponse({ error: 'Missing message' }, 400);

    // 1. Get embedding for the user's question
    const embeddingResponse = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [message]
    });
    const queryVector = embeddingResponse.data[0];

    // 2. Query the vector database for relevant content
    const searchResults = await vectorDB.query(queryVector, { topK: 3 });
    const contextChunks = searchResults.matches
      .map(match => match.metadata?.text)
      .filter(Boolean) as string[];

    const blogContext = contextChunks.length > 0
      ? `Here is some relevant context from Niels' blog posts: """${contextChunks.join('\n---\n')}"""`
      : "I couldn't find specific information from the blog on that topic.";

    // 3. Construct the prompt with the retrieved context
    const systemPrompt = `You are Niels' Virtual Travel Companion, an AI assistant with the soul of a seasoned traveler. You have access to all of Niels' blog posts and travel experiences. Your mission is to answer visitor questions about Niels' travels with engaging stories and details from the blog and act as a travel planner, suggesting itineraries and giving advice based on Niels' adventures.
    
    ${blogContext}
    
    Based on the context provided, answer the user's question. If the context doesn't contain the answer, say that you couldn't find the specific details in the blog but try to answer generally as a travel expert.`;

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    });

    return jsonResponse({ 
      response: response.response || 'Sorry, I could not process your request.',
      model: 'Llama 3.1 8B with RAG'
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    return jsonResponse({ error: 'AI service unavailable' }, 500);
  }
}