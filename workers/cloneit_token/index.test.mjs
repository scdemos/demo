// Offline tests (no network): node workers/cloneit_token/index.test.mjs
import { Buffer } from 'node:buffer';
import process from 'node:process';
import worker, {
  verifyUser, provisionStandalone, isAllowedProxyPath, originMatches, grantDemoPermissions, addPermissionRows,
} from './index.js';
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ` ${extra}`}`); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (cid = 'darkalley', n = 1) => `h.${b64({ client_id: cid, n })}.s`;
const env = { ALLOWED_ORIGINS: 'https://x.test', ADOBE_CLIENT_ID: 'a', ADOBE_CLIENT_SECRET: 'b', ORG: 'scdemos' };
const ims = (email, valid = true) => async (u) => ({ ok: true, json: async () => (u.includes('validate') ? { valid } : { email }) });
const req = (t, path = '/whoami', origin = 'https://x.test') => new Request(`https://w.test${path}`, { method: 'POST', headers: { Origin: origin, ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: '{}' });

// verifyUser
try { await verifyUser(req(null), env, ims('a@adobe.com')); ok('no token rejected', false); } catch (e) { ok('no token rejected', e.status === 401); }
try { await verifyUser(req(tok('other')), env, ims('a@adobe.com')); ok('foreign client rejected', false); } catch (e) { ok('foreign client rejected', e.message === 'token_not_accepted'); }
try { await verifyUser(req(tok('darkalley', 2)), env, ims('a@adobe.com', false)); ok('invalid token rejected', false); } catch (e) { ok('invalid token rejected', e.message === 'token_invalid'); }
try { await verifyUser(req(tok('darkalley', 3)), env, ims('x@gmail.com')); ok('non-adobe rejected', false); } catch (e) { ok('non-adobe rejected', e.status === 403); }
ok('adobe user accepted', (await verifyUser(req(tok('darkalley', 4)), env, ims('SC@Adobe.com'))).email === 'sc@adobe.com');

// router, strict mode (LEGACY_COMPAT=false): no token → 401 even with a spoofed allowed origin
const strict = { ...env, LEGACY_COMPAT: 'false' };
ok('strict: ping requires user', (await worker.fetch(req(null, '/'), strict)).status === 401);
ok('strict: proxy requires user', (await worker.fetch(req(null, '/cloneprocess'), strict)).status === 401);
// legacy mode (default): old CloneIt page keeps working, but only with the old allowlist
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'tech', expires_in: 3600 }), { status: 200 });
const legacyPing = await worker.fetch(req(null, '/'), env);
ok('legacy: ping returns token like before', legacyPing.status === 200 && (await legacyPing.json()).access_token === 'tech');
const lp = (body) => new Request('https://w.test/cloneprocess', { method: 'POST', headers: { Origin: 'https://x.test' }, body: JSON.stringify(body) });
ok('legacy: new bulk paths denied', (await worker.fetch(lp({ kind: 'helix', path: '/preview/scdemos/acme/main/*', method: 'POST' }), env)).status === 400);
ok('legacy: new routes still need a user', (await worker.fetch(req(null, '/standalone'), env)).status === 401);
globalThis.fetch = realFetch;

// allowlist
ok('allow site config', isAllowedProxyPath('helix', '/config/scdemos/sites/acme.json', 'scdemos'));
ok('allow bulk preview', isAllowedProxyPath('helix', '/preview/scdemos/acme/main/*', 'scdemos'));
ok('legacy allowlist excludes bulk', !isAllowedProxyPath('helix', '/preview/scdemos/acme/main/*', 'scdemos', true));
ok('deny org config', !isAllowedProxyPath('helix', '/config/scdemos.json', 'scdemos'));
ok('deny other org', !isAllowedProxyPath('helix', '/preview/other/acme/main/*', 'scdemos'));
ok('deny traversal', !isAllowedProxyPath('da', '/source/scdemos/../x', 'scdemos'));
ok('allow site DA config', isAllowedProxyPath('da', '/config/scdemos/acme', 'scdemos') && isAllowedProxyPath('da', '/config/scdemos/acme/', 'scdemos'));
ok('deny org DA config (permissions sheet)', !isAllowedProxyPath('da', '/config/scdemos/', 'scdemos') && !isAllowedProxyPath('da', '/config/scdemos', 'scdemos'));
ok('deny DA config below a site', !isAllowedProxyPath('da', '/config/scdemos/acme/x', 'scdemos'));
ok('legacy also denies org DA config', !isAllowedProxyPath('da', '/config/scdemos/', 'scdemos', true));

