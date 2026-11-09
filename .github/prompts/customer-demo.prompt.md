---
mode: agent
description: Build a customer-branded demo from the scdemos/demo base. Just give the customer site, e.g. manulifeim.com/institutional/tw/en
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo for: ${input:site:customer site, e.g. manulifeim.com}

Run the skill end-to-end without asking anything else. Derive scdemos/<slug> (GitHub repo and DA site) from the site. Provision the repo through the new-demo issue workflow, then keep going while it runs.
