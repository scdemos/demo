# scdemos/demo -> Helix 6 Migration

## Overview

`scdemos/demo-hlx6` is a copy of `scdemos/demo` on Helix 6: same code (this repo), content on the
source bus (`https://api.aem.live/scdemos/sites/demo-hlx6/source/...`) instead of DA's legacy store
(`admin.da.live`). This document tracks what it takes to run the demo there: what is done, what we
still have to do on our side, and where Helix 6 or the DA apps don't support something yet. It's
our worklist, so the open items name the PR, issue or prepared fix behind them.

**Research scope**: walkthrough of all 31 how-to scripts on demo-hlx6 on Oct 9 (9 work, 10 partly,
10 broken, 2 not testable), PR and issue states checked Oct 30.

- demo: https://main--demo--scdemos.aem.page/
- demo-hlx6: https://main--demo-hlx6--scdemos.aem.page/
- Helix 6 API: https://github.com/adobe/helix-api-service ([migration.md](https://github.com/adobe/helix-api-service/blob/main/migration.md))

---

## Completed ✓

Site setup and content:

- [x] Site created with the source bus as content source. The org needs nothing enabled beyond that.
- [x] Content copied: 562 files. Pages that weren't live on demo (368) were unpublished again after the copy.
- [x] DA site config: the 13 sheets live in `editor.da` of the site config, where da.live reads them for
  Helix 6 sites. Library, prompts, skills, prepare and flags rows are picked up.
- [x] Library: `blocks.json`, `templates.json` and `icons.json` point at demo-hlx6 instead of demo.
- [x] Videos: 16 how-to videos re-encoded to 3.2-3.9 MB and relinked (the source bus refuses larger
  uploads, see below). All 27 mp4 links on the how-to pages answer 200.
- [x] Icons: the 10 svgs under `/icons/` existed only as previewed content on demo, not in DA or git.
  Copied from demo's aem.page to the source bus, previewed and published.
- [x] Query and FAQ index: `query.yaml` copied (indices `default` and `faqs`), bulk-indexed.
  `/search` shows the same results as demo.
