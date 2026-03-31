Let me first explore the current demo site and research nice.com's branding to craft a targeted prompt.Now let me check the current DA content inventory to understand the full scope of what needs to be rethemed.# NICE.com Demo Retheme — Polished Prompt & Execution Plan

## Overview

Transform the existing **DIYFire** (personal finance / Heritage Elite) demo site into a **NICE.com**-aligned customer demo that mirrors NICE's actual website in design language, content structure, and brand voice. The goal is a demo that feels native to the NICE brand — not a generic reskin, but something a NICE prospect would recognize as purpose-built.

---

## Current State Summary

| Aspect | Current Demo |
|--------|-------------|
| **Brand** | DIYFire / Heritage Elite — personal finance / FIRE movement |
| **Palette** | Rust #a14f2b, Gold #c5a059, Parchment #f5f2ed, Ink #1a1a1a, Obsidian #060d0d |
| **Typography** | EB Garamond (serif headings), Montserrat (body), JetBrains Mono (labels) |
| **Design feel** | Warm, editorial, heritage-luxe, serif-forward |
| **Content** | Financial independence, budgeting, savings calculators, investment articles |
| **Blocks (22)** | hero, cards, columns, teaser, tabs, faq, form, embed, fragment, modal, search, quiz, related-articles, social-share, journey-map, 3 calculators, table, header, footer |
| **Sections styles** | light, highlight, divider, gradient, ink, center, spacer-top/bottom-s/m/l |
| **Fragments** | learn-home-teaser, whats-next, homepage-quiz, tabs-starting-point, got-feedback, 404 |
| **Templates** | article, events |
| **Workers** | auth, cdn, contact_us, feed |
| **Theme system** | CSS custom properties, `light-dark()`, `data-theme` attribute, localStorage persistence |
| **DA org/repo** | scdemos/healthdemo |

---

## NICE.com Brand Profile (Researched)

| Aspect | NICE.com |
|--------|----------|
| **Industry** | AI-powered Customer Experience (CX) automation |
| **Flagship** | CXone platform — 15B+ interactions/year, 25,000+ customers, 85+ Fortune 100 |
| **Solution pillars** | 1. Agentic Experience Automation, 2. Engagement Orchestration, 3. Workforce Empowerment |
| **Primary palette** | Electric blue #2F33F5, Mid-blue #5192F4, Light blue #93C3FA, Purple accent #872BFF / #AD7DFC |
| **Typography** | Be Vietnam Pro (Google Font, weights 200–900) |
| **Design patterns** | Blue→purple gradient text on headlines, clean white backgrounds, minimal cards, bold gradient CTAs, generous whitespace, grid-based layouts |
| **Voice** | Confident, data-driven, forward-looking, human-centered AI |
| **CTA vocabulary** | "Watch Demo", "Explore the Platform", "See It in Action", "Calculate Your Savings", "Learn More" |
| **Nav structure** | Platform · Products · Industries · Services · Resources · Company + Login/Support/Partners/Pricing/Careers |
| **Key stats** | 89% faster response time, +15% revenue/call, 75% tech cost savings, +25% operational efficiency, 11x Gartner MQ leader |
| **Industries** | Financial services, healthcare, insurance, government, education, retail, telecom, travel/hospitality, BPO |

---

## The Polished Prompt

