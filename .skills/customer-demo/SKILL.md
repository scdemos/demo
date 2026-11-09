---
name: customer-demo
description: Turn the scdemos/demo base site into a fully baked, customer-branded AEM Edge Delivery demo from just a customer URL or domain. Creates scdemos/<slug> in GitHub + DA, applies the brand, maps pages onto the base block library, imports content, bakes in demo features and QA-checks against the original. Use whenever someone says "demo <domain>", "demo for <customer>", "create a demo for <url>", "customer demo", "make a demo like <url>", or runs /customer-demo. A bare domain such as "manulifeim.com/institutional/tw/en" is enough.
---

# Customer Demo Factory

You turn **one customer URL** into a working, customer-relevant demo site built on the
`scdemos/demo` base. The solution consultant (SC) should have to do **one thing**: run
`/customer-demo <url>`. Everything else is your job: repo (through the self-service
provisioning issue), Code Sync, DA, brand, content, features and QA. Do not stop to ask
questions that you can answer yourself.

The base already ships the block library, section styles, experimentation/audiences/campaigns,
martech, dark mode, sidekick plugins, CloneIt, the demo walkthrough, and preflight checks.
**You reskin and refill it.** You do not rebuild it.

## Inputs: the URL is the only one

The SC provides **only the customer URL**, in any form: `https://www.x.com/a/b`,
`www.x.com/a/b`, `x.com/a/b`, or the bare domain `x.com`. Normalize it to `https://` and
follow redirects. Ignore extra words such as "demo", "for", "please" or "create". Derive everything else yourself and do **not**
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

SCs are **not** org admins, so the agent never creates the repo directly. Provisioning
goes through the self-service workflow in `scdemos/demo`
(`.github/workflows/provision-demo.yaml`). A bot with org-admin rights:
- creates the repo
- seeds it with the base code
- adds it to AEM Code Sync
- gives the SC `maintain` access

Each request is a GitHub issue, so the issue list is the audit log for every demo
(observability and accounting). **No SC action is needed.**

#### 1a. Request the repo (zero-touch)
- Open the issue with GitHub MCP `issue_write` (method `create`) on `scdemos/demo`:
  - title: `new-demo: <slug>`
  - body: `<customer url>` on the first line, then `Customer: <Customer name>`
  - labels: `["demo-request"]`
- Do **1d, 2 and 3** while you wait. None of them need the repo. Phase 4 (brand) starts in
  the local clone from 1c.

#### 1b. Wait for provisioning
- Every ~20 s, read the issue comments with `issue_read` (method `get_comments`). Stop after 10 min.
  - `provisioned ✅`: read the comment. It lists the repo, preview and DA URLs and the Code
    Sync status. Continue.
  - `⛔ … already exists`: choose the next slug suffix, then open a new issue.
  - `⛔ … secret is not configured` or `⛔ … not a member`: this is a setup problem, not
    something the SC can fix. Fall back to **1e**.
  - Any other `⛔`: report the run link in one line, then fall back to **1e**.
- If the comment says `⚠️ AEM Code Sync`, the bot couldn't add the repo to the app. Open
  https://github.com/apps/aem-code-sync/installations/new for the SC with
  `openBrowserPage`, with a one-line instruction: **scdemos → Only select repositories →
  add `<slug>` → Save**.
- Start the background poll so you know when aem.page serves the code:
  ```bash
  node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo scdemos/<slug> --da scdemos/<slug> --wait 900
  ```

#### 1c. Clone locally and start the dev server (the SC watches here)
As soon as the repo exists, clone it **next to the SC's workspace** so they can see and
test the work. Never use a hidden temp dir.
```bash
git clone https://github.com/scdemos/<slug>.git <workspace-parent>/<slug>
cd <workspace-parent>/<slug> && npx -y @adobe/aem-cli up --no-open --forward-browser-logs   # async, keep it running
```
- Tell the SC in one line: "Watch it build at http://localhost:3000. Code is
  `<workspace-parent>/<slug>`."
- `aem up` serves **local code** with content proxied from
  `main--<slug>--scdemos.aem.page`. Every code change in phases 4–6 shows up live at
  localhost before it is pushed.
- Personalize:
  - **Do not add `fstab.yaml`.** Code Sync creates the site config automatically, with
    content at `https://content.da.live/scdemos/<slug>/`. Verified: the config appears
    within seconds of the install.
  - Set `"project"` in `tools/sidekick/config.json`.
  - Set the README Environments section to the `<slug>` URLs.
- Commit and push with the SC's git. If no git credentials are available, use GitHub MCP
  `push_files`.

#### 1c-bis. Make sure the whole code bus is synced
Code Sync only syncs files changed by pushes **after** the install. A repo created from
the template **before** the install has an unsynced initial commit: aem.page then serves
your later CSS edits, but `scripts/*.js` and `blocks/*` return 404 (`x-error: [static:
content] S3: Not Found`). Check:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://main--<slug>--scdemos.aem.page/scripts/aem.js?cb=1"
```
If it returns 404, trigger a full code sync: `POST https://admin.hlx.page/code/scdemos/<slug>/main/*`.
This needs an authenticated admin/develop role. Run it from a browser that is signed in
at `https://admin.hlx.page/login/scdemos/<slug>/main`, or through the provisioning
workflow's token. Provisioning through the issue workflow avoids this, because the bot
adds the repo to Code Sync **before** pushing.

#### Site roles
The Code Sync installer becomes the only `admin` on the new site config. Add the SC's
Adobe email and `*@adobe.com` to `author`/`publish`, through the provisioning workflow or
the admin config API. Otherwise DA preview works, but publish and admin actions may be
denied.

#### 1d. Create the DA site folder
Use the DA MCP. Create the folder by writing its first document:
- `da_create_source(org: "scdemos", repo: "<slug>", path: "index.html", content: <minimal page with an h1 of "<Customer> Demo">)`
- Confirm with `da_list_sources(org: "scdemos", repo: "<slug>")`. The folder is then
  visible at `https://da.live/#/scdemos/<slug>`.
- If DA returns 401/403, that is a ⛔ blocker: the SC needs write access to the `scdemos`
  DA org.

#### 1e. Fallback when the workflow is unavailable
- Try GitHub MCP `create_repository` with `organization: "scdemos"`, name `<slug>`,
  `private: false`, `autoInit: false`. This works only for org admins.
  - On success: seed it from `scdemos/demo` with local git (clone the base, `rm -rf .git`,
    `git init -b main`, commit, push). Then open the Code Sync install page as in 1b.
  - On 403: send **one** message asking an `scdemos` admin to create the empty public repo
    `<slug>`, or to fix the provisioning setup. Include the issue link. Keep doing the
    non-repo phases meanwhile.

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

Talk to the SC before the handoff only when:
- provisioning falls back to 1e and the SC is not an admin
- the bot couldn't add the repo to Code Sync (one click, see 1b)
- DA returns 401/403 for `scdemos/<slug>`
- the Code Sync poll times out

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
