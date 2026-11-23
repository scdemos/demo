// Edge Commerce (Product Bus) routes.
//   GET  /products/<org>/<site>/<path>/index.json → the site's product index from aem.network, with CORS, for
//        hosts Edge Commerce doesn't serve (aem.page, aem.live, DA previews, the Frescopa app). Public, read-only.
//   POST /admin/products { site } → demo admins: Sync products. Pushes the products sheet to Edge Commerce,
//        removes products no longer in it, registers the index and creates an authored page for products
//        that have none, so every host can open /en/products/<id>.
// The Edge Commerce service token (COMMERCE_TOKEN secret) belongs to one site, COMMERCE_SITE (default the
// template site). Only that site manages products; CloneIt demos show its catalog and never write to it.

import {
  INDEX_PATH, LABELS_SHEET, PRODUCTS_ROOT, PRODUCTS_SHEET, productPath, sheetLabels, sheetRows, toProducts,
} from '../../scripts/products.js';

export const COMMERCE_API = 'https://api.adobecommerce.live';
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INDEX_RE = /^(\/[a-z0-9-]+)+\/index\.json$/;
const BATCH = 50;

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const orgOf = (env) => env.ORG || 'scdemos';
export const commerceSiteOf = (env) => env.COMMERCE_SITE || (env.TEMPLATE_REPO || `${orgOf(env)}/demo`).split('/')[1];
const networkOrigin = (org, site) => `https://main--${site}--${org}.aem.network`;
const liveOrigin = (org, site) => `https://main--${site}--${org}.aem.live`;

/** GET /products/<org>/<site>/<path>/index.json */
export async function productIndex(pathname, env, fetchImpl = fetch) {
  const m = /^\/products\/([^/]+)\/([^/]+)(\/.*)$/.exec(pathname);
  const headers = {
    'access-control-allow-origin': '*',
    'content-type': 'application/json',
  };
  if (!m || m[1] !== orgOf(env) || !NAME_RE.test(m[2]) || !INDEX_RE.test(m[3])) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
  }
  const resp = await fetchImpl(`${networkOrigin(m[1], m[2])}${m[3]}`, { cf: { cacheTtl: 60, cacheEverything: true } });
  const type = resp.headers.get('content-type') || '';
  if (!resp.ok || !type.includes('json')) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...headers, 'cache-control': 'max-age=60' } });
  }
  return new Response(resp.body, { status: 200, headers: { ...headers, 'cache-control': 'max-age=60' } });
}

/* ---------- sync ---------- */

/** The site path an image redirects to (/media/x.jpg → /media/media_<hash>.jpg), so Edge Commerce can fetch it. */
async function resolveImage(path, origin, fetchImpl) {
  if (!path || !path.startsWith('/')) return path;
  try {
    const resp = await fetchImpl(`${origin}${path}`, { method: 'HEAD', redirect: 'manual' });
    const location = resp.status >= 300 && resp.status < 400 ? resp.headers.get('location') : '';
    return location ? new URL(location, `${origin}${path}`).pathname : path;
  } catch {
    return path;
  }
}

// An empty page: Edge Commerce supplies the product, its title and description (authored metadata would
// override them), and authors can add content to it later.
const STUB_PAGE = '<body><header></header><main><div></div></main><footer></footer></body>';

