// Offline tests (no network): node workers/cloneit_token/admin.test.mjs
import { Buffer } from 'node:buffer';
import process from 'node:process';
import worker from './index.js';
import {
  assertDemoAdmin, isProtected, listClones, assertClone, withoutSiteRows, deleteCloneStep,
} from './admin.js';

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` ${extra}`}`); };
const rejects = async (name, fn, msg) => {
  try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, String(e.message).startsWith(msg), e.message); }
};
const env = { ORG: 'scdemos', TEMPLATE_REPO: 'scdemos/demo', PROTECTED_SITES: 'keepme' };
const daList = (actions, status = 200) => async () => new Response('[]', { status, headers: actions ? { 'x-da-actions': actions } : {} });

// who is an admin: DA decides from the org listing
await assertDemoAdmin('t', env, daList('/=read,write')).then(() => ok('org writer is admin', true), (e) => ok('org writer is admin', false, e.message));
await rejects('org reader is not admin', () => assertDemoAdmin('t', env, daList('/=read')), 'demo_admins_only');
await rejects('site writer is not admin', () => assertDemoAdmin('t', env, daList('/demo=read,write')), 'demo_admins_only');
await rejects('failed listing is not admin', () => assertDemoAdmin('t', env, daList('/=read,write', 401)), 'demo_admins_only');

ok('template is protected', isProtected('demo', env));
ok('listed site is protected', isProtected('keepme', env));
ok('clone is not protected', !isProtected('acme', env));

// fake GitHub + Admin API
const repo = (name, extra = {}) => ({
  name, description: `Customer demo: ${name} (requested by ${name}@adobe.com)`, created_at: `2026-11-0${extra.day || 1}T00:00:00Z`, html_url: `https://github.com/scdemos/${name}`,
});
function fakes({
  repos = { acme: ['customer-demo'] }, config = {}, calls = [], deleteStatuses = [204], ghDelete = 204, details,
} = {}) {
  const gh = async (path, init = {}) => {
    calls.push(['gh', init.method || 'GET', path]);
    if (path.startsWith('/search/')) return { ok: true, status: 200, json: { items: [repo('acme', { day: 1 }), repo('demo'), repo('keepme'), repo('newer', { day: 5 })] } };
    const m = /^\/repos\/scdemos\/([^/]+)(\/topics)?$/.exec(path);
    if (!m || !repos[m[1]]) return { ok: false, status: 404, json: null };
    if (init.method === 'DELETE') return { ok: ghDelete === 204, status: ghDelete, json: ghDelete === 403 ? { message: 'Must have admin rights' } : null };
    return { ok: true, status: 200, json: m[2] ? { names: repos[m[1]] } : repo(m[1]) };
  };
  const statuses = [...deleteStatuses];
  const adminFetch = async (kind, path, init = {}) => {
    calls.push([kind, init.method || 'GET', path, init.body, init.headers]);
    if (path.startsWith('/config/scdemos/sites/')) {
      const site = path.split('/').pop().replace('.json', '');
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (!(site in config)) return new Response('', { status: 404 });
      return Response.json(config[site]);
    }
    if (path.endsWith('/details')) return Response.json(details);
    if (/^\/(status|live|preview)\//.test(path)) return Response.json({ job: { topic: path.split('/')[1], name: 'job-1' } });
    if (path.startsWith('/source/') && init.method === 'DELETE') return new Response(null, { status: statuses.shift() ?? 204 });
    return new Response('', { status: 404 });
  };
  return { gh, adminFetch, calls };
}
const goodConfig = (site) => ({ code: { owner: 'scdemos', repo: site }, content: { source: { url: `https://content.da.live/scdemos/${site}/` } } });

// list: protected sites left out, requester parsed, newest first
{ const { gh } = fakes();
  const clones = await listClones(env, gh);
  ok('list skips template and protected', clones.map((c) => c.site).join() === 'newer,acme', JSON.stringify(clones));
  ok('list has requester', clones[1].requester === 'acme@adobe.com'); }

// which sites may be deleted
{ const f = fakes({ config: { acme: goodConfig('acme') } });
  ok('clone passes', (await assertClone('acme', 'scan', env, f)).config !== null); }
await rejects('template refused', () => assertClone('demo', 'scan', env, fakes({ repos: { demo: ['customer-demo'] } })), 'site_is_protected');
await rejects('bad name refused', () => assertClone('../demo', 'scan', env, fakes()), 'invalid_site_name');
await rejects('untagged repo refused', () => assertClone('acme', 'scan', env, fakes({ repos: { acme: [] } })), 'not_a_cloneit_demo');
await rejects('no repo refused (repoless clone)', () => assertClone('other', 'scan', env, fakes()), 'not_a_cloneit_demo');
await rejects('site showing the template folder refused', () => assertClone('acme', 'scan', env, fakes({
  config: { acme: { code: { owner: 'scdemos', repo: 'acme' }, content: { source: { url: 'https://content.da.live/scdemos/demo/' } } } },
})), 'content_source_not_the_demo_folder');
await rejects('site on other code refused', () => assertClone('acme', 'scan', env, fakes({
  config: { acme: { code: { owner: 'scdemos', repo: 'demo' }, content: { source: { url: 'https://content.da.live/scdemos/acme' } } } },
})), 'code_not_the_demo_repo');
ok('repo step runs once the repo is gone', (await assertClone('gone', 'repo', env, fakes())).repoGone === true);

// permissions: only the site's own rows go
{ const org = {
    data: { data: [] },
    permissions: {
      total: 6,
      limit: 6,
      data: [
        { path: 'CONFIG', groups: 'g, acme@adobe.com', actions: 'write' },
        { path: '/demo/+**', groups: 'g, acme@adobe.com', actions: 'write' },
        { path: '/acme/CONFIG', groups: 'acme@adobe.com', actions: 'write' },
        { path: '/acme/**', groups: 'acme@adobe.com', actions: 'write' },
        { path: '/acme-two/**', groups: 'x@adobe.com', actions: 'write' },
        { path: '/acme', groups: 'x@adobe.com', actions: 'read' },
      ],
    },
  };
  const { config, removed } = withoutSiteRows(org, 'acme');
  ok('site rows removed', removed.length === 2 && config.permissions.data.length === 4 && config.permissions.total === 4);
  ok('shared and other sites kept', config.permissions.data.map((r) => r.path).join() === 'CONFIG,/demo/+**,/acme-two/**,/acme');
  ok('other sheets kept', config.data === org.data);
  ok('nothing to remove → no write', withoutSiteRows(config, 'acme').config === null); }

// steps
{ const f = fakes({ config: { acme: goodConfig('acme') } });
  const r = await deleteCloneStep({ site: 'acme', step: 'scan' }, env, f);
  const call = f.calls.find((c) => c[2] === '/status/scdemos/acme/main/*');
  ok('scan starts a status job', r.job.name === 'job-1' && JSON.parse(call[3]).select.join() === 'preview,live' && call[4]['Content-Type'] === 'application/json'); }
{ const details = {
    state: 'stopped',
    data: {
      resources: [
        { path: '/a', publishLastModified: 'x', previewLastModified: 'x' },
        { path: '/b', previewLastModified: 'x' },
        { path: '/old', previewLastModified: 'x', publishLastModified: 'x', publishConfigRedirectLocation: 'https://x', previewConfigRedirectLocation: 'https://x' },
      ],
    },
  };
  const f = fakes({ config: { acme: goodConfig('acme') }, details });
  const live = await deleteCloneStep({ site: 'acme', step: 'unpublish', job: 'job-1' }, env, f);
  const liveBody = JSON.parse(f.calls.find((c) => c[2] === '/live/scdemos/acme/main/*')[3]);
  ok('unpublish removes live pages, not redirects', live.count === 1 && liveBody.delete === true && liveBody.paths.join() === '/a', JSON.stringify(liveBody));
  const prev = await deleteCloneStep({ site: 'acme', step: 'unpreview', job: 'job-1' }, env, f);
  ok('unpreview removes previewed pages', prev.count === 2);
  await rejects('unpublish needs the scan job', () => deleteCloneStep({ site: 'acme', step: 'unpublish', job: '../x' }, env, f), 'scan_job_required');
  const running = fakes({ config: { acme: goodConfig('acme') }, details: { ...details, state: 'running' } });
  await rejects('unpublish waits for the scan', () => deleteCloneStep({ site: 'acme', step: 'unpublish', job: 'job-1' }, env, running), 'scan_not_finished'); }
{ const f = fakes();
  ok('no site config → nothing to scan', (await deleteCloneStep({ site: 'acme', step: 'scan' }, env, f)).skipped === 'site_config_gone'); }
{ const f = fakes({ config: { acme: goodConfig('acme') }, deleteStatuses: [206, 206, 204] });
  const r = await deleteCloneStep({ site: 'acme', step: 'content' }, env, f);
  ok('content delete repeats until done', r.deleted && f.calls.filter((c) => c[1] === 'DELETE' && c[2] === '/source/scdemos/acme').length === 3); }
{ const f = fakes({ config: { acme: goodConfig('acme') } });
  await deleteCloneStep({ site: 'acme', step: 'site' }, env, f);
  ok('site config deleted', f.calls.some((c) => c[1] === 'DELETE' && c[2] === '/config/scdemos/sites/acme.json')); }
await rejects('repo delete explains GitHub refusal', () => deleteCloneStep({ site: 'acme', step: 'repo' }, env, fakes({ ghDelete: 403 })), 'github_repo_delete_forbidden: Must have admin rights');
{ const f = fakes();
  await deleteCloneStep({ site: 'acme', step: 'repo' }, env, f);
  ok('repo deleted', f.calls.some((c) => c[1] === 'DELETE' && c[2] === '/repos/scdemos/acme')); }
await rejects('unknown step refused', () => deleteCloneStep({ site: 'acme', step: 'everything' }, env, fakes()), 'invalid_step');

// permissions step: writes the sheet without the site's rows, and never writes over a change made meanwhile
{ const rows = (extra = []) => ({ permissions: { data: [{ path: '/acme/**', groups: 'a', actions: 'write' }, { path: 'CONFIG', groups: 'g', actions: 'write' }, ...extra] } });
  const configFetch = (reads) => {
    const f = fakes({ config: { acme: goodConfig('acme') } });
    let stored = null;
    const base = f.adminFetch;
    f.adminFetch = async (kind, path, init = {}) => {
      if (path !== '/config/scdemos/') return base(kind, path, init);
      if (init.method === 'POST') { stored = JSON.parse(init.body.get('config')); f.writes = (f.writes || 0) + 1; return new Response('', { status: 200 }); }
      const next = reads.length ? reads.shift() : stored;
      return new Response(JSON.stringify(next));
    };
    f.stored = () => stored;
    return f;
  };
  const nowait = async () => {};
  const simple = configFetch([rows(), rows()]);
  const r = await deleteCloneStep({ site: 'acme', step: 'permissions' }, env, simple, nowait);
  ok('permissions step removes the site rows', r.removed.join() === '/acme/**' && simple.writes === 1
    && simple.stored().permissions.data.map((x) => x.path).join() === 'CONFIG');
  // CloneIt grants /newclone/** between our two reads: we must not write the older snapshot
  const grant = { path: '/newclone/**', groups: 'n', actions: 'write' };
  const racing = configFetch([rows(), rows([grant]), rows([grant]), rows([grant])]);
  await deleteCloneStep({ site: 'acme', step: 'permissions' }, env, racing, nowait);
  ok('a grant made meanwhile is kept', racing.writes === 1
    && racing.stored().permissions.data.map((x) => x.path).join() === 'CONFIG,/newclone/**', JSON.stringify(racing.stored())); }

// router: verified user, then DA must say they're an admin
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (n) => `h.${b64({ client_id: 'darkalley', n })}.s`;
const wenv = {
  ...env, ALLOWED_ORIGINS: 'https://x.test', ADOBE_CLIENT_ID: 'a', ADOBE_CLIENT_SECRET: 'b', LEGACY_COMPAT: 'false', GITHUB_PROVISION_TOKEN: 'gh',
};
const routeFetch = (actions) => async (u) => {
  const url = String(u);
  if (url.includes('validate_token')) return Response.json({ valid: true });
  if (url.includes('/ims/profile')) return Response.json({ email: 'sc@adobe.com' });
  if (url.includes('/ims/token/v3')) return Response.json({ access_token: 'tech', expires_in: 3600 });
  if (url === 'https://admin.da.live/list/scdemos') return new Response('[]', { headers: { 'x-da-actions': actions } });
  if (url.includes('/search/repositories')) return Response.json({ items: [repo('acme')] });
  return new Response('', { status: 404 });
};
const adminReq = (n, path) => new Request(`https://w.test${path}`, { method: 'POST', headers: { Origin: 'https://x.test', Authorization: `Bearer ${tok(n)}` }, body: '{}' });
const realFetch = globalThis.fetch;
globalThis.fetch = routeFetch('/=read');
ok('route refuses non-admins', (await worker.fetch(adminReq(1, '/admin/clones'), wenv)).status === 403);
globalThis.fetch = routeFetch('/=read,write');
{ const r = await worker.fetch(adminReq(2, '/admin/clones'), wenv);
  ok('route lists clones for admins', r.status === 200 && (await r.json()).clones[0].site === 'acme'); }
globalThis.fetch = realFetch;

console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
