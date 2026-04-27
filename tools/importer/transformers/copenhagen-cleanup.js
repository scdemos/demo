/* eslint-disable */
/* global WebImporter */

const H = { before: 'beforeTransform', after: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === H.before) {
    WebImporter.DOMUtils.remove(element, [
      '#onetrust-consent-sdk',
      '[class*="onetrust"]',
      '.doj-component',
      '.sgw-video',
      '.sgw-progress-wrap',
    ]);
  }

  if (hookName === H.after) {
    WebImporter.DOMUtils.remove(element, [
      '.template-header-wrapper',
      '.template-siteheader-wrapper',
      '.fixed-header-wrapper',
      '.gtc-sgw',
      '.global-navigation-component',
      'header',
      'nav',
      'footer',
      '.template-footer-wrapper',
      '.globalfooter-component',
      '.sortfiltercontainer',
      '.filter-wrapper',
      '.productAd',
      '.skip-nav-link-container',
      'iframe',
      'link',
      'noscript',
      'source',
    ]);
  }
}
