import {
  describe, it, expect, beforeEach,
} from 'vitest';
import {
  handle, originAllowed, pagePath, resetCaches, verifyAuthor,
} from '../index.js';
import {
  googleToken, resetToken, rowsOf, lastDays, CONVERSIONS,
} from '../ga4.js';

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let n = 0;
const daToken = (cid = 'darkalley') => { n += 1; return `h.${b64({ client_id: cid, n })}.s`; };

async function serviceAccountKey() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { key: { client_email: 'insights@demo.iam.gserviceaccount.com', private_key: pem }, publicKey: pair.publicKey };
}

const { key, publicKey } = await serviceAccountKey();

const env = {
  PATH_PREFIX: 'page-insights',
  SITE: 'scdemos/demo',
  ALLOWED_ORIGINS: 'https://main--demo--scdemos.aem.live,https://*--demo--scdemos.aem.page',
  IMS_CLIENT_IDS: 'darkalley',
  GA4_PROPERTY_ID: '123456',
  PROPERTY_TIMEZONE: 'UTC',
  GA4_SERVICE_ACCOUNT: JSON.stringify(key),
};

const report = (dims, metrics, rows) => ({
  dimensionHeaders: dims.map((name) => ({ name })),
  metricHeaders: metrics.map((name) => ({ name })),
  rows: rows.map(([d, m]) => ({
    dimensionValues: d.map((value) => ({ value })),
    metricValues: [m].flat().map((value) => ({ value: String(value) })),
  })),
});

/** Fake DA and Google APIs, recording every call. */
function fakeServices({
  daStatus = 200, daActions = '/demo=read,write', customDims = true, failReports = 0,
} = {}) {
  const calls = [];
  let failing = failReports;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url: u, body, headers: init.headers });
    if (u.startsWith('https://admin.da.live/list/')) {
      return new Response('[]', { status: daStatus, headers: daActions ? { 'X-da-actions': daActions } : {} });
    }
    if (u === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'g-token', expires_in: 3600 });
    if (u.endsWith(':runReport') && failing > 0) {
      failing -= 1;
      return Response.json({ error: { message: 'Exhausted property tokens' } }, { status: 429 });
    }
    if (u.endsWith(':runReport')) {
      const dims = (body.dimensions || []).map((d) => d.name);
      if (!dims.length) {
        return Response.json(report([], body.metrics.map((m) => m.name), [
          [['current'], [120, 80, 40, 3600]],
          [['previous'], [100, 70, 30, 3000]],
        ]));
      }
      if (dims[0] === 'eventName') return Response.json(report(dims, ['eventCount'], [[['view_item'], 50], [['add_to_cart'], 9]]));
      if (dims[0] === 'pagePath') return Response.json(report(dims, ['screenPageViews', 'activeUsers'], [[['/en/'], [90, 60]], [['/en/products/duo'], [40, 30]]]));
      if (dims[0] === 'date') return Response.json(report(dims, ['screenPageViews'], [[[lastDays(7, 'UTC').at(-1)], 12]]));
      if (dims[0].startsWith('customEvent:')) {
        if (!customDims) return Response.json({ error: { message: 'Field customEvent:block_name is not a valid dimension.' } }, { status: 400 });
        return Response.json(report(dims, ['eventCount'], [[['hero', 'Get started'], 14]]));
      }
      if (dims[0] === 'sessionSource') return Response.json(report(dims, ['sessions'], [[['newsletter', 'email'], 6]]));
    }
    return new Response('{}', { status: 404 });
  };
  return { fetchImpl, calls };
}

