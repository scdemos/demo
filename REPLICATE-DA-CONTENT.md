# Runbook — Replicate Oura DA content to a NEW DA site

Paste this whole file into a fresh session as your instructions. It copies **all
content** from the source Document Authoring (DA) site to a new one, so the new
site renders identically. **Content only** — the new site's code (CSS/JS/blocks/
fonts) is assumed already set up (see Prerequisites).

---

## 0. Fill these in first

```
SOURCE_ORG   = scdemos
SOURCE_SITE  = oura-ring
TARGET_ORG   = <fill in — the new DA org>
TARGET_SITE  = <fill in — the new DA site name>
```

Everywhere below, substitute your `TARGET_ORG` / `TARGET_SITE`.

Source live site (for before/after visual comparison):
`https://main--oura-ring--scdemos.aem.live/`

---

## 1. Prerequisites (verify BEFORE copying — do not skip)

1. **Access to the target org.** DA writes and AEM preview/publish for
   `TARGET_ORG` must be authorized for this session. Credentials are injected
   automatically — do **not** paste any token into the chat. Confirm with the
   two probes in §3; if either returns 401/403, stop and tell the user to enable
   the matching opt-in in Settings → LLM Permissions for that org, then retry.
2. **The target site's CODE already serves the same blocks.** Content here uses
   these blocks/templates: `header`, `footer`, `cards` (default / `product` /
   `overlay` / `no-images`), `hero`, `tabs`, `teaser`, `columns`, `quiz`,
   `form`, `fragment`, `search`, `social-share`, plus the `article` **template**
   (`templates/article`) and the section-metadata / `#mega` nav handling in
   `scripts/scripts.js`. If the target's code doesn't provide these, blocks will
   render as raw tables. (Code repo for reference: GitHub `scdemos/demo`, deploy
   branch `oura-ring`, at commit `73676f3`.)
3. **Same fonts/tokens.** Visual parity (amber/teal Nordic retheme, Akkurat LL +
   Editorial New fonts) comes from the code, not the content — so it's automatic
   if #2 holds.

---

## 2. The copy primitive (proven this session)

DA stores each doc as raw bytes; copying = **GET source → POST target**, then
preview, then publish. No `Authorization` header — it's injected.

```bash
S=admin.da.live/source        # DA source API (read + write)
H=admin.hlx.page              # AEM admin (preview + publish)
SRC=scdemos/oura-ring
DST=$TARGET_ORG/$TARGET_SITE

# READ raw stored doc/asset:
curl -s "https://$S/$SRC/<PATH>"                    # <PATH> includes extension

# WRITE to target (multipart, field name MUST be "data"):
curl -s -X POST -F "data=@<localfile>;type=<MIME>" "https://$S/$DST/<PATH>"

# PREVIEW then PUBLISH (path WITHOUT extension; folder-index uses the folder path):
curl -s -X POST "https://$H/preview/$DST/main/<PATH_NO_EXT>"
curl -s -X POST "https://$H/live/$DST/main/<PATH_NO_EXT>"
```

MIME by extension: `.html`→`text/html`, `.json`→`application/json`,
`.png`→`image/png`, `.jpg/.jpeg`→`image/jpeg`, `.webp`→`image/webp`,
`.svg`→`image/svg+xml`.

**Path→preview rule:** drop `.html`. `index.html` → preview at the **folder**
(`/blog/introducing-oura-ring-5/index.html` → `.../main/blog/introducing-oura-ring-5/`;
root `index.html` → `.../main/`). JSON and binary assets are **copied to source
only** — do not preview/publish them.

Expected status: source write `200/201`, preview/publish `200`.

---

## 3. Auth probes (run first)

```bash
# DA write to target (creates a throwaway, then leave it or delete):
curl -s -o /dev/null -w "DA write: %{http_code}\n" -X POST \
  -F "data=@-;type=text/html" "https://admin.da.live/$TARGET_ORG/$TARGET_SITE/.probe.html" <<< "<body><main><div>probe</div></main></body>"
# AEM preview on target:
curl -s -o /dev/null -w "hlx preview: %{http_code}\n" -X POST \
  "https://admin.hlx.page/preview/$TARGET_ORG/$TARGET_SITE/main/.probe"
```
Both must be `200/201`. If not → stop, request the opt-in, retry.

---

## 4. Enumerate the source tree (authoritative — don't trust a stale list)

