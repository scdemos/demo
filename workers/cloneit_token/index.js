const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

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

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    if (!isOriginAllowed(request, env)) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }

    if (!env.ADOBE_CLIENT_ID || !env.ADOBE_CLIENT_SECRET) {
      return new Response('Worker not configured', { status: 500, headers: cors });
    }

    try {
      const tokenData = await generateToken(env);
      return new Response(JSON.stringify(tokenData), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
