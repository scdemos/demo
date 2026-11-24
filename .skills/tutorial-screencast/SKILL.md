---
name: tutorial-screencast
description: Record short (under 2 minutes) MP4 tutorial screencasts of Experience Workspace (da.live, formerly DA) tasks on the scdemos/demo site, with a visible cursor, step captions and title cards, upload them to demo-docs/media, put the video in a demo-docs page's embed block and preview that page. Use when someone asks for a tutorial video, screencast, walkthrough recording or "how-to" MP4 of an authoring task (create a page, add a template or block, edit in Layout/Content/Split view, preview, publish), gives a demo-docs page to make a tutorial for, asks for a new demo-docs usecase page (with its video and its usecase-showcase entry), or runs /tutorial. Input is a context page, a usecase idea, or steps in plain English; output is a previewed page with the checked MP4 embedded.
---

# Tutorial screencast

Turn plain-English steps into a captioned MP4 of the real Experience Workspace UI, recorded by
Playwright in a signed-in browser, and upload it to da.live. A tutorial is a JSON **spec**
in `specs/`; the scripts do the rest.

Paths below are relative to `.skills/tutorial-screencast/`.

## 1. Check the setup (every session)

```bash
node scripts/setup.mjs
```

- `READY` → go on.
- `NOT_SIGNED_IN` → run `node scripts/setup.mjs --login` in the background. It opens a browser
  window. Hand the sign-in to the user (they sign in to da.live; the script exits with `SIGNED_IN`).
  The session lives in `~/.cache/tutorial-screencast/profile` and lasts until Adobe expires it.
- Setup installs what's missing into `~/.cache/tutorial-screencast` (never the repo, no admin rights):
  playwright-core and Chromium, the DA auth helper, and ffmpeg/ffprobe static builds when they aren't
  on PATH. A teammate only needs Node.js (if `node` is missing in a Studio shell, run
  `source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"` first; otherwise install Node 20+ from nodejs.org or nvm).
- Your tutorial pages go to your own folder, `/drafts/<you>/tutorial-pages`. `<you>` is
  `TUTORIAL_USER` when set, else your OS user name (`export TUTORIAL_USER=kunwar` to pick the name).
  Cleanup only ever deletes test takes in that folder, so teammates never clash.
- Specs with `"sidekick": true` load the AEM Sidekick extension from a local build: clone
  github.com/adobe/aem-sidekick, `npm install && npm run build`, and set `TUTORIAL_SIDEKICK` to its
  `dist/chrome` folder (default `~/repos/github.com/adobe/aem-sidekick/dist/chrome`).
- Coworker specs start with `coworkerClearChats`, which deletes **all** chats in the recording
  account's Coworker history. It runs only with `TUTORIAL_CLEAR_COWORKER_CHATS=yes`; ask the person
  before setting it, and prefer a dedicated recording account.
- Coworker specs also need a Coworker sign-in (an account with Coworker in the org). Headless runs,
  including `setup.mjs` itself, sign Coworker out, so right before recording one run
  `node scripts/setup.mjs --login coworker` in the background and hand the sign-in to the user.
- DA API calls take the token from `~/.aem/da-token.json`. When it has expired, the helper signs in
  through the browser on its own (an Adobe sign-in page opens only if there is no browser session).
  Never print the token.

## 2. Work out the tutorial

Usually the user gives a **context page** (a demo-docs page that explains a task). Read it in
da.live or from its DA source and turn it into steps. Otherwise ask for:
1. Goal, one line: it becomes the title card.
2. Steps, in order.
3. Starting point: new page or an existing one (folder or path).
4. Content: which template or blocks, which text to change. If they don't care, pick edits that read
   naturally in the template's own copy.
5. End state: stop after editing, preview, or publish.
6. Anything to avoid.

Defaults (`specs/_defaults.json`): org/site, the folder tutorial pages are created in (`{user}` is
filled in as above), the folder
videos are uploaded to (`/demo-docs/media`, which the live site serves; `/drafts` is blocked on demo.bbird.live), the host used in embed links (`videoBase`, the
aem.page preview host) and the length limit (`maxSeconds`, 120). Change them only when the user asks.

## Live content on the demo site

scdemos/demo, its live site (demo.bbird.live), the Frescopa app and Frescopa Studio are demo
systems. Tutorials do what a real author does, end to end: edit real pages, fragments, sheets and
structured content, and preview, publish, request or approve publishing. That makes the result
real on the website and in the app, which is the point of the demo. Keep the edits small and
believable (a headline, a label, a featured item), never delete content, and say in the report what
changed live and how to set it back. Ask first for anything bigger (deleting, restructuring, many pages).

Test takes still autosave their edits: list every live document a spec edits in `restoreAfterTest`,
so the test take puts it back and the real take makes the same change for real.

