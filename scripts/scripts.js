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
  initMartech, martechEager, martechLazy, updateUserConsent,
} from '../plugins/martech/src/index.js';
import { getMarket, getStoredConsent, isGatedPage } from './shared.js';
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
      // only the site's own icons are inlined: an SVG from elsewhere could carry script
      if (new URL(img.src).origin !== window.location.origin) return;
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

// Blocks a Target offer brought in that are still loading. An offer is authored markup, so its
// blocks arrive undecorated: the observer below decorates them wherever an offer lands, and the
// martech plugin keeps a personalized section hidden until they are loaded
// (beforePersonalizedReveal), so an offer never shows half-decorated.
const offerBlockLoads = new Set();

/** Resolves when the blocks offers brought in so far are loaded. */
async function waitForOfferBlocks() {
  // let the observer pick up the offer's markup first
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await Promise.allSettled([...offerBlockLoads]);
}

/**
 * Decorates the blocks Target offers bring into the page once it has been decorated.
 * @param {Element} main the main element
 */
function decorateOfferBlocks(main) {
  const observer = new MutationObserver((mutations) => {
    const blocks = new Set();
    mutations.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      [node, ...node.querySelectorAll('div[class]')].forEach((el) => {
        // the martech plugin's own classes (martech-*) don't make a div a block
        if (el.tagName === 'DIV'
          && [...el.classList].some((c) => !c.startsWith('martech-'))
          && !el.classList.contains('block')
          && !isStructuralDiv(el)
          && !el.dataset.blockStatus
          && !el.closest('.block')) blocks.add(el);
      });
    }));
    if (!blocks.size) return;
    // stays connected: offers land over several mutation ticks
    blocks.forEach((block) => {
      const section = block.closest('.section');
      const sectionMeta = block.parentElement?.querySelector('div.section-metadata');
      if (section && sectionMeta) applySectionMetadata(section, sectionMeta);
      decorateBlock(block);
      decorateButtons(block);
      decorateIcons(block);
    });
    // a block that fails to load shouldn't keep its section hidden
    const loads = Promise.allSettled([...blocks].map((block) => loadBlock(block)));
    offerBlockLoads.add(loads);
    loads.finally(() => offerBlockLoads.delete(loads));
  });
  observer.observe(main, { childList: true, subtree: true });
}

let martechStarted = false;
// a saved choice that accepts analytics, so loadLazy starts Google
let gtmConsent = null;

/** Whether martech (Web SDK, data layer, Launch) runs on this page view. */
export function isMartechStarted() {
  return martechStarted;
}

/**
 * Starts martech for a visitor who accepted analytics. Only call it once per page view.
 * @param {{analytics: boolean, targeting: boolean}} consent the visitor's choice
 * @param {boolean} personalization whether Target personalizes this page
 * @returns {Promise<void>} resolves when Web SDK is set up
 */
export function startMartech(consent, personalization) {
  martechStarted = true;
  const ready = initMartech(
    {
      datastreamId: 'd73be188-bc37-4ede-a5da-8aa7cd1e343b',
      orgId: '138A07885EE042D20A495CFA@AdobeOrg',
      thirdPartyCookiesEnabled: false,
      // First-party Edge Network host (Adobe-managed certificate, CNAME to Adobe) so Adobe
      // cookies are set on bbird.live. Other hosts (aem.page/live) keep edge.adobedc.net,
      // where data.bbird.live would be third-party anyway.
      ...(window.location.hostname === 'demo.bbird.live' && { edgeDomain: 'data.bbird.live' }),
      edgeConfigOverrides: {
        com_adobe_target: {
          propertyToken: '2375354b-3ff1-6d5d-1304-7c38fccd590b',
        },
      },
    },
    {
      personalization,
      // personalized sections stay hidden, space reserved, until their offer is in place
      holdPersonalizedSections: true,
      beforePersonalizedReveal: waitForOfferBlocks,
      launchUrls: ['https://assets.adobedtm.com/ace20f3fb313/d4fa519d75cf/launch-452113bfea88.min.js'],
      // Decision scopes + selector mapping are auto-discovered from section-metadata
      // `mbox` rows (server-rendered as `data-mbox` attributes), so no hardcoded
      // config is needed here. See the plugins/martech README,
      // "Working with Form-Based Activities".
    },
  );
  // Web SDK starts with consent pending; this sets it before any event leaves the page.
  updateUserConsent({
    collect: consent.analytics,
    personalize: consent.targeting,
    marketing: consent.targeting,
    share: false,
  }).catch(() => { /* Web SDK reports its own errors */ });
  return ready;
}

/**
 * Product pages (/en/products/<id>). Edge Commerce renders them on aem.network and production hosts:
 * a first section with the name, price and images, then the product's description (a product-detail
 * block) and any page authored at the same path. That first section is folded into the block. Other
 * hosts (aem.page, aem.live, DA previews, the app) serve only the authored page, so the product is
 * loaded from Edge Commerce and the same block built here. Every demo shows the main demo's catalog.
 * See scripts/products.js.
 */
// Product descriptions come from Edge Commerce or the products sheet: only plain content markup is kept
const SAFE_TAGS = new Set(['DIV', 'P', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I',
  'U', 'S', 'SUB', 'SUP', 'BR', 'HR', 'SPAN', 'A', 'PICTURE', 'SOURCE', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR',
  'TH', 'TD', 'BLOCKQUOTE', 'CODE', 'PRE']);
