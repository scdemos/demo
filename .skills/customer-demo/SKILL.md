---
name: customer-demo
description: Turn the scdemos/demo base site into a fully baked, customer-branded AEM Edge Delivery demo from a single customer URL. Seeds a destination GitHub repo + DA folder from the base, extracts the customer's brand, maps their pages onto the base block library, imports content into DA, previews, and QA-checks against the original. Use when a solution consultant says "create a demo for <customer url>", "customer demo", "make a demo site like <url>", or runs /customer-demo.
---

# Customer Demo Factory

You turn **one customer URL** into a working, customer-relevant demo site built on the
`scdemos/demo` base. The solution consultant (SC) should have to do **one thing**: run
`/customer-demo <url>`, plus one click to install AEM Code Sync on the new repo.
Everything else is your job: repo, DA, brand, content, features and QA. Do not stop to ask
questions that you can answer yourself.

The base already ships the block library, section styles, experimentation/audiences/campaigns,
martech, dark mode, sidekick plugins, CloneIt, the demo walkthrough, and preflight checks.
**You reskin and refill it.** You do not rebuild it.

## Inputs: the URL is the only one

The SC provides **only the customer URL**. Derive everything else yourself and do **not**
ask, unless the SC passed a `slug=` override in the prompt.

**Everything lives in the `scdemos` space**, next to the base (`scdemos/demo`). This keeps
every customer demo in one place for tracking, observability and accounting. Never create
a demo in a personal account or in another org.

| Value | How to derive it | Example (manulifeim.com/institutional/tw/en) |
|---|---|---|
| `slug` | Registrable domain without TLD or `www`, lowercase `[a-z0-9]`, max 20 chars. Add a short path hint when the URL is a sub-site. If `scdemos/<slug>` already exists in GitHub **or** DA, append `2`, `3`, … | `manulifeim` |
| GitHub repo | Always `scdemos/<slug>` | `github.com/scdemos/manulifeim` |
| DA site | Always `scdemos/<slug>`, the same name as the repo, so the Config Service maps code → content automatically | `da.live/#/scdemos/manulifeim` |
| Preview | `https://main--<slug>--scdemos.aem.page/` | |
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

### 1. Provision in scdemos (repo → Code Sync → DA → content)

Do these steps in this order. Step 1c is the **only planned SC action** in the whole run.

#### 1a. Create the GitHub repo
- Call GitHub MCP `create_repository` with:
  - `organization: "scdemos"`, `name: "<slug>"`
  - `description: "<Customer> demo built from scdemos/demo (source: <url>)"`
  - `private: false`, `autoInit: false`
- If the call fails with 403, the SC lacks repo-create rights in `scdemos`. That is a ⛔
  blocker: tell them to ask an `scdemos` owner for access.

#### 1b. Seed the code
Run this from a temp dir, never in the SC's working copy:
```bash
git clone --depth 1 https://github.com/scdemos/demo.git <tmp>/<slug>
cd <tmp>/<slug> && rm -rf .git && git init -b main
```
Before the first commit:
- **Do not add `fstab.yaml`.** Once Code Sync is installed, the Config Service creates the
  site config and maps it to `https://content.da.live/scdemos/<slug>/` automatically.
- Set `"project"` in `tools/sidekick/config.json` to `"<Customer> Demo"`.
- In `README.md`, set the Environments section to `main--<slug>--scdemos.aem.page/.live`
  and `da.live/#/scdemos/<slug>`.

Then commit and push:
```bash
git add -A && git commit -m "chore: seed from scdemos/demo"
git remote add origin https://github.com/scdemos/<slug>.git && git push -u origin main
```

#### 1c. Code Sync: the one SC action
The app can't be installed through an API, and `scdemos` installs it per repository, so
this always needs the SC:
1. Open **https://github.com/apps/aem-code-sync/installations/new** for the SC with
   `openBrowserPage`. If that tool isn't available, print the link.
2. Tell the SC, in one short message:
   > Install AEM Code Sync on the new repo: choose **scdemos** → **Only select repositories**
   > → add **`<slug>`** → **Install** (or **Save** if scdemos already has the app). I'll
   > keep going and pick it up automatically.
3. Start the background poll. Don't block on it; use async mode:
   ```bash
   node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo scdemos/<slug> --da scdemos/<slug> --wait 900
   ```
4. **Keep working on 1d, 2, 3, 4 and 5 while it polls.** Only phase 6 (build/verify on
   aem.page) needs Code Sync.
5. When the poll reports `code-sync ✅`, run `git commit --allow-empty -m "chore: trigger code sync" && git push`
   if `aem.page/scripts/aem.js` is still 404.
6. If the poll times out, re-show the link once and wait. This is a ⛔ blocker for phase 6.

#### 1d. Create the DA site folder
Use the DA MCP. Create the folder by writing its first document:
- `da_create_source(org: "scdemos", repo: "<slug>", path: "index.html", content: <minimal page with an h1 of "<Customer> Demo">)`
- Confirm with `da_list_sources(org: "scdemos", repo: "<slug>")`. The folder is then
  visible at `https://da.live/#/scdemos/<slug>`.
- If DA returns 401/403, that is a ⛔ blocker: the SC needs write access to the `scdemos`
  DA org.

#### Access note
The demo uses customer assets. `.aem.page` is not indexed, so in the handoff call the
preview URL unlisted, not protected. If the SC wants authentication, link
https://www.aem.live/docs/authentication-setup-site.

### 2. Seed DA content from the base

- Copy `scdemos/demo` → `scdemos/<slug>`. List the files recursively with
  `da_list_sources`, then call `da_copy_content` for each file. Overwrite the
  placeholder `index.html` from step 1d.
  - Skip `drafts/`, `demo-docs/` and locale folders.
  - Include `nav`, `footer`, `metadata`, `placeholders`, the experiment/campaign pages and
    the sample indexes. Later phases overwrite them; until then they keep every base
    feature working.
- Once Code Sync is ✅ (the site config exists), run `da_preview_content` on `/`, `/nav`
  and `/footer` so the site renders. Until then, queue the preview.

### Failure policy (phases 0–2)

Talk to the SC before the handoff only for:
- the Code Sync install (always, step 1c)
- `create_repository` returning 403 in `scdemos`
- DA returning 401/403 for `scdemos/<slug>`
- the Code Sync poll timing out

Each time, send **one** message with the exact link or action, then resume automatically.

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
- Take Playwright screenshots of the original and of `https://main--<slug>--scdemos.aem.page/<path>`,
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
- Manual follow-ups, which should be few: site access, any brand sign-off, and Code Sync
  only if it is still pending.
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
