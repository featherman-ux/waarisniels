// src/pages/api/view.ts
import type { APIContext } from 'astro';

// A simple helper for consistent JSON responses
const jsonResponse = (data: any, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

export const prerender = false;

// --- Type Definitions for API Contracts ---

interface AnalyticsPayload {
  path: string;
  referrer: string | null;
  sessionDuration?: number;
  screenResolution?: string;
}

interface PostAnalyticsData {
  total: number;
  uniqueVisitors: string;
  countries: Record<string, number>;
  devices: Record<string, number>;
  referrers: Record<string, number>;
  totalTimeOnPage: number;
  visitDurations: number;
  bounces: number;
}

// --- Helper Functions ---

function getDeviceType(ua: string): 'desktop' | 'mobile' | 'tablet' {
  const userAgent = ua.toLowerCase();
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function getReferrerCategory(ref: string | null, currentHost: string): string {
  if (!ref) return 'Direct';
  try {
    const url = new URL(ref);
    const hostname = url.hostname.toLowerCase();
    if (hostname === currentHost) return 'Internal';
    if (/\b(google|bing|yahoo|duckduckgo)\./i.test(hostname)) return 'Search';
    if (/\b(facebook|fb|instagram|twitter|x|linkedin|t\.co|reddit)\./i.test(hostname)) return 'Social';
    return 'Referral';
  } catch {
    return 'Unknown';
  }
}

async function safeGetJson<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  const raw = await kv.get(key);
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Failed to parse JSON from KV key: ${key}. Returning default.`, e);
    return defaultValue;
  }
}

// --- API Endpoint Handlers ---

export async function GET(context: APIContext) {
  const kv = context.locals.runtime?.env?.ANALYTICS_KV;
  if (!kv) {
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    const allPostsData = await safeGetJson<Record<string, PostAnalyticsData>>(kv, 'views_all_data', {});
    
    let totalViews = 0;
    const uniqueVisitorSet = new Set<string>();
    let totalSessionTime = 0;
    let totalBounces = 0;
    const combinedCountries: Record<string, number> = {};
    const combinedDevices: Record<string, number> = {};
    const combinedReferrers: Record<string, number> = {};

    const postsList = Object.entries(allPostsData).map(([path, data]) => {
      totalViews += data.total?? 0;
      (data.uniqueVisitors ||).forEach((v: string) => uniqueVisitorSet.add(v));
      totalSessionTime += data.totalTimeOnPage?? 0;
      totalBounces += data.bounces?? 0;

      Object.entries(data.countries?? {}).forEach(([k, v]) => {
        combinedCountries[k] = (combinedCountries[k]?? 0) + v;
      });
      Object.entries(data.devices?? {}).forEach(([k, v]) => {
        combinedDevices[k] = (combinedDevices[k]?? 0) + v;
      });
      Object.entries(data.referrers?? {}).forEach(([k, v]) => {
        combinedReferrers[k] = (combinedReferrers[k]?? 0) + v;
      });

      return {
        title: path.replace(/^\/blog\//, '').replace(/\/$/, '') |

| 'Home',
        views: data.total?? 0,
      };
    });

    const avgTimeOnPage = totalViews > 0? totalSessionTime / totalViews : 0;
    const bounceRate = totalViews > 0? totalBounces / totalViews : 0;
    const topReferrer = Object.entries(combinedReferrers).sort(([, a], [, b]) => b - a)?.?? 'N/A';
    const top10Posts = postsList.sort((a, b) => b.views - a.views).slice(0, 10);

    const viewsLast30Days: Record<string, number> = {};
    const today = new Date();
    const promises: Promise<void> =;
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      promises.push(
        safeGetJson<{ events: number }>(kv, `analytics:daily:${dateStr}`, { events: 0 })
        .then(dayData => {
            viewsLast30Days = dayData.events;
          })
      );
    }
    await Promise.all(promises);

    const responsePayload = {
      kpis: {
        totalViews,
        uniqueVisitors: uniqueVisitorSet.size,
        avgTimeOnPage,
        bounceRate,
        topReferrer,
      },
      charts: {
        viewsLast30Days,
        deviceUsage: combinedDevices,
        referrerBreakdown: combinedReferrers,
      },
      mapData: {
        countries: combinedCountries,
      },
      topPosts: top10Posts,
    };

    return jsonResponse(responsePayload);

  } catch (error) {
    console.error("View GET failed:", error);
    return jsonResponse({ error: "Could not retrieve analytics" }, 500);
  }
}

export async function POST(context: APIContext) {
  const kv = context.locals.runtime?.env?.ANALYTICS_KV;
  if (!kv) {
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    const body = await context.request.json<AnalyticsPayload>().catch(() => null);
    if (!body |

| typeof body.path!== 'string') {
      return jsonResponse({ error: 'Missing or invalid path' }, 400);
    }

    const { path, referrer, sessionDuration, screenResolution } = body;

    const country = context.request.headers.get('cf-ipcountry')?? 'XX';
    const userAgent = context.request.headers.get('user-agent')?? 'Unknown';
    const ip = context.request.headers.get('cf-connecting-ip')?? 'Unknown';
    const device = getDeviceType(userAgent);
    const referrerCategory = getReferrerCategory(referrer, new URL(context.request.url).hostname);
    const timestamp = new Date();

    const postKey = 'views_all_data';
    const allPostsData = await safeGetJson<Record<string, PostAnalyticsData>>(kv, postKey, {});
    const postData = allPostsData[path]?? {
      total: 0,
      uniqueVisitors:,
      countries: {},
      devices: {},
      referrers: {},
      totalTimeOnPage: 0,
      visitDurations:,
      bounces: 0,
    };

    postData.total += 1;
    postData.countries[country] = (postData.countries[country]?? 0) + 1;
    postData.devices[device] = (postData.devices[device]?? 0) + 1;
    postData.referrers[referrerCategory] = (postData.referrers[referrerCategory]?? 0) + 1;
    
    if (typeof sessionDuration === 'number') {
      postData.totalTimeOnPage += sessionDuration;
      postData.visitDurations.push(sessionDuration);
    }
    
    if (typeof sessionDuration === 'number' && sessionDuration < 5) {
        postData.bounces += 1;
    }

    const visitorId = `${ip}_${userAgent.slice(0, 50)}_${screenResolution?? 'unknown'}`;
    if (!postData.uniqueVisitors.includes(visitorId)) {
      postData.uniqueVisitors.push(visitorId);
    }
    allPostsData[path] = postData;

    const dayStr = timestamp.toISOString().slice(0, 10);
    const dailyKey = `analytics:daily:${dayStr}`;
    const dailyData = await safeGetJson<{ events: number }>(kv, dailyKey, { events: 0 });
    dailyData.events += 1;

    await Promise.all();

    return jsonResponse({ status: 'ok' });

  } catch (error) {
    console.error("View POST failed:", error);
    return jsonResponse({ error: "Failed to save view data" }, 500);
  }
}