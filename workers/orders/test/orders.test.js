import {
  describe, it, expect, beforeEach,
} from 'vitest';
import worker from '../index.js';
import contactUs from '../../contact_us/index.js';
import {
  readOrder, commerceOrder, orderSubmission, handleOrder,
} from '../orders.js';

const CHECKOUT = {
  items: [
    {
      sku: 'flex', path: '/en/products/flex', name: 'Frescopa Flex', quantity: 2, price: '29.00', currency: 'USD',
    },
    {
      sku: 'care-plus', path: '/en/products/care-plus', name: 'Care+', quantity: 1, price: '9', currency: 'USD',
    },
  ],
  customer: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
  address: {
    address1: '1 Main St', city: 'San Francisco', state: 'ca', zip: '94105',
  },
};

const ORDER = {
  id: '2026-11-23T19-50-16.711Z-FE3WMRTE',
  friendlyId: 'FE3WMRTE',
  createdAt: '2026-11-23T19:50:16.711Z',
  customer: CHECKOUT.customer,
  shipping: {
    address1: '1 Main St', city: 'San Francisco', state: 'CA', zip: '94105',
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function post(body, headers = {}, url = 'https://demo.bbird.live/orders') {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', origin: 'https://main--acme--scdemos.aem.live', referer: 'https://main--acme--scdemos.aem.live/en/cart', ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** fetch double for Edge Commerce: answers with `commerce`; records calls. */
function fakeFetch(commerce = json({ order: ORDER })) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (commerce instanceof Error) throw commerce;
    return commerce.clone();
  };
  fn.calls = calls;
  return fn;
}

/** The CONTACT_US service binding: the real contact-us worker with a fake Slack webhook. */
function contactBinding(slackStatus = 200) {
  const posts = [];
  const binding = {
    async fetch(url, init) {
      const real = globalThis.fetch;
      globalThis.fetch = async (hook, req) => { posts.push(JSON.parse(req.body).text); return new Response('', { status: slackStatus }); };
      try {
        return await contactUs.fetch(new Request(url, init), { SLACK_WEBHOOK_URL: 'https://hooks.slack.test/x' });
      } finally {
        globalThis.fetch = real;
      }
    },
  };
  binding.posts = posts;
  return binding;
}

describe('readOrder', () => {
  it('accepts a valid checkout and normalizes it', () => {
    const { items, address } = readOrder(CHECKOUT);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ sku: 'care-plus', quantity: 1, price: '9' });
    expect(address.state).toBe('CA');
  });

  it.each([
    ['no items', { ...CHECKOUT, items: [] }],
    ['a path outside the catalog', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], path: '/en/offers/x' }] }],
    ['a zero quantity', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], quantity: 0 }] }],
    ['too many of one item', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], quantity: 11 }] }],
    ['a fractional quantity', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], quantity: 1.5 }] }],
    ['a free item', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], price: '0.00' }] }],
    ['a malformed price', { ...CHECKOUT, items: [{ ...CHECKOUT.items[0], price: '$29' }] }],
    ['the same sku twice', { ...CHECKOUT, items: [CHECKOUT.items[0], CHECKOUT.items[0]] }],
    ['mixed currencies', { ...CHECKOUT, items: [CHECKOUT.items[0], { ...CHECKOUT.items[1], currency: 'EUR' }] }],
  ])('rejects %s', (name, body) => {
    expect(() => readOrder(body)).toThrow('invalid_items');
  });

  it('names the customer fields that are missing or invalid', () => {
    try {
      readOrder({ ...CHECKOUT, customer: { ...CHECKOUT.customer, email: 'nope' }, address: { ...CHECKOUT.address, zip: '9410' } });
      expect.unreachable();
    } catch (e) {
      expect(e.message).toBe('invalid_customer');
      expect(e.extra.fields).toEqual(['email', 'zip']);
    }
  });
});

describe('commerceOrder', () => {
  it('builds a guest order with catalog-format prices and the ordering site', () => {
    const order = commerceOrder(readOrder(CHECKOUT), 'main--acme--scdemos.aem.live');
    expect(order.shipping).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com', country: 'US' });
    expect(order.items[1].price).toEqual({ final: '9.00', currency: 'USD' });
    expect(order.custom).toEqual({ site: 'main--acme--scdemos.aem.live' });
  });
});

describe('orderSubmission', () => {
  it('turns the order into contact-us fields', () => {
    const fields = orderSubmission({ ...ORDER, shipping: { ...ORDER.shipping } }, readOrder(CHECKOUT));
    expect(fields).toEqual({
      _form: 'New order FE3WMRTE',
      order: 'FE3WMRTE',
      customer: 'Jane Doe',
      email: 'jane@example.com',
      address: '1 Main St, San Francisco, CA 94105',
      items: '2 × Frescopa Flex ($58.00); 1 × Care+ ($9.00)',
      total: '$67.00',
    });
  });
});

