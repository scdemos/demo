# CDN worker

Proxies to `ORIGIN_HOSTNAME` and may rewrite HTML for gated pages (`handlers/gating.js`).

**Auth (delivery):** `handlers/auth-check.js` — signed in if **`Cf-Access-*`** headers are set, or if the **`CF_Authorization`** cookie contains a valid Access JWT.

**Dependencies:** `cheerio` is installed under `workers/cdn/` (not the repo root). `npm run deploy:cdn` runs `npm install --prefix ./workers/cdn` first so Wrangler can bundle it.

**Deploy:** `npm run deploy:cdn`

**Auth worker** (`/auth/*`) is separate — route **`demo.bbird.live/auth/*`** should stay **more specific** than **`demo.bbird.live/*`** if both are on the same zone.

**Skips gating:** `/fragments/`, `/nav.plain.html`, `/footer.plain.html`

**Gated responses:** `Cache-Control: private, no-cache, must-revalidate`, `Vary: Cookie` (when the gated meta is present and the body changes).

**Optional:** `ORIGIN_AUTHENTICATION` in `[vars]` for Helix token auth to origin.
