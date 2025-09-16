import type { APIContext } from 'astro';

// Helper to return JSON
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
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