# Paylocity Site Migration Plan

## Overview

Migrate 2 pages from paylocity.com to AEM Edge Delivery Services with Document Authoring (DA), achieving pixel-perfect match with the original site:

| # | Source URL | Target Path |
|---|-----------|-------------|
| 1 | https://www.paylocity.com/ | `/index` |
| 2 | https://www.paylocity.com/products/ | `/products` |

## Project Context

- **Project type**: Document Authoring (DA)
- **Existing blocks** (24): faq, table, teaser, form, fragment, product-grid, networth-calculator, tabs, search, hero, columns, auth-toggle, quiz, header, dynamic, related-articles, modal, embed, cards, savings-rate-calculator, social-share, journey-map, compound-interest-calculator, footer
- **Import infrastructure**: Not yet created (no `tools/importer/` or `migration-work/` directories)
- **Content directory**: Empty (`/content/`)

## Goals

1. **Global design migration** — Extract Paylocity's design system (colors, typography, spacing, layout tokens) and adapt `styles/styles.css` to match
2. **Exact visual match** — Create new blocks as needed so migrated pages look exactly like the originals
3. **Content import** — Generate structured HTML content for both pages

## Approach

### Phase 1: Global Design Migration
Extract and apply Paylocity's design system to the EDS project:
- Colors (brand palette, backgrounds, text colors)
- Typography (fonts, sizes, weights, line heights)
- Spacing and layout tokens
- Button styles, link styles, form element styles
- Update `styles/styles.css` and `styles/fonts.css`

### Phase 2: Site & Page Analysis
1. **Site Analysis** — Classify URLs into page templates
2. **Page Analysis** — Scrape each page, identify sections, blocks, and content patterns
3. **Block Mapping** — Map elements to existing blocks or identify new blocks needed

### Phase 3: Block Development
- Create new blocks for any content patterns not covered by existing blocks
- Style all blocks (new and existing) to match Paylocity's exact visual appearance
- Ensure responsive behavior matches the original site

### Phase 4: Content Import
1. Generate import infrastructure (parsers + transformers)
2. Execute import for both pages
3. Preview and validate against originals

### Phase 5: Visual Validation
- Compare migrated pages against originals
- Fix any CSS/styling discrepancies until pixel-perfect
- Validate responsive behavior at all breakpoints

## Checklist

- [ ] Scrape and analyze paylocity.com global design (colors, fonts, spacing, buttons)
- [ ] Migrate global styles — update `styles/styles.css` to match Paylocity design tokens
- [ ] Update `styles/fonts.css` with Paylocity typography
- [ ] Run site analysis on both URLs to create page templates
- [ ] Analyze homepage (paylocity.com/) — scrape, identify sections, map blocks
- [ ] Analyze products page (paylocity.com/products/) — scrape, identify sections, map blocks
- [ ] Create new blocks as needed for unmatched content patterns
- [ ] Style all blocks to exactly match Paylocity's visual design
- [ ] Generate import infrastructure (parsers + transformers)
- [ ] Execute content import for homepage → `/index`
- [ ] Execute content import for products page → `/products`
- [ ] Preview and validate homepage against original
- [ ] Preview and validate products page against original
- [ ] Iterate on CSS fixes until exact visual match is achieved
- [ ] Migrate header/navigation to match Paylocity nav structure
- [ ] Migrate footer to match Paylocity footer design

## Risks & Considerations

- **Interactive elements**: Paylocity uses complex animations, carousels, and interactive UI that may need custom JavaScript
- **Third-party assets**: Fonts, icons, and images need to be sourced/downloaded appropriately
- **Forms**: Demo request CTAs may require form block integration
- **Video/media**: Embedded videos or animated backgrounds need embed block or custom handling
- **Navigation**: Complex mega-menu navigation may need significant header block enhancement

## Execution

This plan requires **Execute mode** to proceed with implementation. The site migration skill will orchestrate the full workflow, starting with global design extraction and proceeding through page analysis, block development, and content import.
