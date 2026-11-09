---
name: customer-demo
description: Turn the scdemos/demo base site into a fully baked, customer-branded AEM Edge Delivery demo from a single customer URL. Seeds a destination GitHub repo + DA folder from the base, extracts the customer's brand, maps their pages onto the base block library, imports content into DA, previews, and QA-checks against the original. Use when a solution consultant says "create a demo for <customer url>", "customer demo", "make a demo site like <url>", or runs /customer-demo.
---

# Customer Demo Factory

You turn **one customer URL** into a working, customer-relevant demo site built on the
`scdemos/demo` base. The solution consultant (SC) should have to do **one thing**: run
`/customer-demo <url>` and answer **one form**. Everything after that is your job. Do not
stop to ask questions that you can answer yourself.

The base already ships the block library, section styles, experimentation/audiences/campaigns,
martech, dark mode, sidekick plugins, CloneIt, the demo walkthrough, and preflight checks.
**You reskin and refill it.** You do not rebuild it.

## Inputs

| Input | Source | Required |
|---|---|---|
| Customer URL | The command argument | yes |
| Destination GitHub repo URL | Single `ask_user` form | yes |
| Destination DA `org/site` | Same form. Default: `<repo owner>/<repo name>` | yes |
| Page scope | Same form. Default: **home + top nav pages (max 8)** | no |
| Locale | Inferred from the URL path (e.g. `/tw/en` → `en`) | no |

Ask for **all** inputs in **one** `ask_user` call, with defaults pre-filled. Never ask again
unless preflight reports a blocker.

## Reference files

- `references/demo-manifest.json`: the blocks, variants, section styles, brand slots and
  features the base provides. **Read it before mapping anything.**
- `scripts/preflight.mjs`: checks the customer site, the destination repo, Code Sync and DA.

## Pipeline

Track each phase as a todo. Run the phases in order. Keep going until the handoff, unless you hit a ⛔ blocker.

### 0. Environment check

Do these checks silently, and only report failures:
- The DA MCP responds: `da_list_sources` on `scdemos/demo`. If it fails, tell the SC to sign
  in to DA and run the `da-auth` skill.
- GitHub is authenticated: run `gh auth status`, or use the GitHub MCP, or check that
  `git ls-remote` works against the destination.
- The EMA MCP is available. It is optional and only needed as a fallback.
- The SC needs **one of** GitHub Copilot (VS Code) or Claude Code. If neither has the MCP
  servers configured, point to `.vscode/mcp.json` or `.mcp.json` in the repo root.

### 1. Preflight

```bash
node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo <repo> --da <org/site>
```

Read the JSON summary at the end of the output.
- `repo` ⛔ not found: tell the SC to create an **empty** repo at the URL they gave you and
  wait. This is the only allowed pause besides Code Sync.
- `code-sync` ⏳ or ⛔: go on to seed the code (step 2), then tell the SC:
  "Install AEM Code Sync on `<owner>/<repo>`: https://github.com/apps/aem-code-sync". Re-run
  preflight until `code-sync` shows ✅. You can do brand and discovery (steps 3–4) while you wait.
- `source` ⚠️ (bot protected): use browser-based scraping (`playwright-cli` /
  `scrape-webpage` in headed mode). If that is also blocked, use EMA
  `submit_auto_migration` for the content capture only.

### 2. Seed code and content from the base

1. Clone `https://github.com/scdemos/demo` (branch `main`) into a temp working dir. Set the
   remote to the destination repo and push `main`. If the destination is not empty, push
   to a branch `custdemo` and open a PR instead.
2. Copy the base DA content `scdemos/demo` → `<org>/<site>`:
   - Use `da_list_sources` recursively, then `da_copy_content` per file.
   - Skip `drafts/`, `demo-docs/` and locale folders.
   - Copy `nav`, `footer`, `metadata` and the `placeholders` sheets. You will overwrite them later.
3. Site config: `fstab.yaml` and `head.html` already come with the code. Point the
   content source to `https://content.da.live/<org>/<site>/`. For repoless/org config,
   follow the CloneIt approach (`tools/cloneit/README.md`, steps 4–5).
4. Update `tools/sidekick/config.json` → `"project": "<Customer> Demo"`.
5. **Access**: the demo uses the customer's own assets, so it must not be public. Tell the
   SC how to set `access.admin` / `requireAuth` on the site config if their org allows it.
   Otherwise, note in the handoff that the preview URL is unlisted but not protected.

### 3. Discover

1. Open the customer URL in a browser (Playwright). Capture:
   - a full-page screenshot at 1440 px and at 390 px
   - the computed styles of `body`, `h1`–`h3`, `a`, the primary button and the header
   - the header nav links and the footer links
2. Pick pages: the home page plus up to 7 top-nav pages, **one per distinct template**
   (listing, article/insight, product/fund detail, about, contact). Record the list in
   the session SQL as a `pages` table with columns `url, template, status`.

### 4. Brand (reskin, no rebuild)

