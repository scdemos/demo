# Base assumptions (P6: decide every base assumption)

The base (`scdemos/demo`) is opinionated. Each row is a default that a customer demo will
inherit **silently** unless you decide it. In phase 4 (brand), and again in the final sweep,
set every row to the customer's value, or confirm that the base value matches the original.
Record the decisions in the report. `scripts/doctor.mjs` checks the rows marked 🩺.

| # | Assumption | Base default | Where to set it | How to decide | 🩺 |
|---|---|---|---|---|---|
| A1 | Color scheme | follows the OS (`auto`): a dark OS turns the site dark | metadata sheet `color-scheme: light \| dark \| auto` | Light unless the original has a dark mode. If both, keep `auto` and add the nav theme toggle | 🩺 |
| A2 | Brand palette | heritage rust/gold/parchment | BRAND TOKENS block in `styles/styles.css` | Extract from the original's computed styles | |
| A3 | Color literals | some `rgb()` tints in block CSS | block CSS, remapped to brand rgb | Grep for base rgb triplets after the reskin; none may remain visible | |
| A4 | Fonts | base heading/body faces | `styles/fonts.css` + tokens | Use the customer's font if it's open; otherwise the closest open match (report it ⚠️) | |
| A5 | Corner radius, shadows, gradients | rounded cards, button shine, body gradient | tokens | Match the original (often square corners and flat surfaces for corporate sites) | |
| A6 | Nav casing | sentence case (configurable) | header tokens | Match the original | |
| A7 | Heading accent bar | shown under h2 | `--h2-accent-display` | Hide unless the original has one | |
| A8 | Social share dock | floating, on every page | metadata `social-share: off` | Off for corporate/FS sites unless the original has one | 🩺 |
| A9 | Currency and locale | from metadata, defaulting to the base's | metadata `currency`, `locale` | From the original's market (URL path, footer) | 🩺 |
| A10 | Header layout | top nav | metadata `nav-layout` (`rail` …) | Match the original's frame | |
| A11 | Footer layout | base footer | metadata `footer-layout` (`legal` …) | Match the original | |
| A12 | Site notices | none | metadata `site-gate`, `consent` (+ fragments) | Recreate the original's disclaimer gate and cookie banner | |
| A13 | Control styling (search button, form buttons, selects, focus rings) | base tokens | brand tokens + block CSS | Every interactive control uses brand tokens. Check the search results page and every form | |
| A14 | Forms endpoint | `https://demo.bbird.live/contact-us/` | form block row 2 | **Always** this endpoint (hard rule); the rest of the form is best effort | 🩺 |
| A15 | Experimentation pill / preview overlays | shown on preview hosts | n/a | Expected on `.aem.page`; check the live site for the real look | |
| A16 | Logo treatment on dark surfaces | `--footer-logo-filter` | tokens | The logo must be visible on every surface it sits on | |
| A17 | Robots / indexing | noindex on preview | n/a | Leave it; demos must not be indexed | |
