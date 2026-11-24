# Spec format

A spec is JSON in `specs/<slug>.json`, merged over `specs/_defaults.json`. `scripts/lib/spec.mjs`
validates it: names (`slug`, `page`, `org`, `site`) are lowercase letters, digits and hyphens
(`page` at most 80 characters, so test takes can add their suffix);
folders look like `/demo-docs/media`; `videoBase` is an `https://` host. Anything else is rejected
before a file or a DA path is touched.

```json
{
  "slug": "experience-workspace-basics-template-edit-preview",
  "page": "first-hour-story",
  "steps": [
    { "do": "openFolder" },
    { "do": "titleCard", "kicker": "Experience Workspace", "title": "…", "items": ["1 · …", "2 · …"] },
    { "do": "createPage", "n": 1, "caption": "Click **New** › Page, name it and click **Create**" }
  ]
}
```

| Field | Where | Meaning |
|---|---|---|
| `org`, `site` | defaults | da.live org and site (`scdemos`, `demo`) |
| `folder` | defaults | folder the tutorial's page is created in |
| `uploadFolder` | defaults | folder the MP4 is uploaded to (`/demo-docs/media`, which the live site serves; `/drafts` is blocked on demo.bbird.live) |
| `videoBase` | defaults | host put in front of the video path in embed links (aem.page preview host) |
| `maxSeconds` | defaults | longest allowed video; longer takes fail (120) |
| `slug` | spec | output and upload file name, without `.mp4` |
| `page` | spec | name of the page the tutorial creates; must be new. Leave it out for tutorials that only show existing pages (no `createPage` step) |
| `siteOrigin` | defaults | live site host for `visit`, `signedOut`, `signIn` (`https://demo.bbird.live`) |
| `appUrl` | defaults | the site's app that `openUrl` may open (`https://scdemos.github.io/frescopa-app/app/`) |
| `restoreAfterTest` | spec | live documents the spec edits (DA paths ending in `.html`); test takes back them up and put them back afterwards |
| `consentBanner` | spec | `true`: the live site shows its cookie banner to the recording browser (it hides itself from browsers that report automation, so by default visits run without consent and send no analytics) |
| `steps` | spec | the script, in order |

Spec option `headed: true` records in a visible browser window: needed for experience.adobe.com (Coworker), whose sign-in lives in cookies that headless Chromium can't read on macOS.

## Fields every step accepts

| Field | Meaning |
|---|---|
| `do` | action name (below) |
| `caption` | plain text shown at the bottom before the action runs (HTML is escaped). `**bold**` highlights a UI word. `{page}` and `{previewHost}` are filled in. `""` hides the caption. |
| `n` | step number shown as a badge in front of the caption |
| `captionLead` | ms between showing the caption and acting (default 400) |
| `hold` | ms to wait after the action (for `titleCard`, `endCard` and `caption` it is their display time) |
| `hidden` | `true` cuts the step from the video: setup the viewer shouldn't see (e.g. editing demo data in a plugin before showing it). No `caption`. |

## Actions

