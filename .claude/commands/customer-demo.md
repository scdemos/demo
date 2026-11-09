---
description: Build a fully baked, customer-branded demo site from the scdemos/demo base using one customer URL.
argument-hint: <customer-url>
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo site.

Customer URL: $ARGUMENTS

Follow the skill end-to-end:
- Ask for the destination GitHub repo and DA org/site in a single question.
- Run the pipeline from preflight to handoff without further questions.
- Pause only for the documented blockers: an empty repo has to be created, and the AEM Code Sync app has to be installed.
