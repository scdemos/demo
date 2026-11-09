---
name: customer-demo
description: Turn the scdemos/demo base site into a fully baked, customer-branded AEM Edge Delivery demo from just a customer URL or domain. Creates scdemos/<slug> in GitHub + DA, applies the brand, maps pages onto the base block library, imports content, bakes in demo features and QA-checks against the original. Use whenever someone says "demo <domain>", "demo for <customer>", "create a demo for <url>", "customer demo", "make a demo like <url>", or runs /customer-demo. A bare domain such as "manulifeim.com/institutional/tw/en" is enough.
---

# Customer Demo Factory

You turn **one customer URL** into a working, customer-relevant demo site built on the
`scdemos/demo` base. The solution consultant (SC) should have to do **one thing**: run
`/customer-demo <url>`. Everything else is your job: repo (through the self-service
provisioning issue), Code Sync, DA, brand, content, features and QA. Do not stop to ask
questions that you can answer yourself.

The base already ships the block library, section styles, experimentation/audiences/campaigns,
martech, dark mode, sidekick plugins, CloneIt, the demo walkthrough, and preflight checks.
**You reskin and refill it.** You do not rebuild it.

## Inputs: the URL is the only one

The SC provides **only the customer URL**, in any form: `https://www.x.com/a/b`,
`www.x.com/a/b`, `x.com/a/b`, or the bare domain `x.com`. Normalize it to `https://` and
follow redirects. Ignore extra words such as "demo", "for", "please" or "create". Derive everything else yourself and do **not**
ask, unless the SC passed a `slug=` override in the prompt.

**Everything lives in the `scdemos` space**, next to the base (`scdemos/demo`). This keeps
every customer demo in one place for tracking, observability and accounting. Never create
a demo in a personal account or in another org.

| Value | How to derive it | Example (manulifeim.com/institutional/tw/en) |
|---|---|---|
| `slug` | Registrable domain without TLD or `www`, lowercase `[a-z0-9]`, max 20 chars. Add a short path hint when the URL is a sub-site. If `scdemos/<slug>` already exists in GitHub **or** DA, append `2`, `3`, … | `manulifeim` |
| GitHub repo | Always `scdemos/<slug>` | `github.com/scdemos/manulifeim` |
| DA site | Always `scdemos/<slug>`, the same name as the repo, so the Config Service maps code → content automatically | `da.live/#/scdemos/manulifeim` |
| Preview | `https://main--<slug>--scdemos.aem.page/` | |
| Page scope | Home + top nav pages, one per template, **max 8** | |
| Locale | From the URL path | `en` |
| Customer name | From `og:site_name`, otherwise the `<title>` brand, otherwise the domain | `Manulife Investment Management` |

Announce the derived values in **one line**, then continue without waiting.

## Reference files

- `references/demo-manifest.json`: the blocks, variants, section styles, brand slots and
  features the base provides. **Read it before mapping anything.**
- `scripts/preflight.mjs`: checks the customer site, the destination repo, Code Sync and DA.

## Pipeline

Track each phase as a todo. Run the phases in order. Keep going until the handoff, unless you hit a ⛔ blocker.

### 0. Environment check

Do these checks silently, and only report failures:
- **DA MCP**: run `da_list_sources(org: "scdemos", repo: "demo")`. If it fails, have the SC
  sign in to da.live, then use the `da-auth` skill.
- **GitHub MCP**: run `get_me`. If it fails, have the SC sign in to GitHub in Copilot or
  Claude (`.vscode/mcp.json` / `.mcp.json` already declare the server).
- **git**: there must be a local `git` that can push to github.com. Check with
  `git ls-remote https://github.com/scdemos/demo`.
- **EMA MCP**: optional. It is only used as a scraping fallback.

### 1. Provision in scdemos (repo → Code Sync → DA → content)

SCs are **not** org admins, so the agent never creates the repo directly. Provisioning
goes through the self-service workflow in `scdemos/demo`
(`.github/workflows/provision-demo.yaml`). A bot with org-admin rights:
- creates the repo
- seeds it with the base code
- adds it to AEM Code Sync
- gives the SC `maintain` access

Each request is a GitHub issue, so the issue list is the audit log for every demo
(observability and accounting). **No SC action is needed.**

#### 1a. Request the repo (zero-touch)
- Open the issue with GitHub MCP `issue_write` (method `create`) on `scdemos/demo`:
  - title: `new-demo: <slug>`
  - body: `<customer url>` on the first line, then `Customer: <Customer name>`
  - labels: `["demo-request"]`