async function readSheet(adminFetch, org, site, path) {
  const resp = await adminFetch('da', `/source/${org}/${site}${path}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw fail(`sheet_read_failed_${resp.status}`, 502);
  return resp.json();
}

/**
 * Sync products for `site`. deps: { adminFetch (technical account: DA + Admin API), commerce (fetch with the
 * Edge Commerce token), fetchImpl }. Returns counts and the paths of anything that failed.
 */
export async function syncProducts({ site }, env, { adminFetch, commerce, fetchImpl = fetch }) {
  const org = orgOf(env);
  if (!env.COMMERCE_TOKEN) throw fail('commerce_not_configured', 501);
  if (site !== commerceSiteOf(env)) throw fail('commerce_not_set_up_for_site', 400);

  const sheet = await readSheet(adminFetch, org, site, PRODUCTS_SHEET);
  const rows = sheetRows(sheet);
  if (!rows.length) throw fail('products_sheet_empty', 400);
  const labels = sheetLabels(await readSheet(adminFetch, org, site, LABELS_SHEET));

  const live = liveOrigin(org, site);
  const images = new Map();
  await Promise.all([...new Set(rows.map((r) => String(r.image || '').trim()))].map(async (img) => {
    images.set(img, await resolveImage(img, live, fetchImpl));
  }));
  const resolved = rows.map((r) => ({ ...r, image: images.get(String(r.image || '').trim()) ?? r.image }));
  const origin = env.COMMERCE_ORIGIN || networkOrigin(org, site);
  const { products, skipped } = toProducts(resolved, labels, { origin, contentOrigin: live });

  const failed = [];
  let written = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const resp = await commerce(`/${org}/sites/${site}/catalog/*`, { method: 'POST', body: JSON.stringify(products.slice(i, i + BATCH)) });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = json.errors?.[0]?.path ? `${json.errors[0].path} ${json.errors[0].details || ''}`.trim() : json.message || resp.status;
      throw fail(`products_write_failed: ${detail}`, 502);
    }
    (json.products || []).forEach((p) => {
      if (p.status >= 200 && p.status < 300) written += 1;
      else failed.push(p.path);
    });
  }

  // the index: registered once (409 when it exists)
  const idx = await commerce(`/${org}/sites/${site}/index${INDEX_PATH}`, { method: 'POST' });
  if (!idx.ok && idx.status !== 409) throw fail(`index_register_failed_${idx.status}`, 502);

  // an authored page for each product, published, so aem.page, aem.live and the app can open it; pages
  // that exist are left as they are, and only published when they aren't live yet (e.g. a failed earlier run)
  let pages = 0;
  for (const product of products) {
    const doc = `/source/${org}/${site}${product.path}.html`;
    const head = await adminFetch('da', doc);
    let ready = head.ok;
    if (head.status === 404) {
      const form = new FormData();
      form.append('data', new Blob([STUB_PAGE], { type: 'text/html' }));
      ready = (await adminFetch('da', doc, { method: 'POST', body: form })).ok;
      if (ready) pages += 1;
    }
    const status = ready && await adminFetch('helix', `/status/${org}/${site}/main${product.path}`);
    const live = status?.ok ? (await status.json().catch(() => ({})))?.live?.status : 0;
    if (ready && live !== 200) {
      const preview = await adminFetch('helix', `/preview/${org}/${site}/main${product.path}`, { method: 'POST' });
      const publish = preview.ok && await adminFetch('helix', `/live/${org}/${site}/main${product.path}`, { method: 'POST' });
      if (!publish?.ok) failed.push(product.path);
    } else if (!ready) failed.push(product.path);
  }

  // products under /en/products that are no longer in the sheet, from the catalog itself (the public
  // index is updated asynchronously, so it can miss a product written moments ago)
  // a product is kept while its page is in the sheet. A row that couldn't be synced (no title, a misspelled
  // url) keeps the product with its id, and one whose new version didn't save or publish keeps its current
  // one (e.g. a renamed page): a typo or a failed run never deletes a product
  const keep = new Set(rows.map(productPath).filter(Boolean));
  // rows not synced as written: no title, no product page, or a page another row already has
  const synced = new Set(products.map((p) => `${p.sku} ${p.path}`));
  const rejected = rows.filter((r) => {
    const path = productPath(r);
    return !path || !synced.has(`${String(r.id || '').trim() || path.split('/').pop()} ${path}`);
  });
  const keepSkus = new Set(rejected.map((r) => String(r.id || '').trim()).filter(Boolean));
  products.filter((p) => failed.includes(p.path)).forEach((p) => keepSkus.add(p.sku));
  // remove nothing this time when a product failed (its old version may be the one still shown) or a
  // rejected row has no id to match its product by
  const reconcile = !failed.length && rejected.every((r) => String(r.id || '').trim());
  const stale = [];
  let cursor = '';
  for (let page = 0; reconcile && page < 100; page += 1) {
    const list = await commerce(`/${org}/sites/${site}/catalog${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!list.ok) throw fail(`catalog_list_failed_${list.status}`, 502);
    const body = await list.json().catch(() => ({}));
    (body.products || []).forEach(({ path, sku }) => {
      if (path?.startsWith(`${PRODUCTS_ROOT}/`) && !keep.has(path) && !keepSkus.has(sku)) stale.push(path);
    });
    if (!body.truncated || !body.cursor) break;
    cursor = body.cursor;
  }
  let removed = 0;
  for (const path of stale) {
    const resp = await commerce(`/${org}/sites/${site}/catalog${path}.json`, { method: 'DELETE' });
    if (resp.ok || resp.status === 404) removed += 1;
    else failed.push(path);
  }

  return {
    products: products.length, written, removed, pages, skipped, failed,
  };
}

/** Fetch against the Edge Commerce API with the site's service token. */
export function commerceFetch(env, fetchImpl = fetch) {
  return (path, init = {}) => fetchImpl(`${COMMERCE_API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${env.COMMERCE_TOKEN}` },
  });
}
