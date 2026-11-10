# Customer demo in one prompt: SC quick start

Turn **one customer URL** into a branded, working AEM Edge Delivery demo built on `scdemos/demo`.
The agent does the build. You give it the input, answer two prompts (Code Sync install, OK to
commit to your demo repo), and do the final look-through.

## Before your first demo (once, about 10 minutes)
| You need | How |
|---|---|
| An AI harness | VS Code + **GitHub Copilot** (agent mode) or **Claude Code**. Open a clone of `scdemos/demo` (`main`). |
| MCP servers signed in | DA, GitHub, EMA (optional) are preconfigured in `.vscode/mcp.json` / `.mcp.json`. Accept the sign-in prompts. |
| Access | Write access to the **`scdemos`** DA org; an Adobe login for `admin.hlx.page` and `da.live` in the same browser the agent drives. |
| Tools | Run **`node .skills/customer-demo/scripts/setup-check.mjs --fix`** once. It checks Node, git, the AEM CLI and Lighthouse, and installs Playwright plus the matching Chromium outside the repo. |
| Org setup (admins, once) | The `DEMO_PROVISION_TOKEN` secret on `scdemos/demo`, so repos are created for you. |

## Run it (one input)
```
/customer-demo acme.com/institutional/us/en
```
(or `demo acme.com`). Use the **exact section** of the customer site you want: a deep link
scopes the demo to that sub-site. Optional: `slug=acmeinvest` to choose the name.

## What happens, and when you're needed
| Phase | Agent does | You do |
|---|---|---|
| Provision | Opens a `new-demo: <slug>` issue → repo `scdemos/<slug>`; creates the DA site; copies site config, roles, query index, search page and **all DA config sheets** from the base | **Install AEM Code Sync** on the new repo when the link opens (one click) |
| Discover + brand | Renders every page in a real browser (`scrape.mjs`; works for client-rendered and bot-protected sites, and a browser window may open briefly), captures brand, images, forms and every section, then maps each pattern to a block, variant or section style | Nothing. Watch on `http://localhost:3000` |
| Build | Reskins the tokens, adds generic variants when needed, writes the content into DA, uploads images | Nothing |
| Features | Experiment, campaign, calculator (customer currency), forms → shared endpoint, site search, walkthrough deck, block library | Nothing |
| QA + sweep | `lint-content` → `doctor --strict` → strict `compare` (dark OS, 1440/390) → Lighthouse → sign-off checklist. Any gap it can't close is a **listed waiver with a reason**, never silent | Review the handoff and the waivers |
| Commits | Commits to `scdemos/<slug>` under the OK you gave at the start. New generic variants are proposed for the base as a **PR from a separate branch**, checked to leave the base look unchanged | Say **yes once** at the start; approve or decline the base PR |

## What you get
- Preview/live: `https://main--<slug>--scdemos.aem.page|live/`, DA: `da.live/#/scdemos/<slug>`, repo: `github.com/scdemos/<slug>`
- A per-page fidelity note (✅ / ⚠️ with a reason, including any fidelity waivers), the features list and where to show them, and the walkthrough link
- A sign-off checklist with evidence, and a local run report (`references/pilot-reports/`, not committed)

## Your 15-minute look-through before the meeting
1. Open home and 2 key pages **side by side with the original**, on desktop and phone.
2. Click the nav, search for a customer term, and open the experiment and campaign URLs from the handoff.
3. Open DA → a page → **Library**: blocks, templates, icons and tags show up.
4. Read the ⚠️ list (e.g. a substituted font, mocked data) so nothing surprises you live.
5. Rehearse with the walkthrough deck (`/tools/demo/demo.html?url=/tools/demo/<slug>-walkthrough.json`).

## Do / don't
- **Do** let it run end to end; answer only the Code Sync and commit-approval prompts. Point out misses in plain words ("hero should be a carousel", "footer needs the legal band").
  The agent picks the right fix (variant vs new block) and adds it generically.
- **Do** scope tightly: home plus about 8 key pages beats 30 shallow ones.
- **Don't** submit demo forms for real. They post to a shared live Slack channel; agents test in dry-run.
- **Don't** edit `scdemos/demo` `main` or another SC's demo. Customer changes live in `scdemos/<slug>`.
- **Don't** commit customer assets to the base repo.

## When something's off
| Symptom | Ask the agent to… |
|---|---|
| Page looks unlike the original | "Run the fidelity gate on /page and close the gaps" |
| Search, forms or links broken | "Run doctor.mjs and fix all FAILs" |
| Dark or odd colors on your laptop | "Check color-scheme and the base assumptions" |
| Library panel empty | "Re-run the DA config migration (da-config.mjs) and the library phase" |
| Repo not created | Check the `new-demo` issue. The provisioning token may be missing (admin task) |
| Agent can't run browsers or scripts | `node .skills/customer-demo/scripts/setup-check.mjs --fix` |
| Publish / config calls fail with 401 | Sign in at `https://admin.hlx.page/login` and `da.live` in the browser the agent uses |

**Feedback loop:** each run ends with a retro. When you hit something new, say so. The fix goes
into the skill, a script check or the base, so the next SC doesn't hit it.

<!-- docs-check: synced-with=46821782a886128a -->
