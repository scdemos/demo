# Orders Worker

Cloudflare Worker behind the cart's checkout on every demo site (`/en/cart`, `scripts/cart.js`).
It places the order as a guest order in the **main demo's** Edge Commerce catalog
(`scdemos/demo`), which every demo, CloneIt demos included, sells from, then posts the
confirmed order to Slack through the contact-us worker (service binding `CONTACT_US` to
`demo-bbird-contactus`), which already holds the Slack webhook. No secrets of its own.

## Endpoint

`POST https://demo.bbird.live/orders` (JSON):

```json
{
  "items": [{ "sku": "flex", "path": "/en/products/flex", "name": "Frescopa Flex", "quantity": 1, "price": "29.00", "currency": "USD" }],
  "customer": { "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com" },
  "address": { "address1": "1 Main St", "city": "San Francisco", "state": "CA", "zip": "94105" }
}
```

- `200 {"ok":true,"delivered":<bool>,"order":{"id","createdAt","total","currency","items"}}`.
  `delivered` says whether Slack got it. An order never fails because Slack is down; it's always
  in the worker logs (`npm run tail:orders`, and the contact-us worker's).
- `400 invalid_order | invalid_items | invalid_customer {"fields":[…]}`: the body is invalid.
- `409 price_changed {"sku","price"}`: the catalog price differs; the cart updates and the shopper
  places the order again. Edge Commerce checks every price, so Slack only ever shows real orders.
- `403 forbidden`: the page isn't a demo site (`*--*--scdemos.aem.page|live|network`,
  `demo.bbird.live`, `localhost`). `415 unsupported`: the body isn't `application/json`, which
  browsers preflight, so other sites can't post orders silently.
- `429 too_many_orders`: more than 5 orders a minute from one visitor (`ORDER_LIMIT` binding).
- `413 too_large`, `502 order_failed` (Edge Commerce unreachable or failing).
- `x-dry-run: 1` header: validate only, create no order and post nothing. Use it for every
  automated or QA check; the channel is live.
- `_gotcha` (honeypot): when filled, `200 {"ok":true}` and nothing happens.

Limits: up to 20 lines, 1–10 of each, prices above 0 (free items need a grant in Edge Commerce),
one currency, US addresses. Products are digital services, so no shipping method is selected.

## Setup

Nothing beyond deploying: deploy `contact_us` first (it owns `SLACK_WEBHOOK_URL`), then this worker.

## Test, run, deploy

From the project root:

```bash
(cd workers/orders && npm ci && npm test)
npm run dev:orders
npm run deploy:orders
```