```
You are an AEM Edge Delivery Services (EDS) + Document Authoring (DA) migration agent working inside the target repository.

Follow all repository instructions already present in the workspace, especially AGENTS.md.
If this task prompt conflicts with repo instructions, repo instructions win.

MISSION
Retheme and migrate the existing demo site so that both content and visual design feel purpose-built for the NICE brand and CX/AI industry — as if this demo were NICE's own website running on AEM Edge Delivery Services. Preserve EDS/DA authoring simplicity, existing block contracts, and site structure.

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
REFERENCE_SITE: {{https://www.nice.com}}
PRIMARY_GOAL: {{Make the demo feel native to the NICE brand — a prospect should see this as "their" platform demo, not a generic reskin}}
CONTENT_SCOPE: {{entire discovered site}}
ASSET_POLICY: {{free stock assets only — contact center environments, AI/technology visuals, diverse customer service teams, cloud/data center imagery, modern enterprise workspaces, headset-wearing agents}}
LINK_POLICY: {{all updated internal links must resolve; no 404s}}
PUBLISH_MODE: {{preview and publish all changed items}}
CHECKPOINT_POLICY: {{require-approval-before-remote-write}}
REPORT_MODE: {{audit + changes + verification}}

DESIGN_DIRECTION
"Modern AI-powered enterprise brand closely inspired by nice.com: vibrant electric-blue-to-purple gradient primary palette (#2F33F5 → #5192F4 → #93C3FA with #872BFF purple accent), clean white backgrounds, dark charcoal text (#1A1A2E), 'Be Vietnam Pro' geometric sans-serif typography at weights 200–900 for all text (no serifs), generous whitespace with 8px-based spacing grid, blue-to-purple gradient text-fill treatments on hero headings and key stats, minimal rounded corners (8–12px, not large radius), restrained card treatments with subtle borders or light shadows, precise grid-based spacing, smooth micro-transitions (200–300ms), and bold gradient CTAs with hover brightness shifts.

Light theme: white (#FFFFFF) and very light gray (#F7F8FC) backgrounds, charcoal text (#1A1A2E), blue link and CTA colors.
Dark theme: deep navy (#0A0A1A) and dark card surface (#141428), light text (#E8E8F0), brighter blue/purple gradient accents, subtle glow effects on interactive elements.

The result should feel like an extension of nice.com — intelligent, authoritative, modern, data-rich, and enterprise-grade in both themes. Prioritize cleanliness and information density over decoration."

BRAND_CONTEXT
NICE is a global leader in AI-powered customer experience (CX) automation.
- Flagship: CXone — the world's #1 AI platform for CX
- Scale: 15B+ interactions/year, 25,000+ organizations, 85+ Fortune 100 companies, 150+ countries
- Recognition: Gartner Magic Quadrant leader for 11 consecutive years, "furthest on Completeness of Vision"
- Three solution pillars:
  1. Agentic Experience Automation — AI agents for self-service, sales, proactive engagement, and process automation; knowledge management
  2. Engagement Orchestration — Omnichannel routing, IVR, outbound engagement, voice services, workflow orchestration
  3. Workforce Empowerment — WFM, quality management, performance management, interaction analytics, AI copilots for agents and supervisors
- Core messaging: "One AI platform to transform customer experience at scale" / "Smarter AI. Better experiences."
- Industries: financial services, healthcare, insurance, government, education, retail, telecom, travel/hospitality, BPO
- Key proof points: 89% faster response time, +15% revenue per call, 75% technology cost savings, +25% operational efficiency, +51% self-service resolution, +15 CSAT points

NAVIGATION_GUIDANCE
Mirror nice.com's navigation architecture as closely as possible within the existing nav block contract:
- Primary nav: Platform | Products | Industries | Services | Resources | Company
- Platform mega menu: Foundations (Cloud Architecture, Integrations, Trust Center, Agent Workspace, Supervisor Workspace) + Capabilities (Agentic Experience Automation, Engagement Orchestration, Workforce Empowerment)
- Products mega menu: grouped by three pillars with sub-products
- Right-side tools: theme toggle, search, login
- Logo: Replace with NICE logo or text mark "NICE" in brand blue
- Footer: Company | Support | Resources | Partners | Social (LinkedIn, X, Facebook, YouTube) | Legal

CONTENT_MAPPING_GUIDANCE
Map existing demo content to NICE-relevant equivalents. This is not 1:1 — adapt creatively but preserve the structural pattern (same block type, same section count, same authoring contract):

| Current Content | NICE Equivalent |
|----------------|-----------------|
| "The Science of Wealth Preservation" (hero) | "One AI Platform to Transform CX at Scale" |
| "The Idea" section (financial independence) | "The CXone Platform" — what it is and why it matters |
| "Why This Exists" section (FIRE movement) | "Why NICE" — 30+ years of CX innovation, AI-first approach |
| "Build your FIRE plan step by step" CTA | "See CXone in Action" / "Explore the Platform" |
| Cards: Start Here, Financial Independence, Budgeting, Tools | Cards: Platform Overview, AI Agents, Workforce Management, ROI Calculator |
| Quiz: "Financial Health Check" | Quiz: "CX Maturity Assessment" |
| Related Articles (finance) | Resources: case studies, whitepapers, industry reports |
| Tabs (starting points) | Tabs: by industry or by solution pillar |
| Calculator tools | ROI Calculator / Savings Estimator / Workforce Planner |
| Journey Map (financial steps) | Journey Map: CX Transformation Roadmap |
| FAQ (financial topics) | FAQ: CXone platform, AI, pricing, implementation |
| Article template (finance articles) | Article template: resources, case studies, thought leadership |

TERMINOLOGY_GUIDANCE
When rewriting content, translate current demo terminology to NICE/CX industry terms:
- Financial planning / investing → Customer experience optimization / CX strategy
- Investment portfolio → CX platform / engagement channels
- Savings / wealth / net worth → Efficiency / CSAT / NPS / resolution rate
- Advisor / consultant → AI agent / supervisor / CX leader
- Returns / growth / compound interest → ROI / first-contact resolution / handle time reduction
- Market trends → CX industry trends / AI innovation
- Calculator tools → ROI calculators / workforce planning tools
- Articles / guides → Resources / whitepapers / case studies / analyst reports
- Client / customer (financial) → Customer / enterprise / organization
- Heritage / tradition → Innovation / proven leadership / 30+ years of expertise
- Budget / spending → Cost optimization / operational efficiency
- Savings rate → Self-service resolution rate
- Fire plan / retirement → CX transformation / digital-first strategy
- DIYFire → NICE CXone
Use NICE's voice: confident, data-driven, forward-looking, human-centered AI. Use stats and proof points frequently.

VISUAL_PATTERN_GUIDANCE
Adopt these specific nice.com visual patterns within the existing block architecture:
1. Hero: gradient text treatment on key words (blue→purple), clean two-column or centered layout, subtle animated gradient background
2. Cards: clean white cards with very subtle border (#E5E7EB), small icon or image top, 8px radius, consistent padding
3. Stats/metrics: large gradient-filled numbers (48-64px), blue→purple text fill, supporting label below
4. CTAs: primary = solid blue (#2F33F5) with white text, hover = brightness(1.1); secondary = outlined with blue border
5. Section backgrounds: alternate white (#FFF) and very light blue-gray (#F7F8FC), with occasional gradient accent section
6. Typography hierarchy: Hero h1 = 48-64px weight 700 gradient, h2 = 32-40px weight 600, h3 = 24px weight 600, body = 16-18px weight 400
7. Icons: line-style or filled blue icons, consistent 24px or 32px sizing
8. Gradients: primary = linear-gradient(135deg, #2F33F5 0%, #5192F4 50%, #93C3FA 100%); accent = linear-gradient(135deg, #2F33F5 0%, #872BFF 100%)

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
- Inspect all discovered global, template, and block CSS files (22 blocks + styles/ + templates/).
- Inventory the current token system (Heritage Elite tokens), theme mechanism (light-dark(), data-theme), font strategy (EB Garamond + Montserrat + JetBrains Mono), spacing system (8px grid), and major visual patterns.
- Inventory all in-scope content from local files and/or DA: pages, fragments (learn-home-teaser, whats-next, homepage-quiz, tabs-starting-point, got-feedback, 404), nav, footer, forms, media, icons, embeds, metadata, section-metadata, related-content/query-index dependencies, and internal links.
- Build a comprehensive terminology map from the current theme (heritage/financial) to the target theme (CX/AI platform) using TERMINOLOGY_GUIDANCE as a starting point.
- Inventory all icon references in code and content — plan replacements for NICE-relevant iconography.
- Record risks, unknowns, and any authoring-contract sensitivities.

PHASE 2: BRAND AND DESIGN DEFINITION
- Define the target brand voice (intelligent, confident, human-centered AI, data-driven), CTA vocabulary ("Explore CXone", "See It in Action", "Get a Demo", "Watch Demo", "Calculate Your ROI", "Transform Your CX"), terminology system per TERMINOLOGY_GUIDANCE, and messaging pillars.
- Define the complete design system:
  - Palette: Electric blue #2F33F5, Mid-blue #5192F4, Light blue #93C3FA, Purple accent #872BFF, White #FFFFFF, Light surface #F7F8FC, Charcoal #1A1A2E, Dark surface #141428, Deep navy #0A0A1A
  - Semantic color mapping: --color-brand → #2F33F5, --color-accent → #872BFF, --color-text → #1A1A2E (light) / #E8E8F0 (dark), --background-color → #FFFFFF (light) / #0A0A1A (dark), --color-shaded → #F7F8FC (light) / #141428 (dark)
  - Typography: Be Vietnam Pro at all weights (200, 300, 400, 500, 600, 700, 900) — single font family for all text (headings, body, labels)
  - Spacing: keep existing 8px grid, update decorative tokens
  - Radius: 8–12px (replace heritage 24px)
  - Borders: 1px solid #E5E7EB (light) / 1px solid rgba(255,255,255,0.1) (dark)
  - Shadows: subtle — 0 1px 3px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.08) for cards
  - Motion: 200–300ms ease-out (replace heritage exponential easing)
  - Gradient tokens: see VISUAL_PATTERN_GUIDANCE
  - Component styling: per VISUAL_PATTERN_GUIDANCE
- Light/dark behavior: both themes must feel intentionally designed, not just inverted.
- If CHECKPOINT_POLICY requires approval, present the full audit and proposed design/content direction before any remote writes.

PHASE 3: CSS RETHEME
- Replace font assets: download Be Vietnam Pro woff2 files, update fonts.css @font-face declarations.
- Update styles.css token system:
  - Replace entire Heritage palette (rust, gold, parchment, ink, obsidian, card-dark, muted) with NICE palette
  - Map all semantic tokens to new values
  - Replace --font-family, --font-family-serif, --font-family-mono with Be Vietnam Pro variants
  - Update --gradient-brand, --shadow-glow-*, --border-heritage, --border-radius-heritage
  - Update heading/body font sizes if needed to match nice.com's type scale
- Update lazy-styles.css section styles (gradient, ink, highlight) to use new palette.
- Update ALL 22 block CSS files to replace heritage references (colors, fonts, borders, shadows, gradients).
- Update template CSS (article.css).
- Specifically address:
  - Hero: gradient text fill, simplified gradient overlay, clean CTA styling
  - Cards: clean white cards with subtle border, reduced radius
  - Header/footer: new brand colors, NICE logo placement
  - Social share: update glassmorphism to match new palette
  - All calculator blocks: restyle metric cards, charts, inputs to NICE palette
  - Journey map: restyle progress indicators to blue/purple
  - Quiz: update feedback colors and progress indicators
  - FAQ: update accordion styling
  - Search: update filter sidebar and card styling
  - Table: update row hover and header colors
- Reuse the repo's existing theme architecture (CSS custom properties, light-dark(), data-theme) rather than introducing a competing one.
- Ensure both light and dark themes are intentional, branded, accessible, and NICE-like.
- Run lint and fix all issues before moving on.

PHASE 4: CONTENT MIGRATION
- Create a complete mapping of old paths, terminology, and references to new ones before rewriting.
- Rewrite all discovered in-scope content using CONTENT_MAPPING_GUIDANCE and TERMINOLOGY_GUIDANCE:
  - Homepage: transform hero, sections, cards, fragments to NICE CX messaging
  - All article/resource pages: rewrite to CX/AI industry topics
  - All fragment content: update to NICE messaging
  - Nav: restructure per NAVIGATION_GUIDANCE
  - Footer: update to NICE structure and links
  - Form content: update labels and messaging for CX industry
  - Quiz content: transform to CX maturity assessment
  - Calculator content: transform to ROI/workforce tools
  - FAQ content: rewrite for CXone platform questions
- Update href values, visible URL text, fragment references, metadata, IDs containing old-theme terms, related-content keywords, image refs, icon refs, embeds, and hard-coded domain references.
- Preserve section-metadata styles and all author-facing structure exactly.

PHASE 5: MEDIA AND BRAND ASSETS
- Replace or add theme-appropriate media per ASSET_POLICY:
  - Hero: modern contact center or AI-themed abstract visual
  - Cards: distinct images per topic — AI agents, workforce, analytics, ROI
  - Articles: professional CX/technology imagery
  - Fragments: enterprise/team/technology imagery
- Create or source a NICE-style logo icon (or use text mark "NICE" in brand blue).
- Upload media/icons to DA before updating content that references them.
- Capture the final served URLs and use those exact URLs in content.
- Use varied assets; do not over-reuse a single image across unrelated sections.

PHASE 6: PUSH, PREVIEW, PUBLISH
- Push all changed DA content in safe dependency order:
  1. Media/icons/assets first
  2. Fragment pages
  3. Nav and footer
  4. Regular pages
  5. Homepage last (depends on fragments)
- Preview all changed items.
- Publish all changed items per PUBLISH_MODE.
- If local repo files changed (CSS, fonts, any JS fixes), commit per repo workflow (lint first, PR with test URLs).

PHASE 7: VERIFICATION
- Verify every page type in preview:
  - Homepage with all fragments loaded
  - Article/resource pages
  - Calculator/tool pages
  - Search functionality
  - Quiz flow
  - Journey map
- Verify nav mega menus, footer links, all fragments render correctly.
- Verify both light and dark themes on every verified page.
- Check for layout shifts, broken media, and styling regressions.
- Test responsive behavior at 600/900/1200px breakpoints.
- Run a final sweep for leftover old-theme terms in all user-facing content:
  - Brand: DIYFire, Heritage, Heritage Elite
  - Palette: rust, gold, parchment, ink, obsidian
  - Content: financial independence, FIRE, budgeting, savings rate, net worth, compound interest, wealth preservation, investment, portfolio, retirement
  - Domain: demo--scdemos references that should be healthdemo--healthdemo--scdemos
- Verify Sidekick config updated if needed.
- Only then declare completion.

OUTPUT FORMAT
1. Audit summary — full inventory of discovered content, blocks, styles, and current state
2. Brand and design definition — complete token mapping and design system specification
3. Change summary — every file changed with before/after descriptions
4. Verification results — per-page verification with light/dark screenshots
5. Final status — including blockers, unresolved risks, and leftover sweep results

HARD FAILURE CONDITIONS
- Broken block or authoring contract
- Missing or damaged metadata / section-metadata
- Broken nav or footer
- Internal links pointing to missing destinations
- Media not rendering
- Wrong auth scheme or failed push flow
- Unverified success claims
- Incomplete migration without explanation
- Old-theme references left behind in user-facing content (DIYFire, Heritage, rust/gold/parchment, financial independence, FIRE movement, etc.)
- Light/dark theme regressions after retheme
- Be Vietnam Pro font not loading or falling back to wrong family
- Gradient text treatments not rendering in both themes
- NICE brand context inaccurate or outdated
```