- Do **1d, 2 and 3** while you wait. None of them need the repo. Phase 4 (brand) starts in
  the local clone from 1c.

#### 1b. Wait for provisioning
- Every ~20 s, read the issue comments with `issue_read` (method `get_comments`). Stop after 10 min.
  - `provisioned ✅`: read the comment. It lists the repo, preview and DA URLs and the Code
    Sync status. Continue.
  - `⛔ … already exists`: choose the next slug suffix, then open a new issue.
  - `⛔ … secret is not configured` or `⛔ … not a member`: this is a setup problem, not
    something the SC can fix. Fall back to **1e**.
  - Any other `⛔`: report the run link in one line, then fall back to **1e**.
- If the comment says `⚠️ AEM Code Sync`, the bot couldn't add the repo to the app. Open
  https://github.com/apps/aem-code-sync/installations/new for the SC with
  `openBrowserPage`, with a one-line instruction: **scdemos → Only select repositories →
  add `<slug>` → Save**.
- Start the background poll so you know when aem.page serves the code:
  ```bash
  node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo scdemos/<slug> --da scdemos/<slug> --wait 900
  ```

#### 1c. Clone locally and start the dev server (the SC watches here)
As soon as the repo exists, clone it **next to the SC's workspace** so they can see and
test the work. Never use a hidden temp dir.
```bash
git clone https://github.com/scdemos/<slug>.git <workspace-parent>/<slug>
cd <workspace-parent>/<slug> && npx -y @adobe/aem-cli up --no-open --forward-browser-logs   # async, keep it running
```
- Tell the SC in one line: "Watch it build at http://localhost:3000. Code is
  `<workspace-parent>/<slug>`."
- `aem up` serves **local code** with content proxied from
  `main--<slug>--scdemos.aem.page`. Every code change in phases 4–6 shows up live at
  localhost before it is pushed.
- Personalize:
  - **Do not add `fstab.yaml`.** Code Sync creates the site config automatically, with
    content at `https://content.da.live/scdemos/<slug>/`. Verified: the config appears
    within seconds of the install.
  - Set `"project"` in `tools/sidekick/config.json`.
  - Set the README Environments section to the `<slug>` URLs.
- Commit and push with the SC's git. If no git credentials are available, use GitHub MCP
  `push_files`.

#### 1c-bis. Make sure the whole code bus is synced
Code Sync only syncs files changed by pushes **after** the install. A repo created from
the template **before** the install has an unsynced initial commit: aem.page then serves
your later CSS edits, but `scripts/*.js` and `blocks/*` return 404 (`x-error: [static:
content] S3: Not Found`). Check:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://main--<slug>--scdemos.aem.page/scripts/aem.js?cb=1"
```
If it returns 404, trigger a full code sync: `POST https://admin.hlx.page/code/scdemos/<slug>/main/*`.
This needs an authenticated admin/develop role. Run it from a browser that is signed in
at `https://admin.hlx.page/login/scdemos/<slug>/main`, or through the provisioning
workflow's token. Provisioning through the issue workflow avoids this, because the bot
adds the repo to Code Sync **before** pushing.

#### Site roles
The Code Sync installer becomes the only `admin` on the new site config. Add the SC's
Adobe email and `*@adobe.com` to `author`/`publish`, through the provisioning workflow or
the admin config API. Otherwise DA preview works, but publish and admin actions may be
denied.

#### 1d. Create the DA site folder
Use the DA MCP. Create the folder by writing its first document:
- `da_create_source(org: "scdemos", repo: "<slug>", path: "index.html", content: <minimal page with an h1 of "<Customer> Demo">)`
- Confirm with `da_list_sources(org: "scdemos", repo: "<slug>")`. The folder is then
  visible at `https://da.live/#/scdemos/<slug>`.
- If DA returns 401/403, that is a ⛔ blocker: the SC needs write access to the `scdemos`
  DA org.

#### 1e. Fallback when the workflow is unavailable
- Try GitHub MCP `create_repository` with `organization: "scdemos"`, name `<slug>`,
  `private: false`, `autoInit: false`. This works only for org admins.
  - On success: seed it from `scdemos/demo` with local git (clone the base, `rm -rf .git`,
    `git init -b main`, commit, push). Then open the Code Sync install page as in 1b.
  - On 403: send **one** message asking an `scdemos` admin to create the empty public repo
    `<slug>`, or to fix the provisioning setup. Include the issue link. Keep doing the
    non-repo phases meanwhile.

