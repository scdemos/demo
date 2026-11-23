/*
 * Code that needs the visitor's consent (analytics, martech, Launch). consent-check.js
 * loads this module only after analytics is accepted.
 */
import { loadScript } from './aem.js';
import {
  martechDelayed, martechLazy, updateUserConsent,
} from '../plugins/martech/src/index.js';
import { isMartechStarted, startMartech } from './scripts.js';
import {
  gtmDelayed, gtmLazy, startGtm, updateGtmConsent,
} from './gtm-martech.js';

// a consent update should never hold up a reload when Web SDK can't reach the edge
const CONSENT_TIMEOUT = 1500;

let started;
// the visitor's latest choice, so startup never loads a tag after analytics was withdrawn
let latest;

async function loadCloudflareAnalytics() {
  if (!window.location.hostname.includes('bbird.live')) return;
  await loadScript('https://static.cloudflareinsights.com/beacon.min.js', {
    defer: true,
    'data-cf-beacon': '{"token": "6e52f24c204942e89f9b897c49e769d6"}',
  });
}

/**
 * Runs the consent-dependent code once per page view.
 * @param {{analytics: boolean, targeting: boolean}} categories the visitor's choice
 * @returns {Promise<void>}
 */
export function startConsented(categories) {
  latest ||= categories;
  started ||= (async () => {
    // Google: already running for a saved choice (scripts.js), else it starts now. Independent
    // of Adobe, so a failure on one side never stops the other.
    const google = (async () => {
      if (!await startGtm(latest)) return;
      await gtmLazy();
      await gtmDelayed();
    })().catch(() => { /* a failed tag must not stop the rest of the page */ });
    const adobe = (async () => {
      if (!isMartechStarted()) {
        // Accepted on this page view: analytics and Launch start now. Target personalization
        // starts on the next page view, so offers never swap content the visitor is reading.
        await startMartech(categories, false);
        await martechLazy();
      }
      if (!latest.analytics) return;
      await Promise.all([martechDelayed(), loadCloudflareAnalytics()]);
    })().catch(() => { /* a failed tag must not stop the rest of the page */ });
    await Promise.all([google, adobe]);
  })();
  return started;
}

/**
 * Passes a changed choice to Web SDK. Never waits on Launch, and gives up after a short
 * timeout so a withdrawal can always go on to clear cookies and reload.
 * @param {{analytics: boolean, targeting: boolean}} categories the visitor's choice
 * @returns {Promise<void>}
 */
export async function updateConsent(categories) {
  latest = categories;
  updateGtmConsent(categories);
  if (!isMartechStarted()) {
    if (categories.analytics) startConsented(categories);
    return;
  }
  await Promise.race([
    updateUserConsent({
      collect: categories.analytics,
      personalize: categories.targeting,
      marketing: categories.targeting,
      share: false,
    }),
    new Promise((resolve) => { setTimeout(resolve, CONSENT_TIMEOUT); }),
  ]).catch(() => { /* Web SDK reports its own errors */ });
  if (categories.analytics) startConsented(categories);
}
