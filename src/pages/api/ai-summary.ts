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

// Helper to safely read from KV
async function safeGetJson(kv: KVNamespace, key: string, defaultValue: any = {}) {
  const raw = await kv.get(key);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Corrupt KV data at key: ${key}`);
    return defaultValue;
  }
}

export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  const ai = context.locals?.runtime?.env?.AI as any | undefined;
  
  if (!kv || !ai) {
    return jsonResponse({ error: "Required bindings (KV or AI) not found" }, 500);
  }

  try {
    // 1. Get the raw analytics data from KV
    const allViewsData = await safeGetJson(kv, 'views_all_data', {});

    // 2. Aggregate the data just for the prompt
    const referrers: { [key: string]: number } = {};
    const countries: { [key: string]: number } = {};
    let totalViews = 0;
    
    Object.values(allViewsData).forEach((d: any) => {
      if (typeof d !== 'object' || d === null) return;
      totalViews += (d.total || 0);
      Object.entries(d.referrers || {}).forEach(([r, v]: [string, any]) => {
        referrers[r] = (referrers[r] || 0) + (v || 0);
      });
      Object.entries(d.countries || {}).forEach(([c, v]: [string, any]) => {
        countries[c] = (countries[c] || 0) + (v || 0);
      });
    });

    // Get the top 3 of each
    const topReferrers = Object.fromEntries(
      Object.entries(referrers).sort((a, b) => b[1] - a[1]).slice(0, 3)
    );
    const topCountries = Object.fromEntries(
      Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 3)
    );

    // 3. Build a prompt for the AI
    const dataForPrompt = { totalViews, topCountries, topReferrers };
    const prompt = `You are a friendly data analyst for a personal travel blog. Based on this summary JSON, provide one friendly, concise insight (one sentence only) for the blog owner. Focus on the most interesting fact. Data: ${JSON.stringify(dataForPrompt)}`;

    const aiResponse = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a friendly data analyst. Respond in one concise, encouraging sentence.' },
        { role: 'user', content: prompt }
      ]
    });

    return jsonResponse({ insight: aiResponse.response || 'Traffic analysis is running.' });

  } catch (error: any) {
    console.error("AI Summary Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function POST(context: APIContext) {
  const ai = context.locals.runtime?.env?.AI;
  if (!ai) {
    console.error("AI service binding not found.");
    return jsonResponse({ error: 'AI not available' }, 500);
  }

  try {
    const { content } = await context.request.json();
    if (!content) {
      return jsonResponse({ error: 'Missing content for summary' }, 400);
    }

    // Clean up the content a bit before sending
    const cleanContent = content
      .replace(/---[\s\S]*?---/, '') // Remove frontmatter
      .replace(/<[^>]*>?/gm, '')   // Remove HTML tags
      .replace(/[#*`_~]/g, '')      // Remove markdown characters
      .replace(/\s+/g, ' ')        // Normalize whitespace
      .trim();

    const systemPrompt = `Je bent Niels, een Nederlandse travelblogger met veel enthousiasme. Schrijf maximaal twee zinnen in de ik-vorm, warm en spontaan, alsof je vrienden bijpraat. Gebruik in totaal hooguit 60 woorden en verwerk minimaal één van deze uitspraken op een natuurlijke manier: "heeee meiden", "gasten facking mooi", "ken gebeuren", "magisch mooi". Vermijd inleidingen zoals "Hier is" of "Samenvatting". Focus op het gevoel van de trip en één opvallend detail.`;

    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Dit is de blogpost-inhoud waar je kort op reageert: """${cleanContent}"""` }
      ]
    });

    return jsonResponse({ 
      summary: response.response || 'Could not generate a summary at this time.',
    });

  } catch (error) {
    console.error('AI Summary error:', error);
    return jsonResponse({ error: 'AI service unavailable' }, 500);
  }
}
