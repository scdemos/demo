/*
 * customer-demo: DA + AEM Admin API from a signed-in da.live tab (integrated browser, no tokens).
 *
 * The SC signs in to https://da.live once in the harness's browser. da.live keeps the Adobe IMS token
 * in window.adobeIMS and sends it as a Bearer token to both admin.da.live and admin.hlx.page, so this
 * helper does everything the skill needs without anyone copying a token. The token never leaves the
 * tab and is never returned.
 *
 * Usage: open a tab on https://da.live/#/scdemos/<slug>, then evaluate this file's function with one
 * operation. VS Code: runPlaywrightCode → `return page.evaluate(<this file's function>, { op, … })`;
 * Playwright MCP: browser_evaluate. Raise the tool timeout for bulk/backup: they poll AEM jobs.
 *
 *   { op: 'whoami' }                                   → { email, hours } (token lifetime left)
 *   { op: 'list', site, path: '/', deep: false }       → [{ path, folder }]
 *   { op: 'move', site, from: '/a.html', to: '/drafts/x/a.html' }
 *   { op: 'bulk', site, action: 'preview'|'publish'|'unpublish', paths: ['/', '/about'] }
 *                                                      → { ok, failed } (publish = preview + live)
 *   { op: 'status', site, path: '/' }                  → { preview, live }
 *   { op: 'code', site }                               → full code sync (HTTP status)
 *   { op: 'backup', site, keep?: [...], dryRun: true } → base demo pages → /drafts/demo-backup, unpublished
 *        → { ok, unpublished, failed: [...] }. Nothing moves unless every unpublish succeeded; re-running
 *          is safe (already-moved items are gone from the plan).
 *   { op: 'purgeBackup', site, confirm: 'parity-complete', dryRun? }
 *        → deletes /drafts/demo-backup (only that subtree) once the migration passed parity; the base
 *          demo pages stay available in scdemos/demo itself. → { ok, deleted, failed }
 */
