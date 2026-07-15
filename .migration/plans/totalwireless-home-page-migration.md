# Total Wireless /m/home Migration — Import Infrastructure + Content Import

## Where things stand (verified on disk)
- **Project setup** — `.migration/project.json` = `xwalk` + library URL. ✅
- **Site analysis** — `tools/importer/page-templates.json` with the `home` template. ✅
- **Page analysis** — `migration-work/` has `authoring-analysis.json`, `cleaned.html`, `metadata.json`, screenshot, 116 images, `page-structure.json`. ✅
- **Block mapping** — 9 block variants mapped to DOM selectors + section metadata. ✅
- **Block variant code** — all 9 block folders created. ✅
- **Import infrastructure (partial)** — 9 parsers + 3 transformers (`cleanup`, `sections`, `dm-images`) generated. ✅

## Scope of this request: finish Import Infrastructure + run Content Import
Source has **55 Scene7 Dynamic Media URLs**, so DM wiring (5a–5c) must land before import, then generate the import script and run it.

1. **DM auto-block (Step 5a)** — install `buildDynamicMediaImages` + `window.__dmRender__` in `scripts/scripts.js`, call it in `buildAutoBlocks(main)`, allow-list `__dmRender__` in `.eslintrc.js`.
2. **aem.js dispatcher (Step 5b)** — 5-line DM dispatch at top of `createOptimizedPicture` in `scripts/aem.js`.
3. **xwalk model override (Step 5c)** — flip `reference`→`richtext` on image-pattern fields in the 9 blocks' `_*.json` models.
4. **Import script (Step 6.3)** — generate `tools/importer/import-home.js` binding the 9 parsers + 3 transformers.
5. **Content import (Step 6.4)** — bundle + run import for home URL → `content/*.plain.html` + `tools/importer/reports/home.report.xlsx`.
6. **Verify** — content file present, lint/syntax clean, DM anchors present.

## Checklist
- [ ] Step 5a: Install DM/Scene7 auto-block in `scripts/scripts.js` + eslint allow-list
- [ ] Step 5b: Patch DM dispatcher into `scripts/aem.js` `createOptimizedPicture`
- [ ] Step 5c: Apply `reference`→`richtext` model override across the 9 block `_*.json` files
- [ ] Step 6.3: Generate `tools/importer/import-home.js`
- [ ] Step 6.4: Bundle + run content import → home `content/*.plain.html` + report
- [ ] Verify import output (content file present, lint/syntax clean, DM anchors present)

## Deferred (later, not this request)
- [ ] Design migration: extract tokens/styles, apply to blocks
- [ ] Instrument header/navigation (desktop + mobile)
- [ ] Instrument footer
- [ ] Visual comparison against original; iterate

## Note
**Execution requires Execute mode**, which I cannot toggle — please approve this plan / enable accept-edits from the UI. As soon as the session is in Execute mode, send any short message ("go") and I'll run Steps 5a → 6.4 end-to-end and report the import results, no further questions.
