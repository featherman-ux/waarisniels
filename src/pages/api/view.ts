import type { APIContext } from 'astro';
import { jsonResponse } from './_utils';

export const prerender = false;

// --- Enhanced Helper Functions ---
function getDeviceType(ua: string | null): 'desktop' | 'mobile' | 'tablet' {
  if (!ua) return 'desktop';
  const userAgent = ua.toLowerCase();
  if (/tablet|ipad/.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(userAgent)) return 'mobile';
  return 'desktop';
}

function getBrowserDetails(ua: string | null): { browser: string; version: string } {
  if (!ua) return { browser: 'Unknown', version: '0' };
  
  const userAgent = ua.toLowerCase();
  let browser = 'Unknown';
  let version = '0';
  
  if (userAgent.includes('chrome') && !userAgent.includes('edge')) {
    browser = 'Chrome';
    const match = ua.match(/chrome\/([0-9]+)/i);
    version = match ? match[1] : '0';
  } else if (userAgent.includes('firefox')) {
    browser = 'Firefox';
    const match = ua.match(/firefox\/([0-9]+)/i);
    version = match ? match[1] : '0';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    browser = 'Safari';
    const match = ua.match(/version\/([0-9]+)/i);
    version = match ? match[1] : '0';
  } else if (userAgent.includes('edge')) {
    browser = 'Edge';
    const match = ua.match(/edge\/([0-9]+)/i);
    version = match ? match[1] : '0';
  }
  
  return { browser, version };
}

function getOperatingSystem(ua: string | null): string {
  if (!ua) return 'Unknown';
  const userAgent = ua.toLowerCase();
  
  if (userAgent.includes('windows nt 10')) return 'Windows 10';
  if (userAgent.includes('windows nt 6.3')) return 'Windows 8.1';
  if (userAgent.includes('windows nt 6.1')) return 'Windows 7';
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('mac os x')) return 'macOS';
  if (userAgent.includes('linux')) return 'Linux';
  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
  return 'Unknown';
}

function getScreenResolution(request: Request): string {
  // This would need to be sent from the client side
  const screenInfo = request.headers.get('x-screen-resolution');
  return screenInfo || 'Unknown';
}

function getConnectionType(request: Request): string {
  // Cloudflare provides connection info
  const cfConnType = request.headers.get('cf-ray');
  const userAgent = request.headers.get('user-agent') || '';
  
  // Basic heuristics for connection speed
  if (userAgent.includes('mobile') && !userAgent.includes('wifi')) return 'Mobile Data';
  return 'Broadband';
}

