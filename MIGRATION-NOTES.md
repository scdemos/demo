# Oura Ring Migration — Work Log & Conventions

This project migrates ouraring.com into Adobe Document Authoring (da.live) for AEM
Edge Delivery Services. This file records what has been customized, why, and where,
so the work can be understood and recreated. For base project rules see `AGENTS.md`.

## Key architectural facts (learned the hard way)

- **Section metadata is processed server-side in DA.** Locally, `section-metadata`
  blocks (e.g. `tab-id`, `Style: ink`) render as raw text and sections don't group.
  A client-side `applySectionMetadata()` pass in `scripts/scripts.js` converts them
  on the load path (no-op in production). Use `ink` (not `dark`) for dark sections.
- **The section pipeline nests content under `.default-content-wrapper`.** Selectors
  like `.band > p` / `.band > ul` (direct child) will NOT match — target the wrapper
  or the element itself. This affected the footer legal band and Privacy Policy link.
- **Content is authored in `content/*.plain.html`** — keep it flat/semantic (no forms,
  classes, or layout divs). Build controls/layout in block JS + CSS. Don't hand-edit
  content HTML to add app-UI mockups; drive those from the block.
- **Local dev runs on port 3010** (`http://localhost:3010/content/index`).
- **Fonts are self-hosted** (licensed Oura fonts): `akkuratll` (body) + `Editorial New`
  (serif) in `styles/fonts.css`, with Fraunces/Inter fallbacks.
- **Design tokens** live in `styles/styles.css :root` — e.g. `--color-ink`,
  `--color-parchment`, `--color-text-warm: #4a4741`, `--color-oura-blue`,
  `--color-accent`. `head.html` is do-not-modify.

## Header / navigation (`blocks/header/`, `content/nav.plain.html`)

- Generic hover mega-menu with three panels (Shop / Health Features / Experience),
  transparent-over-hero bar that fills cream when a panel opens, sentence-case labels,
  logo sized to nav-link text. Login removed (auth is opt-in — only activates if a
  login link is authored in tools).
- **Mega-menu fixes:**
  - Shop feature-card labels wrap to two lines (no truncation); rounded corners;
    circular "→" button bottom-right; thumbnail list + blue circular "Shop all
    products" arrow (shrunk to 32px via `box-sizing: border-box`).
  - **Per-item leading icons** for Health Features / Experience: the nav fragment
    authors these as text-only links (no icon column). Icons are injected in
    `header.js` via a `MEGA_ITEM_ICONS` map keyed by href slug, rendered as
    `<span class="icon icon-…">` then `decorateIcons()`. Icon SVGs added to `icons/`
    (`nav-science`, `nav-sleep`, `nav-womens-health`, `nav-stress`, `nav-heart`,
    `nav-activity`, `nav-metabolic`, `nav-membership`, `nav-sizing`,
    `nav-integrations`, `nav-support`). These are stand-in line icons — replace with
    official Oura SVGs under the same names if available.
  - Panel-type selectors scoped to `> a:first-child img` so nested icon `<img>`s don't
    misclassify text-link panels as product panels.
  - Mobile drawer given an opaque cream background so page content doesn't bleed
    through when open.

## Footer (`blocks/footer/`, `content/footer.plain.html`)

- Dark theme, multi-band: brand logo (white-filtered via
  `filter: brightness(0) invert(1)` scoped to `p img` so payment badges keep color) +
  payment badges top-right on one row; newsletter band left (~1/3) beside four link
  columns right (~2/3); bordered/rounded email input with inline arrow; underlined
  Privacy Policy; external ↗ arrows on the four cross-domain links; italic "Blog"
  (`<em>` in the fragment); bottom legal band (links+copyright left, language pill
  bottom-right).
- Legal band and lead band layout target `.default-content-wrapper` (not direct
  children) because of pipeline nesting.
- **Social-share rail** (`blocks/social-share/`): IntersectionObserver hides the
  floating rail (`.is-hidden`) when the footer scrolls into view.

