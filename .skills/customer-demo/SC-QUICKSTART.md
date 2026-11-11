# Customer demo in one prompt: SC quick start

Turn **one customer URL** into a branded, working AEM Edge Delivery demo built on `scdemos/demo`,
in two moves: **create the site in CloneIt** (about 2 minutes, no GitHub or admin rights needed),
then **paste one prompt** into your AI tool. You approve commits once and do the final look-through.

## Before your first demo (once, about 10 minutes)
| You need | How |
|---|---|
| An AI harness | VS Code + **GitHub Copilot** (agent mode, best: its integrated browser), **Claude Code**, Cursor, Gemini CLI, or the ChatGPT desktop app / Codex. Open the demo repo (CloneIt's **Open in VS Code**). |
| MCP servers signed in | **DA** and **EMA** (+ GitHub) come preconfigured; accept the sign-in prompts. See *Connect DA and EMA* below. |
| Access | Write access to the **`scdemos`** DA org with your Adobe account. |
| Tools | Run **`node .skills/customer-demo/scripts/setup-check.mjs --fix`** once. It checks Node, git, the AEM CLI and Lighthouse, and installs Playwright plus the matching Chromium outside the repo. |
| GitHub | Be a member of the scdemos GitHub org. CloneIt asks your GitHub username once and makes you admin of each demo repo you create. |
| Org setup (admins, once) | The CloneIt worker's `GITHUB_PROVISION_TOKEN` secret (required to create demos). |

## Run it
1. **Create the demo:** open **CloneIt** in DA (`https://da.live/app/scdemos/demo/tools/cloneit/cloneit`,
   signed in), enter the **customer site** URL (the site name is suggested from it, editable), your GitHub username
   (first time only) and click **Create demo**. CloneIt creates your own repo `scdemos/<slug>` (you're admin)
   and DA folder, adds the repo to AEM Code Sync, copies the demo content and config, and publishes
   everything. You can demo the base site right away.
2. **Optional: make it look like the customer.** CloneIt shows the prompt with your customer site filled
   in. Click **Copy prompt**, **Open in VS Code** (or clone the repo in Claude Code) and paste it:
   ```
   /customer-demo https://www.acme.com/institutional/us/en
   ```
   Enter the **exact section** of the customer site in CloneIt (or edit the URL in the prompt): a deep link
   scopes the demo to that sub-site.

## Connect DA and EMA (MCP), once per tool
| Tool | Config in the repo | You do |
|---|---|---|
| VS Code + GitHub Copilot | `.vscode/mcp.json` | Start the servers in the MCP view, sign in with Adobe (DA, EMA) and GitHub |
| Copilot CLI / Copilot agent sessions, Claude Code | `.mcp.json` | Approve the project servers, then sign in (`/mcp` in Claude Code) |
| Cursor | `.cursor/mcp.json` | Settings → MCP: enable, sign in |
| ChatGPT desktop / Codex CLI / Codex IDE | `.codex/config.toml` (trust the project) | `codex mcp login da` and `codex mcp login adobe-aem-ema` |
| Gemini CLI | `.gemini/settings.json` (+ `/customer-demo` in `.gemini/commands/`) | `/mcp auth da` and `/mcp auth adobe-aem-ema` |
| Windsurf | none (user-level only) | Add both URLs to `~/.codeium/windsurf/mcp_config.json` (`serverUrl`), then sign in |
| ChatGPT web, Claude.ai / Claude Desktop | none (settings only) | Add a custom connector (ChatGPT: a plugin/connector in developer mode; Claude: Settings → Connectors → Add custom connector) with `https://mcp.adobeaemcloud.com/adobe/mcp/da` and `…/mcp/ema`. These can't run the scripts or the browser; use them for content work only |

## What happens, and when you're needed
| Phase | Agent does | You do |
|---|---|---|
| Create (CloneIt) | Repo `scdemos/<slug>` + AEM Code Sync, DA site, demo content, **all DA config sheets**, site config (you as admin), query index; previews and publishes everything | Pick the option and click once |
| Sign in (start) | Checks tools and MCP servers, opens **da.live in the integrated browser** | **Sign in once** in that tab (and to any MCP server it lists). That one sign-in covers DA, preview and publish for the whole run; no tokens to copy |
| Attach | Checks the site and starts `aem up` (**http://localhost:3000**). The base demo stays live until content starts | Nothing |
| Discover + design | Renders every page of the customer site in a real browser and analyzes the design: full nav with dropdowns / mega menus / sub-navs, header layout, type, buttons, cards, widths, every section's layout and carousels. Writes a design brief and maps every line to a block, variant or section style; anything that doesn't map becomes a **new** construct (added to the block library) | Nothing. Watch on `http://localhost:3000` |
| Build | Reskins the tokens and builds the header, footer and sections like the original. Then moves the base demo pages to DA **`drafts/demo-backup`** (unpublished; deleted once the migration passes, so DA stays clean), writes repeated sections once as fragments, and writes the **original pages with their real content** into DA | Nothing |
| Features | The customer's cookie banner and disclaimer gate (if they have them), login with their wording (the flow stays on demo.bbird.live), gated content when they have a client/member area, templates for articles and events, calculator (customer currency), forms → shared endpoint, site search, walkthrough deck, block library. **No experiments or campaigns by default**: add them in DA when your story needs one | Nothing |
| QA + final parity loop | Checks each page against the original, side by side on localhost: same pages, same words (invented copy fails), same header, same section layout and carousels, same look. Then `lint-content` → `doctor --strict` → strict `compare --final` (1440/390, dark OS) → Lighthouse → sign-off checklist, and loops back to fix what differs (up to 3 passes per page). The final step, `parity.mjs`, revisits **every page** against the original on localhost at desktop and phone size, fixes and re-tests until all pages pass; the agent only calls the migration done when it passes (and once more on the published site). Last, `lighthouse.mjs` scores every page on mobile and desktop: Performance, Accessibility and Best Practices must be **100** (SEO excluded: demos are noindex). A page that still differs is listed with its failing checks, and only **you** can waive a fidelity gap | Review the handoff; decide on any listed gap |
| Commits | Commits to `scdemos/<slug>` under the OK you gave at the start. New generic variants are proposed for the base as a **PR from a separate branch**, checked to leave the base look unchanged | Say **yes once** at the start; approve or decline the base PR |

## What you get
- Preview/live: `https://main--<slug>--scdemos.aem.page|live/`, DA: `da.live/#/scdemos/<slug>`, repo: `github.com/scdemos/<slug>`
- A **parity matrix**: every page against the original for design, content, look & feel, functionality (menus, mobile menu, carousels, tabs, forms, search), notices & login, and base features, each ✅ / ⚠️ with a reason; the features list and where to show them; the walkthrough link
- A sign-off checklist with evidence, and a local run report (`references/pilot-reports/`, not committed)

## Your 15-minute look-through before the meeting
1. Open home and 2 key pages **side by side with the original**, on desktop and phone.
2. Click the nav (including dropdowns), search for a customer term, use the carousels and forms.
3. Open DA → a page → **Library**: blocks, templates, icons and tags show up.
4. Read the ⚠️ list (e.g. a substituted font, mocked data) so nothing surprises you live.
5. Rehearse with the walkthrough deck (`/tools/demo/demo.html?url=/tools/demo/<slug>-walkthrough.json`).

## Do / don't
- **Do** let it run end to end; answer only the sign-in and commit-approval prompts. Point out misses in plain words ("hero should be a carousel", "footer needs the legal band").
  The agent picks the right fix (variant vs new block) and adds it generically.
- **Do** give the exact section URL. The agent takes its real pages: home, every top-nav page, the pages their CTAs and forms lead to, the legal pages and one per page type (usually 8–15; it asks you above 20).
- **Don't** submit demo forms for real. They post to a shared live Slack channel; agents test in dry-run.
- **Don't** edit `scdemos/demo` `main` or another SC's demo. Customer changes live in `scdemos/<slug>`.
- **Don't** commit customer assets to the base repo.

## When something's off
| Symptom | Ask the agent to… |
|---|---|
| Page looks unlike the original | "Run parity.mjs for /page and close every item on the fix list" (header, layout, carousel, copy and behavior differences are all checks) |
| Made-up text on a page | "Replace invented copy with the original's (provenance check)" |
| Want the original demo pages back | During the run they're in DA under `drafts/demo-backup`; after a successful migration that copy is deleted. The base demo always stays at `da.live/#/scdemos/demo` |
| Want an experiment or campaign | "Add an experiment on the home hero with a challenger from <page>" |
| Run got interrupted | Paste the same prompt again: it resumes from `.customer-demo/run.json` and skips finished work |
| Search, forms or links broken | "Run doctor.mjs and fix all FAILs" |
| Dark or odd colors on your laptop | "Check color-scheme and the base assumptions" |
| Library panel empty | "Re-run the DA config migration (da-config.mjs) and the library phase" |
| CloneIt says "sign in" or "isn't enabled yet" | Sign in to da.live with your Adobe account and open CloneIt from DA. "Not enabled" = the admin hasn't set the provisioning token yet |
| CloneIt: repo created but not in Code Sync | Ask an scdemos admin to add the repo to AEM Code Sync, then run CloneIt again with the same name |
| CloneIt: "isn't a member of scdemos" | Check the GitHub username spelling, or ask an scdemos admin to add you to the org |
| Agent can't run browsers or scripts | `node .skills/customer-demo/scripts/setup-check.mjs --fix` |
| Publish / config calls fail with 401 | Sign in to `da.live` again in the agent's browser tab (the sign-in lasts about a day) |

**Feedback loop:** each run ends with a retro. When you hit something new, say so. The fix goes
into the skill, a script check or the base, so the next SC doesn't hit it.

<!-- docs-check: synced-with=b66f81583c26eb4f -->
