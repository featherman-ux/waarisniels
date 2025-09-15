// Enhanced View Counter API - src/pages/api/view.ts
import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

// --- Helper functions (no change) ---
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

// --- GET Function (Fixed with try/catch) ---
export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View GET: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  // --- FIX: Added try/catch to handle KV errors ---
  try {
    const allViewsData = (await kv.get('views_all_data', 'json')) ?? {};
    const latestEvents = (await kv.get('views_latest_events', 'json')) ?? [];
    
    const dailyData = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      // This .get('json') call could fail
      const dayData = await kv.get(`analytics:daily:${dateStr}`, 'json');
      if (dayData) {
        dailyData[dateStr] = dayData;
      }
    }

    return jsonResponse({ allViewsData, latestEvents, dailyData });

  } catch (error) {
    console.error("View GET failed:", error);
    return jsonResponse({ error: "Could not retrieve view analytics" }, 500);
  }
}

// --- POST Function (Fixed with try/catch) ---
export async function POST(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View POST: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  // --- FIX: Added try/catch to handle all KV operations ---
  try {
    const { path, referrer } = await context.request.json().catch(() => ({} as any));
    if (!path) return jsonResponse({ error: 'Missing path' }, 400);

    // ... (All your data collection logic is fine) ...
    const country = context.request.headers.get('cf-ipcountry') ?? 'XX';
    const city = context.request.headers.get('cf-ipcity') ?? 'Unknown';
    const region = context.request.headers.get('cf-region') ?? 'Unknown';
    const timezone = context.request.headers.get('cf-timezone') ?? 'Unknown';
    const userAgent = context.request.headers.get('user-agent') ?? 'Unknown';
    const device = getDeviceType(userAgent);
    const referrerHost = getReferrerHost(referrer);
    const timestamp = new Date().toISOString();
    const ip = context.request.headers.get('cf-connecting-ip') ?? 'Unknown';
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    // All these KV calls are now safely inside the try block
    const allViewsData = (await kv.get('views_all_data', 'json')) ?? {};
    let postData = allViewsData[path];
    
    if (typeof postData === 'number' || !postData) {
      postData = {
        total: typeof postData === 'number' ? postData : 0,
        countries: {},
        cities: {},
        regions: {},
        devices: {},
        browsers: {},
        operatingSystems: {},
        referrers: {},
        timestamps: [],
        uniqueVisitors: new Set(),
        visitDurations: [],
        bounceRate: 0
      };
    }

    postData.total += 1;
    postData.countries[country] = (postData.countries[country] || 0) + 1;
    // ... (etc. ... all your counter logic) ...
    postData.cities[city] = (postData.cities[city] || 0) + 1;
    postData.regions[region] = (postData.regions[region] || 0) + 1;
    postData.devices[device] = (postData.devices[device] || 0) + 1;
    postData.browsers[browser] = (postData.browsers[browser] || 0) + 1;
    postData.operatingSystems[os] = (postData.operatingSystems[os] || 0) + 1;
    postData.referrers[referrerHost] = (postData.referrers[referrerHost] || 0) + 1;
    postData.timestamps.push({
      time: timestamp,
      country,
      city,
      device,
      browser,
      os,
      referrer: referrerHost
    });

    const visitorId = `${ip}_${userAgent.slice(0, 50)}`;
    if (!postData.uniqueVisitors.has(visitorId)) {
      postData.uniqueVisitors.add(visitorId);
    }
    if (postData.uniqueVisitors instanceof Set) {
      postData.uniqueVisitors = Array.from(postData.uniqueVisitors);
    }

    allViewsData[path] = postData;

    const latestEvents = (await kv.get('views_latest_events', 'json')) ?? [];
    latestEvents.unshift({
      path,
      country,
      city,
      device,
      browser,
      os,
      timestamp,
      referrer: referrerHost
    });
    if (latestEvents.length > 20) latestEvents.pop();

    await kv.put('views_all_data', JSON.stringify(allViewsData));
    await kv.put('views_latest_events', JSON.stringify(latestEvents));

    const day = timestamp.slice(0, 10);
    const dailyKey = `analytics:daily:${day}`;
    const dailyData = await kv.get(dailyKey, 'json') || { 
      events: 0, 
      countries: {}, 
      cities: {},
      devices: {}, 
      browsers: {},
      operatingSystems: {},
      referrers: {},
      pages: {} 
    };
    
    dailyData.events += 1;
    dailyData.countries[country] = (dailyData.countries[country] || 0) + 1;
    dailyData.cities[city] = (dailyData.cities[city] || 0) + 1;
    dailyData.devices[device] = (dailyData.devices[device] || 0) + 1;
    dailyData.browsers[browser] = (dailyData.browsers[browser] || 0) + 1;
    dailyData.operatingSystems[os] = (dailyData.operatingSystems[os] || 0) + 1;
    dailyData.referrers[referrerHost] = (dailyData.referrers[referrerHost] || 0) + 1;
    dailyData.pages[path] = (dailyData.pages[path] || 0) + 1;
    
    await kv.put(dailyKey, JSON.stringify(dailyData));

    return jsonResponse({ 
      views: postData.total,
      uniqueVisitors: Array.isArray(postData.uniqueVisitors) ? postData.uniqueVisitors.length : 0
    });

  } catch (error) {
    console.error("View POST failed:", error);
    return jsonResponse({ error: "Failed to save view data" }, 500);
  }
}