describe('handleOrder', () => {
  let env;
  beforeEach(() => { env = { CONTACT_US: contactBinding() }; });

  it('creates the order in the main demo catalog, then posts it to Slack through contact-us', async () => {
    const fetchImpl = fakeFetch();
    const { status, body } = await handleOrder(post(CHECKOUT), env, fetchImpl);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true, delivered: true, order: { id: 'FE3WMRTE', total: '67.00', currency: 'USD' },
    });
    expect(fetchImpl.calls[0].url).toBe('https://api.adobecommerce.live/scdemos/sites/demo/orders');
    expect(fetchImpl.calls[0].body.custom.site).toBe('main--acme--scdemos.aem.live');
    const [text] = env.CONTACT_US.posts;
    expect(text).toContain('*New order FE3WMRTE* submission');
    expect(text).toContain('From: <https://main--acme--scdemos.aem.live/en/cart>');
    expect(text).toContain('*Total:* $67.00');
  });

  it('reports a changed price with the catalog price, and posts nothing to Slack', async () => {
    const fetchImpl = fakeFetch(json({
      code: 'ADOBE_COMMERCE_CONSISTENCY_MISMATCH', details: { field: 'price', sku: 'flex', actualPrice: { final: '31.00' } },
    }, 400));
    const { status, body } = await handleOrder(post(CHECKOUT), env, fetchImpl);
    expect(status).toBe(409);
    expect(body).toEqual({
      ok: false, error: 'price_changed', sku: 'flex', price: '31.00',
    });
    expect(env.CONTACT_US.posts).toHaveLength(0);
  });

  it('maps other rejections and outages without leaking their details', async () => {
    let res = await handleOrder(post(CHECKOUT), env, fakeFetch(json({ code: 'ADOBE_COMMERCE_REFERENCED_NOT_FOUND' }, 400)));
    expect(res).toEqual({ status: 400, body: { ok: false, error: 'invalid_order' } });
    res = await handleOrder(post(CHECKOUT), env, fakeFetch(json({}, 503)));
    expect(res).toEqual({ status: 502, body: { ok: false, error: 'order_failed' } });
    res = await handleOrder(post(CHECKOUT), env, fakeFetch(new Error('network')));
    expect(res).toEqual({ status: 502, body: { ok: false, error: 'order_failed' } });
  });

  it('still confirms the order when Slack, contact-us or the binding is missing or down', async () => {
    const slackDown = { CONTACT_US: contactBinding(500) };
    expect((await handleOrder(post(CHECKOUT), slackDown, fakeFetch())).body).toMatchObject({ ok: true, delivered: false });
    const broken = { CONTACT_US: { fetch: async () => { throw new Error('down'); } } };
    expect((await handleOrder(post(CHECKOUT), broken, fakeFetch())).body).toMatchObject({ ok: true, delivered: false });
    expect((await handleOrder(post(CHECKOUT), {}, fakeFetch())).body).toMatchObject({ ok: true, delivered: false });
  });

  it('does nothing for dry runs, honeypots and bad bodies', async () => {
    const fetchImpl = fakeFetch();
    expect((await handleOrder(post(CHECKOUT, { 'x-dry-run': '1' }), env, fetchImpl)).body).toEqual({ ok: true, dryRun: true, items: 2 });
    expect((await handleOrder(post({ ...CHECKOUT, _gotcha: 'x' }), env, fetchImpl)).body).toEqual({ ok: true });
    expect((await handleOrder(post('{nope'), env, fetchImpl)).status).toBe(400);
    expect((await handleOrder(post({ ...CHECKOUT, pad: 'x'.repeat(25000) }), env, fetchImpl)).status).toBe(413);
    expect(fetchImpl.calls).toHaveLength(0);
    expect(env.CONTACT_US.posts).toHaveLength(0);
  });

  it('stops reading a body without a length as soon as it is too large', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(8 * 1024).fill(32);
    const body = new ReadableStream({
      pull(controller) {
        pulled += 1;
        if (pulled > 4096) controller.close(); // 32 MiB if read to the end
        else controller.enqueue(chunk);
      },
    });
    const request = new Request('https://demo.bbird.live/orders', {
      method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json', origin: 'https://demo.bbird.live' },
    });
    const res = await handleOrder(request, env, fakeFetch());
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });
});

describe('abuse guards', () => {
  const env = {};
  it('takes orders only from demo pages', async () => {
    for (const origin of ['https://attacker.example', 'https://main--demo--evil.aem.live', 'https://scdemos.aem.live.evil.com', '']) {
      expect((await handleOrder(post(CHECKOUT, { origin }), env, fakeFetch())).status).toBe(403);
    }
    for (const origin of ['https://main--demo--scdemos.aem.page', 'https://feat-x--acme--scdemos.aem.live', 'https://demo.bbird.live', 'http://localhost:3000']) {
      expect((await handleOrder(post(CHECKOUT, { origin, 'x-dry-run': '1' }), env, fakeFetch())).status).toBe(200);
    }
  });

  it('takes JSON only', async () => {
    const res = await handleOrder(post(CHECKOUT, { 'content-type': 'text/plain' }), env, fakeFetch());
    expect(res).toEqual({ status: 415, body: { ok: false, error: 'unsupported' } });
  });

  it('limits orders per visitor', async () => {
    const fetchImpl = fakeFetch();
    const keys = [];
    const limited = { ORDER_LIMIT: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } };
    const res = await handleOrder(post(CHECKOUT, { 'cf-connecting-ip': '203.0.113.9' }), limited, fetchImpl);
    expect(res).toEqual({ status: 429, body: { ok: false, error: 'too_many_orders' } });
    expect(keys).toEqual(['203.0.113.9']);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe('worker routing', () => {
  it('serves POST /orders only', async () => {
    const dry = await worker.fetch(post(CHECKOUT, { 'x-dry-run': '1' }), {});
    expect(await dry.json()).toEqual({ ok: true, dryRun: true, items: 2 });
    expect(dry.headers.get('access-control-allow-origin')).toBe('https://main--acme--scdemos.aem.live');
    expect((await worker.fetch(new Request('https://demo.bbird.live/orders'), {})).status).toBe(405);
    expect((await worker.fetch(post(CHECKOUT, {}, 'https://demo.bbird.live/other'), {})).status).toBe(404);
    const pre = await worker.fetch(new Request('https://demo.bbird.live/orders', { method: 'OPTIONS', headers: { origin: 'https://x.aem.page' } }), {});
    expect(pre.status).toBe(204);
  });
});