- [x] Feedback form: the `demo.bbird.live/contact-us/` endpoint is back in all 40 `contact-us` and
  `feedback` fragments.
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
  [adobe/helix-api-service#473](https://github.com/adobe/helix-api-service/pull/473) (not retested after deploy)

---

## Not Applicable

- **Universal Editor**: retired for this demo ([#90](https://github.com/scdemos/demo/pull/90)), and there
  is no UE on Helix 6 + DA. `how-to-author-ue` should go (see content items below).
- **Comments**: off on Helix 6 by design, `.da/comments` isn't copied.
- **Versions and dates**: not carried over, by decision. Every doc shows the copy date.
- **Classic editor**: `da.live/edit` redirects to the canvas because of the `ew.enabled` site flag, same as on demo.
- **Everything behind the demo.bbird.live CDN**: login, gated content delivery, edge commerce (PDPs,
  product lists), the contact form worker and Target offers only work on demo's production host.
  demo-hlx6 has no production host, and its aem.page/aem.live hosts behave like demo's.
- **Dynamic Media smart crop dialog**: the picker finds no approved assets with crops. Same AEM author
  as demo, so not a Helix 6 issue.

---

## Pending: Blocked on Helix 6

Things Helix 6 doesn't support yet, or supports differently. We can't fix these in our apps or config.

- [ ] **File types**: the source bus takes html, json, gif, ico, jpeg, jpg, png, svg, webp, avif, mp4 and pdf.
  `/demo-docs/media/content.zip` (linked from `how-to-reuse-demo-site`) can't be stored. The `.md` skills
  in `.da/skills/` can't either (the six skills come through the `skills` sheet instead), and neither can
  the EW chat's `.md` project memory.

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

- [ ] **MSM inheritance**: demo is the MSM base for `demo-us`, `demo-wealth` and `demo-advisor`. A source
  bus site has no fetch-time inheritance, so demo-hlx6 can't be a base. See also the MSM panel below.

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
  `.da/translate.json` from `admin.da.live` and would save projects there. On hold until
  [adobe/da-nx#801](https://github.com/adobe/da-nx/pull/801) lands, which moves the copy code the fix touches.

- [ ] **Media library**: prepared (da-nx `mlhlx6`). "Site not found" today. With the fix, validation,
  indexing and rebuild work; the Images view still needs the medialog (above). Merge order to agree with
  [adobe/da-nx#866](https://github.com/adobe/da-nx/pull/866).

- [ ] **Request publish**: prepared for the worker (cloudadoption/publish-requests-worker `prhlx6`, v1 and
  v2 API) and for the aem-apps plugins and inboxes (adobe-rnd/aem-apps `rfphlx6`). Today the worker reads
  config, checks pages and keeps the requests sheet on `admin.da.live`, and the plugins preview through
  admin.hlx.page, which can't preview Helix 6 pages.

- [ ] **EW chat (da-agent)**: prepared (adobe-rnd/da-agent `agnthlx6`). The agent calls Helix 6 pages
  "empty", joins the wrong collab room and would write to the legacy store.

- [ ] **MSM panel (da-live)**: prepared on top of [adobe/da-live#1341](https://github.com/adobe/da-live/pull/1341)
  (open), see also [adobe/da-live#1473](https://github.com/adobe/da-live/issues/1473). The aem-apps MSM app
  ([adobe-rnd/aem-apps#42](https://github.com/adobe-rnd/aem-apps/pull/42)) is DA-only too.

- [ ] **Clone it (this repo)**: prepared (`clonehx6`). "Start clone" stays disabled on demo-hlx6 because the
  worker's CORS allowlist only has demo's origins; past that, it lists and copies through `admin.da.live` and
  creates the new site with a `content.da.live` source. Merging changes `workers/cloneit_token/**`, which
  deploys the worker. Creating a Helix 6 site from it is untested.

- [ ] **Site apps (`da.live/apps#/...`)**: nothing prepared.
  [site-apps.js#L67](https://github.com/adobe/da-nx/blob/0f67b1b0c9d2ad7427c2f52fc524b8eab6178ed7/nx/blocks/site-apps/site-apps.js#L67)
  builds `admin.da.live` URLs.

---

## Pending: Config and content (our side)

- [ ] **DA org config**: `editor.path` rows only exist for demo, so `/faqs` on demo-hlx6 opens in the canvas
  instead of the form editor and `/demo-slides` doesn't open in formsref. The `msm` sheet has no demo-hlx6
  row. Rows prepared, not applied.

- [ ] **json2html**: event detail pages 404 and the json2html worker answers 500 (no config for
  `scdemos/demo-hlx6/main`). Set the worker config first, then `content.overlay` in the site config: preview
  only falls back to the base source on 401/403/404, so an overlay pointing at an unconfigured worker would
  break every preview. The JSON-LD Event example page depends on it too.

- [ ] **Content fragment overlay**: same overlay, plus the `/articles/` worker entry from demo's worker
  config. The script's template link (`cf-templates/article.html`) is stale on both sites.

- [ ] **Access roles**: test edit, preview and publish as a plain `@adobe.com` user.

- [ ] **how-to-add-new-users**: on Helix 6 the IMS groups go into the site's access roles, not the DA
  permissions sheet. Update the doc.

- [ ] **how-to-author-ue**: remove (UE is retired). It's already unpublished on demo-hlx6.

- [ ] **how-to-reuse-demo-site**: `content.zip` can't be on the source bus; host it elsewhere or drop the link.

- [ ] **Icons in git (this repo)**: commit the 10 svgs to `icons/`, so neither site depends on icons that
  exist only as previewed content.

- [ ] **Broken images**: `/start-here` already had broken images on demo, and two xmod docs
  (`/demo-docs/usecases/how-to-reskin-using-xmod`, `/demo-docs/media/healthdemo-xmod-prompt`) pointed at a
  `demo.bbird.live` image that 404s. Interning stored them as `about:error`. Replace the images.

- [ ] **html2json CDN worker (this repo)**: `workers/cdn/index.js` hardcodes `scdemos/demo`.

- [ ] **xmod reskin prompt**: the prompt template in `/demo-docs/` tells the agent to read and write through
  `admin.da.live` and `admin.hlx.page`, the wrong store for a Helix 6 site.

- [ ] **Recheck after upstream deploys**: page and section metadata in the canvas (gated content toggle,
  nav/footer overrides) after da-universal#307, and a `query.yaml` write through api.aem.live after
  helix-api-service#473.

- [ ] **Test content**: `/drafts/hlx6-tests/` holds pages and media from the fix tests. Keep or remove.
