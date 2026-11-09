import { getMetadata, readBlockConfig } from '../../scripts/aem.js';
import { createTag, getMarket } from '../../scripts/shared.js';

/** Sign-in authored as an /auth/login link toggles login/logout from the Access session. */
async function wireAuth(links) {
  const {
    getLoginUrl, getLogoutUrl, getDefaultAuthLabel, getSessionState,
  } = await import('../../scripts/shared/auth-api.js');
  const session = await getSessionState();
  const signedIn = Boolean(session?.authenticated);
  const label = getDefaultAuthLabel(signedIn ? 'logout' : 'login');
  links.forEach((link) => {
    link.href = signedIn ? getLogoutUrl() : getLoginUrl();
    link.title = signedIn && session.email ? `${label} (${session.email})` : label;
    link.classList.toggle('is-signed-in', signedIn);
    (link.querySelector('.header-signin-label') || link).textContent = label;
  });
}

const ICON_PATHS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.3-4 4.3-6 8-6s6.7 2 8 6"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.8h.01M11.5 16v-5.5M11.5 13c0-1.5 1-2.6 2.4-2.6s2.1 1 2.1 2.6V16"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.2 5 2.8-5 2.8Z"/>',
  link: '<path d="M7 17 17 7M8 7h9v9"/>',
};

export const LOGO_MARK = '<svg class="header-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M11.5 23V9h10" stroke="var(--color-bg)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11.5 16h7.5" stroke="var(--flame-500, #e8471c)" stroke-width="3.6" stroke-linecap="round"/></svg>';

/**
 * Inline stroke icon (inherits currentColor).
 * @param {string} name
 * @param {string} [cls]
 * @returns {string}
 */
export function icon(name, cls = '') {
  return `<svg class="chrome-icon chrome-icon-${name} ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ICON_PATHS.link}</svg>`;
}

/**
 * Authored link as a site-relative path (or the full URL for external links).
 * @param {HTMLAnchorElement} a
 * @returns {string}
 */