const SAFE_ATTRS = new Set(['class', 'href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'type', 'media',
  'colspan', 'rowspan']);
const URL_ATTRS = new Set(['href', 'src', 'srcset']);
const safeUrl = (value) => !value.includes('\\') && /^(https?:\/\/|\/(?![/])|\.\/|#|mailto:|tel:)/i.test(value.trim());

function safeFragment(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  // children before parents, so removing an element never skips one
  [...tpl.content.querySelectorAll('*')].reverse().forEach((el) => {
    if (!SAFE_TAGS.has(el.tagName)) {
      el.remove();
      return;
    }
    // the description is one product-detail block: any other class could turn markup into another
    // block (a fragment, an icon) that loads content from elsewhere
    if (el.hasAttribute('class')) {
      if (el.classList.contains('product-detail')) el.setAttribute('class', 'product-detail');
      else el.removeAttribute('class');
    }
    [...el.attributes].forEach(({ name, value }) => {
      const urls = name === 'srcset' ? value.split(',').map((part) => part.trim().split(/\s+/)[0] || '') : [value];
      const keep = SAFE_ATTRS.has(name) && (!URL_ATTRS.has(name) || urls.every(safeUrl));
      if (!keep) el.removeAttribute(name);
    });
  });
  return tpl.content;
}

function productPicture({ url, label }) {
  const picture = document.createElement('picture');
  const src = (params) => {
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.href;
  };
  const source = document.createElement('source');
  source.type = 'image/webp';
  source.srcset = src({ width: 750, format: 'webply', optimize: 'medium' });
  const img = document.createElement('img');
  img.src = src({ width: 750, format: 'jpg', optimize: 'medium' });
  img.alt = label || '';
  picture.append(source, img);
  return picture;
}

function foldProductHero(hero, block) {
  const media = block.firstElementChild?.firstElementChild;
  const h1 = hero.querySelector('h1');
  if (media) hero.querySelectorAll('picture').forEach((picture) => media.append(picture));
  const h2 = block.querySelector('h2');
  if (h1 && h2) h2.replaceWith(h1);
  hero.remove();
}

/**
 * @param {Element} main
 * @param {URL|Location} [page] the page's address; an embed (aem-embed) passes the embedded page's
 */
export async function buildProductPage(main, page = window.location) {
  const { pathname } = page;
  if (!/^\/[a-z]{2}\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) return;
  const block = main.querySelector(':scope > div > .product-detail');
  const hero = main.querySelector(':scope > div:first-child');
  if (page === window.location && document.head.querySelector('meta[name="sku"]')) {
    if (block && hero?.querySelector(':scope > h1')) foldProductHero(hero, block);
    // a buy panel also authored on the page at the product's path: the product's own one is shown
    [...main.querySelectorAll(':scope > div > .product-detail')].slice(1).forEach((extra) => {
      const section = extra.parentElement;
      extra.remove();
      if (!section.children.length) section.remove();
    });
    return;
  }
  const { loadProduct } = await import('./products.js');
  const product = await loadProduct(pathname);
  if (!product) return; // not in the catalog: the page as authored
  // the catalog's buy panel replaces one authored on the page, as on Edge Commerce pages
  main.querySelectorAll(':scope > div > .product-detail').forEach((authored) => {
    const parent = authored.parentElement;
    authored.remove();
    if (!parent.children.length) parent.remove();
  });
  const section = document.createElement('div');
  section.append(safeFragment(product.description));
  const built = section.querySelector('.product-detail');
  if (!built) return;
  built.dataset.page = pathname;
  const top = document.createElement('div');
  const h1 = document.createElement('h1');
  h1.textContent = product.name;
  top.append(h1, ...(product.images || []).map(productPicture));
  main.prepend(top, section);
  foldProductHero(top, built);
  if (page === window.location && !document.title.trim()) document.title = product.name;
}

async function loadEager(doc) {
  document.documentElement.lang = getMarket().lang;
  decorateTemplateAndTheme();
  applyTheme();

  // Martech only runs with consent. A returning visitor who accepted analytics gets it here,
  // so Target can personalize before the first paint; everyone else waits for the banner
  // (consent-check.js), which starts martech from consented.js once they accept.
  const consent = IS_EDITOR ? null : getStoredConsent();
  const personalizationEnabled = !!getMetadata('target') && !!consent?.targeting;
  const martechLoadedPromise = consent?.analytics && startMartech(consent, personalizationEnabled);
  // Google runs on the same choice, from loadLazy; see gtm-martech.js
  if (consent?.analytics) gtmConsent = consent;

  const main = doc.querySelector('main');
  if (main) {
    await runExperimentation(doc, EXPERIMENTATION_CONFIG);
    await buildProductPage(main);
    decorateMain(main);
    // Target offers can bring in block markup after the page was decorated
    if (personalizationEnabled && !IS_EDITOR) decorateOfferBlocks(main);
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
  // a failed Adobe phase must not stop Google or the rest of the page
  if (martechStarted) await martechLazy().catch(() => {});
  // GA4, then the lazy GTM containers; awaited on its own, after the sections
  if (gtmConsent) {
    try {
      const gtm = await import('./gtm-martech.js');
      if (await gtm.startGtm(gtmConsent)) await gtm.gtmLazy();
    } catch { /* a failed tag must not stop the rest of the page */ }
  }

  if (!IS_EDITOR && getMetadata('site-gate')) {
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
    // consent banner; martech and other consent-dependent code load from consented.js
    if (!IS_EDITOR) import('./consent-check.js');
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
