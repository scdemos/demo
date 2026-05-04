/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Paylocity site-wide cleanup.
 * All selectors verified against migration-work/cleaned.html (homepage DOM).
 *
 * Removes non-authorable content (forms, flyouts, separators, tracking widgets,
 * AEM grid wrappers, carousel controls) and cleans data attributes/inline styles.
 */
const H = { before: 'beforeTransform', after: 'afterTransform' };

/**
 * Clean Scene7 image URLs by removing query-string parameters
 * (timestamps, image presets, DPR flags) so they resolve cleanly.
 * Found in DOM: src="https://s7d9.scene7.com/is/image/paylocity/...?ts=...&$ProductTIleImage$&dpr=off"
 */
function cleanScene7Urls(element) {
  element.querySelectorAll('img[src*="s7d9.scene7.com"]').forEach((img) => {
    const src = img.getAttribute('src');
    if (src) {
      // Strip query string parameters (ts, $preset$, dpr) from Scene7 URLs
      const cleaned = src.split('?')[0];
      img.setAttribute('src', cleaned);
    }
  });
}

/**
 * Unwrap AEM Grid wrapper divs that add no semantic value.
 * Found in DOM: <div class="aem-Grid aem-Grid--12 aem-Grid--default--12">
 *               <div class="... aem-GridColumn aem-GridColumn--default--12">
 */
function unwrapAemGridDivs(element) {
  // Process innermost grids first by reversing the NodeList
  const grids = Array.from(element.querySelectorAll('.aem-Grid'));
  grids.reverse().forEach((grid) => {
    while (grid.firstChild) {
      grid.parentNode.insertBefore(grid.firstChild, grid);
    }
    grid.remove();
  });
}

/**
 * Remove all data-cmp-*, kameleoon*, and other tracking/authoring attributes.
 * Found in DOM: data-cmp-data-layer, data-cmp-clickable, data-cmp-dmimage,
 *               data-cmp-src, data-cmp-filereference, data-cmp-hook-image,
 *               data-cmp-hook-carousel, data-cmp-is, data-hover-enabled,
 *               data-placeholder-text, data-test, data-slide, data-ride,
 *               data-interval, data-pause, data-wrap, data-link-valid,
 *               data-dl_value, data-hs-embed, data-header-override,
 *               data-hs_form_id, data-hs_portal_id, data-hsfc-id,
 *               data-field-name, data-field-source, data-field-value,
 *               data-cmp-dest, data-align-image, data-dropdown-init,
 *               data-render-version, data-instance-id, data-form-id,
 *               data-portal-id, data-hublet, data-fetched, data-loaded,
 *               data-region, data-field-adjusted,
 *               kameleoonlistener-* (various suffixes like -34lc, -n6kl, etc.)
 */
function cleanAttributes(element) {
  element.querySelectorAll('*').forEach((el) => {
    const attrsToRemove = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const name = el.attributes[i].name;
      if (
        name.startsWith('data-cmp-')
        || name.startsWith('kameleoon')
        || name.startsWith('data-hs')
        || name.startsWith('data-hsfc')
        || name === 'data-hover-enabled'
        || name === 'data-placeholder-text'
        || name === 'data-test'
        || name === 'data-slide'
        || name === 'data-ride'
        || name === 'data-interval'
        || name === 'data-pause'
        || name === 'data-wrap'
        || name === 'data-link-valid'
        || name === 'data-dl_value'
        || name === 'data-header-override'
        || name === 'data-field-name'
        || name === 'data-field-source'
        || name === 'data-field-value'
        || name === 'data-align-image'
        || name === 'data-dropdown-init'
        || name === 'data-render-version'
        || name === 'data-instance-id'
        || name === 'data-form-id'
        || name === 'data-portal-id'
        || name === 'data-hublet'
        || name === 'data-fetched'
        || name === 'data-loaded'
        || name === 'data-region'
        || name === 'data-field-adjusted'
      ) {
        attrsToRemove.push(name);
      }
    }
    attrsToRemove.forEach((attr) => el.removeAttribute(attr));

    // Remove inline styles
    // Found in DOM: style="--bg-image-sm:url(...); --hover-color: #ED5807; margin: 0px..."
    if (el.hasAttribute('style')) {
      el.removeAttribute('style');
    }

    // Remove schema.org microdata attributes
    // Found in DOM: itemscope, itemtype="http://schema.org/ImageObject", itemprop="contentUrl"
    if (el.hasAttribute('itemscope')) el.removeAttribute('itemscope');
    if (el.hasAttribute('itemtype')) el.removeAttribute('itemtype');
    if (el.hasAttribute('itemprop')) el.removeAttribute('itemprop');
  });
}

/**
 * Remove duplicate responsive containers that show the same content
 * for different viewport sizes. These use pcty_d-md-none or pcty_d-none
 * classes to hide on certain breakpoints. We keep the desktop version.
 * Found in DOM: class="... pcty_d-md-none ..." (hidden on medium+)
 *               class="... pcty_d-none thick-red-dotted-border ..." (hidden always / debug)
 */
