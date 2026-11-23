/*
 * Orders worker for demo sites: POST /orders places a cart checkout as a guest order in the main
 * demo's Edge Commerce and posts the confirmed order to Slack (orders.js). Every demo, CloneIt demos
 * included, orders from that one catalog. See README.md.
 */
import { handleOrder } from './orders.js';

function cors(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, x-dry-run',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (new URL(request.url).pathname.replace(/\/$/, '') !== '/orders') return json(request, 404, { ok: false, error: 'not_found' });
    if (request.method !== 'POST') return json(request, 405, { ok: false, error: 'method_not_allowed' });
    const { status, body } = await handleOrder(request, env);
    return json(request, status, body);
  },
};
