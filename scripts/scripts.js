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
  loadBlock,
  readBlockConfig,
  sampleRUM,
  loadCSS,
  loadScript,
  getMetadata,
  toCamelCase,
  toClassName,
} from './aem.js';
import {
  initMartech, martechEager, martechLazy, martechDelayed,
} from '../plugins/martech/src/index.js';
import { getAllMetadata, getLocale, isUE } from './shared.js';
import { initPageSchemas } from './schema.js';
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
      const { pathname, hash } = new URL(a.href);
      const frag = await loadFragment(`${pathname}${hash}`);
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
  if (document.contains(main)) initPageSchemas();
}

/**
 * Add a "copy" button to every <pre><code> block in `main`. The EDS html
 * pipeline renders fenced code blocks as <pre><code>…</code></pre>, so this
 * works for any authored code snippet across the site.
 *
 * Idempotent: skips blocks that have already been decorated.
 */
function decorateCodeBlocks(main) {
  if (!main || !navigator.clipboard) return;
  const blocks = main.querySelectorAll('pre:has(> code)');
  blocks.forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-block')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-block-copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');
    button.innerHTML = `
      <span class="code-block-copy-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2"/>
          <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
        </svg>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5 13 10 18 19 7"/>
        </svg>
      </span>
      <span class="code-block-copy-label">Copy</span>
    `;
    wrapper.append(button);

    let resetTimer = null;
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent || '');
        button.classList.add('is-copied');
        button.querySelector('.code-block-copy-label').textContent = 'Copied';
        button.setAttribute('aria-label', 'Code copied to clipboard');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          button.classList.remove('is-copied');
          button.querySelector('.code-block-copy-label').textContent = 'Copy';
          button.setAttribute('aria-label', 'Copy code to clipboard');
        }, 2000);
      } catch (e) {
        // Clipboard access can be blocked (insecure context, permission denied).
        // Silently no-op — the button just doesn't update.
      }
    });
  });
}

async function loadTemplate(main, template) {
  try {
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

// Structural EDS wrappers a Target offer can inject (e.g. a replaceHtml offer that brings in a
// whole authored section). These are decorated by the section pipeline, not as blocks — calling
// decorateBlock/loadBlock on them would try to load a non-existent block named after the wrapper.
const isStructuralDiv = (el) => el.classList.contains('section')
  || el.classList.contains('section-metadata')
  || [...el.classList].some((c) => c.endsWith('-wrapper') || c.endsWith('-container'));

function watchForTargetInjectedBlocks(main) {
  const observer = new MutationObserver((mutations) => {
    const toDecorate = new Set();

    mutations.forEach(({ addedNodes }) => {
      addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        [node, ...node.querySelectorAll('div[class]')].forEach((el) => {
          if (
            el.tagName === 'DIV'
            && el.classList.length > 0
            && !el.classList.contains('block')
            && !isStructuralDiv(el)
            && !el.dataset.blockStatus
            && !el.closest('.block')
          ) {
            toDecorate.add(el);
          }
        });
      });
    });

    if (!toDecorate.size) return;

    // Stay connected: Target/alloy apply offers across multiple mutation ticks, so disconnecting
    // after the first batch would leave later-injected blocks undecorated. Already-decorated
    // blocks are skipped above via the `block` class / `data-block-status` guards.

    toDecorate.forEach((block) => {
      const wrapper = block.parentElement;
      const sectionMeta = wrapper?.querySelector('div.section-metadata');
      if (sectionMeta) {
        const section = block.closest('.section');
        if (section) {
          const meta = readBlockConfig(sectionMeta);
          Object.keys(meta).forEach((key) => {
            if (key === 'style') {
              meta.style.split(',').map((s) => toClassName(s.trim())).filter(Boolean)
                .forEach((s) => section.classList.add(s));
            } else {
              section.dataset[toCamelCase(key)] = meta[key];
            }
          });
          sectionMeta.remove();
        }
      }
    });

    [...toDecorate].forEach((block) => {
      decorateBlock(block);
      decorateButtons(block);
      decorateIcons(block);
    });
    Promise.all([...toDecorate].map((block) => loadBlock(block)))
      .catch(() => { /* a failed block load shouldn't break the page */ });
  });

  observer.observe(main, { childList: true, subtree: true });
}


async function loadEager(doc) {
  getLocale();
  decorateTemplateAndTheme();
  applyTheme();

  // Consent stub — wire to real CMP later; true for demo
  const isConsentGiven = true;
  const personalizationEnabled = !!getMetadata('target') && isConsentGiven;

  const martechLoadedPromise = !IS_EDITOR && initMartech(
    {
      datastreamId: 'd73be188-bc37-4ede-a5da-8aa7cd1e343b',
      orgId: '138A07885EE042D20A495CFA@AdobeOrg',
      defaultConsent: 'in',
      edgeConfigOverrides: {
        com_adobe_target: {
          propertyToken: '2375354b-3ff1-6d5d-1304-7c38fccd590b',
        },
      },
    },
    {
      personalization: personalizationEnabled,
      launchUrls: ['https://assets.adobedtm.com/ace20f3fb313/d4fa519d75cf/launch-452113bfea88.min.js'],
      // Decision scopes + selector mapping are auto-discovered from section-metadata
      // `mbox` rows (server-rendered as `data-mbox` attributes), so no hardcoded
      // config is needed here. See the plugins/martech README,
      // "Working with Form-Based Activities".
    },
  );

  const main = doc.querySelector('main');
  if (main) {
    if (window.isErrorPage) loadErrorPage(main);
    if (isExperimentationEnabled()) {
      const { loadEager: runEager } = await import('../plugins/experimentation/src/index.js');
      await runEager(document, { audiences: AUDIENCES }, getExperimentationContext());
    }
    decorateMain(main);
    // Re-decorate EDS block markup that a Target offer injects after decoration has
    // already run (e.g. a replaceHtml offer that brings in authored block HTML). Started
    // before martechEager applies propositions so the observer is live when offers land.
    if (personalizationEnabled && !IS_EDITOR) watchForTargetInjectedBlocks(main);
    document.body.classList.add('appear');
    await Promise.all([
      martechLoadedPromise && martechLoadedPromise.then(martechEager),
      loadSection(main.querySelector('.section'), async (s) => {
        await waitForFirstImage(s);
        await loadFragments(s);
      }),
    ]);
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
    document.body.classList.add(templateName);
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
  decorateCodeBlocks(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(footerEl);
  if (!IS_EDITOR) await martechLazy();

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

const IS_QUICK_EDIT = new URL(window.location.href).searchParams.has('quick-edit');
if (IS_QUICK_EDIT) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());

// Authoring surfaces (Sidekick quick-edit + Universal Editor). Martech (tracking +
// personalization) is bypassed entirely here so offers never mutate the DOM while authoring
// and the Target-injected-block observer can't fight UE/quick-edit DOM changes.
const IS_EDITOR = IS_QUICK_EDIT || isUE();

function loadDelayed() {
  window.setTimeout(() => {
    if (!IS_EDITOR) martechDelayed();
    import('./delayed.js');
  }, 3000);
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