const req = (route, { token = daToken(), body = {}, origin = 'https://main--demo--scdemos.aem.live' } = {}) => new Request(`https://demo.bbird.live/page-insights/${route}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

beforeEach(() => {
  resetCaches();
  resetToken();
});

describe('requests', () => {
  it('allows the site origins and branch previews only', () => {
    expect(originAllowed('https://main--demo--scdemos.aem.live', env)).toBe(true);
    expect(originAllowed('https://gtm--demo--scdemos.aem.page', env)).toBe(true);
    expect(originAllowed('https://evil.example', env)).toBe(false);
    expect(originAllowed('https://a.b--demo--scdemos.aem.page', env)).toBe(false);
  });

  it('accepts site paths and rejects anything else', () => {
    ['/', '/en/', '/en/products/duo', '/de/über'.replace('ü', 'u')].forEach((p) => expect(pagePath(p)).toBe(p));
    ['', 'en/', '/en/../x', '/en//x', '/en/.hidden', '/en?x=1', '/en#a', `/${'a'.repeat(301)}`]
      .forEach((p) => expect(() => pagePath(p)).toThrow('invalid_path'));
  });

  it('rejects other origins, missing or foreign tokens, and non-authors', async () => {
    const { fetchImpl } = fakeServices();
    expect((await handle(req('page', { origin: 'https://evil.example' }), env, fetchImpl)).status).toBe(403);
    expect((await (await handle(req('page', { token: '' }), env, fetchImpl)).json()).error).toBe('sign_in_required');
    expect((await (await handle(req('page', { token: daToken('other') }), env, fetchImpl)).json()).error).toBe('token_not_accepted');
    const notAuthor = fakeServices({ daStatus: 403 });
    const res = await handle(req('page', { body: { path: '/en/' } }), env, notAuthor.fetchImpl);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_an_author');
    expect(notAuthor.calls.some((c) => c.url.includes('googleapis'))).toBe(false);
  });

  it('rejects DA users who can only read the site', async () => {
    const readOnly = fakeServices({ daActions: '/demo=read' });
    const res = await handle(req('site'), env, readOnly.fetchImpl);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_an_author');
    const noAcl = fakeServices({ daActions: null });
    expect((await handle(req('site'), env, noAcl.fetchImpl)).status).toBe(200);
  });

  it('rejects an expired token and stops trusting a cached one when it expires', async () => {
    const { fetchImpl, calls } = fakeServices();
    n += 1;
    const expired = `h.${b64({
      client_id: 'darkalley', created_at: String(Date.now() - 2000), expires_in: '1000', n,
    })}.s`;
    expect((await (await handle(req('site', { token: expired }), env, fetchImpl)).json()).error).toBe('token_invalid');
    expect(calls.some((c) => c.url.includes('admin.da.live'))).toBe(false);

    const now = Date.now();
    n += 1;
    const short = `h.${b64({
      client_id: 'darkalley', created_at: String(now), expires_in: '60000', n,
    })}.s`;
    const request = () => new Request('https://demo.bbird.live/page-insights/site', { method: 'POST', headers: { Authorization: `Bearer ${short}` } });
    await verifyAuthor(request(), env, fetchImpl, now);
    await expect(verifyAuthor(request(), env, fetchImpl, now + 61000)).rejects.toThrow('token_invalid');
  });

  it('answers a request body that isn\'t an object as an invalid path', async () => {
    const { fetchImpl } = fakeServices();
    const res = await handle(new Request('https://demo.bbird.live/page-insights/page', {
      method: 'POST',
      headers: { Origin: 'https://main--demo--scdemos.aem.live', Authorization: `Bearer ${daToken()}` },
      body: 'null',
    }), env, fetchImpl);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_path');
  });

  it('checks the author against the configured DA site with their own token', async () => {
    const { fetchImpl, calls } = fakeServices();
    const token = daToken();
    await handle(req('page', { token, body: { path: '/en/' } }), env, fetchImpl);
    const da = calls.find((c) => c.url.startsWith('https://admin.da.live/'));
    expect(da.url).toBe('https://admin.da.live/list/scdemos/demo');
    expect(da.headers.Authorization).toBe(`Bearer ${token}`);
  });
});

describe('page report', () => {
  it('returns every section for the page, filtered by its path', async () => {
    const { fetchImpl, calls } = fakeServices();
    const res = await handle(req('page', { body: { path: '/en/products/duo', days: 7 } }), env, fetchImpl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ path: '/en/products/duo', days: 7 });
    const [ga] = body.sources;
    expect(ga).toMatchObject({ id: 'ga4', status: 'ok' });
    const d = ga.data;
    expect(d.summary.value).toEqual({
      current: {
        views: 120, users: 80, engagedSessions: 40, engagementSeconds: 3600,
      },
      previous: {
        views: 100, users: 70, engagedSessions: 30, engagementSeconds: 3000,
      },
    });
    expect(d.conversions.value).toEqual(CONVERSIONS.map((name) => ({ name, count: { add_to_cart: 9, view_item: 50 }[name] || 0 })));
    // the conversions report keeps both the page and the event filter
    const conv = calls.find((c) => c.body?.dimensions?.[0]?.name === 'eventName');
    expect(conv.body.dimensionFilter.andGroup.expressions).toHaveLength(2);
    expect(d.trend.value).toHaveLength(7);
    expect(d.trend.value.at(-1).views).toBe(12);
    expect(d.trend.value[0].views).toBe(0);
    expect(d.ctas.value).toEqual([{ block: 'hero', label: 'Get started', clicks: 14 }]);
    // clicks count buttons and block interactions (FAQ, tabs, video, store locator), on this page only
    const clicks = calls.find((c) => c.body?.dimensions?.[0]?.name === 'customEvent:block_name');
    expect(JSON.stringify(clicks.body.dimensionFilter)).toContain('"values":["cta_click","block_interaction"]');
    expect(JSON.stringify(clicks.body.dimensionFilter)).toContain('pagePath');
    expect(d.channels.value).toEqual([{ source: 'newsletter', medium: 'email', sessions: 6 }]);

    const reports = calls.filter((c) => c.url.endsWith(':runReport'));
    expect(reports).toHaveLength(5);
    reports.forEach((c) => {
      expect(c.url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport');
      expect(c.headers.Authorization).toBe('Bearer g-token');
      expect(JSON.stringify(c.body.dimensionFilter)).toContain('"value":"/en/products/duo"');
    });
    const summary = reports.find((c) => !c.body.dimensions);
    expect(summary.body.dateRanges).toEqual([
      { startDate: '6daysAgo', endDate: 'today', name: 'current' },
      { startDate: '13daysAgo', endDate: '7daysAgo', name: 'previous' },
    ]);
  });

  it('keeps the other sections when the custom dimensions aren\'t registered in GA4', async () => {
    const { fetchImpl } = fakeServices({ customDims: false });
    const body = await (await handle(req('page', { body: { path: '/en/', days: 30 } }), env, fetchImpl)).json();
    const d = body.sources[0].data;
    expect(body.days).toBe(30);
    expect(d.ctas).toEqual({ error: 'custom_dimensions_missing' });
    expect(d.summary.value.current.views).toBe(120);
    expect(d.trend.value).toHaveLength(30);
  });

  it('reports a source that isn\'t set up instead of calling it', async () => {
    const { fetchImpl, calls } = fakeServices();
    const body = await (await handle(req('page', { body: { path: '/en/' } }), { ...env, GA4_SERVICE_ACCOUNT: '' }, fetchImpl)).json();
    expect(body.sources).toEqual([{ id: 'ga4', label: 'Google Analytics 4', status: 'not_configured' }]);
    expect(calls.some((c) => c.url.includes('googleapis'))).toBe(false);
  });

  it('doesn\'t cache a report with a failed section, so it recovers on the next request', async () => {
    const { fetchImpl } = fakeServices({ failReports: 5 });
    const first = await (await handle(req('page', { body: { path: '/en/' } }), env, fetchImpl)).json();
    expect(first.sources[0].data.summary).toEqual({ error: 'ga4_429' });
    const second = await (await handle(req('page', { body: { path: '/en/' } }), env, fetchImpl)).json();
    expect(second.sources[0].data.summary.value.current.views).toBe(120);
  });

  it('caches a page report for a few minutes', async () => {
    const { fetchImpl, calls } = fakeServices();
    await handle(req('page', { body: { path: '/en/' } }), env, fetchImpl);
    await handle(req('page', { body: { path: '/en/' } }), env, fetchImpl);
    expect(calls.filter((c) => c.url.endsWith(':runReport'))).toHaveLength(5);
  });
});

describe('site report', () => {
  it('returns the whole site for the last 30 days by default, with top pages and events', async () => {
    const { fetchImpl, calls } = fakeServices();
    const body = await (await handle(req('site'), env, fetchImpl)).json();
    expect(body.days).toBe(30);
    const d = body.sources[0].data;
    expect(d.summary.value.current.views).toBe(120);
    expect(d.trend.value).toHaveLength(30);
    expect(d.pages.value).toEqual([{ path: '/en/', views: 90, users: 60 }, { path: '/en/products/duo', views: 40, users: 30 }]);
    expect(d.events.value[0]).toEqual({ name: 'view_item', count: 50 });
    expect(d.channels.value).toHaveLength(1);
    const reports = calls.filter((c) => c.url.endsWith(':runReport'));
    expect(reports).toHaveLength(6);
    // nothing filtered by page, except the conversions report's own event filter
    reports.forEach((c) => expect(JSON.stringify(c.body.dimensionFilter || {})).not.toContain('pagePath'));
    expect(reports.find((c) => !c.body.dimensions).body.dateRanges[0]).toEqual({ startDate: '29daysAgo', endDate: 'today', name: 'current' });
  });

  it('accepts 7 days', async () => {
    const { fetchImpl } = fakeServices();
    const body = await (await handle(req('site', { body: { days: 7 } }), env, fetchImpl)).json();
    expect(body.days).toBe(7);
    expect(body.sources[0].data.trend.value).toHaveLength(7);
  });
});

describe('google', () => {
  it('signs a JWT for the service account that Google can verify', async () => {
    let assertion = '';
    const fetchImpl = async (url, init) => {
      assertion = new URLSearchParams(init.body).get('assertion');
      return Response.json({ access_token: 't', expires_in: 3600 });
    };
    expect(await googleToken(key, fetchImpl, 1_000_000)).toBe('t');
    const [h, p, s] = assertion.split('.');
    const fromB64 = (x) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (x.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, fromB64(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(fromB64(p)))).toEqual({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1000,
      exp: 4600,
    });
  });

  it('reports a service account key that isn\'t a private key as a Google sign-in failure', async () => {
    const { fetchImpl } = fakeServices();
    const bad = { ...env, GA4_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'x@y', private_key: 'not a key' }) };
    const body = await (await handle(req('site'), bad, fetchImpl)).json();
    expect(body.sources[0]).toMatchObject({ status: 'error', error: 'google_auth_failed' });
  });

  it('reads date range names from rows of a two-range report', () => {
    const rows = rowsOf(report([], ['screenPageViews'], [[['current'], 5], [['previous'], 3]]));
    expect(rows).toEqual([{ dateRange: 'current', screenPageViews: 5 }, { dateRange: 'previous', screenPageViews: 3 }]);
  });

  it('lists the last days in the property time zone', () => {
    // 2026-11-24 03:00 UTC is still Nov 23 in Los Angeles
    const now = Date.UTC(2026, 10, 24, 3);
    expect(lastDays(2, 'UTC', now)).toEqual(['20261123', '20261124']);
    expect(lastDays(2, 'America/Los_Angeles', now)).toEqual(['20261122', '20261123']);
  });

  it('counts calendar days across daylight saving changes', () => {
    // US clocks change on 2026-03-08 and 2026-11-01
    expect(lastDays(3, 'America/Los_Angeles', Date.UTC(2026, 2, 9, 7, 30))).toEqual(['20260307', '20260308', '20260309']);
    expect(lastDays(3, 'America/Los_Angeles', Date.UTC(2026, 10, 2, 7, 30))).toEqual(['20261030', '20261031', '20261101']);
  });
});
