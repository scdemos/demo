# Base state inventory (P2: the template copies code, not state)

A repo created from the `scdemos/demo` template gets the **code**. Everything below is
**per-site state** that the base relies on and the new site does **not** get. Walk every row
in phase 1d-2, and again in the final sweep (10a). For each row: **copy**, **recreate** or
**skip on purpose** (and write the reason in the report). `scripts/doctor.mjs` checks the
rows marked 🩺.

Write the site config **one key at a time** (GET → change one key → POST), so a rejected key doesn't block the others. Admin API calls run in the signed-in da.live tab (`fetch` with the tab's IMS token as
Bearer, like `scripts/browser/site-tab.js`), or headless with `DA_TOKEN`. Read the base with `GET /config/scdemos/sites/demo.json`, read the
site with `GET /config/scdemos/sites/<slug>.json`, merge, then
`POST /config/scdemos/sites/<slug>.json` (the full object, `content-type: application/json`).
Never print or copy secrets (`apiKeys`, `cdn.*.apiToken`).

| # | State | Where it lives | Action for a new demo | Verify | 🩺 |
|---|---|---|---|---|---|
| S1 | Code sync complete | Code Sync / code bus | If the repo existed before Code Sync was installed: `POST /code/scdemos/<slug>/main/*` | `/scripts/aem.js` and `/styles/styles.css` return 200 | 🩺 |
| S2 | Site roles | site config `access.admin.role` | Add `*@adobe.com` to `author` and `publish`; keep the installer as `admin`; add the SC's Adobe email as `admin` (the Code Sync installer is often a personal account, so the SC's Adobe login can't change config otherwise) | `GET` the site config shows the roles; the SC can publish | 🩺 |
| S3 | Query index definition | `/config/.../sites/<site>/content/query.yaml` | Copy the base's yaml. Add content excludes: `**/fragments/**`, `**/forms/**`, `**/tools/**`, `**/docs/**`, `**/drafts/**`, `/experiments/**`, `/nav`, `/footer`, `/metadata`, `/search`, `/*-thanks` | `GET` returns 200 | 🩺 |
| S4 | Query index data | `/query-index.json` | Built **on publish only**, for pages published after S3 exists. Republish the content pages at the end of phase 7. Remove strays with `DELETE /index/scdemos/<slug>/main/<path>` | 200, only content paths, ≥ the number of pages in scope | 🩺 |
| S5 | Search page | DA `/search` | Create it with a `search` block (`view: list`, `excluded-keywords: noindex`, `searchbar: enabled`) and metadata `Robots: noindex`, `Keywords: noindex` | `/search?q=<customer term>` lists results | 🩺 |
| S6 | Response headers | site config `headers` | Copy as is (CORS `*` on `/**`) | Config shows `headers` | 🩺 |
| S7 | robots.txt | site config `robots.txt` | Copy, **rewriting** the `Sitemap:` host to the demo's own `aem.live` origin (or remove the line) | `/robots.txt` doesn't point at the base host | 🩺 |
| S8 | Sidekick | site config `sidekick` | Copy plugins and `editUrlPattern`; set `project` to the customer name | Config `sidekick.project` = customer name | 🩺 |
| S9 | Public config | site config `public` | Copy, **rewriting** base-bound values: `mixerConfig.backends.*.pathPrefix` → `/scdemos/<slug>/main/`, `adobe_edge.origin` → `https://main--<slug>--scdemos.aem.live`. **Drop** `paths`/`xwalk` mappings that point at another program's DAM (e.g. `/content/dam/cashub/...`) unless the demo uses them | No `scdemos/demo` or `cashub` strings left in `public` | 🩺 |
| S10 | Features | site config `features` | **Platform-controlled**: site admins get `403 not allowed to modify features`. Skip it; ask the AEM team only if the demo needs a feature flag the base has (e.g. `rendering.version`) | Reported as WARN, not FAIL | 🩺 |
| S11 | CDN, API keys, extra access | site config `cdn`, `apiKeys`, `access.*` beyond roles | **Never copy.** They are base-specific (custom host, tokens). Ask the SC if the demo needs a custom domain | n/a | |
| S12 | DA site config (all sheets) + library | `https://da.live/config#/scdemos/<slug>/` (`admin.da.live/config/scdemos/<slug>`) + DA `docs/library/*` | Migrate **every** sheet of the base DA config (`data`, `library`, `apps`, `skills`, `mcp-servers`, `prompts`, `flags`, `prepare`, `publish-workflow-*`, …) with `DA_TOKEN=… node scripts/da-config.mjs --slug <slug> --sc-email <SC email>`: it rewrites `scdemos/demo` → `scdemos/<slug>` and the Demo Presenter URL, keeps shared icons, keeps the customer's own rows, and always sets publish approvers to one `/*` rule for the SC, and refuses to write while base references remain. Build the library pages in phase 9b | The config sheet list equals the base's; `baseRefs()` = 0; the Library panel lists blocks, icons, templates and tags | 🩺 |
| S13 | Metadata sheet | DA `/metadata.json` | Recreate it with the customer's decisions (see `base-assumptions.md`) | `color-scheme` and other decided keys are present | 🩺 |
| S14 | Nav, footer, fragments | DA `/nav`, `/footer`, `/fragments/*` | Recreate from the customer site (never copy the base's) | Header and footer render the customer's items | |
| S15 | Icons | repo `/icons` | The base must have every icon committed. Add the customer's icons (logo, rail icons, social) | Every `:icon:` used in nav or pages returns 200 | 🩺 |
| S16 | Forms endpoint | worker `https://demo.bbird.live/contact-us/` (shared) | Nothing to provision. Every form submits there (see SKILL.md "Forms standard") | Dry-run POST returns `dryRun: true` | 🩺 |
| S17 | Secrets / provisioning | GitHub org secrets (`DEMO_PROVISION_TOKEN`) | Org level, once; not per demo | Provisioning workflow succeeds | |
