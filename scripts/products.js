// Products. They live in Edge Commerce (the Product Bus), in the main demo's catalog, which every demo
// shows: CloneIt demos read it too and don't manage products of their own. The main demo's DA sheet
// /en/data/products.json is where they're edited (it stands in for a PIM): Sync products in Demo Admin
// pushes it to Edge Commerce, which renders a page for each product at /en/products/<id> and keeps the
// /en/products/index.json index. This module is shared by the site and the CloneIt worker
// (workers/cloneit_token), which runs the sync.

export const PRODUCTS_ROOT = '/en/products';
export const PRODUCTS_SHEET = '/en/data/products.json';
// the words the shop shows (brand, rating format, plan labels, cart, checkout): the default market's
// placeholders sheet (Key, Text). Other markets add their own, e.g. /de/placeholders.
export const LABELS_SHEET = '/en/placeholders.json';
export const INDEX_PATH = `${PRODUCTS_ROOT}/index.json`;
export const COMMERCE_API = 'https://api.adobecommerce.live';
// the catalog every demo shows: the main demo's
export const CATALOG = { org: 'scdemos', site: 'demo', ref: 'main' };
// public, read-only proxy of a site's product index (with CORS), for hosts Edge Commerce doesn't serve
export const INDEX_PROXY = 'https://demo.bbird.live/cloneit/products';

// index columns, named like the sheet so catalogs read either
export const INDEX_PROPERTIES = {
  name: 'title',
  path: 'path',
  'custom.summary': 'summary',
  'custom.group': 'group',
  'custom.category': 'category',
  'custom.collection': 'collection',
  'price.final': 'price',
  'price.currency': 'currency',
  'custom.priceLabel': 'priceLabel',
  'custom.period': 'period',
  'custom.badge': 'badge',
  'custom.badgeStyle': 'badgeStyle',
  'custom.keywords': 'keywords',
  'custom.features': 'features',
  'custom.position': 'position',
  'images[0].url': 'image',
};

