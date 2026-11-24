/*
 * RSS 2.0 (/rss.xml) and JSON Feed 1.1 (/feed.json) of the site's articles, built from
 * the query index. An article is a page whose `template` is FEED_TEMPLATE (default
 * `article`) under FEED_PATH_PREFIX (e.g. /en/), newest first by its authored `date`.
 * Feed title, description, language and author come from wrangler.toml [vars].
 */
const PAGE_SIZE = 200;

/** Feed settings from the environment, with neutral fallbacks. */
function settings(env) {
  const siteUrl = (env.SITE_URL || 'https://demo.bbird.live').replace(/\/+$/, '');
  return {
    siteUrl,
    origin: (env.CONTENT_ORIGIN || 'https://main--demo--scdemos.aem.live').replace(/\/+$/, ''),
    title: env.FEED_TITLE || new URL(siteUrl).hostname,
    description: env.FEED_DESCRIPTION || '',
    language: env.FEED_LANGUAGE || 'en',
    author: env.FEED_AUTHOR || '',
    template: (env.FEED_TEMPLATE || 'article').toLowerCase(),
    prefix: env.FEED_PATH_PREFIX || '/',
  };
}

/**
 * Fetch all rows from the query index, paginating as needed.
 * @returns {Promise<Array>}
 */
async function fetchIndex({ origin, siteUrl }, env) {
  const results = [];
  const host = new URL(siteUrl).hostname;
  let offset = 0;
  let rows;
  do {
    const headers = { 'x-forwarded-host': host, 'x-byo-cdn-type': 'cloudflare' };
    if (env.PUSH_INVALIDATION !== 'disabled') headers['x-push-invalidation'] = 'enabled';
    if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
    const resp = await fetch(`${origin}/query-index.json?offset=${offset}&limit=${PAGE_SIZE}`, {
      headers,
      cf: { cacheEverything: true },
    });
    if (!resp.ok) throw new Error(`query-index fetch failed: ${resp.status}`);
    const json = await resp.json();
    rows = json?.data || [];
    results.push(...rows);
    offset += rows.length;
  } while (rows.length === PAGE_SIZE);
  return results;
}

function isArticle(row, { template, prefix }) {
  if (!row.path || !row.path.startsWith(prefix)) return false;
  if (String(row.template || '').trim().toLowerCase() !== template) return false;
  return !/noindex/i.test(String(row.robots || ''));
}

/** Sortable timestamp (ms): the authored `date`, else `lastModified`. */
function getTimestamp(row) {
  const date = Number(row.date);
  const lastMod = Number(row.lastModified);
  const ts = date && !Number.isNaN(date) ? date : lastMod;
  return ts && !Number.isNaN(ts) ? ts * 1000 : 0;
}

/** When the page last changed (ms), from `lastModified`. */
function getModified(row) {
  const lastMod = Number(row.lastModified);
  return lastMod && !Number.isNaN(lastMod) ? lastMod * 1000 : getTimestamp(row);
}

/** Page title without the site suffix authors add for search ("Story | Frescopa Journal"). */
function cleanTitle(title) {
  return String(title || '').replace(/\s*\|[^|]*$/, '').trim();
}

