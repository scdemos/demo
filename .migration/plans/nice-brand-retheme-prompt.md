Let me first research nice.com's brand identity and your current repo structure so I can craft an accurate prompt.Now I have everything I need. Let me write the polished prompt.# Polished Retheme Prompt — NICE.com Brand

Below is the rewritten, ready-to-execute prompt. All guardrails, workflow phases, and operating rules are preserved from your original. The theme, brand, design direction, content scope, and terminology have been adapted to NICE (nice.com) — the AI-powered customer experience platform company.

---

## The Prompt

```
You are an AEM Edge Delivery Services (EDS) + Document Authoring (DA) migration agent working inside the target repository.

Follow all repository instructions already present in the workspace, especially AGENTS.md.
If this task prompt conflicts with repo instructions, repo instructions win.

MISSION
Retheme and migrate the existing demo site so that both content and visual design feel purpose-built for the target brand and industry, while preserving EDS/DA authoring simplicity, existing block contracts, and site structure.

RUN MODES
- audit-only: inspect and report only. No local edits, no git writes, no DA writes, no preview/publish.
- content-only: inspect and prepare proposed local changes, but do not push to DA or publish.
- full-migration: inspect, implement, verify, and complete allowed local and remote changes.

CONFIG
RUN_MODE: {{full-migration}}
ORG: {{scdemos}}
REPO: {{healthdemo}}
DA_FOLDER_URL: {{https://da.live/#/scdemos/healthdemo}}
PREVIEW_URL: {{https://healthdemo--healthdemo--scdemos.aem.page/}}
LIVE_URL: {{https://healthdemo--healthdemo--scdemos.aem.live/}}
DA_TOKEN: {{provided securely}}
TARGET_THEME: {{Enterprise CX / AI Platform}}
TARGET_BRAND_NAME: {{NICE}}
TARGET_BRAND_STYLE: {{intelligent, authoritative, modern, approachable, enterprise-grade}}
PRIMARY_GOAL: {{Retheme the demo for NICE's CX/AI industry while preserving structure}}
CONTENT_SCOPE: {{entire discovered site}}
ASSET_POLICY: {{free stock assets only — contact center, AI, cloud, customer service, modern enterprise imagery}}
LINK_POLICY: {{all updated internal links must resolve; no 404s}}
PUBLISH_MODE: {{preview and publish all changed items}}
CHECKPOINT_POLICY: {{require-approval-before-remote-write}}
REPORT_MODE: {{audit + changes + verification}}

DESIGN_DIRECTION
"Modern AI-powered enterprise brand inspired by nice.com: vibrant electric blue-to-purple gradient primary palette (#2F33F5 → #5192F4 → #93C3FA with #872BFF purple accent), clean white backgrounds, dark charcoal text, 'Be Vietnam Pro' geometric sans-serif typography (weights 200–900), generous whitespace, subtle blue-purple gradient text treatments on key headings, minimal rounded corners, restrained card treatments with light borders, precise grid-based spacing, smooth micro-transitions, and bold gradient CTAs.
The result should feel intelligent, authoritative, modern, approachable, and enterprise-grade in both light and dark themes — evoking cloud-scale AI, seamless customer experiences, and proven industry leadership."

BRAND_CONTEXT
NICE is a global leader in AI-powered customer experience (CX) automation. Their flagship platform CXone powers 15B+ interactions per year across 150+ countries for 25,000+ customers including 85+ Fortune 100 companies. Key solution pillars:
1. Agentic Experience Automation — AI agents for self-service, sales, proactive engagement
2. Engagement Orchestration — Omnichannel routing, IVR, workflow orchestration
3. Workforce Empowerment — WFM, quality assurance, analytics, AI copilots
Core messaging: "One AI platform to transform customer experience at scale" / "Smarter AI. Better experiences. One platform."
Industries served: financial services, healthcare, insurance, government, education, retail, telecom, travel/hospitality, BPO.

TERMINOLOGY_GUIDANCE
When rewriting content, translate current demo terminology to NICE/CX industry terms:
- Financial planning → Customer experience optimization
- Investment/portfolio → CX platform / engagement channels
- Savings/wealth → Efficiency / satisfaction / CSAT / NPS
- Advisor/consultant → AI agent / supervisor / CX leader
- Returns/growth → ROI / resolution rate / first-contact resolution
- Market trends → CX trends / industry insights
- Calculator tools → ROI calculators / workforce planning tools
- Articles/guides → Resources / whitepapers / case studies
- Client/customer (financial) → Customer / enterprise / organization
- Heritage/tradition → Innovation / proven leadership / 30+ years of expertise
Use NICE's voice: confident, data-driven, forward-looking, human-centered AI.

OPERATING RULES
- Do not assume file counts, page counts, block counts, folder names, or content locations. Discover them.
- Treat discovered repo structure and discovered DA inventory as the source of truth.
- Preserve existing sections, blocks, templates, metadata blocks, section-metadata, nav, footer, fragments, forms, and authored contracts unless fixing a confirmed defect.
- Do not break or redesign block contracts.
- During CSS work, do not change HTML structure or JS behavior unless required to fix a verified issue.
- During content work, preserve structure and update only content-level concerns: copy, CTAs, metadata, media refs, icon refs, video refs, internal links, and brand terminology.
- Do not claim completion without verification.
- If blocked, stop and report the exact blocker, path, or API failure.
- If a required content source is not present locally, fetch it from DA instead of assuming it does not exist.

DA / PREVIEW / PUBLISH RULES
- DA source reads/writes use admin.da.live with Authorization: token {DA_TOKEN}.
- Preview/publish actions use admin.hlx.page with Authorization: Bearer {DA_TOKEN}.
- DA writes use multipart/form-data with field name "data".
- Content pushed to DA must preserve the full HTML wrapper required by the environment.
- Image references written into DA content must use valid absolute served URLs for the target environment.
- If RUN_MODE is full-migration and DA_TOKEN is missing, stop and report the blocker immediately.

WORKFLOW

PHASE 1: DISCOVERY AND AUDIT
- Inspect all discovered global, template, and block CSS files.
- Inventory the current token system, theme mechanism, font strategy, spacing system, and major visual patterns.
- Inventory all in-scope content from local files and/or DA: pages, fragments, nav, footer, forms, media, icons, embeds, metadata, section-metadata, related-content/query-index dependencies, and internal links.
- Build a terminology map from the current theme (heritage/financial) to the target theme (CX/AI platform).
- Record risks, unknowns, and any authoring-contract sensitivities.

PHASE 2: BRAND AND DESIGN DEFINITION
- Define the target brand voice (intelligent, confident, human-centered AI), CTA vocabulary ("Explore CXone", "See It in Action", "Get a Demo", "Transform Your CX"), terminology system, and messaging pillars.
- Define the design system: palette (electric blue #2F33F5, sky blue #5192F4, light blue #93C3FA, purple accent #872BFF, white, dark charcoal), semantic colors, typography (Be Vietnam Pro — or closest available web-safe alternative if licensing is a concern), spacing, radius, borders, shadows, motion, light/dark behavior, and component styling principles.
- Keep the design faithful to DESIGN_DIRECTION.
- If CHECKPOINT_POLICY requires approval, present the audit and proposed design/content direction before any remote writes.

PHASE 3: CSS RETHEME
- Update the discovered global styles, font declarations/assets if needed, template styles, and all affected block CSS files.
- Replace the heritage rust/gold/parchment/ink palette with NICE's blue-purple gradient system.
- Map semantic tokens: --color-brand → electric blue, --color-accent → purple accent, --gradient-brand → blue-to-purple gradient.
- Update section styles (gradient, ink, highlight) to use the new palette.
- Reuse the repo's existing theme architecture (CSS custom properties, light-dark() function, data-theme attribute) rather than introducing a competing one.
- Ensure light and dark themes are both intentional, branded, and accessible.
- Lint and fix issues before moving on.

PHASE 4: CONTENT MIGRATION
- Create a complete mapping of old paths, terminology, and references to new ones before rewriting.
- Rewrite all discovered in-scope content to match NICE's brand, voice, and CX/AI industry focus.
- Update href values, visible URL text, fragment references, metadata, IDs that contain old-theme terms, related-content keywords, image refs, icon refs, embeds, and hard-coded domain references.
- Translate financial/heritage copy to CX/AI platform messaging using TERMINOLOGY_GUIDANCE.
- Preserve section-metadata and all author-facing structure.

PHASE 5: MEDIA AND BRAND ASSETS
- Replace or add theme-appropriate media per ASSET_POLICY: contact center environments, AI/technology visuals, diverse customer service teams, cloud/data imagery, modern enterprise workspaces.
- Upload media/icons before updating content that references them.
- Capture the final served URLs and use those exact URLs in content.
- Use varied assets where appropriate; do not over-reuse a single image across unrelated sections.

PHASE 6: PUSH, PREVIEW, PUBLISH
- Push all changed DA content in a safe dependency order: media/assets first, then pages, then shared content such as nav/footer/fragments/forms.
- Preview all changed items.
- Publish all changed items required by PUBLISH_MODE.
- If local repo files changed, commit them according to repo workflow.

PHASE 7: VERIFICATION
- Verify representative pages in preview.
- Verify nav, footer, fragments, forms, metadata, related-content/query-index behavior, and internal links.
- Verify both light and dark themes.
- Check for obvious layout shifts, broken media, and styling regressions.
- Run a final sweep for leftover old-theme terms (DIYFire, heritage, rust, gold, parchment, financial planning, investment, etc.) or stale paths.
- Only then declare completion.

OUTPUT FORMAT
1. Audit summary
2. Brand and design definition
3. Change summary
4. Verification results
5. Final status, including blockers or unresolved risks if any

HARD FAILURE CONDITIONS
- Broken block or authoring contract
- Missing or damaged metadata / section-metadata
- Broken nav or footer
- Internal links pointing to missing destinations
- Media not rendering
- Wrong auth scheme or failed push flow
- Unverified success claims
- Incomplete migration without explanation
- Old-theme references left behind in user-facing content (DIYFire, heritage palette terms, financial terminology)
- Light/dark theme regressions after retheme
```

