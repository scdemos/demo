/*
 * Header block – simple, maintainable nav
 * Nav fragment: plain.html via loadFragment (brand, sections, tools)
 * Sections: ul > li; add #mega to link for full-width dropdown
 */

import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { getBlockContext } from '../../scripts/shared.js';
import {
  getLoginUrl,
  getLogoutUrl,
  getDefaultAuthLabel,
  getSessionState,
} from '../../scripts/shared/auth-api.js';

const DESKTOP = window.matchMedia('(min-width: 900px)');
const THEME_KEY = 'demo-theme';

function getNavPath() {
  const meta = getMetadata('nav');
  return (meta ? new URL(meta, location).pathname : null) || '/nav';
}

function collapseAll(nav) {
  nav.querySelectorAll('.nav-drop').forEach((li) => li.setAttribute('aria-expanded', 'false'));
  nav.querySelector('.nav-language-menu')?.setAttribute('hidden', '');
  nav.querySelector('.nav-language-toggle')?.setAttribute('aria-expanded', 'false');
}

function decorateMega(li) {
  const link = li.querySelector(':scope > p > a');
  const sub = li.querySelector(':scope > ul');
  if (!link || !sub) return;

  const isMega = link.hash === '#mega' || sub.querySelector('picture, img');
  if (link.hash === '#mega') link.href = link.href.replace(/#mega$/i, '');

  if (!isMega) return;

  li.classList.add('nav-drop-mega');
  const items = [...sub.children].filter((c) => c.tagName === 'LI');
  const promo = items.find((c) => c.querySelector('picture, img'));
  const rest = items.filter((c) => c !== promo);

  let group = 0;
  let row = 0;
  rest.forEach((c) => {
    const hasDirectLink = c.querySelector(':scope > a') || c.querySelector(':scope > p > a');
    if (hasDirectLink) {
      if (!group) group = 1;
      c.classList.add('nav-mega-item');
      c.style.setProperty('--mega-group', group);
      row += 1;
      c.style.setProperty('--mega-row', row);
    } else {
      group += 1;
      row = 0;
      c.classList.add('nav-mega-heading');
      c.style.setProperty('--mega-group', group);
    }
  });

  const cols = group || 1;
  const totalCols = promo ? cols + 1 : cols;
  if (promo) {
    promo.classList.add('nav-mega-promo');
    promo.style.setProperty('--mega-group', cols + 1);
    sub.append(promo);
  }
  if (group) sub.classList.add('nav-mega-has-groups');

  /* wrap content in centered inner container (full-width panel, centered grid) */
  const inner = document.createElement('div');
  inner.className = 'nav-mega-inner';
  inner.style.setProperty('--mega-columns', String(totalCols));
  while (sub.firstChild) inner.appendChild(sub.firstChild);
  sub.appendChild(inner);

  // Position dropdown: full viewport width, arrow under trigger
  const sync = () => {
    if (!li.isConnected) return;
    const trigger = li.querySelector(':scope > p');
    const menu = li.querySelector(':scope > ul');
    if (!trigger || !menu) return;
    const navBar = li.closest('.nav-wrapper');
    if (navBar) {
      const rect = navBar.getBoundingClientRect();
      menu.style.setProperty('--mega-top', `${rect.bottom}px`);
    }
    const t = trigger.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const x = t.left + t.width / 2 - m.left;
    menu.style.setProperty('--mega-pointer-x', `${Math.round(x)}px`);
  };
  li.megaSync = sync;
  sync();
  window.addEventListener('resize', sync);
}

function setupDropdown(li) {
  const submenu = li.querySelector(':scope > ul');
  const heading = li.querySelector(':scope > p');
  const parentLink = li.querySelector(':scope > p > a');
  let toggleBtn = null;
  let closeTimer = null;

  const syncToggle = () => {
    if (!toggleBtn) return;
    const expanded = li.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.setAttribute('aria-label', expanded ? 'Collapse submenu' : 'Expand submenu');
  };

  if (submenu && heading) {
    toggleBtn = heading.querySelector('.nav-submenu-toggle');
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'nav-submenu-toggle';
      heading.append(toggleBtn);
    }
    syncToggle();
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (DESKTOP.matches) return;
      const wasOpen = li.getAttribute('aria-expanded') === 'true';
      collapseAll(li.closest('nav'));
      li.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
      syncToggle();
    });
  }

  const open = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    li.megaSync?.();
    collapseAll(li.closest('nav'));
    li.setAttribute('aria-expanded', 'true');
    syncToggle();
  };
  const close = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    li.setAttribute('aria-expanded', 'false');
    syncToggle();
  };

  li.addEventListener('mouseenter', () => { if (DESKTOP.matches) open(); });
  li.addEventListener('mouseleave', (e) => {
    if (!DESKTOP.matches || li.contains(e.relatedTarget)) return;
    closeTimer = setTimeout(close, 150);
  });
  li.addEventListener('focusin', () => { if (DESKTOP.matches) open(); });
  li.addEventListener('focusout', (e) => {
    if (DESKTOP.matches && !li.contains(e.relatedTarget)) close();
  });

  li.addEventListener('click', (e) => {
    if (!DESKTOP.matches) {
      const clickedSubmenuLink = submenu?.contains(e.target) && e.target.closest('a');
      const clickedToggle = e.target.closest('.nav-submenu-toggle');
      const clickedParentLink = parentLink && (e.target === parentLink || parentLink.contains(e.target));
      if (clickedToggle) return;
      if (clickedSubmenuLink) {
        collapseAll(li.closest('nav'));
        close();
      } else if (clickedParentLink) {
        collapseAll(li.closest('nav'));
        close();
      } else if (submenu) {
        e.preventDefault();
        const wasOpen = li.getAttribute('aria-expanded') === 'true';
        collapseAll(li.closest('nav'));
        li.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
        syncToggle();
      }
    } else if (li.querySelector('ul')?.contains(e.target) && e.target.closest('a')) {
      collapseAll(li.closest('nav'));
      close();
    }
  });
}

