// Page insights worker: analytics for one page of the site, for the Page insights DA app.
//   POST /page-insights/page {path, days: 7|30} → per analytics source: summary vs the days before,
//        conversions, daily views, clicks by block and button, traffic sources
//   POST /page-insights/site {days: 7|30} → the same for the whole site, plus top pages and events
// Callers are DA authors of SITE: their DA token (the DA SDK session of the app) must list the site in
// DA. Every source (provider) answers in the same shape, so the app shows one section per source.
import { ga4 } from './ga4.js';

const DA_ADMIN = 'https://admin.da.live';
const PROVIDERS = [ga4];
const PAGE_TTL = 5 * 60 * 1000;
const AUTH_TTL = 5 * 60 * 1000;
// one segment of a site path: letters, digits and - _ . , not starting with a dot
const SEGMENT_RE = /^[a-z0-9_-][a-z0-9._-]*$/i;

const authCache = new Map();
const reportCache = new Map();

const list = (v, fallback = '') => String(v || fallback).split(',').map((x) => x.trim()).filter(Boolean);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function stripPrefix(pathname, env) {
  const prefix = `/${String(env.PATH_PREFIX ?? 'page-insights').replace(/^\/+|\/+$/g, '')}`;
  if (prefix === '/') return pathname;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || '/';
  return pathname;
}

/** Exact origin, or `*` standing for one branch label (`https://*--demo--scdemos.aem.page`). */
export function originAllowed(origin, env) {
  if (!origin) return false;
  return list(env.ALLOWED_ORIGINS).some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    const re = allowed.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?');
    return new RegExp(`^${re}$`).test(origin);
  });
}

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': originAllowed(origin, env) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const json = (headers, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function jwtClaims(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether DA lets the caller write SITE: its X-da-actions header (`/key=read,write`) names `write`. */
function canWrite(res) {
  const actions = res.headers.get('X-da-actions');
  // DA sends it when the org has a permissions sheet; without one, every signed-in user can write
  if (actions === null) return true;
  return actions.slice(actions.indexOf('=') + 1).split(',').map((a) => a.trim()).includes('write');
}

/** Passes when the caller's DA token can write SITE in DA (so they author it). */
export async function verifyAuthor(request, env, fetchImpl = fetch, now = Date.now()) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw fail('sign_in_required', 401);
  const claims = jwtClaims(token);
  if (!claims?.client_id || !list(env.IMS_CLIENT_IDS, 'darkalley').includes(claims.client_id)) throw fail('token_not_accepted', 401);
  // IMS access tokens carry created_at and expires_in (milliseconds)
  const expires = Number(claims.created_at) + Number(claims.expires_in);
  if (Number.isFinite(expires) && expires <= now) throw fail('token_invalid', 401);
  const key = await sha256(token);
  if ((authCache.get(key) || 0) > now) return;
  const res = await fetchImpl(`${DA_ADMIN}/list/${env.SITE}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw fail('token_invalid', 401);
  if (!res.ok || !canWrite(res)) throw fail('not_an_author', 403);
  authCache.set(key, Math.min(now + AUTH_TTL, Number.isFinite(expires) ? expires : Infinity));
}

/** The page path to report on, from the request body. */
export function pagePath(value) {
  const path = String(value || '');
  const segments = path.split('/').slice(1);
  // "/" and "/en/" end in an empty segment; any other empty one ("//") is invalid
  const ok = path.startsWith('/') && path.length <= 300
    && segments.every((s, i) => SEGMENT_RE.test(s) || (s === '' && i === segments.length - 1));
  if (!ok) throw fail('invalid_path');
  return path;
}

/** The report period: 7 or 30 days (30 unless 7 is asked for). */
const periodOf = (body) => (Number(body.days) === 7 ? 7 : 30);

async function cached(key, ttl, load, now = Date.now()) {
  const hit = reportCache.get(key);
  if (hit && hit.exp > now) return hit.value;
  const value = await load();
  // a source or section that failed is asked again next time
  const failed = value.some((source) => source.status === 'error'
    || Object.values(source.data || {}).some((section) => section?.error));
  if (failed) return value;
  if (reportCache.size > 500) reportCache.clear();
  reportCache.set(key, { value, exp: now + ttl });
  return value;
}

/** One entry per source: { id, label, status: ok | not_configured | error, error?, data? }. */
async function fromSources(env, run) {
  return Promise.all(PROVIDERS.map(async (p) => {
    const head = { id: p.id, label: p.label };
    if (!p.configured(env)) return { ...head, status: 'not_configured' };
    try {
      return { ...head, status: 'ok', data: await run(p) };
    } catch (e) {
      return { ...head, status: 'error', error: e.message };
    }
  }));
}

/** Clears the caches (tests). */
export function resetCaches() {
  authCache.clear();
  reportCache.clear();
}

export async function handle(request, env, fetchImpl = fetch) {
  const headers = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json(headers, { error: 'method_not_allowed' }, 405);
  if (!originAllowed(request.headers.get('Origin') || '', env)) return json(headers, { error: 'origin_not_allowed' }, 403);
  const route = stripPrefix(new URL(request.url).pathname.replace(/\/$/, '') || '/', env);
  try {
    await verifyAuthor(request, env, fetchImpl);
    if (route === '/page') {
      const parsed = await request.json().catch(() => null);
      const body = parsed && typeof parsed === 'object' ? parsed : {};
      const path = pagePath(body.path);
      const days = periodOf(body);
      const sources = await cached(`page:${path}:${days}`, PAGE_TTL, () => fromSources(env, (p) => p.page(env, { path, days }, fetchImpl)));
      return json(headers, { path, days, sources });
    }
    if (route === '/site') {
      const parsed = await request.json().catch(() => null);
      const days = periodOf(parsed && typeof parsed === 'object' ? parsed : {});
      const sources = await cached(`site:${days}`, PAGE_TTL, () => fromSources(env, (p) => p.site(env, { days }, fetchImpl)));
      return json(headers, { days, sources });
    }
    return json(headers, { error: 'not_found' }, 404);
  } catch (e) {
    return json(headers, { error: e.message }, e.status || 502);
  }
}

export default {
  fetch: (request, env) => handle(request, env),
};
