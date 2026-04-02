import {
  buildBlock,
  decorateBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  sampleRUM,
  loadCSS,
  loadScript,
  getMetadata,
  toCamelCase,
  toClassName,
} from './aem.js';
import { getAllMetadata } from './shared.js';
import dynamicBlocks from '../blocks/dynamic/index.js';

const AUDIENCES = {
  mobile: () => window.innerWidth < 600,
  desktop: () => window.innerWidth >= 600,
};

function getExperimentationContext() {
  return {
    getAllMetadata, getMetadata, loadCSS, loadScript, sampleRUM, toCamelCase, toClassName,
  };
}

function isExperimentationEnabled() {
  return getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length;
}

const THEME_STORAGE_KEY = 'demo-theme';

function applyTheme(theme) {
  let t = theme ?? (() => { try { return localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { return null; } })();
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
  document.body.classList.remove('light-scheme', 'dark-scheme');
  document.body.classList.add(`${t}-scheme`);
}

const isYoutubeLink = (url) => ['youtube.com', 'www.youtube.com', 'youtu.be'].includes(url.hostname);

function replaceParagraphWithBlock(link, block) {
  const parent = link.parentElement;
  if (parent?.tagName === 'P' && parent.children.length === 1) {
    parent.replaceWith(block);
  } else {
    link.replaceWith(block);
  }
}

function buildEmbedBlocks(main) {
  const youtubeVideos = main.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
  youtubeVideos.forEach((anchor) => {
    if (anchor.closest('.embed.block')) return;
    if (anchor.querySelector('.icon')) return;

    let url;
    try {
      url = new URL(anchor.href);
    } catch (e) {
      return;
    }
    if (!isYoutubeLink(url)) return;

    const block = buildBlock('embed', [[anchor.cloneNode(true)]]);
    replaceParagraphWithBlock(anchor, block);
    decorateBlock(block);
  });
}

async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/** Hash that opts out of fragment auto-blocking (do not block). Links with #_dnb stay as normal links. */
const DNB_HASH = '#_dnb';

async function loadFragments(section) {
  const main = section.closest('main');
  const links = [...section.querySelectorAll('a[href*="/fragments/"]')]
    .filter((a) => !a.closest('.fragment'));
  const fragments = links.filter((a) => {
    if (a.href.includes(DNB_HASH)) {
      a.href = a.href.replace(DNB_HASH, '').replace(/#$/, '');
      return false;
    }
    return true;
  });
  if (fragments.length === 0) return;
  const { loadFragment } = await import('../blocks/fragment/fragment.js');
  await Promise.all(fragments.map(async (a) => {
    try {
      const { pathname } = new URL(a.href);
      const frag = await loadFragment(pathname);
      a.parentElement.replaceWith(...frag.children);
    } catch (error) {
      console.error('Fragment loading failed', error);
    }
  }));
  await dynamicBlocks(main);
}

function buildAutoBlocks(main) {
  try {
    buildEmbedBlocks(main);
  } catch (error) {
    console.error('Auto Blocking failed', error);
  }
}

function loadErrorPage(main) {
  if (window.errorCode === '404') {
    const fragmentPath = '/fragments/404';
    const fragmentLink = document.createElement('a');
    fragmentLink.href = fragmentPath;
    fragmentLink.textContent = fragmentPath;
    const fragment = buildBlock('fragment', [[fragmentLink]]);
    const section = main.querySelector('.section');
    if (section) section.replaceChildren(fragment);
  }
}

/**
 * Inline SVG icons that need to inherit currentColor (e.g. logo).
 * Replaces <img src="…/icon.svg"> with the actual <svg> element
 * so CSS color and light-dark() work across themes.
 * @param {Element} scope element tree to search within
 */
async function inlineColorIcons(scope) {
  const icons = scope.querySelectorAll('.icon.icon-logo img[src$=".svg"]');
  icons.forEach(async (img) => {
    try {
      const resp = await fetch(img.src);
      if (!resp.ok) return;
      const text = await resp.text();
      const tmp = document.createElement('div');
      tmp.innerHTML = text;
      const svg = tmp.querySelector('svg');
      if (!svg) return;
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', img.alt || 'Logo');
      img.replaceWith(svg);
    } catch (e) { /* keep <img> fallback */ }
  });
}

export function decorateMain(main) {
  decorateButtons(main);
  decorateIcons(main);
  inlineColorIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

async function loadTemplate(main) {
  try {
    const template = getMetadata('template');
    if (template) {
      const mod = await import(`../templates/${template}/${template}.js`);
      loadCSS(`${window.hlx.codeBasePath}/templates/${template}/${template}.css`);
      if (mod.default) {
        await mod.default(main);
      }
    }
  } catch (error) {
     
    console.error('template loading failed', error);
  }
}

async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  applyTheme();
  const main = doc.querySelector('main');
  if (main) {
    if (window.isErrorPage) loadErrorPage(main);
    if (isExperimentationEnabled()) {
      const { loadEager: runEager } = await import('../plugins/experimentation/src/index.js');
      await runEager(document, { audiences: AUDIENCES }, getExperimentationContext());
    }
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), async (s) => {
      await waitForFirstImage(s);
      await loadFragments(s);
    });
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

async function loadLazy(doc) {
  const headerEl = doc.querySelector('header');
  const footerEl = doc.querySelector('footer');
  loadHeader(headerEl);
  const templateName = getMetadata('template');
  if (templateName) {
    await loadTemplate(doc, templateName);
  }

  const main = doc.querySelector('main');
  const { initContentProtection, applyContentProtection } = await import('./utils/gated-content.js');
  initContentProtection();
  const sections = main ? [...main.querySelectorAll('div.section')] : [];
  for (let i = 0; i < sections.length; i += 1) {
    await loadSection(sections[i], loadFragments);
    if (i === 0 && sampleRUM.enhance) sampleRUM.enhance();
  }
  await dynamicBlocks(main);
  applyContentProtection();

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(footerEl);

  /* Scroll reveal: sections below the viewport animate in as they enter */
  if (main && 'IntersectionObserver' in window) {
    const vH = window.innerHeight;
    const revealSections = [...main.querySelectorAll('.section')].filter((s) => {
      const { top } = s.getBoundingClientRect();
      return top > vH;
    });
    if (revealSections.length) {
      revealSections.forEach((s) => s.classList.add('will-reveal'));
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;
          target.classList.add('revealed');
          revealObserver.unobserve(target);
        });
      }, { rootMargin: '0px 0px -60px 0px' });
      revealSections.forEach((s) => revealObserver.observe(s));
    }
  }

  /* Header scroll shadow: add .scrolled class once user scrolls past nav height */
  const navWrapper = doc.querySelector('.nav-wrapper');
  if (navWrapper) {
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 64;
    const scrollObserver = new IntersectionObserver(
      ([entry]) => navWrapper.classList.toggle('scrolled', !entry.isIntersecting),
      { rootMargin: `-${navH}px 0px 0px 0px` },
    );
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;height:1px;width:1px;pointer-events:none;';
    doc.body.prepend(sentinel);
    scrollObserver.observe(sentinel);
  }

  /* inline logo SVGs in header/footer once they are decorated */
  const waitAndInline = (el) => {
    const observer = new MutationObserver(() => {
      if (el.querySelector('.icon.icon-logo img[src$=".svg"]')) {
        observer.disconnect();
        inlineColorIcons(el);
      }
    });
    observer.observe(el, { childList: true, subtree: true });
  };
  waitAndInline(headerEl);
  waitAndInline(footerEl);

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  if (isExperimentationEnabled()) {
    const { loadLazy: runLazy } = await import('../plugins/experimentation/src/index.js');
    await runLazy(document, { audiences: AUDIENCES }, getExperimentationContext());
  }

  const loadQuickEdit = async (...args) => {
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };

  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };

  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    // wait for sidekick to be loaded
    document.addEventListener('sidekick-ready', () => {
    // sidekick now loaded
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }
}

function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

/**
 * Called by aem-embed after decorateMain + block loading.
 * Runs project-specific post-decoration logic that would
 * normally happen in loadLazy (e.g. dynamic blocks).
 */
export async function decorateEmbed(main) {
  await dynamicBlocks(main);
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

// UE Editor support before page load
if (/\.(stage-ue|ue)\.da\.live$/.test(window.location.hostname)) {
  await import(`${window.hlx.codeBasePath}/ue/scripts/ue.js`).then(({ default: ue }) => ue());
}

if (!window.hlx?.suppressLoadPage) {
  loadPage();

  (async function loadDa() {
    const { searchParams } = new URL(window.location.href);
    if (searchParams.get('dapreview')) {
      import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));
    }
    if (searchParams.get('daexperiment')) {
      import('https://da.live/nx/public/plugins/exp/exp.js');
    }
  }());

  if (document.querySelector('aem-sidekick')) {
    import('./sidekick.js');
  } else {
    document.addEventListener('sidekick-ready', () => {
      import('./sidekick.js');
    }, { once: true });
  }

  window.addEventListener('aem-theme-change', (e) => {
    applyTheme(e.detail?.theme);
  });
}