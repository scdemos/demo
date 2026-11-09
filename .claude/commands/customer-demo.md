---
description: Build a fully baked, customer-branded demo site from the scdemos/demo base using one customer URL.
argument-hint: <customer-url>
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo site.

Customer URL: $ARGUMENTS

Follow the skill end-to-end:
- Derive the destination repo and DA site from the URL. Do not ask for them.
- Run the pipeline from preflight to handoff without further questions.
- Pause only if AEM Code Sync is still not installed after polling.
