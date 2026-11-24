// Google Analytics 4 provider for Page insights: the GA4 Data API with a Google service account
// (Viewer on the property). Reads only aggregated reports, never anything about one visitor.
//   https://developers.google.com/analytics/devguides/reporting/data/v1

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

// The site's GA4 events (scripts/cart.js, the form, booking and quiz blocks) that count as results.
export const CONVERSIONS = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'generate_lead', 'quiz_complete'];

let token = null;
let tokenExpiry = 0;

const fail = (message, status = 502) => Object.assign(new Error(message), { status });

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64urlJson = (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));

function pemToDer(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** The service account key (the JSON Google gives for a key), or null when it isn't set. */
export function serviceAccount(env) {
  if (!env.GA4_SERVICE_ACCOUNT) return null;
  try {
    const key = JSON.parse(env.GA4_SERVICE_ACCOUNT);
    return key.client_email && key.private_key ? key : null;
  } catch {
    return null;
  }
}

/** An access token for the service account (signed JWT exchanged at Google), cached until near expiry. */
export async function googleToken(key, fetchImpl = fetch, now = Date.now()) {
  if (token && tokenExpiry > now + 5 * 60 * 1000) return token;
  const iat = Math.floor(now / 1000);
  const unsigned = `${base64urlJson({ alg: 'RS256', typ: 'JWT' })}.${base64urlJson({
    iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
  })}`;
  let signature;
  try {
    const signingKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(key.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(unsigned));
  } catch {
    // not a PEM private key: the GA4_SERVICE_ACCOUNT secret holds something else
    throw fail('google_auth_failed');
  }
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  if (!res.ok) throw fail('google_auth_failed');
  const data = await res.json();
  token = data.access_token;
  tokenExpiry = now + (Number(data.expires_in) || 3600) * 1000;
  return token;
}

/** Forgets the cached token (tests). */
export function resetToken() {
  token = null;
  tokenExpiry = 0;
}

async function call(env, method, body, fetchImpl) {
  const accessToken = await googleToken(serviceAccount(env), fetchImpl);
  const res = await fetchImpl(`${API}/properties/${env.GA4_PROPERTY_ID}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(data.error?.message || '');
    // event-scoped custom dimensions (block_name, link_text) must be registered in GA4 first
    if (res.status === 400 && /customEvent:/.test(message)) throw fail('custom_dimensions_missing', 400);
    if (res.status === 403) throw fail('no_access_to_property', 403);
    throw fail(`ga4_${res.status}`);
  }
  return data;
}

/** Rows as objects keyed by the report's dimension and metric names. */
export function rowsOf(report) {
  const dims = (report.dimensionHeaders || []).map((h) => h.name);
  const metrics = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((row) => {
    const out = {};
    dims.forEach((name, i) => { out[name] = row.dimensionValues?.[i]?.value ?? ''; });
    // a request with two date ranges adds the range name as the last dimension value
    if (row.dimensionValues?.length > dims.length) out.dateRange = row.dimensionValues.at(-1).value;
    metrics.forEach((name, i) => { out[name] = Number(row.metricValues?.[i]?.value) || 0; });
    return out;
  });
}

const exact = (fieldName, value) => ({ filter: { fieldName, stringFilter: { matchType: 'EXACT', value } } });
const all = (...expressions) => ({ andGroup: { expressions } });

/** Dates (YYYYMMDD) of the last `days` calendar days in the property's time zone, oldest first. */
export function lastDays(days, timeZone, now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now));
  const [y, m, d] = today.split('-').map(Number);
  // count back calendar days (UTC dates have no daylight saving changes)
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - (days - 1 - i)))
    .toISOString().slice(0, 10).replaceAll('-', ''));
}

const SUMMARY_METRICS = ['screenPageViews', 'activeUsers', 'engagedSessions', 'userEngagementDuration'];
const summaryOf = (row = {}) => ({
  views: row.screenPageViews || 0,
  users: row.activeUsers || 0,
  engagedSessions: row.engagedSessions || 0,
  engagementSeconds: row.userEngagementDuration || 0,
});

const section = (promise) => promise.then((value) => ({ value }), (error) => ({ error: error.message }));

/**
 * The reports a page and the whole site share, over the last `days` days (`filter` limits them to
 * a page). Sections fail on their own, so one missing piece doesn't hide the others.
 */
function sharedSections(env, { days, filter }, fetchImpl, now) {
  const range = { startDate: `${days - 1}daysAgo`, endDate: 'today' };
  const withFilter = (body) => {
    if (!filter) return body;
    return { ...body, dimensionFilter: body.dimensionFilter ? all(filter, body.dimensionFilter) : filter };
  };
  const report = (body) => call(env, 'runReport', withFilter(body), fetchImpl);
  return {
    range,
    report,
    summary: section(report({
      dateRanges: [{ ...range, name: 'current' }, { startDate: `${2 * days - 1}daysAgo`, endDate: `${days}daysAgo`, name: 'previous' }],
      metrics: SUMMARY_METRICS.map((name) => ({ name })),
    }).then((r) => {
      const rows = rowsOf(r);
      return {
        current: summaryOf(rows.find((x) => x.dateRange === 'current')),
        previous: summaryOf(rows.find((x) => x.dateRange === 'previous')),
      };
    })),
    trend: section(report({
      dateRanges: [range],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'screenPageViews' }],
    }).then((r) => {
      const views = Object.fromEntries(rowsOf(r).map((x) => [x.date, x.screenPageViews]));
      return lastDays(days, env.PROPERTY_TIMEZONE || 'UTC', now).map((date) => ({ date, views: views[date] || 0 }));
    })),
    conversions: section(report({
      dateRanges: [range],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: CONVERSIONS } } },
    }).then((r) => {
      const counts = Object.fromEntries(rowsOf(r).map((x) => [x.eventName, x.eventCount]));
      return CONVERSIONS.map((name) => ({ name, count: counts[name] || 0 }));
    })),
    channels: section(report({
      dateRanges: [range],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }).then((r) => rowsOf(r).map((x) => ({
      source: x.sessionSource, medium: x.sessionMedium, sessions: x.sessions,
    })))),
  };
}

const allSections = async (sections) => Object.fromEntries(await Promise.all(
  Object.entries(sections).map(async ([name, promise]) => [name, await promise]),
));

/** One page over the last `days` days, compared with the days before, and what was clicked on it. */
export async function pageReport(env, { path, days }, fetchImpl = fetch, now = Date.now()) {
  // sign in first: without Google access no section can load, so the whole source fails
  await googleToken(serviceAccount(env), fetchImpl);
  const {
    range, report, summary, trend, conversions, channels,
  } = sharedSections(env, { days, filter: exact('pagePath', path) }, fetchImpl, now);
  const ctas = section(report({
    dateRanges: [range],
    dimensions: [{ name: 'customEvent:block_name' }, { name: 'customEvent:link_text' }],
    metrics: [{ name: 'eventCount' }],
    // button clicks, and what visitors opened or picked in blocks (FAQ, tabs, video, store locator)
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['cta_click', 'block_interaction'] } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 10,
  }).then((r) => rowsOf(r).map((x) => ({
    block: x['customEvent:block_name'], label: x['customEvent:link_text'], clicks: x.eventCount,
  }))));
  return allSections({
    summary, conversions, trend, ctas, channels,
  });
}

/** The whole site over the last `days` days: the same numbers, plus its top pages and events. */
export async function siteReport(env, { days }, fetchImpl = fetch, now = Date.now()) {
  // sign in first: without Google access no section can load, so the whole source fails
  await googleToken(serviceAccount(env), fetchImpl);
  const {
    range, report, summary, trend, conversions, channels,
  } = sharedSections(env, { days }, fetchImpl, now);
  const pages = section(report({
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  }).then((r) => rowsOf(r).map((x) => ({ path: x.pagePath, views: x.screenPageViews, users: x.activeUsers }))));
  const events = section(report({
    dateRanges: [range],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 15,
  }).then((r) => rowsOf(r).map((x) => ({ name: x.eventName, count: x.eventCount }))));
  return allSections({
    summary, conversions, trend, pages, events, channels,
  });
}

export const ga4 = {
  id: 'ga4',
  label: 'Google Analytics 4',
  configured: (env) => !!(env.GA4_PROPERTY_ID && serviceAccount(env)),
  page: pageReport,
  site: siteReport,
};