// eslint-disable-next-line no-unused-expressions
async ({
  op, org = 'scdemos', site, ref = 'main', ...a
}) => {
  const DA = 'https://admin.da.live';
  const AEM = 'https://admin.hlx.page';
  const tok = window.adobeIMS?.getAccessToken?.();
  if (!tok?.token) return { error: 'not signed in: sign in to https://da.live in this tab first' };
  const auth = { Authorization: `Bearer ${tok.token}`, 'x-content-source-authorization': `Bearer ${tok.token}` };
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const call = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, error: r.headers.get('x-error') || (r.ok ? null : text.slice(0, 160)) };
  };
  const aem = (method, route, body) => call(`${AEM}${route}`, {
    method, body: body && JSON.stringify(body), headers: body ? { 'content-type': 'application/json' } : {},
  });
  // DA source path (/a/index.html, /m.json) → web path (/a/, /m.json)
  const web = (p) => p.replace(/\.html$/, '').replace(/(^|\/)index$/, '$1');

  const list = async (path = '/', deep = false) => {
    const r = await call(`${DA}/list/${org}/${site}${path === '/' ? '' : path}`);
    if (r.status !== 200) throw new Error(`list ${path}: ${r.status}`);
    const items = (r.json || []).map((x) => ({ path: x.path.replace(`/${org}/${site}`, ''), folder: !x.ext }));
    if (!deep) return items;
    const out = [];
    for (const x of items) {
      out.push(x);
      // eslint-disable-next-line no-await-in-loop
      if (x.folder) out.push(...await list(x.path, true));
    }
    return out;
  };

  const job = async (route, body) => {
    const r = await aem('POST', `/${route}/${org}/${site}/${ref}/*`, body);
    if (!r.json?.job) throw new Error(`${route}: ${r.status} ${r.error || ''}`);
    const want = new Set(body.paths);
    const self = r.json.links?.self || `${AEM}/job/${org}/${site}/${ref}/${r.json.job.topic}/${r.json.job.name}`;
    for (let i = 0; i < 300; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await wait(2000);
      // eslint-disable-next-line no-await-in-loop
      const d = await call(`${self}/details`);
      if (d.json?.state === 'stopped') {
        const res = d.json.data?.resources || [];
        // a path the job never reported is a failure, not a success
        const seen = new Set(res.map((x) => x.path));
        return [...res, ...[...want].filter((x) => !seen.has(x)).map((x) => ({ path: x, status: 'missing' }))];
      }
    }
    throw new Error(`${route} job did not finish in 10 minutes`);
  };
  const bulk = async (action, paths) => {
    if (!paths.length) return { ok: true, failed: [] };
    const del = action === 'unpublish';
    const steps = del ? [['live', { paths, delete: true }], ['preview', { paths, delete: true }]]
      : [['preview', { paths, forceUpdate: true }], ...(action === 'publish' ? [['live', { paths, forceUpdate: true }]] : [])];
    const failed = [];
    for (const [route, body] of steps) {
      // eslint-disable-next-line no-await-in-loop
      const res = await job(route, body);
      // unpublishing something that was never published (404) is fine
      res.filter((x) => !(typeof x.status === 'number' && (x.status < 300 || (del && x.status === 404)))).forEach((x) => failed.push(`${route} ${x.path} ${x.status}`));
    }
    return { ok: !failed.length, failed };
  };
  // destructive: only absolute, normalized paths; never the root
  const safe = (p) => typeof p === 'string' && /^\/[^/]/.test(p) && !/\/\/|\/\.\.?(\/|$)/.test(p);
  const move = async (from, to) => {
    if (!safe(from) || !safe(to) || from === to) throw new Error(`refusing move ${from} → ${to}`);
    const body = new FormData();
    body.append('destination', `/${org}/${site}${to}`);
    const r = await call(`${DA}/move/${org}/${site}${from}`, { method: 'POST', body });
    if (r.status >= 300) throw new Error(`move ${from}: ${r.status} ${r.error || ''}`);
    return r.status;
  };

  if (op === 'whoami') {
    const p = await window.adobeIMS.getProfile?.();
    return { email: p?.email || null, hours: tok.expire ? Math.round((new Date(tok.expire) - Date.now()) / 36e5) : null };
  }
  if (!site) return { error: 'site is required' };
  if (op === 'list') return list(a.path, a.deep);
  if (op === 'move') return { status: await move(a.from, a.to) };
  if (op === 'bulk') return bulk(a.action, a.paths || []);
  if (op === 'status') {
    const r = await aem('GET', `/status/${org}/${site}/${ref}${a.path || '/'}`);
    return { preview: r.json?.preview?.status, live: r.json?.live?.status, error: r.error };
  }
  if (op === 'code') return (await aem('POST', `/code/${org}/${site}/${ref}/*`)).status;
  if (op === 'backup') {
    // The authoring kit stays; every base demo page, folder and fragment moves to /drafts/demo-backup,
    // unpublished first, so the site, search and the query index only show the customer's pages.
    const keep = a.keep || ['/docs', '/drafts', '/forms', '/fragments/404.html', '/icons', '/media',
      '/nav.html', '/footer.html', '/search.html', '/metadata.json', '/placeholders.json', '/redirects.json'];
    const kept = (p) => keep.some((k) => p === k || p.startsWith(`${k}/`));
    const holdsKept = (p) => keep.some((k) => k.startsWith(`${p}/`));
    const toMove = [];
    const plan = async (path) => {
      for (const x of await list(path)) {
        const hidden = x.path.split('/').pop().startsWith('.');
        // eslint-disable-next-line no-await-in-loop
        if (!hidden && !kept(x.path)) { if (x.folder && holdsKept(x.path)) await plan(x.path); else toMove.push(x); }
      }
    };
    await plan('/');
    const files = [];
    for (const x of toMove) {
      // eslint-disable-next-line no-await-in-loop
      if (x.folder) files.push(...(await list(x.path, true)).filter((f) => !f.folder).map((f) => f.path));
      else files.push(x.path);
    }
    const paths = [...new Set(files.filter((f) => /\.(html|json)$/.test(f)).map(web))];
    // nav and footer are rewritten for the customer: keep a copy of the base ones
    const copies = ['/nav.html', '/footer.html'];
    if (a.dryRun) return { move: toMove.map((x) => x.path), copy: copies, unpublish: paths.length };
    const unpublished = await bulk('unpublish', paths);
    // never move content whose URL may still be live: fix the failures (or pass force: true) and re-run
    if (!unpublished.ok && !a.force) return { ok: false, unpublished: paths.length, failed: unpublished.failed, moved: [] };
    const failed = [];
    const moved = [];
    for (const x of toMove) {
      // eslint-disable-next-line no-await-in-loop
      await move(x.path, `/drafts/demo-backup${x.path}`).then(() => moved.push(x.path), (e) => failed.push(e.message));
    }
    for (const c of copies) {
      // eslint-disable-next-line no-await-in-loop
      const src = await call(`${DA}/source/${org}/${site}${c}`);
      if (src.status !== 200) { failed.push(`copy ${c}: read ${src.status}`); continue; }
      const body = new FormData();
      body.append('data', new Blob([src.text], { type: 'text/html' }));
      // eslint-disable-next-line no-await-in-loop
      const put = await call(`${DA}/source/${org}/${site}/drafts/demo-backup${c}`, { method: 'PUT', body });
      if (put.status >= 300) failed.push(`copy ${c}: write ${put.status}`);
    }
    return { ok: !failed.length, unpublished: paths.length, failed: [...unpublished.failed, ...failed], moved };
  }
  if (op === 'purgeBackup') {
    // final cleanup, only after a successful migration (parity.mjs exit 0), only inside the backup folder
    if (a.confirm !== 'parity-complete') return { error: "refusing: pass confirm: 'parity-complete' after parity.mjs exits 0" };
    const root = '/drafts/demo-backup';
    let items;
    try { items = await list(root, true); } catch (e) { return /404/.test(e.message) ? { ok: true, deleted: 0, failed: [], note: 'no backup folder' } : { error: e.message }; }
    // files first, then folders deepest-first, so every DELETE targets an empty folder
    const order = [...items.filter((x) => !x.folder), ...items.filter((x) => x.folder).sort((x, y) => y.path.length - x.path.length), { path: root, folder: true }];
    if (order.some((x) => !(x.path === root || x.path.startsWith(`${root}/`)) || !safe(x.path))) return { error: 'refusing: path outside the backup folder' };
    if (a.dryRun) return { delete: order.length, sample: order.slice(0, 5).map((x) => x.path) };
    const failed = [];
    for (const x of order) {
      // eslint-disable-next-line no-await-in-loop
      const r = await call(`${DA}/source/${org}/${site}${x.path}`, { method: 'DELETE' });
      if (r.status >= 300 && r.status !== 404) failed.push(`${x.path} ${r.status}`);
    }
    return { ok: !failed.length, deleted: order.length - failed.length, failed };
  }
  return { error: `unknown op ${op}` };
};
