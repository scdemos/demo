---
description: Record a short tutorial video for a demo-docs page and embed it there, or build a new usecase page with its video. Give the page, e.g. https://da.live/edit#/scdemos/demo/demo-docs/new-user-access, or describe the new usecase.
argument-hint: <demo-docs page URL or path | "new usecase: …"> [extra notes]
---

Use the `tutorial-screencast` skill (`.skills/tutorial-screencast/SKILL.md`) for: $ARGUMENTS

Read the page for context and turn it into a tutorial under 2 minutes. If I ask for a new usecase page, follow `references/usecase-page.md` instead: build the page from the real demo, record its video, and list it in `/demo-docs/usecase-showcase`. Small real edits to the demo site and app are fine (that's the demo). Test take first, then the real take in the background, checking the contact sheet each time. Upload the MP4 to `/demo-docs/media`, put its aem.page URL in the page's embed block (add one like on demo-docs/index if there is none), update the page text where it's out of date, preview the video and the page in da.live, and send me the preview link. Don't publish the tutorial page until I say so.
