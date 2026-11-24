// Edge Commerce (Product Bus) route.
//   GET  /products/<org>/<site>/<path>/index.json → the site's product index from aem.network, with CORS, for
//        hosts Edge Commerce doesn't serve (aem.page, aem.live, DA previews, the Frescopa app). Public, read-only.
// Products themselves are managed in Edge Commerce; nothing here writes to it.

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INDEX_RE = /^(\/[a-z0-9-]+)+\/index\.json$/;

const orgOf = (env) => env.ORG || 'scdemos';
const networkOrigin = (org, site) => `https://main--${site}--${org}.aem.network`;

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
