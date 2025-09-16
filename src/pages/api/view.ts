import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

// --- Helper Functions (no change) ---
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

// --- NEW FIXED HELPER: Safely gets and parses JSON from KV ---
async function safeGetJson(kv: KVNamespace, key: string, defaultValue: any) {
  const raw = await kv.get(key);
  if (!raw) {
    return defaultValue; // Return the default if nothing is found
  }
  try {
    return JSON.parse(raw); // Return the parsed data
  } catch (e) {
    console.error(`Failed to parse JSON from KV key: ${key}. Data may be corrupt. Resetting key.`, e);
    await kv.delete(key); // Delete the corrupt data
    return defaultValue; // Return the default
  }
}

// Default "shapes" for our database objects
const dailyDataDefaults = { 
  events: 0, 
  countries: {}, 
  cities: {},
  devices: {}, 
  browsers: {},
  operatingSystems: {},
  referrers: {},
  pages: {} 
};

const postDataDefaults = {
  total: 0,
  countries: {},
  cities: {},
  regions: {},
  devices: {},
  browsers: {},
  operatingSystems: {},
  referrers: {},
  timestamps: [],
  uniqueVisitors: [], // Always store as an array
  visitDurations: [],
  bounceRate: 0
};

// --- FIXED GET Function ---
export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View GET: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    // Use the new, simpler helper function
    const allViewsData = await safeGetJson(kv, 'views_all_data', {});
    const latestEvents = await safeGetJson(kv, 'views_latest_events', []);
    
    const dailyData: { [key: string]: any } = {};
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      
      const dayData = await safeGetJson(kv, `analytics:daily:${dateStr}`, null);
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

// --- FIXED POST Function ---
export async function POST(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View POST: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    const { path, referrer } = await context.request.json().catch(() => ({} as any));
    if (!path) return jsonResponse({ error: 'Missing path' }, 400);

    // ... (All data collection consts are fine) ...
    const country = context.request.headers.get('cf-ipcountry') ?? 'XX';
    const city = context.request.headers.get('cf-ipcity') ?? 'Unknown';
    const region = context.request.headers.get('cf-region') ?? 'Unknown';
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

    const allViewsData = await safeGetJson(kv, 'views_all_data', {});
    let loadedPostData = allViewsData[path];
    
    if (typeof loadedPostData === 'number') {
      loadedPostData = { total: loadedPostData };
    }
    
    // FIX: This now correctly merges the default shape with any loaded data
    const postData = { ...postDataDefaults, ...loadedPostData };
    // FIX: This now correctly re-creates the Set from the loaded array
    const uniqueVisitorsSet = new Set(postData.uniqueVisitors);

    // Update counters
    postData.total += 1;
    postData.countries[country] = (postData.countries[country] || 0) + 1;
    postData.cities[city] = (postData.cities[city] || 0) + 1;
    postData.regions[region] = (postData.regions[region] || 0) + 1;
    postData.devices[device] = (postData.devices[device] || 0) + 1;
    postData.browsers[browser] = (postData.browsers[browser] || 0) + 1;
    postData.operatingSystems[os] = (postData.operatingSystems[os] || 0) + 1;
    postData.referrers[referrerHost] = (postData.referrers[referrerHost] || 0) + 1;
    postData.timestamps.push({
      time: timestamp, country, city, device, browser, os, referrer: referrerHost
    });

    // Track unique visitors
    const visitorId = `${ip}_${userAgent.slice(0, 50)}`;
    uniqueVisitorsSet.add(visitorId);
    postData.uniqueVisitors = Array.from(uniqueVisitorsSet); // Convert back to array for storing in JSON

    allViewsData[path] = postData;

    // FIX: This will now correctly be an array
    const latestEvents = await safeGetJson(kv, 'views_latest_events', []);
    latestEvents.unshift({ // This line will no longer crash
      path, country, city, device, browser, os, timestamp, referrer: referrerHost
    });
    if (latestEvents.length > 20) latestEvents.pop();

    await kv.put('views_all_data', JSON.stringify(allViewsData));
    await kv.put('views_latest_events', JSON.stringify(latestEvents));

    // Store daily aggregate
    const day = timestamp.slice(0, 10);
    const dailyKey = `analytics:daily:${day}`;
    // FIX: Explicitly merge the default shape with the loaded data
    const loadedDailyData = await safeGetJson(kv, dailyKey, dailyDataDefaults);
    const dailyData = { ...dailyDataDefaults, ...loadedDailyData };
    
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
      uniqueVisitors: postData.uniqueVisitors.length
    });

  } catch (error) {
    console.error("View POST failed:", error);
    return jsonResponse({ error: "Failed to save view data" }, 500);
  }
}