/** Tags from the index's keywords, which may be a list, "a, b" or "['a, b']". */
function tags(keywords) {
  const raw = Array.isArray(keywords) ? keywords.join(',') : String(keywords || '');
  return raw.replace(/^\s*\[|\]\s*$/g, '').split(',')
    .map((k) => k.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function absolute(path, siteUrl) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Image MIME type, preferring the `format` query param of AEM's optimized images. */
function imageMimeType(url) {
  let format = '';
  try { format = new URL(url).searchParams.get('format') || ''; } catch { /* use the extension */ }
  if (['pjpg', 'jpeg', 'jpg'].includes(format)) return 'image/jpeg';
  if (['png', 'webp', 'gif'].includes(format)) return `image/${format}`;
  if (/\.png(\?|$)/.test(url)) return 'image/png';
  if (/\.webp(\?|$)/.test(url)) return 'image/webp';
  if (/\.gif(\?|$)/.test(url)) return 'image/gif';
  return 'image/jpeg';
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** One feed item per article, shared by both formats. */
function toItems(rows, cfg) {
  return rows
    .filter((row) => isArticle(row, cfg))
    .sort((a, b) => getTimestamp(b) - getTimestamp(a))
    .map((row) => ({
      url: absolute(row.path, cfg.siteUrl),
      title: cleanTitle(row.title),
      summary: String(row.description || '').trim(),
      date: new Date(getTimestamp(row)),
      modified: new Date(Math.max(getModified(row), getTimestamp(row))),
      author: String(row.author || '').trim() || cfg.author,
      image: absolute(row.image, cfg.siteUrl),
      tags: tags(row.keywords),
    }));
}

/** The last time any article in the feed changed. */
function lastChange(items) {
  return items.length ? new Date(Math.max(...items.map((item) => item.modified.getTime()))) : new Date();
}

function buildRss(items, cfg) {
  const entries = items.map((item) => [
    '<item>',
    `  <title>${escapeXml(item.title)}</title>`,
    `  <link>${escapeXml(item.url)}</link>`,
    `  <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
    `  <pubDate>${item.date.toUTCString()}</pubDate>`,
    item.author ? `  <dc:creator>${escapeXml(item.author)}</dc:creator>` : '',
    ...item.tags.map((tag) => `  <category>${escapeXml(tag)}</category>`),
    `  <description>${escapeXml(item.summary)}</description>`,
    item.image ? `  <enclosure url="${escapeXml(item.image)}" length="0" type="${imageMimeType(item.image)}"/>` : '',
    '</item>',
  ].filter(Boolean).join('\n    '));

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(cfg.title)}</title>
    <link>${escapeXml(cfg.siteUrl)}</link>
    <description>${escapeXml(cfg.description)}</description>
    <language>${escapeXml(cfg.language)}</language>
    <lastBuildDate>${lastChange(items).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${cfg.siteUrl}/rss.xml`)}" rel="self" type="application/rss+xml"/>
    ${entries.join('\n    ')}
  </channel>
</rss>
`;
}

/** JSON Feed 1.1: https://www.jsonfeed.org/version/1.1/ */
function buildJsonFeed(items, cfg) {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: cfg.title,
    home_page_url: cfg.siteUrl,
    feed_url: `${cfg.siteUrl}/feed.json`,
    language: cfg.language,
    items: items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      summary: item.summary,
      // JSON Feed 1.1 requires content_text or content_html; the index has the summary only
      content_text: item.summary,
      date_published: item.date.toISOString(),
      date_modified: item.modified.toISOString(),
      ...(item.author ? { authors: [{ name: item.author }] } : {}),
      ...(item.image ? { image: item.image } : {}),
      ...(item.tags.length ? { tags: item.tags } : {}),
    })),
  };
  if (cfg.description) feed.description = cfg.description;
  if (cfg.author) feed.authors = [{ name: cfg.author }];
  return JSON.stringify(feed, null, 2);
}

const FORMATS = {
  '/rss.xml': { build: buildRss, type: 'application/rss+xml; charset=utf-8' },
  '/feed.json': { build: buildJsonFeed, type: 'application/feed+json; charset=utf-8' },
};

export default {
  async fetch(request, env = {}) {
    const format = FORMATS[new URL(request.url).pathname];
    if (!format) return new Response('Not found', { status: 404 });
    const cfg = settings(env);
    try {
      const items = toItems(await fetchIndex(cfg, env), cfg);
      return new Response(format.build(items, cfg), {
        headers: { 'Content-Type': format.type, 'Cache-Control': 'max-age=7200, must-revalidate' },
      });
    } catch (err) {
      return new Response(`Feed generation failed: ${err.message}`, { status: 502 });
    }
  },
};