## New usecase pages

For a new demo-docs usecase page, follow [references/usecase-page.md](references/usecase-page.md):
find the real story in the site, write the page from the template, record its video with this skill,
then `scripts/page.mjs create` and `scripts/page.mjs showcase` to save it and list it in
`/demo-docs/usecase-showcase`. One skill covers both: the page and its video are built together.

## 3. Write the spec

Create `specs/<slug>.json`. The slug is the MP4 name: lowercase, hyphenated, says what the video
shows (`experience-workspace-basics-template-edit-preview`). The `page` name must never have been
used before (see references/lessons.md). Start from
`specs/experience-workspace-basics-template-edit-preview.json`; step vocabulary is in
[references/spec-format.md](references/spec-format.md).

Keep it **under 2 minutes** (`record.mjs` fails a take over `maxSeconds`): one caption per step,
short sentences, a title card and an end card. Cut holds or steps rather than speeding up typing.

If a step needs UI the actions don't cover, explore it once in a browser, add an action to
`scripts/lib/ew-actions.mjs` (accessible names, not CSS classes), and note anything surprising in
references/lessons.md.

## 4. Test take, then the real take

```bash
node scripts/record.mjs specs/<slug>.json --test --debug   # no preview, page name gets -test-<time>
```

Test takes never publish, request or approve publishing, approve Coworker's actions, or click a
plugin's Publish/Delete/Send/Update/Activate controls: they point at the button and stop, so later
steps that depend on it may fail. Only the real take does those for real.

Test takes don't preview, so steps on the previewed page (`previewAs`, hovers on aem.page) can't
run: rehearse those specs with `--test --preview`, then unpublish the `-test-` page in da.live
(cleanup skips previewed pages).

Read the printed JSON. Look at the contact sheet (`out/test/<slug>.contact.png`) and, if a step
failed, `out/debug/<slug>/`. Fix the spec or the action and repeat until the contact sheet shows
every step doing what its caption says. Then clean the folder (its listing is on screen in the first seconds) and record the real take:

```bash
node scripts/cleanup.mjs --yes
node scripts/record.mjs specs/<slug>.json                   # real take: real page name, real preview
```

Run real takes (and long test takes) as a background command: with publishing, waiting for the
CDN and encoding, a take can run longer than a 2-minute foreground limit, and a killed take
leaves live changes made but no MP4. Time spent waiting for a publish to reach the CDN
(`until` on `visit`/`openUrl`) is cut from the video automatically.

Check `out/<slug>.contact.png` again before handing anything over: correct edits, no stale content,
no stray test pages in folder listings, captions not covering what they describe.

A "Preview failed" dialog is the preview service timing out, not the script: rerun the take with a
new page name.

## 5. Upload, embed, preview

```bash
node scripts/upload.mjs specs/<slug>.json                          # add --replace to overwrite
node scripts/embed.mjs specs/<slug>.json --page /demo-docs/<page> --dry-run
node scripts/embed.mjs specs/<slug>.json --page /demo-docs/<page>
node scripts/cleanup.mjs --yes                                     # delete test-take pages
```

- `upload.mjs` puts `out/<slug>.mp4` in `/demo-docs/media/` and reads it back to compare bytes, so
  `ok: true` means the stored video is the one you checked. Edge Delivery serves MP4s up to 36 MB
  (about 2 minutes at 300 KB/s); upload refuses bigger files. Takes are usually 2–6 MB.
- `embed.mjs` puts `https://main--demo--scdemos.aem.page/demo-docs/media/<slug>.mp4` in the page's
  embed block. With no embed block it adds one as its own section after the first section, the
  same markup as demo-docs/index (`--after-section n` to move it). Several embeds: pick one with
  `--index`. It backs up the original HTML to `out/backups/` and checks the saved page. Show the
  user the dry run's from/to before the real run.
- **Preview in the da.live UI**, not with hand-built admin.hlx.page calls: first the video (open
  `demo-docs/media`, select the MP4, **Preview**), then the page (open it, **Send** › **Preview** ›
  **Update**). Check that the embed plays on the preview URL. Don't publish the tutorial page or its video until
  the user says so (publishing inside the demo itself is fine, see "Live content on the demo site").
- The da.live media viewer may not play videos in an automated browser (content.da.live answers 401
  there). That is not an upload problem; the aem.page URL is the real check.
- Real-take pages in the tutorial-pages folder stay previewed so the video's end state is real.
  Delete them only when the user asks (da.live: select, Delete, tick "Unpublish items").

## 6. Report

Give the user: the preview URL of the page, the video URL, its length, what it shows step by step,
and anything odd you saw. Register the MP4 as an artifact if you are in Studio.
