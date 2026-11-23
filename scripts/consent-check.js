/*
 * Cookie consent (delayed phase), following the boilerplate's consent gate:
 * https://www.aem.live/developer/cmp-integration
 *
 * Shows the CookieConsent banner (plugins/cookieconsent, MIT), tells the page about the
 * visitor's choice with a `consent.update` event and loads consented.js (martech, Launch, GA/GTM)
 * once analytics is accepted. Banner text comes from scripts/consent/{lang}.json.
 *
 * `?consent=accept` or `?consent=decline` skips the banner for one page view.
 */
import { loadCSS } from './aem.js';
import {
  CONSENT, createTag, getConsentOverride, getMarket,
} from './shared.js';

const BASE = window.hlx?.codeBasePath || '';
const DEFAULT_LANG = 'en';
const PREFERENCES_HASH = '#cookie-preferences';

// Cookies each category sets; they're deleted when the visitor rejects or withdraws it.
const CATEGORIES = {
  necessary: { enabled: true, readOnly: true },
  analytics: {
    autoClear: {
      cookies: [
        { name: /^AMCVS?_/ }, { name: /^kndctr_/ }, { name: /^s_/ }, { name: /^demdex/ },
        { name: /^_ga/ }, { name: /^_gid$/ },
      ],
    },
  },
  targeting: {
    autoClear: {
      cookies: [{ name: /^mbox/ }, { name: /^at_/ }, { name: /^_gcl_/ }],
    },
  },
};

let consented;

/**
 * Loads consented.js the first time analytics is accepted, and passes later changes to it.
 * @param {{analytics: boolean, targeting: boolean}} categories
 */
async function applyConsent(categories) {
  window.dispatchEvent(new CustomEvent('consent.update', {
    detail: { consented: categories.analytics, categories },
  }));
  if (consented) {
    await consented.updateConsent(categories);
  } else if (categories.analytics) {
    consented = await import('./consented.js');
    consented.startConsented(categories);
  }
}

/**
 * Banner text for the page language, falling back to the default language.
 * @returns {Promise<{lang: string, text: object}|null>}
 */
async function loadText() {
  const { lang } = getMarket();
  const fetchLang = async (l) => {
    const resp = await fetch(`${BASE}/scripts/consent/${l}.json`);
    return resp.ok ? { lang: l, text: await resp.json() } : null;
  };
  return (lang !== DEFAULT_LANG && await fetchLang(lang)) || fetchLang(DEFAULT_LANG);
}

/**
 * Lets visitors reopen their choice: authored links to #cookie-preferences, or else a
 * link added at the end of the footer once it has loaded.
 * @param {string} label link text
 * @param {Function} showPreferences opens the preferences dialog
 */
function addPreferencesLink(label, showPreferences) {
  const open = (e) => {
    e.preventDefault();
    showPreferences();
  };
  const wireAuthored = () => {
    const authored = document.querySelectorAll(`a[href$="${PREFERENCES_HASH}"]`);
    authored.forEach((a) => a.addEventListener('click', open));
    return authored.length > 0;
  };
  if (wireAuthored()) return;
  const footer = document.querySelector('footer');
  if (!footer) return;
  // the footer may still be loading: check it for an authored link before adding one
  const add = () => {
    if (wireAuthored() || !label) return;
    const button = createTag('button', { type: 'button', class: 'cookie-preferences-link' }, label);
    button.addEventListener('click', open);
    footer.append(createTag('p', { class: 'cookie-preferences' }, button));
  };
  const loaded = () => footer.querySelector('[data-block-status="loaded"]');
  if (loaded()) {
    add();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!loaded()) return;
    observer.disconnect();
    add();
  });
  observer.observe(footer, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['data-block-status'],
  });
}

async function initConsent() {
  const override = getConsentOverride();
  if (override) {
    await applyConsent(override);
    return;
  }

  const config = await loadText();
  if (!config) return;
  loadCSS(`${BASE}/plugins/cookieconsent/cookieconsent.css`);
  loadCSS(`${BASE}/styles/consent.css`);
  const CookieConsent = await import('../plugins/cookieconsent/cookieconsent.esm.js');

  const current = () => {
    const analytics = CookieConsent.acceptedCategory('analytics');
    // Target runs through Web SDK, which only sends data when analytics is accepted
    return { analytics, targeting: analytics && CookieConsent.acceptedCategory('targeting') };
  };

  await CookieConsent.run({
    revision: CONSENT.revision,
    cookie: { name: CONSENT.cookie },
    guiOptions: {
      // a bar across the bottom: the page stays usable without choosing
      consentModal: { layout: 'bar inline', position: 'bottom', equalWeightButtons: true },
      preferencesModal: { layout: 'box', equalWeightButtons: true },
    },
    categories: CATEGORIES,
    language: {
      default: config.lang,
      translations: { [config.lang]: config.text.banner },
    },
    onConsent: () => applyConsent(current()),
    onChange: async ({ changedCategories }) => {
      const withdrawn = changedCategories.filter((c) => !CookieConsent.acceptedCategory(c));
      // targeting needs analytics (see current()), so its cookies go with it
      if (withdrawn.includes('analytics') && !withdrawn.includes('targeting')) withdrawn.push('targeting');
      try {
        await applyConsent(current());
      } catch { /* the withdrawal below must happen regardless */ }
      if (!withdrawn.length) return;
      // Web SDK writes its cookies again when it records the withdrawal, so clear them after
      // it, then start over: scripts that already ran can't be unloaded.
      const names = withdrawn.flatMap((c) => (
        CATEGORIES[c]?.autoClear?.cookies || []).map(({ name }) => name));
      CookieConsent.eraseCookies(names);
      // Web SDK sets cookies on the widest domain it can (bbird.live on demo.bbird.live)
      const parts = window.location.hostname.split('.');
      parts.slice(1, -1).forEach((_, i) => {
        CookieConsent.eraseCookies(names, '/', parts.slice(i + 1).join('.'));
      });
      window.location.reload();
    },
  });

  // The bar covers the bottom of the page while it's open: room for it below the footer keeps
  // everything reachable (consent.css pads the page by this height while the bar shows).
  const bar = document.querySelector('#cc-main .cm');
  if (bar) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--consent-bar-height', `${bar.offsetHeight}px`);
    }).observe(bar);
  }

  addPreferencesLink(config.text.preferencesLink, CookieConsent.showPreferences);
}

initConsent();
