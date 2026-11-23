// Demo admin app (opened from da.live, demo admins only).
// Backup and reset run here with the admin's own Adobe token: DA (admin.da.live) copies and deletes,
// the Admin API (admin.hlx.page) previews and publishes. Deleting a CloneIt demo goes through the
// CloneIt worker, whose technical account administers every demo site.
const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';
const DA = 'https://admin.da.live';
const HELIX = 'https://admin.hlx.page';
const ORG = 'scdemos';
const SITE = 'demo';
const ROOT = `/${ORG}/${SITE}`;
const BACKUP = `${ROOT}/.backup`;
const INFO = `${BACKUP}/backup-info.json`;
// one row per backup, reset or demo delete; it stays put when the backup is replaced or restored
const OPS = `${BACKUP}/demo-admin-operations.json`;
const OPS_MAX = 200;
// top-level folders the backup leaves out (and reset leaves alone)
const SKIP = new Set(['drafts']);
// pages and sheets are previewed and published; media is served from DA
const PUBLISHABLE = new Set(['html', 'json']);
const BULK_MAX = 1000;
const params = new URLSearchParams(window.location.search);
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** ?worker= is honored only for local testing: a page served locally talking to a local worker. */
function workerUrl() {
  const fallback = 'https://demo.bbird.live/cloneit';
  if (!LOCAL_HOSTS.includes(window.location.hostname)) return fallback;
  try {
    const u = new URL(params.get('worker') || '');
    if (u.protocol !== 'http:' || !LOCAL_HOSTS.includes(u.hostname) || u.username || u.password) return fallback;
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return fallback;
  }
}
const WORKER = workerUrl();

const TRY_AGAIN = 'Try again in a few minutes. If it keeps failing, report code';
const MESSAGES = {
  sign_in_required: 'Open this page from da.live while signed in with your Adobe account.',
  token_not_accepted: 'Open this page from da.live while signed in with your Adobe account.',
  token_invalid: 'Your Adobe sign-in expired. Reload the page.',
  user_not_allowed: 'Only demo admins can use this page.',
  demo_admins_only: 'Only demo admins can use this page.',
  no_backup: 'There\'s no backup yet. Back up the demo first.',
  site_is_protected: 'This site is protected and can\'t be deleted.',
  not_a_cloneit_demo: 'This site wasn\'t created with CloneIt, so it can\'t be deleted here.',
  content_source_not_the_demo_folder: 'This site shares content with another site, so it can\'t be deleted here.',
  code_not_the_demo_repo: 'This site isn\'t set up like a CloneIt demo, so it can\'t be deleted here.',
  invalid_site_name: 'That isn\'t a valid demo name.',
};
// errors without their own message, by prefix
const KINDS = [
  ['github_repo_delete', 'Couldn\'t delete the GitHub repo.'],
  ['github_', 'Couldn\'t reach GitHub.'],
  ['org_config_', 'Couldn\'t update the permissions.'],
  ['content_delete', 'Couldn\'t delete the demo\'s content.'],
  ['site_config', 'Couldn\'t update the site settings.'],
  ['bulk_job', 'Couldn\'t start publishing changes.'],
  ['scan_', 'Couldn\'t check the demo\'s pages.'],
  ['job_read', 'Couldn\'t check the demo\'s pages.'],
];
/** A message an admin can act on; unexpected errors keep a short code to pass on. */
function say(error) {
  const code = String(error || '');
  if (MESSAGES[code]) return MESSAGES[code];
  const kind = KINDS.find(([prefix]) => code.startsWith(prefix));
  if (kind) return `${kind[1]} ${TRY_AGAIN} ${code.split(':')[0]}.`;
  // the app's own errors are already sentences
  if (/\s/.test(code)) return code;
  return `Something went wrong. ${TRY_AGAIN} ${code || 'unknown'}.`;
}
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

let token = '';
let email = '';
let busy = false;

/* ---------- small UI helpers ---------- */

function setStatus(text, error = false) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', error);
}

/** A progress list: step(text) adds a line and returns a function that updates it. */
function progress(id) {
  const ol = $(id);
  ol.replaceChildren();
  ol.hidden = false;
  return (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    ol.append(li);
    return (next, state = '') => {
      li.textContent = next;
      li.className = state;
    };
  };
}

