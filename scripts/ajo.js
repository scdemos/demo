import { AJO_CONFIG } from './ajo-config.js';
import { getStoredConsent, withTimeout } from './shared.js';
import { getCodeBasedExperience, sendEvent } from '../plugins/martech/src/index.js';

let consent;
let martechReady;
let audienceRequest;
const resolvedPropositions = new Map();
const displayed = new Set();

export function setAjoConsent(choice) {
  consent = choice;
}

export const getAjoConsent = () => consent || getStoredConsent();

const canTarget = () => !!(getAjoConsent()?.analytics && getAjoConsent()?.targeting);

export function setAjoMartechReady(ready) {
  martechReady = ready;
}

async function requestAudiences() {
  if (!canTarget() || !martechReady) return new Set();
  const controller = new AbortController();
  const surface = AJO_CONFIG.surface || `web://${window.location.host}/#audiences`;
  const request = (async () => {
    await martechReady;
    if (!canTarget() || controller.signal.aborted) return new Set();
    const response = await getCodeBasedExperience(surface, controller.signal, canTarget);
    if (!canTarget() || controller.signal.aborted) return new Set();
    const keys = new Set();
    (response?.propositions || []).filter((p) => p.scope === surface).forEach((proposition) => {
      (proposition.items || []).filter((item) => item.schema === 'https://ns.adobe.com/personalization/json-content-item')
        .forEach((item) => {
          try {
            const content = typeof item.data?.content === 'string' ? JSON.parse(item.data.content) : item.data?.content;
            if (!Array.isArray(content?.audiences)) return;
            content.audiences.filter((key) => typeof key === 'string' && key).forEach((key) => {
              keys.add(key);
              const propositions = resolvedPropositions.get(key) || [];
              propositions.push(proposition);
              resolvedPropositions.set(key, propositions);
            });
          } catch { /* Malformed JSON is not an audience decision. */ }
        });
    });
    return keys;
  })().catch(() => new Set());
  return withTimeout(request, AJO_CONFIG.timeout, new Set()).finally(() => controller.abort());
}

export async function isAjoAudience(key) {
  audienceRequest ||= requestAudiences();
  return canTarget() && (await audienceRequest).has(key);
}

/** Called only after the experimentation engine has applied an audience's content. */
export function reportAjoAudience(key) {
  if (!canTarget() || !martechReady) return;
  const propositions = (resolvedPropositions.get(key) || []).filter((p) => !displayed.has(p.id));
  if (!propositions.length) return;
  propositions.forEach((p) => displayed.add(p.id));
  sendEvent({
    renderDecisions: false,
    personalization: { defaultPersonalizationEnabled: false, sendDisplayEvent: false },
    xdm: {
      eventType: 'decisioning.propositionDisplay',
      _experience: {
        decisioning: {
          propositions: propositions.map(({ id, scope, scopeDetails }) => ({ id, scope, scopeDetails })),
          propositionEventType: { display: 1 },
        },
      },
    },
  }).catch(() => { /* Optional display reporting must not interrupt the page. */ });
}
