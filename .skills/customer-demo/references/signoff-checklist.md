# Customer demo sign-off checklist

The agent must work through **every** item before handoff and copy this checklist, with
results, into the run report (`references/pilot-reports/<slug>-<yyyy-mm>.md`, git-ignored: local working notes).

Mark each item:
- ✅ done and verified (say how: a screenshot, `compare.mjs` output, or a URL)
- ⚠️ closest-possible alternative (say why the exact match was impossible and what was done instead)
- ❌ not done (blocks handoff unless the SC accepts it)

**Fidelity rule:** first try to reproduce the original exactly with the right construct (see
SKILL.md phase 5 levels). A "closest-possible alternative" is the **last resort**, and every
one has to be listed in the report with its reason. Fidelity checks (headings, header, footer,
rail, carousels, layout, provenance, section count, review) can only be waived **by the SC**
(`waivers.json` reason starting with `SC:`); `compare.mjs` ignores any other waiver on them.

> Add new items under the right heading. Keep each item a single verifiable statement and tag
> it with its principle (`[P1]`–`[P10]`, see SKILL.md) and, where one exists, the script check
> that proves it (`doctor:<id>`, `lint:<id>`, `compare`). An item without an automated check
> is a candidate for one (P10).

## 0. Automated gates (all must exit 0, or every FAIL is listed as ⚠️ with a reason)
- [ ] **`parity.mjs` exits 0** (definition of done): every scoped page, original vs `localhost:3000`, at 1440/390 + dark OS, interactions exercised; `fid/parity.md` shows all ✅ (or an SC decision per ❌). Then once more against the published `aem.live` site. [P1 P4 P5] `parity`
- [ ] `lint-content.mjs --site <slug>` passes: block content models, nav and form sheets. [P3] `lint:*`
- [ ] `doctor.mjs --site <slug>` passes: state, index and search, forms (dry-run), links, metadata decisions, library. [P1 P2 P6 P8] `doctor:*`
- [ ] `compare.mjs --final --review review.json` passes on every page in scope, both sites captured with `--interact` at 1440 **and** 390 px (demo from `localhost:3000`, also with `--scheme dark`): header layout, carousels, layout, provenance, **functionality** (menus, mobile menu, carousel, tabs, accordion) and the by-eye review included. [P1 P4 P5] `compare`
- [ ] The **parity matrix** (page × design, content, look & feel, functionality, notices & login, base features) is in the report with evidence, and has no ❌. [P1 P4 P5]
- [ ] Each new check added in this run has a negative test (break it on purpose and it fails). [P9]
- [ ] `setup-check.mjs` passes on the machine that built the demo. [P9]
- [ ] If anything SC-facing changed in the skill this run, `SC-QUICKSTART.md` is updated and `docs-check.mjs` passes. [P10] `docs-check`