/** Asks for confirmation; with `typed`, the admin has to type it first. Resolves true on confirm. */
function confirmAction({
  title, text, typed = '', action,
}) {
  const dialog = $('confirm');
  const input = $('confirm-input');
  const ok = $('confirm-ok');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-label').textContent = typed ? `Type ${typed} to confirm` : '';
  $('confirm-label').hidden = !typed;
  input.hidden = !typed;
  input.value = '';
  ok.textContent = action;
  ok.className = typed ? 'danger' : '';
  ok.disabled = !!typed;
  input.oninput = () => { ok.disabled = input.value.trim() !== typed; };
  // Enter in the field confirms (the form's first button is Cancel)
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!ok.disabled) ok.click();
  };
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

function lock(on) {
  busy = on;
  document.querySelectorAll('#tools button').forEach((b) => { b.disabled = on; });
}

/**
 * Runs an operation with its progress list and adds a row to the operations log. `fn(step, notes)` returns
 * { result, comments } (default ok); `notes` collects what got done, so a stopped run still says how far it got.
 */
async function run(logId, fn, { action, target }) {
  if (busy) return;
  lock(true);
  const step = progress(logId);
  const notes = [];
  let row;
  try {
    const out = await fn(step, notes);
    row = { result: out?.result || 'ok', comments: out?.comments ?? notes.filter(Boolean).join(' ') };
  } catch (e) {
    step(`Stopped: ${say(e.message)}`)(`Stopped: ${say(e.message)}`, 'fail');
    row = { result: 'stopped', comments: [...notes.filter(Boolean), `Stopped: ${say(e.message)}`].join(' ') };
  }
  if (!await logOperation({ action, target, ...row })) {
    step('Couldn\'t add this to the operations log')('Couldn\'t add this to the operations log', 'fail');
  }
  lock(false);
}

/* ---------- DA ---------- */

function da(path, init = {}) {
  return fetch(`${DA}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}

async function daList(path) {
  const items = [];
  let next = '';
  do {
    const res = await da(`/list${path}`, next ? { headers: { 'da-continuation-token': next } } : {});
    if (!res.ok) throw new Error(`Couldn't list ${path} (${res.status})`);
    items.push(...await res.json());
    next = res.headers.get('da-continuation-token') || '';
  } while (next);
  return items;
}

/** Every file under `path`, skipping the SKIP folders at the top. */
async function daWalk(path, top = true) {
  const files = [];
  const items = await daList(path);
  for (const item of items) {
    if (item.ext) files.push(item);
    else if (!(top && SKIP.has(item.name))) files.push(...await daWalk(item.path, false));
  }
  return files;
}

/** Copies a file or a whole folder; DA copies a batch per call and answers 206 while more remain. */
async function daCopy(from, to) {
  let cont = '';
  for (let i = 0; i < 500; i += 1) {
    const form = new FormData();
    form.append('destination', to);
    if (cont) form.append('continuation-token', cont);
    const res = await da(`/copy${from}`, { method: 'POST', body: form });
    if (res.status === 206) {
      cont = (await res.json()).continuationToken;
    } else if (res.ok) {
      return;
    } else {
      throw new Error(`Couldn't copy ${from} (${res.status})`);
    }
  }
  throw new Error(`Copying ${from} didn't finish`);
}

/** Deletes a file or a whole folder; DA deletes a batch per call and answers 206 while more remain. */
async function daDelete(path) {
  for (let i = 0; i < 500; i += 1) {
    const res = await da(`/source${path}`, { method: 'DELETE' });
    if (res.status === 204 || res.status === 404 || res.status === 200) return;
    if (res.status !== 206) throw new Error(`Couldn't delete ${path} (${res.status})`);
  }
  throw new Error(`Deleting ${path} didn't finish`);
}

/**
 * What to copy at the top of `path`: its folders and files (minus SKIP), plus the contents of the hidden
 * folders: `.da` (product settings such as comments and translation) and the `.<page>` folders where DA
 * keeps the images of top-level pages. DA hides those folders from listings and treats a dotted name as a
 * single file, so their contents are copied item by item. The backup's own files (its details and the
 * operations log) are never removed or restored.
 */
async function topItems(path) {
  const items = (await daList(path)).filter((i) => i.ext || !SKIP.has(i.name));
  const hidden = await daList(`${path}/.da`);
  for (const page of items.filter((i) => i.ext === 'html')) {
    hidden.push(...await daList(`${path}/.${page.name}`));
  }
  return [...items, ...hidden].filter((i) => i.path !== OPS);
}
const rel = (path, root) => path.slice(root.length) || '/';
const isHidden = (path, root) => rel(path, root).split('/').some((part) => part.startsWith('.'));

