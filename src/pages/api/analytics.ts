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

export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error('ANALYTICS_KV binding not found');
    return jsonResponse({ error: 'Analytics KV not bound' }, 500);
  }

  try {
    const viewsAllRaw = await kv.get('views_all_data');
    let allPostsData: Record<string, any> = {};
    if (viewsAllRaw) {
      try {
        allPostsData = JSON.parse(viewsAllRaw);
      } catch (error) {
        console.warn('Failed to parse views_all_data; resetting aggregate', error);
        allPostsData = {};
      }
    }

    let totalViews = 0;
    const uniqueVisitorSet = new Set<string>();
    let totalSessionTime = 0;
    let totalBounces = 0;
    const combinedCountries: Record<string, number> = {};
    const combinedDevices: Record<string, number> = {};
    const combinedReferrers: Record<string, number> = {};

    const postsList = Object.entries(allPostsData).map(([path, data]: [string, any]) => {
      totalViews += data.total || 0;
      (data.uniqueVisitors || []).forEach((visitor: string) => uniqueVisitorSet.add(visitor));
      totalSessionTime += data.totalTimeOnPage || 0;
      totalBounces += data.bounces || 0;

      for (const [country, value] of Object.entries(data.countries || {})) {
        combinedCountries[country] = (combinedCountries[country] || 0) + (value as number);
      }
      for (const [device, value] of Object.entries(data.devices || {})) {
        combinedDevices[device] = (combinedDevices[device] || 0) + (value as number);
      }
      for (const [ref, value] of Object.entries(data.referrers || {})) {
        combinedReferrers[ref] = (combinedReferrers[ref] || 0) + (value as number);
      }

      return {
        title: path.replace(/^\/blog\//, '').replace(/\/$/, '') || 'Home',
        views: data.total || 0,
      };
    });

    const topReferrer = Object.entries(combinedReferrers)
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'N/A';

    const avgTimeOnPage = totalViews > 0 ? totalSessionTime / totalViews : 0;
    const bounceRate = totalViews > 0 ? totalBounces / totalViews : 0;
    const topPosts = postsList.sort((a, b) => b.views - a.views).slice(0, 10);

    const viewsLast30Days: Record<string, number> = {};
    const deviceUsage: Record<string, number> = { ...combinedDevices };
    const referrerBreakdown: Record<string, number> = { ...combinedReferrers };

    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const dailyKey = `analytics:daily:${dateStr}`;
      const dayData = (await kv.get(dailyKey, 'json')) || { events: 0, devices: {}, referrers: {}, countries: {} };

      viewsLast30Days[dateStr] = dayData.events || 0;

      for (const [device, value] of Object.entries(dayData.devices || {})) {
        deviceUsage[device] = (deviceUsage[device] || 0) + (value as number);
      }
      for (const [ref, value] of Object.entries(dayData.referrers || {})) {
        referrerBreakdown[ref] = (referrerBreakdown[ref] || 0) + (value as number);
      }
      for (const [country, value] of Object.entries(dayData.countries || {})) {
        combinedCountries[country] = (combinedCountries[country] || 0) + (value as number);
      }
    }

    const totalViewsFromDays = Object.values(viewsLast30Days).reduce((sum, n) => sum + (n as number), 0);
    if (totalViews === 0 && totalViewsFromDays > 0) {
      totalViews = totalViewsFromDays;
    }

    if (!Object.keys(referrerBreakdown).length) {
      referrerBreakdown.Direct = totalViewsFromDays;
    }

    return jsonResponse({
      kpis: {
        totalViews,
        uniqueVisitors: uniqueVisitorSet.size,
        avgTimeOnPage,
        bounceRate,
        topReferrer,
      },
      charts: {
        viewsLast30Days,
        deviceUsage,
        referrerBreakdown,
      },
      mapData: {
        countries: combinedCountries,
      },
      topPosts,
    });
  } catch (error) {
    console.error('Analytics GET failed:', error);
    return jsonResponse({ error: 'Could not retrieve analytics' }, 500);
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
