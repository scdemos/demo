// CloneIt / Demo Creator worker.
//   POST /whoami        → verified caller { email, standalone }
//   POST /cloneprocess  → allow-listed Admin API (admin.hlx.page) / DA (admin.da.live) proxy, technical account
//   POST /standalone    → create scdemos/<site> from the template repo, add it to AEM Code Sync, make the requester admin
//   POST /              → readiness ping (never returns a token)
// New routes require the caller's own Adobe IMS access token (Authorization: Bearer …, as provided by the
// DA SDK), validated against IMS and restricted to ALLOWED_EMAIL_DOMAINS. CORS origin checks are a browser
// convenience only; they are not authentication.
// LEGACY_COMPAT (default on): requests WITHOUT an Authorization header behave exactly like the previous
// CloneIt worker (POST / returns the technical token, /cloneprocess limited to the old allowlist), so the
// currently deployed CloneIt page keeps working. Set LEGACY_COMPAT = "false" once every page sends a token.

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const IMS_ORIGIN = 'https://ims-na1.adobelogin.com';
const GITHUB_API = 'https://api.github.com';
const DEFAULT_ORG = 'scdemos';
const HELIX_ORIGIN = 'https://admin.hlx.page';
const DA_ORIGIN = 'https://admin.da.live';
const ERROR_SOURCE = 'cloneit-worker';
const SITE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GH_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

let cachedToken = null;
let cachedExpiry = 0;
const userCache = new Map(); // token hash → { email, exp }

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * Exact match, or a `*` wildcard for one branch label: `https://*--demo--scdemos.aem.page` allows
 * `https://custdemo--demo--scdemos.aem.page` (branch previews), never extra subdomains or other hosts.
 */
export function originMatches(origin, env) {
  if (!origin) return false;
  return getAllowedOrigins(env).some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    const re = new RegExp(`^${allowed.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?')}$`);
    return re.test(origin);
  });
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const match = originMatches(origin, env) ? origin : '';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'x-error',
    Vary: 'Origin',
  };
}

function isOriginAllowed(request, env) {
  return originMatches(request.headers.get('Origin') || '', env);
}