/**
 * Every file backup and reset handle under `root`, including `.da` and the hidden `.<page>` image folder
 * of every page (DA hides those folders from listings, so each one is listed by name).
 */
async function allFiles(root) {
  const files = await daWalk(root);
  files.push(...await daWalk(`${root}/.da`, false));
  const folders = files.filter((f) => f.ext === 'html')
    .map((f) => `${f.path.slice(0, f.path.lastIndexOf('/'))}/.${f.name}`);
  for (let i = 0; i < folders.length; i += 10) {
    const found = await Promise.all(folders.slice(i, i + 10).map((folder) => daWalk(folder, false)));
    files.push(...found.flat());
  }
  return files.filter((f) => f.path !== INFO && f.path !== OPS);
}

async function readBackupInfo() {
  const res = await da(`/source${INFO}`);
  if (!res.ok) return null;
  const sheet = await res.json().catch(() => null);
  return sheet?.data?.[0] || null;
}

async function writeBackupInfo(info) {
  const sheet = {
    total: 1, limit: 1, offset: 0, data: [info], ':type': 'sheet',
  };
  const form = new FormData();
  form.append('data', new Blob([JSON.stringify(sheet)], { type: 'application/json' }));
  const res = await da(`/source${INFO}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Couldn't save the backup details (${res.status})`);
}

function showBackupInfo(info) {
  $('backup-info').textContent = info
    ? `Last backup: ${new Date(info.created).toLocaleString()} by ${info.by}, ${info.files} files.`
    : 'No backup yet.';
}

/**
 * Adds a row to the top of the operations log. Writes are conditional on the version that was read
 * (If-Match, or If-None-Match for a new log), so two admins logging at once can't overwrite each other:
 * the one that loses re-reads and tries again.
 */
async function logOperation(row) {
  const entry = {
    date: new Date().toISOString(), by: email, action: row.action, target: row.target, result: row.result, comments: row.comments,
  };
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // start a new log only when there is none; any other read problem must not overwrite the history
      const res = await da(`/source${OPS}`);
      if (!res.ok && res.status !== 404) return false;
      const sheet = res.ok ? await res.json() : { data: [] };
      const etag = res.headers.get('ETag');
      if (!Array.isArray(sheet?.data) || (res.ok && !etag)) return false;
      const data = [entry, ...sheet.data].slice(0, OPS_MAX);
      const form = new FormData();
      form.append('data', new Blob([JSON.stringify({
        total: data.length, limit: data.length, offset: 0, data, ':type': 'sheet',
      })], { type: 'application/json' }));
      const put = await da(`/source${OPS}`, {
        method: 'POST',
        body: form,
        headers: res.ok ? { 'If-Match': etag } : { 'If-None-Match': '*' },
      });
      if (put.ok) return true;
      if (put.status !== 412) return false;
      await sleep(300 + Math.random() * 700);
    }
  } catch {
    // fall through: the operation itself is done, only its log row is missing
  }
  return false;
}

/* ---------- preview and publish ---------- */