// provisionStandalone with a fake GitHub
function fakeGh({ member = true, exists = false, readyAfter = 1, installs = [{ id: 77, app_slug: 'aem-code-sync', account: { login: 'scdemos' } }], addStatus = 204, topics = ['customer-demo'] } = {}) {
  const calls = []; let refChecks = 0;
  const gh = async (path, init = {}) => {
    const m = init.method || 'GET'; calls.push(`${m} ${path}`);
    if (path.includes('/teams/') && path.includes('/memberships/')) return { ok: member, status: member ? 200 : 404, json: { state: 'active' } };
    if (path.startsWith('/orgs/scdemos/members/')) return { ok: member, status: member ? 204 : 404, json: null };
    if (m === 'GET' && path === '/repos/scdemos/acme/topics') return { ok: true, status: 200, json: { names: topics } };
    if (m === 'GET' && path === '/repos/scdemos/acme') return exists ? { ok: true, status: 200, json: { id: 5, html_url: 'https://github.com/scdemos/acme' } } : { ok: false, status: 404, json: {} };
    if (path === '/repos/scdemos/demo/generate') return { ok: true, status: 201, json: { id: 9, html_url: 'https://github.com/scdemos/acme' } };
    if (path.endsWith('/git/ref/heads/main')) { refChecks += 1; return { ok: refChecks >= readyAfter, status: refChecks >= readyAfter ? 200 : 404 }; }
    if (path.startsWith('/user/installations?')) return { ok: true, status: 200, json: { installations: installs } };
    if (path.startsWith('/user/installations/')) return { ok: addStatus < 300, status: addStatus, json: null };
    return { ok: true, status: 204, json: null };
  };
  return { gh, calls };
}
const nowait = async () => {};
{ const { gh, calls } = fakeGh({ readyAfter: 3 });
  const r = await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'sc@adobe.com' }, { ORG: 'scdemos', GITHUB_TEAM: 'scs' }, gh, nowait);
  ok('standalone happy path', r.codeSync.added && r.codeSync.installationId === 77 && r.repo === 'acme');
  ok('adds repo 9 to install 77', calls.includes('PUT /user/installations/77/repositories/9'));
  ok('requester admin + team access', calls.some((c) => c.startsWith('PUT /orgs/scdemos/teams/scs/repos/')) && calls.some((c) => c.includes('/collaborators/sc-user'))); }
{ const { gh } = fakeGh({ member: false });
  try { await provisionStandalone({ site: 'acme', githubUser: 'x', email: 'a@adobe.com' }, { ORG: 'scdemos', GITHUB_TEAM: 'scs' }, gh, nowait); ok('non-member rejected', false); } catch (e) { ok('non-member rejected', e.status === 403); } }
{ const { gh, calls } = fakeGh({ exists: true });
  try { await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'a@adobe.com' }, { ORG: 'scdemos' }, gh, nowait); ok('existing repo → 409', false); } catch (e) { ok('existing repo → 409', e.status === 409 && !calls.some((c) => c.includes('/generate'))); } }
{ const { gh, calls } = fakeGh({ exists: true });
  const r = await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'a@adobe.com', resume: true }, { ORG: 'scdemos' }, gh, nowait);
  ok('resume skips generate', r.codeSync.added && !calls.some((c) => c.includes('/generate'))); }
{ const { gh } = fakeGh({ exists: true, topics: [] });
  try { await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'a@adobe.com', resume: true }, { ORG: 'scdemos' }, gh, nowait); ok('resume refuses non-demo repo', false); } catch (e) { ok('resume refuses non-demo repo', e.message === 'repo_exists_not_a_demo'); } }
{ const { gh } = fakeGh({ installs: [] });
  const r = await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'a@adobe.com' }, { ORG: 'scdemos' }, gh, nowait);
  ok('no install → reported, not thrown', !r.codeSync.added && r.codeSync.reason === 'code_sync_installation_not_found'); }
