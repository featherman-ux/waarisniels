import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

function getDeviceType(ua: string | null): 'desktop' | 'mobile' {
  if (!ua) return 'desktop';
  return /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
    ua.toLowerCase()
  )
    ? 'mobile'
    : 'desktop';
}

function getReferrerHost(ref: string | null): string {
  if (!ref) return 'Direct';
  try {
    const url = new URL(ref);
    if (url.hostname.includes('google.') || url.hostname.includes('bing.'))
      return 'Zoekmachine';
    if (
      url.hostname.includes('instagram.') ||
      url.hostname.includes('facebook.')
    )
      return 'Social Media';
    if (url.hostname === new URL(import.meta.env.SITE).hostname)
      return 'Intern';
    return url.hostname;
  } catch {
    return 'Onbekend';
  }
}

export async function GET(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return jsonResponse({ error: 'KV not bound' }, 500);

  const allViewsData = (await kv.get('views_all_data', 'json')) ?? {};
  const latestEvents = (await kv.get('views_latest_events', 'json')) ?? [];
  return jsonResponse({ allViewsData, latestEvents });
}

export async function POST(context: APIContext) {
  const kv = (context.locals as any)?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) return jsonResponse({ error: 'KV not bound' }, 500);

  const { path, referrer } = await context.request
    .json()
    .catch(() => ({} as any));
  if (!path) return jsonResponse({ error: 'Missing path' }, 400);

  const country = context.request.headers.get('cf-ipcountry') ?? 'XX';
  const device = getDeviceType(context.request.headers.get('user-agent'));
  const referrerHost = getReferrerHost(referrer);
  const timestamp = new Date().toISOString();

  // Migrate old numeric data if present
  const allViewsData = (await kv.get('views_all_data', 'json')) ?? {};
  let postData = allViewsData[path];
  if (typeof postData === 'number' || !postData) {
    postData = {
      total: typeof postData === 'number' ? postData : 0,
      countries: {},
      devices: {},
      referrers: {},
      timestamps: []
    };
  }

  postData.total += 1;
  postData.countries[country] = (postData.countries[country] || 0) + 1;
  postData.devices[device] = (postData.devices[device] || 0) + 1;
  postData.referrers[referrerHost] =
    (postData.referrers[referrerHost] || 0) + 1;
  postData.timestamps.push(timestamp);

  allViewsData[path] = postData;

  const latestEvents =
    (await kv.get('views_latest_events', 'json')) ?? [];
  latestEvents.unshift({ path, country, device, timestamp });
  if (latestEvents.length > 10) latestEvents.pop();

  await kv.put('views_all_data', JSON.stringify(allViewsData));
  await kv.put('views_latest_events', JSON.stringify(latestEvents));

  return jsonResponse({ views: postData.total });
}
