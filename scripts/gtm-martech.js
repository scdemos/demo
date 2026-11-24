/*
 * Google Analytics 4 and Google Tag Manager through the aem-gtm-martech plugin, phased like the
 * page: GA4, then the first GTM container in the lazy phase (after the sections), third-party
 * containers in the delayed phase. https://www.aem.live/developer/gtm-martech-integration
 *
 * Only imported for a visitor who accepted analytics (scripts.js for a saved choice,
 * consented.js when they accept on this page view), so Google loads nothing for anyone else.
 */
import GtmMartech from '../plugins/gtm-martech/src/index.js';
import {
  blockNameOf, onTrackEvent, safeLabel, trackEvent,
} from './shared.js';

// GA4 measurement ID(s), loaded first, and GTM containers by phase. With none of
// them, Google stays off.
const TAGS = ['G-4JJTK5G07Z'];
const CONTAINERS = {
  lazy: ['GTM-5MWZL5HH'],
  delayed: [],
};
const DATA_LAYER = 'gtmDataLayer';
const CONFIGURED = TAGS.length > 0 || CONTAINERS.lazy.length > 0 || CONTAINERS.delayed.length > 0;

// URL parameters GA4 may see: campaign attribution only. Others (e.g. the booking form's
// email, phone and name prefill) can carry personal data.
const KEEP_PARAMS = /^(utm_\w+|gclid|gbraid|wbraid|dclid)$/;

/**
 * A URL without its hash and without parameters that aren't in KEEP_PARAMS.
 * @param {string} href
 * @returns {string}
 */
function cleanUrl(href) {
  if (!href) return '';
  try {
    const url = new URL(href);
    [...url.searchParams.keys()].forEach((k) => { if (!KEEP_PARAMS.test(k)) url.searchParams.delete(k); });
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

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
    trackEvent('cta_click', {
      link_text: safeLabel(link.textContent),
      link_url: `${link.origin}${link.pathname}`,
      block_name: blockNameOf(link),
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
 * Sets up GA4 for a visitor who accepted analytics and loads it (scripts.js calls it in the lazy
 * phase, so Google's library never competes with the first section).
 * Safe to call more than once.
 * @param {{analytics: boolean, targeting: boolean}} consent the visitor's choice
 * @returns {Promise<boolean>} whether Google runs on this page view
 */
export async function startGtm(consent) {
  if (!CONFIGURED || !consent?.analytics) return false;
  allowed = true;
  if (!gtm) {
    TAGS.forEach((id) => { window[`ga-disable-${id}`] = false; });
    // Every GA4 hit gets the cleaned page and referrer URLs, queued ahead of the plugin's config
    window[DATA_LAYER] = window[DATA_LAYER] || [];
    (function () { window[DATA_LAYER].push(arguments); }('set', {
      page_location: cleanUrl(window.location.href),
      page_referrer: cleanUrl(document.referrer),
    }));
    gtm = new GtmMartech({
      tags: TAGS,
      containers: CONTAINERS,
      dataLayerInstanceName: DATA_LAYER,
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
  // Google's own switch: stops GA4 (automatic events too) at once, before the page reloads
  TAGS.forEach((id) => { window[`ga-disable-${id}`] = !allowed; });
  gtm?.updateUserConsent(googleConsent(consent));
}
