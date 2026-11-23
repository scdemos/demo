/*
 * POST /orders: a cart checkout from any demo site. Creates the order as a guest order in the main
 * demo's Edge Commerce (the catalog every demo shows), then hands the confirmed order to the contact-us
 * worker (service binding CONTACT_US), which posts it to Slack like any form submission. Edge Commerce
 * checks every price against the catalog, so Slack only ever shows orders it accepted.
 * See README.md for the request and response shapes.
 */
export const COMMERCE_API = 'https://api.adobecommerce.live';
export const CATALOG = { org: 'scdemos', site: 'demo' };
const MAX_BODY = 20 * 1024;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 10;
const PATH_RE = /^\/en\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const PRICE_RE = /^\d{1,7}(\.\d{1,2})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
// pages that may place orders: the demo sites (main, branches, CloneIt demos) and local development
const ORIGIN_RE = /^(https:\/\/([a-z0-9-]+--){2}scdemos\.aem\.(page|live|network)|https:\/\/demo\.bbird\.live|http:\/\/localhost(:\d+)?)$/;
const STATE_RE = /^[A-Z]{2}$/;

const fail = (status, error, extra = {}) => Object.assign(new Error(error), { status, extra });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The checkout body, validated: { items, customer, address, page } or throws (status 400). */
export function readOrder(body) {
  if (!body || typeof body !== 'object') throw fail(400, 'invalid_order');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > MAX_ITEMS) throw fail(400, 'invalid_items');
  const seen = new Set();
  const lines = items.map((item) => {
    const line = {
      sku: str(item?.sku, 100),
      path: str(item?.path, 200),
      name: str(item?.name, 200),
      quantity: Number(item?.quantity),
      price: str(String(item?.price ?? ''), 12),
      currency: str(item?.currency, 3).toUpperCase() || 'USD',
    };
    const valid = SKU_RE.test(line.sku) && PATH_RE.test(line.path) && line.name
      && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= MAX_QUANTITY
      && PRICE_RE.test(line.price) && Number(line.price) > 0 && CURRENCY_RE.test(line.currency);
    if (!valid || seen.has(line.sku)) throw fail(400, 'invalid_items');
    seen.add(line.sku);
    return line;
  });
  if (new Set(lines.map((l) => l.currency)).size > 1) throw fail(400, 'invalid_items');

  const c = body.customer || {};
  const a = body.address || {};
  const customer = { firstName: str(c.firstName, 100), lastName: str(c.lastName, 100), email: str(c.email, 254) };
  const address = {
    address1: str(a.address1), city: str(a.city, 100), state: str(a.state, 2).toUpperCase(), zip: str(a.zip, 10),
  };
  const missing = [
    ['firstName', customer.firstName], ['lastName', customer.lastName], ['email', EMAIL_RE.test(customer.email)],
    ['address1', address.address1], ['city', address.city],
    ['state', STATE_RE.test(address.state)], ['zip', ZIP_RE.test(address.zip)],
  ].filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) throw fail(400, 'invalid_customer', { fields: missing });
  return { items: lines, customer, address };
}

/** The Edge Commerce guest order for a validated checkout. */
export function commerceOrder({ items, customer, address }, site) {
  const name = `${customer.firstName} ${customer.lastName}`;
  return {
    customer,
    shipping: {
      name, email: customer.email, ...address, country: 'US',
    },
    country: 'us',
    locale: 'en-US',
    checkoutFlow: 'standard',
    entryPoint: 'cart',
    items: items.map((l) => ({
      sku: l.sku, path: l.path, name: l.name, quantity: l.quantity, price: { final: Number(l.price).toFixed(2), currency: l.currency },
    })),
    custom: { site },
  };
}

