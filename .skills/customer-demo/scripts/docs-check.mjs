#!/usr/bin/env node
/*
 * customer-demo: docs drift guard. Keeps SC-QUICKSTART.md (and the other docs) in step with the
 * skill and its scripts. Runs in the pre-commit hook for any change under .skills/customer-demo/.
 *
 *   node docs-check.mjs           # exit 1 on drift
 *   node docs-check.mjs --stamp   # after reviewing/updating SC-QUICKSTART.md, record the sync
 *
 * Checks
 *  1. Every `scripts/<name>.mjs|.js` mentioned in SKILL.md, SC-QUICKSTART.md, the checklist,
 *     references and README exists.
 *  2. Every script in scripts/ is documented in SKILL.md.
 *  3. SC-QUICKSTART.md was reviewed after the last change to the skill: its `synced-with` stamp
 *     must equal the hash of SKILL.md + signoff-checklist.md + the script list (+ each script's
 *     usage header). Change any of those → update the quickstart if needed → `--stamp`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SKILL_DIR, '../..');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const QS = path.join(SKILL_DIR, 'SC-QUICKSTART.md');

const scripts = fs.readdirSync(path.join(SKILL_DIR, 'scripts')).filter((f) => /\.(mjs|js)$/.test(f)).sort();
const docs = {
  'SKILL.md': read(path.join(SKILL_DIR, 'SKILL.md')),
  'SC-QUICKSTART.md': read(QS),
  'references/signoff-checklist.md': read(path.join(SKILL_DIR, 'references/signoff-checklist.md')),
  'references/base-state-inventory.md': read(path.join(SKILL_DIR, 'references/base-state-inventory.md')),
  'README.md': read(path.join(ROOT, 'README.md')),
};

const problems = [];
Object.entries(docs).forEach(([name, text]) => {
  const refs = new Set([...text.matchAll(/\b([a-z][a-z0-9-]*\.(?:mjs|js))\b/g)].map((m) => m[1]));
  refs.forEach((r) => {
    if (/^(scripts|aem|delayed|form|header|footer|cards|search|index|shared|notices|eslint\.config)\.js$/.test(r)) return;
    if (!scripts.includes(r) && !fs.existsSync(path.join(SKILL_DIR, 'scripts', r))) problems.push(`${name} mentions ${r}, which isn't in scripts/`);
  });
});
scripts.forEach((s) => { if (!docs['SKILL.md'].includes(s)) problems.push(`scripts/${s} isn't documented in SKILL.md`); });

const usage = (f) => (read(path.join(SKILL_DIR, 'scripts', f)).match(/\/\*[\s\S]*?\*\//) || [''])[0];
const fingerprint = crypto.createHash('sha256')
  .update(docs['SKILL.md'])
  .update(docs['references/signoff-checklist.md'])
  .update(scripts.map((f) => `${f}\n${usage(f)}`).join('\n'))
  .digest('hex')
  .slice(0, 16);

const STAMP_RE = /<!-- docs-check: synced-with=([^ ]+) -->/;
if (process.argv.includes('--stamp')) {
  const qs = docs['SC-QUICKSTART.md'];
  const next = STAMP_RE.test(qs) ? qs.replace(STAMP_RE, `<!-- docs-check: synced-with=${fingerprint} -->`) : `${qs.trimEnd()}\n\n<!-- docs-check: synced-with=${fingerprint} -->\n`;
  fs.writeFileSync(QS, next);
  console.log(`SC-QUICKSTART.md stamped as synced with ${fingerprint}`);
} else {
  const stamp = (docs['SC-QUICKSTART.md'].match(STAMP_RE) || [])[1];
  if (stamp !== fingerprint) {
    problems.push(`SC-QUICKSTART.md not reviewed since the skill changed (stamp ${stamp || 'missing'} ≠ ${fingerprint}). Update it if SC-facing steps, prompts, approvals, outputs or troubleshooting changed, then run: node .skills/customer-demo/scripts/docs-check.mjs --stamp`);
  }
}

if (problems.length) {
  console.log(`docs-check: ${problems.length} problem(s)\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  process.exitCode = 1;
} else if (!process.argv.includes('--stamp')) {
  console.log('docs-check: docs in sync');
}
