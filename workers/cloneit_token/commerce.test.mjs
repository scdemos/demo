// Offline tests (no network): node workers/cloneit_token/commerce.test.mjs
import process from 'node:process';
import { productIndex } from './commerce.js';
import { sheetRows, sheetLabels } from '../../scripts/products.js';

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` ${extra}`}`); };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const env = { ORG: 'scdemos' };

/* ---------- products module ---------- */

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
