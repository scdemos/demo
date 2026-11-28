# scdemos/demo -> Helix 6 Migration

## Overview

`scdemos/demo-hlx6` is a copy of `scdemos/demo` on Helix 6: same code (this repo), content on the
source bus (`https://api.aem.live/scdemos/sites/demo-hlx6/source/...`) instead of DA's legacy store
(`admin.da.live`). This document tracks what it takes to run the demo there: what is done, what we
still have to do on our side, and where Helix 6 or the DA apps don't support something yet. It's
our worklist, so the open items name the PR, issue or prepared fix behind them.

**Research scope**: walkthrough of all 31 how-to scripts on demo-hlx6 on Oct 9 (9 work, 10 partly,
10 broken, 2 not testable), caught up with main on Nov 24
([#103](https://github.com/scdemos/demo/pull/103) to [#154](https://github.com/scdemos/demo/pull/154)),
content and DA site config copied again from demo on Nov 24. PR, issue and branch states were checked
again on Nov 25, the day [adobe/da-nx#936](https://github.com/adobe/da-nx/pull/936) merged.

**demo moved to the Frescopa redesign** ([#105](https://github.com/scdemos/demo/pull/105)) with
language markets ([#110](https://github.com/scdemos/demo/pull/110), [#118](https://github.com/scdemos/demo/pull/118)).
demo-hlx6 runs the same code and has had demo's content again since Nov 24: same pages, same preview
and publish state, same index. The Oct 9 walkthrough results are out of date until the walkthrough is
run again (see "Config and content").

- demo: https://main--demo--scdemos.aem.page/
- demo-hlx6: https://main--demo-hlx6--scdemos.aem.page/
- Helix 6 API: https://github.com/adobe/helix-api-service ([migration.md](https://github.com/adobe/helix-api-service/blob/main/migration.md))

---

## Completed ✓

Site setup and content:

- [x] Site created with the source bus as content source. The org needs nothing enabled beyond that.
- [x] Content copied again on Nov 24: all 280 non-draft files of demo (plus `.da/translate.json`,
  `.da/adobe-target.json`, the form schemas and the `.da/icons`). What demo dropped since October (21
  folders such as `/es/`, `/learn/`, `/faqs/` and 80 single files) went to `/.trash`, and 488 paths were
  unpublished and unpreviewed. Links to demo's hosts point at demo-hlx6, except the `demo.bbird.live`
  worker endpoints (contact form, login, content search, RSS feeds).
- [x] Preview and publish state matches demo for 286 of its 290 files, including the 2 how-tos demo
  took down (`how-to-use-msm`, `how-to-manage-translations-and-rollouts`). The other 4 are unlinked
  videos under `/demo-docs/media/old/`. `/query-index.json` has the same 110 rows as demo's.
- [x] `/en/offers/member-week` (the header's announcement bar links to it) is live on demo without a DA
  source. Rebuilt on demo-hlx6 from demo's delivered HTML; the rendered page matches demo's.
- [x] DA site config copied again into `editor.da`, with every demo URL pointed at demo-hlx6: the new
  `apps` (Frescopa Studio, Manage Tags, Media Library, Manage Schemas, Workfront, FindReplace Pro),
  the new `library` rows (Page Insights, Brand Visibility, Block Inspector, LanguageTool, Anchor Links),
  the `channels` sheet for the Frescopa app, and demo's `flags` and `data` rows.
- [x] Library: `blocks.json`, `templates.json` and `icons.json` point at demo-hlx6 instead of demo.
- [x] Videos: 24 screencasts re-encoded to 3.2-4.0 MB (the source bus refuses larger uploads, see
  below): the 16 from October and 8 of the new ones. Every mp4 link plays, except one that is missing
  on demo too (see "Broken images and videos").
- [x] Icons: the 10 svgs under `/icons/` existed only as previewed content on demo, not in DA or git.
  Copied from demo's aem.page to the source bus, previewed and published.
- [x] Index and sitemap: demo's current `query.yaml` (with `publisheddate`, without the `faqs` index)
  and its `sitemap.yaml` (origin set to demo-hlx6's aem.live host) written, site reindexed.
- [x] json2html: worker config for `scdemos/demo-hlx6/main` (events from demo-hlx6's `events.json`,
  press releases from the AEM author) and `content.overlay` set. The 9 event and 4 press pages render on
  aem.live. Pages outside `/en/events/` and `/en/press/` still preview from the source bus.
- [x] Form editor paths: `/en/app` (the Frescopa app document) and `/demo-docs/demo-slides` open in the
  form editor, as on demo. On demo these `editor.path` rows live in the DA org config, but da.live skips
  the org config for Helix 6 sites and reads only the site's `editor.da`
  ([utils.js#L419-L423](https://github.com/adobe/da-live/blob/33cfe07e3baf4379a52287cb28ec30e0d8ffe476/blocks/shared/utils.js#L419-L423)),
  so the two rows went into demo-hlx6's `editor.da` `data` sheet. Checked: browse links both app docs to
  `da.live/form`, and the form editor loads `experience` with its schema.
- [x] Draft pages the how-tos link to (experimentation challenger, FAQ block demo) copied and published.
- [x] Access roles: since Nov 25 they follow demo's DA permissions sheet, not demo's site roles.
  `*@adobe.com` can only read (`view`). `author` and `publish` hold the two demo IMS groups and the people
  on demo's `/demo/+**` row, `config_admin` the groups and people on its `CONFIG` row, and `admin` holds
  demo-hlx6's earlier admins plus everyone on the org-wide `/+**` row. Clone it makes these admins `admin`
  of every Helix 6 clone (see the verification item below).
- [x] Scheduler: demo-hlx6 registered with its own API key.
- [x] Publish request worker: demo-hlx6 registered (same settings as demo). It only helps once the worker
  supports Helix 6, see request publish below.
- [x] Images that pointed at `content.da.live/scdemos/demo/...` (63 refs in 13 docs) were interned
  into the media bus on save.
- [x] **Direct Dynamic Media delivery** ([scdemos/demo#162](https://github.com/scdemos/demo/pull/162), merged):
  DA saves editable images as links so Helix 6 keeps the DAM URL. Preview drops `data-edit-as`, so the
  demo renders the bare links as pictures and keeps the Smart Crop query and alt text. On the
  [hlx6 preview](https://hlx6--demo-hlx6--scdemos.aem.page/drafts/dynamic-media-link-images), both
  images load from DAM and the named DAM link is still clickable. The site's DA settings are unchanged.

Fixed upstream:

- [x] Canvas routes Helix 6 sites to the source bus: [adobe/da-live#1249](https://github.com/adobe/da-live/pull/1249)
- [x] Co-editing saves without a 401, image writes use POST: [adobe/da-collab#197](https://github.com/adobe/da-collab/pull/197), [adobe/da-collab#193](https://github.com/adobe/da-collab/pull/193)
- [x] Canvas metadata: page metadata and section metadata were ignored in the canvas because Helix 6
  returns pretty-printed HTML: [adobe/da-universal#306](https://github.com/adobe/da-universal/issues/306),
  [adobe/da-universal#307](https://github.com/adobe/da-universal/pull/307) (merged Oct 28, not rechecked on demo-hlx6 yet)
- [x] Fragment picker lists Helix 6 sites: [adobe-rnd/aem-apps#44](https://github.com/adobe-rnd/aem-apps/pull/44).
  Retested Oct 29: list, search, preview and insert work. Loading takes 20-30s (paced listing) vs ~3s on demo.
- [x] Schema editor lists, saves and deletes schemas on the source bus: [adobe/da-nx#936](https://github.com/adobe/da-nx/pull/936)
  (merged Nov 25). A new schema's name is checked first (HEAD, then POST), because the source bus has no
  create-only save.
- [x] Scheduled publish of canvas pages (`.html` paths were refused at publish time): [adobe/da-live#1436](https://github.com/adobe/da-live/pull/1436).
  Scheduled snapshot publish is untested on Helix 6.
- [x] YAML site config (`query.yaml`, `sitemap.yaml`) can be written through api.aem.live:
  [adobe/helix-api-service#473](https://github.com/adobe/helix-api-service/pull/473). Used for the Nov 24
  copy: both writes answered 204 and read back unchanged.
- [x] **Bulk preview/publish from da.live**: [adobe/da-nx#1059](https://github.com/adobe/da-nx/pull/1059) (merged Nov 26).
  The app sent per-page requests to the legacy host and got 404. The array API sent its batches to
  `/preview/*` and `/live/*` and got 400. The app now uses the Helix 6 host, and array calls use
  `/preview/` and `/live/`. On the deployed branch, Preview and Publish each succeeded for both test
  pages in da.live. The array API passed preview, publish, unpreview and unpublish on the same pages.

Fixed on main (this repo):

- [x] html2json CDN worker: main no longer calls html2json with a hardcoded `scdemos/demo` path; the
  worker takes its origin from `ORIGIN_HOSTNAME` ([workers/cdn/index.js](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/workers/cdn/index.js#L101)).
- [x] `how-to-author-ue` and `how-to-reuse-demo-site` are gone from demo (404), and with them the
  `content.zip` link. demo-hlx6 drops them with the next content copy.

---

## Not Applicable

- **Universal Editor**: retired for this demo ([#90](https://github.com/scdemos/demo/pull/90)), and there
  is no UE on Helix 6 + DA.
- **Old comments**: `.da/comments` isn't copied. Commenting itself is tracked under "DA apps" below.
- **Versions and dates**: not carried over, by decision. Every doc shows the copy date.
- **Classic editor**: `da.live/edit` redirects to the canvas because of the `ew.enabled` site flag, same as on demo.
- **Everything behind the demo.bbird.live CDN**: login and gated content
  ([#111](https://github.com/scdemos/demo/pull/111)), Edge Commerce product pages, cart and orders
  ([#144](https://github.com/scdemos/demo/pull/144), [#145](https://github.com/scdemos/demo/pull/145)), the
  contact form worker and Target offers only work on demo's production host. demo-hlx6 has no production
  host, and its aem.page/aem.live hosts behave like demo's. The same goes for the `public` part of demo's
  site config (product bus mixer, product indexer, content fragment path mappings) and its `robots.txt`:
  both are for the CDN host and weren't copied.
- **Dynamic Media smart crop dialog**: the picker finds no approved assets with crops. Same AEM author
  as demo, so not a Helix 6 issue.
- **Ping header on overlay sites**: helix-admin's ping also sends `x-api-upgrade-available` when only a
  site's `content.overlay` is on the source bus
  ([index.js#L101-L110](https://github.com/adobe/helix-admin/blob/cb2d5d65fe788f3fcd0f5013e3c474994c60fd19/src/index.js#L101-L110)).
  That is intended
  ([adobe/helix-admin#3771](https://github.com/adobe/helix-admin/issues/3771), closed as completed on
  Oct 14). da.live and the apps follow the ping alone, so a DA site with a source bus overlay counts as
  Helix 6.
- **Image copies keep query params**: a `media_<hash>.png?width=750&format=png` URL from another EDS
  site is stored as the 750px rendition under a new hash. Helix 5 copied the same bytes at preview
  ([mdast-process-images.js#L59-L86](https://github.com/adobe/helix-html2md-lib/blob/65bf45bee30e57ff98e2d7a7a898af879c305f84/src/mdast-process-images.js#L59-L86)).
  Helix 6 copies on save, on purpose ([adobe/helix-api-service#74](https://github.com/adobe/helix-api-service/pull/74),
  [Slack, Aug 27](https://cq-dev.slack.com/archives/C09KTUTCFK8/p1787837268015579)), and puts the new
  media URL in the doc. Clone It drops the rendition params before import
  ([source.js#L94-L130](https://github.com/scdemos/demo/blob/315639c56ee83991e752a4b6f2c91adf2838983d/tools/cloneit/source.js#L94-L130)).
- **`.md` files on the source bus**: the source bus takes html, json, gif, ico, jpeg, jpg, png, svg, webp,
  avif, mp4 and pdf. The list is deliberate:
  [adobe/helix-api-service#318](https://github.com/adobe/helix-api-service/issues/318) asked for `.link`
  and was closed with "we will not support `.link` files in source bus". The EW chat doesn't need `.md`
  there any more:
  - da-agent never supported Helix 6 and is due to be removed before Christmas
    ([Slack, 2026-10-30](https://cq-dev.slack.com/archives/C09KTUTCFK8/p1793391128002559?thread_ts=1793369006.544449)).
    Its `.md` project memory goes with it, and CMA won't have project memory
    ([SITES-54760 thread, 2026-11-23](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795444687667769?thread_ts=1795429693.558869),
    [2026-11-25](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795614332464599?thread_ts=1795429693.558869)).
  - CMA and Coworker keep skills in their own store, not in the content repo (Hannes Hertach and Markus Haack,
    [Slack, 2026-11-25](https://cq-dev.slack.com/archives/C09KTUTCFK8/p1795627215802429?thread_ts=1795626254.173009),
    [2026-11-26](https://cq-dev.slack.com/archives/C09KTUTCFK8/p1795680990886429?thread_ts=1795626254.173009)).
    On a CMA site the ew-extensions skills app uploads skills to the CMA bridge
    ([nx-skills-editor.js#L1135-L1158](https://github.com/adobe-rnd/ew-extensions/blob/42453867aa147aa9e3019f1511e4deda85717a71/blocks/skills/nx-skills-editor.js#L1135-L1158),
    [skills-editor-api.js#L791-L808](https://github.com/adobe-rnd/ew-extensions/blob/42453867aa147aa9e3019f1511e4deda85717a71/blocks/skills/skills-editor-api.js#L791-L808)). Tested on the Helix 6 site
    benpeter/hlx6-cma (2026-11-26): an uploaded skill shows up as a "Personal" skill, and neither the source
    bus nor admin.da.live has a `.da` folder for the site afterwards.
  - CMA can also copy a site's old da-agent skills, read-only
    ([Adobe-AEM-Sites/aem-sites-claudebridge#388](https://github.com/Adobe-AEM-Sites/aem-sites-claudebridge/pull/388)).

  Still to do, but not a Helix 6 issue: demo's six da-agent skills (its `skills` sheet) have to move into
  CMA before da-agent is removed, on demo and demo-hlx6. The CMA chat itself didn't run on the test site,
  because the bridge doesn't have Ben's IMS org on its CMA pilot allowlist ("Tenant
  138A07885EE042D20A495CFA@AdobeOrg is not yet enabled for this preview").

---

## Won't Do

Known problems that won't be fixed.

- **A failed config lookup looks like "no site"**: when helix-admin can't load a site's config, for
  example because the config service answers 5xx, it treats that like a site without config
  ([config/utils.js#L33-L41](https://github.com/adobe/helix-admin/blob/cb2d5d65fe788f3fcd0f5013e3c474994c60fd19/src/config/utils.js#L33-L41),
  [index.js#L219-L224](https://github.com/adobe/helix-admin/blob/cb2d5d65fe788f3fcd0f5013e3c474994c60fd19/src/index.js#L219-L224)).
  The ping then answers 404 without the upgrade header, exactly as for a legacy DA site, so da.live can
  take a Helix 6 site for legacy and save to `admin.da.live`. Only browsers that haven't opened the site
  before are affected. Answering 502 for a failed lookup would fix it. Found in the second review on Nov 24;
  it has been discussed at length since and won't be changed.

- **MSM panel (da-live)**: we won't fix the panel as-is for scdemo, since MSM is getting a full overhaul
  (see MSM inheritance below, [Slack](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795640325947449?thread_ts=1795639365.103839)). The fix stays on
  [da-live/msmhlx6](https://github.com/adobe/da-live/tree/msmhlx6) without a PR, on top of
  [adobe/da-live#1341](https://github.com/adobe/da-live/pull/1341) (open), see also
  [adobe/da-live#1473](https://github.com/adobe/da-live/issues/1473). da-nx#801 removed the `mergeCopy`
  export that merge from base imports, so #1341's merge is broken on main today. That fix is the separate
  branch `msmmerge`, on hold with the four other #1341 fixes (see "Fixes found along the way"). The
  aem-apps MSM app ([adobe-rnd/aem-apps#42](https://github.com/adobe-rnd/aem-apps/pull/42), merged Nov 4)
  is DA-only too.

- **Conditional writes aren't atomic**: a source bus write with `If-Match` or `If-None-Match` checks the
  ETag with a HEAD and then writes without a condition
  ([post.js#L51-L61](https://github.com/adobe/helix-api-service/blob/729986f9bd24f9770eeee6a4bc6614d465d20eb9/src/source/post.js#L51-L61)).
  Two writers that start at the same time both get 201, and one change is lost. Legacy DA passes the
  condition on to storage. Request publish relies on it for its requests sheet, so of two requests sent at
  the same moment, one can be lost. Sean Steimer filed it as
  [adobe/helix-api-service#571](https://github.com/adobe/helix-api-service/issues/571) (closed, not planned) and
  closed both fixes without merging them on Nov 23:
  [adobe/helix-shared#1329](https://github.com/adobe/helix-shared/pull/1329) (closed) and
  [adobe/helix-api-service#574](https://github.com/adobe/helix-api-service/pull/574) (closed).
  Nobody is working on it.

---

## Pending: Blocked on Helix 6

Things Helix 6 doesn't support yet, or supports differently. We can't fix these in our apps or config.

- [ ] **Media over ~4.5 MB**: source writes answer 413 from 4.55 MB up, which is why the videos were
  re-encoded. [adobe/helix-api-service#403](https://github.com/adobe/helix-api-service/issues/403),
  [#408](https://github.com/adobe/helix-api-service/pull/408) (presigned upload, open).
  Workaround, tried on demo-hlx6 on 2026-11-25: a `POST` to `/{org}/sites/{site}/media/{path}` with the JSON
  body `{"url": "<public file url>"}` and an IMS bearer token stored a 5.5 MB mp4 in the media bus (200 in
  1.2 s) and returned `media_<hash>.mp4`. That file is served byte for byte on aem.page and aem.live, and
  range requests work. The API fetches the url itself, without credentials, so the file must be public and
  its host must not block cloud IPs (a Blender url got 502). Limits from the code: 20 MB for images and
  PDFs, 36 MB for mp4, 10 s to fetch. Not tried: PDFs, files over 20 MB, the API key header, and whether
  SC roles have `media:upload`. It does not fix the editor: da-live and EW still save through the source
  PUT, so authors still get the 413. The file lands in the media bus, which authors can't browse, under a
  hash name, and the route is commented out in the OpenAPI spec.

- [ ] **Rate limit without CORS headers**: the 429 of api.aem.live comes from its Fastly service (config
  backup `s2dVksBUsvEKaaYF13wIh6.json` in adobe/aem.page), not from helix-api-service, so helix-api-service's
  CORS wrapper never runs. The limit is keyed by org, site and topic: every `/source/*` call of a site
  shares one bucket, for all users (10 requests per second over 10 seconds, then a 1-minute penalty box).
  Observed on Nov 25: about 180 requests in 7 s trip it, 30 s at 5.5 requests/s don't. After that every
  source call of the site gets a 429 for about 60 s, with no `access-control-*` headers (the browser
  reports `Failed to fetch`), `retry-after: 0` and `x-retry-after: 60`. OPTIONS and unauthenticated
  requests count and can trip it alone. Apps that list folders in parallel break on it.
  [adobe/da-live#1397](https://github.com/adobe/da-live/issues/1397) (open). The fix goes into the Fastly
  VCL. The fragment picker and the prepared fixes for the media library, translations, EW chat, clone it,
  request publish and MSM pace their requests (about 8 starts/s, retry after `x-retry-after` where the
  browser can read it). The schema editor (merged in #936) doesn't pace its requests.

- [ ] **Medialog**: nothing writes the medialog for Helix 6 sites. [adobe/helix-api-service#177](https://github.com/adobe/helix-api-service/issues/177)
  ported the endpoint, but no source write, `/media` upload or preview logs an entry. The media library's
  Images view stays empty because of it. Two open PRs add the logging:
  [adobe/helix-api-service#522](https://github.com/adobe/helix-api-service/pull/522) (media uploads,
  previews and unpreviews) and [adobe/helix-api-service#526](https://github.com/adobe/helix-api-service/pull/526)
  (the images of Helix 6 previews and the path of uploads).

- [ ] **MSM inheritance**: demo is the MSM base for `demo-ca` (the org's `msm` sheet; `demo-us`,
  `demo-wealth` and `demo-advisor` are gone). The da-msm worker reads pages only from legacy DA, and
  Helix 6 previews read the source bus without going through the worker, so demo-hlx6 can't be a base
  today. The `msm` sheet is in the DA org config, which da.live doesn't read for Helix 6 sites. Sean
  Steimer plans Helix 6 support in the next MSM version, tentatively for mid-January
  ([Slack](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795639833844779?thread_ts=1795639365.103839)).
  In his plan MSM and Loc become one app, smart overwrite replaces inheritance (his current thinking),
  and the worker stays only for link rewriting and placeholders
  ([Slack](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795640178769409?thread_ts=1795639365.103839)).
  [adobe/da-live#1794](https://github.com/adobe/da-live/pull/1794) (open, draft: 3-way review in the
  canvas editor) is the first piece. MSM is getting a full overhaul, so we won't fix MSM as-is on Helix 6
  for scdemo ([Slack](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795640326777499?thread_ts=1795639365.103839)). See also the
  MSM panel under "Won't Do".

- [ ] **Permissions model**: on Helix 6, access is the site's role list (`admin`, `author`, `publish`, `view`
  and others, granted to emails or IMS groups as `<imsorgid>/<group>`), and each role covers the whole site.
  The path rows of the DA org permissions sheet (access per folder) have no Helix 6 equivalent; fine-grained
  access is [adobe/helix-api-service#291](https://github.com/adobe/helix-api-service/issues/291) (open).
  From reading helix-api-service, `basic_publish` isn't a role on api.aem.live (not verified, not filed).
  da.live's permissions page ([adobe/da-live#1503](https://github.com/adobe/da-live/pull/1503)) sends Helix 6
  sites to tools.aem.live's user-admin, which edits the site's role list
  ([permissions.js#L28-L33](https://github.com/adobe/da-live/blob/f18b897a7bc8cd43939f0eaa87fd6459a04e9f86/blocks/permissions/permissions.js#L28-L33)).

- [ ] **robots.txt** can't be written through api.aem.live (text/plain body):
  [adobe/helix-api-service#472](https://github.com/adobe/helix-api-service/issues/472), waiting on
  [adobe/helix-shared#1294](https://github.com/adobe/helix-shared/pull/1294) or [#1312](https://github.com/adobe/helix-shared/pull/1312).

- [ ] **Bulk preview of press pages (overlays that need the user's login)**: the press pages come from
  AEM Content Fragments through json2html, which passes the caller's IMS token on to the AEM author.
  A single preview sends the token to any Adobe source, the overlay included. A bulk preview job only
  takes the token along when the site's base `content.source` is an Adobe source
  ([Job.js#L335-L336](https://github.com/adobe/helix-api-service/blob/97307f02efbe1fac47321107456228b8709894d0/src/job/Job.js#L335-L336),
  added in [adobe/helix-api-service#391](https://github.com/adobe/helix-api-service/pull/391)), and it
  never checks `content.overlay`. On demo the base is `content.da.live`, so the token comes along. On
  Helix 6 the base is the source bus, which doesn't count, so the AEM author answers 401 and all 4 press
  pages fell back to 404. Previewing them one at a time worked. Fix: also check `content.overlay` there
  (helix-admin has the same code, but legacy DA sites don't hit it). Not filed.

- [ ] **Setting `content.overlay`**: the source bus site config only takes `content` as a whole object
  (`config/content/overlay.json` answers 400 "invalid object path"). Writing the whole object works and
  keeps the `contentBusId`, which comes from the source URL. Minor, not filed.

---

## Pending: DA apps that only talk to the legacy store

Most DA apps build `admin.da.live` URLs themselves, so on Helix 6 they see an empty site. The shared fix
is da-nx's `nx2/utils/api.js` (`source.*`, `config.*`), which picks the source bus or the legacy store per
site. Apps served from other origins detect Helix 6 themselves, as aem-apps#44 does. "Prepared" means a
pushed branch with tests, live-checked on demo-hlx6 and on legacy DA sites, not yet a PR. Each branch went
through an adversarial review on Nov 24 and a comparison with main on legacy sites on Nov 25; the fixes
from both are pushed. When the Helix 6 check fails, the apps use the legacy store, as main does. Bugs that
main has too are not in these branches. Each is its own small branch and PR, listed under "Fixes found
along the way" below.

- [ ] **Quick edit**: prepared ([da-nx/qehlx6](https://github.com/adobe/da-nx/tree/qehlx6)). The portal
  opens, but nothing becomes editable: it checks `admin.da.live` for the page and gives up on the 404. Also
  hardcodes the collab room and image upload. Small overlaps with the open
  [adobe/da-nx#896](https://github.com/adobe/da-nx/pull/896) and [adobe/da-nx#992](https://github.com/adobe/da-nx/pull/992):
  whichever lands second needs a small rebase.

- [ ] **Translations and rollouts**: prepared ([da-nx/lochlx6](https://github.com/adobe/da-nx/tree/lochlx6)).
  Translate and rollout read `.da/translate.json` from `admin.da.live` and would save projects there. The
  branch now sits on the copy engine from [adobe/da-nx#801](https://github.com/adobe/da-nx/pull/801) (merged
  Nov 4) and hands it a fetch and a config loader that use the source bus on Helix 6. Still open: the
  editor's Rollout panel builds its own copy engine and keeps versions on `admin.da.live`. Main was merged in on Nov 25.

- [ ] **Media library**: [adobe/da-nx#944](https://github.com/adobe/da-nx/pull/944) (open, in review).
  "Site not found" today. With the fix, validation, indexing and rebuild work; the Images view still
  needs the medialog (above). Merge order to agree with
  [adobe/da-nx#866](https://github.com/adobe/da-nx/pull/866). The ping header alone decides where a site
  lives, and a failed check uses DA, as main does. A race in the index lock heartbeat (main has it too)
  is the separate branch `mllockhb`; merge it first or together with this PR.

- [ ] **Request publish**: prepared for the worker
  ([publish-requests-worker/prhlx6](https://github.com/cloudadoption/publish-requests-worker/tree/prhlx6), v1
  and v2 API) and for the aem-apps plugins and inboxes ([aem-apps/rfphlx6](https://github.com/adobe-rnd/aem-apps/tree/rfphlx6)).
  Today the worker reads
  config, checks pages and keeps the requests sheet on `admin.da.live`, and the plugins preview through
  admin.hlx.page, which can't preview Helix 6 pages. The aem-apps branch also fixes two inbox gaps that
  came with [aem-apps#68](https://github.com/adobe-rnd/aem-apps/pull/68) and
  [aem-apps#73](https://github.com/adobe-rnd/aem-apps/pull/73). The worker's new setup routes
  ([publish-requests-worker#41](https://github.com/cloudadoption/publish-requests-worker/pull/41)) only
  use `admin.da.live`, so on Helix 6 the branch refuses them (501) instead of saving config the workflow
  ignores. Whether setup should write `config/editor/da.json` instead is for Sagar to decide. Both branches
  use the ping header alone to pick the store, and a failed detection uses DA, as main does.

- [ ] **EW chat (da-agent)**: prepared (da-agent `agnthlx6`, not pushed). The agent calls Helix 6 pages
  "empty", joins the wrong collab room and would write to the legacy store. Pushing any da-agent branch
  redeploys `da-agent-ci`, and da-agent is to be removed "before Christmas"
  ([Slack](https://cq-dev.slack.com/archives/C0BAAAFRX5L/p1795444687667769?thread_ts=1795429693.558869)).

- [ ] **Site apps (`da.live/apps#/...`)**: nothing prepared.
  [site-apps.js#L67](https://github.com/adobe/da-nx/blob/0f67b1b0c9d2ad7427c2f52fc524b8eab6178ed7/nx/blocks/site-apps/site-apps.js#L67)
  builds `admin.da.live` URLs.

- [ ] **Comments**: commenting doesn't work on Helix 6 sites, probably because Helix 6 doesn't send a
  document ID. [adobe/da-live#1780](https://github.com/adobe/da-live/issues/1780) (open, Usman Khalid),
  including mentions and notifications.

---

## Fixes found along the way (not Helix 6)

These bugs exist on main too. They turned up while the Helix 6 fixes were compared with legacy sites. Each is its own small branch and PR (one fix per branch, red test first), so none rides along with a Helix 6 PR. The branches are pushed. See each item for its PR status. The MSM branches are based on the #1341 head (`5e814350`), the others on `origin/main`. The five MSM branches are on hold, since MSM is getting a full overhaul (see the MSM panel under "Won't Do").

- [ ] **API: org-level `.da` paths**: [da-nx#1072](https://github.com/adobe/da-nx/pull/1072) (draft, `nodaping`), [bug on main](https://github.com/adobe/da-nx/blob/87147d4a881441f968b11243d9445a6cb992f551/nx2/utils/api.js#L680-L699).
  For `/{org}/.da/...` paths nx2 pings `/ping/{org}/.da` and caches the failure. The branch skips the browser ping and uses the legacy store. In da.live, Browse renders the org folder and the list returns 200.

- [ ] **Media library: index lock refresh**: [da-nx/mllockhb](https://github.com/adobe/da-nx/tree/mllockhb), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/media-library/indexing/build.js#L271-L318).
  The build stops its 60-second lock refresh only after it deletes the lock, so a late refresh can write the lock again and the next build sees it as held for up to 10 minutes. Merge before `mlhlx6` or together with it.

- [ ] **Schema editor: markup in schema text**: [da-nx#1071](https://github.com/adobe/da-nx/pull/1071) (draft, `schmesc`), [bug on main](https://github.com/adobe/da-nx/blob/87147d4a881441f968b11243d9445a6cb992f551/nx/blocks/schema-editor/utils/utils.js#L53).
  In the Helix 6 editor, the branch keeps literal `<em>` and `&copy;` in a description after save and reload. Main drops the tags and decodes the entity. #936 already fixed the separate `$&` bug.

- [ ] **Schema editor: files that aren't schemas**: [da-nx#1069](https://github.com/adobe/da-nx/pull/1069) (draft, `schmhtml`), [bug on main](https://github.com/adobe/da-nx/blob/87147d4a881441f968b11243d9445a6cb992f551/nx/blocks/schema-editor/utils/utils.js#L106-L108).
  A sheet in `.da/forms/schemas` can hide a valid schema with the same name. In da.live on legacy DA and Helix 6, main listed the sheets as invalid schemas and the fix opened the `.html` schema without fetching the sheets.

- [ ] **Schema editor: failed save or delete**: [da-nx#1070](https://github.com/adobe/da-nx/pull/1070) (draft, `schmerr`), [bug on main](https://github.com/adobe/da-nx/blob/87147d4a881441f968b11243d9445a6cb992f551/nx/blocks/schema-editor/schema-editor.js#L162-L170).
  The error goes to a field that only exists when creating a schema. With simulated 500s in da.live, the branch shows a warning for both save and delete.

- [ ] **Translations: unreadable `translate.json`**: [da-nx/loccfg](https://github.com/adobe/da-nx/tree/loccfg), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/loc/utils/utils.js#L320).
  A failed read is cached as an empty config, so translate and validate run without the site's languages until a reload.

- [ ] **Translations: copy and archive in the dashboard**: [da-nx/loccopy](https://github.com/adobe/da-nx/tree/loccopy), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/loc/views/dashboard/index.js#L61).
  A 403 or 500 shows as done: copy adds a project that doesn't exist, archive drops one that is still active.

- [ ] **Translations: first load of the dashboard**: [da-nx/locdash](https://github.com/adobe/da-nx/tree/locdash), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/loc/views/dashboard/dashboard.js#L146).
  A failed or cancelled first load leaves the loading bar and nothing else, and later filter changes wait on the same failed load.

- [ ] **Translations: dependent languages**: [da-nx#996](https://github.com/adobe/da-nx/pull/996) (open), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/loc/views/translate/index.js#L370).
  When a source read fails, the page can go to the vendor without content and the dependent language is not retried. #996 covers the `locdeps` fix and keeps the language waiting if a read throws. It needs a test conflict fixed and a review.

- [ ] **Translations: failed page or project read**: [da-nx/locreads](https://github.com/adobe/da-nx/tree/locreads), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/loc/views/translate/index.js#L92-L94).
  A read that throws leaves the page without content and without an error, and it goes to the vendor like that.

- [ ] **Quick edit: failed preview**: [da-nx#1073](https://github.com/adobe/da-nx/pull/1073) (draft, `qepvstat`), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/quick-edit-portal/src/utils.js#L284-L285).
  The message ends after the colon, because admin.hlx.page answers over HTTP/2, which has no status text. The branch adds the status code.

- [ ] **Quick edit: failed start**: [da-nx/qeretry](https://github.com/adobe/da-nx/tree/qeretry), [bug on main](https://github.com/adobe/da-nx/blob/d352ce19c3164d947e2caaacc627198ca9cc951b/nx/blocks/quick-edit-portal/quick-edit-portal.js#L122-L127).
  A network error on the image cookie or the document check is kept for the life of the page, so nothing opens until a reload.

- [ ] **MSM (on top of #1341): merge from base**: [da-live/msmmerge](https://github.com/adobe/da-live/tree/msmmerge), [bug on main](https://github.com/adobe/da-live/blob/5e8143502a17bc6619deb806557fd67ed5f8779b/blocks/edit/da-prepare/actions/msm/helpers/utils.js#L69-L77).
  #1341 imports `mergeCopy` from loc code that da-nx#801 moved to the public SDK, so every merge fails with "mergeCopy is not a function".

- [ ] **MSM (on top of #1341): inherited pages**: [da-live/msmhead](https://github.com/adobe/da-live/tree/msmhead), [bug on main](https://github.com/adobe/da-live/blob/5e8143502a17bc6619deb806557fd67ed5f8779b/blocks/edit/da-prepare/actions/msm/helpers/config.js#L71-L77).
  Any failed HEAD counts as "no page of its own", so a 403 or 5xx lists a satellite as inherited, and Cancel inheritance overwrites its page.

- [ ] **MSM (on top of #1341): resume inheritance**: [da-live/msmstat](https://github.com/adobe/da-live/tree/msmstat), [bug on main](https://github.com/adobe/da-live/blob/5e8143502a17bc6619deb806557fd67ed5f8779b/blocks/edit/da-prepare/actions/msm/helpers/utils.js#L45-L54).
  A failed status read counts as "not previewed, not published", so the override is deleted and preview and live keep serving it.

- [ ] **MSM (on top of #1341): result of resume inheritance**: [da-live/msmrepub](https://github.com/adobe/da-live/tree/msmrepub), [bug on main](https://github.com/adobe/da-live/blob/5e8143502a17bc6619deb806557fd67ed5f8779b/blocks/edit/da-prepare/actions/msm/msm.js#L234-L254).
  A failed re-preview or re-publish is ignored and the row shows success.

- [ ] **MSM (on top of #1341): one unreadable satellite**: [da-live/msmauth](https://github.com/adobe/da-live/tree/msmauth), [bug on main](https://github.com/adobe/da-live/blob/5e8143502a17bc6619deb806557fd67ed5f8779b/blocks/shared/utils.js#L78-L95).
  A 401 from DA sends the whole editor to /not-found.

- [ ] **Clone it: site name check**: [demo/cloneck](https://github.com/scdemos/demo/tree/cloneck), [bug on main](https://github.com/scdemos/demo/blob/4172925b11690f68656f8c904b7eaf4ea3fb36e9/tools/cloneit/cloneit.js#L460-L463).
  Every answer except 2xx counts as "name is free", so a 401, 403, 429 or 5xx lets the clone go on: it creates the repo and copies the DA content, and a 409 on the config write is answered with a POST that replaces the existing config.

---

## Pending: Tools and workers in this repo

Most of these came with main since Nov 17. They call `admin.da.live` and admin.hlx.page directly, or
only accept demo's hosts. Read from the code, not tried on demo-hlx6.

- [ ] **Clone it**: [#166](https://github.com/scdemos/demo/pull/166) (open, in review; branch
  [demo/clonehx6](https://github.com/scdemos/demo/tree/clonehx6)), redone on main's reworked Clone it
  ([#115](https://github.com/scdemos/demo/pull/115), [#128](https://github.com/scdemos/demo/pull/128),
  [#129](https://github.com/scdemos/demo/pull/129), [#132](https://github.com/scdemos/demo/pull/132),
  [#133](https://github.com/scdemos/demo/pull/133)). On main, "Start clone" stays disabled on demo-hlx6
  because the worker's CORS allowlist only has demo's origins; the PR adds demo-hlx6's, for calls with the
  user's IMS token only. Opened from demo-hlx6, it clones demo-hlx6 as an experimental Helix 6 demo: it
  creates the new site's config first, copies through the source bus with the requester's token, previews
  and publishes through the Helix 6 API and builds the query index. The requester and demo-hlx6's admins get the
  `admin` site role, `*@adobe.com` gets none, and the requester joins demo-hlx6's `author`, `publish` and
  `config_admin` roles. Opened from any other site, it
  still clones demo as on main. On Nov 26 live test clones from the branch with the worker preview
  published 194 pages and assets and built the query index; the test sites and repos are deleted again.
  AEM Code Sync writes a default site config (content in DA) 8-18 s after a new repo is added, which
  replaced ours on the first live run; Clone it now replaces only that default and checks again after the
  copy. The classic path from demo isn't tested live from the branch yet. Merging changes
  `workers/cloneit_token/**`, which deploys the production worker. Demo Admin still can't delete a Helix 6
  clone (it only accepts `content.da.live` sources). The check that a new site name is free is the
  separate branch `cloneck`.

- [ ] **Demo Admin** ([#142](https://github.com/scdemos/demo/pull/142), [#143](https://github.com/scdemos/demo/pull/143)):
  backs up and resets the demo and deletes CloneIt demos. It copies and deletes through `admin.da.live` and
  previews and publishes through admin.hlx.page
  ([demo-admin.js#L6](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/tools/demo-admin/demo-admin.js#L6)).
  Deleting a CloneIt demo only works when its content source is `content.da.live/<org>/<site>/`
  ([admin.js#L84](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/workers/cloneit_token/admin.js#L84)),
  so a Helix 6 clone can't be deleted from there.

- [ ] **Frescopa Studio** ([#124](https://github.com/scdemos/demo/pull/124)): reads and saves the app
  document, the schemas in `.da/forms/schemas`, folder lists and the site config through `admin.da.live`,
  and previews through admin.hlx.page
  ([frescopa-studio.js#L20](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/tools/frescopa-studio/frescopa-studio.js#L20)).

- [ ] **Page insights** ([#153](https://github.com/scdemos/demo/pull/153), [#154](https://github.com/scdemos/demo/pull/154)):
  the worker checks access with `admin.da.live/list/scdemos/demo` (`SITE` in
  [wrangler.toml](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/workers/page_insights/wrangler.toml#L15)),
  so it checks access to demo, not demo-hlx6.

- [ ] **Access app** ([#130](https://github.com/scdemos/demo/pull/130)): records sign-up requests in a sheet
  on `admin.da.live` and adds people to the GitHub team. Only matters once demo itself moves.

- [ ] **Worker allowlists**: the access, page insights, content search (AI search,
  [#135](https://github.com/scdemos/demo/pull/135)) and Clone it workers allow `main--demo--scdemos` and
  `*--demo--scdemos` origins. `main--demo-hlx6--scdemos` matches none of them. The content search and feed
  workers also read content from demo's hosts (`CONTENT_ORIGIN`), so demo-hlx6 would need its own config.
  The Clone it worker gets demo-hlx6's origins in [#166](https://github.com/scdemos/demo/pull/166), for
  calls with the user's IMS token only.

- [ ] **Customer demos** ([#103](https://github.com/scdemos/demo/pull/103), `.github/workflows/provision-demo.yaml`,
  the `customer-demo` skill): build on Clone it sites with DA content.

---

## Pending: Config and content (our side)

- [ ] **Keep the copy current**: demo keeps changing (a how-to was published during the Nov 24 copy).
  The copy scripts compare demo's DA files and delivery state with demo-hlx6, so a later run only has
  to pick up the changes.

- [ ] **Walkthrough again**: demo's showcase lists 27 how-tos now. New since Oct 9:
  `how-to-create-customer-demo`, `how-to-integrate-workfront`, `how-to-publish-rss-feeds`,
  `how-to-showcase-omnichannel`, `how-to-use-edge-commerce`. Gone from demo: `how-to-use-msm`,
  `how-to-use-quick-edit`, `how-to-manage-translations-and-rollouts`, `how-to-use-ew-basics`,
  `how-to-reuse-demo-site`, `how-to-author-ue`.

- [ ] **Event template images (this repo)**: `templates/events/events.html` loads event images from
  `main--demo--scdemos.aem.live`
  ([events.html#L49](https://github.com/scdemos/demo/blob/8b0b6a69914d07e9e7ab421eb873cfae8396dc1e/templates/events/events.html#L49)),
  so event pages on demo-hlx6 show demo's images. A relative URL would work for both sites.

- [ ] **Orphan pages on demo**: `/en/offers/member-week` is live on demo but has no DA source, so authors
  can't edit it there (rebuilt on demo-hlx6, see above). demo also still serves 7 pages whose source is
  gone (`/de/fragments/contact-us`, `feedback`, `got-feedback`, `tabs-about-us`, the two
  `/fragments/offers/hero-*` Target offers, `/docs/library/blocks/journey-map`); demo-hlx6 kept their
  October copies live.

- [ ] **Access roles**: test them with real users. Running helix-api-service's role code against the live
  config (Nov 25) says an `@adobe.com` user who isn't listed can open demo-hlx6's pages but not save them,
  someone who is only in the `da-demosite-authors` IMS group can save and publish, and unlisted users get
  no access to a Helix 6 clone, as with a classic clone. Nobody like that has tried it yet.

- [ ] **how-to-add-new-users**: on Helix 6 the IMS groups go into the site's access roles, not the DA
  permissions sheet. Update the doc.

- [ ] **Icons in git (this repo)**: main added only `icons/logo.svg`. The 10 svgs under `/icons/` still exist
  only as previewed content. Check which ones the redesign still uses and commit those.

- [ ] **Broken images and videos (demo content)**: every image was stored in the media bus during the
  copy, except in 3 docs whose DA source on demo already has `about:error` images: `/en/membership`,
  `/experiments/membership-cta/challenger-1` and `/docs/library/templates/event`.
  `how-to-see-page-analytics` links `experience-workspace-page-insights-ga4.mp4`, which doesn't exist on
  demo either.

- [ ] **xmod reskin prompt**: the prompt template in `/demo-docs/` tells the agent to read and write through
  `admin.da.live` and `admin.hlx.page`, the wrong store for a Helix 6 site.

- [ ] **Recheck after upstream deploys**: page and section metadata in the canvas (gated content toggle,
  nav/footer overrides) after da-universal#307.

- [ ] **Test content**: `/drafts/hlx6-tests/` holds pages and media from the fix tests. Keep or remove.