Edit **only** the `BRAND TOKENS` block, the font tokens, `--border-radius-heritage`,
`--border-heritage` and `--shadow-glow-*` in `styles/styles.css`. Map the customer's colors
to the brand slots listed in `demo-manifest.json.brandSlots`. Do **not** rename tokens:
- primary → `--color-rust` (and the hover/lighter shade → `--color-rust-bright`)
- accent/highlight → `--color-gold`
- light background → `--color-parchment`; body text → `--color-ink`
- dark background → `--color-obsidian`; dark surface → `--color-card-dark`; muted text → `--color-muted`

Fonts:
- If the customer font is open (Google Fonts or OFL), download the woff2 into `/fonts`, and
  add `@font-face` to `styles/fonts.css`.
- If it is proprietary, pick the closest open font (match x-height, width and weight) and
  write the reason in the handoff.
- Keep a metric-matched fallback so the page has no layout shift (CLS).

Logo and favicon:
- Upload the logo to DA with `da_upload_media` and reference it in `nav`.
- Replace `favicon.ico`.

Also re-check the hard-coded hex values in the files listed in `brandSlots.hardcodedHex`.

Commit the change as `feat: apply <customer> brand tokens`.

### 5. Map (manifest first)

For each picked page, run `identify-page-structure` on the scraped output. Then map each
section by following `mappingRules`, in this order:
1. an existing block, using an existing variant
2. a **new CSS-only variant** on an existing block
3. a new section style
4. a new block. Use this only as a last resort, and use `content-driven-development` / `building-blocks`.

Write the mapping as a table in the session SQL: `page, section, customer_pattern, block,
variant, action`. Reuse finance blocks wherever they fit: `table` for fund facts,
`product-grid` for fund lists, `quiz` for risk profiling, the calculators, `tabs`, `faq`,
`related-articles` for insights.

### 6. Build

Implement every new variant, section style and block in the working repo:
- `npm run lint` must pass.
- No new runtime dependencies. Mobile-first CSS. Breakpoints at 600, 900 and 1200 px.
- Add every new variant or block to `references/demo-manifest.json`, so the next demo
  inherits it.

Commit and push. Code Sync deploys it to aem.page.

### 7. Content

For each page, run `generate-import-html`, which uses the mapping from step 5. Then:
- Rewrite `nav` and `footer` to match the customer's IA (top level plus key links).
- Write the documents to DA with `da_create_source` / `da_update_source`, then call
  `da_preview_content`.
- Images: download them from the customer page, upload them with `da_upload_media`, and
  keep meaningful `alt` text.
- Dynamic or regulated data (fund prices, NAV, logins, document libraries): use static
  sample values in a `table` / `product-grid` index, and add a short note in the page
  metadata saying the data is a demo.
- Update the `metadata` sheet: title suffix, `og:image` and the default template.
- Generate `query-index` content by previewing the insight/article pages.

### 8. Bake in demo features

Customize every feature so it uses the customer's own content:
- **Experimentation**: on the home page, add an experiment with a challenger that has a
  different hero headline or CTA, written in the customer's voice.
- **Audiences**: give the home hero a `mobile` / `desktop` audience variant.
- **Campaigns**: add one campaign variant on the home page that matches a real customer
  theme (e.g. a fund launch or market outlook).
- **Interactive**: add one quiz or calculator page that suits the customer's industry.
- **Forms**: add a contact or subscribe form using `form` / `n8n-form`.
- **Demo walkthrough**: write a `tools/demo` script with 5–7 stops that tell the story
  (authoring in DA, preview → publish, experimentation overlay, personalization,
  Lighthouse 100).

### 9. QA loop (maximum 3 passes per page)

For each page:
- Take Playwright screenshots of the original and of `https://main--<repo>--<owner>.aem.page/<path>`,
  at 1440 and 390 px.
- List the top 5 visual differences (spacing, type scale, colors, section order, missing
  content). Fix them through tokens or variants first, then content.
- Run a Lighthouse/PSI check on the home page. The target is 100 for performance,
  accessibility, best practices and SEO, and it must not go below 90.
- Make sure the preview has no console errors, and that the sidekick and experimentation
  overlay load.

### 10. Handoff (the only long message to the SC)

Report, in this order:
- Preview, live, DA edit and repo URLs.
- The page list, each with a ✅ or ⚠️ fidelity note.
- The features baked in, and where to show them.
- Substitutions made: fonts, mocked data, skipped interactions.
- Manual follow-ups, which should be few: Code Sync (if still pending), site access, and
  any brand sign-off.
- The demo walkthrough link.

## Guardrails

- Never edit `scripts/aem.js`, `head.html` or `package-lock.json`. Never commit secrets.
- Branch names are at most 8 lowercase alphanumeric characters, e.g. `custdemo`.
- Use conventional commits (`feat:`, `fix:`, `chore:`).
- Never fork a base block into a customer-specific copy. Use a variant instead.
- Keep customer assets out of the base `scdemos/demo` repo. They go only to the
  destination repo and DA.
- If a phase fails twice, record the failure, use a sensible fallback (a simpler block, a
  placeholder image, static data) and keep going. Report it in the handoff instead of
  stopping.