function initTheme(tools) {
  const btn = tools.querySelector('.icon-toggle')?.closest('p, button, a, div');
  if (!btn) return;

  const get = () => {
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === 'light' || s === 'dark') return s;
    } catch (e) { /* ignore */ }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  const set = (s) => {
    if (s !== 'light' && s !== 'dark') return;
    try { localStorage.setItem(THEME_KEY, s); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('aem-theme-change', { detail: { theme: s } }));
  };

  btn.classList.add('nav-tool');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  const updateLabel = () => btn.setAttribute('aria-label', `Switch to ${get() === 'dark' ? 'light' : 'dark'} mode`);
  const toggle = () => {
    set(get() === 'dark' ? 'light' : 'dark');
    updateLabel();
  };
  btn.addEventListener('click', toggle);
  btn.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); toggle(); } });
  set(get());
  updateLabel();
}

function initSearch(tools) {
  const link = tools.querySelector('a[href*="search"]');
  if (!link) return;

  const path = link.getAttribute('href') || '/search';
  const q = new URLSearchParams(location.search).get('q') || '';
  const icon = link.querySelector('.icon-search');

  const form = document.createElement('form');
  form.className = 'nav-search-form';
  form.setAttribute('role', 'search');
  form.action = path;
  form.method = 'get';

  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'q';
  input.placeholder = 'Search';
  input.value = q;
  input.setAttribute('aria-label', 'Search');
  input.className = 'nav-search-input';
  input.autocomplete = 'off';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'nav-tool nav-search-submit';
  submit.setAttribute('aria-label', 'Search');
  if (icon) submit.append(icon.cloneNode(true));

  form.onsubmit = (e) => {
    if (!input.value.trim()) {
      e.preventDefault();
      location.href = path;
    }
  };
  form.append(input, submit);
  const wrap = link.closest('p');
  (wrap && wrap.children.length === 1 ? wrap : link).replaceWith(form);
}

