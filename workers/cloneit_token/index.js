// CloneIt worker: OPTIONS; POST /cloneprocess → Helix/DA; POST / → IMS token. PATH_PREFIX for routes like /cloneit/*.

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_ORG = 'scdemos';
const HELIX_ORIGIN = 'https://admin.hlx.page';
const DA_ORIGIN = 'https://admin.da.live';
const ERROR_SOURCE = 'cloneit-worker';

let cachedToken = null;
let cachedExpiry = 0;

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const match = allowed.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  return getAllowedOrigins(env).includes(origin);
}

function jsonResponse(cors, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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

function workerErr(cors, message, status) {
  return jsonResponse(cors, { error: message, source: ERROR_SOURCE }, status);
}

function isSafePath(path) {
  if (!path || typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
    return false;
  }
  return true;
}

// Allowlist — keep in sync with tools/cloneit/cloneit.js Paths.
function isAllowedProxyPath(kind, path, org) {
  if (!isSafePath(path)) return false;
  const esc = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kind === 'helix') {
    return new RegExp(`^/config/${esc}/sites/`).test(path);
  }
  if (kind === 'da') {
    return new RegExp(`^/(list|config|copy|source)/${esc}/`).test(path);
  }
  return false;
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateToken(env) {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;
  if (cachedToken && cachedExpiry > now + bufferMs) {
    return { access_token: cachedToken, expires_in: Math.floor((cachedExpiry - now) / 1000) };
  }

  const body = new URLSearchParams({
    client_id: env.ADOBE_CLIENT_ID,
    client_secret: env.ADOBE_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: env.ADOBE_SCOPES || 'openid,AdobeID',
  });

  const resp = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`IMS token request failed: ${resp.status} - ${text}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  cachedExpiry = now + (data.expires_in * 1000);

  return { access_token: data.access_token, expires_in: data.expires_in };
}

async function proxyToAdmin(request, env, cors) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return workerErr(cors, 'Invalid JSON body', 400);
  }

  const kind = payload.kind === 'da' ? 'da' : payload.kind === 'helix' ? 'helix' : '';
  const targetPath = typeof payload.path === 'string' ? payload.path : '';
  const method = (payload.method || 'GET').toUpperCase();
  const org = env.ORG || DEFAULT_ORG;

  if (!kind) {
    return workerErr(cors, 'Invalid kind (use helix or da)', 400);
  }
  if (!['GET', 'PUT', 'POST'].includes(method)) {
    return workerErr(cors, 'Invalid method', 400);
  }
  if (!isAllowedProxyPath(kind, targetPath, org)) {
    return workerErr(cors, 'Path not allowed', 400);
  }

  const hasBody = payload.body != null && payload.body !== '';
  const hasForm = !!(payload.form && typeof payload.form === 'object');
  const hasFile = !!(payload.file && typeof payload.file === 'object');
  const modes = [hasBody, hasForm, hasFile].filter(Boolean);
  if (modes.length > 1) {
    return workerErr(cors, 'Use only one of body, form, or file', 400);
  }

  const { access_token: accessToken } = await generateToken(env);
  const bearer = `Bearer ${accessToken}`;
  const targetUrl = kind === 'helix' ? `${HELIX_ORIGIN}${targetPath}` : `${DA_ORIGIN}${targetPath}`;

  const headers = kind === 'helix'
    ? { Authorization: bearer, 'x-content-source-authorization': bearer }
    : { Authorization: bearer };

  let body;
  if (hasFile) {
    const { field, filename, base64, contentType } = payload.file;
    if (!field || !filename || typeof base64 !== 'string') {
      return workerErr(cors, 'Invalid file payload', 400);
    }
    const bytes = base64ToUint8Array(base64);
    const formData = new FormData();
    formData.append(field, new Blob([bytes], { type: contentType || 'application/octet-stream' }), filename);
    body = formData;
  } else if (hasForm) {
    const formData = new FormData();
    Object.entries(payload.form).forEach(([k, v]) => {
      if (typeof v === 'string') formData.append(k, v);
    });
    body = formData;
  } else if (hasBody) {
    if (payload.contentType) {
      headers['Content-Type'] = payload.contentType;
    }
    body = typeof payload.body === 'string' ? payload.body : String(payload.body);
  }

  const fetchInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    fetchInit.body = body;
  }

  const upstream = await fetch(targetUrl, fetchInit);

  const passthroughHeaders = {
    ...cors,
    'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
    'Access-Control-Expose-Headers': 'x-error',
  };
  const xError = upstream.headers.get('x-error');
  if (xError) passthroughHeaders['x-error'] = xError;

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: passthroughHeaders,
  });
}

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);
    const url = new URL(request.url);
    let pathname = url.pathname.replace(/\/$/, '') || '/';
    pathname = stripPathPrefix(pathname, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    if (!isOriginAllowed(request, env)) {
      return workerErr(cors, 'origin_not_allowed', 403);
    }

    if (!env.ADOBE_CLIENT_ID || !env.ADOBE_CLIENT_SECRET) {
      return workerErr(cors, 'Worker not configured', 500);
    }

    if (pathname === '/cloneprocess') {
      try {
        return await proxyToAdmin(request, env, cors);
      } catch (err) {
        return workerErr(cors, err.message || String(err), 502);
      }
    }

    try {
      const tokenData = await generateToken(env);
      return new Response(JSON.stringify(tokenData), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return workerErr(cors, err.message, 502);
    }
  },
};