export function money(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const totalOf = (items) => items.reduce((sum, l) => sum + Number(l.price) * l.quantity, 0);

/** The order as a contact-us submission: its Slack title and fields. */
export function orderSubmission(order, { items }) {
  const currency = items[0].currency;
  const c = order.customer || {};
  const s = order.shipping || {};
  return {
    _form: `New order ${order.friendlyId || order.id}`,
    order: order.friendlyId || order.id,
    customer: `${c.firstName} ${c.lastName}`,
    email: c.email,
    address: `${s.address1}, ${s.city}, ${s.state} ${s.zip}`,
    items: items.map((l) => `${l.quantity} × ${l.name} (${money(Number(l.price) * l.quantity, currency)})`).join('; '),
    total: money(totalOf(items), currency),
  };
}

/** The body as text, read as a stream and cancelled as soon as it passes MAX_BODY bytes. */
async function readText(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) throw fail(413, 'too_large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      reader.cancel().catch(() => {});
      throw fail(413, 'too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((c) => { bytes.set(c, offset); offset += c.byteLength; });
  return new TextDecoder().decode(bytes);
}

async function readJson(request) {
  const text = await readText(request);
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, 'invalid_order');
  }
}

/**
 * Handles POST /orders. Returns { status, body }. `fetchImpl` is injectable for tests.
 * Errors: 400 invalid_order | invalid_items | invalid_customer {fields}, 403 forbidden (not a demo
 * page), 409 price_changed {sku, price} (the catalog price, for the cart to update), 413 too_large,
 * 415 unsupported (not JSON), 429 too_many_orders, 502 order_failed.
 */
export async function handleOrder(request, env, fetchImpl = fetch) {
  // only demo pages, only JSON (which browsers preflight, so other sites can't post it silently)
  if (!ORIGIN_RE.test(request.headers.get('origin') || '')) return { status: 403, body: { ok: false, error: 'forbidden' } };
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, body: { ok: false, error: 'unsupported' } };
  }
  // a few orders a minute per visitor (Workers rate limiting binding)
  if (env.ORDER_LIMIT) {
    const { success } = await env.ORDER_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
    if (!success) return { status: 429, body: { ok: false, error: 'too_many_orders' } };
  }
  let checkout;
  try {
    const body = await readJson(request);
    if (str(body?._gotcha)) return { status: 200, body: { ok: true } }; // honeypot: a bot, do nothing
    checkout = readOrder(body);
  } catch (e) {
    return { status: e.status || 400, body: { ok: false, error: e.message, ...e.extra } };
  }
  const page = request.headers.get('referer') || request.headers.get('origin') || '';
  let site = '';
  try { site = new URL(page).host; } catch { /* unknown page */ }

  // automated checks (agents, QA) must never create orders or reach the live channel
  if (request.headers.get('x-dry-run') === '1') {
    return { status: 200, body: { ok: true, dryRun: true, items: checkout.items.length } };
  }

  const { org, site: catalogSite } = CATALOG;
  let resp;
  try {
    resp = await fetchImpl(`${COMMERCE_API}/${org}/sites/${catalogSite}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commerceOrder(checkout, site)),
    });
  } catch (e) {
    console.error('order request failed', e.message);
    return { status: 502, body: { ok: false, error: 'order_failed' } };
  }
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('order rejected', resp.status, JSON.stringify(result).slice(0, 500));
    if (result.code === 'ADOBE_COMMERCE_CONSISTENCY_MISMATCH' && result.details?.field === 'price') {
      return {
        status: 409, body: { ok: false, error: 'price_changed', sku: result.details.sku, price: result.details.actualPrice?.final || '' },
      };
    }
    return { status: resp.status >= 500 ? 502 : 400, body: { ok: false, error: resp.status >= 500 ? 'order_failed' : 'invalid_order' } };
  }
  const order = result.order || {};

  let delivered = false;
  if (env.CONTACT_US) {
    try {
      const slack = await env.CONTACT_US.fetch('https://demo.bbird.live/contact-us/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(page ? { Referer: page } : {}) },
        body: JSON.stringify(orderSubmission(order, checkout)),
      });
      delivered = !!(await slack.json().catch(() => ({}))).delivered;
      if (!slack.ok) console.error('contact-us failed', slack.status);
    } catch (e) {
      console.error('contact-us error', e.message);
    }
  }
  // the order is always in the worker logs, even when Slack is down
  console.log(JSON.stringify({ order: order.id, friendlyId: order.friendlyId, site, delivered }));

  return {
    status: 200,
    body: {
      ok: true,
      delivered,
      order: {
        id: order.friendlyId || order.id,
        createdAt: order.createdAt,
        total: totalOf(checkout.items).toFixed(2),
        currency: checkout.items[0].currency,
        items: checkout.items.map(({
          sku, name, quantity, price,
        }) => ({
          sku, name, quantity, price,
        })),
      },
    },
  };
}
