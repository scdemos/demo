---
name: customer-demo
description: Turn the scdemos/demo base site into a fully baked, customer-branded AEM Edge Delivery demo from a single customer URL. Seeds a destination GitHub repo + DA folder from the base, extracts the customer's brand, maps their pages onto the base block library, imports content into DA, previews, and QA-checks against the original. Use when a solution consultant says "create a demo for <customer url>", "customer demo", "make a demo site like <url>", or runs /customer-demo.
---

# Customer Demo Factory

You turn **one customer URL** into a working, customer-relevant demo site built on the
`scdemos/demo` base. The solution consultant (SC) should have to do **one thing**: run
`/customer-demo <url>`. Everything after that is your job: repo, DA, Code Sync, brand,
content, features and QA. Do not stop to ask questions that you can answer yourself.

The base already ships the block library, section styles, experimentation/audiences/campaigns,
martech, dark mode, sidekick plugins, CloneIt, the demo walkthrough, and preflight checks.
**You reskin and refill it.** You do not rebuild it.

## Inputs: the URL is the only one

The SC provides **only the customer URL**. Derive everything else yourself and do **not**
ask, unless the SC passed an override in the prompt (e.g. `repo=…`, `da=…`, `org=…`):

| Value | How to derive it | Example (manulifeim.com/institutional/tw/en) |
|---|---|---|
| `slug` | Registrable domain without TLD or `www`, lowercase `[a-z0-9]`, max 20 chars. Add a short path hint when the URL is a sub-site. If the repo already exists, append `2`, `3`, … | `manulifeim` |
| GitHub owner | The `org=` override, otherwise **`scdemos`**. Use the SC's own login (`get_me`) only if they can't create repos in `scdemos`. | `scdemos` |
| Repo | `<owner>/<slug>` | `scdemos/manulifeim` |
| DA `org/site` | `<owner>/<slug>`. The DA org matches the GitHub owner, so aem.page and DA line up. | `scdemos/manulifeim` |
| Page scope | Home + top nav pages, one per template, **max 8** | |
| Locale | From the URL path | `en` |
| Customer name | From `og:site_name`, otherwise the `<title>` brand, otherwise the domain | `Manulife Investment Management` |

Announce the derived values in **one line**, then continue without waiting.

## Reference files

- `references/demo-manifest.json`: the blocks, variants, section styles, brand slots and
  features the base provides. **Read it before mapping anything.**
- `scripts/preflight.mjs`: checks the customer site, the destination repo, Code Sync and DA.

## Pipeline

Track each phase as a todo. Run the phases in order. Keep going until the handoff, unless you hit a ⛔ blocker.

### 0. Environment check

Do these checks silently, and only report failures:
- **DA MCP**: run `da_list_sources(org: "scdemos", repo: "demo")`. If it fails, have the SC
  sign in to da.live, then use the `da-auth` skill.
- **GitHub MCP**: run `get_me`. If it fails, have the SC sign in to GitHub in Copilot or
  Claude (`.vscode/mcp.json` / `.mcp.json` already declare the server).
- **git**: there must be a local `git` that can push to github.com. Check with
  `git ls-remote https://github.com/scdemos/demo`.
- **EMA MCP**: optional. It is only used as a scraping fallback.

### 1. Provision the destination (fully automatic)

1. **Create the repo** with GitHub MCP `create_repository`:
   - name `<slug>`, organization `<owner>` (omit it for a personal account), `private: false`
     (Code Sync needs at least read access), `autoInit: false`
   - description: `<Customer> demo built from scdemos/demo`
   - If the name is taken, try the next suffix. Do not reuse an existing non-empty repo
     unless the SC passed `repo=`.
2. **Seed the code**. Run these from a temp dir. Never run them in the SC's working copy:
   ```bash
   git clone --depth 1 https://github.com/scdemos/demo.git <tmp>/<slug>
   cd <tmp>/<slug> && rm -rf .git && git init -b main
   ```
   Then make these changes before the first commit:
   - **Do not add `fstab.yaml`.** The base uses the Config Service. Once AEM Code Sync is
     installed on the repo, the site config is created automatically, with content
     pointing to `https://content.da.live/<daOrg>/<daSite>/`. Because the DA org/site
     equals `<owner>/<slug>`, nothing has to be configured by hand.
   - Set `"project"` in `tools/sidekick/config.json` to `"<Customer> Demo"`.
   - In `README.md`, replace the Environments URLs with
     `main--<slug>--<owner>.aem.page/.live` and `da.live/#/<daOrg>/<daSite>`.

   Commit with `chore: seed from scdemos/demo`, then
   `git remote add origin https://github.com/<owner>/<slug>.git && git push -u origin main`.
3. **Code Sync**: the GitHub API cannot install GitHub Apps, so run this detect-and-poll loop:
   ```bash
   node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo <owner>/<slug> --da <daOrg>/<daSite> --wait 600
   ```
   - If the org already has AEM Code Sync on **All repositories**, the check passes within
     seconds and the SC sees nothing. The Config Service creates the site → DA mapping
     automatically.
   - If it doesn't pass, the script prints `installUrl`. Open it for the SC with
     `openBrowserPage`, or print it if that tool isn't available:
     **https://github.com/apps/aem-code-sync/installations/new**. Tell them in one line:
     "Select `<owner>` → add `<slug>` → Install." The script keeps polling for up to 10 min.
     **Continue with phases 2–5 while it polls.** Code is only needed on aem.page from
     phase 6 onward.
   - Once Code Sync passes, also trigger one code sync by pushing an empty commit, if
     `aem.page/scripts/aem.js` still returns 404.
4. **Access**: the demo uses customer assets, so it must not be indexed. The base
   `robots.txt` / `.aem.page` are already non-indexed. Note in the handoff that the
   preview URL is unlisted. If the SC wants authentication, link
   https://www.aem.live/docs/authentication-setup-site.

### 2. Seed DA content from the base

- Copy `scdemos/demo` → `<daOrg>/<daSite>`. List the files recursively with
  `da_list_sources`, then call `da_copy_content` for each file.
  - Skip `drafts/`, `demo-docs/` and locale folders.
  - Include `nav`, `footer`, `metadata`, `placeholders`, the experiment/campaign pages and
    the sample indexes. Later phases overwrite them; until then they keep every base
    feature working.
- Run `da_preview_content` on `/`, `/nav` and `/footer` so the site renders right away.

### 0→2 failure policy

The only things that justify talking to the SC before the handoff:
- `create_repository` is forbidden in every candidate owner.
- DA returns 401/403 for `<daOrg>`.
- Code Sync is still missing after the 10-minute poll.

In each of these cases, send **one** message with the exact link or action needed, then
resume as soon as it's fixed.

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
- Manual follow-ups, which should be few: Code Sync install (only if the poll timed
  out), site access, and any brand sign-off.
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
