/**
 * Adobe Journey Optimizer code-based experiences for page sections.
 *
 * Authors mark a section with Section Metadata `AJO | <location>` (delivered as data-ajo).
 * That section is a Journey Optimizer surface: web://<surfaceHost><page path>#<location>,
 * matching a code-based channel configuration. Campaigns on the surface decide, per
 * Experience Platform audience, which Experience Workspace fragment replaces the section and
 * answer with JSON: {"fragment": "<fragment URL>"}. Without an answer (no consent, no
 * matching campaign, timeout) the authored section stays.
 */
import { AJO_CONFIG } from './ajo-config.js';
import { fetchFragment, getStoredConsent, withTimeout } from './shared.js';
import { getCodeBasedExperience, loadWebSDK, sendEvent } from '../plugins/martech/src/index.js';

const JSON_ITEM = 'https://ns.adobe.com/personalization/json-content-item';
const SIGN_IN_REPORTED = 'ajo-sign-in-reported';
// One leading slash, then plain path characters only (no //, no backslash).
const SAFE_PATH = /^\/[A-Za-z0-9._~-][A-Za-z0-9._~/-]*$/;

let consent;
let martechReady;
let signInReport;

export function setAjoConsent(choice) {
  consent = choice;
  if (choice?.analytics) return;
  // Without analytics the Web SDK identity is dropped; a new one needs its own sign-in event.
  signInReport = null;
  try { sessionStorage.removeItem(SIGN_IN_REPORTED); } catch { /* nothing stored */ }
}

export function setAjoMartechReady(ready) {
  martechReady = ready;
}

const currentConsent = () => consent || getStoredConsent();
const canTarget = () => !!(currentConsent()?.analytics && currentConsent()?.targeting);

// The Web SDK drops a trailing slash from surfaces (/en/#hero becomes /en#hero), so requests
// and answers are matched in that form.
const normalizeSurface = (surface) => surface.replace(/\/+#/, '#');
const surfaceOf = (location) => normalizeSurface(`web://${AJO_CONFIG.surfaceHost}${window.location.pathname}#${location}`);

/**
 * The spot a section is marked with: Section Metadata AJO | <spot>, delivered as data-ajo, or
 * still a Section Metadata table where nothing has converted it (local HTML).
 */
function ajoSpotOf(section) {
  if (section.dataset.ajo) return section.dataset.ajo.trim();
  const row = [...section.querySelectorAll(':scope > .section-metadata > div')]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === 'ajo');
  return row?.children[1]?.textContent.trim() || '';
}

// A campaign link the visitor followed (?utm_campaign=…) already chose this section's content.
const servedByCampaign = (section) => [...section.classList]
  .some((c) => c.startsWith('campaign-') && c !== 'campaign-default');

/**
 * Tells Experience Platform once per browser session that the visitor signed in
 * (eventType userAccount.login, nothing else), so edge audiences built on sign-in qualify
 * them on this visit. Needs analytics consent, as any other event. Call it only once the Web
 * SDK is configured (see decide).
 * @returns {Promise<void>}
 */
function reportSignIn() {
  signInReport ||= (async () => {
    if (!currentConsent()?.analytics) return;
    const { getSessionState } = await import('./shared/auth-api.js');
    const session = await getSessionState();
    // Session storage only saves a repeat event; without it the event is sent on every AJO page.
    let reported = false;
    try {
      if (!session?.authenticated) sessionStorage.removeItem(SIGN_IN_REPORTED);
      else reported = !!sessionStorage.getItem(SIGN_IN_REPORTED);
    } catch { /* no storage */ }
    if (!session?.authenticated || reported) return;
    if (!currentConsent()?.analytics) return;
    // Analytics only: this event must not ask for personalized content.
    await sendEvent({
      xdm: { eventType: 'userAccount.login' },
      personalization: { defaultPersonalizationEnabled: false },
    });
    // Consent may have been withdrawn while the event was on its way.
    if (!currentConsent()?.analytics) return;
    try { sessionStorage.setItem(SIGN_IN_REPORTED, 'true'); } catch { /* reported again */ }
  })().catch(() => {
    // Not sent: the next AJO page tries again.
    signInReport = null;
  });
  return signInReport;
}

