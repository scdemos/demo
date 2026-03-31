import { getMetadata } from './aem.js';

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
  } else {
    date = new Date(normalized);
  }

  if (Number.isNaN(date.getTime())) return normalized;

  const formattedDateString = date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return formattedDateString;
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
 * Get content timestamp from entry.
 * @param {Object} entry - Content entry
 * @returns {number}
 */
export function getContentTimestamp(entry = {}) {
  const value = entry.lastModified || entry.date || entry.publisheddate;
  if (!value) return 0;
  if (/^[0-9]+$/.test(String(value))) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Default page size for query-index pagination */
export const QUERY_INDEX_PAGE_SIZE = 500;

/**
 * Fetch a page of query-index.
 * @param {number} offset - Offset
 * @param {number} limit - Limit
 * @param {string} [baseUrl=''] - Base URL
 * @returns {Promise<Array>}
 */
export async function fetchQueryIndexPage(offset, limit, baseUrl = '') {
  const path = `/query-index.json?offset=${offset}&limit=${limit}`;
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
export function pathFromHref(href, base = typeof window !== 'undefined' ? window.location.origin : '') {
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
    return {
      path: norm,
      title: row?.title?.trim() || linkTitle || fallbackTitle,
      description: row?.description?.trim() || '',
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

// ---------------------------------------------------------------------------
// Chart.js (delayed load for CWV; reuse across calculators)
// ---------------------------------------------------------------------------

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
let chartJsLoadPromise = null;

/**
 * Load Chart.js from CDN in a deferred way (after idle) so it does not affect LCP/CWV.
 * @returns {Promise<typeof window.Chart>}
 */
export function loadChartJs() {
  if (typeof window.Chart !== 'undefined') return Promise.resolve(window.Chart);
  if (chartJsLoadPromise) return chartJsLoadPromise;
  chartJsLoadPromise = new Promise((resolve, reject) => {
    const run = () => {
      const script = document.createElement('script');
      script.src = CHART_JS_CDN;
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => reject(new Error('Chart.js failed to load'));
      document.head.append(script);
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 1);
    }
  });
  return chartJsLoadPromise;
}

/**
 * Create or replace a Chart.js instance on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} config - Chart.js config (type, data, options)
 * @returns {Object|undefined}
 */
export function createChart(canvas, config) {
  if (!canvas || !config) return undefined;
  const ChartLib = window.Chart;
  if (!ChartLib) return undefined;
  if (canvas.chart) {
    canvas.chart.destroy();
    canvas.chart = null;
  }
  const chart = new ChartLib(canvas, config);
  canvas.chart = chart;
  return chart;
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
 * Check if the current page is in the Universal Editor.
 * @returns {boolean}
 */
export function isUE() {
  return window.location.hostname.includes('ue.da') || window.location.host.includes('localhost:4712');
}

/**
 * Resolve DOM context for a block element.
 * Returns the correct body and event root whether the block runs
 * in the normal document or inside a shadow DOM (aem-embed).
 * @param {Element} block
 * @returns {{ root: Document|ShadowRoot, body: HTMLElement, eventRoot: Document|ShadowRoot, isEmbed: boolean }}
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
