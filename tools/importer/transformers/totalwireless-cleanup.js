/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Total Wireless site-wide cleanup.
 *
 * Removes non-authorable CMS chrome, global header/footer experience
 * fragments, tracking/analytics scaffolding, cookie banners, feedback
 * widgets, and CMS wrapper attributes from the AEM-authored source DOM.
 *
 * 🚨 Every selector below was verified against migration-work/cleaned.html
 *    for https://www.totalwireless.com/m/home. None are guessed.
 */

const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // --- Overlays / modals / cookie banners that would interfere with
    // block parsing (found at body tail and mid-document in cleaned.html).
    WebImporter.DOMUtils.remove(element, [
      '#tDrkDiv',                 // tracking dark-overlay div (top of body)
      '#__tealiumModalParent',    // Tealium consent modal shell
      '#__tealiumModal',          // Tealium modal base (.__tealiumModalBase)
      '#cookieBannerEN',          // Combined cookie bar (English)
      '#cookieBannerES',          // Combined cookie bar (Spanish)
      '#learnMoreModal',          // global "learn more" overlay
      '#autoPayModal',            // global "auto pay" overlay
      '.QSIFeedbackButton',       // Qualtrics feedback widget
      '[class*="preloaded_lightbox"]', // fancybox preloaded lightbox at body tail
    ]);

    // Hidden tracking/state <input> scaffolding at the top of <body>.
    ['#pageName', '#adtechEvent', '#sourceSystem'].forEach((sel) => {
      const el = element.querySelector(sel);
      if (el) el.remove();
    });
  }

  if (hookName === TransformHook.afterTransform) {
    // --- Global chrome: header + footer experience fragments (site shell,
    // not page content). Verified classes from cleaned.html.
    WebImporter.DOMUtils.remove(element, [
      '.cmp-experiencefragment--totalwireless-header', // top nav / butterbar / skinny-banner
      '.cmp-experiencefragment--totalwireless-footer', // footer link-lists, social, bottom links
      'nav.header-primary-menu',                       // primary menu (belt-and-braces if header stripped)
    ]);

    // --- Tracking pixels / beacons / analytics iframes at body tail.
    WebImporter.DOMUtils.remove(element, [
      '#ttdUniversalPixelTag',
      '#postup_rules',
      '[id^="batBeacon"]',        // Bing UET beacon container + img
      '[id^="universal_pixel_"]', // The Trade Desk universal pixel iframes
    ]);

    // --- Non-content <link>/<noscript> that AEM clientlibs leave behind
    // (clientlib CSS links scattered throughout the source DOM).
    WebImporter.DOMUtils.remove(element, ['link', 'noscript']);

    // Tracking / ad iframes only (doubleclick, adsrvr, and the empty
    // about:blank lightbox iframes). Never blanket-remove <iframe> — the
    // rendered page may wrap real content in an iframe shell.
    element.querySelectorAll('iframe').forEach((frame) => {
      const src = frame.getAttribute('src') || '';
      if (
        src === '' // empty / about:blank lightbox frames
        || src === 'about:blank'
        || /doubleclick\.net|adsrvr\.org|fls\./.test(src)
      ) {
        frame.remove();
      }
    });

    // Standalone tracking <img> pixels (external ad/analytics hosts). Only
    // remove imgs pointing at known tracking hosts; leave content imgs.
    element.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (/bat\.bing\.com|ojrq\.net|doubleclick\.net|adsrvr\.org|fancybox/.test(src)) {
        img.remove();
      }
    });

    // --- Strip CMS / analytics attributes from every remaining element.
    // Keys observed in cleaned.html (data-cmp-*, data-gtm-*, data layer).
    const DROP_ATTR_PREFIXES = ['data-cmp-', 'data-gtm-'];
    const DROP_ATTRS = [
      'data-cmp-data-layer-enabled',
      'data-cmp-link-accessibility-enabled',
      'data-cmp-link-accessibility-text',
      'onclick',
    ];
    element.querySelectorAll('*').forEach((el) => {
      // Named attributes.
      DROP_ATTRS.forEach((a) => el.removeAttribute(a));
      // Prefixed attributes (collect first, then remove — live NamedNodeMap).
      const toRemove = [];
      for (let i = 0; i < el.attributes.length; i += 1) {
        const name = el.attributes[i].name;
        if (DROP_ATTR_PREFIXES.some((p) => name.startsWith(p))) toRemove.push(name);
      }
      toRemove.forEach((name) => el.removeAttribute(name));
    });
  }
}