function fragmentPathOf(item) {
  try {
    const content = typeof item.data?.content === 'string'
      ? JSON.parse(item.data.content)
      : item.data?.content;
    if (typeof content?.fragment !== 'string') return null;
    // Fragments always load from this site, whichever host the authored URL names. Only a
    // plain path is taken: anything a browser could read as another host is refused.
    const url = new URL(content.fragment, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || !SAFE_PATH.test(url.pathname)) return null;
    if (new URL(url.pathname, window.location.origin).origin !== window.location.origin) return null;
    // The hash is kept: #_dnt asks for the default-language fragment.
    return `${url.pathname}${url.hash}`;
  } catch {
    return null;
  }
}

/** Fragment sections, with media paths relative to the fragment rather than the page. */
function fragmentSections(found) {
  // A template is inert: nothing in the fragment loads until it is placed in the page.
  const holder = document.createElement('template');
  holder.innerHTML = found.html;
  const base = new URL(found.path, window.location);
  holder.content.querySelectorAll('img[src^="./media_"]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
  });
  holder.content.querySelectorAll('source[srcset^="./media_"]').forEach((source) => {
    source.srcset = new URL(source.getAttribute('srcset'), base).href;
  });
  return [...holder.content.children];
}

async function decideOne(proposition, bySurface, canGo) {
  try {
    const section = bySurface.get(normalizeSurface(proposition.scope || ''));
    const item = proposition.items?.find((i) => i.schema === JSON_ITEM);
    const path = section && item && fragmentPathOf(item);
    // Consent can be withdrawn, or the deadline pass, while Journey Optimizer answers.
    const found = path && canGo() && await fetchFragment(path);
    const sections = found ? fragmentSections(found) : [];
    // An empty fragment would only remove the authored section.
    const hasContent = sections.some((s) => {
      const visible = s.cloneNode(true);
      visible.querySelectorAll('.section-metadata').forEach((m) => m.remove());
      return visible.textContent.trim() || visible.querySelector('img, picture, video, iframe');
    });
    return hasContent ? { section, sections, proposition } : null;
  } catch {
    return null;
  }
}

/**
 * Puts each usable decision in `ready` as soon as its fragment is in, one per section (the
 * first to arrive), so the deadline keeps whatever has arrived by then.
 */
async function decide(bySurface, canGo, ready) {
  await martechReady;
  if (!canGo()) return;
  // Pages without Target load the Web SDK only in the lazy phase; this answer is needed now.
  await loadWebSDK();
  if (!canGo()) return;
  // A visitor who just signed in qualifies for sign-in audiences in this same request.
  await reportSignIn();
  const response = await getCodeBasedExperience([...bySurface.keys()], canGo);
  const propositions = response?.propositions || [];
  await Promise.all(propositions.map(async (p) => {
    const decision = await decideOne(p, bySurface, canGo);
    if (decision && canGo() && !ready.has(decision.section)) ready.set(decision.section, decision);
  }));
}

/**
 * Replaces each AJO section with the fragment Journey Optimizer picked for this visitor, then
 * reports those propositions as displayed. Runs before the page is decorated; waits at most
 * AJO_CONFIG.timeout, after which the authored sections stay and no more requests are made.
 * @param {Element} main
 */
export async function applyAjoSections(main) {
  const spots = [...main.querySelectorAll(':scope > div')]
    .map((section) => [ajoSpotOf(section), section])
    .filter(([spot, section]) => spot && !servedByCampaign(section));
  if (!spots.length || !martechReady || !canTarget()) return;
  const bySurface = new Map(spots.map(([spot, section]) => [surfaceOf(spot), section]));
  let inTime = true;
  const canGo = () => inTime && canTarget();
  const ready = new Map();
  await withTimeout(decide(bySurface, canGo, ready).catch(() => {}), AJO_CONFIG.timeout);
  inTime = false;
  const decisions = [...ready.values()];
  if (!decisions.length || !canTarget()) return;
  decisions.forEach(({ section, sections: replacement }) => section.replaceWith(...replacement));
  sendEvent({
    xdm: {
      eventType: 'decisioning.propositionDisplay',
      _experience: {
        decisioning: {
          propositions: decisions.map(({ proposition: { id, scope, scopeDetails } }) => ({
            id, scope, scopeDetails,
          })),
          propositionEventType: { display: 1 },
        },
      },
    },
  }).catch(() => { /* Display reporting must not interrupt the page. */ });
}
