# Customer demo sign-off checklist

The agent must work through **every** item before handoff and copy this checklist, with
results, into the run report (`references/pilot-reports/<slug>-<yyyy-mm>.md`, git-ignored: local working notes).

Mark each item:
- ✅ done and verified (say how: a screenshot, `compare.mjs` output, or a URL)
- ⚠️ closest-possible alternative (say why the exact match was impossible and what was done instead)
- ❌ not done (blocks handoff unless the SC accepts it)

**Fidelity rule:** first try to reproduce the original exactly with the right construct (see
SKILL.md phase 5 levels). A "closest-possible alternative" is the **last resort**, and every
one has to be listed in the report with its reason.

> Add new items under the right heading. Keep each item a single verifiable statement and tag
> it with its principle (`[P1]`–`[P10]`, see SKILL.md) and, where one exists, the script check
> that proves it (`doctor:<id>`, `lint:<id>`, `compare`). An item without an automated check
> is a candidate for one (P10).

## 0. Automated gates (all must exit 0, or every FAIL is listed as ⚠️ with a reason)
- [ ] `lint-content.mjs --site <slug>` passes: block content models, nav and form sheets. [P3] `lint:*`
- [ ] `doctor.mjs --site <slug>` passes: state, index and search, forms (dry-run), links, metadata decisions, library. [P1 P2 P6 P8] `doctor:*`
- [ ] `compare.mjs` passes on every page in scope, captured with `--scheme dark`. [P4 P5] `compare`
- [ ] Each new check added in this run has a negative test (break it on purpose and it fails). [P9]
- [ ] `setup-check.mjs` passes on the machine that built the demo. [P9]
- [ ] If anything SC-facing changed in the skill this run, `SC-QUICKSTART.md` is updated and `docs-check.mjs` passes. [P10] `docs-check`

## 1. Chrome: nav, header, footer
- [ ] Header layout matches the original: top bar or side rail, logo, search, region/language, login/register CTAs. Checked at 1440 and 390 px. [P5] `compare:header`
- [ ] Nav: every original top-level item is present, in the same order, with the same icons and the same sub-menus. Every link resolves (no 404s). [P1] `doctor:links`
- [ ] Footer matches the original: logo, link rows, legal/copyright text, legal links, social. [P4] `compare:footer`
- [ ] Global notices: entry disclaimer/gate and cookie consent are present if the original has them, and the consent choices are wired to analytics consent. [P4 P6]
- [ ] Favicon, logo and brand mark are the customer's. [P6]

## 2. Every migrated page
- [ ] `compare.mjs` reports **PASS** for every page. Any accepted FAIL is listed in the report with its reason. [P4 P5] `compare`
- [ ] Section by section, the layout matches: columns, bands/backgrounds, overlaps, carousels, tabs, accordions, grids, icons. [P5] (visual)
- [ ] Content is complete: every original heading, paragraph, list, stat, CTA and image is present. Nothing has been silently dropped. [P4] `compare:headings`
- [ ] Interactions work: carousel controls, tabs, accordions, toggles, forms (with the same fields, options and required markers) and the submit flow. [P1]
- [ ] No broken images, no console errors, no network 404s (`capture.mjs` health check). [P1] `compare:health`
- [ ] Every internal link points to an existing page or anchor. [P1] `doctor:links`
- [ ] Mobile (390 px) is usable: no overlap, no horizontal scroll, and the nav collapses correctly. [P5]
- [ ] Text on colored bands, overlaps and images is readable (the `compare.mjs` readability check passes, plus a visual check of every band/overlap section). [P5] `compare:readability`
- [ ] Forms embedded in content pages (e.g. a "contact sales" or "partner with us" form on a product page) exist wherever the original has them, not only on Contact Us. [P4] `compare:forms`
- [ ] **Forms:** every form block posts to `https://demo.bbird.live/contact-us/` (hard rule); fields, options and the thank-you page follow the original on a best-effort basis. [P3] `doctor:forms`
- [ ] **Every form is submitted end to end** in a real browser, scoped to the content form (not the header search), **always in dry-run mode**: add the `x-dry-run: 1` request header (e.g. Playwright `route` → `continue({ headers })`). The POST returns 200 with `"dryRun":true`, and the thank-you page or message appears. **Never post a real submission: the worker feeds an active Slack channel.** [P1 P8] `doctor:forms`

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
- [ ] Experiment, campaign and audience variants work (`?experiment=`, `?campaign=`). [P1] `doctor:experiments`
- [ ] Interactive tool (calculator/quiz) uses the correct currency and locale. [P6] `doctor:metadata`
- [ ] Demo walkthrough deck exists and every link in it works.
- [ ] Sidekick project name is the customer's; preview, publish and edit work from Sidekick. [P2] `doctor:state`

## 6. Engineering quality
- [ ] `npm run lint` is clean in the customer repo. No `!important` hacks; any lint disables have a written reason. [P7]
- [ ] New constructs are generic and opt-in (metadata or variant), and ported to the base without changing its default look. Verified by a base home page screenshot. [P7]
- [ ] Lighthouse on the home page and one inner page: Performance ≥ 90 (target 100), Accessibility ≥ 95. Any shortfall is explained.
- [ ] Every page is previewed and published. `aem.live` returns 200 for every page. [P1] `doctor:pages`

## 7. Guardrails
- [ ] No commit was made without the SC's OK, and only to the allowed branch. [P8]
- [ ] No real submission or message was sent to a shared system (Slack, email, analytics) during checks. [P8]

## 8. Report and retro
- [ ] The report contains: this checklist with results, the fidelity table (original vs demo, per page), the constructs created (with level and rationale), every closest-possible alternative, gotchas, and the backlog. [P10]
- [ ] Retro gotcha table: each gotcha has a principle and a prevention (base fix / doctor / lint / gate / rule). Rule-only gotchas are listed as "not yet prevented". [P10]
