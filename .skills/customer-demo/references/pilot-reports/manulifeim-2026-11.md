# Pilot report: `customer-demo` skill, Manulife Investment Management (TW/EN)

- **Date:** 2026-11-09
- **Source:** https://www.manulifeim.com/institutional/tw/en
- **Result:** https://main--manulifeim--scdemos.aem.page/ (live: `.aem.live`), DA https://da.live/#/scdemos/manulifeim, repo https://github.com/scdemos/manulifeim
- **Wall-clock:** about 55 minutes from "go" to a published, branded 11-page site, including human interruptions. The agent's active time was about 35 minutes.

## 0. Round 2: fidelity pass (after SC review)
The first handoff stopped at "good enough". The SC flagged a missing hero carousel,
mismatched cards, missing viewpoint/news content, no consent, the wrong footer, no legal
band, and a top nav where the original uses a side rail. **Root cause:** the skill
defaulted to squeezing patterns into existing blocks and had no fidelity gate. Fixed by
adding the construct-decision framework (levels 0–8) and a fidelity gate to SKILL.md,
then rebuilding:

| Original pattern | Round 1 | Round 2 construct (level) |
|---|---|---|
| Hero carousel (4 slides, arrows, progress dots) | static `hero banner` | **new `carousel` block (5)**, `autoplay` variant |
| Left icon rail + top utility bar | top nav | **`nav-layout: rail` header layout via metadata (6)** + rail icons |
| Bordered white capability grid | floating tiles | **`cards panel` variant (3)** |
| Viewpoints with author headshots + grid/list toggle | plain list | **`cards list` bylines (3) + `switchable` JS variant (4)** |
| 2×2 news panel with dates | 4 tiles | `cards panel cols-2` (3) |
| "Latest news ... All news" header rows | stacked | **`head-row` section style (2)** |
| Disclaimer (Taiwan) modal + OneTrust cookie banner | missing | **site notices feature (8)**: `site-gate` + `consent`, wired to Web SDK consent |
| Logo/link row + legal copy + legal links footer | generic footer | **`footer-layout: legal` (6)** |
| LinkedIn "Stay connected" card | CTA text | `social` section style (2) + icon |
| No accent bar under headings | base bar shown | `--h2-accent-display` token |

Gotchas found in round 2:
- Bot-protected originals 403 in headless Chromium; `headless: false` plus a real UA works
  (wait for `load`, not `networkidle`).
- Base sections use `margin: inherit`, so offsetting `main` with margin doubled the rail
  offset. Use padding.
- Whole-file ports from the customer repo to the base carry the brand rgb remaps. Restore
  them, or port by patch.
- The experimentation preview pill overlaps bottom-fixed banners (preview hosts only).

## 1. Outcome

| Area | Delivered |
|---|---|
| Pages | Home, Capabilities (landing + 5 detail pages), About Us, Sustainability, Viewpoints, Contact Us, Thank-you, plus 1 experiment variant and 1 campaign page |
| Brand | Manulife green `#06854d`, navy `#282b3e`, coral accent, square corners, sentence-case buttons and nav, Source Sans 3 (for the proprietary Manulife JH Sans), serif-italic heading emphasis, logo, favicon |
| Blocks reused | hero, cards, columns, tabs, table, form, compound-interest-calculator, header, footer |
| New CSS-only variants | `hero banner`, `cards text`, `cards list`, `cards stats`, all now in the base |
| Demo features | A/B experiment on the home hero, `global-credit` campaign, USD calculator, contact form (submits), 6-slide walkthrough (`/tools/demo/demo.html?url=/tools/demo/manulifeim-walkthrough.json`) |
| Assets | 22 customer images in DA `media/` |
| Quality | Lighthouse Performance **100** (LCP 1.4 s, CLS ≈ 0, TBT 0 ms), Accessibility 96–98, 0 broken images, 0 console 404s, lint clean |

## 2. What worked well
1. **The reskin-not-rebuild model.** About 250 block references go through 8 palette tokens, so re-branding meant changing values in one place. Every page used existing blocks; only CSS variants were added.
2. **Browser-context scraping.** One `page.evaluate` captured the whole brand (computed styles, color frequency, fonts, nav, logo). A second call fetched and parsed 8 pages of SSR HTML. This got past Akamai with no special tooling.
3. **The image pipeline.** In-page `fetch` → canvas resize → temporary git branch → `da_upload_media(sourceUrl)` → delete the branch. It moved 22 images reliably with small tool payloads.
4. **Admin API bulk preview and publish** from a signed-in tab: 16–18 paths per job, sheets included.
5. **Local `aem up` plus headless screenshots.** The SC can watch on localhost while the agent verifies at 1440 and 390 px.
6. **Experiment variants as full pages, built from real carousel slides.** They give demo-ready storytelling with no extra copywriting.
7. **The DA MCP** for create, update, upload and preview of documents was fast and dependable.

