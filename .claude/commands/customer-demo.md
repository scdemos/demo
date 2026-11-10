---
description: Build a customer-branded demo from the scdemos/demo base. Just give the customer site, any URL or domain, e.g. acme.com or acme.com/institutional/us/en
argument-hint: <customer site>
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to create a customer demo for: $ARGUMENTS

Run the skill end-to-end. Ask the SC only for: the AEM Code Sync install, the one-time approval to commit to the customer repo `scdemos/<slug>`, and any change to the base `scdemos/demo` (offered as a PR). Derive scdemos/<slug> (GitHub repo and DA site) from the site. Provision the repo through the new-demo issue workflow, then keep going while it runs.
