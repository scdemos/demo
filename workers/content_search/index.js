/*
 * Natural-language search over the site's query index, with the same POST /search and
 * POST /gensearch contract as the Content AI proxy that the search block (blocks/search/search-ai.js) calls.
 * Pointing the block's `base-url` at this worker or at a Content AI proxy is the only change.
 *
 * /search    ranks pages by meaning (Workers AI embeddings of title, description and
 *            keywords) plus a small boost for literal word matches. Optional product
 *            documentation (DOCS_* vars) is searched only when no site page matches.
 * /gensearch has a Workers AI model answer from the best matching pages (their index
 *            fields plus the text of the top few) and returns the pages it cites as hits.
 */
const INDEX_PAGE_SIZE = 500;
const INDEX_TTL_MS = 5 * 60 * 1000;
const EMBED_BATCH = 100;
const MAX_QUERY_LENGTH = 500;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_LIMIT = 50;
const ANSWER_SOURCES = 6;
const FALLBACK_HITS = 3;
// The answer model also reads the text of the best few pages, cut to this length each.
const TEXT_SOURCES = 4;
const MAX_PAGE_TEXT = 3000;
const PAGE_TIMEOUT_MS = 5000;
const KEYWORD_BOOST = 0.1;
// bge models retrieve better when the query (not the passage) carries this instruction.
const QUERY_INSTRUCTION = 'Represent this sentence for searching relevant passages: ';
const STOPWORDS = new Set('a an and are can do does for from how i in is it me my of on or the to what when where which who why with you your'.split(' '));

const list = (value) => String(value || '').split(',').map((v) => v.trim()).filter(Boolean);

const trim = (url) => String(url).replace(/\/+$/, '');

// The site itself, plus optional product documentation (another EDS site's query index)
// that is used only when nothing on the site matches.
function sourcesFrom(env) {
  const siteUrl = trim(env.SITE_URL || 'https://demo.bbird.live');
  const sources = [{
    siteUrl,
    origin: trim(env.CONTENT_ORIGIN || 'https://main--demo--scdemos.aem.live'),
    include: list(env.INCLUDE_PATHS || '/'),
    exclude: list(env.EXCLUDE_PATHS),
    label: '',
    site: true,
  }];
  if (env.DOCS_ORIGIN) {
    const docs = trim(env.DOCS_ORIGIN);
    sources.push({
      siteUrl: docs,
      origin: docs,
      include: list(env.DOCS_INCLUDE_PATHS || '/'),
      exclude: list(env.DOCS_EXCLUDE_PATHS),
      timeoutMs: Number(env.DOCS_TIMEOUT_MS) || 5000,
      label: env.DOCS_LABEL || new URL(docs).hostname,
      site: false,
    });
  }
  return sources;
}

// Named scopes a block picks with its content-source row (contentSource.name), e.g.
// SCOPES = "frescopa=/en/" searches only /en/ pages and never the product docs.
// Format: name=prefix|prefix;name=prefix. No name: every source, docs as fallback.
export function scopesFrom(value) {
  return Object.fromEntries(String(value || '').split(';').map((entry) => {
    const [name, paths = ''] = entry.split('=');
    return [name.trim().toLowerCase(), paths.split('|').map((p) => p.trim()).filter(Boolean)];
  }).filter(([name, paths]) => name && paths.length));
}