const text = (v) => String(v ?? '').trim();
const esc = (v) => text(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const format = (tpl, values) => tpl.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Links a product can carry: a site path, https, mail or phone. Anything else (javascript:, data:, …) is dropped. */
export const safeLink = (v) => !text(v).includes('\\') && /^(\/(?![/])|https:\/\/|mailto:|tel:|#)/i.test(text(v));

/** The product page of a row: its url column, when it is a page directly under /en/products. */
export function productPath(row) {
  const path = text(row.url).split(/[?#]/)[0].replace(/\/$/, '');
  const slug = path.startsWith(`${PRODUCTS_ROOT}/`) ? path.slice(PRODUCTS_ROOT.length + 1) : '';
  return SLUG_RE.test(slug) ? path : '';
}

/** True for a product page path: /en/products/<slug>. */
export const isProductPath = (path) => !!productPath({ url: path });

/** { rating, reviews } when the row has a usable rating (0–5 with a review count), else null. */
function ratingOf(row) {
  const rating = Number.parseFloat(row.rating);
  const reviews = Number.parseInt(text(row.reviews).replace(/\D/g, ''), 10);
  return rating >= 0 && rating <= 5 && reviews > 0 ? { rating, reviews } : null;
}

const features = (row) => text(row.features).split('|').map((f) => f.trim()).filter(Boolean);

function money(value) {
  const n = Number.parseFloat(text(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

function absolute(value, origin) {
  const v = text(value);
  if (!v) return '';
  try {
    return new URL(v, `${origin}/`).href;
  } catch {
    return '';
  }
}

/** The product-detail block (authored-table markup) that becomes the product's description. */
export function detailHtml(row, siblings, labels) {
  const buy = [];
  if (text(row.badge)) buy.push(`<p>${esc(row.badge)}</p>`);
  buy.push(`<h2>${esc(row.title)}</h2>`);
  const { rating, reviews } = ratingOf(row) || {};
  if (reviews && labels.rating) {
    const stars = '★'.repeat(Math.round(rating)).padEnd(5, '☆');
    buy.push(`<p>${stars} ${esc(format(labels.rating, { rating: String(rating), reviews: reviews.toLocaleString('en-US') }))}</p>`);
  }
  if (text(row.summary)) buy.push(`<p>${esc(row.summary)}</p>`);
  if (text(row.priceLabel)) buy.push(`<p><strong>${esc(row.priceLabel)}</strong>${esc(row.period)}</p>`);
  if (text(row.note)) buy.push(`<p>${esc(row.note)}</p>`);
  const list = features(row);
  if (list.length) buy.push(`<ul>${list.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`);
  if (safeLink(row.action) && text(row.actionLabel)) {
    buy.push(`<p><strong><a href="${esc(row.action)}">${esc(row.actionLabel)}</a></strong></p>`);
  }

  const rows = [`<div><div></div><div>${buy.join('')}</div></div>`];
  // structured data, for hosts where Edge Commerce doesn't add it
  const config = {
    sku: text(row.id), price: money(row.price), currency: text(row.currency) || 'USD', brand: labels.brand,
  };
  if (reviews) Object.assign(config, { rating: String(rating), reviews: String(reviews) });
  Object.entries(config).forEach(([k, v]) => { if (text(v)) rows.push(`<div><div>${k}</div><div>${esc(v)}</div></div>`); });
  const groupLabel = labels[`${text(row.group).toLowerCase()}-label`] || labels['plans-label'];
  if (siblings.length > 1 && groupLabel) {
    const items = siblings.map((s) => `<li><a href="${esc(productPath(s))}">${esc(s.title)} — ${esc(s.priceLabel)}${esc(s.period)}</a></li>`);
    rows.push(`<div><div>plans-label</div><div>${esc(groupLabel)}</div></div>`);
    rows.push(`<div><div>plans</div><div><ul>${items.join('')}</ul></div></div>`);
  }
  return `<div class="product-detail">${rows.join('')}</div>`;
}

/**
 * Product Bus entries for the sheet rows that have a product page. `origin` is the site's public host
 * (canonical URLs), `contentOrigin` serves its media. Returns { products, skipped }.
 */
export function toProducts(rows, labels, { origin, contentOrigin }) {
  const skipped = [];
  const valid = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const path = productPath(row);
    // a product needs a title and its own page; a second row for the same page is skipped
    if (!text(row.title) || !path || seen.has(path)) skipped.push(text(row.title) || `row ${i + 1}`);
    else {
      seen.add(path);
      valid.push({ row, path, position: i + 1 });
    }
  });
  const products = valid.map(({ row, path, position }) => {
    // the other products in the same group, in sheet order, become "choose your plan" links
    const siblings = text(row.group) ? valid.filter((v) => text(v.row.group) === text(row.group)).map((v) => v.row) : [];
    const price = money(row.price);
    const image = absolute(row.image, contentOrigin);
    const entry = {
      sku: text(row.id) || path.split('/').pop(),
      name: text(row.title),
      path,
      url: `${origin}${path}`,
      urlKey: path.split('/').pop(),
      type: 'simple',
      availability: 'InStock',
      description: detailHtml(row, siblings, labels),
      metaDescription: text(row.summary),
      custom: {
        summary: text(row.summary),
        group: text(row.group),
        category: text(row.category),
        collection: text(row.collection),
        priceLabel: text(row.priceLabel),
        period: text(row.period),
        badge: text(row.badge),
        badgeStyle: text(row.badgeStyle),
        keywords: text(row.keywords),
        features: features(row).join(' | '),
        position: String(position),
      },
    };
    if (labels.brand) entry.brand = labels.brand;
    if (price) entry.price = { currency: text(row.currency) || 'USD', regular: price, final: price };
    if (image) entry.images = [{ url: image, label: text(row.title) }];
    const score = ratingOf(row);
    if (score) {
      entry.aggregateRating = { ratingValue: String(score.rating), reviewCount: String(score.reviews), bestRating: '5' };
    }
    return entry;
  });
  return { products, skipped };
}

/** The sheet's rows: a single sheet, or the first sheet of a workbook. */
export function sheetRows(json) {
  if (Array.isArray(json?.data)) return json.data;
  const first = json?.[':names']?.[0];
  return Array.isArray(json?.[first]?.data) ? json[first].data : [];
}

/** Labels from a placeholders sheet: Key and Text columns (any case; Value also reads as Text). */
export function sheetLabels(json) {
  return Object.fromEntries(sheetRows(json).map((r) => {
    const row = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), text(v)]));
    return [row.key, row.text || row.value || ''];
  }).filter(([k, v]) => k && v));
}

/* ---------- browser ---------- */

/** Origin that serves the catalog's Edge Commerce pages, index and product media. */
export function networkOrigin({ ref = 'main', site, org } = CATALOG) {
  return `https://${ref}--${site}--${org}.aem.network`;
}

/** Origin the site's code was loaded from: the site, also when it's embedded in another app (aem-embed). */
const codeOrigin = () => new URL(import.meta.url).origin;

async function fetchJson(url) {
  try {
    const resp = await fetch(url);
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

/**
 * The catalog's products, in the order of the products sheet. Each has path and url (its page), image
 * (absolute URL) and the sheet's other columns. `index` is the index's path or URL (only its path is used);
 * it's read from aem.network directly where the page is served from there, otherwise through the index
 * proxy, which adds CORS.
 */
export async function loadProducts({ index: source = INDEX_PATH } = {}) {
  // every demo reads the main demo's catalog: only the source's path matters (authors may link it on any host)
  const network = networkOrigin();
  const { pathname } = new URL(source, network);
  const read = codeOrigin() === network ? `${network}${pathname}` : `${INDEX_PROXY}/${CATALOG.org}/${CATALOG.site}${pathname}`;
  return sheetRows(await fetchJson(read))
    .map((row) => ({
      ...row,
      id: row.sku,
      url: row.path,
      image: row.image ? new URL(row.image, `${network}${row.path.replace(/[^/]*$/, '')}`).href : '',
    }))
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
}

/**
 * The product at `path`, for pages Edge Commerce didn't render (aem.page, aem.live, the app):
 * { name, description, images } from the Edge Commerce API, or null.
 */
export async function loadProduct(path) {
  const json = await fetchJson(`${COMMERCE_API}/${CATALOG.org}/sites/${CATALOG.site}/catalog${path}.json`);
  if (!json?.description) return null;
  const base = `${networkOrigin()}${path.replace(/[^/]*$/, '')}`;
  return {
    name: json.name,
    description: json.description,
    images: (json.images || []).map((img) => ({ ...img, url: new URL(img.url, base).href })),
  };
}