function helix(path, init = {}) {
  return fetch(`${HELIX}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-content-source-authorization': `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

/** Starts a bulk job and waits for it; update(text) shows its progress. Returns the stopped job. */
async function bulk(kind, body, update, label) {
  const res = await helix(`/${kind}/${ORG}/${SITE}/main/*`, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${label} didn't start (${res.status}${res.headers.get('x-error') ? `: ${res.headers.get('x-error')}` : ''})`);
  const { links } = await res.json();
  for (let i = 0; i < 900; i += 1) {
    await sleep(2000);
    const jr = await helix(links.self.replace(HELIX, ''));
    const job = jr.ok ? await jr.json() : null;
    const p = job?.progress;
    if (p) update(`${label}: ${p.processed} of ${p.total}`);
    if (job?.state === 'stopped') {
      if (!p?.failed) return [];
      // the paths that failed, from the job's per-page results
      const dr = await helix(`${links.self.replace(HELIX, '')}/details`);
      const details = dr.ok ? await dr.json() : null;
      const failed = (details?.data?.resources || []).filter((r) => r.status >= 400)
        .map((r) => ({ path: r.path, status: r.status }));
      return failed.length ? failed : body.paths.map((path) => ({ path, status: 0 }));
    }
  }
  throw new Error(`${label} is still running. Check again in a few minutes.`);
}

/**
 * Runs a bulk job over `paths` and retries the pages that failed once (failures are usually a page
 * timing out). Returns { retried, failed }: the first failures with their status, the paths that still failed.
 */
async function bulkPaths(kind, paths, update, label, extra = {}) {
  const run = async (list, text) => {
    const failed = [];
    for (let i = 0; i < list.length; i += BULK_MAX) {
      failed.push(...await bulk(kind, { paths: list.slice(i, i + BULK_MAX), ...extra }, update, text));
    }
    return failed;
  };
  const retried = await run(paths, label);
  if (!retried.length) return { retried, failed: [] };
  update(`${label}: retrying ${retried.length} pages`);
  await sleep(5000);
  const failed = (await run(retried.map((f) => f.path), `${label} (retry)`)).map((f) => f.path);
  return { retried, failed };
}

/** For the log: what was retried (with the first error status) and what still failed. */
function retryComment(what, { retried, failed }) {
  if (!retried.length) return '';
  const list = retried.map((f) => `${f.path}${f.status ? ` (${f.status})` : ''}`).join(', ');
  const outcome = failed.length ? `Still failing after the retry: ${failed.join(', ')}.` : 'All worked on the retry.';
  return `${what} failed at first and was retried for ${list}. ${outcome}`;
}

/** Web path of a DA file: /en/index.html → /en/, /en/press.html → /en/press, sheets keep .json. */
function webPath(file) {
  const path = rel(file.path, ROOT).replace(/\.html$/, '');
  return path.endsWith('/index') ? path.slice(0, -'index'.length) : path;
}

/* ---------- backup ---------- */

async function backup(step, notes) {
  let s = step('Reading the demo');
  const items = await topItems(ROOT);
  if (!items.length) throw new Error('The demo is empty, so there\'s nothing to back up.');
  s(`Found ${items.length} folders and files`, 'done');

  s = step('Removing the previous backup');
  for (const item of await topItems(BACKUP)) {
    s(`Removing the previous backup: ${rel(item.path, BACKUP)}`);
    await daDelete(item.path);
  }
  s('Removed the previous backup', 'done');
  notes.push('Removed the previous backup.');

  s = step('Copying');
  for (const item of items) {
    s(`Copying ${rel(item.path, ROOT)}`);
    await daCopy(item.path, `${BACKUP}${rel(item.path, ROOT)}`);
  }
  s('Copied the demo', 'done');

  s = step('Checking the backup');
  const copied = [...await daWalk(BACKUP, false), ...await daWalk(`${BACKUP}/.da`, false)]
    .filter((f) => f.path !== OPS);
  const info = { created: new Date().toISOString(), by: email, files: String(copied.length) };
  await writeBackupInfo(info);
  s(`Backup ready: ${copied.length} files`, 'done');
  showBackupInfo(info);
  return { comments: `Backed up ${copied.length} files.` };
}

/* ---------- reset ---------- */

async function reset(step, notes) {
  let s = step('Checking the backup');
  const info = await readBackupInfo();
  if (!info) throw new Error('no_backup');
  const items = (await topItems(BACKUP)).filter((i) => i.path !== INFO);
  if (!items.length) throw new Error('no_backup');
  s(`Backup from ${new Date(info.created).toLocaleString()}`, 'done');

  // Copy the backup over the demo instead of deleting it first: a page that's overwritten keeps its
  // document ID, so its comments (stored by ID in .da) stay attached. Then remove what the backup doesn't have.
  s = step('Comparing the demo with the backup');
  const current = await allFiles(ROOT);
  const saved = new Set((await allFiles(BACKUP)).map((f) => rel(f.path, BACKUP)));
  // backups made before .da was included have none: leave the demo's .da alone then
  const hasDa = [...saved].some((path) => path.startsWith('/.da/'));
  const extra = current.filter((f) => !saved.has(rel(f.path, ROOT))
    && (hasDa || !rel(f.path, ROOT).startsWith('/.da/')));
  // pages added since the backup are taken offline later (pages that were live without a DA page
  // before the backup, e.g. fragments used by Target offers, are left alone)
  const before = current.filter((f) => PUBLISHABLE.has(f.ext) && !isHidden(f.path, ROOT)).map(webPath);
  s(`${extra.length} files added since the backup`, 'done');

  s = step('Restoring');
  for (const item of items) {
    s(`Restoring ${rel(item.path, BACKUP)}`);
    await daCopy(item.path, `${ROOT}${rel(item.path, BACKUP)}`);
  }
  s('Restored the backup', 'done');
  notes.push(`Restored the backup from ${info.created}.`);

  s = step('Removing files added since the backup');
  for (const file of extra) {
    s(`Removing ${rel(file.path, ROOT)}`);
    await daDelete(file.path);
  }
  s(extra.length ? `Removed ${extra.length} files` : 'Nothing to remove', 'done');
  if (extra.length) notes.push(`Removed ${extra.length} files added since the backup: ${extra.map((f) => rel(f.path, ROOT)).join(', ')}.`);

  s = step('Listing pages');
  const pages = (await daWalk(ROOT)).filter((f) => PUBLISHABLE.has(f.ext)).map(webPath);
  s(`${pages.length} pages and sheets`, 'done');

  // keep going when some pages fail, so the rest of the demo is still published; report them at the end
  s = step('Previewing');
  const preview = await bulkPaths('preview', pages, s, 'Previewing');
  s(`Previewed ${pages.length - preview.failed.length} of ${pages.length}`, preview.failed.length ? 'fail' : 'done');
  notes.push(`Previewed ${pages.length - preview.failed.length} of ${pages.length} pages and sheets.`, retryComment('Preview', preview));

  s = step('Publishing');
  const publish = await bulkPaths('live', pages, s, 'Publishing');
  s(`Published ${pages.length - publish.failed.length} of ${pages.length}`, publish.failed.length ? 'fail' : 'done');
  notes.push(`Published ${pages.length - publish.failed.length} of ${pages.length} pages and sheets.`, retryComment('Publish', publish));
  const problems = [...new Set([...preview.failed, ...publish.failed])];

  s = step('Unpublishing pages added since the backup');
  const restored = new Set(pages);
  const stale = before.filter((p) => !restored.has(p));
  let removalFailed = [];
  if (stale.length) {
    notes.push(`Pages added since the backup: ${stale.join(', ')}.`);
    const unpublished = await bulkPaths('live', stale, s, 'Unpublishing added pages', { delete: true });
    notes.push(retryComment('Unpublishing', unpublished));
    const unpreviewed = await bulkPaths('preview', stale, s, 'Unpreviewing added pages', { delete: true });
    notes.push(retryComment('Unpreviewing', unpreviewed));
    removalFailed = [...new Set([...unpublished.failed, ...unpreviewed.failed])];
  }
  if (removalFailed.length) s(`Couldn't unpublish ${removalFailed.length} of ${stale.length} added pages`, 'fail');
  else s(stale.length ? `Unpublished ${stale.length} added pages` : 'No added pages', 'done');
  const advice = [];
  if (problems.length) advice.push(`These pages didn't preview or publish, even on retry: ${problems.join(', ')}. Publish them from Experience Workspace, or reset again.`);
  // their DA pages are gone, so another reset won't find them: name them
  if (removalFailed.length) advice.push(`These added pages may still be online: ${removalFailed.join(', ')}. Unpublish them with Sidekick.`);
  const end = advice.length ? `Reset finished with problems. ${advice.join(' ')}` : 'The demo matches the backup';
  step(end)(end, problems.length || removalFailed.length ? 'fail' : 'done');
  return { result: problems.length || removalFailed.length ? 'problems' : 'ok' };
}

/* ---------- CloneIt demos ---------- */

async function worker(path, body = {}) {
  const res = await fetch(`${WORKER}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

async function waitWorkerJob(site, job, update, label) {
  for (let i = 0; i < 900; i += 1) {
    await sleep(2000);
    const st = await worker('admin/job', { site, topic: job.topic, name: job.name });
    if (st.progress) update(`${label}: ${st.progress.processed} of ${st.progress.total}`);
    if (st.state === 'stopped') {
      // stop before anything is deleted for good if pages are still out there
      if (st.progress?.failed) throw new Error(`${label}: ${st.progress.failed} pages failed. Try the delete again.`);
      return st;
    }
  }
  throw new Error(`${label} is still running. Try the delete again later.`);
}

async function deleteClone(site, step, notes) {
  const call = (name, extra = {}) => worker('admin/delete', { site, step: name, ...extra });

  let s = step('Finding its pages');
  const scan = await call('scan');
  if (scan.job) await waitWorkerJob(site, scan.job, s, 'Finding its pages');
  s('Found its pages', 'done');

  for (const [name, label] of [['unpublish', 'Unpublishing'], ['unpreview', 'Unpreviewing']]) {
    s = step(label);
    const r = scan.job ? await call(name, { job: scan.job.name }) : { count: 0, jobs: [] };
    for (const job of r.jobs || []) {
      await waitWorkerJob(site, job, s, label);
    }
    s(`${label}: ${r.count || 0} pages`, 'done');
    notes.push(`${label}: ${r.count || 0} pages.`);
  }

  s = step('Removing its permissions');
  const perms = await call('permissions');
  s(perms.removed?.length ? `Removed permissions for ${perms.removed.join(', ')}` : 'No permissions to remove', 'done');
  notes.push(perms.removed?.length ? `Removed permissions for ${perms.removed.join(', ')}.` : 'No permissions to remove.');

  s = step('Deleting its content');
  let more = true;
  for (let i = 0; i < 20 && more; i += 1) {
    ({ more } = await call('content'));
  }
  if (more) throw new Error(`/${ORG}/${site} still has content. Try the delete again.`);
  s(`Deleted /${ORG}/${site}`, 'done');
  notes.push('Deleted its content.');

  s = step('Deleting the site');
  await call('site');
  s('Deleted the site', 'done');
  notes.push('Deleted the site.');

  s = step('Deleting the GitHub repo');
  await call('repo');
  s(`Deleted ${ORG}/${site}`, 'done');
  notes.push('Deleted the GitHub repo.');
  step(`${site} is deleted`)(`${site} is deleted`, 'done');
}

function cell(content) {
  const td = document.createElement('td');
  if (typeof content === 'string') td.textContent = content;
  else td.append(content);
  return td;
}

function linkTo(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

async function loadClones() {
  const status = $('clones-status');
  const table = $('clones');
  try {
    const { clones } = await worker('admin/clones');
    const rows = clones.map((c) => {
      const tr = document.createElement('tr');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger small';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete ${c.site}`);
      del.disabled = busy;
      del.addEventListener('click', async () => {
        const yes = await confirmAction({
          title: `Delete ${c.site}?`,
          text: `This unpublishes ${c.site}, deletes its content, site and GitHub repo, and can't be undone.`,
          typed: c.site,
          action: 'Delete demo',
        });
        if (!yes) return;
        await run('clone-log', (step, notes) => deleteClone(c.site, step, notes), { action: 'delete demo', target: c.site });
        loadClones();
      });
      tr.append(
        cell(linkTo(c.liveUrl, c.site)),
        cell(c.requester || '—'),
        cell(c.created ? new Date(c.created).toLocaleDateString() : '—'),
        cell(del),
      );
      return tr;
    });
    table.tBodies[0].replaceChildren(...rows);
    table.hidden = !rows.length;
    status.textContent = rows.length ? `${rows.length} demos` : 'No CloneIt demos.';
  } catch (e) {
    status.textContent = `Couldn't load the demos: ${say(e.message)}`;
  }
}

