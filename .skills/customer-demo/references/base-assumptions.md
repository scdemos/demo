# Base assumptions (P6: decide every base assumption)

The base (`scdemos/demo`) is opinionated. Each row is a default that a customer demo will
inherit **silently** unless you decide it. In phase 4 (brand), and again in the final sweep,
set every row to the customer's value, or confirm that the base value matches the original.
Record the decisions in the report. `scripts/doctor.mjs` checks the rows marked 🩺.

| # | Assumption | Base default | Where to set it | How to decide | 🩺 |
|---|---|---|---|---|---|
| A1 | Color scheme | follows the OS (`auto`): a dark OS turns the site dark | metadata sheet `color-scheme: light \| dark \| auto` | Light unless the original has a dark mode. If both, keep `auto` and add the nav theme toggle | 🩺 |
| A2 | Brand palette | Frescopa flame/aurora on ink/stone | BRAND TOKENS block in `styles/styles.css` | Extract from the original's computed styles | |
| A3 | Color literals | a few brand `rgb()` tints (e.g. the `ink` section glow, `--color-accent-glow`) | tokens / block CSS | Grep for the Frescopa rgb triplets after the reskin; none may remain visible | |
| A4 | Fonts | base heading/body faces | `styles/fonts.css` + tokens | Use the customer's font if it's open; otherwise the closest open match (report it ⚠️) | |
| A5 | Corner radius, shadows, gradients | rounded cards (`--radius-*`), soft shadows, `--gradient-vivid` | tokens | Match the original (often square corners and flat surfaces for corporate sites) | |
| A6 | Nav casing | sentence case | header CSS | Match the original | |
| A7 | Eyebrows | small uppercase label above headings (`.eyebrow`) | authored content | Use only where the original has kicker labels | |
| A8 | Social share dock | floating, on every page | metadata `social-share: off` | Off for corporate/FS sites unless the original has one | 🩺 |
| A9 | Market | `/{lang}/{region}/` paths set `<html lang>`, the market switcher and date formats | content folders | Mirror the original's markets; a single-market site still lives under one `/{lang}/{region}/` folder | |
| A10 | Header layout | top nav | metadata `nav-layout` (`rail` …) | Match the original's frame | |
| A11 | Footer layout | base footer | metadata `footer-layout` (`legal` …) | Match the original | |
| A12 | Site notices | none | metadata `site-gate`, `consent` (+ fragments) | Recreate the original's disclaimer gate and cookie banner | |
| A13 | Control styling (search button, form buttons, selects, focus rings) | base tokens | brand tokens + block CSS | Every interactive control uses brand tokens. Check the search results page and every form | |
| A14 | Forms endpoint | `https://demo.bbird.live/contact-us/` | form block row 2 | **Always** this endpoint (hard rule); the rest of the form is best effort | 🩺 |
| A15 | Experimentation pill / preview overlays | shown on preview hosts | n/a | Expected on `.aem.page`; check the live site for the real look | |
| A16 | Logo treatment on dark surfaces | header/footer draw the mark with `currentColor` | header/footer | The logo must be visible on every surface it sits on | |
| A17 | Robots / indexing | noindex on preview | n/a | Leave it; demos must not be indexed | |
