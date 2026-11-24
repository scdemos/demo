# Lessons from recording Experience Workspace

Things that cost time the first time. Add new ones here.

## Editor behaviour
- **Layout view needs two clicks to select a word.** The first click inside the rendered page only puts
  the block into edit mode; a double-click right after selects the word. `editText` with
  `where: "layout"` does this and checks the selection before typing.
- **Don't select with Shift+Home or Cmd+A in the content editor.** It can select across table cells
  and delete a whole block's content. Double-click a word instead.
- **The tools sidebar starts closed in a fresh profile.** Its toggle is "Open after panel"; the
  **Panels** menu only exists once it is open. `openPanel` handles it.
- **Templates add after the empty first paragraph** of a new page, so a blank line stays above the
  hero in Content view. Harmless, and it is what authors see too.
- **Adding a block right after another one replaces it.** A newly added block stays selected, so the
  next "Add … to page" overwrites it. In Content view, click below the last block first
  (`cursorToEnd`), then add. Undo brings the replaced block back.
- **Blocks panel:** clicking a block expands its variants; clicking a variant only reveals its
  "Add <variant> to page" button. The "Search blocks" box filters and expands matches. `addBlock`
  does search › variant › Add.
- The editor remembers the last view (Layout/Content/Split) per browser profile. Specs should set
  the view explicitly after `createPage`.

## Names and caches
- **Never reuse a page name.** After deleting a page that had been previewed, creating a new page with
  the same name briefly showed the old page's edited content in Layout view. `record.mjs` refuses
  names that exist or still have a preview copy; test takes add `-test-<time>`.
- **Clean the folder before a real take.** Folder listings are on screen in the first seconds; leftover
  test pages show up in the video. Run `cleanup.mjs --yes` first.

## Preview
- Send › Preview › Update opens the preview in a **new tab**. A Playwright video only covers one tab, so
  `preview` reads the new tab's URL, closes it and opens the URL in the recorded tab.
- **"Preview failed … html2md … 504 … timeout"** is a backend hiccup. `preview` stops right away
  instead of waiting a minute; rerun the take with a new page name.

## Recording
- Headed Playwright windows with a forced viewport are too slow to sign in with. `setup.mjs --login`
  uses a real window size and no viewport override; recording itself runs headless at 1440×900.
- Signed out, da.live redirects to `auth.services.adobe.com`; signed in, the folder shows a **New**
  button. That is the sign-in check.
- Captions sit 104px above the bottom so they don't cover the editor's formatting toolbar.
- Playwright's own video is about 1 Mbit/s VP8, so text is readable but slightly soft. Good enough
  for 1440×900 tutorials; a sharper capture would need a different recorder.
- The da.live media viewer loads videos from content.da.live without auth, which answers 401 in an
  automated browser. Verify uploads by reading the file back (upload.mjs does).
- **Playwright's Chromium can't play the MP4s it helps make** (no H.264: `canPlayType('video/mp4;
  codecs="avc1…"')` is empty), so the embed shows a spinner there. Chrome, Safari and Edge play them.
  Check a video with `ffmpeg -v error -i <url> -f null -` instead.

## Embed links
- The embed link is written as the aem.page URL, but Edge Delivery stores links to its own host as
  site-relative paths (`/demo-docs/media/<slug>.mp4`), so the published page loads the published video.
  Publish the video together with the page.
- The embed block only loads its iframe when it scrolls into view (IntersectionObserver). In a hidden
  tab, scroll to it with the browser tool's scroll action before checking it.

## Gated content (live site)
- The live site signs in with a **demo login** (`/auth/login`: one "Display name" field, **Continue**), so
  `signIn` fills it in during the take; no saved session. `signedOut` first, or an old session and the
  browser cache leak into the visitor part.
- Gated sections are removed at the CDN for visitors; on aem.page the **AUTH STATE** toggle
  (`?auth=true|false`) previews either audience. Show the difference by pointing at text that only one
  audience has, not by scrolling.
- `--test --preview` previews the test page. The cleanup script skips previewed pages, so remove the
  preview first (`DELETE https://admin.hlx.page/preview/<org>/<site>/main/<path>`) or it shows up in the
  real take's folder listing.