for (const bad of ['Acme', 'a--b', 'demo', '']) {
  try { await provisionStandalone({ site: bad, githubUser: 'sc-user', email: 'a@adobe.com' }, { ORG: 'scdemos' }, fakeGh().gh, nowait); ok(`bad name "${bad}" rejected`, false); } catch (e) { ok(`bad name "${bad}" rejected`, e.status === 400); }
}
try { await provisionStandalone({ site: 'acme', email: 'a@adobe.com' }, { ORG: 'scdemos' }, fakeGh().gh, nowait); ok('github user required', false); } catch (e) { ok('github user required', e.message === 'github_user_required'); }
{ const env = { ALLOWED_ORIGINS: 'https://main--demo--scdemos.aem.live,https://*--demo--scdemos.preview.da.live' };
  ok('origin exact', originMatches('https://main--demo--scdemos.aem.live', env));
  ok('origin branch wildcard', originMatches('https://custdemo--demo--scdemos.preview.da.live', env));
  ok('origin wildcard no dots', !originMatches('https://evil.com.x--demo--scdemos.preview.da.live', env));
  ok('origin wildcard other host', !originMatches('https://custdemo--demo--scdemos.preview.da.live.evil.com', env));
  ok('origin wildcard other repo', !originMatches('https://custdemo--other--scdemos.preview.da.live', env));
  ok('origin empty', !originMatches('', env)); }

