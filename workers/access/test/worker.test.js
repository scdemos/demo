import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import worker, {
  originAllowed, grantAccess, isAutomatic,
} from '../index.js';

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let n = 0;
const token = (cid = 'darkalley') => { n += 1; return `h.${b64({ client_id: cid, n })}.s`; };

const env = {
  PATH_PREFIX: 'access',
  ALLOWED_ORIGINS: 'https://main--demo--scdemos.aem.live,https://*--demo--scdemos.aem.page',
  IMS_CLIENT_IDS: 'darkalley',
  AUTO_DOMAINS: 'adobe.com',
  GITHUB_ORG: 'scdemos',
  GITHUB_TEAM: 'sc-team',
  ADMIN_ORG_ID: 'ORG@AdobeOrg',
  ADMIN_GROUP: 'da-demosite-authors',
  REQUESTS_SHEET: '/scdemos/demo/.da/aem-permission-requests.json',
  UMAPI_CLIENT_ID: 'cid',
  UMAPI_CLIENT_SECRET: 'secret',
  GITHUB_TEAM_TOKEN: 'gh',
};

/** Fake IMS, GitHub, User Management API and DA, recording every call. */
function fakeServices({
  email = 'sc@adobe.com', ghUser = true, loseWrites = 0, teamStatus = 200, umapi = { completed: 1, notCompleted: 0, errors: [] },
} = {}) {
  const calls = [];
  let lost = loseWrites;
  let sheet = {
    ':names': ['users', 'data'], ':type': 'multi-sheet', ':version': 3,
    users: { total: 2, limit: 2, offset: 0, data: [{ Email: 'old@partner.com', 'First Name': 'Old' }, { Email: '', 'First Name': '' }] },
    data: { total: 1, limit: 1, offset: 0, data: [{}] },
  };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    calls.push({ method, url: u, body: init.body });
    if (u.includes('/ims/validate_token')) return Response.json({ valid: true });
    if (u.includes('/ims/profile')) return Response.json({ email, first_name: 'Sam', last_name: 'Chen' });
    if (u.includes('/ims/token/v3')) return Response.json({ access_token: 'tech', expires_in: 3600 });
    if (u.startsWith('https://api.github.com/users/')) return ghUser ? Response.json({ login: 'Sam-C' }) : new Response('{}', { status: 404 });
    if (u.includes('/teams/sc-team/memberships/')) return new Response(JSON.stringify(teamStatus === 200 ? { state: 'pending' } : { message: 'Resource not accessible by personal access token' }), { status: teamStatus });
    if (u.includes('usermanagement.adobe.io')) return Response.json(umapi);
    if (u.includes('admin.da.live/source/') && method === 'GET') return Response.json(sheet);
    if (u.includes('admin.da.live/source/') && method === 'PUT') { if (lost > 0) { lost -= 1; return new Response('', { status: 200 }); } sheet = JSON.parse(await init.body.get('data').text()); return new Response('', { status: 200 }); }
    return new Response('', { status: 404 });
  };
  return { fetchImpl, calls, sheet: () => sheet };
}

const req = (path, { auth = token(), body = {}, origin = 'https://main--demo--scdemos.aem.live' } = {}) => new Request(`https://demo.bbird.live${path}`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  body: JSON.stringify(body),
});

const nowait = async () => {};

describe('origins', () => {
  it('allows exact and one-label branch origins only', () => {
    expect(originAllowed('https://main--demo--scdemos.aem.live', env)).toBe(true);
    expect(originAllowed('https://feat-x--demo--scdemos.aem.page', env)).toBe(true);
    expect(originAllowed('https://a.b--demo--scdemos.aem.page', env)).toBe(false);
    expect(originAllowed('https://evil.example', env)).toBe(false);
  });
});

describe('router', () => {
  let svc;
  beforeEach(() => { svc = fakeServices(); vi.stubGlobal('fetch', svc.fetchImpl); });
  afterEach(() => vi.unstubAllGlobals());

  it('needs a signed-in user', async () => {
    expect((await worker.fetch(req('/access/whoami', { auth: null }), env)).status).toBe(401);
  });
  it('rejects tokens from other IMS clients', async () => {
    expect((await worker.fetch(req('/access/whoami', { auth: token('other') }), env)).status).toBe(401);
  });
  it('rejects other origins', async () => {
    expect((await worker.fetch(req('/access/whoami', { origin: 'https://evil.example' }), env)).status).toBe(403);
  });
  it('whoami returns the token user', async () => {
    const r = await worker.fetch(req('/access/whoami'), env);
    expect(await r.json()).toEqual({ email: 'sc@adobe.com', name: 'Sam Chen', automatic: true });
  });
  it('uses the token email, not one in the body', async () => {
    const r = await worker.fetch(req('/access/request', { body: { githubUser: 'sam-c', email: 'attacker@adobe.com' } }), env);
    const j = await r.json();
    expect(j.email).toBe('sc@adobe.com');
    const um = svc.calls.find((c) => c.url.includes('usermanagement'));
    expect(JSON.parse(um.body)[0].user).toBe('sc@adobe.com');
  });
  it('says when secrets are missing', async () => {
    const r = await worker.fetch(req('/access/request', { body: { githubUser: 'sam-c' } }), { ...env, GITHUB_TEAM_TOKEN: '' });
    expect(r.status).toBe(501);
  });
});

