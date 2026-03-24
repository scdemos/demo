# Demo presenter (`/tools/demo`)

Full-screen slide walkthrough driven by **JSON** from Document Authoring structured content (or any URL that returns that shape).

**Use:** Open **`/tools/demo/demo.html`**, paste a JSON URL (or a site-relative path like `demo-slides`). State is stored in **`localStorage`** (`tools-demo-walkthrough-v1`). **Change URL** clears deck, step, storage, and **`?url=`** in the address bar.

**Deep link:** `demo.html?url=…` — full URL or short path; the query string stays in the bar for sharing. Example: `?url=https%3A%2F%2Fda-sc.adobeaem.workers.dev%2Fpreview%2Fscdemos%2Fdemo%2Fdrafts%2Fdemo-slides%2Fdemo` or `?url=demo-slides` (resolves to `{origin}/demo-slides`).

**DA shortcuts** (when the fetch URL maps): **pencil** → `da.live/formsref#/…` (edit structured content). **+** / setup **New** → `da.live/#/…` parent folder in browse (e.g. `…/drafts/demo-slides`) to create documents. Preview URLs or **`DA_EDIT_BY_PATHNAME`** in `demo.js`.

**Schema:** [`demo-walkthrough.schema.json`](demo-walkthrough.schema.json). Wrapped `{ "data": { … } }` is supported.

**Docs:** [Structured content in DA](https://docs.da.live/developers/guides/structured-content)