// permissions: fake DA org config (other sheets and rows) + fake GitHub repo (ownership proof)
function fakeAdmin({ requester = 'sc@adobe.com', topics = ['customer-demo'], repoStatus = 200, loseWrites = 0, failWrite = false } = {}) {
  let org = {
    ':names': ['data', 'permissions'], ':version': 3, ':type': 'multi-sheet',
    data: { total: 1, limit: 1, offset: 0, data: [{ key: 'k', value: 'v' }], ':colWidths': [1, 2] },
    permissions: {
      total: 3,
      limit: 3,
      offset: 0,
      data: [
        { path: 'CONFIG', groups: 'ORG', actions: 'read', comments: '' },
        { path: 'CONFIG', groups: 'ORG/admins, a@adobe.com', actions: 'write', comments: 'admins' },
        { path: '/demo/+**', groups: 'ORG/admins, a@adobe.com,', actions: 'write', comments: '' },
      ],
      ':colWidths': [1, 2, 3, 4],
    },
  };
  const writes = []; let lost = loseWrites;
  const adminFetch = async (kind, path, init = {}) => {
    if ((init.method || 'GET') === 'GET') {
      return Response.json(org);
    }
    if (failWrite) return new Response('', { status: 403 });
    const next = JSON.parse(init.body.get('config')); writes.push(next);
    if (lost > 0) { lost -= 1; return new Response('', { status: 200 }); } // another clone overwrote it
    org = next; return new Response('', { status: 200 });
  };
  const gh = async (path) => {
    if (repoStatus !== 200) return { ok: false, status: repoStatus, json: {} };
    if (path.endsWith('/topics')) return { ok: true, status: 200, json: { names: topics } };
    return { ok: true, status: 200, json: { description: `Customer demo: acme (requested by ${requester})` } };
  };
  return { deps: { adminFetch, gh }, writes, org: () => org };
}
const penv = { ORG: 'scdemos', TEMPLATE_REPO: 'scdemos/demo' };
{ const a = fakeAdmin();
  const r = await grantDemoPermissions({ site: 'acme', email: 'sc@adobe.com' }, penv, a.deps, nowait);
  const rows = a.org().permissions.data;
  ok('grant adds CONFIG + ** rows at the end', rows.length === 5 && rows[3].path === '/acme/CONFIG' && rows[4].path === '/acme/**'
    && rows.slice(3).every((x) => x.groups === 'sc@adobe.com' && x.actions === 'write'), JSON.stringify(rows));
  ok('grant joins the CONFIG write row', rows[1].groups === 'ORG/admins, a@adobe.com, sc@adobe.com' && rows[1].comments === 'admins');
  ok('grant joins the template row (trailing comma kept clean)', rows[2].groups === 'ORG/admins, a@adobe.com, sc@adobe.com');
  ok('grant leaves the CONFIG read row alone', rows[0].groups === 'ORG');
  ok('grant keeps other sheets', a.org().data.data[0].key === 'k' && a.org()[':names'].length === 2);
  ok('grant updates totals', a.org().permissions.total === 5 && a.org().permissions.limit === 5);
  ok('grant reports added and joined', r.added.join() === '/acme/CONFIG,/acme/**' && r.joined.join() === 'CONFIG,/demo/+**', JSON.stringify(r));
  const again = await grantDemoPermissions({ site: 'acme', email: 'SC@adobe.com' }, penv, a.deps, nowait);
  ok('second run changes nothing', again.added.length === 0 && again.joined.length === 0 && a.writes.length === 1
    && a.org().permissions.data[1].groups.split(',').length === 3); }
ok('missing shared rows are not created', (() => {
  const { config, joined } = addPermissionRows({ permissions: { data: [] } }, [], { email: 'sc@adobe.com', paths: ['CONFIG', '/demo/+**'] });
  return config === null && joined.length === 0;
})());
{ const a = fakeAdmin({ loseWrites: 1 });
  await grantDemoPermissions({ site: 'acme', email: 'sc@adobe.com' }, penv, a.deps, nowait);
  ok('lost update is written again', a.writes.length === 2 && a.org().permissions.data.length === 5); }
{ const a = fakeAdmin({ loseWrites: 2 });
  await grantDemoPermissions({ site: 'acme', email: 'sc@adobe.com' }, penv, a.deps, nowait);
  ok('third write that sticks is confirmed', a.writes.length === 3 && a.org().permissions.data.length === 5); }
{ const a = fakeAdmin({ loseWrites: 3 });
  try { await grantDemoPermissions({ site: 'acme', email: 'sc@adobe.com' }, penv, a.deps, nowait); ok('never sticks → not confirmed', false); } catch (e) { ok('never sticks → not confirmed', e.message === 'org_config_write_not_confirmed' && a.writes.length === 3); } }
const denied = async (name, opts, site, email, msg) => {
  const a = fakeAdmin(opts);
  try { await grantDemoPermissions({ site, email }, penv, a.deps, nowait); ok(name, false); } catch (e) { ok(name, e.message === msg && a.writes.length === 0, e.message); }
};
await denied('someone else\'s demo → denied', { requester: 'other@adobe.com' }, 'acme', 'sc@adobe.com', 'not_demo_requester');
await denied('repo not made by CloneIt → denied', { topics: [] }, 'acme', 'sc@adobe.com', 'not_a_cloneit_demo');
await denied('template site → denied', {}, 'demo', 'sc@adobe.com', 'site_name_is_template');
await denied('missing repo → denied', { repoStatus: 404 }, 'acme', 'sc@adobe.com', 'site_not_found');
await denied('bad site name → denied', {}, '../demo', 'sc@adobe.com', 'invalid_site_name');
await denied('email suffix trick → denied', { requester: 'xsc@adobe.com' }, 'acme', 'sc@adobe.com', 'not_demo_requester');
{ const a = fakeAdmin({ failWrite: true });
  try { await grantDemoPermissions({ site: 'acme', email: 'sc@adobe.com' }, penv, a.deps, nowait); ok('write failure surfaces', false); } catch (e) { ok('write failure surfaces', e.message === 'org_config_write_failed_403'); } }