---

## Key Improvements Over Original Prompt

| Enhancement | What Was Added | Why It Matters |
|-------------|---------------|----------------|
| **REFERENCE_SITE** config | Points to nice.com as the visual source of truth | Agent can cross-reference the live site when making design decisions |
| **BRAND_CONTEXT** section | Full NICE company profile with stats, products, and messaging | Agent has concrete knowledge — no guessing about what NICE does |
| **NAVIGATION_GUIDANCE** | Exact nav structure mirroring nice.com | Nav is the first thing a prospect sees — must feel authentic |
| **CONTENT_MAPPING_GUIDANCE** | Page-by-page mapping of current → NICE content | Removes ambiguity — agent knows exactly what each section should become |
| **TERMINOLOGY_GUIDANCE** | 15+ term pairs mapping financial → CX/AI | Ensures consistent vocabulary across all content rewrites |
| **VISUAL_PATTERN_GUIDANCE** | 8 specific design patterns from nice.com | Goes beyond "use blue" — specifies gradient text, card borders, CTA styles, stat treatments |
| **Detailed DESIGN_DIRECTION** | Full light/dark specs, exact hex values, specific radii/shadows/motion | Agent can implement pixel-accurate tokens without interpretation |
| **Phase 3 block-by-block list** | Calls out all 22 blocks with specific restyle notes | No block gets overlooked — each one has direction |
| **Phase 6 dependency order** | Numbered push sequence | Prevents broken fragment references from bad push order |
| **Phase 7 sweep terms** | Explicit list of old-theme terms to search for | Catches every remnant — brand names, palette names, content terms, domain refs |
| **Font strategy** | Be Vietnam Pro replaces all 3 current font families | Matches nice.com exactly — and it's a free Google Font |