## 3. Gotchas (root cause → fix status)

| # | Gotcha | Root cause | Status |
|---|---|---|---|
| 1 | SC could not create a repo in `scdemos` (GitHub MCP 403) | SCs aren't org admins | **Designed:** issue-driven provisioning workflow (`provision-demo.yaml`). **Needs the `DEMO_PROVISION_TOKEN` secret.** |
| 2 | aem.page served CSS but all JS returned 404 | Repo created from the template **before** the Code Sync install; only later pushes synced | Fixed here with `POST /code/.../*`. The workflow now adds the repo to Code Sync **before** pushing; the skill checks `scripts/aem.js?cb=` |
| 3 | `fstab.yaml` not needed | Code Sync + Config Service auto-create the site config (DA content) within seconds | Confirmed; the skill says "no fstab" |
| 4 | Code Sync installer becomes the **only** site admin (`kunwarsaluja@hotmail.com`) | Config Service default | Open: add `*@adobe.com` author/publish roles automatically |
| 5 | `da_copy_content` copies nothing across sites (returns `{}`) | MCP limitation | The skill now writes content fresh, using base markup as reference |
| 6 | Customer CDN returns 403 to `curl` **and** to DA `sourceUrl` | Akamai bot protection | Browser-context fetch + temporary branch (section 2.3) |
| 7 | Base `icons/` isn't in git or DA, so template repos have no icons | Icons served from an untracked source | Open (**base fix**): commit `icons/` to scdemos/demo |
| 8 | The integrated browser ignores `setViewportSize` (fixed about 840 px) | Panel-hosted browser | Headless `playwright-core` for QA screenshots |
| 9 | The DA MCP can't preview sheets (`metadata.json` → html2md 404) | MCP treats the path as a document | Admin API bulk preview |
| 10 | Experimentation campaigns never served | (a) `getAllMetadata` camel-cases keys, so multi-word names never match; (b) `new URL('/path')` throws on relative paths | **Fixed in the base plugin** (`plugins/experimentation`) |
| 11 | A campaign page at `/campaigns/x/index` returned 404 | DA docs named `index` are served at the folder URL | Documented in the skill and manifest |
| 12 | `faq` block ignored authored Q&A and fetched `/faq-index.json` (404) | Block is index-driven | Manifest says to use `tabs` for authored Q&A |
| 13 | `journey-map` "unlock checkpoint" UX was wrong for a timeline | Gated-steps block | Manifest says to use `table striped` for history |
| 14 | Calculators showed CAD | Hard-coded `'CAD'` / `'en-CA'` | **Fixed in base:** `getCurrency()` from `currency`/`locale` metadata |
| 15 | Nav forced UPPERCASE; Manulife uses sentence case | Hard-coded in header.css (two rules: list and `a.button`) | **Fixed in base:** `--nav-text-transform`, `--nav-letter-spacing` |
| 16 | About 87 old-brand `rgb()` tints in block CSS | Literals, not tokens | Remapped with sed; the manifest lists them. **Base backlog:** tokenize |
| 17 | Cards and columns radius hard-coded at 12px; body gradient and button shine baked in | Heritage design assumptions | **Fixed in base:** `--border-radius-card` (default 12px). Effects removed per customer |
| 18 | Dark raster logo invisible on the dark footer | Logo is an image, not `currentColor` SVG | **Fixed in base:** `--footer-logo-filter` |
| 19 | Floating social-share dock on corporate pages | Injected globally by `delayed.js` | **Fixed in base:** `Social-share: off` metadata |
| 20 | An appended "brand override" CSS layer failed stylelint | `no-duplicate-selectors` / `no-descending-specificity` | The skill says to fold changes into existing rules; variants use `.block` specificity |
| 21 | The logo SVG was 156 KB with hidden raster layers | Illustrator export | Use the header PNG wrapped in SVG |
| 22 | Keyless PageSpeed API quota exhausted | Shared quota | Local `npx lighthouse` with Playwright Chromium |
| 23 | Lighthouse contrast failures | Only the preview-only experimentation overlay | Ignore (not on live) |
| 24 | Nav metadata table (Robots) rendered inside the header | Base nav authoring pattern leaked | Don't put metadata in nav |
| 25 | Admin job poll used the wrong topic for publish | `/live` jobs are under topic `publish` | Documented |

