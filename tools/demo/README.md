# Demo presenter (`/tools/demo`)

**What it is:** A simple full-screen presenter you open in the browser. It shows slides from **JSON** (same idea as a slide deck, but content lives in Document Authoring structured content, not PowerPoint).

**What you do:**

1. Open **`/tools/demo/demo.html`** (with the dev server running).
2. Paste the **JSON URL** your structured content publishes (preview or live delivery). The app remembers it in the browser.
3. Present: use **← →** or the dots at the bottom. **Change URL** clears the saved link if you need another deck.

**One-click open:** add **`?url=`** with your JSON URL (encoded). Example — same deck as pasting the URL into the field:

`/tools/demo/demo.html?url=https%3A%2F%2Fda-sc.adobeaem.workers.dev%2Fpreview%2Fscdemos%2Fdemo%2Fdrafts%2Fdemo-slides%2Fdemo`

The full URL (including `?url=…`) stays in the address bar so you can copy it and share the same deep link.

**Same site, shorter:** a value without `http(s)://` is resolved against the current origin (e.g. `?url=demo-slides` → `https://demo.bbird.live/demo-slides`). Works in the query field and in the setup form.

**Content shape:** See [`demo-walkthrough.schema.json`](demo-walkthrough.schema.json). Top bar: `topbarTitle`, optional `topbarSubtitle`. Each slide has `slideTitle`, optional bullets, takeaway, and `openInBrowser` buttons (`buttonText` + full `url`). DA JSON is often wrapped as `{ "data": { … } }`; the app reads that automatically.

**Docs:** [Structured Content in Document Authoring](https://docs.da.live/developers/guides/structured-content)
