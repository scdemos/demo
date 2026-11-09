---
mode: agent
description: Build a fully baked, customer-branded AEM Edge Delivery demo from the scdemos/demo base using one customer URL.
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo site.

Customer URL: ${input:customerUrl:https://www.customer.com/}

Follow the skill end-to-end:
- Derive scdemos/<slug> (GitHub repo + DA site) from the URL. Do not ask for them.
- Run the pipeline from preflight to handoff without further questions.
- Open the AEM Code Sync install page for the new scdemos repo (the one SC click), then keep going while it polls.