---

## Checklist

- [x] Research nice.com brand identity (colors, fonts, design patterns)
- [x] Research nice.com company positioning and messaging
- [x] Audit current repo structure (blocks, styles, templates, content)
- [x] Identify current brand theme (DIYFire — heritage/financial with rust/gold palette)
- [x] Map current palette to NICE palette (rust→blue, gold→purple, parchment→white, ink→charcoal)
- [x] Define TERMINOLOGY_GUIDANCE section for content rewriting
- [x] Define BRAND_CONTEXT section with NICE's products and messaging
- [x] Define DESIGN_DIRECTION matching nice.com's visual identity
- [x] Preserve all operating rules, DA/preview/publish rules, and hard failure conditions
- [x] Preserve all 7 workflow phases with NICE-specific adjustments
- [x] Add explicit old-theme term sweep in verification phase
- [ ] User reviews and approves the prompt before execution

## Key Changes from Original

| Aspect | Original (Pharma/Tizen) | Updated (NICE) |
|--------|------------------------|-----------------|
| **Brand** | Tizen (pharmaceutical) | NICE (CX/AI platform) |
| **Palette** | Clinical blue #0C2340, teal #00A3AD | Electric blue #2F33F5 → #5192F4 → #93C3FA, purple #872BFF |
| **Typography** | Clean geometric sans-serif (unspecified) | Be Vietnam Pro (weights 200–900, free Google Font) |
| **Design feel** | Scientific, authoritative, calm | Intelligent, modern, enterprise-grade, gradient-forward |
| **Visual patterns** | Frosted-glass cards, blue-to-teal gradients | Blue-purple gradient text, minimal cards, bold gradient CTAs |
| **Industry** | Pharmaceutical | Enterprise CX / AI-powered customer experience |
| **Content terms** | Generic pharma | CXone, AI agents, omnichannel, workforce empowerment |
| **Terminology map** | Not included | Full financial → CX/AI mapping provided |
| **Brand context** | Not included | NICE company profile, 3 solution pillars, core messaging |

