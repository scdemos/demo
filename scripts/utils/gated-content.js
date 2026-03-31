import { createAuthToggle } from '../../blocks/auth-toggle/auth-toggle.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeViewRestriction(value) {
  const normalized = normalize(value);
  if (normalized === 'loggedin') return 'logged-in';
  if (normalized === 'loggedout') return 'logged-out';
  return normalized;
}

/**
 * Author/dev environments only; production gating is server-side (CDN Worker + Cloudflare Access headers).
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

/**
 * Page-level gate switch via page metadata: gated=true
 * @returns {boolean}
 */
function hasGatedContent() {
  const gatedMeta = document.querySelector('meta[name="gated"]');
  const gatedFlag = normalize(gatedMeta?.getAttribute('content')) === 'true';
  if (gatedFlag) return true;

  // Fallback: if authored restrictions exist, still apply local author gating.
  const hasSectionRestrictions = !!document.querySelector('main > .section[data-view]');
  const hasBlockRestrictions = !!document.querySelector('main .logged-in, main .logged-out');
  return hasSectionRestrictions || hasBlockRestrictions;
}

/**
 * @param {Element} section
 * @returns {string|null}
 */
function getSectionViewRestriction(section) {
  const view = normalizeViewRestriction(section.dataset.view);
  return view || null;
}

/**
 * @param {Element} section
 * @param {boolean} isAuthenticated
 * @param {Array<{element: Element}>} sectionsToRemove
 */
function processSectionViewRestriction(section, isAuthenticated, sectionsToRemove) {
  const viewRestriction = getSectionViewRestriction(section);
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
    getSectionViewRestriction(section) === null
  ));

  publicSections.forEach((section) => {
    checkBlockProtectionInSection(section, isAuthenticated);
  });
}

/**
 * Apply content protection in author/dev environments only.
 */
function applyContentProtection() {
  if (!isAuthorEnvironment() || !hasGatedContent()) return;

  const isAuthenticated = getAuthState();
  const sectionProtectionMetadata = checkSectionLevelProtection(isAuthenticated);
  applySectionLevelProtection(sectionProtectionMetadata, isAuthenticated);
}

async function createAuthorToggle() {
  if (!isAuthorEnvironment()) return undefined;
  return createAuthToggle();
}

/**
 * Initialize content protection + auth toggle.
 */
function initContentProtection() {
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
  applyContentProtection,
  initContentProtection,
};