function getReferrerDetails(ref: string | null, currentHost: string): { 
  category: string; 
  source: string; 
  medium: string;
  campaign?: string;
} {
  if (!ref) return { category: 'Direct', source: 'Direct', medium: 'none' };
  
  try {
    const url = new URL(ref);
    const hostname = url.hostname.toLowerCase();
    
    // Search Engines
    if (hostname.includes('google.')) return { category: 'Search', source: 'Google', medium: 'organic' };
    if (hostname.includes('bing.')) return { category: 'Search', source: 'Bing', medium: 'organic' };
    if (hostname.includes('yahoo.')) return { category: 'Search', source: 'Yahoo', medium: 'organic' };
    if (hostname.includes('duckduckgo.')) return { category: 'Search', source: 'DuckDuckGo', medium: 'organic' };
    
    // Social Media
    if (hostname.includes('facebook.') || hostname.includes('fb.')) return { category: 'Social', source: 'Facebook', medium: 'social' };
    if (hostname.includes('instagram.')) return { category: 'Social', source: 'Instagram', medium: 'social' };
    if (hostname.includes('twitter.') || hostname.includes('x.com')) return { category: 'Social', source: 'Twitter/X', medium: 'social' };
    if (hostname.includes('linkedin.')) return { category: 'Social', source: 'LinkedIn', medium: 'social' };
    if (hostname.includes('youtube.')) return { category: 'Social', source: 'YouTube', medium: 'social' };
    if (hostname.includes('tiktok.')) return { category: 'Social', source: 'TikTok', medium: 'social' };
    if (hostname.includes('reddit.')) return { category: 'Social', source: 'Reddit', medium: 'social' };
    if (hostname.includes('pinterest.')) return { category: 'Social', source: 'Pinterest', medium: 'social' };
    
    // Email
    if (hostname.includes('mail.') || hostname.includes('gmail.') || hostname.includes('outlook.')) {
      return { category: 'Email', source: 'Email', medium: 'email' };
    }
    
    // Internal
    if (hostname === currentHost) return { category: 'Internal', source: 'Internal', medium: 'internal' };
    
    // Other referrals
    return { category: 'Referral', source: hostname, medium: 'referral' };
  } catch {
    return { category: 'Unknown', source: 'Unknown', medium: 'unknown' };
  }
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

function getDayOfWeek(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
}

// --- Enhanced Helper Functions ---
async function safeGetJson(kv: KVNamespace, key: string, defaultValue: any) {
  const raw = await kv.get(key);
  if (!raw) {
    return defaultValue;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to parse JSON from KV key: ${key}. Data may be corrupt. Resetting key.`, e);
    await kv.delete(key);
    return defaultValue;
  }
}

// Enhanced data structures
const dailyDataDefaults = { 
  events: 0, 
  countries: {}, 
  cities: {},
  devices: {}, 
  browsers: {},
  operatingSystems: {},
  referrers: {},
  pages: {},
  timeOfDay: {},
  dayOfWeek: {},
  screenResolutions: {},
  connectionTypes: {},
  newVsReturning: { new: 0, returning: 0 },
  averageSessionDuration: 0,
  totalSessionTime: 0,
  bounces: 0,
  pageDepth: {}
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
  referrerDetails: {},
  timestamps: [],
  uniqueVisitors: [],
  visitDurations: [],
  bounceRate: 0,
  averageTimeOnPage: 0,
  totalTimeOnPage: 0,
  readingProgress: {},
  scrollDepth: {},
  clickHeatmap: {},
  exitPoints: {},
  entryPoints: {},
  userJourneys: [],
  deviceCapabilities: {},
  timeOfDay: {},
  dayOfWeek: {},
  seasonality: {},
  weatherCorrelation: {},
  performanceMetrics: {
    loadTimes: [],
    serverResponseTimes: [],
    errorRates: 0
  }
};

// --- Enhanced GET Function ---
export async function GET(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View GET: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    const allViewsData = await safeGetJson(kv, 'views_all_data', {});
    const latestEvents = await safeGetJson(kv, 'views_latest_events', []);
    const userJourneys = await safeGetJson(kv, 'user_journeys', []);
    const performanceData = await safeGetJson(kv, 'performance_data', {});
    const engagementData = await safeGetJson(kv, 'engagement_data', {});
    
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

    // Calculate interesting aggregations
    const insights = calculateInsights(allViewsData, dailyData, userJourneys);

    return jsonResponse({ 
      allViewsData, 
      latestEvents, 
      dailyData,
      userJourneys,
      performanceData,
      engagementData,
      insights
    });

  } catch (error) {
    console.error("View GET failed:", error);
    return jsonResponse({ error: "Could not retrieve view analytics" }, 500);
  }
}

// --- Calculate Interesting Insights ---
function calculateInsights(allViewsData: any, dailyData: any, userJourneys: any[]) {
  const insights = {
    mostActiveTimeOfDay: 'Unknown',
    mostActiveDay: 'Unknown',
    averageSessionDuration: 0,
    mostCommonUserJourney: [],
    deviceTrends: {},
    geographicTrends: {},
    contentPerformance: {},
    userEngagementScore: 0,
    growthRate: 0,
    conversionFunnelDropoff: {},
    seasonalTrends: {},
    returnVisitorRate: 0
  };

  try {
    // Analyze time patterns
    const timeOfDayStats: { [key: string]: number } = {};
    const dayOfWeekStats: { [key: string]: number } = {};

    Object.values(dailyData).forEach((day: any) => {
      if (day.timeOfDay) {
        Object.entries(day.timeOfDay).forEach(([time, count]: [string, any]) => {
          timeOfDayStats[time] = (timeOfDayStats[time] || 0) + count;
        });
      }
      if (day.dayOfWeek) {
        Object.entries(day.dayOfWeek).forEach(([dayName, count]: [string, any]) => {
          dayOfWeekStats[dayName] = (dayOfWeekStats[dayName] || 0) + count;
        });
      }
    });

    insights.mostActiveTimeOfDay = Object.entries(timeOfDayStats)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';
    
    insights.mostActiveDay = Object.entries(dayOfWeekStats)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';

    // Calculate growth rate
    const dates = Object.keys(dailyData).sort();
    if (dates.length >= 7) {
      const recentWeek = dates.slice(-7).reduce((sum, date) => sum + (dailyData[date]?.events || 0), 0);
      const previousWeek = dates.slice(-14, -7).reduce((sum, date) => sum + (dailyData[date]?.events || 0), 0);
      
      if (previousWeek > 0) {
        insights.growthRate = ((recentWeek - previousWeek) / previousWeek) * 100;
      }
    }

    // Analyze user journeys
    if (userJourneys.length > 0) {
      const journeyPatterns: { [key: string]: number } = {};
      userJourneys.forEach((journey: any) => {
        const pathKey = journey.path?.slice(0, 3).join(' → ') || 'Unknown';
        journeyPatterns[pathKey] = (journeyPatterns[pathKey] || 0) + 1;
      });
      
      const mostCommon = Object.entries(journeyPatterns)
        .sort(([,a], [,b]) => b - a)[0];
      
      if (mostCommon) {
        insights.mostCommonUserJourney = mostCommon[0].split(' → ');
      }
    }

  } catch (error) {
    console.error('Error calculating insights:', error);
  }

  return insights;
}

// --- Enhanced POST Function ---
export async function POST(context: APIContext) {
  const kv = context.locals?.runtime?.env?.ANALYTICS_KV as KVNamespace | undefined;
  if (!kv) {
    console.error("View POST: ANALYTICS_KV not bound");
    return jsonResponse({ error: 'ANALYTICS_KV not bound' }, 500);
  }

  try {
    const requestData = await context.request.json().catch(() => ({} as any));
    const { 
      path, 
      referrer, 
      sessionDuration, 
      scrollDepth, 
      clickData, 
      readingProgress,
      screenResolution,
      loadTime,
      previousPages,
      exitIntent
    } = requestData;
    
    if (!path) return jsonResponse({ error: 'Missing path' }, 400);

    // Enhanced data collection
    const country = context.request.headers.get('cf-ipcountry') ?? 'XX';
    const city = context.request.headers.get('cf-ipcity') ?? 'Unknown';
    const region = context.request.headers.get('cf-region') ?? 'Unknown';
    const userAgent = context.request.headers.get('user-agent') ?? 'Unknown';
    const ip = context.request.headers.get('cf-connecting-ip') ?? 'Unknown';
    
    const device = getDeviceType(userAgent);
    const { browser, version: browserVersion } = getBrowserDetails(userAgent);
    const os = getOperatingSystem(userAgent);
    const referrerDetails = getReferrerDetails(referrer, new URL(context.request.url).hostname);
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    const connectionType = getConnectionType(context.request);
    const timestamp = new Date().toISOString();

    // Load existing data
    const allViewsData = await safeGetJson(kv, 'views_all_data', {});
    let loadedPostData = allViewsData[path];
    
    if (typeof loadedPostData === 'number') {
      loadedPostData = { total: loadedPostData };
    }
    
    const postData = { ...postDataDefaults, ...loadedPostData };
    const uniqueVisitorsSet = new Set(postData.uniqueVisitors);

    // Enhanced tracking
    postData.total += 1;
    postData.countries[country] = (postData.countries[country] || 0) + 1;
    postData.cities[city] = (postData.cities[city] || 0) + 1;
    postData.regions[region] = (postData.regions[region] || 0) + 1;
    postData.devices[device] = (postData.devices[device] || 0) + 1;
    postData.browsers[`${browser} ${browserVersion}`] = (postData.browsers[`${browser} ${browserVersion}`] || 0) + 1;
    postData.operatingSystems[os] = (postData.operatingSystems[os] || 0) + 1;
    postData.referrers[referrerDetails.category] = (postData.referrers[referrerDetails.category] || 0) + 1;
    postData.timeOfDay[timeOfDay] = (postData.timeOfDay[timeOfDay] || 0) + 1;
    postData.dayOfWeek[dayOfWeek] = (postData.dayOfWeek[dayOfWeek] || 0) + 1;

    // Store detailed referrer information
    if (!postData.referrerDetails[referrerDetails.category]) {
      postData.referrerDetails[referrerDetails.category] = {};
    }
    postData.referrerDetails[referrerDetails.category][referrerDetails.source] = 
      (postData.referrerDetails[referrerDetails.category][referrerDetails.source] || 0) + 1;

    // Track engagement metrics
    if (sessionDuration) {
      postData.visitDurations.push(sessionDuration);
      postData.totalTimeOnPage = (postData.totalTimeOnPage || 0) + sessionDuration;
      postData.averageTimeOnPage = postData.totalTimeOnPage / postData.total;
    }

    if (scrollDepth) {
      const depthRange = Math.floor(scrollDepth / 25) * 25; // Group into 25% ranges
      postData.scrollDepth[`${depthRange}-${depthRange + 25}%`] = 
        (postData.scrollDepth[`${depthRange}-${depthRange + 25}%`] || 0) + 1;
    }

    if (readingProgress) {
      postData.readingProgress[readingProgress] = (postData.readingProgress[readingProgress] || 0) + 1;
    }

    // Track user journeys
    if (previousPages && Array.isArray(previousPages)) {
      const journeyKey = [...previousPages, path].join(' → ');
      const userJourneys = await safeGetJson(kv, 'user_journeys', []);
      
      userJourneys.push({
        journey: journeyKey,
        path: [...previousPages, path],
        timestamp,
        country,
        device,
        referrer: referrerDetails.category
      });

      // Keep only last 1000 journeys
      if (userJourneys.length > 1000) {
        userJourneys.splice(0, userJourneys.length - 1000);
      }
      
      await kv.put('user_journeys', JSON.stringify(userJourneys));
    }

    // Enhanced timestamp data
    postData.timestamps.push({
      time: timestamp, 
      country, 
      city, 
      device, 
      browser: `${browser} ${browserVersion}`, 
      os, 
      referrer: referrerDetails.category,
      referrerSource: referrerDetails.source,
      timeOfDay,
      dayOfWeek,
      sessionDuration: sessionDuration || 0,
      scrollDepth: scrollDepth || 0,
      connectionType
    });

    // Track unique visitors with enhanced fingerprinting
    const visitorId = `${ip}_${userAgent.slice(0, 50)}_${screenResolution || 'unknown'}`;
    const isNewVisitor = !uniqueVisitorsSet.has(visitorId);
    uniqueVisitorsSet.add(visitorId);
    postData.uniqueVisitors = Array.from(uniqueVisitorsSet);

    // Store performance data
    if (loadTime) {
      const performanceData = await safeGetJson(kv, 'performance_data', {});
      if (!performanceData[path]) performanceData[path] = { loadTimes: [], averageLoadTime: 0 };
      
      performanceData[path].loadTimes.push({ time: loadTime, timestamp, device, country });
      performanceData[path].averageLoadTime = 
        performanceData[path].loadTimes.reduce((sum: number, item: any) => sum + item.time, 0) / 
        performanceData[path].loadTimes.length;
      
      await kv.put('performance_data', JSON.stringify(performanceData));
    }

    // Update main data
    allViewsData[path] = postData;

    // Update latest events with richer data
    const latestEvents = await safeGetJson(kv, 'views_latest_events', []);
    latestEvents.unshift({
      path, 
      country, 
      city, 
      device, 
      browser: `${browser} ${browserVersion}`, 
      os, 
      timestamp, 
      referrer: referrerDetails.category,
      referrerSource: referrerDetails.source,
      isNewVisitor,
      sessionDuration: sessionDuration || 0,
      timeOfDay,
      dayOfWeek
    });
    
    if (latestEvents.length > 50) latestEvents.pop();

    // Enhanced daily aggregation
    const day = timestamp.slice(0, 10);
    const dailyKey = `analytics:daily:${day}`;
    const loadedDailyData = await safeGetJson(kv, dailyKey, dailyDataDefaults);
    const dailyData = { ...dailyDataDefaults, ...loadedDailyData };
    
    dailyData.events += 1;
    dailyData.countries[country] = (dailyData.countries[country] || 0) + 1;
    dailyData.cities[city] = (dailyData.cities[city] || 0) + 1;
    dailyData.devices[device] = (dailyData.devices[device] || 0) + 1;
    dailyData.browsers[`${browser} ${browserVersion}`] = (dailyData.browsers[`${browser} ${browserVersion}`] || 0) + 1;
    dailyData.operatingSystems[os] = (dailyData.operatingSystems[os] || 0) + 1;
    dailyData.referrers[referrerDetails.category] = (dailyData.referrers[referrerDetails.category] || 0) + 1;
    dailyData.pages[path] = (dailyData.pages[path] || 0) + 1;
    dailyData.timeOfDay[timeOfDay] = (dailyData.timeOfDay[timeOfDay] || 0) + 1;
    dailyData.dayOfWeek[dayOfWeek] = (dailyData.dayOfWeek[dayOfWeek] || 0) + 1;
    dailyData.screenResolutions[screenResolution || 'Unknown'] = (dailyData.screenResolutions[screenResolution || 'Unknown'] || 0) + 1;
    dailyData.connectionTypes[connectionType] = (dailyData.connectionTypes[connectionType] || 0) + 1;
    
    if (isNewVisitor) {
      dailyData.newVsReturning.new += 1;
    } else {
      dailyData.newVsReturning.returning += 1;
    }

    if (sessionDuration) {
      dailyData.totalSessionTime = (dailyData.totalSessionTime || 0) + sessionDuration;
      dailyData.averageSessionDuration = dailyData.totalSessionTime / dailyData.events;
    }

    // Store all updates
    await Promise.all([
      kv.put('views_all_data', JSON.stringify(allViewsData)),
      kv.put('views_latest_events', JSON.stringify(latestEvents)),
      kv.put(dailyKey, JSON.stringify(dailyData))
    ]);

    return jsonResponse({ 
      views: postData.total,
      uniqueVisitors: postData.uniqueVisitors.length,
      isNewVisitor,
      averageTimeOnPage: postData.averageTimeOnPage || 0
    });

  } catch (error) {
    console.error("View POST failed:", error);
    return jsonResponse({ error: "Failed to save view data" }, 500);
  }
}