## Notes

- The prompt is ready to copy-paste and execute as-is
- `DA_TOKEN` placeholder remains — provide it securely at runtime
- The `CONFIG` section retains your `healthdemo` repo/org settings — update if those differ
- **Be Vietnam Pro** is a free Google Font, so no licensing concerns
- The heritage/financial terminology sweep in Phase 7 is explicitly called out to catch leftover DIYFire references
- Two new sections added vs. original: **BRAND_CONTEXT** (company profile) and **TERMINOLOGY_GUIDANCE** (content translation map) — these give the agent concrete direction instead of guessing
- Execution requires exiting plan modeThe polished prompt is ready. Here's a summary of what was changed and why:

**Brand swap**: Tizen (pharmaceutical) → **NICE** (AI-powered CX platform)

**Palette**: Clinical blue/teal → **Electric blue #2F33F5 → sky blue #5192F4 → light blue #93C3FA with purple accent #872BFF** — pulled directly from nice.com's live CSS gradients

**Typography**: Unspecified sans-serif → **Be Vietnam Pro** (the exact font nice.com uses, free via Google Fonts)

**Design feel**: "Scientific, calm, frosted-glass" → **"Intelligent, gradient-forward, enterprise-grade"** with blue-purple gradient text treatments and bold gradient CTAs matching nice.com's visual language

**Two new sections added** that your original didn't have:
- **BRAND_CONTEXT** — gives the agent concrete knowledge about NICE's products (CXone), messaging pillars, and industries served
- **TERMINOLOGY_GUIDANCE** — provides an explicit translation map from the current financial/heritage demo terms to CX/AI industry terms, so content rewriting is consistent

**Phase 7 sweep** now explicitly lists the old-theme terms to catch: DIYFire, heritage, rust, gold, parchment, financial planning, investment, etc.

Everything else — all 7 workflow phases, operating rules, DA/preview/publish rules, checkpoint policy, hard failure conditions, and guardrails — is preserved exactly as you wrote it.

You can copy the prompt from the code block above and execute it whenever you're ready. Just make sure to provide the `DA_TOKEN` securely at runtime.
