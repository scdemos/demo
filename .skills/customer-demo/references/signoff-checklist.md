# Customer demo sign-off checklist

The agent must work through **every** item before handoff and copy this checklist, with
results, into the pilot report (`references/pilot-reports/<slug>-<yyyy-mm>.md`).

Mark each item:
- ✅ done and verified (say how: a screenshot, `compare.mjs` output, or a URL)
- ⚠️ closest-possible alternative (say why the exact match was impossible and what was done instead)
- ❌ not done (blocks handoff unless the SC accepts it)

**Fidelity rule:** first try to reproduce the original exactly with the right construct (see
SKILL.md phase 5 levels). A "closest-possible alternative" is the **last resort**, and every
one has to be listed in the report with its reason.

> Add new items under the right heading. Keep each item a single verifiable statement.

## 1. Chrome: nav, header, footer
- [ ] Header layout matches the original: top bar or side rail, logo, search, region/language, login/register CTAs. Checked at 1440 and 390 px.
- [ ] Nav: every original top-level item is present, in the same order, with the same icons and the same sub-menus. Every link resolves (no 404s).
- [ ] Footer matches the original: logo, link rows, legal/copyright text, legal links, social.
- [ ] Global notices: entry disclaimer/gate and cookie consent are present if the original has them, and the consent choices are wired to analytics consent.
- [ ] Favicon, logo and brand mark are the customer's.

## 2. Every migrated page
- [ ] `compare.mjs` reports **PASS** for every page. Any accepted FAIL is listed in the report with its reason.
- [ ] Section by section, the layout matches: columns, bands/backgrounds, overlaps, carousels, tabs, accordions, grids, icons.
- [ ] Content is complete: every original heading, paragraph, list, stat, CTA and image is present. Nothing has been silently dropped.
- [ ] Interactions work: carousel controls, tabs, accordions, toggles, forms (with the same fields, options and required markers) and the submit flow.
- [ ] No broken images, no console errors, no network 404s (`capture.mjs` health check).
- [ ] Every internal link points to an existing page or anchor.
- [ ] Mobile (390 px) is usable: no overlap, no horizontal scroll, and the nav collapses correctly.

## 3. Design system and theming
- [ ] Brand tokens are set: colors, fonts (with a licensed-font substitute documented), radius, nav casing, h2 accent.
- [ ] **Color scheme:** the site sets a `color-scheme` default in the metadata sheet that matches the original (usually `light`). The page renders correctly with the OS in **dark mode** (`capture.mjs --scheme dark`): the declared scheme is honored and no text is below 3:1 contrast.
- [ ] If both schemes are supported, the nav has a theme toggle (`:toggle:`) and both themes pass the readability check.
- [ ] No leftover base-brand colors (heritage rust/gold) are visible anywhere.

## 4. Block library and authoring kit (DA `/<org>/<site>/docs/library`)
- [ ] `docs/library/blocks.json` lists **every** block used on the site plus all base blocks an SC may demo. Each entry has a library page under `docs/library/blocks/<name>`.
- [ ] Every block library page shows **every variant** in use (e.g. Cards (Panel), Cards (Panel, Cols-2), Cards (List, Switchable), Cards (Stats), Hero (Banner), Carousel (Autoplay), Form (Panel)) with real customer sample content, plus a `library-metadata` description.
- [ ] Section styles and section metadata options (`options` sheet: `style`, `background`, etc.) list every style the site uses (`head-row`, `social`, `page-title`, `light`, `ink`, `center`, ...).
- [ ] `icons.json` lists every icon in `/icons` that the site or nav uses.
- [ ] `templates.json` plus template docs exist for every page template in use, and new page types are available as templates.
- [ ] `tagging.json` / `tagging-taxonomy.json` contain the customer's taxonomy (e.g. asset classes, regions, content types).
- [ ] The DA site config (`/config/<org>/<site>`) registers the library so the Library panel shows blocks, icons, templates and tags. Opened in DA and verified.
- [ ] `demo-manifest.json` in the base records every new block, variant, section style and chrome layout (`baseCandidate: true` where generic).

## 5. Demo features
- [ ] Experiment, campaign and audience variants work (`?experiment=`, `?campaign=`).
- [ ] Interactive tool (calculator/quiz) uses the correct currency and locale.
- [ ] Demo walkthrough deck exists and every link in it works.
- [ ] Sidekick project name is the customer's; preview, publish and edit work from Sidekick.

## 6. Engineering quality
- [ ] `npm run lint` is clean in the customer repo. No `!important` hacks; any lint disables have a written reason.
- [ ] New constructs are generic and opt-in (metadata or variant), and ported to the base without changing its default look. Verified by a base home page screenshot.
- [ ] Lighthouse on the home page and one inner page: Performance ≥ 90 (target 100), Accessibility ≥ 95. Any shortfall is explained.
- [ ] Every page is previewed and published. `aem.live` returns 200 for every page.

## 7. Report
- [ ] The report contains: this checklist with results, the fidelity table (original vs demo, per page), the constructs created (with level and rationale), every closest-possible alternative, gotchas, and the backlog.
