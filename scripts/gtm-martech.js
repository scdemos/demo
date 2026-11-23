/*
 * Google Analytics 4 and Google Tag Manager through the aem-gtm-martech plugin, phased like the
 * page: GA4 in the eager phase, the first GTM container in the lazy phase, third-party
 * containers in the delayed phase. https://www.aem.live/developer/gtm-martech-integration
 *
 * Only imported for a visitor who accepted analytics (scripts.js for a saved choice,
 * consented.js when they accept on this page view), so Google loads nothing for anyone else.
 */
import GtmMartech from '../plugins/gtm-martech/src/index.js';
import { onTrackEvent, trackEvent } from './shared.js';

// GA4 measurement ID(s), loaded in the eager phase, and GTM containers by phase. With none of
// them, Google stays off.
const TAGS = [];
const CONTAINERS = {
  lazy: ['GTM-5MWZL5HH'],
  delayed: [],
};
const CONFIGURED = TAGS.length > 0 || CONTAINERS.lazy.length > 0 || CONTAINERS.delayed.length > 0;

let gtm;
const done = new Set();
// stops forwarding the moment analytics is withdrawn (the page reloads right after)
let allowed = false;

// Clicks on the page's buttons (authored CTAs and block buttons), with the block they're in.
function trackCtaClicks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a.button');
    // only web links, without query or hash: mailto:, tel: and parameters can carry personal data
    if (!link || !/^https?:$/.test(link.protocol)) return;
    const text = link.textContent.trim().slice(0, 100);
    trackEvent('cta_click', {
      // a label that looks like an email address or phone number isn't sent
      link_text: /@|\d[\d\s().-]{6,}/.test(text) ? '' : text,
      link_url: `${link.origin}${link.pathname}`,
      block_name: link.closest('[data-block-name]')?.dataset.blockName || 'default-content',
    });
  });
}

/**
 * Google Consent Mode state for the banner's choice.
 * @param {{analytics: boolean, targeting: boolean}} consent the visitor's choice
 * @returns {object} Google consent types
 */
export function googleConsent({ analytics, targeting }) {
  const state = (on) => (on ? 'granted' : 'denied');
  return {
    analytics_storage: state(analytics),
    ad_storage: state(targeting),
    ad_user_data: state(targeting),
    ad_personalization: state(targeting),
    personalization_storage: state(targeting),
    functionality_storage: 'granted',
    security_storage: 'granted',
  };
}

/**
 * Sets up GA4 for a visitor who accepted analytics and loads it (eager phase).
 * Safe to call more than once.
 * @param {{analytics: boolean, targeting: boolean}} consent the visitor's choice
 * @returns {Promise<boolean>} whether Google runs on this page view
 */
export async function startGtm(consent) {
  if (!CONFIGURED || !consent?.analytics) return false;
  allowed = true;
  if (!gtm) {
    gtm = new GtmMartech({
      tags: TAGS,
      containers: CONTAINERS,
    });
    // The plugin defaults consent to denied; the visitor already chose, so update it before
    // GA4 loads and sends the first page_view.
    gtm.updateUserConsent(googleConsent(consent));
    onTrackEvent(({ event, ...params }) => {
      if (!allowed) return;
      // GA4 asks to clear the previous ecommerce object so values don't carry over
      if (params.ecommerce) gtm.pushToDataLayer({ ecommerce: null });
      gtm.pushToDataLayer({ event, ...params });
    });
    trackCtaClicks();
  }
  if (!done.has('eager')) {
    done.add('eager');
    await gtm.eager();
  }
  return true;
}

async function runPhase(phase) {
  if (!gtm || done.has(phase)) return;
  done.add(phase);
  await gtm[phase]();
}

/** Loads the lazy GTM containers (after the page's sections). */
export const gtmLazy = () => runPhase('lazy');

/** Loads the delayed GTM containers (third-party tags). */
export const gtmDelayed = () => runPhase('delayed');

/**
 * Passes a changed banner choice to Google.
 * @param {{analytics: boolean, targeting: boolean}} consent the visitor's choice
 */
export function updateGtmConsent(consent) {
  allowed = !!consent.analytics;
  gtm?.updateUserConsent(googleConsent(consent));
}
