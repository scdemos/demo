/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Fortinet site-wide cleanup.
 * Removes non-authorable content from the Fortinet homepage.
 * All selectors verified against migration-work/cleaned.html.
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // Remove cookie consent banner (aside.dg-consent-banner at line 4758)
    // Remove chat widget text bubble (#sf-chat-text-bubble at line 4765)
    // Remove Salesforce embedded messaging chat (#embedded-messaging at line 4777)
    // Remove tracking beacon divs ([id^="batBeacon"] at line 4769)
    WebImporter.DOMUtils.remove(element, [
      'aside.dg-consent-banner',
      '#sf-chat-text-bubble',
      '#embedded-messaging',
      '[id^="batBeacon"]',
    ]);
  }

  if (hookName === TransformHook.afterTransform) {
    // Remove main navigation container (.main-nav.experiencefragment at line 2)
    // Remove footer container (.footer-nav.experiencefragment at line 3986)
    // Remove empty CSS/JS component shells (.C991-CSS-JS at lines 2731, 3161)
    // Remove nav overlay background (.disable-background at line 2723)
    // Remove iframes (tracking/chat at lines 4760, 4775)
    WebImporter.DOMUtils.remove(element, [
      '.main-nav.experiencefragment',
      '.footer-nav.experiencefragment',
      '.C991-CSS-JS',
      '.disable-background',
      'iframe',
    ]);
  }
}
