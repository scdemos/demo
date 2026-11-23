// Offline tests (no network): node workers/cloneit_token/commerce.test.mjs
import process from 'node:process';
import { productIndex, syncProducts, commerceFetch } from './commerce.js';
import {
  toProducts, productPath, detailHtml, sheetRows, sheetLabels,
} from '../../scripts/products.js';

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` ${extra}`}`); };
const rejects = async (name, fn, msg) => {
  try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, String(e.message).startsWith(msg), e.message); }
};
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const env = {
  ORG: 'scdemos', TEMPLATE_REPO: 'scdemos/demo', COMMERCE_TOKEN: 'tok', COMMERCE_ORIGIN: 'https://demo.bbird.live',
};

/* ---------- products module ---------- */

const ROWS = [
  {
    id: 'one', title: 'One <b>', summary: 'Best', group: 'Plan', price: '49', priceLabel: '$49', period: '/mo', url: '/en/products/one', image: '/media/a.jpg', features: 'A | B', rating: '4.8', reviews: '18,240', action: '/en/booking', actionLabel: 'Get started',
  },
  {
    id: 'flex', title: 'Flex', group: 'Plan', price: '29', priceLabel: '$29', period: '/mo', url: '/en/products/flex?plan=x',
  },
  { id: 'gift', title: 'Gift', group: 'Gift', url: '/en/offers#gift' },
  { id: 'empty', title: '', url: '/en/products/empty' },
];
const LABELS = { brand: 'Frescopa', rating: '{rating} out of 5 · {reviews} reviews', 'plans-label': 'Choose your plan' };

ok('product path: page under /en/products', productPath({ url: '/en/products/one' }) === '/en/products/one');
ok('product path: query dropped', productPath({ url: '/en/products/flex?plan=x' }) === '/en/products/flex');
ok('product path: other pages refused', productPath({ url: '/en/offers#gift' }) === '' && productPath({ url: '/en/products/a/b' }) === '' && productPath({ url: '/en/products/' }) === '');

const { products, skipped } = toProducts(ROWS, LABELS, { origin: 'https://demo.bbird.live', contentOrigin: 'https://main--demo--scdemos.aem.live' });
ok('only rows with a product page', products.length === 2 && skipped.join() === 'Gift,row 4', JSON.stringify(skipped));
const [one] = products;
ok('canonical url on the public host', one.url === 'https://demo.bbird.live/en/products/one');
ok('price as strings', one.price.final === '49.00' && one.price.currency === 'USD');
ok('rating as strings', one.aggregateRating.ratingValue === '4.8' && one.aggregateRating.reviewCount === '18240');
ok('image absolute on the content host', one.images[0].url === 'https://main--demo--scdemos.aem.live/media/a.jpg');
ok('index columns in custom', one.custom.position === '1' && one.custom.group === 'Plan' && one.custom.features === 'A | B');
ok('text is escaped', one.description.includes('One &lt;b&gt;') && !one.description.includes('<b>'));
ok('plans link the group', one.description.includes('href="/en/products/flex"') && one.description.includes('Choose your plan'));
ok('structured data rows', /<div>sku<\/div><div>one<\/div>/.test(one.description) && /<div>price<\/div><div>49\.00<\/div>/.test(one.description));
ok('unsafe action dropped', !detailHtml({ ...ROWS[0], action: 'javascript:alert(1)' }, [], LABELS).includes('javascript')
  && !detailHtml({ ...ROWS[0], action: '//evil.example' }, [], LABELS).includes('evil'));
ok('site action kept', detailHtml(ROWS[0], [], LABELS).includes('href="/en/booking"'));
const odd = toProducts([{ ...ROWS[0], rating: '-1' }, { ...ROWS[1], rating: '9', reviews: '3' }], LABELS, { origin: 'o', contentOrigin: 'https://c' }).products;
ok('out-of-range ratings ignored, sync continues', odd.length === 2 && !odd.some((p) => p.aggregateRating) && !odd[0].description.includes('★'));
ok('no plans for a single product', !detailHtml(ROWS[2], [ROWS[2]], LABELS).includes('plans'));
ok('group label wins', detailHtml(ROWS[0], [ROWS[0], ROWS[1]], { ...LABELS, 'plan-label': 'Pick one' }).includes('Pick one'));
ok('workbook rows', sheetRows({ ':names': ['products'], products: { data: [{ a: 1 }] } }).length === 1);
ok('labels', sheetLabels({ data: [{ key: 'brand', value: 'X' }, { key: '', value: 'y' }] }).brand === 'X');
ok('placeholder labels', sheetLabels({ data: [{ Key: 'brand', Text: 'Y' }, { Key: 'blank', Text: '' }] }).brand === 'Y');
ok('placeholder blanks are left out', !('blank' in sheetLabels({ data: [{ Key: 'blank', Text: '' }] })));

/* ---------- public index ---------- */

const network = async (url) => (url === 'https://main--demo--scdemos.aem.network/en/products/index.json'
  ? json({ data: [{ path: '/en/products/one' }] })
  : new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }));
let resp = await productIndex('/products/scdemos/demo/en/products/index.json', env, network);
ok('index proxied with CORS', resp.status === 200 && resp.headers.get('access-control-allow-origin') === '*');
resp = await productIndex('/products/other/demo/en/products/index.json', env, network);
ok('other orgs refused', resp.status === 404);
resp = await productIndex('/products/scdemos/demo/en/products/one', env, network);
ok('only index.json', resp.status === 404);
resp = await productIndex('/products/scdemos/Demo..x/en/products/index.json', env, network);
ok('bad site name refused', resp.status === 404);
resp = await productIndex('/products/scdemos/acme/en/products/index.json', env, network);
ok('site without an index: 404', resp.status === 404);

/* ---------- sync ---------- */

function deps({
  rows = ROWS, writeStatus = 201, itemStatus = 200, existing = ['/en/products/one', '/en/products/old'], pages = ['/en/products/one'], calls = [],
  live = ['/en/products/one'], previewStatus = 200,
} = {}) {
  const adminFetch = async (kind, path, init = {}) => {
    calls.push([kind, init.method || 'GET', path]);
    if (path === '/source/scdemos/demo/en/data/products.json') return json({ data: rows });
    if (path === '/source/scdemos/demo/en/placeholders.json') return json({ data: [{ Key: 'brand', Text: 'Frescopa' }] });
    if (kind === 'da' && path.endsWith('.html') && (init.method || 'GET') === 'GET') {
      return new Response('', { status: pages.some((p) => path.endsWith(`${p}.html`)) ? 200 : 404 });
    }
    if (path.startsWith('/status/')) return json({ live: { status: live.some((p) => path.endsWith(p)) ? 200 : 404 } });
    if (path.startsWith('/preview/')) return new Response('', { status: previewStatus });
    if (kind === 'da' && init.method === 'POST') pages.push(path.slice('/source/scdemos/demo'.length, -'.html'.length));
    return new Response('', { status: 200 });
  };
  const commerce = async (path, init = {}) => {
    calls.push(['commerce', init.method || 'GET', path, init.body]);
    if (path.endsWith('/catalog/*')) {
      const sent = JSON.parse(init.body);
      return json({ products: sent.map((p) => ({ path: p.path, status: itemStatus })) }, writeStatus);
    }
    if (path.includes('/index/')) return new Response('', { status: 409 });
    if (/\/catalog(\?cursor=.*)?$/.test(path)) {
      // two pages: the catalog lists products the public index may not show yet
      return path.includes('cursor=')
        ? json({ products: existing.slice(1).map((p) => ({ path: p, sku: p.split('/').pop() })), truncated: false })
        : json({ products: [{ path: existing[0], sku: existing[0].split('/').pop() }, { path: '/products/other', sku: 'other' }], truncated: true, cursor: 'c 2' });
    }
    return new Response('', { status: 200 });
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push(['fetch', init.method || 'GET', url]);
    if (url.endsWith('/media/a.jpg')) return new Response('', { status: 301, headers: { location: '/media/media_abc.jpg' } });
    return new Response('', { status: 404 });
  };
  return { adminFetch, commerce, fetchImpl };
}

let calls = [];
const result = await syncProducts({ site: 'demo' }, env, deps({ calls }));
ok('sync counts', result.products === 2 && result.written === 2 && result.removed === 1 && result.pages === 1 && !result.failed.length, JSON.stringify(result));
const sent = JSON.parse(calls.find((c) => c[0] === 'commerce' && c[2].endsWith('/catalog/*'))[3]);
ok('image redirect resolved before writing', sent[0].images[0].url === 'https://main--demo--scdemos.aem.live/media/media_abc.jpg', sent[0].images?.[0]?.url);
ok('canonical url from COMMERCE_ORIGIN', sent[0].url === 'https://demo.bbird.live/en/products/one');
ok('stale product deleted', calls.some((c) => c[0] === 'commerce' && c[1] === 'DELETE' && c[2] === '/scdemos/sites/demo/catalog/en/products/old.json'));
ok('catalog paged with its cursor', calls.some((c) => c[2] === '/scdemos/sites/demo/catalog?cursor=c%202'));
ok('products outside /en/products left alone', !calls.some((c) => c[1] === 'DELETE' && c[2].includes('/products/other')));
ok('kept product not deleted', !calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/one')));
ok('index registered (409 ok)', calls.some((c) => c[0] === 'commerce' && c[1] === 'POST' && c[2] === '/scdemos/sites/demo/index/en/products/index.json'));
ok('missing page created, previewed, published', ['/source/scdemos/demo/en/products/flex.html', '/preview/scdemos/demo/main/en/products/flex', '/live/scdemos/demo/main/en/products/flex']
  .every((p) => calls.some((c) => c[1] === 'POST' && c[2] === p)));
ok('existing page left alone', !calls.some((c) => c[1] === 'POST' && c[2] === '/source/scdemos/demo/en/products/one.html'));

// a page whose publishing failed is published on the next sync
const pages = ['/en/products/one'];
const live = ['/en/products/one'];
calls = [];
const first = await syncProducts({ site: 'demo' }, env, deps({ calls, pages, live, previewStatus: 503 }));
ok('failed publishing reported', first.failed.includes('/en/products/flex'), JSON.stringify(first));
calls = [];
const again = await syncProducts({ site: 'demo' }, env, deps({ calls, pages, live }));
ok('next sync publishes it', !again.failed.length && again.pages === 0
  && calls.some((c) => c[2] === '/live/scdemos/demo/main/en/products/flex'), JSON.stringify(again));
ok('live pages not republished', !calls.some((c) => c[2] === '/preview/scdemos/demo/main/en/products/one'));

// a row that can't be synced keeps its product
calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, rows: [ROWS[1], { ...ROWS[0], url: '/en/produts/one' }] }));
ok('misspelled url keeps its product (by id)', !calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/one.json'))
  && calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/old.json')));
ok('duplicate page synced once', toProducts([ROWS[0], { ...ROWS[0], id: 'one-b', url: '/en/products/one?plan=b' }], LABELS, { origin: 'o', contentOrigin: 'https://c' }).products.length === 1);
ok('backslash and protocol-relative actions dropped', !detailHtml({ ...ROWS[0], action: '/\\evil.example/x' }, [], LABELS).includes('evil'));

// a renamed product page: the old one is removed
calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, rows: [{ ...ROWS[0], url: '/en/products/one-new' }], existing: ['/en/products/one', '/en/products/old'] }));
ok('renamed page: old product removed', calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/one.json')));

calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, itemStatus: 400, rows: [{ ...ROWS[0], url: '/en/products/one-new' }], existing: ['/en/products/one', '/en/products/old'] }));
ok('failed rename keeps the old product', !calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/one.json')));

calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, previewStatus: 503, pages: [], live: [], rows: [{ ...ROWS[0], url: '/en/products/one-new' }], existing: ['/en/products/one'] }));
ok('rename whose page failed to publish keeps the old product', !calls.some((c) => c[1] === 'DELETE'));
calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, rows: [ROWS[1], { title: 'One', url: '/en/produts/one' }], existing: ['/en/products/one'] }));
ok('rejected row without id: nothing removed', !calls.some((c) => c[1] === 'DELETE'));

calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, rows: [ROWS[0], { ...ROWS[1], url: '/en/products/one' }], existing: ['/en/products/one', '/en/products/flex'] }));
ok('duplicate-page row keeps its product', !calls.some((c) => c[1] === 'DELETE'));

calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, previewStatus: 503, pages: [], live: [], rows: [{ title: 'One', url: '/en/products/one-new' }], existing: ['/en/products/one'] }));
ok('failed run without ids: nothing removed', !calls.some((c) => c[1] === 'DELETE'));

// a row that can't be synced (no title) keeps its product
calls = [];
await syncProducts({ site: 'demo' }, env, deps({ calls, rows: [ROWS[1], { ...ROWS[0], title: '' }], existing: ['/en/products/one', '/en/products/old'] }));
ok('invalid row keeps its product', !calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/one.json'))
  && calls.some((c) => c[1] === 'DELETE' && c[2].includes('/en/products/old.json')));

calls = [];
const partial = await syncProducts({ site: 'demo' }, env, deps({ itemStatus: 400, calls }));
ok('per-product failures reported', partial.failed.includes('/en/products/one') && partial.written === 0, JSON.stringify(partial));

await rejects('no token', () => syncProducts({ site: 'demo' }, { ...env, COMMERCE_TOKEN: '' }, deps()), 'commerce_not_configured');
await rejects('only the Edge Commerce site', () => syncProducts({ site: 'acme' }, env, deps()), 'commerce_not_set_up_for_site');
await rejects('empty sheet', () => syncProducts({ site: 'demo' }, env, deps({ rows: [] })), 'products_sheet_empty');
await rejects('catalog list refused', () => syncProducts({ site: 'demo' }, env, { ...deps(), commerce: async (path, init = {}) => (path.endsWith('/catalog') ? new Response('', { status: 403 }) : deps().commerce(path, init)) }), 'catalog_list_failed');
await rejects('write refused', () => syncProducts({ site: 'demo' }, env, deps({ writeStatus: 400 })), 'products_write_failed');

let seen;
await commerceFetch(env, async (url, init) => { seen = { url, init }; return new Response(''); })('/scdemos/sites/demo/catalog/*', { method: 'POST', headers: { Authorization: 'x' } });
ok('token sent, not overridable', seen.url === 'https://api.adobecommerce.live/scdemos/sites/demo/catalog/*' && seen.init.headers.Authorization === 'Bearer tok');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
