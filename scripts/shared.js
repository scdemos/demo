import { getMetadata, loadCSS } from './aem.js';

/**
 * Market context from the URL: the first /{lang}/ folder in the path (e.g. /en/, /de/).
 * Anything before it (e.g. a content folder such as /drafts/frescopa) is part of the root.
 * @returns {{ lang: string, root: string, base: string, segments: string[] }}
 */
export function getMarket() {
  const { pathname } = window.location;
  const m = pathname.match(/^(.*?)\/([a-z]{2})(?:\/|$)/);
  if (!m) {
    return {
      lang: 'en', root: '/en/', base: '', segments: pathname.split('/').filter(Boolean),
    };
  }
  const [, base, lang] = m;
  const root = `${base}/${lang}/`;
  return {
    lang, root, base, segments: pathname.slice(root.length).split('/').filter(Boolean),
  };
}

/**
 * Whether a page path (e.g. a query index row) is in the current page's market. On a page
 * under /{lang}/, only that market's pages are; elsewhere every page is.
 * @param {string} path
 * @returns {boolean}
 */
export function inCurrentMarket(path) {
  const { root } = getMarket();
  if (!window.location.pathname.startsWith(root)) return true;
  return String(path || '').startsWith(root);
}

/** Market whose fragments are the defaults at /fragments/ (other markets override them). */
const DEFAULT_FRAGMENT_LANG = 'en';

/** Hash that keeps a fragment on its default version in every market ("do not translate"). */
const DNT_HASH = '#_dnt';

/**
 * Fragment documents to try for this page's market, most specific first. Defaults live in
 * /fragments/; a market overrides one by putting its own copy in /{lang}/fragments/, so on
 * /de/ pages /fragments/nav resolves to /de/fragments/nav, falling back to /fragments/nav.
 * Paths elsewhere, already localized, or with #_dnt are used as they are.
 * Modelled on localizeUrl() in https://github.com/aemsites/author-kit.
 * @param {string} path fragment path, e.g. /fragments/newsletter or /fragments/x#_dnt
 * @returns {string[]} paths without hash
 */
export function fragmentPaths(path) {
  const [pathname] = String(path || '').split('#');
  const { lang, base } = getMarket();
  const defaults = `${base}/fragments/`;
  if (path.includes(DNT_HASH) || lang === DEFAULT_FRAGMENT_LANG || !pathname.startsWith(defaults)) {
    return [pathname];
  }
  return [`${base}/${lang}/fragments/${pathname.slice(defaults.length)}`, pathname];
}

/**
 * Fetch a fragment's .plain.html in this page's market (see fragmentPaths).
 * @param {string} path fragment path
 * @returns {Promise<{ path: string, html: string } | null>} the version found, or null
 */
export async function fetchFragment(path) {
  const tryPath = async ([first, ...rest]) => {
    if (!first) return null;
    const resp = await fetch(`${first}.plain.html`);
    if (resp.ok) return { path: first, html: await resp.text() };
    return tryPath(rest);
  };
  return tryPath(fragmentPaths(path));
}

/**
 * Page metadata `gated=true` — same signal as CDN worker HTML gating; author preview uses this too.
 * @returns {boolean}
 */
export function isGatedPage() {
  return String(getMetadata('gated') || '').trim().toLowerCase() === 'true';
}

/**
 * Create an element with attributes and optional content.
 * @param {string} tag - Tag name
 * @param {Record<string, string>} attributes - Attribute key-value pairs
 * @param {Element|Element[]|string|null} [content] - Child elements or text
 * @returns {Element}
 */

export function createTag(tag, attributes = {}, content = null) {
  const el = document.createElement(tag);

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    el.setAttribute(key, String(value));
  });

  if (content !== null && content !== undefined) {
    if (Array.isArray(content)) {
      content.forEach((item) => {
        if (item != null) el.append(item);
      });
    } else {
      el.append(content);
    }
  }

  return el;
}

/**
 * Wraps a container's direct button paragraphs (p.button-container) in .button-group rows,
 * merging consecutive ones into the same row.
 * @param {Element} container
 */
