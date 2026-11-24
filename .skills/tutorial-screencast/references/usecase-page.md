# New usecase page (demo-docs)

When the user asks for a **new** usecase page (not a video for an existing one), build the page,
the video and the catalog entry together. Steps 3–5 of SKILL.md (spec, takes, upload) are the same.

## 1. Find the story in the demo site

Before writing, check what the site really does, so the page and the video show real behaviour:
- Read the site code and the app or tools it involves (e.g. `tools/frescopa-studio/README.md`,
  `~/repos/github.com/scdemos/frescopa-app`), and the live content (`.plain.html`, `.json`).
- Find the shared pieces the demo can change for real (fragments, data sheets, structured content).
- Read the closest existing usecase page (`/demo-docs/usecases/*`) and reuse its videos or wording
  where they still fit. Check every link you keep (`curl -L`), and drop dead ones.

## 2. Write the page HTML

Name: `/demo-docs/usecases/how-to-<verb>-<topic>` (lowercase, hyphens), like the other pages.
Structure (each `<div>` in `<main>` is a section; `section-metadata` Style `divider` draws the line):

```html
<body>
  <header></header>
  <main><div><h1>How to …</h1><p>Two or three sentences: what it is and why a customer cares.</p><div class="section-metadata"><div><div><p>Style</p></div><div><p>divider</p></div></div></div></div><div><h3>Demo</h3><div class="embed 600px"><div><div><p><a href="https://main--demo--scdemos.aem.page/demo-docs/media/<slug>.mp4">https://main--demo--scdemos.aem.page/demo-docs/media/<slug>.mp4</a></p></div></div></div><ol><li>Steps a presenter follows, with links to the real pages and tools.</li></ol><div class="section-metadata"><div><div><p>Style</p></div><div><p>divider</p></div></div></div></div><div><h3>How it works</h3><ul><li>…</li></ul><div class="section-metadata"><div><div><p>Style</p></div><div><p>divider</p></div></div></div></div><div><h3>Key Points</h3><ul><li>…</li></ul><div class="section-metadata"><div><div><p>Style</p></div><div><p>divider</p></div></div></div></div><div><h2>Related Articles</h2><div class="related-articles"><div><div><p>keywords</p></div><div><p>demo, usecases</p></div></div></div><div class="metadata"><div><div><p>title</p></div><div><p>How to …</p></div></div><div><div><p>description</p></div><div><p>One sentence for search and cards.</p></div></div><div><div><p>keywords</p></div><div><p>demo, video, …</p></div></div><div><div><p>date</p></div><div><p>Month D, YYYY, 12:00 PM EST</p></div></div></div></div></main>
  <footer></footer>
</body>
```

- Add a "Before and after a demo" section when the demo changes live content: what to set back.
- Write plainly (the avoid-ai-writing skill). Name UI controls in bold as they appear.
- See `how-to-showcase-omnichannel` and `how-to-reuse-structured-content` for finished examples.

## 3. Create, list, preview

```bash
node scripts/page.mjs create /demo-docs/usecases/<name> out/pages/<name>.html
node scripts/page.mjs showcase /demo-docs/usecases/<name> --section "Content Use Cases" \
  --usecase "Short use-case name" --title "Link text" [--after /demo-docs/usecases/<related>] --dry-run
node scripts/page.mjs showcase …same arguments without --dry-run
```

Sections of `/demo-docs/usecase-showcase`: Authoring Modes, Ease of Authoring, Content Use Cases,
Advanced Use Cases. Then preview, in da.live: the video (media folder › select › Preview), the new
page and `usecase-showcase` (each: Send › Preview › Update). Check the page and the video on aem.page.
Publish only when the user says so; Preflight can block it (see lessons.md).