## 1. Chrome: nav, header, footer
- [ ] Header layout matches the original: top bar or side rail, rows (utility bar, main nav, sub-nav), height, logo size and placement, sticky behavior, search, region/language, login/register CTAs. Checked at 1440 and 390 px. [P5] `compare:header layout` `compare:header items`
- [ ] Nav: every original top-level item from `scrape/design.json` (`nav.tree`) is present, in the same order, with the same icons and the same dropdown / mega-menu / sub-nav children. Every link resolves (no 404s). [P1] `doctor:links`
- [ ] Footer matches the original: logo, link rows, legal/copyright text, legal links, social. [P4] `compare:footer`
- [ ] Global notices: entry disclaimer/gate and cookie consent are present if the original has them (`site-gate` / `consent` fragments with the customer's text and buttons). Tested in a fresh browser profile: banner shows, **reject and accept both persist after reload**, the gate blocks until agreed. [P1 P4 P6]
- [ ] Login: the header login link goes to `demo.bbird.live` (base flow, `returnTo` = current page) on desktop **and** in the mobile menu, with the customer's wording (`login-label` / `logout-label`). [P1 P6]
- [ ] Gated content: if the original has a members/client area or "log in to view" content, one demo page shows it (`Gated: true`, sections `View: logged-out` teaser / `View: logged-in` content), and the author toggle switches views on localhost/aem.page. [P1]
- [ ] Favicon, logo and brand mark are the customer's. [P6]

## 2. Every migrated page
- [ ] Pages in scope are **real pages of the customer site** (same URL slugs where possible), one demo page per original page: the SC's URL, every top-nav page, the pages their CTAs/forms lead to, the footer's legal pages and one per distinct template. No invented pages. [P4]
- [ ] Pages of a distinct type use a template (`Template: article` / `events`, or a new one for a type on 2+ pages), and the library `templates.json` lists them. [P7]
- [ ] Each page's Title, Description and social Image come from the original (`design.json` `meta`). Downloads (PDFs) open; embeds (video, maps) play or show a poster with a link. [P4]
- [ ] `compare.mjs` reports **PASS** for every page. Any accepted FAIL is listed in the report with its reason. [P4 P5] `compare`
- [ ] **Real content only:** headings, copy, stats, CTAs and images come from the original pages; nothing is made up (only "for illustration only" notes are allowed). [P4] `compare:provenance`
- [ ] Section by section, the layout matches: alignment (centered vs left), text width, full-bleed bands and backgrounds, columns, overlaps, carousels, tabs, accordions, grids, icons. [P5] `compare:layout` `compare:carousels` + `review.json`
- [ ] Type, buttons and cards match `scrape/design.json`: family (or documented substitute), sizes, weights, case, button shape and color, card radius/shadow; the content container has the original's width. [P5 P6] (visual)
- [ ] Content is complete: every original heading, paragraph, list, stat, CTA and image is present. Nothing has been silently dropped. [P4] `compare:headings`
- [ ] Repeated sections (CTA bands, sign-ups, disclaimers, contact strips) are one fragment each under `/fragments/`, placed with a `fragment` block on every page that shows them; the block library lists them. [P7] `lint:repeat-inline`
- [ ] Interactions work: carousel controls, tabs, accordions, toggles, forms (with the same fields, options and required markers) and the submit flow. [P1]
- [ ] No broken images, no console errors, no network 404s (`capture.mjs` health check). [P1] `compare:health`
- [ ] Every internal link points to an existing page or anchor. [P1] `doctor:links`
- [ ] Mobile (390 px) is usable: no overlap, no horizontal scroll, and the nav collapses correctly. [P5]
- [ ] Text on colored bands, overlaps and images is readable (the `compare.mjs` readability check passes, plus a visual check of every band/overlap section). [P5] `compare:readability`
- [ ] Forms embedded in content pages (e.g. a "contact sales" or "partner with us" form on a product page) exist wherever the original has them, not only on Contact Us. [P4] `compare:forms`
- [ ] **Forms:** every form block posts to `https://demo.bbird.live/contact-us/` (hard rule); fields, options and the thank-you page follow the original on a best-effort basis. [P3] `doctor:forms`
- [ ] **Every form is submitted end to end** in a real browser, scoped to the content form (not the header search), **always in dry-run mode, fail-closed**: intercept the POST, add the `x-dry-run: 1` request header (Playwright `route` → `continue({ headers })`), and `route.abort()` if that isn't possible. The POST returns 200 with `"dryRun":true`, and the thank-you page or message appears. **Never post a real submission: the worker feeds an active Slack channel.** [P1 P8] `doctor:forms`

## 3. Design system and theming
- [ ] Brand tokens are set: colors, fonts (with a licensed-font substitute documented), radius, nav casing, h2 accent. [P6]
- [ ] **Color scheme:** [P5 P6] `doctor:metadata` `compare:scheme`. The site sets a `color-scheme` default in the metadata sheet that matches the original (usually `light`). The page renders correctly with the OS in **dark mode** (`capture.mjs --scheme dark`): the declared scheme is honored and no text is below 3:1 contrast.
- [ ] If both schemes are supported, the nav has a theme toggle (`:toggle:`) and both themes pass the readability check. [P6]
- [ ] No leftover base-brand colors (heritage rust/gold) are visible anywhere. [P6]

## 4. Block library and authoring kit (DA `/<org>/<site>/docs/library`)
- [ ] `docs/library/blocks.json` lists **every** block used on the site plus all base blocks an SC may demo. Each entry has a library page under `docs/library/blocks/<name>`. [P2] `doctor:library`
- [ ] Every block library page shows **every variant** in use (e.g. Cards (Panel), Cards (Panel, Cols-2), Cards (List, Switchable), Cards (Stats), Hero (Banner), Carousel (Autoplay), Form (Panel)) with real customer sample content, plus a `library-metadata` description.
- [ ] Section styles and section metadata options (`options` sheet: `style`, `background`, etc.) list every style the site uses (`head-row`, `social`, `page-title`, `light`, `ink`, `center`, ...).
- [ ] `icons.json` lists every icon in `/icons` that the site or nav uses.
- [ ] `templates.json` plus template docs exist for every page template in use, and new page types are available as templates.
- [ ] `tagging.json` / `tagging-taxonomy.json` contain the customer's taxonomy (e.g. asset classes, regions, content types).
- [ ] The DA site config (`/config/<org>/<site>`) registers the library so the Library panel shows blocks, icons, templates and tags. Opened in DA and verified.
- [ ] **DA config migrated:** every sheet of `https://da.live/config#/scdemos/demo/` (data, library, apps, skills, mcp-servers, prompts, flags, prepare, publish-workflow-*, …) exists on `https://da.live/config#/scdemos/<slug>/`, rewritten for the customer (`da-config.mjs` merge; no `scdemos/demo` references left; publish approvers = the SC). [P2 P8] `da-config:check`
- [ ] `demo-manifest.json` in the base records every new block, variant, section style and chrome layout (`baseCandidate: true` where generic). [P7]

## 5. Demo features
- [ ] **Base state inventory** walked: every row of `base-state-inventory.md` is copied, recreated (with base-bound values rewritten) or skipped with a reason. [P2] `doctor:state`
- [ ] `/query-index.json` returns 200 and lists only real content pages. [P2] `doctor:index`
- [ ] **Base assumptions** walked: every row of `base-assumptions.md` has a customer decision, including control styling on the search results page and in forms. [P6]
- [ ] Site search works: a customer term typed in the header search box lands on `/search?q=…` with relevant results at 1440 and 390 px. Blocks that read an index (search, related articles, faq) show data. [P1] `doctor:search`
- [ ] Experiments, campaigns and audiences are **not** set by default. If the SC asked for them, every variant works (`?experiment=`, `?campaign=`). [P1] `doctor:experiments`
- [ ] Interactive tool (calculator/quiz) uses the correct currency and locale. [P6] `doctor:metadata`
- [ ] Demo walkthrough deck exists and every link in it works.
- [ ] Sidekick project name is the customer's; preview, publish and edit work from Sidekick. [P2] `doctor:state`

## 6. Engineering quality
- [ ] `npm run lint` is clean in the customer repo. No `!important` hacks; any lint disables have a written reason. [P7]
- [ ] New constructs are generic and opt-in (metadata or variant), and ported to the base without changing its default look. Verified by a base home page screenshot. [P7]
- [ ] **`lighthouse.mjs` exits 0:** every scoped page on the published site scores **100** for Performance, Accessibility and Best Practices on **mobile and desktop** (median of 3 runs; SEO reported, not gated). Base-caused issues are ported back to `scdemos/demo`. [P5 P7] `lighthouse`
- [ ] Every page is previewed and published. `aem.live` returns 200 for every page. [P1] `doctor:pages`
- [ ] The base demo pages were unpublished and backed up to `/drafts/demo-backup` (DA) during the migration; nothing of the base demo is live, indexed or linked. [P2 P6] `lint:base-leftover` `doctor:index`
- [ ] After parity passed (localhost and published), the backup was deleted (`site-tab.js` `purgeBackup`): the DA site holds only the customer demo. Kept only if a page is still waiting for the SC's decision. [P2]

## 7. Guardrails
- [ ] No commit was made without the SC's OK, and only to the allowed branch. [P8]
- [ ] No real submission or message was sent to a shared system (Slack, email, analytics) during checks. [P8]

## 8. Report and retro
- [ ] The report contains: this checklist with results, the fidelity table (original vs demo, per page), the constructs created (with level and rationale), every closest-possible alternative, gotchas, and the backlog. [P10]
- [ ] Retro gotcha table: each gotcha has a principle and a prevention (base fix / doctor / lint / gate / rule). Rule-only gotchas are listed as "not yet prevented". [P10]