function removeDuplicateResponsiveContainers(element) {
  // Remove containers hidden on medium screens and up (mobile-only duplicates)
  // Found: <div class="container responsivegrid styleBGGraphite styleFloat_up_sm pb-5 pcty_d-md-none ...">
  element.querySelectorAll('[class*="pcty_d-md-none"]').forEach((el) => {
    el.remove();
  });

  // Remove debug/hidden containers with thick-red-dotted-border + pcty_d-none
  // Found: <div class="container responsivegrid styleBGCream styleLarge pt-3 pb-5 mb-4 pcty_d-none thick-red-dotted-border ...">
  element.querySelectorAll('[class*="thick-red-dotted-border"]').forEach((el) => {
    el.remove();
  });
}

export default function transform(hookName, element, payload) {
  if (hookName === H.before) {
    // ============================================================
    // BEFORE block parsing: remove elements that block/confuse parsing
    // ============================================================

    // Remove header/navigation/footer (handled by EDS header/footer blocks)
    WebImporter.DOMUtils.remove(element, [
      'header',
      'nav',
      'footer',
      '#mainNav',
      '.cmp-page__skiptomaincontent',
      '[role="navigation"]',
    ]);

    // Remove cookie consent, tracking pixels, GTM noscript
    WebImporter.DOMUtils.remove(element, [
      '.onetrust-consent-sdk',
      '#onetrust-consent-sdk',
      '[id*="onetrust"]',
      '[class*="optanon"]',
      'noscript',
      '[src*="googletagmanager"]',
      '[src*="facebook.com/tr"]',
      '[src*="bat.bing.com"]',
      '[src*="px.ads.linkedin"]',
      '[src*="analytics.o11"]',
    ]);

    // Remove featured message flyout popups (non-authorable overlay widgets)
    // Found in DOM: <div class="featuredmessageflyout image width-wide button-gradient ...">
    WebImporter.DOMUtils.remove(element, ['.featuredmessageflyout']);

    // Remove HubSpot embedded forms and their containers (non-authorable)
    // Found in DOM: <div class="hubspot-forms hubspot_theme--graphite ...">
    //               <div class="hs-form-html -loaded" ...>
    //               <div class="hubspot-cmp-wrapper" ...>
    WebImporter.DOMUtils.remove(element, [
      '.hubspot-forms',
      '.hs-form-html',
      '.hubspot-cmp-wrapper',
    ]);

    // Remove form tracking/override data containers
    // Found in DOM: <div class="form-storage-element" ...>
    //               <div class="form-partnerstack-element" ...>
    //               <div class="overrides"> ... <div class="override-item" ...>
    WebImporter.DOMUtils.remove(element, [
      '.form-storage-element',
      '.form-partnerstack-element',
      '.overrides',
    ]);

    // Remove duplicate responsive containers before parsing to avoid double content
    removeDuplicateResponsiveContainers(element);

    // Remove AEM separators (decorative dividers, not authorable)
    // Found in DOM: <div class="separator add-top-padding mt-1 mb-3"><div class="cmp-separator">
    WebImporter.DOMUtils.remove(element, ['.separator']);

    // Clean Scene7 image URLs (remove query-string noise)
    cleanScene7Urls(element);
  }

  if (hookName === H.after) {
    // ============================================================
    // AFTER block parsing: remove remaining non-authorable content
    // ============================================================

    // Remove carousel navigation controls (non-authorable UI elements)
    // Found in DOM: <div class="carousel-controls"> ... <a class="carousel-prev"> ...
    //               <ol class="carousel-indicators" ...>
    WebImporter.DOMUtils.remove(element, [
      '.carousel-controls',
      '.carousel-indicators',
    ]);

    // Remove social share popover widgets
    // Found in DOM: <div class="sharePopOver_container">
    WebImporter.DOMUtils.remove(element, ['.sharePopOver_container']);

    // Remove screen-reader-only spans (carousel slide labels, social media labels)
    // Found in DOM: <span class="sr-only">Previous slide</span>
    //               <span class="sr-only">Facebook</span>
    //               <h3 class="sr-only">Featured Message Flyout</h3>
    WebImporter.DOMUtils.remove(element, ['.sr-only']);

    // Remove modulepreload link elements (HubSpot script preloads)
    // Found in DOM: <link rel="modulepreload" crossorigin="" href="https://static.hsappstatic.net/...">
    WebImporter.DOMUtils.remove(element, ['link']);

    // Remove empty teaser action containers
    // Found in DOM: <div class="cmp-teaser__action-container"> (empty, just whitespace)
    element.querySelectorAll('.cmp-teaser__action-container').forEach((el) => {
      if (!el.textContent.trim()) {
        el.remove();
      }
    });

    // Unwrap AEM Grid wrapper divs (structural noise with no semantic value)
    unwrapAemGridDivs(element);

    // Clean all tracking/authoring attributes and inline styles
    cleanAttributes(element);

    // Fix protocol-relative URLs on links (//www.paylocity.com → https://www.paylocity.com)
    // Found in DOM: href="//www.paylocity.com/request-a-demo/"
    element.querySelectorAll('a[href^="//"]').forEach((a) => {
      a.setAttribute('href', 'https:' + a.getAttribute('href'));
    });
  }
}
