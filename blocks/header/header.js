/*
 * Header block — content-driven navigation.
 * Nav fragment (content/nav.plain.html) provides four sections in order:
 *   1. Announcement carousel — <ul> of rotating messages (each with a link)
 *   2. Brand — logo link
 *   3. Primary nav — <ul>; a top-level <li> with a nested <ul> is a click dropdown
 *   4. Tools — utility links (search, CTA)
 * All copy, links, and images live in the fragment; this file only reads that
 * DOM, builds interactive controls, and wires behavior.
 */

import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { getBlockContext } from '../../scripts/shared.js';

const DESKTOP = window.matchMedia('(min-width: 900px)');
const CAROUSEL_INTERVAL = 6000;

/**
 * Candidate nav-fragment paths, in priority order. A `nav` metadata value wins.
 * Otherwise try `/content/nav` (local `aem up`) then `/nav` (preview/live where
 * content is published at the root).
 */
function getNavPathCandidates() {
  const meta = getMetadata('nav');
  if (meta) return [new URL(meta, window.location).pathname];
  return ['/content/nav', '/nav'];
}

/* ---------- Announcement carousel ---------- */

function initCarousel(section) {
  const list = section.querySelector('ul');
  if (!list) return;
  section.classList.add('nav-announcement');
  const slides = [...list.children];
  if (slides.length === 0) return;
  slides.forEach((slide, i) => {
    slide.classList.add('nav-announcement-slide');
    slide.toggleAttribute('hidden', i !== 0);
  });

  let current = 0;
  let timer = null;
  let paused = false;

  const show = (index) => {
    slides[current].setAttribute('hidden', '');
    current = (index + slides.length) % slides.length;
    slides[current].removeAttribute('hidden');
  };
  const next = () => show(current + 1);
  const prev = () => show(current - 1);

  const start = () => {
    if (timer || paused || slides.length < 2) return;
    timer = setInterval(next, CAROUSEL_INTERVAL);
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  const controls = document.createElement('div');
  controls.className = 'nav-announcement-controls';

  const makeBtn = (cls, label, handler) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', handler);
    return btn;
  };

  const prevBtn = makeBtn('nav-announcement-prev', 'Previous announcement', () => { prev(); });
  const nextBtn = makeBtn('nav-announcement-next', 'Next announcement', () => { next(); });
  const pauseBtn = makeBtn('nav-announcement-pause', 'Pause announcements', () => {
    paused = !paused;
    pauseBtn.classList.toggle('is-paused', paused);
    pauseBtn.setAttribute('aria-label', paused ? 'Play announcements' : 'Pause announcements');
    if (paused) stop(); else start();
  });

  const inner = document.createElement('div');
  inner.className = 'nav-announcement-inner';
  inner.append(prevBtn, list, nextBtn, pauseBtn);
  section.textContent = '';
  section.append(inner);

  if (slides.length < 2) {
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    pauseBtn.hidden = true;
  }

  section.addEventListener('mouseenter', stop);
  section.addEventListener('mouseleave', () => { if (!paused) start(); });
  start();
}

/* ---------- Primary nav dropdowns ---------- */

function closeAll(nav, except) {
  nav.querySelectorAll('.nav-drop[aria-expanded="true"]').forEach((li) => {
    if (li !== except) li.setAttribute('aria-expanded', 'false');
  });
}

function setupDropdown(li, nav) {
  li.classList.add('nav-drop');
  li.setAttribute('aria-expanded', 'false');
  li.setAttribute('aria-haspopup', 'true');

  // The trigger label is the leading text node / element before the nested <ul>.
  const submenu = li.querySelector(':scope > ul');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-drop-toggle';
  // Move the label text (everything before the submenu) into the button.
  const labelNodes = [...li.childNodes].filter((n) => n !== submenu);
  labelNodes.forEach((n) => trigger.append(n));
  li.prepend(trigger);

  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = li.getAttribute('aria-expanded') === 'true';
    closeAll(nav);
    li.setAttribute('aria-expanded', open ? 'false' : 'true');
    trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
}

/* ---------- Tools (search + CTA) ---------- */