try { addPermissionRows({ data: {} }, []); ok('no permissions sheet → error', false); } catch (e) { ok('no permissions sheet → error', e.message === 'org_config_has_no_permissions_sheet'); }
ok('existing row with several emails counts', addPermissionRows({ permissions: { data: [{ path: '/acme/**', groups: 'x@adobe.com, sc@adobe.com', actions: 'write' }] } },
  [{ path: '/acme/**', groups: 'sc@adobe.com', actions: 'write' }]).config === null);

// router: /permissions needs a user, and uses the token's email even if the body names someone else
ok('permissions requires user', (await worker.fetch(req(null, '/permissions'), strict)).status === 401);
const routeFetch = (requester) => async (u, init = {}) => {
  const url = String(u);
  if (url.includes('/ims/token/v3')) return Response.json({ access_token: 'tech', expires_in: 3600 });
  if (url.includes('validate_token')) return Response.json({ valid: true });
  if (url.includes('/ims/profile')) return Response.json({ email: 'sc@adobe.com' });
  if (url.endsWith('/repos/scdemos/acme/topics')) return Response.json({ names: ['customer-demo'] });
  if (url.endsWith('/repos/scdemos/acme')) return Response.json({ description: `Customer demo: acme (requested by ${requester})` });
  if (url.endsWith('/config/scdemos/') && init.method === 'POST') { globalThis.lastOrg = JSON.parse(init.body.get('config')); return new Response('', { status: 200 }); }
  if (url.endsWith('/config/scdemos/')) return Response.json(globalThis.lastOrg || { permissions: { data: [] } });
  // a forged AEM site config naming the caller as admin must not matter
  if (url.includes('/config/scdemos/sites/acme.json')) return Response.json({ code: { owner: 'scdemos', repo: 'acme' }, access: { admin: { role: { admin: ['sc@adobe.com'] } } } });
  return new Response('', { status: 404 });
};
const permReq = (n, body) => new Request('https://w.test/permissions', { method: 'POST', headers: { Origin: 'https://x.test', Authorization: `Bearer ${tok('darkalley', n)}` }, body: JSON.stringify(body) });
const genv = { ...strict, GITHUB_PROVISION_TOKEN: 'gh' };
// the 500 ms wait after a write is real here: skip it by stubbing setTimeout
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realTimeout(fn, 0);
{ globalThis.fetch = routeFetch('sc@adobe.com'); globalThis.lastOrg = null;
  const r = await worker.fetch(permReq(9, { site: 'acme', email: 'attacker@adobe.com' }), genv);
  const j = await r.json();
  ok('route grants the token user', r.status === 200 && j.email === 'sc@adobe.com' && globalThis.lastOrg.permissions.data.every((x) => x.groups === 'sc@adobe.com'), JSON.stringify(j)); }
{ globalThis.fetch = routeFetch('owner@adobe.com'); globalThis.lastOrg = null;
  const r = await worker.fetch(permReq(10, { site: 'acme' }), genv);
  ok('forged site config does not grant someone else\'s demo', r.status === 403 && globalThis.lastOrg === null); }
{ globalThis.fetch = routeFetch('sc@adobe.com');
  ok('route needs the GitHub token', (await worker.fetch(permReq(11, { site: 'acme' }), strict)).status === 501); }
globalThis.setTimeout = realTimeout;
globalThis.fetch = realFetch;
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