function jsonResponse(cors, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function workerErr(cors, message, status, extra = {}) {
  return jsonResponse(cors, { error: message, source: ERROR_SOURCE, ...extra }, status);
}

function stripPathPrefix(pathname, env) {
  const raw = (env.PATH_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return pathname;
  const prefix = `/${raw}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    const rest = pathname.slice(prefix.length) || '/';
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

function isSafePath(path) {
  return !!path && typeof path === 'string' && path.startsWith('/') && !path.includes('..');
}

// Allowlist — keep in sync with tools/cloneit/cloneit.js Paths.
export function isAllowedProxyPath(kind, path, org, legacy = false) {
  if (!isSafePath(path)) return false;
  const esc = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kind === 'helix') {
    return new RegExp(`^/config/${esc}/sites/`).test(path)
      || (!legacy && new RegExp(`^/(code|preview|live|job|status)/${esc}/[a-z0-9-]+/`).test(path));
  }
  if (kind === 'da') return new RegExp(`^/(list|config|copy|source)/${esc}/`).test(path);
  return false;
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/** Validates the caller's IMS access token; returns { email } or throws with .status. */
export async function verifyUser(request, env, fetchImpl = fetch) {
  const fail = (msg, status = 401) => Object.assign(new Error(msg), { status });
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw fail('sign_in_required: open this tool from da.live while signed in');
  const claims = decodeJwtPayload(token);
  const allowedClients = (env.IMS_CLIENT_IDS || 'darkalley').split(',').map((c) => c.trim());
  if (!claims?.client_id || !allowedClients.includes(claims.client_id)) throw fail('token_not_accepted');
  const key = await sha256(token);
  const hit = userCache.get(key);
  if (hit && hit.exp > Date.now()) return { email: hit.email };
  const cid = encodeURIComponent(claims.client_id);
  const headers = { Authorization: `Bearer ${token}` };
  const valid = await fetchImpl(`${IMS_ORIGIN}/ims/validate_token/v1?client_id=${cid}&type=access_token`, { headers });
  const v = await valid.json().catch(() => ({}));
  if (!valid.ok || v.valid !== true) throw fail('token_invalid');
  const prof = await fetchImpl(`${IMS_ORIGIN}/ims/profile/v1?client_id=${cid}`, { headers });
  const p = await prof.json().catch(() => ({}));
  const email = String(p.email || '').toLowerCase();
  const domains = (env.ALLOWED_EMAIL_DOMAINS || 'adobe.com').split(',').map((d) => d.trim().toLowerCase());
  if (!email || !domains.some((d) => email.endsWith(`@${d}`))) throw fail('user_not_allowed', 403);
  userCache.set(key, { email, exp: Date.now() + 5 * 60 * 1000 });
  return { email };
}

async function generateToken(env) {
  const now = Date.now();
  if (cachedToken && cachedExpiry > now + 5 * 60 * 1000) return cachedToken;
  const body = new URLSearchParams({
    client_id: env.ADOBE_CLIENT_ID,
    client_secret: env.ADOBE_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: env.ADOBE_SCOPES || 'openid,AdobeID',
  });
  const resp = await fetch(IMS_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!resp.ok) throw new Error(`IMS token request failed: ${resp.status}`);
  const data = await resp.json();
  cachedToken = data.access_token;
  cachedExpiry = now + (data.expires_in * 1000);
  return cachedToken;
}

async function proxyToAdmin(request, env, cors, legacy = false) {
  let payload;
  try { payload = await request.json(); } catch { return workerErr(cors, 'Invalid JSON body', 400); }

  const kind = ['da', 'helix'].includes(payload.kind) ? payload.kind : '';
  const targetPath = typeof payload.path === 'string' ? payload.path : '';
  const method = (payload.method || 'GET').toUpperCase();
  const org = env.ORG || DEFAULT_ORG;
  if (!kind) return workerErr(cors, 'Invalid kind (use helix or da)', 400);
  if (!['GET', 'PUT', 'POST'].includes(method)) return workerErr(cors, 'Invalid method', 400);
  if (!isAllowedProxyPath(kind, targetPath, org, legacy)) return workerErr(cors, 'Path not allowed', 400);

  const hasBody = payload.body != null && payload.body !== '';
  const hasForm = !!(payload.form && typeof payload.form === 'object');
  const hasFile = !!(payload.file && typeof payload.file === 'object');
  if ([hasBody, hasForm, hasFile].filter(Boolean).length > 1) return workerErr(cors, 'Use only one of body, form, or file', 400);

  const bearer = `Bearer ${await generateToken(env)}`;
  const targetUrl = kind === 'helix' ? `${HELIX_ORIGIN}${targetPath}` : `${DA_ORIGIN}${targetPath}`;
  const headers = kind === 'helix' ? { Authorization: bearer, 'x-content-source-authorization': bearer } : { Authorization: bearer };

  let body;
  if (hasFile) {
    const { field, filename, base64, contentType } = payload.file;
    if (!field || !filename || typeof base64 !== 'string') return workerErr(cors, 'Invalid file payload', 400);
    body = new FormData();
    body.append(field, new Blob([base64ToUint8Array(base64)], { type: contentType || 'application/octet-stream' }), filename);
  } else if (hasForm) {
    body = new FormData();
    Object.entries(payload.form).forEach(([k, v]) => { if (typeof v === 'string') body.append(k, v); });
  } else if (hasBody) {
    if (payload.contentType) headers['Content-Type'] = payload.contentType;
    body = typeof payload.body === 'string' ? payload.body : String(payload.body);
  }

  const init = { method, headers };
  if (method !== 'GET' && body !== undefined) init.body = body;
  const upstream = await fetch(targetUrl, init);
  const out = { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream' };
  const xError = upstream.headers.get('x-error');
  if (xError) out['x-error'] = xError;
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

/* ---------- standalone: GitHub repo + AEM Code Sync ---------- */

export function githubClient(env, fetchImpl = fetch) {
  return async (path, init = {}) => {
    const res = await fetchImpl(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_PROVISION_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'scdemos-demo-creator',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, ok: res.ok, json };
  };
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Creates scdemos/<site> from the template and adds it to the AEM Code Sync installation. */
export async function provisionStandalone({ site, githubUser, email, resume }, env, gh, wait = sleep) {
  const org = env.ORG || DEFAULT_ORG;
  const [tOwner, tRepo] = (env.TEMPLATE_REPO || `${org}/demo`).split('/');
  const steps = [];
  const fail = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, extra: { steps, ...extra } });

  if (!SITE_RE.test(site || '') || site.length > 50) throw fail('invalid_site_name');
  if (site === tRepo) throw fail('site_name_is_template');
  // the requester becomes admin of the new repo, so their GitHub account is required
  if (!githubUser || !GH_USER_RE.test(githubUser)) throw fail('github_user_required');

  // the SC must belong to the team (or the org, when no team is configured)
  {
    const m = env.SC_TEAM
      ? await gh(`/orgs/${org}/teams/${env.SC_TEAM}/memberships/${githubUser}`)
      : await gh(`/orgs/${org}/members/${githubUser}`);
    const ok = env.SC_TEAM ? m.ok && m.json?.state === 'active' : m.status === 204;
    if (!ok) throw fail(`github_user_not_in_${env.SC_TEAM ? `team_${env.SC_TEAM}` : `org_${org}`}`, 403);
    steps.push('membership verified');
  }

  const existing = await gh(`/repos/${org}/${site}`);
  let repo = existing.ok ? existing.json : null;
  if (repo && !resume) throw fail('repo_exists', 409, { repoUrl: repo.html_url });
  if (repo) {
    // only resume repos this tool created (tagged customer-demo); never take over other scdemos repos
    const topics = await gh(`/repos/${org}/${site}/topics`);
    if (!(topics.json?.names || []).includes('customer-demo')) throw fail('repo_exists_not_a_demo', 409, { repoUrl: repo.html_url });
  }
  if (!repo) {
    const gen = await gh(`/repos/${tOwner}/${tRepo}/generate`, {
      method: 'POST',
      body: JSON.stringify({ owner: org, name: site, description: `Customer demo: ${site} (requested by ${email})`, include_all_branches: false, private: false }),
    });
    if (!gen.ok) throw fail(`repo_create_failed_${gen.status}: ${gen.json?.message || ''}`, 502);
    repo = gen.json;
    steps.push('repository created from template');
  } else {
    steps.push('repository exists (resumed)');
  }

  // template generation is async: wait for the default branch
  let ready = false;
  for (let i = 0; i < 20 && !ready; i += 1) {
    ready = (await gh(`/repos/${org}/${site}/git/ref/heads/main`)).ok;
    if (!ready) await wait(1500);
  }
  if (!ready) throw fail('repo_not_ready', 504);
  steps.push('main branch ready');

  // add the repo to the existing AEM Code Sync installation (needs an org-owner user token)
  let installationId = env.CODE_SYNC_INSTALLATION_ID ? Number(env.CODE_SYNC_INSTALLATION_ID) : null;
  if (!installationId) {
    for (let page = 1; page <= 5 && !installationId; page += 1) {
      const list = await gh(`/user/installations?per_page=100&page=${page}`);
      const items = list.json?.installations || [];
      const hit = items.find((x) => x.app_slug === (env.CODE_SYNC_APP_SLUG || 'aem-code-sync') && String(x.account?.login).toLowerCase() === org);
      if (hit) installationId = hit.id;
      if (items.length < 100) break;
    }
  }
  const codeSync = { added: false, installationId };
  if (!installationId) {
    codeSync.reason = 'code_sync_installation_not_found';
  } else {
    const add = await gh(`/user/installations/${installationId}/repositories/${repo.id}`, { method: 'PUT' });
    codeSync.added = add.status === 204 || add.ok;
    if (!codeSync.added) codeSync.reason = `code_sync_add_failed_${add.status}`;
  }
  steps.push(codeSync.added ? 'added to AEM Code Sync' : `AEM Code Sync not added (${codeSync.reason})`);

  // access for the SC: team push and/or the user as maintainer
  if (env.SC_TEAM) {
    const t = await gh(`/orgs/${org}/teams/${env.SC_TEAM}/repos/${org}/${site}`, { method: 'PUT', body: JSON.stringify({ permission: 'push' }) });
    steps.push(t.ok || t.status === 204 ? `team ${env.SC_TEAM}: push` : `team access failed (${t.status})`);
  }
  if (githubUser) {
    const c = await gh(`/repos/${org}/${site}/collaborators/${githubUser}`, { method: 'PUT', body: JSON.stringify({ permission: 'admin' }) });
    steps.push(c.ok || c.status === 204 ? `${githubUser}: admin` : `admin grant failed (${c.status})`);
  }
  await gh(`/repos/${org}/${site}/topics`, { method: 'PUT', body: JSON.stringify({ names: ['customer-demo'] }) });

  return {
    repoUrl: repo.html_url || `https://github.com/${org}/${site}`,
    owner: org,
    repo: site,
    codeSync,
    codeSyncInstallUrl: `https://github.com/apps/${env.CODE_SYNC_APP_SLUG || 'aem-code-sync'}/installations/new`,
    steps,
  };
}

/* ---------- router ---------- */

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);
    const url = new URL(request.url);
    const pathname = stripPathPrefix(url.pathname.replace(/\/$/, '') || '/', env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!isOriginAllowed(request, env)) return workerErr(cors, 'origin_not_allowed', 403);
    if (!env.ADOBE_CLIENT_ID || !env.ADOBE_CLIENT_SECRET) return workerErr(cors, 'Worker not configured', 500);

    // previous CloneIt page (no Authorization header): unchanged behavior while LEGACY_COMPAT is on
    if (!request.headers.get('Authorization') && env.LEGACY_COMPAT !== 'false' && ['/', '/cloneprocess'].includes(pathname)) {
      try {
        if (pathname === '/cloneprocess') return await proxyToAdmin(request, env, cors, true);
        const token = await generateToken(env);
        return jsonResponse(cors, { access_token: token, expires_in: Math.max(0, Math.floor((cachedExpiry - Date.now()) / 1000)) });
      } catch (err) {
        return workerErr(cors, err.message || String(err), 502);
      }
    }

    let user;
    try {
      user = await verifyUser(request, env);
    } catch (err) {
      return workerErr(cors, err.message, err.status || 401);
    }

    try {
      if (pathname === '/whoami') {
        return jsonResponse(cors, { email: user.email, standalone: !!env.GITHUB_PROVISION_TOKEN, team: env.SC_TEAM || null });
      }
      if (pathname === '/cloneprocess') return await proxyToAdmin(request, env, cors);
      if (pathname === '/standalone') {
        if (!env.GITHUB_PROVISION_TOKEN) return workerErr(cors, 'standalone_not_configured', 501);
        const body = await request.json().catch(() => ({}));
        const result = await provisionStandalone({
          site: String(body.site || '').toLowerCase(),
          githubUser: body.githubUser ? String(body.githubUser).trim() : '',
          email: user.email,
          resume: body.resume === true,
        }, env, githubClient(env));
        return jsonResponse(cors, result);
      }
      if (pathname === '/') {
        await generateToken(env); // proves the technical account works; the token never leaves the worker
        return jsonResponse(cors, { ok: true, email: user.email });
      }
      return workerErr(cors, 'not_found', 404);
    } catch (err) {
      return workerErr(cors, err.message || String(err), err.status || 502, err.extra || {});
    }
  },
};
