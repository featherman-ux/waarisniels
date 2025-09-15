// src/pages/api/analytics.ts
import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

// THIS IS THE FULL FUNCTION YOU NEED (NOT THE '...')
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
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error('ANALYTICS_KV binding not found');
    return jsonResponse({ error: 'Analytics KV not bound' }, 500);
  }

  try {
    const evt = await context.request.json().catch(() => ({} as any));
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const day = timestamp.slice(0, 10);

    const enhancedEvent = {
      ...evt,
      id,
      timestamp,
      userAgent: context.request.headers.get('user-agent') || 'Unknown',
      referer: context.request.headers.get('referer') || 'Direct',
      country: context.request.headers.get('cf-ipcountry') || 'XX',
      ip: context.request.headers.get('cf-connecting-ip') || 'Unknown',
      city: context.request.headers.get('cf-ipcity') || 'Unknown',
      timezone: context.request.headers.get('cf-timezone') || 'Unknown'
    };

    // Store individual event
    await kv.put(`analytics:${day}:${id}`, JSON.stringify(enhancedEvent));
    
    // Update daily aggregates
    const dailyKey = `analytics:daily:${day}`;
    const dailyData = (await kv.get(dailyKey, 'json')) || { events: 0, countries: {}, devices: {}, referrers: {} };
    
    dailyData.events += 1;
    dailyData.countries[enhancedEvent.country] = (dailyData.countries[enhancedEvent.country] || 0) + 1;
    
    const deviceType = getDeviceType(enhancedEvent.userAgent);
    dailyData.devices[deviceType] = (dailyData.devices[deviceType] || 0) + 1;
    
    const referrer = getReferrerHost(enhancedEvent.referer);
    dailyData.referrers[referrer] = (dailyData.referrers[referrer] || 0) + 1;
    
    await kv.put(dailyKey, JSON.stringify(dailyData));
    
    return jsonResponse({ ok: true, eventId: id });

  } catch (error) {
    console.error("Analytics function crashed:", error);
    return jsonResponse({ error: "Failed to process analytics event" }, 500);
  }
}

// MAKE SURE THESE HELPER FUNCTIONS ARE ALSO IN THE FILE
function getDeviceType(ua: string | null): 'desktop' | 'mobile' | 'tablet' {
  if (!ua) return 'desktop';
  const userAgent = ua.toLowerCase();
  if (/tablet|ipad/.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(userAgent)) return 'mobile';
  return 'desktop';
}

function getReferrerHost(ref: string | null): string {
  if (!ref) return 'Direct';
  try {
    const url = new URL(ref);
    if (url.hostname.includes('google.') || url.hostname.includes('bing.')) return 'Search Engine';
    if (url.hostname.includes('instagram.') || url.hostname.includes('facebook.') || url.hostname.includes('twitter.') || url.hostname.includes('linkedin.')) return 'Social Media';
    if (url.hostname === new URL(import.meta.env.SITE || 'http://localhost').hostname) return 'Internal';
    return url.hostname;
  } catch {
    return 'Unknown';
  }
}