describe('grantAccess', () => {
  const user = { email: 'sc@adobe.com', firstName: 'Sam', lastName: 'Chen' };

  it('adobe.com: adds to the team and the Admin Console group', async () => {
    const svc = fakeServices();
    const r = await grantAccess(user, 'sam-c', env, svc.fetchImpl);
    expect(r.automatic).toBe(true);
    expect(r.steps).toEqual([
      { step: 'github', ok: true, login: 'Sam-C', state: 'pending' },
      { step: 'adminConsole', ok: true, group: 'da-demosite-authors' },
    ]);
    const team = svc.calls.find((c) => c.url.includes('/memberships/'));
    expect(team.method).toBe('PUT');
    expect(team.url).toBe('https://api.github.com/orgs/scdemos/teams/sc-team/memberships/Sam-C');
    const [cmd] = JSON.parse(svc.calls.find((c) => c.url.includes('usermanagement')).body);
    expect(cmd.do[0].createFederatedID).toMatchObject({ email: 'sc@adobe.com', firstname: 'Sam', lastname: 'Chen', option: 'ignoreIfAlreadyExists' });
    expect(cmd.do[1]).toEqual({ add: { group: ['da-demosite-authors'] } });
    expect(svc.calls.some((c) => c.url.includes('admin.da.live'))).toBe(false);
  });

  it('passes on why GitHub refused', async () => {
    const svc = fakeServices({ teamStatus: 403 });
    const r = await grantAccess(user, 'sam-c', env, svc.fetchImpl);
    expect(r.steps[0]).toEqual({ step: 'github', ok: false, error: 'github_team_add_failed_403: Resource not accessible by personal access token' });
    expect(r.steps[1].ok).toBe(true);
  });

  it('reports each failing step without hiding the other', async () => {
    const svc = fakeServices({ ghUser: false, umapi: { completed: 0, notCompleted: 1, errors: [{ errorCode: 'error.group.not_found' }] } });
    const r = await grantAccess(user, 'nobody', env, svc.fetchImpl);
    expect(r.steps).toEqual([
      { step: 'github', ok: false, error: 'github_user_not_found' },
      { step: 'adminConsole', ok: false, error: 'admin_console_failed: error.group.not_found' },
    ]);
  });

  it('other domains: only a request row, no team or Admin Console', async () => {
    const svc = fakeServices();
    const ext = { email: 'pat@partner.com', firstName: 'Pat', lastName: 'Lee' };
    const r = await grantAccess(ext, 'pat-l', env, svc.fetchImpl, nowait);
    expect(r).toMatchObject({ automatic: false, steps: [{ step: 'request', ok: true, alreadyRequested: false }] });
    expect(svc.calls.some((c) => c.url.includes('github') || c.url.includes('usermanagement'))).toBe(false);
    const rows = svc.sheet().users.data;
    expect(rows.map((x) => x.Email)).toEqual(['old@partner.com', 'pat@partner.com']); // blank row dropped
    expect(rows[1]).toMatchObject({ 'First Name': 'Pat', 'Last Name': 'Lee', 'Role Request': 'config_admin, publish' });
    expect(rows[1].Notes).toMatch(/^SC Demos gh: pat-l; requested \d{4}-\d{2}-\d{2}$/);
    expect(svc.sheet().users.total).toBe(2);
    expect(svc.sheet().data).toBeTruthy();
    const again = await grantAccess(ext, 'pat-l', env, svc.fetchImpl, nowait);
    expect(again.steps[0].alreadyRequested).toBe(true);
    expect(svc.sheet().users.data).toHaveLength(2);
  });

  it('other domains: a request lost to a parallel write is written again', async () => {
    const svc = fakeServices({ loseWrites: 2 });
    const r = await grantAccess({ email: 'pat@partner.com', firstName: 'Pat', lastName: 'Lee' }, 'pat-l', env, svc.fetchImpl, nowait);
    expect(r.steps[0]).toMatchObject({ ok: true, alreadyRequested: false });
    expect(svc.sheet().users.data.map((x) => x.Email)).toContain('pat@partner.com');
    expect(svc.calls.filter((c) => c.method === 'PUT')).toHaveLength(3);
  });

  it('other domains: says so when the request never sticks', async () => {
    const svc = fakeServices({ loseWrites: 3 });
    await expect(grantAccess({ email: 'pat@partner.com', firstName: 'Pat', lastName: 'Lee' }, 'pat-l', env, svc.fetchImpl, nowait))
      .rejects.toThrow('requests_write_not_confirmed');
  });

  it('rejects invalid GitHub usernames before calling anything', async () => {
    const svc = fakeServices();
    await expect(grantAccess(user, 'bad name', env, svc.fetchImpl)).rejects.toThrow('invalid_github_user');
    await expect(grantAccess(user, '-x', env, svc.fetchImpl)).rejects.toThrow('invalid_github_user');
    expect(svc.calls).toHaveLength(0);
  });

  it('domain match is exact', () => {
    expect(isAutomatic('a@adobe.com', env)).toBe(true);
    expect(isAutomatic('a@notadobe.com', env)).toBe(false);
    expect(isAutomatic('a@adobe.com.evil.io', env)).toBe(false);
  });
});
