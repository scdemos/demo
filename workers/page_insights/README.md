# Page insights worker

Analytics for one page of the site, for the Page insights DA app (`tools/page-insights`). Authors open a
page in the app and see how it performs: views and visitors against the period before, conversions,
daily views, which buttons visitors clicked in which block, and where they came from. A live panel
shows the last 30 minutes on the whole site.

- `POST /page-insights/page` `{ "path": "/en/products/duo", "days": 7 }` (7 or 28)
- `POST /page-insights/live`

Callers send their DA token (the app gets it from the DA SDK). The worker accepts DA tokens only
(`IMS_CLIENT_IDS`) and checks that the token can list `SITE` in DA, so only the site's authors get data.
Reports are aggregates; nothing about a single visitor is read or returned. Page reports are cached for
5 minutes, the live view for 10 seconds.

## Sources

Every analytics source is a provider in `PROVIDERS` (`index.js`) with the same shape:

```js
{ id, label, configured(env), page(env, { path, days }, fetch), live(env, fetch) }
```

The response has one entry per source (`status`: `ok`, `not_configured` or `error`), and the app
shows one section per source. `page()` returns `summary`, `conversions`, `trend`, `ctas` and
`channels`, each `{ value }` or `{ error }`, so one failing section doesn't hide the others.

Today: Google Analytics 4 (`ga4.js`). A second source, such as Adobe Analytics, is a new provider
file returning the same shape, added to `PROVIDERS`.

## Set up Google Analytics 4

1. In a Google Cloud project, enable the **Google Analytics Data API** and create a service account.
   Create a JSON key for it.
2. In Google Analytics, Admin > Property access management: add the service account's email as
   **Viewer**.
3. In Google Analytics, Admin > Custom definitions: create event-scoped custom dimensions for the
   event parameters `block_name` and `link_text` (for "What visitors clicked").
4. Put the property ID (Admin > Property details, a number) in `GA4_PROPERTY_ID` in `wrangler.toml`.
5. Store the key and deploy:

```sh
npx wrangler secret put GA4_SERVICE_ACCOUNT --config workers/page_insights/wrangler.toml   # paste the JSON key
npx wrangler deploy --config workers/page_insights/wrangler.toml
```

## Test

```sh
cd workers/page_insights && npm ci && npm test
```
