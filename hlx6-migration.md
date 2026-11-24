# scdemos/demo -> Helix 6 Migration

## Overview

`scdemos/demo-hlx6` is a copy of `scdemos/demo` on Helix 6: same code (this repo), content on the
source bus (`https://api.aem.live/scdemos/sites/demo-hlx6/source/...`) instead of DA's legacy store
(`admin.da.live`). This document tracks what it takes to run the demo there: what is done, what we
still have to do on our side, and where Helix 6 or the DA apps don't support something yet. It's
our worklist, so the open items name the PR, issue or prepared fix behind them.

**Research scope**: walkthrough of all 31 how-to scripts on demo-hlx6 on Oct 9 (9 work, 10 partly,
10 broken, 2 not testable), PR and issue states checked Nov 19, caught up with main on Nov 24
([#103](https://github.com/scdemos/demo/pull/103) to [#154](https://github.com/scdemos/demo/pull/154)),
content and DA site config copied again from demo on Nov 24.

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
- [x] Access roles: demo's site roles copied, `*@adobe.com` and the two demo IMS groups can publish
  (see the verification item below).
- [x] Scheduler: demo-hlx6 registered with its own API key.
- [x] Publish request worker: demo-hlx6 registered (same settings as demo). It only helps once the worker
  supports Helix 6, see request publish below.
- [x] Images that pointed at `content.da.live/scdemos/demo/...` (63 refs in 13 docs) were interned
  into the media bus on save.

Fixed upstream:

- [x] Canvas routes Helix 6 sites to the source bus: [adobe/da-live#1249](https://github.com/adobe/da-live/pull/1249)
- [x] Co-editing saves without a 401, image writes use POST: [adobe/da-collab#197](https://github.com/adobe/da-collab/pull/197), [adobe/da-collab#193](https://github.com/adobe/da-collab/pull/193)
- [x] Canvas metadata: page metadata and section metadata were ignored in the canvas because Helix 6
  returns pretty-printed HTML: [adobe/da-universal#306](https://github.com/adobe/da-universal/issues/306),
  [adobe/da-universal#307](https://github.com/adobe/da-universal/pull/307) (merged Oct 28, not rechecked on demo-hlx6 yet)
- [x] Fragment picker lists Helix 6 sites: [adobe-rnd/aem-apps#44](https://github.com/adobe-rnd/aem-apps/pull/44).
  Retested Oct 29: list, search, preview and insert work. Loading takes 20-30s (paced listing) vs ~3s on demo.
- [x] Scheduled publish of canvas pages (`.html` paths were refused at publish time): [adobe/da-live#1436](https://github.com/adobe/da-live/pull/1436).
  Scheduled snapshot publish is untested on Helix 6.
- [x] YAML site config (`query.yaml`, `sitemap.yaml`) can be written through api.aem.live:
  [adobe/helix-api-service#473](https://github.com/adobe/helix-api-service/pull/473). Used for the Nov 24
  copy: both writes answered 204 and read back unchanged.

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

---

## Pending: Blocked on Helix 6

Things Helix 6 doesn't support yet, or supports differently. We can't fix these in our apps or config.

- [ ] **File types**: the source bus takes html, json, gif, ico, jpeg, jpg, png, svg, webp, avif, mp4 and pdf.
  The `.md` skills in `.da/skills/` can't be stored (the six skills come through the `skills` sheet
  instead), and neither can the EW chat's `.md` project memory or zip downloads.

- [ ] **Media over ~4.5 MB**: source writes answer 413 from 4.55 MB up, which is why the videos were
  re-encoded. [adobe/helix-api-service#403](https://github.com/adobe/helix-api-service/issues/403),
  [#408](https://github.com/adobe/helix-api-service/pull/408) (presigned upload, open).

- [ ] **Rate limit without CORS headers**: the source bus allows 10 requests/s per project and answers
  more with a 429 that has no CORS headers, so browsers report a network error instead of a 429. Apps
  that list folders in parallel break on it. [adobe/da-live#1397](https://github.com/adobe/da-live/issues/1397) (open).
  The fragment picker and the prepared fixes for the media library, translations, EW chat and clone it
  pace their requests (4 in flight, 8 starts/s, retry after `x-retry-after`). The schema editor doesn't yet.

- [ ] **Medialog**: nothing writes the medialog for Helix 6 sites. [adobe/helix-api-service#177](https://github.com/adobe/helix-api-service/issues/177)
  ported the endpoint, but no source write, `/media` upload or preview logs an entry. The media library's
  Images view stays empty because of it. No issue yet.

- [ ] **MSM inheritance**: demo is the MSM base for `demo-ca` (the org's `msm` sheet; `demo-us`,
  `demo-wealth` and `demo-advisor` are gone). A source bus site has no fetch-time inheritance, so
  demo-hlx6 can't be a base. The `msm` sheet is in the DA org config, which da.live doesn't read for
  Helix 6 sites. See also the MSM panel below.

- [ ] **Permissions model**: the DA org permissions sheet (IMS groups, path rows, read-only users) has no
  Helix 6 equivalent; access is the site's role list. From reading helix-api-service, `basic_publish`
  isn't a role on api.aem.live (not verified, not filed). da.live's new permission UI
  ([adobe/da-live#1503](https://github.com/adobe/da-live/pull/1503)) edits the DA sheet, not the Helix 6 role list.

- [ ] **robots.txt** can't be written through api.aem.live (text/plain body):
  [adobe/helix-api-service#472](https://github.com/adobe/helix-api-service/issues/472), waiting on
  [adobe/helix-shared#1294](https://github.com/adobe/helix-shared/pull/1294) or [#1312](https://github.com/adobe/helix-shared/pull/1312).

- [ ] **Bulk preview/publish from da.live**: da-nx sends Helix 6 bulk operations to `.../live/*`
  ([api.js#L848](https://github.com/adobe/da-nx/blob/69006f3b54984630e06f77e287e329bde12738d0/nx2/utils/api.js#L848)),
  and api.aem.live answers 400 "bulk operation must target the resource root" (it wants `.../live/`).
  Seen from a script, not tried in the da.live UI yet. No issue yet.

- [ ] **AEM Assets URLs**: the source bus keeps `/adobe/dynamicmedia/deliver/` URLs as external images, but
  interns `/adobe/assets/urn:...` URLs on POST (and refuses them on PUT). The editor uses POST, so it works,
  but the doc ends up with a media bus copy instead of the DAM URL.

- [ ] **Image interning keeps query params**: `media_<hash>.png?width=750&format=png` gets interned as the
  750px rendition under a new hash. Not filed.

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
local branch with tests, live-checked on demo-hlx6, not yet a PR.

- [ ] **Schema editor**: [adobe/da-nx#936](https://github.com/adobe/da-nx/pull/936) (open, in review).
  Shows "No schemas found" and saves to the legacy store.

- [ ] **Quick edit**: prepared (da-nx `qehlx6`). The portal opens, but nothing becomes editable: it checks
  `admin.da.live` for the page and gives up on the 404. Also hardcodes the collab room and image upload.
  Small overlap with [adobe/da-nx#896](https://github.com/adobe/da-nx/pull/896).

- [ ] **Translations and rollouts**: prepared (da-nx `lochlx6`). Translate and rollout read
  `.da/translate.json` from `admin.da.live` and would save projects there.
  [adobe/da-nx#801](https://github.com/adobe/da-nx/pull/801) merged on Nov 4, so the branch no longer
  waits on it, but it needs a rebase onto it (#801 moved the copy code the fix touches).

- [ ] **Media library**: [adobe/da-nx#944](https://github.com/adobe/da-nx/pull/944) (open, in review).
  "Site not found" today. With the fix, validation, indexing and rebuild work; the Images view still
  needs the medialog (above). Merge order to agree with
  [adobe/da-nx#866](https://github.com/adobe/da-nx/pull/866).

- [ ] **Request publish**: prepared for the worker (cloudadoption/publish-requests-worker `prhlx6`, v1 and
  v2 API) and for the aem-apps plugins and inboxes (adobe-rnd/aem-apps `rfphlx6`). Today the worker reads
  config, checks pages and keeps the requests sheet on `admin.da.live`, and the plugins preview through
  admin.hlx.page, which can't preview Helix 6 pages.

- [ ] **EW chat (da-agent)**: prepared (adobe-rnd/da-agent `agnthlx6`). The agent calls Helix 6 pages
  "empty", joins the wrong collab room and would write to the legacy store.

- [ ] **MSM panel (da-live)**: prepared on top of [adobe/da-live#1341](https://github.com/adobe/da-live/pull/1341)
  (open), see also [adobe/da-live#1473](https://github.com/adobe/da-live/issues/1473). The aem-apps MSM app
  ([adobe-rnd/aem-apps#42](https://github.com/adobe-rnd/aem-apps/pull/42), merged Nov 4) is DA-only too.

- [ ] **Site apps (`da.live/apps#/...`)**: nothing prepared.
  [site-apps.js#L67](https://github.com/adobe/da-nx/blob/0f67b1b0c9d2ad7427c2f52fc524b8eab6178ed7/nx/blocks/site-apps/site-apps.js#L67)
  builds `admin.da.live` URLs.

- [ ] **Comments**: commenting doesn't work on Helix 6 sites, probably because Helix 6 doesn't send a
  document ID. [adobe/da-live#1780](https://github.com/adobe/da-live/issues/1780) (open, Usman Khalid),
  including mentions and notifications.

---

## Pending: Tools and workers in this repo

Most of these came with main since Nov 17. They call `admin.da.live` and admin.hlx.page directly, or
only accept demo's hosts. Read from the code, not tried on demo-hlx6.

- [ ] **Clone it**: prepared (`clonehx6`), but main reworked Clone it since
  ([#115](https://github.com/scdemos/demo/pull/115), [#128](https://github.com/scdemos/demo/pull/128),
  [#129](https://github.com/scdemos/demo/pull/129), [#132](https://github.com/scdemos/demo/pull/132),
  [#133](https://github.com/scdemos/demo/pull/133)): it copies the whole site, gives the requester write on
  the clone's DA content and config, and asks for the demo's GitHub team. `clonehx6` conflicts with main in
  `tools/cloneit/cloneit.js`, its README and the worker's `wrangler.toml`, so it has to be redone on top.
  On Helix 6 the write grant would become a site role. "Start clone" stays disabled on demo-hlx6 because
  the worker's CORS allowlist only has demo's origins; past that, it lists and copies through `admin.da.live`
  and creates the new site with a `content.da.live` source. Merging changes `workers/cloneit_token/**`,
  which deploys the worker.

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

- [ ] **Access roles**: test edit, preview and publish as a plain `@adobe.com` user.

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
