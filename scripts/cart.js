// The shopping cart: plans and gifts from the catalog, kept in this browser (localStorage) until the
// shopper places the order. Checkout goes to the order worker (workers/orders), which
// creates the order in the main demo's Edge Commerce and posts it to Slack. Every demo, CloneIt
// demos included, orders from that one catalog.
import { LABELS_SHEET, sheetLabels } from './products.js';
import { getMarket, trackEvent } from './shared.js';

export const CART_PATH = '/en/cart';
export const ORDERS_URL = 'https://demo.bbird.live/orders';
export const MAX_QUANTITY = 10;
const STORAGE_KEY = 'frescopa-cart';
const LAST_ORDER_KEY = 'frescopa-last-order';
export const CART_EVENT = 'cart-change';

const text = (v) => String(v ?? '').trim();

// the cart when this browser won't store it (blocked or full storage): kept for this page
let memory = null;

const valid = (items) => (Array.isArray(items) ? items.filter((i) => i && text(i.sku) && Number(i.quantity) > 0) : []);

function read() {
  if (memory) return memory.map((i) => ({ ...i }));
  try {
    return valid(JSON.parse(localStorage.getItem(STORAGE_KEY))?.items);
  } catch {
    return [];
  }
}

function write(items) {
  try {
    if (items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
    else localStorage.removeItem(STORAGE_KEY);
    memory = null;
  } catch {
    memory = items.map((i) => ({ ...i }));
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { items } }));
}

/** The cart's lines: { sku, path, name, price, currency, period, image, quantity }. */
export const getCart = () => read();

/** Number of items in the cart, counting quantities. */
export const cartCount = () => read().reduce((n, i) => n + Number(i.quantity), 0);

export const cartTotal = (items = read()) => items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);

/**
 * GA4 ecommerce data for cart lines (or order items).
 * @param {object[]} items lines with sku, name, price, quantity and currency
 * @param {string} [currency] the order's currency, when the lines don't carry it
 */
export function ecommerce(items, currency = items[0]?.currency || 'USD') {
  return {
    currency,
    value: Number(cartTotal(items).toFixed(2)),
    items: items.map((i) => ({
      item_id: i.sku, item_name: i.name, price: Number(i.price), quantity: Number(i.quantity),
    })),
  };
}

const newLineId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Adds one of a product (or one more). False when the cart already holds MAX_QUANTITY of it. */
export function addToCart(product) {
  const items = read();
  const line = items.find((i) => i.sku === product.sku);
  if (line && Number(line.quantity) >= MAX_QUANTITY) return false;
  if (line) line.quantity = Number(line.quantity) + 1;
  else items.push({ ...product, quantity: 1, line: newLineId() });
  write(items);
  trackEvent('add_to_cart', { ecommerce: ecommerce([{ ...product, quantity: 1 }]) });
  return true;
}

/** Sets a line's quantity; 0 removes it. */
export function setQuantity(sku, quantity) {
  const q = Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(Number(quantity)) || 0));
  const items = read();
  const line = items.find((i) => i.sku === sku);
  write(items.map((i) => (i.sku === sku ? { ...i, quantity: q } : i)).filter((i) => i.quantity > 0));
  const change = line ? q - Number(line.quantity) : 0;
  if (change) {
    trackEvent(change > 0 ? 'add_to_cart' : 'remove_from_cart', {
      ecommerce: ecommerce([{ ...line, quantity: Math.abs(change) }]),
    });
  }
}

/** Updates a line's price (the catalog's price changed since it was added). */
export function setPrice(sku, price) {
  write(read().map((i) => (i.sku === sku ? { ...i, price } : i)));
}

export const clearCart = () => write([]);

/** Calls `fn` with the cart's items whenever it changes, here or in another tab. */
export function onCartChange(fn) {
  window.addEventListener(CART_EVENT, () => fn(read()));
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) fn(read()); });
}

export function formatMoney(amount, currency = 'USD') {
  const locale = document.documentElement.lang || 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

/** Fills `{name}` placeholders in a label. */
export const formatLabel = (tpl, values) => text(tpl).replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);

let labelsPromise;
/**
 * The shop's labels (key → text) from placeholders sheets (Key, Text). The market's sheet
 * (/de/placeholders on /de/ pages) wins;
 * keys it lacks come from the default /en/placeholders. The shop shows only where they have its text
 * (`add-to-cart`): a demo cloned before the shop existed has neither the text nor a cart page.
 */
export function loadLabels() {
  if (!labelsPromise) {
    const site = new URL(import.meta.url).origin;
    const market = `${site}${getMarket().root}placeholders.json`;
    const fallback = `${site}${LABELS_SHEET}`;
    const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    labelsPromise = Promise.all([get(fallback), market === fallback ? null : get(market)])
      .then(([base, own]) => ({ ...sheetLabels(base), ...sheetLabels(own) }));
  }
  return labelsPromise;
}

/**
 * Places the order for the cart's items. Resolves to the confirmed order
 * { id, createdAt, total, currency, items }; rejects with an Error whose `code` is the worker's error
 * (price_changed updates the cart's price first; invalid_customer carries `fields`).
 */
export async function placeOrder({ customer, address, gotcha = '' }) {
  const lines = read();
  const items = lines.map(({
    sku, path, name, quantity, price, currency,
  }) => ({
    sku, path, name, quantity, price, currency,
  }));
  let resp;
  try {
    resp = await fetch(ORDERS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items, customer, address, _gotcha: gotcha,
      }),
    });
  } catch {
    throw Object.assign(new Error('order_failed'), { code: 'order_failed' });
  }
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) {
    if (body.error === 'price_changed' && body.sku && body.price) setPrice(body.sku, body.price);
    throw Object.assign(new Error(body.error || 'order_failed'), { code: body.error || 'order_failed', fields: body.fields || [] });
  }
  if (!body.order) throw Object.assign(new Error('order_failed'), { code: 'order_failed' });
  const order = { ...body.order, customer };
  trackEvent('purchase', {
    ecommerce: {
      ...ecommerce(order.items, order.currency),
      transaction_id: order.id,
      value: Number(order.total),
    },
  });
  // take out the lines that were ordered; anything added meanwhile (here or in another tab) stays
  const ordered = new Map(lines.map((i) => [i.line || i.sku, Number(i.quantity)]));
  write(read()
    .map((i) => ({ ...i, quantity: Number(i.quantity) - (ordered.get(i.line || i.sku) || 0) }))
    .filter((i) => i.quantity > 0));
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch { /* the confirmation is shown now; a reload just won't show it again */ }
  return order;
}

/** The order placed in this tab, when its id is `id` (a reload of the confirmation). */
export function lastOrder(id) {
  try {
    const order = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY));
    return order?.id === id ? order : null;
  } catch {
    return null;
  }
}
