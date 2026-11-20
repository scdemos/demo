// Offline tests (no network): node workers/cloneit_token/index.test.mjs
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import worker, {
  verifyUser, provisionStandalone, isAllowedProxyPath, isAllowedCopyDestination, originMatches,
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
// fetch() turns these into `..` / `/` after the check, so they must be rejected as written
ok('deny encoded traversal', !isAllowedProxyPath('helix', '/config/scdemos/sites/%2e%2e/%2e%2e/%2e%2e/config/other/sites/x.json', 'scdemos'));
ok('deny encoded traversal (upper case)', !isAllowedProxyPath('da', '/source/scdemos/%2E%2E/other/x.html', 'scdemos'));
ok('deny backslash traversal', !isAllowedProxyPath('da', '/source/scdemos/a\\..\\..\\other/x.html', 'scdemos'));
ok('allow nested content path', isAllowedProxyPath('da', '/copy/scdemos/demo/products/books.html', 'scdemos'));
ok('allow hidden asset path', isAllowedProxyPath('da', '/copy/scdemos/demo/.index/media_1.png', 'scdemos'));
ok('allow job details', isAllowedProxyPath('helix', '/job/scdemos/acme/main/preview/job-123/details', 'scdemos'));

// copy destination (DA writes there)
ok('copy dest inside org', isAllowedCopyDestination('/scdemos/acme/products/books.html', 'scdemos'));
ok('copy dest other org', !isAllowedCopyDestination('/other/acme/index.html', 'scdemos'));
ok('copy dest org prefix only', !isAllowedCopyDestination('/scdemos-evil/acme/index.html', 'scdemos'));
ok('copy dest traversal', !isAllowedCopyDestination('/scdemos/acme/../../other/x.html', 'scdemos'));
ok('copy dest encoded traversal', !isAllowedCopyDestination('/scdemos/%2e%2e/other/x.html', 'scdemos'));
ok('copy dest missing', !isAllowedCopyDestination(undefined, 'scdemos'));

// router, strict mode with a signed-in user: the proxy checks path and copy destination before any upstream call
{
  const upstream = [];
  globalThis.fetch = async (u) => {
    const url = String(u);
    if (url.includes('/ims/validate_token/')) return new Response(JSON.stringify({ valid: true }));
    if (url.includes('/ims/profile/')) return new Response(JSON.stringify({ email: 'sc@adobe.com' }));
    if (url.includes('/ims/token/')) return new Response(JSON.stringify({ access_token: 'tech', expires_in: 3600 }));
    upstream.push(url);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const user = tok('darkalley', 9);
  const proxy = (body) => worker.fetch(new Request('https://w.test/cloneprocess', {
    method: 'POST', headers: { Origin: 'https://x.test', Authorization: `Bearer ${user}` }, body: JSON.stringify(body),
  }), strict);
  ok('strict: whoami with user', (await worker.fetch(req(user), strict)).status === 200);
  const copy = (destination) => ({ kind: 'da', path: '/copy/scdemos/demo/index.html', method: 'POST', form: { destination } });
  ok('strict: copy into new site', (await proxy(copy('/scdemos/acme/index.html'))).status === 200
    && upstream.at(-1) === 'https://admin.da.live/copy/scdemos/demo/index.html');
  const before = upstream.length;
  ok('strict: copy to other org denied', (await proxy(copy('/other/acme/index.html'))).status === 400);
  ok('strict: copy without destination denied', (await proxy({ kind: 'da', path: '/copy/scdemos/demo/index.html', method: 'POST' })).status === 400);
  ok('strict: encoded traversal denied', (await proxy({ kind: 'helix', path: '/config/scdemos/sites/%2e%2e/%2e%2e/%2e%2e/config/other/sites/x.json' })).status === 400);
  ok('strict: denied calls never reach upstream', upstream.length === before);
  ok('strict: site config read allowed', (await proxy({ kind: 'helix', path: '/config/scdemos/sites/demo.json' })).status === 200);
  globalThis.fetch = realFetch;
}

// the deployed config must keep the token-less legacy lane closed
ok('wrangler.toml: LEGACY_COMPAT is "false"', /^LEGACY_COMPAT\s*=\s*"false"/m.test(readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8')));

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
  const r = await provisionStandalone({ site: 'acme', githubUser: 'sc-user', email: 'sc@adobe.com' }, { ORG: 'scdemos', SC_TEAM: 'scs' }, gh, nowait);
  ok('standalone happy path', r.codeSync.added && r.codeSync.installationId === 77 && r.repo === 'acme');
  ok('adds repo 9 to install 77', calls.includes('PUT /user/installations/77/repositories/9'));
  ok('requester admin + team access', calls.some((c) => c.startsWith('PUT /orgs/scdemos/teams/scs/repos/')) && calls.some((c) => c.includes('/collaborators/sc-user'))); }
{ const { gh } = fakeGh({ member: false });
  try { await provisionStandalone({ site: 'acme', githubUser: 'x', email: 'a@adobe.com' }, { ORG: 'scdemos', SC_TEAM: 'scs' }, gh, nowait); ok('non-member rejected', false); } catch (e) { ok('non-member rejected', e.status === 403); } }
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
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