- Uploaded MP4s on aem.page answer 301 to a `media_<hash>.mp4`; check with `curl -L`.

## Structured content (Frescopa Studio)
- Studio is a DA app: da.live > iframe (Studio on `*--demo--scdemos.preview.da.live`) > iframe (the app).
  DA first asks whether to trust the app; its **Continue** is an sl-button (force click).
- Studio fields have ids built from the JSON pointer (`/data/actions/0/label` → `field_2f_data_2f_actions_2f_0_2f_label`).
- Don't select a field with a page-level Cmd/Ctrl+A or rely on a click to focus it inside the nested
  frame: the keystrokes went to the page (select-all highlighted everything, spaces scrolled it). Focus
  and select the input itself and type with `pressSequentially`.
- Check an edit by waiting for the old value to disappear from the app, not for the new one to appear:
  "Book a visit" was already on screen in the campaign banner.
- Studio autosaves to DA as you type, also in test takes: back up the document's source before a test
  take and put it back afterwards, or the real take has nothing to change.
- After Publish, the da-sc delivery JSON can lag a few seconds; `studioPublish` waits for the new value
  before the take opens the app or the JSON.

## Publishing pages (Preflight)
- The site config has `editor.enforcePreflight: true`. Publish from **Send** fails with "Publish failed:
  Preflight found issues" when Preflight flags something, such as links it can't check (the da-sc JSON
  endpoint). Read the Preflight panel's findings, tell the user, and let them decide. Don't assume a
  publish went through: check the page's `live.lastModified` in the admin status API or the aem.live copy.

## Omnichannel take (website + app)
- The app renders site fragments with the site's code (`aem-embed`) and reads `/en/data/*.json`, so a
  fragment edited and published once shows on the website and in the app. Point the app's featured
  campaign at the fragment the home page uses (`/fragments/campaigns/member-week-dec39`).
- Edit headings or paragraphs in Layout view, not link text: the first click on a button-link opens the
  link toolbar and the double-click never selects the word.
- `getByText` also matches the recorder's own caption (`#tt-root`): a caption that says
  "Send › **Preview & Publish**" made the action click its own caption. Target controls by role.
- The Send menu's radios are hidden inputs covered by their label card: click the card (the label),
  then check `isChecked()`.
- The contact sheet samples every ~6 s and can miss a short step; when a frame looks wrong, extract
  1 fps frames around it (`ffmpeg -ss … -vf fps=1,tile=7x2`) before re-recording.
- A real take with publishing and encoding ran past the 2-minute foreground limit and was killed while
  encoding, after making its live changes. Run real takes in the background. If one dies anyway, the
  raw WebM in `out/.raw/<slug>/` is complete once the browser closed: encode it by hand with the same
  ffmpeg settings and the title card's start as `-ss`.

## DA token
- `npx -y github:adobe-rnd/da-auth-helper token` exited 1 without a word in a Studio shell. Setup now
  installs the helper into the cache and `da.mjs` runs it with node; it signs in through the existing
  browser session. Don't echo its stdout: that's the token.

## Restore after test takes: known limit
- `restoreAfterTest` puts back every listed document that changed during the take. If a colleague
  edits the same document in those one or two minutes, their edit is overwritten too; it's kept in
  `out/backups/test-<slug>_<path>.before-restore`. DA has no conditional writes, so only list documents
  the take itself edits, and record when nobody else is editing them.

