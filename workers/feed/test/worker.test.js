import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import worker from '../index.js';

const ENV = {
  SITE_URL: 'https://demo.bbird.live',
  CONTENT_ORIGIN: 'https://main--demo--scdemos.aem.network',
  FEED_TEMPLATE: 'article',
  FEED_PATH_PREFIX: '/en/',
  FEED_TITLE: 'Frescopa Journal',
  FEED_DESCRIPTION: 'Long reads from the people and places behind Frescopa.',
  FEED_LANGUAGE: 'en',
  FEED_AUTHOR: 'Frescopa',
};

const row = (path, extra = {}) => ({
  path,
  title: '',
  description: '',
  image: '',
  template: '',
  author: '',
  date: '',
  lastModified: '1795099027',
  keywords: '[]',
  robots: '',
  ...extra,
});

const INDEX = [
  row('/en/stories/older', {
    template: 'article',
    title: 'The case for a slow morning | Frescopa Journal',
    description: 'Small rituals & better starts',
    author: 'Priya Raman',
    date: '1791331200',
    image: '/en/stories/media_1.jpg?width=1200&format=pjpg&optimize=medium',
    keywords: "['Living, Wellbeing, Stories']",
  }),
  row('/en/stories/newer', {
    template: 'article',
    title: 'Discover more: why curiosity is the best plan |',
    description: 'Twenty years, 38 markets',
    author: '',
    date: '1793836800',
  }),
  row('/en/stories', { title: 'Stories | Frescopa Journal' }),
  row('/en/guides/first-90-days', { title: 'Guide', date: '1790812800' }),
  row('/de/stories/artikel', { template: 'article', title: 'Ein Artikel', date: '1793900000' }),
  row('/en/stories/hidden', { template: 'Article', robots: 'noindex, nofollow', date: '1793900000' }),
];

function mockIndex(rows, { status = 200 } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    if (status !== 200) return new Response('error', { status });
    const params = new URL(url).searchParams;
    const offset = Number(params.get('offset'));
    const limit = Number(params.get('limit'));
    return Response.json({ data: rows.slice(offset, offset + limit) });
  }));
  return calls;
}

const get = (path, env = ENV) => worker.fetch(new Request(`https://demo.bbird.live${path}`), env);

afterEach(() => vi.unstubAllGlobals());

describe('/rss.xml', () => {
  it('lists the market’s articles, newest first, with clean titles', async () => {
    mockIndex(INDEX);
    const resp = await get('/rss.xml');
    const xml = await resp.text();

    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    const links = [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
    expect(links).toEqual([
      'https://demo.bbird.live',
      'https://demo.bbird.live/en/stories/newer',
      'https://demo.bbird.live/en/stories/older',
    ]);
    expect(xml).toContain('<title>Discover more: why curiosity is the best plan</title>');
    expect(xml).toContain('<title>The case for a slow morning</title>');
    expect(xml).not.toContain('Frescopa Journal</title>\n    <link>https://demo.bbird.live/en');
  });

  it('describes the feed and each article', async () => {
    mockIndex(INDEX);
    const xml = await (await get('/rss.xml')).text();

    expect(xml).toContain('<title>Frescopa Journal</title>');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toContain('<atom:link href="https://demo.bbird.live/rss.xml" rel="self"');
    expect(xml).toContain('<description>Small rituals &amp; better starts</description>');
    expect(xml).toContain('<dc:creator>Priya Raman</dc:creator>');
    expect(xml).toContain('<dc:creator>Frescopa</dc:creator>');
    expect(xml).toContain('<category>Living</category>');
    expect(xml).toContain('<category>Wellbeing</category>');
    expect(xml).toContain('<enclosure url="https://demo.bbird.live/en/stories/media_1.jpg?width=1200&amp;format=pjpg&amp;optimize=medium" length="0" type="image/jpeg"/>');
    expect(xml).toContain(`<pubDate>${new Date(1791331200000).toUTCString()}</pubDate>`);
    expect(xml).toContain(`<lastBuildDate>${new Date(1795099027000).toUTCString()}</lastBuildDate>`);
  });

  it('leaves out pages that aren’t articles, other markets and noindex pages', async () => {
    mockIndex(INDEX);
    const xml = await (await get('/rss.xml')).text();

    expect(xml).not.toContain('/en/guides/first-90-days');
    expect(xml).not.toContain('/de/stories/artikel');
    expect(xml).not.toContain('/en/stories/hidden');
    expect(xml).not.toContain('<link>https://demo.bbird.live/en/stories</link>');
  });

  it('updates lastBuildDate when an existing article changes', async () => {
    const edited = INDEX.map((r) => (r.path === '/en/stories/older' ? { ...r, lastModified: '1795200000' } : r));
    mockIndex(edited);
    const xml = await (await get('/rss.xml')).text();

    expect(xml).toContain(`<lastBuildDate>${new Date(1795200000000).toUTCString()}</lastBuildDate>`);
  });

  it('reads every page of a large index', async () => {
    const many = Array.from({ length: 450 }, (_, i) => row(`/en/stories/s${i}`, { template: 'article', date: String(1790000000 + i) }));
    const calls = mockIndex(many);
    const xml = await (await get('/rss.xml')).text();

    expect(calls).toHaveLength(3);
    expect(xml.match(/<item>/g)).toHaveLength(450);
  });

  it('answers 502 when the index can’t be read', async () => {
    mockIndex([], { status: 503 });
    const resp = await get('/rss.xml');

    expect(resp.status).toBe(502);
  });
});

describe('/feed.json', () => {
  it('is a JSON Feed 1.1 of the same articles', async () => {
    mockIndex(INDEX);
    const resp = await get('/feed.json');
    const feed = await resp.json();

    expect(resp.headers.get('content-type')).toBe('application/feed+json; charset=utf-8');
    expect(feed).toMatchObject({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Frescopa Journal',
      home_page_url: 'https://demo.bbird.live',
      feed_url: 'https://demo.bbird.live/feed.json',
      language: 'en',
      authors: [{ name: 'Frescopa' }],
    });
    expect(feed.items.map((i) => i.url)).toEqual([
      'https://demo.bbird.live/en/stories/newer',
      'https://demo.bbird.live/en/stories/older',
    ]);
    expect(feed.items[1]).toMatchObject({
      title: 'The case for a slow morning',
      summary: 'Small rituals & better starts',
      content_text: 'Small rituals & better starts',
      date_published: new Date(1791331200000).toISOString(),
      date_modified: new Date(1795099027000).toISOString(),
      authors: [{ name: 'Priya Raman' }],
      image: 'https://demo.bbird.live/en/stories/media_1.jpg?width=1200&format=pjpg&optimize=medium',
      tags: ['Living', 'Wellbeing', 'Stories'],
    });
  });
});

describe('other paths', () => {
  it('answers 404 without reading the index', async () => {
    const calls = mockIndex(INDEX);
    const resp = await get('/feed.xml');

    expect(resp.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
