import { createAuthToggle } from '../../blocks/auth-toggle/auth-toggle.js';
import { isGatedPage } from '../shared.js';

/**
 * Mirrors `workers/cdn/handlers/gating.js` `audience()`.
 * @param {Element} section
 * @returns {'logged-in'|'logged-out'|null}
 */
function audience(section) {
  const a = String(section.dataset?.view || '').trim().toLowerCase();
  if (a === 'logged-in' || a === 'logged-out') return a;

  const meta = section.querySelector('.section-metadata');
  if (!meta) return null;
  const viewDiv = [...meta.querySelectorAll('div')].find(
    (div) => div.textContent.trim().toLowerCase() === 'view',
  );
  if (!viewDiv) return null;
  const v = String(viewDiv.nextElementSibling?.textContent || '').trim().toLowerCase();
  return v === 'logged-in' || v === 'logged-out' ? v : null;
}

/**
 * Author/dev environments only; production gating is server-side (CDN Worker + Cloudflare Access).
 * @returns {boolean}
 */
function isAuthorEnvironment() {
  const host = window.location.hostname;
  return host.includes('localhost')
    || host.includes('aem.page')
    || host.includes('aem.reviews')
    || host.endsWith('.ue.da.live')
    || host.endsWith('.stage-ue.da.live');
}

/**
 * @returns {boolean} true = authenticated, false = anonymous
 */
function getAuthState() {
  const authValue = new URLSearchParams(window.location.search).get('auth');
  return authValue === 'true';
}

/** @returns {boolean} */
function hasGatedContent() {
  return isGatedPage();
}

/**
 * @param {Element} section
 * @param {boolean} isAuthenticated
 * @param {Array<{element: Element}>} sectionsToRemove
 */
function processSectionViewRestriction(section, isAuthenticated, sectionsToRemove) {
  const viewRestriction = audience(section);
  const shouldRemove = (
    (!isAuthenticated && viewRestriction === 'logged-in')
    || (isAuthenticated && viewRestriction === 'logged-out')
  );

  if (shouldRemove && !sectionsToRemove.some((item) => item.element === section)) {
    sectionsToRemove.push({ element: section });
  }
}

/**
 * @param {boolean} isAuthenticated
 * @returns {{sectionsToRemove: Array<{element: Element}>}}
 */
function checkSectionLevelProtection(isAuthenticated) {
  const sectionsToRemove = [];
  const sections = document.querySelectorAll('main > div');
  sections.forEach((section) => {
    processSectionViewRestriction(section, isAuthenticated, sectionsToRemove);
  });
  return { sectionsToRemove };
}

/**
 * @param {Element} section
 * @param {boolean} isAuthenticated
 */
function checkBlockProtectionInSection(section, isAuthenticated) {
  const restrictedBlocks = section.querySelectorAll('.logged-in, .logged-out');
  restrictedBlocks.forEach((block) => {
    const hasLoggedIn = block.classList.contains('logged-in');
    const hasLoggedOut = block.classList.contains('logged-out');
    if ((!isAuthenticated && hasLoggedIn) || (isAuthenticated && hasLoggedOut)) {
      block.remove();
    }
  });
}

/**
 * @param {{sectionsToRemove: Array<{element: Element}>}} protectionMetadata
 * @param {boolean} isAuthenticated
 */
function applySectionLevelProtection(protectionMetadata, isAuthenticated) {
  protectionMetadata.sectionsToRemove.forEach((sectionData) => {
    sectionData.element.remove();
  });

  const remainingSections = document.querySelectorAll('main > div');
  const publicSections = Array.from(remainingSections).filter((section) => (
    audience(section) === null
  ));

  publicSections.forEach((section) => {
    checkBlockProtectionInSection(section, isAuthenticated);
  });
}

/**
 * Apply content protection in author/dev environments when the page is gated (`meta gated=true`).
 */
function applyContentProtection() {
  if (!isAuthorEnvironment() || !isGatedPage()) return;

  const isAuthenticated = getAuthState();
  const sectionProtectionMetadata = checkSectionLevelProtection(isAuthenticated);
  applySectionLevelProtection(sectionProtectionMetadata, isAuthenticated);
}

async function createAuthorToggle() {
  if (!isAuthorEnvironment() || !isGatedPage()) return undefined;
  return createAuthToggle();
}

/**
 * Register author-only gated preview (protection + floating toggle). No-op if not gated or not author env.
 */
function initContentProtection() {
  if (!isAuthorEnvironment() || !isGatedPage()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      applyContentProtection();
      await createAuthorToggle();
    }, { once: true });
    return;
  }

  applyContentProtection();
  createAuthorToggle();
}

export {
  isAuthorEnvironment,
  getAuthState,
  hasGatedContent,
  isGatedPage,
  applyContentProtection,
  initContentProtection,
};