export function authoredHref(a) {
  const raw = a.getAttribute('href') || '';
  try {
    const url = new URL(raw, window.location.href);
    const sameSite = url.origin === window.location.origin
      || /\.aem\.(page|live)$/.test(url.hostname);
    if (!sameSite) return url.href;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (e) {
    return raw;
  }
}

/**
 * Fetch a chrome document (nav/footer) as raw sections, without decorating it.
 * @param {string} name metadata key and default document name
 * @returns {Promise<HTMLElement[]>}
 */
export async function fetchChrome(name) {
  const meta = getMetadata(name);
  const path = meta ? new URL(meta, window.location).pathname : `${getMarket().root}${name}`;
  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = await resp.text();
  return [...wrapper.querySelectorAll(':scope > div')];
}

/**
 * Read an optional `Labels` table (two-column key/value) from a section.
 * @param {Element} section
 * @returns {Record<string,string>}
 */
export function readLabels(section) {
  const table = section?.querySelector(':scope > div.labels');
  if (!table) return {};
  const labels = readBlockConfig(table);
  table.remove();
  return labels;
}

const marketRoot = (path) => (path.match(/^.*?\/[a-z]{2}\/[a-z]{2}\//) || [])[0] || '';

/**
 * Market switcher (details/summary disclosure).
 * Switching keeps the equivalent page path in the target market when it exists.
 * @param {HTMLUListElement} list authored list of market links
 * @param {Record<string,string>} labels
 * @param {string} variant extra class
 * @returns {HTMLDetailsElement|null}
 */
export function buildMarketSwitcher(list, labels, variant = '') {
  if (!list) return null;
  const { root } = getMarket();
  const path = window.location.pathname;
  const markets = [...list.querySelectorAll('a')].map((a) => {
    const href = authoredHref(a);
    const mRoot = marketRoot(href);
    const [lang, region] = mRoot.split('/').filter(Boolean).slice(-2);
    return {
      label: a.textContent.trim(),
      href,
      root: mRoot,
      hreflang: lang ? `${lang}-${region.toUpperCase()}` : '',
      region: region || '',
    };
  });
  const current = markets.find((m) => m.root === root) || markets[0];
  if (!current) return null;

  const details = createTag('details', { class: `chrome-market ${variant}`.trim() });
  const summary = createTag('summary', { 'aria-label': `${labels.market || 'Market & language'}: ${current.label}` });
  summary.innerHTML = `${icon('globe')}<span class="chrome-market-code">${current.region.toUpperCase()}</span><span class="chrome-market-label">${current.label}</span>`;
  const ul = createTag('ul');
  markets.forEach((m) => {
    const li = createTag('li');
    if (m === current) {
      li.append(
        createTag('span', { lang: m.hreflang, 'aria-current': 'true' }, m.label),
        createTag('span', { class: 'chrome-market-badge' }, labels.current || 'Current'),
      );
    } else {
      const equivalent = m.root && path.startsWith(root) ? `${m.root}${path.slice(root.length)}` : m.href;
      const a = createTag('a', { href: equivalent, hreflang: m.hreflang, lang: m.hreflang }, m.label);
      a.addEventListener('click', async (e) => {
        if (equivalent === m.href || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        let target = m.href;
        try {
          const resp = await fetch(equivalent, { method: 'HEAD' });
          if (resp.ok) target = equivalent;
        } catch (err) { /* fall back to market home */ }
        window.location.href = target;
      });
      li.append(a);
    }
    ul.append(li);
  });
  details.append(summary, ul);

  document.addEventListener('click', (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  details.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && details.open) {
      details.open = false;
      summary.focus();
    }
  });
  return details;
}

/** Text of an element excluding its links and nested lists, without leading separators. */
function trailingText(li) {
  const clone = li.cloneNode(true);
  clone.querySelectorAll('a, ul, ol, strong:empty').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim().replace(/^[—–\-:·|]\s*/, '');
}

const PROMO_ART = ['horizon', 'split', 'rings', 'aurora', 'dots'];

function parseNav(section) {
  const top = section?.querySelector('ul');
  if (!top) return [];
  return [...top.children].map((li, i) => {
    const a = li.querySelector(':scope > a, :scope > p > a, :scope > strong > a');
    const label = a ? a.textContent.trim() : li.firstChild?.textContent.trim();
    const links = [];
    let promo = null;
    li.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach((sub) => {
      const link = sub.querySelector('a');
      if (!link) return;
      const item = {
        label: link.textContent.trim(), href: authoredHref(link), desc: trailingText(sub),
      };
      if (link.closest('strong')) promo = item;
      else links.push(item);
    });
    return {
      id: `${i}-${(label || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      href: a ? authoredHref(a) : '',
      intro: trailingText(li),
      links,
      promo,
      art: PROMO_ART[i % PROMO_ART.length],
    };
  });
}

function isActive(item) {
  const path = window.location.pathname;
  const { root } = getMarket();
  const prefixes = [item.href, ...item.links.map((l) => l.href)]
    .filter((p) => p && p.startsWith(root))
    .map((p) => {
      const seg = p.slice(root.length).split(/[/#?]/)[0];
      return seg ? `${root}${seg}` : '';
    })
    .filter(Boolean);
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

function buildAnnounce(section) {
  const p = section?.querySelector('p');
  if (!p) return null;
  const link = p.querySelector('a');
  const bar = createTag('div', { class: 'header-announce' });
  const content = p.cloneNode(true);
  const cta = content.querySelector('a');
  if (cta) {
    const span = createTag('span', { class: 'header-announce-cta' }, cta.textContent);
    span.insertAdjacentHTML('beforeend', ' <span aria-hidden="true">→</span>');
    cta.replaceWith(span);
  }
  const target = link ? createTag('a', { href: authoredHref(link) }) : createTag('p');
  target.append(...content.childNodes);
  bar.append(target);
  return bar;
}

function closeOnEscape(container, close, focusTarget) {
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    close();
    focusTarget.focus();
  });
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const sections = await fetchChrome('nav');
  const [announceSec, brandSec, navSec, toolsSec] = sections.length >= 4
    ? sections : [null, ...sections];
  const labels = readLabels(toolsSec);
  const items = parseNav(navSec);
  const primaryLabel = labels.primary || 'Primary';

  block.textContent = '';
  const wrapper = createTag('div', { class: 'nav-wrapper' });

  const announce = buildAnnounce(announceSec);
  if (announce) wrapper.append(announce);

  /* header bar */
  const bar = createTag('div', { class: 'header-bar' });
  const inner = createTag('div', { class: 'header-inner' });

  const brandLink = brandSec?.querySelector('a');
  const brand = createTag('a', { class: 'header-brand', href: brandLink ? authoredHref(brandLink) : getMarket().root });
  if (labels.home) brand.setAttribute('aria-label', labels.home);
  brand.innerHTML = LOGO_MARK;
  brand.append(createTag('span', labels.home ? { 'aria-hidden': 'true' } : {}, brandLink?.textContent.trim() || 'Frescopa'));

  /* desktop mega navigation */
  const nav = createTag('nav', { class: 'header-nav', 'aria-label': primaryLabel });
  const navList = createTag('ul', { class: 'header-nav-list' });
  items.forEach((item) => {
    const li = createTag('li');
    const btn = createTag('button', {
      class: 'header-nav-trigger', type: 'button', 'aria-expanded': 'false', 'aria-controls': `mega-${item.id}`,
    });
    btn.textContent = item.label;
    btn.insertAdjacentHTML('beforeend', icon('chevron'));
    if (isActive(item)) btn.setAttribute('aria-current', 'true');

    const panel = createTag('div', { class: 'header-mega', id: `mega-${item.id}`, hidden: '' });
    const panelInner = createTag('div', { class: 'header-mega-inner' });
    const intro = createTag('div', { class: 'header-mega-intro' }, [
      createTag('p', { class: 'header-mega-title' }, item.label),
      item.intro ? createTag('p', {}, item.intro) : null,
    ]);
    if (item.href) {
      const overview = createTag('a', { class: 'header-mega-overview', href: item.href }, `${labels.overview || 'Explore'} ${item.label}`);
      overview.insertAdjacentHTML('beforeend', icon('arrow'));
      intro.append(overview);
    }
    const links = createTag('ul', { class: 'header-mega-links' });
    item.links.forEach((l) => {
      const a = createTag('a', { href: l.href }, [createTag('strong', {}, l.label), l.desc ? createTag('span', {}, l.desc) : null]);
      links.append(createTag('li', {}, a));
    });
    panelInner.append(intro, links);
    if (item.promo) {
      const promo = createTag('a', { class: 'header-mega-promo', href: item.promo.href }, [
        createTag('div', { class: `header-art header-art-${item.art}`, 'aria-hidden': 'true' }),
        createTag('div', { class: 'header-mega-promo-body' }, [
          createTag('strong', {}, item.promo.label),
          item.promo.desc ? createTag('span', {}, item.promo.desc) : null,
        ]),
      ]);
      panelInner.append(promo);
    }
    panel.append(panelInner);
    li.append(btn, panel);
    navList.append(li);
  });
  nav.append(navList);

  /* tools */
  const actions = createTag('div', { class: 'header-actions' });
  const market = buildMarketSwitcher(toolsSec?.querySelector('ul'), labels, 'header-market');
  if (market) actions.append(market);

  let cta = null;
  let signIn = null;
  const authLinks = [];
  toolsSec?.querySelectorAll('a').forEach((a) => {
    if (a.closest('ul')) return;
    const label = a.textContent.trim();
    if (a.closest('strong')) {
      cta = createTag('a', { class: 'button primary header-cta', href: authoredHref(a) }, label);
    } else if (a.querySelector('.icon-search') || /search/i.test(`${a.getAttribute('href')} ${label}`)) {
      const search = createTag('a', { class: 'header-icon-btn header-search', href: authoredHref(a), 'aria-label': label });
      search.innerHTML = icon('search');
      actions.append(search);
    } else {
      signIn = { label, href: authoredHref(a) };
    }
  });

  const themeBtn = createTag('button', { class: 'header-icon-btn header-theme', type: 'button' });
  themeBtn.innerHTML = `${icon('moon')}${icon('sun')}`;
  const syncTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeBtn.setAttribute('aria-label', dark
      ? (labels['theme-light'] || 'Switch to light theme')
      : (labels['theme-dark'] || 'Switch to dark theme'));
  };
  themeBtn.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    window.dispatchEvent(new CustomEvent('aem-theme-change', { detail: { theme } }));
    syncTheme();
  });
  syncTheme();
  actions.append(themeBtn);

  if (signIn) {
    const a = createTag('a', { class: 'header-signin', href: signIn.href });
    authLinks.push(a);
    a.innerHTML = icon('user');
    a.append(createTag('span', { class: 'header-signin-label' }, signIn.label));
    actions.append(a);
  }
  if (cta) actions.append(cta);

  const menuBtn = createTag('button', {
    class: 'header-icon-btn header-menu',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'header-drawer',
    'aria-label': labels.menu || 'Menu',
  });
  menuBtn.innerHTML = `${icon('menu')}${icon('close')}`;
  actions.append(menuBtn);

  inner.append(brand, nav, actions);
  bar.append(inner);
  wrapper.append(bar);

  /* mobile drawer */
  const drawer = createTag('div', { class: 'header-drawer', id: 'header-drawer', hidden: '' });
  const drawerNav = createTag('nav', { 'aria-label': primaryLabel });
  items.forEach((item) => {
    const details = createTag('details');
    if (isActive(item)) details.open = true;
    const summary = createTag('summary', {}, item.label);
    summary.insertAdjacentHTML('beforeend', icon('chevron'));
    const ul = createTag('ul');
    if (item.href) ul.append(createTag('li', {}, createTag('a', { href: item.href }, `${labels.overview || 'Explore'} ${item.label}`)));
    [...item.links, ...(item.promo ? [item.promo] : [])].forEach((l) => {
      ul.append(createTag('li', {}, createTag('a', { href: l.href }, l.label)));
    });
    details.append(summary, ul);
    drawerNav.append(details);
  });
  const drawerActions = createTag('div', { class: 'header-drawer-actions' });
  if (cta) drawerActions.append(createTag('a', { class: 'button primary', href: cta.getAttribute('href') }, cta.textContent));
  if (signIn) {
    const a = createTag('a', { class: 'button secondary', href: signIn.href }, signIn.label);
    authLinks.push(a);
    drawerActions.append(a);
  }
  if (signIn && /\/auth\/login/i.test(signIn.href)) wireAuth(authLinks);
  const drawerMarket = buildMarketSwitcher(toolsSec?.querySelector('ul'), labels, 'header-drawer-market');
  drawer.append(drawerNav, drawerActions);
  if (drawerMarket) drawer.append(drawerMarket);
  wrapper.append(drawer);

  block.append(wrapper);

  /* shadow under the bar once the page has scrolled */
  const onScroll = () => wrapper.classList.toggle('scrolled', window.scrollY > 0);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* mega menu behaviour */
  const triggers = [...navList.querySelectorAll('.header-nav-trigger')];
  const panelOf = (btn) => block.querySelector(`#${btn.getAttribute('aria-controls')}`);
  const closeAll = (except) => triggers.forEach((b) => {
    if (b === except) return;
    b.setAttribute('aria-expanded', 'false');
    panelOf(b).hidden = true;
  });
  triggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      closeAll(btn);
      btn.setAttribute('aria-expanded', String(open));
      panelOf(btn).hidden = !open;
    });
    const li = btn.parentElement;
    li.addEventListener('focusout', (e) => {
      if (!li.contains(e.relatedTarget) && btn.getAttribute('aria-expanded') === 'true') {
        btn.setAttribute('aria-expanded', 'false');
        panelOf(btn).hidden = true;
      }
    });
    closeOnEscape(li, () => closeAll(), btn);
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) closeAll();
  });

  /* drawer behaviour */
  const setDrawer = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? (labels.close || 'Close menu') : (labels.menu || 'Menu'));
    if (open) drawer.style.top = `${bar.getBoundingClientRect().bottom}px`;
    drawer.hidden = !open;
    document.body.classList.toggle('is-locked', open);
    if (open) drawer.querySelector('summary, a')?.focus();
  };
  menuBtn.addEventListener('click', () => setDrawer(menuBtn.getAttribute('aria-expanded') !== 'true'));
  closeOnEscape(drawer, () => setDrawer(false), menuBtn);
  window.matchMedia('(width >= 1200px)').addEventListener('change', (e) => {
    if (e.matches && !drawer.hidden) setDrawer(false);
  });
}
