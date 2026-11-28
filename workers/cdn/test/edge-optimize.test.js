import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import worker from '../index.js';
import { EDGE_OPTIMIZE_ORIGIN } from '../handlers/edge-optimize.js';
import { createDemoSession } from '../../shared/demo-session.js';
import { gatedPage } from './fixtures/gated-content.js';

const SITE = 'https://demo.bbird.live';
const ENV = {
  ORIGIN_HOSTNAME: 'main--demo--scdemos.aem.network',
  EDGE_OPTIMIZE_API_KEY: 'test-key',
};
const CHATGPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36';

const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

// answers Edge Optimize and the origin separately, recording every request
function mockNetwork({ optimized = () => html('optimized'), origin = () => html('origin') } = {}) {
  const fetchMock = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return url.startsWith(EDGE_OPTIMIZE_ORIGIN) ? optimized(input, init) : origin(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const run = (path, headers = {}, init = {}, env = ENV) => worker.fetch(
  new Request(`${SITE}${path}`, { headers, ...init }),
  env,
);
const edgeCalls = (fetchMock) => fetchMock.mock.calls
  .filter(([input]) => String(typeof input === 'string' ? input : input.url).startsWith(EDGE_OPTIMIZE_ORIGIN));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Edge Optimize routing', () => {
  it('sends an AI agent asking for a page to Edge Optimize with the required headers', async () => {
    const fetchMock = mockNetwork();
    const response = await run('/en/booking?location=chicago', {
      'user-agent': CHATGPT,
      cookie: 'bbird_demo_session=abc',
      'x-edgeoptimize-api-key': 'injected',
    });

    expect(await response.text()).toBe('optimized');
    const [[url, init]] = edgeCalls(fetchMock);
    expect(url).toBe(`${EDGE_OPTIMIZE_ORIGIN}/en/booking?location=chicago`);
    expect(init.redirect).toBe('manual');
    expect(init.headers.get('x-forwarded-host')).toBe('demo.bbird.live');
    expect(init.headers.get('x-edgeoptimize-url')).toBe('/en/booking?location=chicago');
    expect(init.headers.get('x-edgeoptimize-api-key')).toBe('test-key');
    expect(init.headers.get('x-edgeoptimize-config')).toBe('LLMCLIENT=TRUE;');
    expect(init.headers.get('cookie')).toBeNull();
  });

  it.each([
    ['a browser', BROWSER, '/en/booking'],
    ['an SEO bot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', '/en/booking'],
    ['an agent asking for a script', CHATGPT, '/scripts/scripts.js'],
    ['an agent asking for JSON', CHATGPT, '/en/data/locations.json'],
    ['an agent asking for a draft', CHATGPT, '/drafts/kunwar/forms/booking'],
  ])('serves %s from the origin', async (_, agent, path) => {
    const fetchMock = mockNetwork();
    const response = await run(path, { 'user-agent': agent });

    expect(await response.text()).toBe(path.startsWith('/drafts/') ? 'Not Found' : 'origin');
    expect(edgeCalls(fetchMock)).toHaveLength(0);
  });

  it('serves Edge Optimize fetching the page back from the origin, so it cannot loop', async () => {
    const fetchMock = mockNetwork();
    const response = await run('/en/booking', { 'user-agent': CHATGPT, 'x-edgeoptimize-request': '1' });

    expect(await response.text()).toBe('origin');
    expect(edgeCalls(fetchMock)).toHaveLength(0);
  });

  it('routes nothing without an API key', async () => {
    const fetchMock = mockNetwork();
    const env = { ...ENV, EDGE_OPTIMIZE_API_KEY: '' };
    const response = await run('/en/booking', { 'user-agent': CHATGPT }, {}, env);

    expect(await response.text()).toBe('origin');
    expect(edgeCalls(fetchMock)).toHaveLength(0);
  });

  it('routes only GET and HEAD', async () => {
    const fetchMock = mockNetwork();
    await run('/en/booking', { 'user-agent': CHATGPT }, { method: 'POST', body: 'x' });

    expect(edgeCalls(fetchMock)).toHaveLength(0);
  });

  it.each([
    ['a 5xx', () => html('down', 503)],
    ['a 4xx', () => html('unknown site', 403)],
    ['a network error', () => { throw new Error('connection reset'); }],
  ])('serves the origin, marked as failover, when Edge Optimize returns %s', async (_, optimized) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockNetwork({ optimized });
    const response = await run('/en/booking', { 'user-agent': CHATGPT });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('origin');
    expect(response.headers.get('x-edgeoptimize-fo')).toBe('1');
  });

  it('passes an Edge Optimize redirect through without following it', async () => {
    mockNetwork({
      optimized: () => new Response(null, { status: 301, headers: { location: `${SITE}/en/booking/` } }),
    });
    const response = await run('/en/booking', { 'user-agent': CHATGPT });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`${SITE}/en/booking/`);
  });

  it('applies audience gating to optimized pages, as for an anonymous visitor', async () => {
    const page = gatedPage('<div data-view="logged-in">Member-only detail</div><div data-view="logged-out">Anonymous teaser</div>');
    mockNetwork({ optimized: () => html(page) });
    const session = await createDemoSession({ name: 'Demo Member' });
    const response = await run('/en/members', { 'user-agent': CHATGPT, cookie: `bbird_demo_session=${session}` });
    const body = await response.text();

    expect(body).toContain('Anonymous teaser');
    expect(body).not.toContain('Member-only detail');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('keeps a signed-in agent anonymous when Edge Optimize is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = gatedPage('<div data-view="logged-in">Member-only detail</div><div data-view="logged-out">Anonymous teaser</div>');
    const fetchMock = mockNetwork({ optimized: () => html('down', 503), origin: () => html(page) });
    const session = await createDemoSession({ name: 'Demo Member' });
    const response = await run('/en/members', { 'user-agent': CHATGPT, cookie: `bbird_demo_session=${session}` });
    const body = await response.text();

    expect(response.headers.get('x-edgeoptimize-fo')).toBe('1');
    expect(body).toContain('Anonymous teaser');
    expect(body).not.toContain('Member-only detail');
    const originRequest = fetchMock.mock.calls.map(([input]) => input).find((input) => typeof input !== 'string');
    expect(originRequest.headers.get('cookie')).toBeNull();
  });

  it('serves the origin when the full page for a HEAD request fails at Edge Optimize', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const optimized = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(html('down', 503));
    const fetchMock = mockNetwork({ optimized });
    const response = await run('/en/booking', { 'user-agent': CHATGPT }, { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-edgeoptimize-fo')).toBe('1');
    expect(optimized).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });
});
