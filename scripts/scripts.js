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
  getMetadata,
  toCamelCase,
  toClassName,
} from './aem.js';
import {
  initMartech, martechEager, martechLazy, martechDelayed,
} from '../plugins/martech/src/index.js';
import { getMarket, isGatedPage } from './shared.js';
import { runExperimentation, runExperimentationLazy } from './experiment-loader.js';

const { searchParams } = new URL(window.location.href);
const IS_QUICK_EDIT = searchParams.has('quick-edit');
const DA_PREVIEW = !!searchParams.get('dapreview');
// DA preflight runs the site's own checks (scripts/preflight) on *.preview.da.live.
const IS_PREFLIGHT_HOST = window.location.hostname.endsWith('.preview.da.live');
let preflightSource = null;

// Authoring surfaces (Sidekick quick-edit + DA preview). Martech (tracking +
// personalization) is bypassed entirely here so offers never mutate the DOM while authoring
// and the Target-injected-block observer can't fight preview/quick-edit DOM changes.
const IS_EDITOR = IS_QUICK_EDIT || DA_PREVIEW;

async function dynamicBlocks(main) {
  const { default: run } = await import('../blocks/dynamic/index.js');
  await run(main);
}

// Experiments, audiences and campaigns (plugins/experimentation). Authors create and simulate
// experiments in Experience Workspace's Experimentation panel (scripts/sidekick.js), so the
// plugin's own simulation panel stays off: it would open on top of it on every ?experiment= link.
const EXPERIMENTATION_CONFIG = {
  simulationUI: false,
  isProd: () => {
    const { hostname } = window.location;
    return hostname !== 'localhost' && !hostname.endsWith('.page');
  },
  audiences: {
    mobile: () => window.innerWidth < 600,
    desktop: () => window.innerWidth >= 600,
  },
};

const THEME_STORAGE_KEY = 'demo-theme';

/**
 * Applies the colour theme: an explicit choice (persisted), else the stored one,
 * else the OS preference.
 * @param {'light'|'dark'} [theme]
 */