export function groupButtons(container) {
  [...container.querySelectorAll(':scope > p.button-container')].forEach((p) => {
    const prev = p.previousElementSibling;
    if (prev?.classList.contains('button-group')) {
      prev.append(p);
      return;
    }
    const group = createTag('div', { class: 'button-group' });
    p.before(group);
    group.append(p);
  });
}

/**
 * Format a date value for display.
 * @param {string|number} dateValue - Date string or timestamp
 * @returns {string} Formatted date string
 */
export function formatDate(dateValue) {
  if (!dateValue) return '';
  const normalized = String(dateValue).trim();
  if (!normalized) return '';

  let date;
  if (/^[0-9]+$/.test(normalized)) {
    const ts = Number(normalized);
    date = new Date(ts < 1e12 ? ts * 1000 : ts);
    // a calendar day stored as UTC midnight (query index, AEM Content Fragments) is that day
    // everywhere, not the day before in the Americas
    if (!Number.isNaN(date.getTime()) && !date.getUTCHours() && !date.getUTCMinutes()) {
      date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    // A calendar date: `new Date('2026-11-09')` is UTC midnight, the day before in the Americas.
    const [year, month, day] = normalized.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(normalized);
  }

  if (Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleDateString(document.documentElement.lang || 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Normalize path (ensure leading slash).
 * @param {string} path - Path string
 * @returns {string}
 */
export function normalizePath(path = '') {
  if (!path) return '#';
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Parse comma-separated keywords into array.
 * @param {string} raw - Raw string
 * @returns {string[]}
 */
export function parseKeywords(raw = '') {
  return String(raw)
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Get keywords from article object.
 * @param {Object} article - Article data
 * @returns {string}
 */
export function getArticleKeywords(article = {}) {
  return String(article.keywords || '');
}

/**
 * When an entry was published, in milliseconds: its own date first (an article's date, a press
 * release's publisheddate), else when it last changed. The query index gives seconds, AEM
 * Content Fragments give milliseconds.
 * @param {Object} entry - Content entry
 * @returns {number}
 */
export function getContentTimestamp(entry = {}) {
  const value = entry.date || entry.publisheddate || entry.lastModified;
  if (!value) return 0;
  if (/^[0-9]+$/.test(String(value))) {
    const ts = Number(value);
    return ts < 1e12 ? ts * 1000 : ts;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Default page size for query-index pagination */
const QUERY_INDEX_PAGE_SIZE = 500;

/**
 * Fetch a page of the site's query index. The index sits at the site root, before the
 * /{lang}/ market folder: /query-index.json, or /drafts/<site>/query-index.json
 * for a site authored under a content folder (see query.yaml).
 * @param {number} offset - Offset
 * @param {number} limit - Limit
 * @param {string} [baseUrl=''] - Base URL
 * @returns {Promise<Array>}
 */
export async function fetchQueryIndexPage(offset, limit, baseUrl = '') {
  const path = `${getMarket().base}/query-index.json?offset=${offset}&limit=${limit}`;
  const url = baseUrl ? `${String(baseUrl).replace(/\/+$/, '')}${path}` : path;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Query index request failed: ${resp.status}`);
  const json = await resp.json();
  return json?.data || [];
}

/**
 * Fetch all rows from query-index by paginating.
 * @param {{ pageSize?: number, baseUrl?: string }} [options]
 * @returns {Promise<Array>}
 */
export async function fetchQueryIndexAll(options = {}) {
  const { pageSize = QUERY_INDEX_PAGE_SIZE, baseUrl = '' } = options;

  async function fetchPage(offset, acc) {
    const rows = await fetchQueryIndexPage(offset, pageSize, baseUrl);
    if (!rows.length) return acc;
    const next = [...acc, ...rows];
    return rows.length === pageSize ? fetchPage(offset + rows.length, next) : next;
  }

  return fetchPage(0, []);
}

/**
 * Normalize URL or path to canonical path (no trailing slash).
 * @param {string} href - URL or path
 * @param {string} [base] - Base URL
 * @returns {string}
 */
export function pathFromHref(href, base = window.location.origin) {
  try {
    const u = new URL(href, base);
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/**
 * Get authored link paths from block (list of a[href] → { path, title }).
 * Skips when block has config-style rows (2+ cells).
 * @param {Element} block - Block element
 * @returns {Array<{ path: string, title: string }>}
 */
export function getAuthoredLinks(block) {
  const rows = block.querySelectorAll(':scope > div');
  const hasConfigRows = [...rows].some((row) => row.children.length >= 2);
  if (hasConfigRows) return [];

  const anchors = block.querySelectorAll('a[href]');
  if (!anchors.length) return [];

  return [...anchors].map((a) => {
    const path = pathFromHref(a.href);
    const rawTitle = (a.textContent || '').trim();
    const looksLikeUrl = /^https?:\/\//i.test(rawTitle) || rawTitle.length > 80;
    const title = looksLikeUrl ? '' : rawTitle;
    return { path, title };
  }).filter((item) => item.path && item.path !== '/');
}

/**
 * Resolve authored links with metadata from query index.
 * @param {Array<{ path: string, title: string }>} authoredLinks
 * @param {Array} indexRows - Query index data
 * @returns {Array<{ path, title, description, date? }>}
 */
export function resolveArticlesFromIndex(authoredLinks, indexRows) {
  return authoredLinks.map(({ path, title: linkTitle }) => {
    const norm = normalizePath(path);
    const row = indexRows.find((r) => r?.path && normalizePath(r.path) === norm);
    const fallbackTitle = norm.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || norm;
    const img = row?.image?.trim() || '';

    return {
      path: norm,
      title: row?.title?.trim() || linkTitle || fallbackTitle,
      description: row?.description?.trim() || '',
      image: img.includes('default-meta-image.png') ? '' : img,
      date: row?.date || row?.publisheddate || row?.lastModified,
    };
  });
}

/**
 * Shuffle array (Fisher–Yates). Returns new array.
 * @param {Array} arr - Input array
 * @returns {Array}
 */
export function shuffle(arr) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * Returns all metadata properties matching a given scope/prefix.
 * Looks for `<meta property="{scope}:…">` and `<meta name="{scope}-…">`.
 * @param {string} scope The metadata prefix (e.g. 'campaign', 'audience')
 * @param {Document} [doc=document] Document to query
 * @returns {Record<string, string>} Key-value pairs of matching metadata (keys in camelCase)
 */
export function getAllMetadata(scope, doc = document) {
  const result = {};
  const meta = [...doc.head.querySelectorAll(`meta[property^="${scope}:"], meta[name^="${scope}-"]`)];
  meta.forEach((m) => {
    const key = m.getAttribute('property')
      ? m.getAttribute('property').replace(`${scope}:`, '')
      : m.getAttribute('name').replace(`${scope}-`, '');
    result[key.replace(/[-:]([a-z])/g, (g) => g[1].toUpperCase())] = m.content;
  });
  return result;
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  [...from.attributes]
    .map(({ nodeName }) => nodeName)
    .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-'))
    .forEach((attr) => {
      const value = from.getAttribute(attr);
      if (value) {
        to.setAttribute(attr, value);
        from.removeAttribute(attr);
      }
    });
}

/**
 * Resolve DOM context for a block element.
 * Returns the correct body and event root whether the block runs
 * in the normal document or inside a shadow DOM (aem-embed).
 * @param {Element} block
 * @returns {{ root: Document|ShadowRoot, body: HTMLElement,
 *   eventRoot: Document|ShadowRoot, isEmbed: boolean }}
 */
export function getBlockContext(block) {
  const root = block.getRootNode();
  const isEmbed = root !== document;
  return {
    root,
    body: isEmbed ? root.querySelector('body') : document.body,
    eventRoot: isEmbed ? root : document,
    isEmbed,
  };
}

/**
 * Loads a stylesheet for an element. On a page it goes in <head>; inside an
 * aem-embed shadow root it goes into that root, because <head> styles don't
 * reach shadow DOM.
 * @param {Element} el element the styles are for
 * @param {string|URL} href resolve it with import.meta.url so it points at this
 *   site even when the code runs on another page (aem-embed)
 * @returns {Promise<void>}
 */
export function loadStylesFor(el, href) {
  const { origin, pathname } = new URL(href, window.location.href);
  const url = `${origin}${pathname}`;
  const root = el.getRootNode();
  // on the site's own pages, use the path so loadCSS recognises styles the block loader added
  if (!(root instanceof ShadowRoot)) return loadCSS(origin === window.location.origin ? pathname : url);
  if (root.querySelector(`link[href="${url}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = createTag('link', { rel: 'stylesheet', href: url });
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', reject);
    root.append(link);
  });
}

/**
 * Cookie consent settings shared by the eager phase (scripts.js) and the consent banner
 * (consent-check.js). Raise `revision` when the cookie policy changes: every visitor is
 * asked again and earlier choices stop counting.
 */
export const CONSENT = {
  cookie: 'cc_cookie',
  revision: 1,
  // ?consent=decline skips the banner for one page view; ?consent=accept only works on
  // localhost and *.aem.page previews, so a link can never switch tracking on for a visitor
  param: 'consent',
};

/**
 * One-off consent override from the URL (`?consent=accept` or `?consent=decline`).
 * @returns {{analytics: boolean, targeting: boolean}|null}
 */
export function getConsentOverride() {
  const value = new URLSearchParams(window.location.search).get(CONSENT.param);
  if (value === null) return null;
  const { hostname } = window.location;
  const isDev = hostname === 'localhost' || hostname.endsWith('.aem.page');
  const granted = isDev && ['accept', 'true', '1', 'yes'].includes(value.toLowerCase());
  if (!granted && !['decline', 'false', '0', 'no'].includes(value.toLowerCase())) return null;
  return { analytics: granted, targeting: granted };
}

/**
 * The visitor's saved consent choice, read straight from the banner's cookie so the eager
 * phase can decide on martech without loading the banner. Null when the visitor hasn't
 * chosen yet, or chose under an older policy revision.
 * @returns {{analytics: boolean, targeting: boolean}|null}
 */
export function getStoredConsent() {
  const override = getConsentOverride();
  if (override) return override;
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${CONSENT.cookie}=`));
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw.slice(CONSENT.cookie.length + 1)));
    // the same checks the banner makes, so martech never starts on a choice it wouldn't accept
    const isDate = (d) => typeof d === 'string' && !Number.isNaN(Date.parse(d));
    if (value.revision !== CONSENT.revision || !Array.isArray(value.categories)
      || typeof value.consentId !== 'string' || !value.consentId
      || !isDate(value.consentTimestamp) || !isDate(value.lastConsentTimestamp)) return null;
    return {
      analytics: value.categories.includes('analytics'),
      targeting: value.categories.includes('targeting'),
    };
  } catch {
    return null;
  }
}

// Analytics events of this page view, kept so a tag manager that starts later (after the
// visitor accepts the banner) still gets the ones that came before it.
const MAX_TRACKED = 50;
const trackedEvents = [];
const trackListeners = new Set();

/**
 * Records an analytics event (GA4 event names and parameters, e.g. `add_to_cart` with an
 * `ecommerce` object). Nothing leaves the page unless the visitor accepted analytics:
 * gtm-martech.js only listens once they have.
 * @param {string} event the event name
 * @param {object} [params] the event's parameters
 */
export function trackEvent(event, params = {}) {
  const entry = { event, ...params };
  if (trackedEvents.length < MAX_TRACKED) trackedEvents.push(entry);
  trackListeners.forEach((fn) => fn(entry));
}

/**
 * Calls `fn` with each analytics event of this page view: those recorded so far, then new ones.
 * @param {(entry: object) => void} fn
 */
export function onTrackEvent(fn) {
  trackedEvents.forEach(fn);
  trackListeners.add(fn);
}

/**
 * Text that's safe to send with an analytics event: trimmed and cut to 100 characters, and empty
 * when it could hold an email address or a phone number (an @, or 7 digits or more, whatever
 * separates them).
 * @param {string} text
 * @returns {string}
 */
export function safeLabel(text) {
  const label = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return label.includes('@') || (label.match(/\p{Nd}/gu) || []).length >= 7 ? '' : label;
}

/**
 * Calls `fn` once, the first time `el` is seen: half of it on screen, or any of it across the
 * middle of the screen (an element too tall to be half on screen still gets there).
 * @param {Element} el
 * @param {() => void} fn
 */
export function onFirstView(el, fn) {
  let observers = [];
  // every observer reports once at the start, whatever is visible, so each checks its own rule
  const when = (rule) => (entries) => {
    if (!observers.length || !entries.some(rule)) return;
    observers.forEach((o) => o.disconnect());
    observers = [];
    fn();
  };
  observers = [
    new IntersectionObserver(when((e) => e.intersectionRatio >= 0.5), { threshold: 0.5 }),
    new IntersectionObserver(when((e) => e.isIntersecting), { rootMargin: '-50% 0px -50% 0px' }),
  ];
  observers.forEach((o) => o.observe(el));
}

/** The name analytics events use for the block `el` is in. */
export const blockNameOf = (el) => el.closest('[data-block-name]')?.dataset.blockName || 'default-content';

/**
 * Records a visitor's interaction with a block (an FAQ opened, a tab chosen, a video played),
 * with what they picked as `link_text`.
 * @param {Element} el the element interacted with
 * @param {string} label what was picked
 * @param {string} [block] the block's name, when `el` isn't inside a block element
 */
export function trackInteraction(el, label, block = blockNameOf(el)) {
  trackEvent('block_interaction', { block_name: block, link_text: safeLabel(label) });
}

/**
 * Tracks a list of products: `view_item_list` when the list is first seen, `select_item` when a
 * product is picked.
 * @param {Element} list the list's element
 * @param {string} name the list's name
 * @param {{link: Element, id?: string, url?: string, name: string, price?: string|number}[]} products
 *   each product's id, or else its page's URL
 */
export function trackItemList(list, name, products) {
  if (!products.length) return;
  // a product without an id is known by its page's path (never its query or hash)
  const idOf = (p) => {
    if (p.id) return String(p.id);
    try {
      return new URL(p.url, window.location.href).pathname;
    } catch {
      return '';
    }
  };
  const itemOf = (p, index) => {
    const item = {
      item_id: idOf(p), item_name: p.name, index, item_list_name: name,
    };
    const price = Number.parseFloat(p.price);
    if (Number.isFinite(price)) item.price = price;
    return item;
  };
  const items = products.map(itemOf);
  // only the products on show (a filtered list hides some)
  onFirstView(list, () => {
    const shown = items.filter((item, i) => !products[i].link.closest('[hidden]'));
    if (shown.length) trackEvent('view_item_list', { ecommerce: { item_list_name: name, items: shown } });
  });
  products.forEach((p, i) => p.link.addEventListener('click', () => {
    trackEvent('select_item', { ecommerce: { item_list_name: name, items: [items[i]] } });
  }));
}

/**
 * Tracks a promotion: `view_promotion` when it's first seen, `select_promotion` when one of its
 * links is clicked.
 * @param {Element} el the promotion's element
 * @param {string} name the promotion's name
 */
export function trackPromotion(el, name) {
  const label = safeLabel(name);
  if (!label) return;
  // the block's name is read when the event is sent: `el` may not be on the page yet
  const ecommerce = () => ({
    promotion_name: label,
    creative_slot: blockNameOf(el),
    items: [{ item_id: label, item_name: label, promotion_name: label }],
  });
  onFirstView(el, () => trackEvent('view_promotion', { ecommerce: ecommerce() }));
  el.addEventListener('click', (e) => {
    if (e.target.closest?.('a[href]')) trackEvent('select_promotion', { ecommerce: ecommerce() });
  });
}
