Demo Project - Cloud Adoption

## Environments
- Preview: https://main--demo--scdemos.aem.page/
- Live: https://main--demo--scdemos.aem.live/
- CDN (production): https://demo.bbird.live/
- Authoring (DA): https://da.live/#/scdemos/demo

## Create a customer demo (one command)

Turn this base site into a customer-branded demo from a single URL.

**One-time setup:**
- Install **GitHub Copilot** in VS Code or **Claude Code**.
- Open this repo. The MCP servers (DA, EMA, GitHub) are preconfigured in `.vscode/mcp.json` and `.mcp.json`; sign in when prompted.

**Run it.** Type any of these in Copilot or Claude Code chat:
```
demo manulifeim.com/institutional/tw/en
/customer-demo manulifeim.com
create a demo for https://www.manulifeim.com/institutional/tw/en
```

That's the only input, plus one click. The agent then:
1. derives `<slug>` from the URL and creates `github.com/scdemos/<slug>`, seeded with this base's code. Every demo stays in the `scdemos` space for tracking.
2. opens [the AEM Code Sync install page](https://github.com/apps/aem-code-sync/installations/new). **Your one click:** choose scdemos → Only select repositories → add `<slug>` → Install/Save. The Config Service then connects the repo to DA, with no `fstab.yaml`.
3. creates `da.live/#/scdemos/<slug>` through the DA MCP and copies the base content into it
4. applies the customer brand (`BRAND TOKENS` in `styles/styles.css`)
5. maps the customer pages onto the existing blocks and variants
6. imports the content into DA
7. bakes in experimentation, audiences, campaigns, forms and a demo walkthrough
8. QA-checks against the original site
9. hands back the preview, DA and repo links

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