function findLangMenu(tools, globe) {
  let node = globe;
  while (node && node !== tools) {
    let cur = node;
    while (cur?.nextElementSibling) {
      cur = cur.nextElementSibling;
      if (cur.tagName === 'UL') return cur;
    }
    node = node.parentElement;
  }
  return null;
}

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${value}; expires=${expires}; path=/`;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function getCookie(name) {
  const encoded = encodeURIComponent(name);
  const cookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${encoded}=`));
  if (!cookie) return '';
  return decodeURIComponent(cookie.split('=').slice(1).join('='));
}

function hasCookieStartingWith(prefix) {
  return document.cookie
    .split(';')
    .map((entry) => decodeURIComponent(entry.split('=')[0] || '').trim())
    .some((cookieName) => cookieName.startsWith(prefix));
}

function isLoggedIn() {
  return hasCookieStartingWith('CF_Authorization');
}

async function resolveAuthState() {
  try {
    const session = await getSessionState();
    return {
      authenticated: Boolean(session?.authenticated),
      email: session?.email || '',
    };
  } catch (e) {
    return {
      authenticated: isLoggedIn(),
      email: '',
    };
  }
}

function setAuthUserInfo(link, email) {
  link.querySelector('.nav-auth-info')?.remove();
  link.removeAttribute('title');
  link.removeAttribute('data-auth-email');

  if (!email) return;

  link.dataset.authEmail = email;
  link.setAttribute('title', email);
  const info = document.createElement('span');
  info.className = 'nav-auth-info';
  info.setAttribute('aria-hidden', 'true');
  info.setAttribute('title', email);
  info.textContent = 'i';
  link.append(info);
}

async function initAuth(nav, tools) {
  const loginLabel = getDefaultAuthLabel('login');
  const logoutLabel = getDefaultAuthLabel('logout');

  const loginCandidate = tools.querySelector('a[href*="login" i], a[data-auth-link]');
  const shouldCreateLink = !loginCandidate;

  const desktopLink = loginCandidate || document.createElement('a');
  if (shouldCreateLink) {
    desktopLink.href = getLoginUrl();
    desktopLink.className = 'button nav-auth-link nav-auth-desktop';
    tools.append(desktopLink);
  }

  desktopLink.dataset.authLink = 'true';
  if (!desktopLink.classList.contains('button')) desktopLink.classList.add('button');
  desktopLink.classList.add('nav-auth-link', 'nav-auth-desktop');

  let mobileLink = nav.querySelector('.nav-auth-mobile-item a');
  if (!mobileLink) {
    const mobileList = nav.querySelector('.nav-sections .default-content-wrapper > ul');
    if (mobileList) {
      const li = document.createElement('li');
      li.className = 'nav-auth-mobile-item';
      const p = document.createElement('p');
      mobileLink = document.createElement('a');
      mobileLink.className = 'button nav-auth-link nav-auth-mobile';
      mobileLink.dataset.authLink = 'true';
      p.append(mobileLink);
      li.append(p);
      mobileList.append(li);
    }
  }
  if (mobileLink && !mobileLink.classList.contains('button')) mobileLink.classList.add('button');

  const applyAuthState = async () => {
    const authState = await resolveAuthState();
    const loggedIn = authState.authenticated;
    const loginHref = getLoginUrl();
    const logoutHref = getLogoutUrl();
    const targetHref = loggedIn ? logoutHref : loginHref;
    const label = loggedIn ? logoutLabel : loginLabel;

    [desktopLink, mobileLink].filter(Boolean).forEach((link) => {
      link.setAttribute('href', targetHref);
      link.textContent = label;
      link.setAttribute('aria-label', label);
      setAuthUserInfo(link, loggedIn ? authState.email : '');
    });
  };

  await applyAuthState();
  return applyAuthState;
}