```bash
enumerate() { local p="$1"; local j=$(curl -s "https://admin.da.live/list/scdemos/oura-ring$p")
  echo "$j" | grep -oE '"path":"[^"]+","name":"[^"]+","ext":"[^"]+"' | sed -E 's/"path":"([^"]+)".*/\1/'
  for f in $(echo "$j" | grep -oE '\{"path":"[^"]+","name":"[^"]+"\}' | grep -oE '"path":"[^"]+"' | sed -E 's/"path":"([^"]+)"/\1/'); do
    enumerate "${f#/scdemos/oura-ring}"; done; }
enumerate "/" | sed 's|/scdemos/oura-ring||' | sort > /tmp/da-src.txt
wc -l /tmp/da-src.txt
```

As of this writing the source held **127 entries: 94 `.html`, 9 `.json`, 24
binary (images/icons)**. Full checklist is in §8.

---

## 5. Copy order (assets → configs → docs)

**Copy binary assets and JSON configs FIRST** (docs reference them), then HTML.

```bash
DST=$TARGET_ORG/$TARGET_SITE
mkdir -p /tmp/copy

copy_one() {                      # $1 = path with extension
  local path="$1" ext="${1##*.}" mime
  case "$ext" in
    html) mime=text/html;; json) mime=application/json;;
    png) mime=image/png;; jpg|jpeg) mime=image/jpeg;;
    webp) mime=image/webp;; svg) mime=image/svg+xml;; gif) mime=image/gif;;
    *) mime=application/octet-stream;;
  esac
  local lf="/tmp/copy/$(echo "$path" | tr '/' '_')"
  curl -s "https://admin.da.live/source/scdemos/oura-ring$path" -o "$lf"

  # --- IMAGE-REFERENCE REWRITE (only for .html; see §6) ---
  if [ "$ext" = html ]; then
    sed -i "s#content.da.live/scdemos/oura-ring#content.da.live/$DST#g" "$lf"
  fi

  local up=$(curl -s -o /dev/null -w "%{http_code}" -X POST -F "data=@$lf;type=$mime" "https://admin.da.live/source/$DST$path")
  echo "  write $path -> $up"
}

# 1) assets + json (no preview/publish needed)
grep -E '\.(png|jpg|jpeg|webp|svg|gif|json)$' /tmp/da-src.txt | while read -r p; do copy_one "$p"; done

# 2) html docs
grep '\.html$' /tmp/da-src.txt | while read -r p; do copy_one "$p"; done
```

---

## 6. ⚠️ Image references — the one real gotcha (read before running §5)

Source docs reference images in **four** ways. This determines fidelity:

| Pattern in stored HTML | What to do |
|---|---|
| `content.da.live/scdemos/oura-ring/.../…png` (uploaded assets + `.index/…-{hash}` renditions) | Rewritten to `content.da.live/$TARGET_ORG/$TARGET_SITE/…` by the `sed` in §5. **After you copy the raw assets (§5 step 1), DA regenerates renditions on preview.** If any image 404s on the target, fall back: for that doc, revert the rewrite so the URL points back at the source site (`content.da.live/scdemos/oura-ring/…`) — it resolves cross-origin and always works. |
| `ouraring.com/blog/wp-content/…` (external, on the 3 new blog articles + listing) | Leave as-is — external, resolves anywhere; DA re-ingests on preview into `media_*`. |
| `main--retaildemo--scdemos.aem.live/…` and `main--demo--scdemos.aem.live/…` (STALE retail-demo leftovers) | These live only in **leftover/cruft docs** (see §8). If you copy those docs, the refs still resolve from the old demo hosts but are off-brand. Prefer to **skip those docs** (§8) or rewrite/replace the image. |

**Fastest path that's guaranteed to render (recommended for a first pass):** run
§5 **without** the `sed` line — copy every doc byte-for-byte. All images then
load from the source site's `content.da.live` / external hosts. The new site is
visually identical immediately; it's just not asset-self-contained (depends on
the source site staying alive). Add the `sed` + asset copy later if you need
independence, and verify per §7.

---

## 7. Preview + publish + verify

```bash
DST=$TARGET_ORG/$TARGET_SITE
prev_path() { local p="${1%.html}"; p="${p%/index}"; echo "$p"; }   # index→folder

grep '\.html$' /tmp/da-src.txt | while read -r p; do
  pp=$(prev_path "$p")
  pc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://admin.hlx.page/preview/$DST/main$pp")
  lc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://admin.hlx.page/live/$DST/main$pp")
  printf "  %-50s preview:%s live:%s\n" "$pp" "$pc" "$lc"
done

# Spot-check renders (expect non-empty + no broken images):
for pp in / /blog /why-oura /blog/introducing-health-radar /membership; do
  b=$(curl -s "https://main--$TARGET_SITE--$TARGET_ORG.aem.live$pp" | wc -c)
  echo "  $pp -> ${b} bytes"
done
```