/* ---------- start ---------- */

async function isDemoAdmin() {
  const res = await da(`/list/${ORG}`);
  const [path, actions = ''] = String(res.headers.get('x-da-actions') || '').split('=');
  return res.ok && path === '/' && actions.split(',').includes('write');
}

async function init() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    const sdk = await Promise.race([DA_SDK, new Promise((_, no) => { setTimeout(() => no(new Error('sign_in_required')), 8000); })]);
    token = sdk.token || '';
    if (!token) throw new Error('sign_in_required');
    if (!await isDemoAdmin()) throw new Error('demo_admins_only');
    ({ email } = await worker('whoami'));
    showBackupInfo(await readBackupInfo());
    setStatus('');
    $('tools').hidden = false;
    loadClones();
  } catch (e) {
    setStatus(say(e.message), true);
  }
}

$('backup').addEventListener('click', async () => {
  const yes = await confirmAction({
    title: 'Back up the demo?',
    text: 'This replaces the previous backup.',
    action: 'Back up',
  });
  if (yes) run('backup-log', backup, { action: 'backup', target: SITE });
});

$('reset').addEventListener('click', async () => {
  const info = await readBackupInfo();
  if (!info) { progress('reset-log')(say('no_backup'))(say('no_backup'), 'fail'); return; }
  const yes = await confirmAction({
    title: 'Reset the demo?',
    text: `Everything in the demo except drafts is replaced with the backup from ${new Date(info.created).toLocaleString()}, then published. Changes since then are lost.`,
    typed: SITE,
    action: 'Reset demo',
  });
  if (yes) run('reset-log', reset, { action: 'reset', target: SITE });
});

init();
