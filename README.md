Demo Project - Cloud Adoption

## Environments
- Preview: https://main--demo--scdemos.aem.page/
- Live: https://main--demo--scdemos.aem.live/
- CDN (production): https://demo.bbird.live/
- Authoring (DA): https://da.live/#/scdemos/demo

## Create a customer demo (one command)

Turn this base site into a customer-branded demo from a single URL, in two moves.

**1. Create the site in CloneIt** (`https://da.live/app/scdemos/demo/tools/cloneit/cloneit`, signed in to
da.live; no GitHub or admin rights needed). Enter the customer site URL (the site name is suggested from it, editable) and
your GitHub username. Every demo gets its own repo and DA folder: CloneIt's worker creates `github.com/scdemos/<slug>`
from this repo, adds it to AEM Code Sync, makes you its admin, copies the demo content, all DA config sheets, the
site config (you as admin) and the query index, publishes everything, logs the demo in
`da.live/#/scdemos/demo-registry`, and shows the next prompt. Nothing is taken from the customer's website yet.

**2. Optional: make it look like the customer.** Use **GitHub Copilot** in VS Code (best: it has an integrated
browser), **Claude Code**, Cursor, Gemini CLI or the ChatGPT desktop app / Codex. Open the new repo (CloneIt's
**Open in VS Code**), sign in to the preconfigured DA and EMA MCP servers (`.vscode/mcp.json`, `.mcp.json`,
`.cursor/mcp.json`, `.codex/config.toml`, `.gemini/settings.json`), and paste the prompt CloneIt shows (the customer site is already filled in):
```
/customer-demo https://www.acme.com/institutional/us/en
```
The agent then:
1. asks you to sign in to da.live **once** in its browser tab (covers DA, preview and publish), starts `aem up` (watch on localhost:3000)
2. moves the base demo pages to DA `drafts/demo-backup` (unpublished; deleted once the migration passes) and rebuilds the customer's real pages with their real content (rendered in a real browser, nothing dropped, nothing made up)
3. analyzes the design (nav with dropdowns/mega menus, header, type, buttons, cards, section layouts, carousels), applies the brand (`BRAND TOKENS` in `styles/styles.css`) and maps every pattern onto blocks, variants and section styles, adding new ones (and their block library entries) when nothing fits
4. bakes in forms, search, the block library and a demo walkthrough (experiments and campaigns only when you ask)
5. checks every page against the original (`compare.mjs`: header layout, section layout, carousels, invented copy; `doctor.mjs`, `lint-content.mjs`), runs a final sweep that loops until it matches, and hands back the links

**One-time admin setup:** set the CloneIt worker secrets (`ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, and
`GITHUB_PROVISION_TOKEN`, required to create demos: a classic PAT of an `scdemos` org owner or bot with the `repo` and
`read:org` scopes, plus `admin:org` only when `SC_TEAM` is set) and optionally `SC_TEAM` in `workers/cloneit_token/wrangler.toml`. See [`tools/cloneit/README.md`](tools/cloneit/README.md).
The issue-based [provisioning workflow](.github/workflows/provision-demo.yaml) remains as a fallback (`DEMO_PROVISION_TOKEN`).

**SC guide:** [`.skills/customer-demo/SC-QUICKSTART.md`](.skills/customer-demo/SC-QUICKSTART.md), a one-pager on running a demo build well.

**Where things live:**
- Orchestrator skill: [`.skills/customer-demo/SKILL.md`](.skills/customer-demo/SKILL.md)
- Block/variant catalog: [`demo-manifest.json`](.skills/customer-demo/references/demo-manifest.json). Keep it updated when you add blocks or variants.
- Preflight script: `node .skills/customer-demo/scripts/preflight.mjs --source <url> --repo <github-url> --da <org/site>`

**Known limits:**
- Proprietary fonts are replaced with the closest open font.
- Live data (prices, logins) is mocked.
- Bot-protected sites need browser scraping or EMA.
- Expect very close, not pixel-perfect, fidelity on complex interactions.

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