## Plugins, sheets, site forms (fragment picker, media library, search, forms batch)
- The editor's block menu (Paragraph › Heading N) is a listbox: its choices have role `option`, not `button`.
- A block with a single variant (Search) has a group button and a variant button of the same name; `addBlock` takes the `.ext-variant-title` one.
- In Content view, look for document text inside `.ProseMirror` first: a word like "list" also matches the app's own panels.
- A `<select>`'s options are hidden: point at a visible label or a results line ("Showing all …"), not "Newest".
- A second preview of the same page can show the cached first version: follow it with `visit` (`created: true`, `fresh`, `until` text that only the new version has).
- The sheet editor keeps hidden tables: wait for a visible cell with text, not `role=table`.
- Site buttons with an icon (Contact Us →) don't match an exact accessible name: click by `text`.
- Test takes send `x-dry-run: 1` to the demo's form endpoint (`/contact-us/`), so rehearsals don't post to Slack; the real take does.
- A real take that fails after its preview leaves a previewed page, so the next take refuses that name. Unpreview it (`DELETE https://admin.hlx.page/preview/<org>/<site>/main/<path>` with the DA token) and delete the source, or pick a new name.
- Layout-view double-clicks on a heading can land on the neighbouring word; edit headings in Content view.

## DA token
- `da-auth-helper login` prints the raw token on stdout after "Login successful". To switch IMS org,
  run `logout`, then `login > /dev/null` (the browser sign-in still opens), and check with a
  protected read such as `https://admin.da.live/list/<org>/<site>/<folder>`.
- The API token and the recorder's browser profile are separate sign-ins: after switching org for the
  token, run `setup.mjs --login` too if the recordings should use the same org.

## Feeds
- The site's `/rss.xml` and `/feed.json` come from a Worker on exact routes, so `rss.xml?cb=…` answers
  404 from the site instead. Wait on them with `until.bust: false`. A publish reaches the feed in about
  30 seconds (the Worker reads the query index on every request). Feed XML and JSON are small at
  1440 px: `visit` with `zoom: 1.5`.

## Side-panel plugins and apps
- Library plugins without a dialog icon in **Panels** (e.g. Workfront) open as a side panel: use
  `openPanel` (it presses Escape to close the menu), then `framePoint`/`frameClick`/`frameType` with
  `frame: "workfront"`. Cross-origin plugin frames ignore clicks from a hidden Studio browser tab;
  explore them with a Playwright script on the recorder profile instead.
- Apps page cards are `nx-action-card` elements in shadow DOM: `xpath=..` stops at the shadow root,
  so `openApp` uses the card's "Open <name>" link. Apps hosted outside da.live open in a new tab
  (`target=_blank`); `openApp` opens them in the recorded tab.