function ensureGoogleTranslateScript() {
  if (window.__googleTranslateScriptLoaded) return Promise.resolve();
  if (window.__googleTranslateScriptPromise) return window.__googleTranslateScriptPromise;

  if (!document.getElementById('google_translate_element')) {
    const holder = document.createElement('div');
    holder.id = 'google_translate_element';
    holder.style.display = 'none';
    document.body.append(holder);
  }

  window.__googleTranslateScriptPromise = new Promise((resolve) => {
    window.googleTranslateElementInit = () => {
      if (window.google?.translate?.TranslateElement) {
        new window.google.translate.TranslateElement({ pageLanguage: 'en' }, 'google_translate_element');
      }
      window.__googleTranslateScriptLoaded = true;
      resolve();
    };

    const existing = document.querySelector('script[src*="translate.google.com/translate_a/element.js"]');
    if (existing) {
      if (window.google?.translate?.TranslateElement) {
        window.__googleTranslateScriptLoaded = true;
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.defer = true;
    script.onerror = () => resolve();
    document.body.append(script);
  });

  return window.__googleTranslateScriptPromise;
}

async function switchLanguage(lang) {
  if (lang === 'fr') {
    setCookie('googtrans', '/en/fr');
    window.location.reload();
    return;
  }

  deleteCookie('googtrans');
  window.location.reload();
}

function hydrateTranslateFromCookie() {
  const value = getCookie('googtrans');
  if (!value || !value.includes('/en/')) return;
  ensureGoogleTranslateScript();
}

function decorateLanguageMenu(menu) {
  if (!menu || menu.dataset.translated === 'true') return;
  menu.dataset.translated = 'true';

  const links = menu.querySelectorAll('a');
  links.forEach((link) => {
    const text = link.textContent.trim().toLowerCase();
    if (text.includes('french') || text.includes('français') || text.includes('fran')) {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        await switchLanguage('fr');
      });
      return;
    }
    if (text.includes('english') || text.includes('anglais')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        switchLanguage('en');
      });
    }
  });
}

function initLanguage(tools, eventRoot) {
  const globe = tools.querySelector('.icon-globe')?.closest('p, button, a, div');
  const menu = globe ? findLangMenu(tools, globe) : null;
  if (!globe || !menu) return;

  tools.classList.add('has-language');
  globe.classList.add('nav-tool', 'nav-language-toggle');
  globe.setAttribute('role', 'button');
  globe.setAttribute('tabindex', '0');
  globe.setAttribute('aria-haspopup', 'true');
  globe.setAttribute('aria-expanded', 'false');
  globe.setAttribute('aria-label', 'Select language');
  menu.classList.add('nav-language-menu');
  menu.hidden = true;

  /* wrap globe + menu in positioned container so dropdown aligns to globe */
  const wrap = document.createElement('div');
  wrap.className = 'nav-language-wrap';
  globe.parentNode.insertBefore(wrap, globe);
  wrap.append(globe, menu);

  const toggle = () => {
    const open = globe.getAttribute('aria-expanded') === 'true';
    if (!open) collapseAll(tools.closest('nav'));
    menu.hidden = open;
    globe.setAttribute('aria-expanded', !open);
  };

  globe.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
  eventRoot.addEventListener('click', (e) => { if (!tools.contains(e.target)) { menu.hidden = true; globe.setAttribute('aria-expanded', 'false'); } });
  eventRoot.addEventListener('keydown', (e) => { if (e.code === 'Escape') { menu.hidden = true; globe.setAttribute('aria-expanded', 'false'); } });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { menu.hidden = true; globe.setAttribute('aria-expanded', 'false'); }));

  decorateLanguageMenu(menu);
}

function toggleMobile(nav, open, body) {
  const isOpen = open === undefined ? nav.getAttribute('aria-expanded') !== 'true' : open;
  body.style.overflowY = isOpen && !DESKTOP.matches ? 'hidden' : '';
  nav.setAttribute('aria-expanded', isOpen);
  nav.querySelector('.nav-hamburger button')?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  nav.querySelectorAll('.nav-drop').forEach((d) => d.setAttribute('tabindex', DESKTOP.matches ? '0' : '-1'));
}

