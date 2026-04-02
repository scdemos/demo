/**
 * Cloudflare Access: Cf-Access-* headers and/or valid `CF_Authorization` JWT cookie.
 */
const SKEW_SEC = 120;

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

function base64UrlDecodeUtf8(segment) {
  let b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecodeUtf8(parts[1]));
  } catch {
    return null;
  }
}

function payloadOk(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const iss = payload.iss;
  if (typeof iss !== 'string' || !iss.includes('cloudflareaccess.com')) return false;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now - SKEW_SEC) return false;
  if (typeof payload.nbf === 'number' && payload.nbf > now + SKEW_SEC) return false;
  return true;
}

/** @param {Request} request */
export function isAuthenticated(request) {
  if (request.headers.get('Cf-Access-Authenticated-User-Email')) return true;
  if (request.headers.get('Cf-Access-Jwt-Assertion')) return true;

  const token = getCookie(request, 'CF_Authorization');
  if (!token) return false;

  const p = decodeJwtPayload(token);
  return payloadOk(p);
}
