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
demo acme.com/institutional/us/en
/customer-demo acme.com
create a demo for https://www.acme.com/institutional/us/en
```

That's the only input. No org-admin rights are needed. The agent then:
1. derives `<slug>` from the URL and opens a `new-demo: <slug>` issue on this repo. The [provisioning workflow](.github/workflows/provision-demo.yaml) creates `github.com/scdemos/<slug>`, seeds it with this base's code, adds it to AEM Code Sync and gives you `maintain` access. Every demo stays in `scdemos`, and the issues form the audit log.
2. relies on Code Sync and the Config Service to connect the repo to DA, with no `fstab.yaml`
3. creates `da.live/#/scdemos/<slug>` through the DA MCP, writes the content fresh, and recreates the base's per-site state (site config, query index, search, DA config sheets, library)
4. applies the customer brand (`BRAND TOKENS` in `styles/styles.css`)
5. maps the customer pages onto the existing blocks and variants
6. imports the content into DA
7. bakes in experimentation, audiences, campaigns, forms and a demo walkthrough
8. QA-checks against the original site (`doctor.mjs`, `lint-content.mjs`, `compare.mjs`) and runs a final sweep
9. hands back the preview, DA and repo links

**One-time admin setup** for zero-touch provisioning: an `scdemos` org owner adds the repo secret `DEMO_PROVISION_TOKEN` to `scdemos/demo`. It must be a classic PAT from an org-owner or bot account, with the `repo` and `admin:org` scopes. Optionally, set the variable `DEMO_BASE_REF` to seed from a branch other than `main`.

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