function settings(env) {
  return {
    scopes: scopesFrom(env.SCOPES),
    prefix: `/${String(env.PATH_PREFIX || '').replace(/^\/+|\/+$/g, '')}`,
    sources: sourcesFrom(env),
    embeddingModel: env.EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5',
    answerModel: env.ANSWER_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    minScore: env.MIN_SCORE !== undefined ? Number(env.MIN_SCORE) : 0.65,
  };
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
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (originAllowed(origin, env)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

const json = (headers, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json' },
});
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/* ---- query index ---- */

// keywords come as ["a, b"], "['a, b']" or "a, b"
function keywordText(value) {
  const raw = Array.isArray(value) ? value.join(', ') : String(value || '');
  return raw.replace(/[[\]'"]/g, '').split(',').map((k) => k.trim())
    .filter((k) => k && k.toLowerCase() !== 'noindex')
    .join(', ');
}

function absolute(path, siteUrl) {
  return path.startsWith('http') ? path : `${siteUrl}${path}`;
}

// Author images only; the site-wide default share image says nothing about the page.
function pageImage(image, siteUrl) {
  if (!image || /default-meta-image/.test(image)) return undefined;
  return absolute(image.replace(/width=\d+/, 'width=750'), siteUrl);
}

export function pagesFromIndex(rows, source) {
  return rows
    .filter((r) => r.path && String(r.title || '').trim())
    .filter((r) => !String(r.deprecation || '').trim())
    .filter((r) => source.include.some((p) => r.path.startsWith(p)))
    .filter((r) => !source.exclude.some((p) => r.path === p || (p.endsWith('/') && r.path.startsWith(p))))
    .map((r) => {
      const url = absolute(r.path, source.siteUrl);
      return {
        // site pages keep their path as id; other sources use the full URL
        id: source.site ? r.path : url,
        path: r.path,
        url,
        origin: source.origin,
        site: source.site,
        timeoutMs: source.timeoutMs,
        label: source.label,
        title: String(r.title).trim(),
        description: String(r.description || '').trim(),
        keywords: keywordText(r.keywords),
        image: pageImage(r.image, source.siteUrl),
        lastModified: r.lastModified,
      };
    });
}

async function fetchIndex(source) {
  const rows = [];
  let offset = 0;
  let batch;
  do {
    const resp = await fetch(`${source.origin}/query-index.json?offset=${offset}&limit=${INDEX_PAGE_SIZE}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
      // extra sources get a deadline (covers the body read too), so they can't hold up search
      ...(source.timeoutMs ? { signal: AbortSignal.timeout(source.timeoutMs) } : {}),
    });
    if (!resp.ok) throw fail(`query index: ${resp.status}`, 502);
    batch = (await resp.json())?.data || [];
    rows.push(...batch);
    offset += batch.length;
  } while (batch.length === INDEX_PAGE_SIZE);
  return rows;
}

const passage = (p) => [p.title, p.description, p.keywords].filter(Boolean).join('. ');

async function embed(env, cfg, texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const out = await env.AI.run(cfg.embeddingModel, { text: texts.slice(i, i + EMBED_BATCH) });
    vectors.push(...(out?.data || []));
  }
  if (vectors.length !== texts.length) throw fail('embedding failed', 502);
  return vectors;
}

// Per isolate: the index and its vectors, re-read every few minutes and re-embedded only
// when a page changed.
let indexCache = null;
let indexLoading = null;
const textCache = new Map();
export function resetIndexCache() {
  indexCache = null;
  indexLoading = null;
  textCache.clear();
}

const pageKey = (p) => `${p.url}@${p.lastModified}`;

// One source's pages and vectors. Unchanged pages keep their vectors; only new or
// changed pages are embedded.
async function loadSource(env, cfg, source) {
  const pages = pagesFromIndex(await fetchIndex(source), source);
  const known = new Map((indexCache?.pages || []).map((p, i) => [pageKey(p), indexCache.vectors[i]]));
  const missing = pages.filter((p) => !known.has(pageKey(p)));
  if (missing.length) {
    const fresh = await embed(env, cfg, missing.map(passage));
    missing.forEach((p, i) => known.set(pageKey(p), fresh[i]));
  }
  return { pages, vectors: pages.map((p) => known.get(pageKey(p))) };
}

async function refreshIndex(env, cfg) {
  const parts = await Promise.all(cfg.sources.map(async (source) => {
    try {
      if (source.site) return await loadSource(env, cfg, source);
      // an extra source gets one deadline for fetching and embedding, so it can't hold up search
      let timer;
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('source timed out')), source.timeoutMs);
      });
      try {
        return await Promise.race([loadSource(env, cfg, source), deadline]);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      // the site must load; an extra source that fails keeps what it had, if anything
      if (source.site) throw error;
      const pages = [];
      const vectors = [];
      (indexCache?.pages || []).forEach((p, i) => {
        if (p.origin === source.origin) {
          pages.push(p);
          vectors.push(indexCache.vectors[i]);
        }
      });
      return { pages, vectors };
    }
  }));
  indexCache = {
    at: Date.now(),
    pages: parts.flatMap((part) => part.pages),
    vectors: parts.flatMap((part) => part.vectors),
  };
  return indexCache;
}

// Concurrent requests share one load, so a cold isolate embeds the index only once.
function loadIndex(env, cfg) {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache;
  if (!indexLoading) {
    indexLoading = refreshIndex(env, cfg).finally(() => { indexLoading = null; });
  }
  return indexLoading;
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ',
};

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
    .replace(/<\/?(a|strong|em|b|i|u|span|code|sup|sub)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Body text of a page (cached per page version); empty when it can't be read.
async function pageText(page) {
  const key = `${page.url}@${page.lastModified}`;
  if (textCache.has(key)) return textCache.get(key);
  const path = page.path.endsWith('/') ? `${page.path}index` : page.path;
  try {
    const resp = await fetch(`${page.origin}${path}.plain.html`, {
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(page.timeoutMs || PAGE_TIMEOUT_MS),
    });
    if (!resp.ok) return '';
    const text = htmlToText(await resp.text()).slice(0, MAX_PAGE_TEXT);
    textCache.set(key, text); // only successful reads, so a failed read is tried again
    return text;
  } catch {
    return ''; // answer from the index fields only
  }
}

/* ---- ranking ---- */

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const terms = (text) => text.toLowerCase().split(/[^a-z0-9]+/)
  .filter((t) => t.length > 2 && !STOPWORDS.has(t));

async function rank(env, cfg, text, scope) {
  const { pages, vectors } = await loadIndex(env, cfg);
  if (!pages.length) return [];
  const [queryVector] = await embed(env, cfg, [`${QUERY_INSTRUCTION}${text}`]);
  const words = terms(text);
  const ranked = pages
    .map((page, i) => {
      const haystack = passage(page).toLowerCase();
      const found = words.filter((w) => haystack.includes(w)).length;
      const boost = words.length ? KEYWORD_BOOST * (found / words.length) : 0;
      return { page, score: cosine(queryVector, vectors[i]) + boost };
    })
    .filter((r) => r.score >= cfg.minScore)
    .filter((r) => !scope || (r.page.site && scope.some((p) => r.page.path.startsWith(p))))
    .sort((a, b) => b.score - a.score);
  // other sources (product docs) only when nothing on the site matches
  const onSite = ranked.filter((r) => r.page.site);
  return onSite.length ? onSite : ranked;
}

/* ---- request handling ---- */

// A plain string, { text }, or a Content AI composite query ({ queries: [{ text }] }).
function queryText(query) {
  if (typeof query === 'string') return query;
  if (!query || typeof query !== 'object' || Array.isArray(query)) return '';
  if (query.text !== undefined) return typeof query.text === 'string' ? query.text : '';
  if (!Array.isArray(query.queries)) return '';
  const nested = query.queries.find((q) => typeof q?.text === 'string');
  return nested?.text || '';
}

// The body as text, refusing more than MAX_BODY_BYTES before it is all buffered.
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw fail('request too large', 413);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      reader.cancel();
      throw fail('request too large', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((c) => {
    bytes.set(c, offset);
    offset += c.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

async function readQuery(request) {
  const raw = await readBody(request);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw fail('invalid JSON');
  }
  const text = queryText(body?.query).trim();
  if (!text) throw fail('query is required');
  if (text.length > MAX_QUERY_LENGTH) throw fail('query is too long');
  return { body, text };
}

// The scope named by contentSource.name; no name, or a name that isn't a scope (a Content AI
// source name), searches everything.
function scopeOf(body, cfg) {
  const raw = body?.contentSource?.name;
  const name = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return name && Object.hasOwn(cfg.scopes, name) ? cfg.scopes[name] : null;
}

const metadata = (page) => ({
  url: page.url,
  title: page.title,
  ...(page.description ? { description: page.description } : {}),
  ...(page.image ? { image: page.image } : {}),
});

async function search(request, env, cfg) {
  const { body, text } = await readQuery(request);
  const pagination = body?.queryOptions?.pagination || {};
  const limit = Math.min(Math.max(parseInt(pagination.limit, 10) || 10, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(pagination.cursor, 10) || 0, 0);
  const ranked = await rank(env, cfg, text, scopeOf(body, cfg));
  const next = offset + limit;
  return {
    totalResults: ranked.length,
    cursor: next < ranked.length ? String(next) : null,
    results: ranked.slice(offset, next).map(({ page, score }) => ({
      id: page.id,
      score: Math.round(score * 1000) / 1000,
      data: { source: page.url, title: page.title, metadata: metadata(page) },
    })),
  };
}

function answerMessages(text, sources, texts) {
  // sources are either all site pages or, when nothing on the site matched, all docs
  const docs = !sources[0]?.page.site;
  const context = sources.map(({ page }, i) => [
    `[${i + 1}] ${page.title}`,
    `URL: ${page.url}`,
    page.label && `From: ${page.label}`,
    page.description && `Summary: ${page.description}`,
    page.keywords && `Topics: ${page.keywords}`,
    texts[i] && `Page text:\n${texts[i]}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  return [
    {
      role: 'system',
      content: 'You answer questions about a demo website and its documentation. '
        + 'Use only the numbered sources. '
        + (docs ? 'These sources are general product documentation, not the demo site: start the '
          + 'answer with "From the product documentation:". ' : '')
        + 'Answer in two to four short sentences, or a short '
        + 'bullet list for steps. Link every page you rely on as a Markdown link [title](URL), '
        + 'copying the URL exactly. If the sources do not answer the question, say so in one '
        + 'sentence and link the closest source. Do not invent pages, links or features.',
    },
    { role: 'user', content: `Sources:\n\n${context}\n\nQuestion: ${text}` },
  ];
}

async function gensearch(request, env, cfg) {
  const { body, text } = await readQuery(request);
  const sources = (await rank(env, cfg, text, scopeOf(body, cfg))).slice(0, ANSWER_SOURCES);
  if (!sources.length) return { query: text, result: '', hits: [] };
  const texts = await Promise.all(sources.slice(0, TEXT_SOURCES).map(({ page }) => pageText(page)));
  let out;
  try {
    out = await env.AI.run(cfg.answerModel, {
      messages: answerMessages(text, sources, texts),
      max_tokens: 400,
      temperature: 0.2,
    });
  } catch {
    throw fail('answer failed', 502);
  }
  const result = String(out?.response || '').trim();
  if (!result) throw fail('answer failed', 502);
  // exact URLs of the Markdown links in the answer
  const linked = new Set([...result.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map((m) => m[1]));
  const cited = sources.filter(({ page }) => linked.has(page.url));
  const hits = (cited.length ? cited : sources.slice(0, FALLBACK_HITS))
    .map(({ page }) => ({ id: page.id, metadata: metadata(page) }));
  return { query: text, result, hits };
}

const ROUTES = { '/search': search, '/gensearch': gensearch };

// Per client (CF-Connecting-IP) and for everyone together, per route. Both bindings are
// [[ratelimits]] in wrangler.toml; unit tests run without them.
async function withinLimits(request, env, route) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const checks = [[env.CLIENT_LIMITER, `${route}:${ip}`], [env.TOTAL_LIMITER, route]];
  for (const [limiter, key] of checks) {
    if (limiter && !(await limiter.limit({ key })).success) return false;
  }
  return true;
}

export default {
  async fetch(request, env = {}) {
    const cfg = settings(env);
    const headers = cors(request, env);
    let { pathname } = new URL(request.url);
    if (cfg.prefix !== '/' && pathname.startsWith(cfg.prefix)) {
      pathname = pathname.slice(cfg.prefix.length) || '/';
    }
    const handler = ROUTES[pathname];
    if (!handler) return json(headers, { error: 'not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json(headers, { error: 'method not allowed' }, 405);
    // Browsers always send Origin on cross-origin POSTs; refuse sites that are not allowed.
    const origin = request.headers.get('Origin');
    if (origin && !originAllowed(origin, env)) return json(headers, { error: 'origin not allowed' }, 403);
    // JSON forces a CORS preflight, so other sites cannot fire simple form-style POSTs.
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) {
      return json(headers, { error: 'expected application/json' }, 415);
    }
    if (!(await withinLimits(request, env, pathname.slice(1)))) {
      return json({ ...headers, 'Retry-After': '60' }, { error: 'too many requests' }, 429);
    }
    try {
      return json(headers, await handler(request, env, cfg));
    } catch (error) {
      const status = error.status || 500;
      return json(headers, { error: status === 500 ? 'internal error' : error.message }, status);
    }
  },
};