function applyTheme(theme) {
  let t = theme;
  try {
    if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme);
    else t = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (e) { /* storage unavailable */ }
  if (t !== 'light' && t !== 'dark') {
    // site default from metadata `color-scheme` (light | dark | auto); auto follows the OS
    const preferred = (document.querySelector('meta[name="color-scheme"]')?.content || 'auto').toLowerCase();
    if (preferred === 'light' || preferred === 'dark') t = preferred;
    else t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

/** Hash that opts a fragment link out of auto-blocking (it stays a normal link). */
const DNB_HASH = '#_dnb';

async function loadFragments(section) {
  const main = section.closest('main');
  // Gone already: the gated-content preview removes sections the current audience can't see.
  if (!main) return;
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

/**
 * Inline SVG icons that need to inherit currentColor (e.g. logo).
 * Replaces <img src="…/icon.svg"> with the actual <svg> element
 * so CSS color and light-dark() work across themes.
 * @param {Element} scope element tree to search within
 */
function inlineColorIcons(scope) {
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

/**
 * Default-content conventions for authors:
 * - a short line directly above an h1/h2 becomes an eyebrow
 * - consecutive button paragraphs are grouped into one row
 * @param {Element} main
 */
function decorateDefaultContent(main) {
  /* Eyebrow and heading move into a wrapper (layout view rebuilds authored text and drops
     classes added to it, so styles key off the wrapper). Split sections always get one. */
  main.querySelectorAll('.default-content-wrapper > :is(h1, h2)').forEach((h) => {
    const prev = h.previousElementSibling;
    const eyebrow = prev?.tagName === 'P' && !prev.classList.contains('button-container')
      && !prev.querySelector('picture, a') && prev.textContent.trim().length <= 60 ? prev : null;
    if (!eyebrow && !h.closest('.section.split')) return;
    const group = document.createElement('div');
    group.className = 'heading-group';
    h.before(group);
    if (eyebrow) {
      eyebrow.classList.add('eyebrow');
      group.append(eyebrow);
    }
    group.append(h);
  });
  main.querySelectorAll('.default-content-wrapper > p.button-container').forEach((p) => {
    if (p.parentElement.classList.contains('button-group')) return;
    const prev = p.previousElementSibling;
    if (prev?.classList.contains('button-group')) {
      prev.append(p);
      return;
    }
    if (p.nextElementSibling?.classList.contains('button-container')) {
      const group = document.createElement('div');
      group.className = 'button-group';
      p.before(group);
      group.append(p);
    }
  });
  /* split: heading group on the left, everything else of the first text block on the right */
  main.querySelectorAll('.section.split:not([data-layout]) > .default-content-wrapper:first-child').forEach((wrapper) => {
    const group = wrapper.querySelector(':scope > .heading-group');
    if (!group || wrapper.querySelector(':scope > .split-body')) return;
    const rest = [...wrapper.children].filter((el) => el !== group);
    if (!rest.length) return;
    const splitBody = document.createElement('div');
    splitBody.className = 'split-body';
    splitBody.append(...rest);
    wrapper.append(splitBody);
  });
}

/**
 * Breadcrumbs generated from the path for pages below a market root
 * (e.g. /en/offers/member-week). Opt out with metadata `breadcrumbs: off`.
 * @param {Element} main
 */
function buildBreadcrumbs(main) {
  if (getMetadata('breadcrumbs') === 'off' || document.querySelector('nav.breadcrumbs')) return;
  const { root, segments } = getMarket();
  if (!window.location.pathname.startsWith(root) || !segments.length) return;
  const nav = document.createElement('nav');
  nav.className = 'breadcrumbs';
  nav.setAttribute('aria-label', getMetadata('breadcrumbs-label') || 'Breadcrumb');
  const ol = document.createElement('ol');
  const crumb = (label, href) => {
    const li = document.createElement('li');
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      li.append(a);
    } else {
      li.setAttribute('aria-current', 'page');
      li.textContent = label;
    }
    ol.append(li);
  };
  const titleCase = (seg) => seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  crumb(getMetadata('breadcrumbs-home') || 'Home', root);
  const parent = getMetadata('breadcrumb-parent');
  if (parent) {
    const [label, href] = parent.split('|').map((v) => v.trim());
    crumb(label, href);
  } else {
    segments.slice(0, -1).forEach((seg, i) => crumb(titleCase(seg), `${root}${segments.slice(0, i + 1).join('/')}`));
  }
  const h1 = main.querySelector('h1')?.textContent.trim();
  crumb(getMetadata('breadcrumb-title') || h1 || titleCase(segments.at(-1)));
  nav.append(ol);
  main.before(nav);
}

/**
 * Applies a Section Metadata table to its section (Style → classes, other keys → data
 * attributes) and removes the table.
 * @param {Element} section
 * @param {Element} meta
 */
function applySectionMetadata(section, meta) {
  const cfg = readBlockConfig(meta);
  Object.keys(cfg).forEach((key) => {
    if (key === 'style') {
      String(cfg.style).split(',').map((s) => toClassName(s.trim())).filter(Boolean)
        .forEach((c) => section.classList.add(c));
    } else {
      section.dataset[toCamelCase(key)] = cfg[key];
    }
  });
  const wrapper = meta.parentElement;
  meta.remove();
  if (wrapper && wrapper !== section && !wrapper.children.length) wrapper.remove();
}

/** @param {Element} main */
function decorateSectionMetadata(main) {
  main.querySelectorAll(':scope > div.section div.section-metadata').forEach((meta) => {
    applySectionMetadata(meta.closest('.section'), meta);
  });
}

/**
 * Wraps bare content images in <picture>. Images that are not in the media bus
 * (e.g. local content/ previews) are rendered without one, but blocks expect it.
 * @param {Element} main
 */
function wrapBareImages(main) {
  main.querySelectorAll('img').forEach((img) => {
    if (img.closest('picture, .icon')) return;
    const picture = document.createElement('picture');
    img.replaceWith(picture);
    picture.append(img);
  });
}

/**
 * Section columns from section metadata, as in the FIRE demo:
 * - Layout: column widths, e.g. "60-40", "50-50", "33-33-33" (relative, any numbers).
 * - Arrange: how many items go in each column, e.g. "1-2". An item is a block or a run of
 *   text between blocks. Without Arrange each column gets one item.
 * Items after the arranged ones stay below the columns. Layout replaces Style split.
 * Wrappers are moved, never copied, so the section stays editable in layout view.
 * Columns stack below 900px.
 * @param {Element} main
 */
function decorateSectionLayouts(main) {
  main.querySelectorAll(':scope > .section[data-layout]').forEach((section) => {
    if (section.querySelector(':scope > .section-layout')) return;
    const nums = (value) => String(value || '').split(/[^\d.]+/).map(Number).filter((n) => n > 0);
    const widths = nums(section.dataset.layout);
    if (widths.length < 2) return;
    const counts = nums(section.dataset.arrange).map(Math.round);
    const perColumn = counts.length === widths.length ? counts : widths.map(() => 1);
    const items = [...section.children];
    if (!items.length) return;
    const layout = document.createElement('div');
    layout.className = 'section-layout';
    const total = widths.reduce((sum, w) => sum + w, 0);
    const tracks = widths.map((w) => `${Math.round((w / total) * 10000) / 100}fr`);
    layout.style.setProperty('--section-layout-columns', tracks.join(' '));
    items[0].before(layout);
    let next = 0;
    perColumn.forEach((count) => {
      const column = document.createElement('div');
      column.className = 'section-layout-column';
      column.append(...items.slice(next, next + count));
      next += count;
      layout.append(column);
    });
    // Layout replaces the split style's own two-column arrangement
    section.classList.remove('split');
    section.classList.add('has-layout');
  });
}

export function decorateMain(main) {
  wrapBareImages(main);
  decorateButtons(main);
  decorateIcons(main);
  inlineColorIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionMetadata(main);
  decorateBlocks(main);
  decorateDefaultContent(main);
  decorateSectionLayouts(main);
  if (document.contains(main)) buildBreadcrumbs(main);
  // Collect the links now: a fragment's sections move into the page before the import resolves.
  const authLinks = main.querySelectorAll('a[href*="/auth/log"]');
  if (authLinks.length) {
    import('./shared/auth-api.js').then(({ decorateAuthLinks }) => decorateAuthLinks(authLinks));
  }
  if (IS_PREFLIGHT_HOST && document.contains(main)) preflightSource = main.cloneNode(true);
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
      const section = block.closest('.section');
      const sectionMeta = block.parentElement?.querySelector('div.section-metadata');
      if (section && sectionMeta) applySectionMetadata(section, sectionMeta);
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
  document.documentElement.lang = getMarket().lang;
  decorateTemplateAndTheme();
  applyTheme();

  // Demo site: consent is assumed; wire a real CMP here when needed.
  const personalizationEnabled = !!getMetadata('target');

  const martechLoadedPromise = !IS_EDITOR && initMartech(
    {
      datastreamId: 'd73be188-bc37-4ede-a5da-8aa7cd1e343b',
      orgId: '138A07885EE042D20A495CFA@AdobeOrg',
      defaultConsent: 'in',
      thirdPartyCookiesEnabled: false,
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
    await runExperimentation(doc, EXPERIMENTATION_CONFIG);
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
  const gated = isGatedPage() && await import('./utils/gated-content.js');
  if (gated) gated.initContentProtection();
  const sections = main ? [...main.querySelectorAll('div.section')] : [];
  for (let i = 0; i < sections.length; i += 1) {
    // The gated-content preview may remove sections while this loop runs.
    if (!sections[i].isConnected) continue;
    await loadSection(sections[i], loadFragments);
    if (i === 0 && sampleRUM.enhance) sampleRUM.enhance();
  }
  await dynamicBlocks(main);
  if (gated) gated.applyContentProtection();
  decorateCodeBlocks(main);
  import('./schema.js').then(({ initPageSchemas }) => initPageSchemas());

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(footerEl);
  if (!IS_EDITOR) await martechLazy();

  if (!IS_EDITOR && (getMetadata('site-gate') || getMetadata('consent'))) {
    loadCSS(`${window.hlx.codeBasePath}/styles/notices.css`);
    import('./notices.js').then(({ default: loadSiteNotices }) => loadSiteNotices());
  }

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

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  await runExperimentationLazy(doc, EXPERIMENTATION_CONFIG);
}

const loadQuickEdit = async (...args) => {
  const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
  initQuickEdit(...args);
};

/** Wires Sidekick-dependent features once the Sidekick is (or becomes) available. */
function initSidekick() {
  const init = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
    import('./sidekick.js');
  };
  const sk = document.querySelector('aem-sidekick');
  if (sk) init(sk);
  else document.addEventListener('sidekick-ready', () => init(document.querySelector('aem-sidekick')), { once: true });
}

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

let resolvePageLoaded;
const pageLoaded = new Promise((resolve) => { resolvePageLoaded = resolve; });

function registerPreflight() {
  window.aem = window.aem || {};
  window.aem.preflight = async () => {
    await pageLoaded;
    const { default: preflight } = await import('./preflight/preflight.js');
    return preflight(document, preflightSource);
  };
}

export async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  resolvePageLoaded();
  loadDelayed();
}

if (!window.hlx?.suppressLoadPage) {
  if (IS_PREFLIGHT_HOST) registerPreflight();
  loadPage();
  initSidekick();
  if (IS_QUICK_EDIT) loadQuickEdit();
  if (DA_PREVIEW) {
    import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));
  }
  if (searchParams.get('daexperiment')) import('https://da.live/nx/public/plugins/exp/exp.js');

  window.addEventListener('aem-theme-change', (e) => {
    applyTheme(e.detail?.theme);
  });
}
