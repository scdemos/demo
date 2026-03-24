# Demo presenter (`/tools/demo`)

Full-screen slide walkthrough driven by **JSON** from Document Authoring structured content (or any URL that returns that shape).

**Use:** Open **`/tools/demo/demo.html`**, paste a JSON URL (or a site-relative path like `demo-slides`). State is stored in **`localStorage`** (`tools-demo-walkthrough-v1`). **Change URL** clears deck, step, storage, and **`?url=`** in the address bar.

**Deep link:** `demo.html?url=…` — full URL or short path; the query string stays in the bar for sharing. Example: `?url=https%3A%2F%2Fda-sc.adobeaem.workers.dev%2Fpreview%2Fscdemos%2Fdemo%2Fdrafts%2Fdemo-slides%2Fdemo` or `?url=demo-slides` (resolves to `{origin}/demo-slides`).

**Pencil → DA:** Shown when the fetch URL maps to an edit screen — Adobe preview (`…adobeaem.workers.dev/preview/…`) or paths listed in **`DA_EDIT_BY_PATHNAME`** in `demo.js`.

**Schema:** [`demo-walkthrough.schema.json`](demo-walkthrough.schema.json). Wrapped `{ "data": { … } }` is supported.

**Docs:** [Structured content in DA](https://docs.da.live/developers/guides/structured-content)
