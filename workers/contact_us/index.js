/*
 * Generic contact/form-submission worker for demo sites.
 * Accepts any form, in any common encoding, and forwards every filled field to Slack.
 * See README.md for the accepted payload shapes and meta fields.
 */
const MAX_BODY = 100 * 1024;
const MAX_FIELDS = 50;
const MAX_VALUE = 2000;
const MAX_SLACK_TEXT = 35000;

// keys that are form plumbing, not user input
const IGNORED_KEYS = /^(submit|reset|button|g-recaptcha-response|h-captcha-response|cf-turnstile-response|recaptcha.*|captcha.*)$/i;
// filled honeypots mean a bot: accept silently, send nothing
const HONEYPOT_KEYS = /^(_gotcha|_honeypot|honeypot|_hp|hp_.*|website_url)$/i;

function cors(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') || 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json' },
  });
}

/** Flattens nested objects/arrays into [key, value] string pairs. */
function flatten(value, key = '', out = []) {
  if (value === null || value === undefined) return out;
  if (typeof File !== 'undefined' && value instanceof File) {
    out.push([key, `[file] ${value.name} (${value.type || 'unknown type'}, ${value.size} bytes)`]);
  } else if (Array.isArray(value)) {
    // [{ name, value }] pairs (serializeArray style) become fields; plain arrays are joined
    if (value.length && value.every((v) => v && typeof v === 'object' && 'name' in v && 'value' in v)) {
      value.forEach((v) => flatten(v.value, key ? `${key}.${v.name}` : String(v.name), out));
    } else {
      const flat = value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)));
      out.push([key, flat.join(', ')]);
    }
  } else if (typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => flatten(v, key ? `${key}.${k}` : k, out));
  } else {
    out.push([key, String(value)]);
  }
  return out;
}

/** Collects repeated keys (multi-select / checkbox groups) from FormData or URLSearchParams. */
function fromEntries(entries) {
  const obj = {};
  for (const [k, v] of entries) {
    if (k in obj) obj[k] = [].concat(obj[k], v);
    else obj[k] = v;
  }
  return obj;
}

async function readPayload(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.includes('multipart/form-data')) {
    return { payload: fromEntries(await request.formData()), html: true };
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('Payload too large'), { status: 413 });
  if (type.includes('application/x-www-form-urlencoded')) {
    return { payload: fromEntries(new URLSearchParams(text)), html: true };
  }
  const trimmed = text.trim();
  if (!trimmed) return { payload: {} };
  // JSON (application/json, text/plain from sendBeacon/no-cors, or no content type)
  try {
    const body = JSON.parse(trimmed);
    // form block sends { data: {...} }; also accept { fields }, flat objects and pair arrays
    const payload = body?.data ?? body?.fields ?? body;
    return { payload: typeof payload === 'object' ? payload : { value: payload } };
  } catch {
    if (trimmed.includes('=')) return { payload: fromEntries(new URLSearchParams(trimmed)) };
    throw Object.assign(new Error('Unreadable body: send JSON, form-urlencoded or multipart'), { status: 400 });
  }
}

const slackEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const label = (key) => key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Same-site redirect target for no-JS form posts. */
function redirectTarget(request, requested) {
  const referer = request.headers.get('referer');
  const origin = request.headers.get('origin') || (referer && new URL(referer).origin);
  if (requested && origin) {
    try {
      const url = new URL(requested, origin);
      if (url.origin === origin) return url.href;
    } catch { /* ignore malformed */ }
  }
  return referer || null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET') {
      return json(request, 200, { ok: true, service: 'contact-us', accepts: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'] });
    }
    if (request.method !== 'POST') {
      return json(request, 405, { ok: false, error: 'Method not allowed' });
    }
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY) return json(request, 413, { ok: false, error: 'Payload too large' });

    let payload;
    let html = false;
    try {
      ({ payload, html } = await readPayload(request));
    } catch (e) {
      return json(request, e.status || 400, { ok: false, error: e.message });
    }

    const pairs = flatten(payload);
    const meta = Object.fromEntries(pairs.filter(([k]) => k.startsWith('_')).map(([k, v]) => [k.toLowerCase(), v]));
    const honeypot = pairs.some(([k, v]) => HONEYPOT_KEYS.test(k) && v.trim());

    const fields = pairs
      .filter(([k]) => k && !k.startsWith('_') && !IGNORED_KEYS.test(k) && !HONEYPOT_KEYS.test(k))
      .map(([k, v]) => [k.slice(0, 80), v.trim().slice(0, MAX_VALUE)])
      .filter(([, v]) => v)
      .slice(0, MAX_FIELDS);

    if (!fields.length && !honeypot) {
      return json(request, 400, { ok: false, error: 'Missing fields: submit at least one non-empty field' });
    }

    // automated checks (agents, QA) must never reach the live channel
    const dryRun = request.headers.get('x-dry-run') === '1' || ['1', 'true'].includes(meta._dryrun);
    if (dryRun) return json(request, 200, { ok: true, delivered: false, dryRun: true, fields: fields.length });

    let delivered = false;
    if (!honeypot) {
      const page = request.headers.get('referer') || request.headers.get('origin') || 'unknown page';
      const form = meta._form || meta._subject || 'Contact form';
      // explicit <url> link: Slack's auto-linker would swallow surrounding markup (e.g. a trailing `_`)
      const from = /^https?:\/\//.test(page) ? `<${page.replace(/[<>|]/g, '')}>` : slackEscape(page);
      let text = `📩 *${slackEscape(form)}* submission\nFrom: ${from}\n${fields
        .map(([k, v]) => `*${slackEscape(label(k))}:* ${slackEscape(v)}`)
        .join('\n')}`;
      if (text.length > MAX_SLACK_TEXT) text = `${text.slice(0, MAX_SLACK_TEXT)}\n… (truncated)`;

      if (env.SLACK_WEBHOOK_URL) {
        try {
          const res = await fetch(env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          delivered = res.ok;
          if (!res.ok) console.error('slack webhook failed', res.status, await res.text());
        } catch (e) {
          console.error('slack webhook error', e.message);
        }
      } else {
        console.warn('SLACK_WEBHOOK_URL not set; submission logged only');
      }
      // the submission is always in the worker logs, even when Slack is down
      console.log(JSON.stringify({ page, form, fields: Object.fromEntries(fields), delivered }));
    }

    // a demo must not break because Slack is down: the submitter always gets success
    const accept = request.headers.get('accept') || '';
    const target = html && accept.includes('text/html') ? redirectTarget(request, meta._redirect || meta._next) : null;
    if (target) return Response.redirect(target, 303);
    return json(request, 200, { ok: true, delivered, fields: fields.length });
  },
};