#### Access note
The demo uses customer assets. `.aem.page` is not indexed, so in the handoff call the
preview URL unlisted, not protected. If the SC wants authentication, link
https://www.aem.live/docs/authentication-setup-site.

### 2. Seed DA content (write it, don't copy it)

`da_copy_content` **cannot copy between sites**: it returns `{}` and copies nothing.
Don't try to clone the base content. Write fresh documents with `da_create_source`, using
the base pages as the **markup reference** (`da_get_source scdemos/demo index.html` shows
the block table structure):
- `nav.html`: brand `:logo:` link, then the nav list, then `:search:`. Don't add a
  Robots metadata table in nav; it renders in the header.
- `footer.html`, the `metadata.json` sheet (url, robots, currency, locale), and
  `forms/<name>.json` for the forms.
- The base keeps icons in **neither** git nor DA. Commit `icons/logo.svg` and
  `icons/search.svg` to the customer repo.

### Failure policy (phases 0–2)

Talk to the SC before the handoff only when:
- provisioning falls back to 1e and the SC is not an admin
- the bot couldn't add the repo to Code Sync (one click, see 1b)
- DA returns 401/403 for `scdemos/<slug>`
- the Code Sync poll times out

Each time, send **one** message with the exact link or action, then resume automatically.

### 3. Discover

