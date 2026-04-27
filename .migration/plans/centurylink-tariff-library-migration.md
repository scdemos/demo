# Copenhagen Products Page Migration Plan

## Overview
- **Source URL**: https://6cad-108-6-175-67.ngrok-free.app/Copenhagen_Products.html
- **Migration Mode**: Single Page
- **Method**: Automated scraping, analysis, and content import
- **Target Path**: `/drafts/jihuang/products`

## Approach
Migrate the Copenhagen Products page through the full automated workflow:
1. Scrape the page from the ngrok URL to extract content, images, and metadata
2. Analyze page structure — expected sections: product categories (Wintergreen, Mint, Natural, Straight, Original, Other) with product card grids
3. Map content to EDS block variants (cards blocks for product grids)
4. Generate import infrastructure (parsers and transformers)
5. Execute content import to produce AEM-ready HTML
6. Preview and verify the migrated page

## Checklist

- [x] Receive page URL from user
- [ ] Project setup (detect project type, configure block library)
- [ ] Site analysis (create page template skeleton for `copenhagen-products`)
- [ ] Page analysis (scrape ngrok URL, identify sections, authoring decisions, block variants)
- [ ] Block mapping (populate DOM selectors into page templates)
- [ ] Import infrastructure (generate parsers and transformers)
- [ ] Content import (generate import script, bundle, execute import)
- [ ] Move content to `drafts/jihuang/`
- [ ] Preview and verify migrated page renders correctly

## Notes
- The source URL is an ngrok tunnel — it may be temporary. Migration should be executed promptly.
- A previous manual migration of this page exists at `drafts/jihuang/products.plain.html` — the automated import will replace it with a more accurate version scraped from the live HTML.

**Ready to execute — switch to Execute mode to begin the migration.**
