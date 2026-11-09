---
mode: agent
description: Build a fully baked, customer-branded AEM Edge Delivery demo from the scdemos/demo base using one customer URL.
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo site.

Customer URL: ${input:customerUrl:https://www.customer.com/}

Follow the skill end-to-end:
- Derive the destination repo and DA site from the URL. Do not ask for them.
- Run the pipeline from preflight to handoff without further questions.
- Pause only if AEM Code Sync is still not installed after polling.
