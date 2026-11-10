#!/usr/bin/env node
/*
 * customer-demo: AEM Admin API from any harness (no browser needed).
 *
 *   AEM_ADMIN_TOKEN=… node admin.mjs <command> --site <slug> [--org scdemos] [--ref main] [paths…]
 *
 * Commands
 *   preview  <paths…>   bulk preview (pages and sheets, e.g. /metadata.json), waits for the job
 *   publish  <paths…>   bulk preview + publish (live); the query index builds on publish
 *   unindex  <paths…>   remove paths from the query index
 *   code-sync           full code sync (repo created from the template before Code Sync was installed)
 *   status   <path>     preview/live status of one path
 *   config   [key]      print the site config (secrets redacted), or one key
 *
 * AEM_ADMIN_TOKEN is the `auth_token` cookie of a signed-in https://admin.hlx.page session (or a site
 * API key). It is sent as `x-auth-token` and never printed. Browser-only harnesses can run the same
 * calls with fetch() from a signed-in admin.hlx.page tab.
 */
const API = 'https://admin.hlx.page';
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i > 0 ? argv[i + 1] : def; };
const flagVals = new Set(['--site', '--org', '--ref'].flatMap((f) => { const i = argv.indexOf(f); return i > 0 ? [i, i + 1] : []; }));
const paths = argv.slice(1).filter((a, i) => !flagVals.has(i + 1) && !a.startsWith('--'));
const site = opt('site');
const org = opt('org', 'scdemos');
const ref = opt('ref', 'main');
const token = process.env.AEM_ADMIN_TOKEN;

const call = async (method, url, body) => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'x-auth-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, error: res.headers.get('x-error') };
};

async function bulk(topic, route) {
  const r = await call('POST', `/${route}/${org}/${site}/${ref}/*`, { paths, forceUpdate: true });
  if (!r.json?.job) throw new Error(`${route}: ${r.status} ${r.error || r.text.slice(0, 120)}`);
  for (let i = 0; i < 90; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((s) => { setTimeout(s, 2000); });
    // eslint-disable-next-line no-await-in-loop
    const d = await call('GET', `/job/${org}/${site}/${ref}/${topic}/${r.json.job.name}/details`);
    if (d.json?.state === 'stopped') {
      const res = d.json.data?.resources || [];
      res.forEach((x) => console.log(`${x.status === 200 ? '✅' : '❌'} ${topic} ${x.path} ${x.status}`));
      return res.every((x) => x.status === 200);
    }
  }
  throw new Error(`${topic} job did not finish in time`);
}

const redact = (o) => JSON.parse(JSON.stringify(o, (k, v) => (/apikeys|apitoken|token|secret/i.test(k) ? '***' : v)));

async function main() {
  if (!cmd || !site) throw new Error('usage: node admin.mjs <preview|publish|unindex|code-sync|status|config> --site <slug> [paths…]');
  if (!token) throw new Error('AEM_ADMIN_TOKEN not set (auth_token cookie from https://admin.hlx.page/login)');
  let ok = true;
  if (cmd === 'preview' || cmd === 'publish') {
    if (!paths.length) throw new Error('give at least one path');
    ok = await bulk('preview', 'preview');
    if (cmd === 'publish') ok = (await bulk('publish', 'live')) && ok;
  } else if (cmd === 'unindex') {
    for (const p of paths) {
      // eslint-disable-next-line no-await-in-loop
      const r = await call('DELETE', `/index/${org}/${site}/${ref}${p}`);
      console.log(`${r.status < 300 ? '✅' : '❌'} unindex ${p} ${r.status}`);
      ok = ok && r.status < 300;
    }
  } else if (cmd === 'code-sync') {
    const r = await call('POST', `/code/${org}/${site}/${ref}/*`);
    console.log(`${r.status < 300 ? '✅' : '❌'} code sync ${r.status} ${r.error || ''}`);
    ok = r.status < 300;
  } else if (cmd === 'status') {
    const r = await call('GET', `/status/${org}/${site}/${ref}${paths[0] || '/'}`);
    if (r.status !== 200) throw new Error(`status: ${r.status} ${r.error || ''}`);
    console.log(JSON.stringify({ preview: r.json?.preview?.status, live: r.json?.live?.status, edit: r.json?.edit?.url }, null, 2));
  } else if (cmd === 'config') {
    const r = await call('GET', `/config/${org}/sites/${site}.json`);
    if (r.status !== 200 || !r.json) throw new Error(`config: ${r.status} ${r.error || ''}`);
    const cfg = redact(r.json);
    console.log(JSON.stringify(paths[0] ? cfg[paths[0]] : cfg, null, 2));
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => { console.error(`admin: ${e.message}`); process.exitCode = 1; });
