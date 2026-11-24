# Contact Us Worker

Cloudflare Worker that accepts contact form POSTs and forwards them to a Slack
incoming webhook.

## Endpoint behavior

Generic: any form on any demo site can post to `https://demo.bbird.live/contact-us/` with
any field names. No per-form configuration is needed.

- `OPTIONS` -> CORS preflight (`204`, reflects the request origin and headers)
- `GET` -> health check (`200` JSON)
- `POST` -> forwards every non-empty field to the Slack webhook, with the submitting page
- other methods -> `405`

Accepted bodies:

| Content type | Shape |
|---|---|
| `application/json` | `{ "data": { ...fields } }` (form block), `{ "fields": {...} }`, flat `{ ...fields }`, or `[{ "name", "value" }]` pairs |
| `text/plain` / none | the same JSON (sendBeacon, `no-cors` fetch) |
| `application/x-www-form-urlencoded` | plain HTML forms; repeated keys (checkbox groups) are joined |
| `multipart/form-data` | as above; files are reported by name, type and size (not stored) |

Values: strings, numbers, booleans, arrays (joined with `, `) and nested objects (flattened to
`parent.child`). Values are trimmed and capped (50 fields, 2000 characters each, 100 KB body).

Ignored: empty values; `submit`, `reset`, `button`; captcha tokens (`g-recaptcha-response`,
`h-captcha-response`, `cf-turnstile-response`).

Meta fields (prefix `_`, never shown as data):
- `_form` / `_subject`: the Slack message title (default "Contact form").
- `_redirect` / `_next`: for no-JS HTML posts (`Accept: text/html`), a `303` to this same-site
  URL. Without it, the post redirects back to the referring page. Off-site targets are refused.
- `_dryrun: true` (or the `x-dry-run: 1` header): validate and return `200 {"dryRun":true}` **without posting to Slack**. Use it for every automated or QA submission; the channel is live.
- `_gotcha` / `_honeypot`: honeypot. When filled, the response is `200` and nothing is sent.

Responses: `200 {"ok":true,"delivered":<bool>,"fields":<n>}`. A demo never fails because Slack
is down or the secret is missing: `delivered` is `false`, and the submission is in the worker
logs (`npm run tail:contact-us`). Errors: `400` (no non-empty fields, or an unreadable body),
`413` (too large).

## Required secret

```bash
wrangler secret put SLACK_WEBHOOK_URL --config ./workers/contact_us/wrangler.toml
```

## Local dev

From project root (where `package.json` lives):

```bash
npm install
npm run dev:contact-us
```

## Deploy

From project root:

```bash
npm run deploy:contact-us
```