Verification checklist:
- Homepage `/`, `/blog`, an article, a stub, a fragment-driven page all render
  non-empty and look like the source live site (compare against
  `https://main--oura-ring--scdemos.aem.live/`).
- No broken images (check a few in the browser; if any 404, apply §6 fallback).
- Nav mega-menus + footer render (these are code-driven; confirms Prereq #2).
- Light **and** dark theme both look right.

---

## 8. Inventory & the curated-vs-cruft decision

"All our work" = the **curated Oura content** below. The DA site also carries
**retail-demo leftovers** that were never part of the Oura build — decide whether
to copy them. Recommendation: **copy the curated set; skip the cruft.**

**CURATED (copy these):**
- Root pages: `index`, `why-oura`, `how-it-works`, `experience`, `membership`,
  `integrations`, `sizing`, `store`, `health-features`, `sleep-and-rest`,
  `heart-health`, `stress`, `activity-and-movement`, `womens-health`,
  `metabolic-health`, `science-and-research`
- Store: `store/rings/oura-ring-5`, `store/rings/oura-ring-4`,
  `store/rings/oura-ring-4-ceramic`,
  `store/accessories/oura-ring-5-charging-case`,
  `store/accessories/oura-ring-4-charging-case`
- Blog: `blog` (listing), `blog/introducing-oura-ring-5` **and**
  `blog/introducing-oura-ring-5/index` (+ its `images/` folder: 5 pngs),
  `blog/introducing-health-radar`, `blog/new-software-features`,
  `blog/inside-the-ring-oura-ring-5`
- Fragments: `fragments/404`, `fragments/contact-us`, `fragments/feedback`,
  `fragments/got-feedback`, `fragments/homepage-quiz`,
  `fragments/learn-home-teaser`, `fragments/login-teaser`,
  `fragments/tabs-about-us`, `fragments/tabs-starting-point`,
  `fragments/whats-next`
- Nav/footer fragments: `nav`, `footer`
- Learn (top-level, rewritten to Oura): `learn`, `learn/analytics`,
  `learn/customer-experience`, `learn/digital-commerce`,
  `learn/employee-development`, `learn/inventory`, `learn/omnichannel`,
  `learn/store-operations`, `learn/supply-chain`, `learn/sustainability`,
  `learn/trends`
- Doc-library scaffolds you rewrote to Oura: `blog/new-release`,
  `docs/library/templates/article`
- Configs: `metadata.json`, `redirects.json`, `forms/contact-us.json`,
  `docs/library/*.json` (only if the target uses the DA block library/sidekick)
- Assets: everything under `/blog/introducing-oura-ring-5/images/` (5 pngs) and
  any Oura icons the code doesn't already ship.

**CRUFT (retail-demo leftovers — skip unless you specifically want them):**
- `blog/tst`, `blog/labor-day-campaign-blog`
- `fragments/start-here-quiz`
- The **deep** `learn/*/*` child pages (e.g.
  `learn/analytics/online-vs-instore-analytics`,
  `learn/inventory/inventory-calculator`, etc. — ~20 pages, still retail copy +
  stale `main--retaildemo` images)
- `/images/retail-*.jpg` (6 retail stock photos)
- `/docs/library/blocks/*` demo pages (carry `main--demo--scdemos` demo images)
- Locale stubs `/es`, `/fr` and `es/translate.json` (unless you need i18n)
- `search.html`, `learn.html` if not linked from your nav

> To copy the curated set only, build `/tmp/da-src.txt` from the CURATED list
> above instead of the full enumeration in §4, then run §5–§7 unchanged.

---

## 9. Order of operations (tl;dr)

1. Fill in §0. Run §3 auth probes — both `200`? proceed.
2. Enumerate (§4) or hand-build the curated list (§8).
3. Decide image strategy (§6): **verbatim copy (fastest)** or **rewrite+assets
   (self-contained)**.
4. Copy assets/JSON, then HTML (§5).
5. Preview + publish + verify (§7).
6. Compare a handful of pages against the source live site, light + dark.

Done when the target's `/`, `/blog`, an article, and a stub render identically to
`https://main--oura-ring--scdemos.aem.live/` with no broken images or raw tables.