## Homepage sections (`blocks/cards/`, `blocks/tabs/`)

- **Product tiles** — full-width, fluid sizing.
- **Membership overlay carousel** (`cards.js` `decorateOverlay`, `.overlay`):
  horizontal carousel of portrait 3:4 cards with pill category, "+" button, gradient,
  italic headlines, prev/next controls.
- **"In the News"** (`.cards.no-images` in an `ink` section): dark section as a
  contained grid — featured overlay card left, three cream news cards stacked right
  with circular ↗ buttons. The section itself is the grid container (content emits as
  3 sibling wrappers); featured headline is bold sans-serif; stray
  `.section-metadata-wrapper` hidden.
- **"Form Meets Function" intro** (`tabs.css`, scoped to
  `.tabs-container > .default-content-wrapper`): two-column, eyebrow + mixed
  sans/serif-italic headline ("your everyday" italic). Text color `#4A4741`
  (`--color-text-warm`); "How It Works" button text white.

## Tabs "moments" block (`blocks/tabs/`) — largest rebuild

- The authored document holds only a **hero image + testimonial per tab**; app-UI
  cards were a hardcoded placeholder that repeated tab 1 for every tab.
- Fix: replaced the single `buildStatCards()` with a **per-tab-id card map**
  (`TAB_CARDS`) + `renderCard()`. Each tab renders its own cards, notification pill,
  and scene tint via `layoutTabPanel(section, tabId)`.
- Card types: `sleep` (hypnogram), `readiness`/`bedtime` (arc gauge), `hr`/`stress`
  (SVG line charts + axes), `activity` (progress slider), `text` (with button), plus
  notification pills and in-card buttons. Charts use **fixed illustrative data** (no
  `Math.random` — the build environment forbids it).
- Cards restyled from opaque white to **translucent frosted glass, scene-tinted, light
  text**: gold / sage / brown / night / rose (`--scene` + `--scene-accent` per tab).
  Three-region layout preserved (hero left, cards center, testimonial right); collapses
  to one column on mobile.

### Tab hero images (`content/images/`)

- The scrape captured ouraring.com's blurred **background "mask"** images instead of
  the sharp foreground photos. Re-fetched the real signed imgix foreground photos and
  overwrote the existing hashed filenames (so no HTML change needed):
  - Taking a walk → `hand-holding-bag.jpg` → `72fa61d8….png`
  - Winding down → `winding-down.jpg` → `e6cbe62e….png`
  - Hosting a party → `host-party-primary.jpg` (rooftop dinner) → `3c1c32b17….png`
- Converted with project-root `sharp` (resize ≤1000px, PNG).

## Known unresolved items

- **"Under the weather" hero** points at `5a930841….png`, the same file the overlay
  "Heart Health" card uses (hand-on-shoulder) — not the brown-blanket photo. No
  brown-blanket asset exists; needs authoring/upload.
- **Water-splash "Hosting a party" image** requested but retired from Oura's CDN — not
  on the live site or in scrape data. Only rooftop-dinner (in use) and a cheers/toast
  shot are available.
- Some tab hero images are low-res source assets; app-card data values are
  illustrative, not real metrics.
- Stray unreferenced temp file `content/images/_sec.png` couldn't be auto-deleted
  (content-dir guard) — safe to remove manually.

## Conventions to follow

- Verify computed styles/DOM in the preview before AND after edits; scope overrides
  tightly with `:has()` / section classes.
- `npm run lint` (ESLint airbnb + Stylelint standard) must pass. Common gotchas:
  `no-descending-specificity` (add disable comments matching the file's existing
  pattern), redundant longhands (use `overflow: auto hidden`, `place-content`),
  `comment-empty-line-before`.
- No runtime deps, no build step, `.js` extensions in imports; do not modify
  `scripts/aem.js`, `head.html`, or `package-lock.json`.
