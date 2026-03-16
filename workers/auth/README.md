# Auth Test Worker

Lightweight Cloudflare Worker to drive login/logout/session state for the header auth button.

## Endpoints

- `GET /auth/login?returnTo=<url-or-path>` -> triggers Access and redirects to `returnTo`
- `GET /auth/logout` -> logs out via app domain `/cdn-cgi/access/logout` (logout success page)
- `GET /auth/session` -> returns `{ authenticated, email, hasJwtAssertion }`

## Setup

1. Make sure your Cloudflare Access application protects the same hostname and `/auth/*` path.
2. Use the configured worker name in `wrangler.toml` (`demo-bbird-auth`) or change it.
3. Deploy from the project root:

```bash
npm install
npm run deploy:auth
```

## Local dev

```bash
npm run dev:auth
```

## Test flow

1. Open an incognito window.
2. Visit the login endpoint, for example:

```text
https://demo-bbird-auth.aem-poc-lab.workers.dev/auth/login?returnTo=http://localhost:3000/
```

3. Enter an allowed email address on the Access screen.
4. Enter the one-time PIN.
5. Confirm your site loads and `/auth/session` shows `authenticated: true`.

## Logout

Visit:

```text
https://demo-bbird-auth.aem-poc-lab.workers.dev/auth/logout
```

## Site integration

Header auth URLs are centralized in:

`scripts/shared/auth-api.js`

Update `AUTH_ORIGIN` there if your worker hostname changes.

Logout uses app-domain endpoint: `https://demo-bbird-auth.aem-poc-lab.workers.dev/cdn-cgi/access/logout`
without additional redirect parameters for demo simplicity.
