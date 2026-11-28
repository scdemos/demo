# CDN Worker

BYO CDN proxy for AEM Edge Delivery. [Cloudflare setup guide](https://www.aem.live/docs/byo-cdn-cloudflare-worker-setup).

Worker code is based on [aem-cloudflare-prod-worker](https://github.com/adobe/aem-cloudflare-prod-worker).

## Variables

| Name | Value |
|------|--------|
| `ORIGIN_HOSTNAME` | `main--demo--scdemos.aem.network` |
| `PUSH_INVALIDATION` | `enabled` |
| `GATED_CACHE_PATHS` | empty (optional: exact paths of gated pages to edge-cache for visitors) |
| `EDGE_OPTIMIZE_API_KEY` | secret, optional: turns on [Optimize at Edge](#optimize-at-edge-ai-agents) routing |

## Auth-aware sections

`handlers/gating.js` rewrites HTML for pages marked `<meta name="gated" content="true">`, dropping
sections/blocks the visitor's audience can't see. Mirrors the author-preview logic in
`scripts/utils/gated-content.js`.

Block variants must match `logged-in` or `logged-out` exactly. Both variants, or neither, allow
either audience. Removing a section or block removes everything inside it. Blocks inside a section
the worker keeps still follow their own audience rules.

**Auth:** `handlers/auth-check.js` verifies the HMAC signature and expiry of the
`bbird_demo_session` cookie created by the demo login worker. Its signing key is intentionally
public, so it must not protect confidential content. The worker removes this cookie before
forwarding requests to the origin.

**Skips gating:** `/fragments/`, `/nav.plain.html`, `/footer.plain.html`, and `.plain.html`, `.md`
and `.json` responses. The origin and downloads are also outside this filter.

## Caching

**Cache selection:** For paths listed in `GATED_CACHE_PATHS`, the default entrypoint checks the
session before calling the cached `Anonymous` entrypoint. Valid sessions and requests with
`Authorization` bypass it. Anonymous requests have no cookies, so analytics cookies don't split
the cache. The cache key uses the scheme, host and path. Other paths keep their cookie handling.

**Gated responses:** Cloudflare's managed Workers Cache stores filtered anonymous HTML for up to
60 seconds, or less if the origin's remaining cache lifetime is shorter.

- Browsers get `Cache-Control: no-cache` and `Vary: Accept, Cookie` to recheck after login or logout.
- Cloudflare gets `Cloudflare-CDN-Cache-Control: public, max-age=<ttl>, must-revalidate`.
- Signed-in responses get `Cache-Control: private, no-store`.

Anonymous HTML is also private and uncacheable if the origin sends `Set-Cookie`, `Vary: *`,
`private`, `no-cache` or `no-store`, or has no valid cache lifetime left. The `Anonymous` entrypoint
doesn't cache ungated pages or errors.

Rewritten responses replace origin cache headers and drop validators, range, length and encoding
headers. The origin cache can still store the full source.

**Invalidation:** AEM push invalidation clears Cloudflare's zone cache, not Workers Cache. Published
changes, deletions and audience changes can take up to 60 seconds to appear. Expired responses aren't
served. Code deployments start with a new cache.

## Optimize at Edge (AI agents)

`handlers/edge-optimize.js` sends AI agents (ChatGPT, Perplexity, Claude and Adobe's own agent)
asking for a page to [Optimize at Edge](https://experienceleague.adobe.com/en/docs/brand-visibility/using/resources/optimize-at-edge/cloudflare-byocdn)
(`live.edgeoptimize.net`), which serves the optimizations deployed in Adobe Brand Visibility.
It is the manual setup from that guide, merged into this worker: Brand Visibility's guided setup
can't add its own worker, because this one already owns `demo.bbird.live/*`.

- **Who:** GET and HEAD requests for pages (paths ending in `/` or `.html`, or without an
  extension) whose user agent names one of the agents. People, SEO bots, assets, JSON and
  `/drafts/` are served as before.
- **Loop:** Edge Optimize fetches the page back through this worker with `x-edgeoptimize-request`;
  those requests go to the origin.
- **Failover:** if Edge Optimize fails or returns 4xx/5xx, the page comes from the origin with
  `x-edgeoptimize-fo: 1`.
- **Privacy:** cookies, `Authorization` and incoming `x-edgeoptimize-*` headers are removed
  before the request goes to Edge Optimize.
- **Gating:** optimized pages go through the same audience gating as an anonymous visitor's, so
  agents never get member-only sections, even with a session cookie.
- **Switch:** nothing is routed until the `EDGE_OPTIMIZE_API_KEY` secret is set (the API key from
  Brand Visibility). Set it once; deploys keep it. Delete it to switch routing off.

```bash
npx wrangler secret put EDGE_OPTIMIZE_API_KEY --config ./workers/cdn/wrangler.toml
# check: an agent gets x-edgeoptimize-request-id, a browser doesn't
curl -svo /dev/null https://demo.bbird.live/en/booking -H 'user-agent: chatgpt-user' 2>&1 | grep -i x-edgeoptimize
curl -svo /dev/null https://demo.bbird.live/en/booking 2>&1 | grep -i x-edgeoptimize
```

## Partial and conditional requests

A `206`, `304` or `HEAD` response may lack the metadata needed to check gating. If it could be HTML,
the worker fetches the full response without range or conditional headers before filtering it.
Normal HTML GETs need one fetch; this check can need another.

- Gated GETs return full, filtered `200` responses. HEADs use the same cache policy, with no body.
- Ungated pages keep the original response and headers.
- If the full response isn't HTML, keep the original unless the original is HTML.
- Failed checks or conflicting content types return an uncacheable `502`. HEAD errors have no body.

## Local dev

**Dependencies:** `cheerio` is installed under `workers/cdn/` (not the repo root), and
`compatibility_flags = ["nodejs_compat"]` in `wrangler.toml` is required for it to bundle and run.
This cache setup needs Wrangler 4.107.0 or newer; CI uses 4.131.2 and installs dependencies automatically.

```bash
npm install --prefix ./workers/cdn
npx wrangler dev --config ./workers/cdn/wrangler.toml
```

## Tests

```bash
npm ci --prefix ./workers/cdn
npm test --prefix ./workers/cdn
npm ci --prefix ./test
npm test --prefix ./test
```

The CDN and author-preview tests share audience fixtures. Cache tests use a local mock; checking
Cloudflare's cache needs a deployed Worker. See [local smoke tests](../../test/gating-local/README.md)
for workerd and browser checks.

## Deploy

```bash
npm install --prefix ./workers/cdn
npx wrangler deploy --config ./workers/cdn/wrangler.toml
```

Or push to `main`. The `deploy-cdn` GitHub Action deploys when CDN JavaScript/configuration or
`workers/shared/**/*.js` changes. A feature-branch push does not deploy the production worker.