| `do` | Fields | What it does |
|---|---|---|
| `openFolder` | | opens the spec's `folder` in da.live; run first |
| `titleCard` | `kicker`, `title`, `items[]`, `hold` (5000) | full-screen intro card; the video starts here |
| `endCard` | `kicker`, `title`, `items[]`, `hold` (4500) | closing card; stays until the end |
| `caption` | `hold` (2500) | only shows the step's caption |
| `wait` | `ms` | pause |
| `createPage` | | New › Page, types the spec's `page` (with `-test-<time>` in test takes), Create, waits for the editor |
| `view` | `mode`: `layout`, `content`, `split` | switches the editor view |
| `openPanel` | `name` (`Templates`, `Outline`, `Blocks`, `Page`, `Versions`, …) | opens a tools panel (opens the tools sidebar first if it is closed) |
| `addTemplate` | `name` (`Story`, `Event`, …) | Add on that template in the Templates panel |
| `cursorToEnd` | | Content view: clicks just below the last block so the next block is added at the end |
| `addBlock` | `search`, `name` (variant label, e.g. `Cards (features)`) | Blocks panel: searches, picks the variant, clicks "Add … to page" (opens the panel if needed) |
| `showBlock` | `block` (block class, e.g. `cards`, `related-articles`) | Layout view: scrolls the rendered page to that block and points at it |
| `scroll` | `by` ([500, 500, -1000]), `x`, `y` | wheel-scrolls at a point, pausing between moves |
| `editText` | `where` (`layout`/`content`), `in`, `word`, `with`, `nth` (0) | double-clicks `word` inside the element containing text `in`, types `with`; `nth` picks a later match (-1 = last, e.g. the Metadata copy of a sentence the page also shows) |
| `hover` | `where`, `text` | moves the cursor onto the element containing `text` |
| `click` | `role` + `name`, or `text` | generic click by accessible name or visible text. Refuses Send/Preview/Publish/Update/Delete controls: use `preview` |
| `addRow` | `after` (exact text of a table's last cell), `cells[]` | Content view: Tab in that last cell adds a row; types the cells (e.g. `gated`/`true` after `article` in metadata) |
| `previewAs` | `audience`: `authenticated` or `anonymous` | gated page on aem.page: opens the **AUTH STATE** toggle and switches audience |
| `visit` | `url` or `created: true`, `until` ({ `url`, `text` }), `fresh`, `zoom` (0.5–3) | opens a page of this site (`siteOrigin`, or its aem.page/aem.live hosts). `created: true` opens the aem.page preview of the page this take created (`until` then needs only `text`). `until` first waits until that URL serves the text (after a publish or a second preview; skipped in test takes; the wait is cut from the video); `fresh` drops the browser cache; `until.bust: false` polls without the `?cb=` cache-buster (the site's `/rss.xml` and `/feed.json` answer 404 to a query string); `zoom` enlarges small text such as a feed's XML or JSON |
| `signedOut` | | clears the live site's cookies (its host and parent domain, so Web SDK identity and Target QA mode too) and the browser cache: the next `visit` is a new visitor; run before `visit` |
| `signIn` | `text` (sign-in link), `name` (`Alex Rivera`) | clicks the link, fills the demo login's **Display name**, **Continue**, checks `/auth/session` |
| `publish` | | Send › **Preview & Publish** › **Publish** for the open page or fragment, then waits until the admin status API reports the new publish (90 s); fails the take if Preflight blocks it. In test takes it points at Publish and stops |
| `preview` | `confirm` (`Update`) | Send › Preview › Update, then shows the preview page in the same tab. In `--test` takes it stops before Update. |
| `openSchema` | `schema` (id, e.g. `frescopa-app`) | Schema Editor app for the site, with that schema picked |
| `openForm` | `path` | a structured content document in DA's form editor (`da.live/form#…`) |
| `openStudio` | `path` | Frescopa Studio on that document; clicks **Continue** on DA's "trust this app" prompt |
| `studioEdit` | `field` (JSON pointer, e.g. `/data/actions/0/label`), `value`, `shows` | replaces the field's value by typing; waits until the app beside the form shows it (or shows `shows`, for fields like a fragment path, and scrolls the phone to it). Autosaves to DA, also in test takes: list the document in `restoreAfterTest` |
| `studioPublish` | `path`, `field` + `value` (optional) | checks Studio is open on `path`, clicks **Publish**, then waits until the delivery JSON serves `value` at `field`. In any test take (also `--test --preview`) it points at Publish and stops |
| `openUrl` | `url`, `zoom` (0.5–3), `until`, `fresh` (as `visit`) | opens `appUrl` or this site's `da-sc.adobeaem.workers.dev/(live|preview)/…` JSON; `zoom` enlarges small text such as JSON |
| `openPage` | `path`, or `created: true` | opens a document in the editor (Layout view); `created: true` reopens the page this take created, e.g. back from its preview to edit again |
| `openSheet` | `path` (e.g. `/forms/contact-us`) | opens a sheet in Experience Workspace's sheet editor; point at cells with `pointAt` |
| `typeText` | `text`, `style` (`h1`–`h3`), `enter` (true) | Content view: types a line at the end of the document; `style` turns it into a heading through Paragraph › Heading N |
| `openPlugin` | `name` (option in Panels), `frame` (part of the plugin URL) | Panels › that extension, waits for its dialog (e.g. `Fragment Picker`/`fragments`, `Media Library`/`media-library`) |
| `dragAsset` | `name` (asset file, e.g. `image8.jpg`), `search` | AEM Assets side panel (open it with `openPanel` `AEM Assets`), Content view: drags that asset card below the document's last block; fails unless one more image is in the document |
| `replaceImage` | `name` (asset file), `nth` (0), `holdDetails` (1800) | Layout view: clicks the page's `nth` image, **Replace image** › **AEM Assets**, picks the asset (Quick details show), **Select**; fails unless the image changed |
| `schedulePublish` | `days` (2), `time` (`09:00`), `hold` (2500) | **…** (Prepare) › **Schedule Publish**: types a date `days` ahead at `time`, **Schedule**, shows "Scheduled for …", closes the dialog. Any test take points at Schedule and schedules nothing |
| `sendToTarget` | `name` (for a new offer), `hold` (2200) | **Prepare** › **Send to Adobe Target** for the open page or fragment: types `name` for a new offer, then **Create offer** (or **Update offer** for one sent before). Test takes point at the button and close the dialog |
| `schedulerApp` | `remove` (false), `hold` (2500) | opens the Schedule Publish app (`da.live/apps/scheduler`) for the site and points at the created page's row; `remove` clicks that row's **Delete** (no confirmation) and waits until it is gone. Test takes only show the app |
| `pickFragment` | `search`, `name` | Fragment Picker: searches, previews the fragment, **Insert** |
| `pickMedia` | `search`, `name` (file, e.g. `com-sun.jpg`), `metadata` (false), `holdDetails` (2500) | Media Library plugin: searches, opens the image's details (References first, then Metadata if asked), **Insert**; fails unless one more image is in the document |
| `fillField` | `label`, `role` (`textbox`/`searchbox`/`combobox`), `text`, `submit`, `exact` (true) | types into a field of the page in front (a site's search box or form); `exact: false` matches labels with a required-field asterisk. Only editable fields; skipped in test takes when the field only exists on a preview page |
| `closeChat` | | closes the editor's chat panel if it is open (run before `titleCard`) |
| `framePoint`, `frameClick` | `frame` (part of the plugin URL, e.g. `workfront`), `role` + `name` (`exact` true; false matches part of the name) or `text`, `nth` (0) | side-panel plugin (open it with `openPanel`): scroll to an element in its iframe and point at it, or click it |
| `frameType` | `frame`, `label`, `text`, `role` (`textbox`), `exact` (true), `nth` (0) | clicks the plugin field with that label and types `text`; `exact: false` matches part of the name (e.g. a placeholder), `nth` a later match |
| `frameFill` | `frame`, `label`, `text`, `role` (`textbox`) | fills the plugin field at once, no typing (for `hidden` setup, e.g. a long brief) |
| `openCoworker` | `url` (a `https://experience.adobe.com/#/@ccs/coworker/...` URL; default its chat) | opens CX Enterprise Coworker. The recorder profile must be signed in to experience.adobe.com |
| `coworkerClearChats` | – | deletes **every** chat in the signed-in user's Coworker history (test takes too); use as a `hidden` first step so **Chats** opens empty. Runs only with `TUTORIAL_CLEAR_COWORKER_CHATS=yes`, otherwise the take stops before deleting anything |
| `coworkerClick` | `name` | clicks a Coworker control (button or link) by name, e.g. `Chats`, `New chat` |
| `coworkerAsk` | `text`, `fast` (4), `typeDelay` (35 ms per key; lower for long prompts) | types a prompt into Coworker, sends it and waits for the answer; the wait plays back fast-forwarded to about `fast` seconds. A confirmation form Coworker shows is submitted as filled in |
| `openCfEditor` | `path` (`/content/dam/...`), `until` (text that shows once loaded) | opens a Content Fragment in AEM's Content Fragment editor on the spec's `aemAuthor` (`author-pNNN-eNNN.adobeaemcloud.com`); the editor is in an iframe, so follow it with `caption`, not `pointAt` |
| `browse` | `path` (e.g. `/fragments/campaigns`) | opens a folder of the site in the Experience Workspace file browser |
| `openItem` | `name` | opens a page listed in the file browser (after `browse`) in the editor's canvas |
| `chatSend` | `answers` (option texts to pick), `append` (a line added to the draft first), `text` (type this message instead of sending a draft), `fast` (4), `hold` (1800) | sends the editor chat's draft (e.g. after Workfront's **Copy to chat**), answers its question form (the option named in `answers`, else the first one) and approves its write. It ends once the assistant is idle and its answer stops growing, with or without an approval. Waits are fast-forwarded. Test takes stop at **Approve** if one comes, but the assistant often writes without asking, so reset the page after a test take |
| `pointAt` | `text`, `role`, `nth` (0) | scrolls that text to the middle of the screen and moves the cursor onto it; `role` (e.g. `button`) matches a control by its name; `nth` picks a later match |

`where: "layout"` means the rendered page (the editor's iframe); `"content"` means the document
editor, which in Split view is the right-hand pane.

## Adding an action

Add a function to `actions` in `scripts/lib/ew-actions.mjs`. It receives
`({ page, t, spec, run }, step)`: `t` has `click`, `hover`, `clickAt`, `moveTo`, `type`, `press`,
`wait`, `caption`, `card`, `restoreCursor`. Use `t.*` for anything the viewer should see, so the
cursor moves there first. Locate elements by role and accessible name.
