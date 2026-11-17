#!/usr/bin/env node
/*
 * customer-demo: migrate the DA site config (https://da.live/config#/scdemos/demo/) to a customer
 * demo, rewritten for the customer (P2 template copies code, not state; P8 no side effects).
 *
 * The DA config is a multi-sheet document (data, library, apps, skills, mcp-servers, prompts, flags,
 * publish-workflow-*, prepare, ...). `mergeDaConfig` copies every base sheet and:
 *  - rewrites base-bound references: scdemos/demo → scdemos/<slug>, main--demo--scdemos →
 *    main--<slug>--scdemos, and the base Demo Presenter URL → the customer's walkthrough;
 *  - keeps shared assets (icons hosted on demo.bbird.live) untouched;
 *  - keeps rows the customer site already has (matched by title/key/pattern): customer wins;
 *  - ALWAYS sets publish approvers to one `/*` rule for the SC (the base's personal approvers
 *    and drafts rules are never copied), so nobody else gets approval emails.
 *
 * Usage (IMS token from a signed-in da.live session in DA_TOKEN; never printed):
 *   DA_TOKEN=... node da-config.mjs --slug <slug> --sc-email <you@adobe.com> [--dry-run]   # fetch, merge, POST
 *   node da-config.mjs --base base.json --site site.json --slug <slug> --sc-email <e> --out merged.json   # offline
 *   node da-config.mjs --check merged.json                                                 # remaining base refs
 * In a browser-only harness, paste mergeDaConfig into a signed-in da.live tab and POST FormData
 * `config=<json>` to https://admin.da.live/config/scdemos/<slug>.
 */
import fs from 'node:fs';

const API = 'https://admin.da.live/config';

export function mergeDaConfig(base, site, { slug, scEmail, org = 'scdemos' }) {
  if (!slug || slug === 'demo') throw new Error('slug is required and must not be the base');
  if (!/^[^@\s]+@adobe\.com$/i.test(scEmail || '')) throw new Error('sc-email must be the SC\'s @adobe.com address (publish approver)');
  const rewrite = (v) => (typeof v !== 'string' ? v : v
    .replace(/https:\/\/demo\.bbird\.live\/tools\/demo\/demo\.html[^\s"]*/g, `https://main--${slug}--${org}.aem.page/tools/demo/demo.html?url=/tools/demo/${slug}-walkthrough.json`)
    .replace(new RegExp(`${org}/demo(?![a-z0-9-])`, 'g'), `${org}/${slug}`)
    .replace(new RegExp(`main--demo--${org}`, 'g'), `main--${slug}--${org}`));
  const idOf = (r) => r.title || r.key || r.pattern || r.group || JSON.stringify(r);
  const names = [...new Set([...(base[':names'] || []), ...(site[':names'] || [])])];
  const out = { ':names': names, ':version': base[':version'] || 3, ':type': 'multi-sheet' };
  names.forEach((n) => {
    const baseRows = (base[n]?.data || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, rewrite(v)])));
    const siteRows = site[n]?.data || [];
    let rows;
    if (n === 'publish-workflow-config') {
      rows = [{ pattern: '/*', approvers: scEmail, cc: '', notifyonreject: 'true' }];
    } else {
      const seen = new Set(siteRows.map(idOf));
      rows = [...siteRows, ...baseRows.filter((r) => !seen.has(idOf(r)))];
    }
    out[n] = { total: rows.length, limit: rows.length, offset: 0, data: rows, ':colWidths': base[n]?.[':colWidths'] || site[n]?.[':colWidths'] };
  });
  return out;
}

export function baseRefs(cfg, org = 'scdemos') {
  const hits = [];
  (cfg[':names'] || []).forEach((n) => (cfg[n]?.data || []).forEach((r, i) => Object.entries(r).forEach(([c, v]) => {
    if (new RegExp(`${org}/demo(?![a-z0-9-])|main--demo--${org}|demo\\.bbird\\.live/tools/`).test(String(v))) hits.push(`${n}[${i}].${c}`);
  })));
  return hits;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? 'true' : v;
}

async function live(slug, scEmail, dryRun) {
  const token = process.env.DA_TOKEN;
  if (!token) throw new Error('DA_TOKEN not set (IMS access token of a signed-in da.live session)');
  const H = { Authorization: `Bearer ${token}` };
  const read = async (site) => {
    const r = await fetch(`${API}/scdemos/${site}`, { headers: H });
    if (r.status === 404) return {};
    if (!r.ok) throw new Error(`GET config ${site}: ${r.status}`);
    return r.json();
  };
  const merged = mergeDaConfig(await read('demo'), await read(slug), { slug, scEmail });
  const refs = baseRefs(merged);
  console.log(`sheets: ${merged[':names'].join(', ')}; base references left: ${refs.length}`);
  if (refs.length) throw new Error(`refusing to write: base references left in ${refs.join(', ')}`);
  if (dryRun) return;
  const fd = new FormData();
  fd.append('config', JSON.stringify(merged));
  const w = await fetch(`${API}/scdemos/${slug}`, { method: 'POST', headers: H, body: fd });
  if (!w.ok) throw new Error(`POST config ${slug}: ${w.status}`);
  const back = await read(slug);
  const missing = merged[':names'].filter((n) => !(back[':names'] || []).includes(n));
  console.log(missing.length ? `written, but sheets missing after write: ${missing.join(', ')}` : `written: ${back[':names'].length} sheets on scdemos/${slug}`);
  if (missing.length) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('da-config.mjs')) {
  try {
    if (arg('check')) {
      const hits = baseRefs(JSON.parse(fs.readFileSync(arg('check'), 'utf8')));
      console.log(hits.length ? `base references left: ${hits.join(', ')}` : 'no base references');
      process.exitCode = hits.length ? 1 : 0;
    } else if (arg('base') && arg('site')) {
      const merged = mergeDaConfig(JSON.parse(fs.readFileSync(arg('base'), 'utf8')), JSON.parse(fs.readFileSync(arg('site'), 'utf8')), { slug: arg('slug'), scEmail: arg('sc-email') });
      fs.writeFileSync(arg('out') || 'da-config.merged.json', JSON.stringify(merged, null, 2));
      console.log(`sheets: ${merged[':names'].join(', ')}; base references left: ${baseRefs(merged).length}`);
    } else if (arg('slug')) {
      await live(arg('slug'), arg('sc-email'), arg('dry-run') === 'true');
    } else {
      console.error('usage: DA_TOKEN=… --slug s --sc-email e [--dry-run] | --base f --site f --slug s --sc-email e [--out f] | --check f');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(`da-config: ${e.message}`);
    process.exitCode = 1;
  }
}
