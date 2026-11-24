// Demo access worker: replaces the n8n "BBirrd Demo Access Request" workflow.
//   POST /access/whoami  → the signed-in user { email, name, automatic }
//   POST /access/request → { githubUser }: give the signed-in user access to the demo
// The caller's identity comes from their own Adobe IMS token (the DA SDK session of the access app),
// never from the request body. Emails on AUTO_DOMAINS (adobe.com) get access right away:
//   1. GitHub: added to the scdemos team (GITHUB_TEAM), so CloneIt can create demo repos for them
//   2. Admin Console (User Management API): user created in the CAS Hub org and added to
//      ADMIN_GROUP (da-demosite-authors), which has write on /demo in the DA permissions sheet
// Anyone else is added to the access requests sheet for an admin to review.

const IMS = 'https://ims-na1.adobelogin.com';
const UMAPI = 'https://usermanagement.adobe.io/v2/usermanagement';
const GITHUB_API = 'https://api.github.com';
const DA_ADMIN = 'https://admin.da.live';
const GH_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

let techToken = null;
let techExpiry = 0;
const userCache = new Map();

const list = (v, fallback = '') => String(v || fallback).split(',').map((x) => x.trim()).filter(Boolean);

function stripPrefix(pathname, env) {
  const prefix = `/${String(env.PATH_PREFIX ?? 'access').replace(/^\/+|\/+$/g, '')}`;
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
  status, headers: { ...headers, 'Content-Type': 'application/json' },
});
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

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

/** The caller's verified Adobe identity: { email, firstName, lastName }. */
export async function verifyUser(request, env, fetchImpl = fetch) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw fail('sign_in_required', 401);
  const claims = jwtClaims(token);
  if (!claims?.client_id || !list(env.IMS_CLIENT_IDS, 'darkalley').includes(claims.client_id)) throw fail('token_not_accepted', 401);
  const key = await sha256(token);
  const hit = userCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.user;
  const cid = encodeURIComponent(claims.client_id);
  const headers = { Authorization: `Bearer ${token}` };
  const valid = await fetchImpl(`${IMS}/ims/validate_token/v1?client_id=${cid}&type=access_token`, { headers });
  if (!valid.ok || (await valid.json().catch(() => ({}))).valid !== true) throw fail('token_invalid', 401);
  const prof = await fetchImpl(`${IMS}/ims/profile/v1?client_id=${cid}`, { headers });
  const p = await prof.json().catch(() => ({}));
  const email = String(p.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw fail('no_email_on_account', 403);
  const user = { email, firstName: String(p.first_name || '').trim(), lastName: String(p.last_name || '').trim() };
  userCache.set(key, { user, exp: Date.now() + 5 * 60 * 1000 });
  return user;
}

export const isAutomatic = (email, env) => list(env.AUTO_DOMAINS, 'adobe.com')
  .some((d) => email.endsWith(`@${d.toLowerCase()}`));