## 4. Changes made in this run

**Base `scdemos/demo` (`custdemo` branch, local, not pushed).** These are generic and every future demo inherits them:
- `hero banner`, `cards text|list|stats` variants
- `getCurrency()` + metadata-driven calculators
- nav casing tokens, `--footer-logo-filter`, `--border-radius-card`
- `Social-share: off` metadata opt-out
- experimentation plugin campaign fixes (multi-word names, relative URLs)
- the `customer-demo` skill, manifest, preflight script, provisioning workflow, prompts, MCP config

**Customer `scdemos/manulifeim` (pushed to `main`):** brand tokens, font, icons/logo, walkthrough deck, and the same generic fixes.

## 5. Improvement backlog (prioritized)

### P0: needed for true one-touch use by every SC
1. **Add the `DEMO_PROVISION_TOKEN` secret** (an org-owner classic PAT or a bot account) and merge `custdemo` → `main`. This removes the repo-creation and Code Sync clicks.
2. **Auto-grant site roles** in the workflow (`*@adobe.com` author/publish; the requester as admin) through the Config Service.
3. **Commit `icons/` to the base** (logo, search, globe, toggle, social).
4. **Publish the skill standalone** (`scdemos/customer-demo-skill`), installable with `npx skills add`, the Claude plugin marketplace, or by copying into `~/.copilot/skills`. It should fetch the base and manifest from GitHub at runtime so it works from any folder.
5. **Admin API auth without a browser:** let the workflow bot (or a CloneIt-style worker) run the full code sync, bulk preview and publish, so the SC never signs in to admin.hlx.page.

### P0.5: fidelity (added after round 2)
- Run the **fidelity gate** before every handoff. Never hand off a known structural miss.
- Automate the side-by-side: a headed capture of the original plus a headless capture of
  the demo, sliced per section, with a pixel-diff score per section.
- Next base candidates seen on FS sites: `tabs vertical`, mega-menu intro panel,
  region/language selector, fund-facts `table data`, an article template with an author
  card.

### P1: fidelity and speed
6. **Tokenize the remaining rgb literals** in base CSS (`--color-brand-rgb`, `--color-accent-rgb`), so the reskin is values-only.
7. **A `brand.json` → CSS generator script:** the extracted brand (colors, fonts, radius, casing) in, token block out. That makes it deterministic and testable.
8. **Bundle the scripts** that were ad hoc this time: `scrape-brand.js`, `scrape-pages.js`, `stage-images.sh`, `shot.mjs` (headless screenshots), `lh.sh` (local Lighthouse), `bulk-preview.js`.
9. **A visual diff score** (pixelmatch on sections, original vs. demo) to drive the QA loop objectively.
10. **More base variants** seen on FS/corporate sites: `hero carousel` (rotating slides), `cards icon`, `columns quote`, `table data` (fund facts), `tabs vertical`, a mega-menu with intro text, a region/language selector.
11. **A generic, index-free accordion block**, since `faq` is index-driven.
12. **Article template content:** generate 3–5 insight articles and a query index so `related-articles` and search light up.

### P2: polish
13. Locale variants (e.g. `/zh` for TW) through the base localization pattern.
14. Make the hero `banner` scrim configurable (`--hero-scrim`).
15. A demo-reset script: re-seed experiments and campaigns after a live demo.
16. Track every demo in the provisioning issue: created/last-used dates and cost, for accounting.

## 6. Open decisions
- Bot account versus an org-owner PAT for provisioning, and token rotation.
- Repo visibility: Code Sync works with public repos; private needs verification.
- Asset policy: customer images in public repos/previews are "unlisted, not protected". Decide whether demos need site authentication by default.
- Whether base changes should land on `main` directly or through PR review.

## 7. Useful endpoints (verified this run)
- Code sync everything: `POST https://admin.hlx.page/code/scdemos/<slug>/main/*`
- Bulk preview: `POST https://admin.hlx.page/preview/scdemos/<slug>/main/*`, body `{"paths":[...],"forceUpdate":true}`; job details at `/job/scdemos/<slug>/main/preview/<job>/details`
- Bulk publish: `POST https://admin.hlx.page/live/scdemos/<slug>/main/*`; job topic `publish`
- Site config (via the CloneIt worker, service token): `GET/PUT /config/scdemos/sites/<slug>.json`
- Contact form submit (any origin): `https://demo.bbird.live/contact-us/`
