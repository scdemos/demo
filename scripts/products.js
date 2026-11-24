// Products. They live in Edge Commerce (the Product Bus), in the main demo's catalog, which every demo
// shows: CloneIt demos read it too and don't manage products of their own. Products are managed in Edge
// Commerce itself (its catalog API); Edge Commerce renders a page for each product at /en/products/<id>
// and keeps the /en/products/index.json index that listings read.

export const PRODUCTS_ROOT = '/en/products';
// the words the shop shows (cart, checkout): the default market's placeholders sheet (Key, Text).
// Other markets add their own, e.g. /de/placeholders.
export const LABELS_SHEET = '/en/placeholders.json';
export const INDEX_PATH = `${PRODUCTS_ROOT}/index.json`;
export const COMMERCE_API = 'https://api.adobecommerce.live';
// the catalog every demo shows: the main demo's
export const CATALOG = { org: 'scdemos', site: 'demo', ref: 'main' };
// public, read-only proxy of a site's product index (with CORS), for hosts Edge Commerce doesn't serve
export const INDEX_PROXY = 'https://demo.bbird.live/cloneit/products';

const text = (v) => String(v ?? '').trim();

/** A spreadsheet JSON's rows (the index, a placeholders sheet): a single sheet, or the first of a workbook. */
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
 * The catalog's products, in catalog order (their position). Each has path and url (its page), image
 * (absolute URL) and the index's other columns. `index` is the index's path or URL (only its path is used);
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