function decorateTools(section) {
  section.classList.add('nav-tools');
  // Reset any EDS button auto-decoration so our own tool styling is authoritative.
  section.querySelectorAll('.button').forEach((el) => el.classList.remove('button'));
  section.querySelectorAll('.button-container').forEach((el) => el.classList.remove('button-container'));
  // EDS wraps section content in a .default-content-wrapper (display:block); hoist
  // the tool items to be direct flex children so they lay out in a row.
  const wrapper = section.querySelector('.default-content-wrapper');
  if (wrapper) {
    while (wrapper.firstChild) section.append(wrapper.firstChild);
    wrapper.remove();
  }
  const links = [...section.querySelectorAll('a')];
  links.forEach((a) => {
    const href = a.getAttribute('href') || '';
    const wrapper = a.closest('p') || a;
    if (/\/search$/.test(href) || /search/i.test(a.textContent)) {
      a.classList.add('nav-search-link');
      a.setAttribute('aria-label', a.textContent.trim() || 'Search');
      a.textContent = '';
      wrapper.classList.add('nav-tool');
    } else {
      a.classList.add('nav-cta');
      wrapper.classList.add('nav-tool');
    }
  });
}

/* ---------- Mobile toggle ---------- */

function toggleMobile(nav, open, body) {
  const isOpen = open === undefined ? nav.getAttribute('aria-expanded') !== 'true' : open;
  nav.setAttribute('aria-expanded', String(isOpen));
  body.style.overflowY = isOpen && !DESKTOP.matches ? 'hidden' : '';
  nav.querySelector('.nav-hamburger button')?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
}

export default async function decorate(block) {
  const { body, eventRoot } = getBlockContext(block);

  let navPath = getNavPathCandidates()[0];
  if (block.textContent === '') {
    let fragment = null;
    const candidates = getNavPathCandidates();
    for (let i = 0; i < candidates.length; i += 1) {
      fragment = await loadFragment(candidates[i]);
      if (fragment) { navPath = candidates[i]; break; }
    }
    if (!fragment) return;
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

  // Fragment images use paths relative to the nav document (e.g. images/x.svg).
  // Resolve them against the nav directory so they don't break on deep pages.
  const navDir = navPath.replace(/[^/]+$/, '');
  nav.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !/^(https?:)?\/\//.test(src) && !src.startsWith('/')) {
      img.setAttribute('src', `${navDir}${src}`);
    }
  });

  // Sections in order: announcement, brand, primary nav, tools.
  const [announcement, brand, primary, tools] = nav.children;

  if (announcement) initCarousel(announcement);
  if (brand) {
    brand.classList.add('nav-brand');
    brand.querySelector('.button')?.classList.remove('button');
    brand.querySelector('.button-container')?.classList.remove('button-container');
  }
  if (primary) {
    primary.classList.add('nav-sections');
    // EDS auto-decorates single-link paragraphs as .button pills; strip that in
    // the nav so every item renders as plain nav text (matches the source).
    primary.querySelectorAll('.button').forEach((el) => el.classList.remove('button'));
    primary.querySelectorAll('.button-container').forEach((el) => el.classList.remove('button-container'));
    // EDS wraps section content in a .default-content-wrapper; hoist the nav
    // list up to be a direct child so CSS/JS can target `.nav-sections > ul`.
    const list = primary.querySelector('ul');
    if (list && list.parentElement !== primary) {
      primary.textContent = '';
      primary.append(list);
    }
    if (list) {
      [...list.children].filter((li) => li.tagName === 'LI').forEach((li) => {
        if (li.querySelector(':scope > ul')) setupDropdown(li, nav);
      });
    }
  }
  if (tools) decorateTools(tools);

  // Hamburger for mobile.
  const hamburger = document.createElement('div');
  hamburger.className = 'nav-hamburger';
  hamburger.innerHTML = '<button type="button" aria-controls="nav" aria-label="Open navigation"><span class="nav-hamburger-icon"></span></button>';
  hamburger.addEventListener('click', () => toggleMobile(nav, undefined, body));
  nav.prepend(hamburger);

  const wrapper = document.createElement('div');
  wrapper.className = 'nav-wrapper';
  wrapper.append(nav);
  block.append(wrapper);

  toggleMobile(nav, false, body);

  // Close dropdowns / mobile menu on outside click or Escape.
  eventRoot.addEventListener('click', (e) => {
    if (!nav.contains(e.target)) {
      closeAll(nav);
      if (!DESKTOP.matches) toggleMobile(nav, false, body);
    }
  });
  eventRoot.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    closeAll(nav);
    if (!DESKTOP.matches) toggleMobile(nav, false, body);
  });

  // Reset state when crossing the breakpoint.
  DESKTOP.addEventListener('change', () => {
    closeAll(nav);
    toggleMobile(nav, false, body);
  });
}