---

## Checklist

- [x] Research nice.com brand identity (colors, typography, design patterns)
- [x] Research nice.com company profile, products, and messaging
- [x] Research nice.com navigation structure and page architecture
- [x] Research nice.com resource library and content organization
- [x] Audit current repo structure (22 blocks, styles, templates, workers, content)
- [x] Audit current design token system (Heritage Elite palette, EB Garamond/Montserrat/JetBrains Mono)
- [x] Audit current content structure (homepage, fragments, section-metadata)
- [x] Review existing NICE retheme draft at `.migration/plans/`
- [x] Define complete NICE palette mapping (Heritage → NICE tokens)
- [x] Define BRAND_CONTEXT with NICE company profile
- [x] Define NAVIGATION_GUIDANCE mirroring nice.com structure
- [x] Define CONTENT_MAPPING_GUIDANCE (page-by-page)
- [x] Define TERMINOLOGY_GUIDANCE (15+ term translations)
- [x] Define VISUAL_PATTERN_GUIDANCE (8 specific design patterns)
- [x] Define detailed DESIGN_DIRECTION with light/dark specs
- [x] Add Phase 3 block-by-block restyle notes
- [x] Add Phase 6 dependency-ordered push sequence
- [x] Add Phase 7 comprehensive sweep term list
- [x] Preserve all operating rules, DA/preview/publish rules, and hard failure conditions
- [ ] **User reviews and approves the prompt**
- [ ] **Execute the prompt** (requires switching to Execute mode)

---

## Usage Notes

1. **DA_TOKEN** — Replace `{{provided securely}}` with your actual token at runtime
2. **Repo config** — The prompt targets `scdemos/healthdemo`. Update ORG/REPO if your demo lives elsewhere
3. **Be Vietnam Pro** — Free Google Font, no licensing concerns. The agent will download woff2 files
4. **Checkpoint policy** — Set to `require-approval-before-remote-write` so you'll approve before anything touches DA
5. **Run mode** — Start with `audit-only` if you want to see the plan first without any changes, then switch to `full-migration`
6. **Execution** — Copy the prompt from the code block above and execute it in a new session, or switch this session to Execute mode to begin
