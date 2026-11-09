---
mode: agent
description: Build a fully baked, customer-branded AEM Edge Delivery demo from the scdemos/demo base using one customer URL.
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo site.

Customer URL: ${input:customerUrl:https://www.customer.com/}

Follow the skill end-to-end:
- Ask for the destination GitHub repo and DA org/site in a single form.
- Run the pipeline from preflight to handoff without further questions.
- Pause only for the documented blockers: an empty repo has to be created, and the AEM Code Sync app has to be installed.