/** Technical account token (client credentials) for the User Management API and DA. */
async function getTechToken(env, fetchImpl) {
  if (techToken && techExpiry > Date.now() + 5 * 60 * 1000) return techToken;
  const body = new URLSearchParams({
    client_id: env.UMAPI_CLIENT_ID,
    client_secret: env.UMAPI_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: env.UMAPI_SCOPES || 'openid,AdobeID,user_management_sdk',
  });
  const res = await fetchImpl(`${IMS}/ims/token/v3`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw fail(`tech_token_failed_${res.status}`, 502);
  const data = await res.json();
  techToken = data.access_token;
  techExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return techToken;
}

function github(env, fetchImpl) {
  return async (path, init = {}) => {
    const res = await fetchImpl(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TEAM_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'scdemos-demo-access',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
  };
}

/** Adds the GitHub user to the team; 'active' when already in the org, 'pending' when GitHub sends an invitation. */
export async function addToTeam(githubUser, env, gh) {
  const user = await gh(`/users/${encodeURIComponent(githubUser)}`);
  if (user.status === 404) throw fail('github_user_not_found');
  if (!user.ok) throw fail(`github_lookup_failed_${user.status}`, 502);
  const org = env.GITHUB_ORG || 'scdemos';
  const team = env.GITHUB_TEAM || 'sc-team';
  const res = await gh(`/orgs/${org}/teams/${team}/memberships/${encodeURIComponent(user.json.login)}`, {
    method: 'PUT', body: JSON.stringify({ role: 'member' }),
  });
  // GitHub explains refusals (scope, SSO, 2FA, invitation limits): pass its message on
  if (!res.ok) throw fail(`github_team_add_failed_${res.status}${res.json?.message ? `: ${res.json.message}` : ''}`, 502);
  return { login: user.json.login, state: res.json?.state || 'active' };
}

/** Creates the user in the Admin Console org (Federated ID; kept if it exists) and adds them to the group. */
export async function addToAdminConsole(user, env, fetchImpl) {
  const token = await getTechToken(env, fetchImpl);
  const group = env.ADMIN_GROUP || 'da-demosite-authors';
  const command = [{
    user: user.email,
    requestID: `access_${Date.now()}`,
    do: [
      {
        createFederatedID: {
          email: user.email,
          country: env.USER_COUNTRY || 'US',
          firstname: user.firstName || user.email.split('@')[0],
          lastname: user.lastName || '-',
          option: 'ignoreIfAlreadyExists',
        },
      },
      { add: { group: [group] } },
    ],
  }];
  const res = await fetchImpl(`${UMAPI}/action/${env.ADMIN_ORG_ID}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': env.UMAPI_CLIENT_ID,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(command),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.notCompleted > 0 || (body.errors || []).length) {
    const code = body.errors?.[0]?.errorCode || `status_${res.status}`;
    throw fail(`admin_console_failed: ${code}`, 502);
  }
  return { group };
}

/** Adds a row to the access requests sheet (for an admin to review); one row per email. */
export async function recordRequest(user, githubUser, env, fetchImpl, wait = (ms) => new Promise((r) => { setTimeout(r, ms); })) {
  const token = await getTechToken(env, fetchImpl);
  const url = `${DA_ADMIN}/source${env.REQUESTS_SHEET}`;
  const listed = (rows) => rows.some((u) => String(u.Email || '').toLowerCase() === user.email);
  let wrote = false;
  // up to 3 writes, each checked by the next read: two requests at once can overwrite each other
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw fail(`requests_read_failed_${res.status}`, 502);
    const sheet = await res.json();
    const users = sheet.users || { total: 0, limit: 0, offset: 0, data: [] };
    const rows = (users.data || []).filter((u) => Object.values(u).some((v) => String(v ?? '').trim()));
    if (listed(rows)) return { alreadyRequested: !wrote };
    if (attempt === 3) break;
    rows.push({
      Email: user.email,
      'First Name': user.firstName,
      'Last Name': user.lastName,
      'Country Code': env.USER_COUNTRY || 'US',
      Id: user.email,
      'Role Request': 'config_admin, publish',
      Notes: `SC Demos gh: ${githubUser}; requested ${new Date().toISOString().slice(0, 10)}`,
    });
    const next = { ...sheet, users: { ...users, data: rows, total: rows.length, limit: rows.length } };
    const form = new FormData();
    form.append('data', new Blob([JSON.stringify(next)], { type: 'application/json' }), 'blob');
    const put = await fetchImpl(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!put.ok) throw fail(`requests_write_failed_${put.status}`, 502);
    wrote = true;
    await wait(500);
  }
  throw fail('requests_write_not_confirmed', 502);
}

/** Gives the signed-in user access; each step is reported, a failing step doesn't hide the others. */
export async function grantAccess(user, githubUser, env, fetchImpl = fetch, wait = undefined) {
  if (!GH_USER_RE.test(githubUser || '')) throw fail('invalid_github_user');
  if (!isAutomatic(user.email, env)) {
    const r = await recordRequest(user, githubUser, env, fetchImpl, wait);
    return { email: user.email, automatic: false, steps: [{ step: 'request', ok: true, ...r }] };
  }
  const steps = [];
  const run = async (step, fn) => {
    try {
      steps.push({ step, ok: true, ...(await fn()) });
    } catch (e) {
      steps.push({ step, ok: false, error: e.message });
    }
  };
  await run('github', () => addToTeam(githubUser, env, github(env, fetchImpl)));
  await run('adminConsole', () => addToAdminConsole(user, env, fetchImpl));
  return { email: user.email, automatic: true, steps };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json(headers, { error: 'method_not_allowed' }, 405);
    if (!originAllowed(request.headers.get('Origin') || '', env)) return json(headers, { error: 'origin_not_allowed' }, 403);
    const path = stripPrefix(new URL(request.url).pathname.replace(/\/$/, '') || '/', env);
    try {
      const user = await verifyUser(request, env);
      if (path === '/whoami') {
        return json(headers, { email: user.email, name: `${user.firstName} ${user.lastName}`.trim(), automatic: isAutomatic(user.email, env) });
      }
      if (path === '/request') {
        if (!env.UMAPI_CLIENT_ID || !env.UMAPI_CLIENT_SECRET || !env.GITHUB_TEAM_TOKEN) return json(headers, { error: 'not_configured' }, 501);
        const body = await request.json().catch(() => ({}));
        return json(headers, await grantAccess(user, String(body.githubUser || '').trim(), env));
      }
      return json(headers, { error: 'not_found' }, 404);
    } catch (e) {
      return json(headers, { error: e.message }, e.status || 502);
    }
  },
};
