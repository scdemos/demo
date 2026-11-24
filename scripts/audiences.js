import { AJO_CONFIG } from './ajo-config.js';
import { getAjoConsent, isAjoAudience, reportAjoAudience } from './ajo.js';
import { getVisitorType, withTimeout } from './shared.js';
import { parseAudienceDefinitions } from './shared/audience-definitions.js';

let definitions;
let gating = new WeakMap();
let listening = false;
const appliedAjoAudiences = new Set();

// Rules about the visitor (history, sign-in, AJO) need targeting consent. Without it they
// never qualify, so no visitor trait reaches content selection or operational telemetry.
// Authoring surfaces keep every section, so they never evaluate visitor rules (and never
// record a visit).
let authoring = false;
const canTarget = () => !authoring
  && !!(getAjoConsent()?.analytics && getAjoConsent()?.targeting);
// Checked again after the rule resolves: consent can be withdrawn while it waits.
const withConsent = (fn) => async () => canTarget() && (await fn()) && canTarget();

function audienceRule(rule) {
  const visitorRules = {
    'new-visitor': () => getVisitorType() === 'new-visitor',
    'returning-visitor': () => getVisitorType() === 'returning-visitor',
    'signed-in': async () => {
      const { getSessionState } = await import('./shared/auth-api.js');
      return (await withTimeout(getSessionState(), AJO_CONFIG.timeout))?.authenticated === true;
    },
    guest: async () => {
      const { getSessionState } = await import('./shared/auth-api.js');
      return (await withTimeout(getSessionState(), AJO_CONFIG.timeout))?.authenticated === false;
    },
  };
  const deviceRules = {
    mobile: () => window.innerWidth < 600,
    desktop: () => window.innerWidth >= 600,
  };
  if (Object.hasOwn(deviceRules, rule)) return deviceRules[rule];
  if (Object.hasOwn(visitorRules, rule)) return withConsent(visitorRules[rule]);
  if (rule.startsWith('ajo:') && rule.slice(4).trim()) {
    const key = rule.slice(4).trim();
    return async () => {
      if (authoring) return false;
      const resolved = await isAjoAudience(key);
      if (resolved) appliedAjoAudiences.add(key);
      return resolved;
    };
  }
  console.warn(`Unknown audience rule: ${rule}`);
  return () => false;
}

async function loadDefinitions() {
  const controller = new AbortController();
  try {
    const request = fetch('/audiences.json', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Audience sheet returned ${response.status}`);
      return parseAudienceDefinitions(await response.json());
    });
    return await withTimeout(request, AJO_CONFIG.timeout, []);
  } catch (error) {
    console.warn('Could not load audience definitions:', error);
    return [];
  } finally {
    controller.abort();
  }
}

/**
 * Audience names listed in Campaign Audience / Experiment Audience, per element the engine
 * reports on (body for page metadata, the section for Section Metadata). Read before the
 * engine replaces content.
 */
function gatingAudiences(doc) {
  const found = new WeakMap();
  const add = (el, type, value) => {
    if (!el) return;
    const entry = found.get(el) || { campaign: new Set(), experiment: new Set() };
    String(value || '').split(',')
      .map((name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      .filter(Boolean)
      .forEach((name) => entry[type].add(name));
    found.set(el, entry);
  };
  // The engine reports page-level campaigns and experiments on <body>.
  doc.head.querySelectorAll('meta[name]').forEach((meta) => {
    const match = meta.name.match(/^(campaign|experiment)-audiences?$/);
    if (match) add(doc.body, match[1], meta.content);
  });
  doc.querySelectorAll('.section-metadata > div').forEach((row) => {
    const match = row.children[0]?.textContent.trim().toLowerCase().match(/^(campaign|experiment)[\s-]+audiences?$/);
    if (match) add(row.closest('.section-metadata').parentElement, match[1], row.children[1]?.textContent);
  });
  return found;
}

/** Called only from the enabled experimentation path, before its engine starts. */
export async function registerAudiences(config, doc) {
  authoring = !!config.keepUnmatchedSections;
  definitions ||= loadDefinitions();
  const rows = await definitions;
  if (!listening) {
    listening = true;
    // Audiences that gate a campaign or experiment, read before the engine replaces content
    // (and again for content a served campaign brings in; see refreshAudienceGates).
    gating = gatingAudiences(doc);
    const report = (name) => {
      const row = rows.find((r) => r.name === name);
      if (!row?.rule.startsWith('ajo:')) return;
      const key = row.rule.slice(4).trim();
      // Simulation bypasses rule functions, and must never produce AJO impressions.
      if (appliedAjoAudiences.has(key)) reportAjoAudience(key);
    };
    doc.addEventListener('aem:experimentation', ({ detail }) => {
      if (detail?.type === 'audience' && detail.audience !== 'default') report(detail.audience);
      const gates = gating.get(detail?.element);
      if (detail?.type === 'campaign' && detail.campaign !== 'default') gates?.campaign.forEach(report);
      if (detail?.type === 'experiment' && detail.run) gates?.experiment.forEach(report);
    });
  }
  const authored = Object.fromEntries(rows.map(({ name, rule }) => [name, audienceRule(rule)]));
  config.audiences = { ...config.audiences, ...authored };
}

/** Adds gates from content a served campaign brought in (existing entries are kept). */
export function refreshAudienceGates(doc) {
  const fresh = gatingAudiences(doc);
  [doc.body, ...doc.querySelectorAll('main > div')].forEach((el) => {
    if (!gating.has(el) && fresh.has(el)) gating.set(el, fresh.get(el));
  });
}