function syncMobileNavHeight(nav) {
  if (DESKTOP.matches) {
    nav.style.removeProperty('--nav-open-height');
    return;
  }
  nav.style.setProperty('--nav-open-height', `${window.innerHeight}px`);
}

const NAV_ITEMS = '.default-content-wrapper > ul > li';

export default async function decorate(block) {
  const { body, eventRoot } = getBlockContext(block);

  // Load nav content (skip if aem-embed already provided content)
  if (block.textContent === '') {
    const fragment = await loadFragment(getNavPath());
    if (!fragment) return;

    block.textContent = '';
    const nav = document.createElement('nav');
    nav.id = 'nav';
    nav.setAttribute('aria-label', 'Main');
    nav.setAttribute('aria-expanded', 'false');

    while (fragment.firstElementChild) nav.append(fragment.firstElementChild);
    block.append(nav);
  }

  const nav = block.querySelector('nav');
  if (!nav) return;
  if (!nav.id) nav.id = 'nav';
  if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Main');
  if (!nav.getAttribute('aria-expanded')) nav.setAttribute('aria-expanded', 'false');

  ['brand', 'sections', 'tools'].forEach((c, i) => nav.children[i]?.classList.add(`nav-${c}`));

  const tools = nav.querySelector('.nav-tools');
  if (tools && nav.children.length > 3) {
    [...nav.children].slice(3).forEach((extra) => {
      while (extra.firstElementChild) tools.append(extra.firstElementChild);
      extra.remove();
    });
  }

  nav.querySelector('.nav-brand .button')?.classList.remove('button');
  nav.querySelector('.nav-brand .button-container')?.classList.remove('button-container');

  const sections = nav.querySelector('.nav-sections');
  sections?.querySelectorAll(NAV_ITEMS).forEach((li) => {
    if (li.querySelector('ul')) {
      li.classList.add('nav-drop');
      li.setAttribute('aria-expanded', 'false');
      li.setAttribute('aria-haspopup', 'true');
      decorateMega(li);
      setupDropdown(li);
    }
  });

  const hamburger = document.createElement('div');
  hamburger.className = 'nav-hamburger';
  hamburger.innerHTML = '<button type="button" aria-controls="nav" aria-label="Open navigation"><span class="nav-hamburger-icon"></span></button>';
  let refreshAuthState = null;
  hamburger.onclick = async () => {
    toggleMobile(nav, undefined, body);
    if (nav.getAttribute('aria-expanded') === 'true') await refreshAuthState?.();
  };

  eventRoot.addEventListener('click', (e) => {
    if (!DESKTOP.matches && nav.getAttribute('aria-expanded') === 'true' && !nav.contains(e.target)) {
      toggleMobile(nav, false, body);
    }
  });
  eventRoot.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (!DESKTOP.matches && nav.getAttribute('aria-expanded') === 'true') {
      toggleMobile(nav, false, body);
    } else if (DESKTOP.matches && nav.querySelector('.nav-drop[aria-expanded="true"]')) {
      collapseAll(nav);
    }
  });
  nav.prepend(hamburger);

  const wrapper = document.createElement('div');
  wrapper.className = 'nav-wrapper';
  wrapper.append(nav);
  block.append(wrapper);

  toggleMobile(nav, false, body);
  syncMobileNavHeight(nav);
  collapseAll(nav);
  DESKTOP.addEventListener('change', () => toggleMobile(nav, false, body));
  window.addEventListener('resize', () => {
    syncMobileNavHeight(nav);
  });

  if (tools) {
    initTheme(tools);
    initSearch(tools);
    refreshAuthState = await initAuth(nav, tools);
    window.addEventListener('pageshow', () => { refreshAuthState?.(); });
    if (eventRoot === document) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshAuthState?.();
      });
    }
    initLanguage(tools, eventRoot);
    hydrateTranslateFromCookie();
  }

  nav.querySelectorAll('.nav-drop-mega').forEach((li) => li.megaSync?.());
}