Enterprise sites block bots (manulifeim.com returns 403 to `curl` and to DA's server-side fetch).
**Always use a real browser** (the integrated browser / Playwright page):
1. **Brand**: run one `page.evaluate` that returns computed styles for body, h1–h3, p, a,
   the primary button and the header, the top 18 colors by frequency, `document.fonts`, the
   nav links, the logo and favicon URLs, and hero/section image URLs.
2. **Pages**: in the same page context, `fetch()` each top-nav page's HTML, parse it with
   `DOMParser`, and extract an outline (h1–h3, p, li, img src/alt). AEM-Sites customers
   serve full SSR HTML, so one call covers 8 pages.
3. **Screenshots**: the integrated browser has a **fixed panel viewport** (about 840 px);
   `setViewportSize` is ignored. For 1440/390 px QA, use headless Chromium through
   `playwright-core` (Chromium is already in `~/Library/Caches/ms-playwright`). Scroll the
   whole page first so `will-reveal` sections render.
4. Record the pages in session SQL (`url, template, status`). Dismiss cookie and
   disclaimer modals before taking screenshots.

### 3b. Assets pipeline (bot-protected CDNs)
1. In the customer page context: `fetch(img)` → `createImageBitmap` → `OffscreenCanvas`
   resize (≤1600 px, JPEG q≈0.8) → base64. Batch about 10 images per call.
2. Decode to files, push them to a **temporary branch** `assets` of the (public) customer
   repo, and call `da_upload_media(sourceUrl: raw.githubusercontent.com/scdemos/<slug>/assets/<file>)`.
   Use `sourceUrl`, not `base64Data`, to keep tool payloads small.
3. Delete the branch: `git push origin --delete assets`.
4. Logos are often SVGs with hidden embedded rasters. Prefer the site's header PNG wrapped
   in an `<svg><image href="data:…">` as `icons/logo.svg`.

### 4. Brand (reskin, no rebuild)

Edit **only** the `BRAND TOKENS` block, the font tokens, `--border-radius-heritage`,
`--border-heritage` and `--shadow-glow-*` in `styles/styles.css`. Map the customer's colors
to the brand slots listed in `demo-manifest.json.brandSlots`. Do **not** rename tokens:
- primary → `--color-rust` (and the hover/lighter shade → `--color-rust-bright`)
- accent/highlight → `--color-gold`
- light background → `--color-parchment`; body text → `--color-ink`
- dark background → `--color-obsidian`; dark surface → `--color-card-dark`; muted text → `--color-muted`

Fonts:
- If the customer font is open (Google Fonts or OFL), download the woff2 into `/fonts`, and
  add `@font-face` to `styles/fonts.css`.
- If it is proprietary, pick the closest open font (match x-height, width and weight) and
  write the reason in the handoff.
- Keep a metric-matched fallback so the page has no layout shift (CLS).

Logo and favicon:
- Upload the logo to DA with `da_upload_media` and reference it in `nav`.
- Replace `favicon.ico`.

Also re-check the hard-coded hex values in the files listed in `brandSlots.hardcodedHex`, and
remap the old-brand `rgb()` literals (`brandSlots.rgbLiterals`) mechanically with `sed`.
Then:
- Set `brandSlots.extraTokens`: nav casing, footer logo filter, card radius.
- **Fold** button and heading changes into the existing rules. Don't append an override
  layer; stylelint `no-duplicate-selectors` will fail.
- Remove decorative base effects the customer doesn't use: body gradient blobs, button
  shine, hover lift.
- Proprietary font: pick an open match. Source Sans 3 matched Manulife JH Sans. Download
  the latin woff2 from Google Fonts CSS2 with a Chrome user agent, and add a
  `size-adjust` fallback face.
- Serif-italic emphasis (`h1 em`, `h2 em`) is a common corporate pattern. The base ships
  EB Garamond italic.

Commit the change as `feat: apply <customer> brand tokens`.

### 5. Map: decide the right construct for every customer pattern

**Fidelity first.** Never squeeze a customer pattern into an existing block if the result
looks different from the original. Reuse is the means; matching the customer is the goal.
**Never drop content either**: if the original shows 8 news items, a grid/list toggle, a
carousel with 4 slides or a legal band, the demo shows them too.

For each section of each page, run `identify-page-structure` on the scrape. Then pick the
**lowest level that reproduces the pattern faithfully**:

| Level | Construct | Use when | Examples |
|---|---|---|---|
| 0 | **Default content** | Plain headings, text, lists, buttons, images. No repeating structure. | Intro paragraphs, disclosures, "Stay connected" CTA |
| 1 | **Existing block, as is** | The content model **and** the look match, apart from brand tokens. | `tabs`, `table`, `form`, calculators |
| 2 | **Section style** (`section-metadata` style) | The difference is the section's background, width, spacing or alignment, whatever is inside. | `light`, `ink`, `center`, a new `bordered` band |
| 3 | **CSS-only block variant** | Same authoring table, different visual treatment or layout. | `cards text` / `list` / `stats`, `hero banner` |
| 4 | **Block variant with JS** | Same authoring table, but extra behavior gated on the variant class. Keep existing authoring backward compatible. | `cards list` + grid/list toggle, `tabs vertical` |
| 5 | **New block** | Different content model **or** behavior that would distort an existing block. Rule of thumb: over ~40% new CSS, a different row/column contract, or a new interaction model. | `carousel` (slides + prev/next + dots + autoplay), `consent`, `quote-slider`, `fund-finder` |
| 6 | **Global chrome variant** | Header, footer or page-frame layout differs: side-rail nav, utility bar, multi-column footer, legal band. Add a **variant of header/footer toggled by site metadata** (e.g. `nav-layout: rail`, `footer-layout: legal`); never fork the header. | Manulife left nav rail, footer legal band |
| 7 | **Template** | A whole page type has its own structure: article, fund detail, event. | `templates/<name>/` + `Template` metadata |
| 8 | **Global feature / plugin** | Cross-cutting behavior configured by metadata, loaded lazily or delayed. | Consent manager, analytics, chat |

Decision rules:
- Look for **variants of variants**: if two customer sections differ only in density or
  columns, use one variant plus a modifier class (`cards text two-up`), not two variants.
- **Name constructs generically** (`carousel`, `cards list`, `nav-layout: rail`), never
  after the customer, so the base can absorb them.
- New blocks follow `content-driven-development`. Write the authoring table first, then
  `building-blocks`. Default to no runtime dependencies, mobile-first, accessible
  (keyboard, ARIA, reduced motion).
- Every new construct goes into `references/demo-manifest.json` with its level, content
  model and use. Mark it `baseCandidate: true` if it's generic.
- When in doubt between levels 3 and 5, prototype the variant. If the CSS fights the
  base block (heavy `!important`, reordering DOM in CSS), switch to a new block.

Record the decision for every section in session SQL (`page, section, customer_pattern,
level, construct, rationale, status`). The QA loop (phase 9) compares section by section
against this table.

### 6. Build

Implement every new variant, section style and block in the working repo:
- `npm run lint` must pass.
- No new runtime dependencies. Mobile-first CSS. Breakpoints at 600, 900 and 1200 px.
- Add every new variant or block to `references/demo-manifest.json`, so the next demo
  inherits it.

Commit and push. Code Sync deploys it to aem.page.

### 7. Content
- Write each page with `da_create_source`, using real customer copy from discovery and
  images from `https://content.da.live/scdemos/<slug>/media/<file>`.
- Every page gets a metadata table: Title, Description, and `Social-share: off` on
  corporate pages.
- **Preview in bulk** through the Admin API. It needs a signed-in browser tab on
  `admin.hlx.page/login/scdemos/<slug>/main`:
  `POST /preview/scdemos/<slug>/main/*` with body `{"paths":[...],"forceUpdate":true}`.
  This is also the only reliable way to preview **sheets**: the DA MCP preview of
  `metadata.json` fails with an html2md 404.
- Poll `GET /job/scdemos/<slug>/main/preview/<job>/details`.
- Publish with `POST /live/...`. Its job topic is `publish`, not `live`.
- Data-heavy or regulated content (AUM, fund facts): use `cards stats` / `table striped`
  plus a "Demo content for illustration only" note.
- Links: point every CTA at a page you actually create, or at an anchor (`/about-us#news`).
  No 404s.

### 8. Bake in demo features
- **Experiment** (home): `Experiment: home-hero`, `Experiment Variants: /experiments/home-hero/challenger-1`.
  The variant is a full page; use another real customer hero (carousel slides are
  perfect). Verify with `?experiment=home-hero/challenger-1`.
- **Campaign**: `Campaign-<name>: /campaigns/<name>/`. Use the **folder URL**: a DA doc
  named `index` is served at `/campaigns/<name>/`, not `/…/index`. Verify with
  `?campaign=<name>`. (The base needed two plugin fixes for multi-word names and relative
  URLs; they are in the base now.)
- **Interactive**: a calculator block on a solutions page. Set `currency`/`locale` in
  the metadata sheet.
- **Form**: `forms/contact-us.json` plus a `form` block on contact-us. Point submit at
  `https://demo.bbird.live/contact-us/`, which allows any origin. Create
  `/contact-us-thanks`.
- **Walkthrough**: commit `tools/demo/<slug>-walkthrough.json` (see
  `demo-walkthrough.schema.json`) with 5–7 slides: site, authoring, performance,
  experiment, campaign, engagement. Open it with
  `/tools/demo/demo.html?url=/tools/demo/<slug>-walkthrough.json`.

### 9. QA loop (maximum 3 passes per page; fidelity gate)
- Headless screenshots at 1440 and 390 px of every page. Check: blocks decorated, no
  broken images, no console 404s. A 404 often means a block expects an index (`faq` →
  `/faq-index.json`).
- Capture the original at 1440 px. Headless Chromium gets a 403 from bot-protected sites;
  use `headless: false` plus a real Chrome user agent, and click away cookie and disclaimer
  modals.
- **Fidelity gate**, section by section against the phase-5 table:
  - same layout (columns, alignment, carousel, rail)
  - same content count
  - same chrome: header layout, footer columns, legal band, consent banner
  - same interactions: slider controls, toggles, accordions
  Any miss sends that section back to phase 5 at a higher level. Don't hand off with a
  known structural miss; list only true limitations (licensed fonts, live data).
- Lighthouse: the keyless PSI API quota is often exhausted. Run
  `npx lighthouse@12 <aem.page url>` with `CHROME_PATH` set to the Playwright Chromium.
  Expect Performance 100. SEO is low only because of noindex (intentional). Contrast
  failures on `.hlx-preview-overlay` are preview-only and can be ignored. Best Practices
  is lowered by the base martech cookies.

### 10. Handoff (the only long message to the SC)

Report, in this order:
- Preview, live, DA edit and repo URLs.
- The page list, each with a ✅ or ⚠️ fidelity note.
- The features baked in, and where to show them.
- Substitutions made: fonts, mocked data, skipped interactions.
- Manual follow-ups, which should be few: site access, any brand sign-off, and Code Sync
  only if it is still pending.
- The demo walkthrough link.

## Guardrails

- Never edit `scripts/aem.js`, `head.html` or `package-lock.json`. Never commit secrets.
- Branch names are at most 8 lowercase alphanumeric characters, e.g. `custdemo`.
- Use conventional commits (`feat:`, `fix:`, `chore:`).
- Never fork a base block into a customer-specific copy. Use a variant instead.
- Keep customer assets out of the base `scdemos/demo` repo. They go only to the
  destination repo and DA.
- If a phase fails twice, record the failure, use a sensible fallback (a simpler block, a
  placeholder image, static data) and keep going. Report it in the handoff instead of
  stopping.
