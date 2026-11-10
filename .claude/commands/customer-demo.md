---
description: Make this CloneIt demo look like the customer. Give the customer's website, e.g. https://www.acme.com/institutional/us/en
argument-hint: <customer website URL>
---

Use the `customer-demo` skill (`.skills/customer-demo/SKILL.md`) to make the CloneIt demo look like the customer: $ARGUMENTS

Run the skill end-to-end on the demo whose repo this is (`git remote get-url origin` → `scdemos/<slug>`; `slug=` in the prompt overrides it). If `scdemos/<slug>` doesn't exist yet, send the SC to CloneIt (Customer demo, own repo) once and wait; don't provision it yourself. Ask the SC only for the one-time approval to commit to `scdemos/<slug>` and for any change to the base `scdemos/demo` (offered as a PR).