- The recorder profile remembers an open chat panel (with the user's name and last session): start
  with `closeChat` unless the story needs the chat.
- Workfront in demo mode (`?demo` on the library and apps entries) keeps every write in memory, so
  takes need no `restoreAfterTest`; opened as a standalone app it reloads the sample data.

## AEM Assets
- Panels › **AEM Assets** opens DA's assets rail: the Asset Selector in a cross-origin iframe
  (`CQ-assets-selectors`) without a Select button. Clicking or double-clicking a card only selects it;
  assets go in by dragging a card into the document (a real mouse drag works: `dragAsset`).
- Layout view: click an image, **Replace image** opens a menu (Upload, AEM Assets). AEM Assets opens the
  full selector as a modal with a folder tree, Quick details and **Select**; Select swaps the image
  in place (`replaceImage`).
- Cards are `gridcell`s named like "JPEG image8.jpg"; the list starts filtered to Approved assets.

## Schedule Publish
- **…** (Open prepare menu) › **Schedule Publish** opens a dialog with one `datetime-local` field
  ("Schedule date and time") and **Schedule**. The year segment takes six digits: type the year, press
  ArrowRight, then month, day, hour, minute. Playwright's click on Schedule (an `sl-button`) never
  settles; a mouse click works. Open the Prepare menu from Layout view: in Content view the document
  editor covers the menu and swallows the click on **Schedule Publish**. Find menu items by role
  (`menuitem`), not text: a caption that names them matches `getByText` first.
- Reopening the dialog on a scheduled page says "Scheduled by … Reschedule?" and has no cancel.
  Cancel in the Schedule Publish app (`da.live/apps/scheduler#/<org>/<site>`): each row has **Open** and
  **Delete**, and Delete removes the schedule at once, without a confirmation.
- Coworker (experience.adobe.com) keeps its sign-in in cookies, which a headless take can't read and
  even clears from the profile on macOS (any headless take, also of other specs, signs Coworker out
  again): specs that use it set `"headed": true`. Sign the profile in with a
  visible window (the MFA code needs the user). The Coworker URL with a conversation id shows "This
  conversation isn't available" for prompts typed there: start from **Chats** › **New chat**.
- The editor's chat continues the latest Coworker session, so a Coworker chat recorded first carries
  on in Experience Workspace. Its answers can take minutes (a brief → page write took about 7):
  `coworkerAsk` and `chatSend` fast-forward the waits, and `chatSend` answers the assistant's question
  form and approves the write. Coworker really writes (it creates pages): delete what it created
  before the next take, or it finds the page already there.
- Workfront demo edits live in memory: set up the task and brief in `hidden` steps in the same take,
  before showing it, and don't reload the editor (preview opens in a new tab) until the task is complete.
- The editor's assistant often writes a Workfront brief's page straight away, with no question form
  and no **Approve**, and then writes the brief's other deliverables (email, social) to a new
  `<page>-copy` document. `chatSend` treats an idle, quiet chat as done, and the spec's `append` line
  keeps it to the page it is on. Delete what a test take wrote before the real take.
- Coworker doesn't answer the same prompt the same way twice: "create an empty page" sometimes
  writes it at once, sometimes first shows a **Confirm** form (path and name filled in, Cancel /
  Submit) with "Waiting for your input". That form has a **Copy message** button too, so "a new
  answer appeared" isn't "done". Its stop button's name only contains "stop".
- Coworker's history menu animates in and re-renders its items: wait before clicking **Delete**.
- Experience Workspace's **Experimentation** panel runs on the page preview (aem.page), not in da.live:
  open it with `visit` on `…/<page>?daexperiment=1` (the recorder has no Sidekick extension) and
  target it with `frame: "nxver"` (its iframe is `da.live/plugins/exp?nxver=2`; `"exp"` also matches
  other iframes). Accessible names: textbox "Enter experiment name", variant URL boxes are named by
  their placeholder (`frameType` with `exact: false`, `nth: 1` for variant-1; the control's is the
  disabled first), Type and Goal are unlabelled comboboxes (point at the text "Goal"), buttons
  "Create new", "Details", "Save draft", "Publish", and in the saved view "Simulate variant" (one per
  variant, control first) plus "Edit" (draft) or "Pause" (active: no Edit while a test runs).
  Simulate reloads the page with `?experiment=<test>/<variant>&daexperiment=…`, which reopens the panel.
- Shoelace `sl-button`s put a wrapper span over the real button, which fails Playwright's
  actionability check: `frameClick`/`frameType` click with the mouse at the element's center.
- The experimentation plugin's own v2 simulation panel (experience.adobe.com, "Sign in required")
  opened on every `?experiment=` preview link on top of the DA panel; the site sets
  `simulationUI: false` (PR #121), so it no longer appears.
- Coworker and Adobe Target: offers sent with **Send to Adobe Target** sit in Target's Default Workspace
  with source "Adobe Experience Manager". Coworker doesn't find them by name and offers to write
  placeholder offers instead: name them by offer ID in the prompt (the fragment's metadata
  `adobe.target.offerId` holds it) and say "don't create new offers".
- Coworker asks permission before every write: "Approve All" for several operations, a check mark
  named "Approve <server>__<tool>" for one, and in plan mode a to-do plan with **Approve** / **Revise**. `coworkerAsk` approves both, so a real take writes for real.
- The Send to Adobe Target dialog first shows **Create offer** while it looks up an existing offer,
  then switches to **Update offer**: wait a few seconds before deciding which.
- `pointAt` only searches the top page, not iframes. AEM's Content Fragment editor (like Coworker) runs inside the
  Experience Cloud shell's iframe: show it with `openCfEditor` and a `caption`. A Coworker take that fails after
  "create" leaves the fragment in AEM: delete it before the next take, or the brief hits Coworker's duplicate check.
- Coworker writes into AEM Content Fragments when briefed with the author host, model, folder and name; it checks for
  duplicates and shows the fragment first ("Reply create"), so the spec sends a second `coworkerAsk` with "create".
