import { getMetadata } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';
import { loadFragment } from '../fragment/fragment.js';
import {
  authoredHref, buildMarketSwitcher, fetchChrome, icon, LOGO_MARK, readLabels,
} from '../header/header.js';

const SOCIAL = [
  ['instagram', /instagram\.com$/],
  ['linkedin', /linkedin\.com$/],
  ['youtube', /(youtube\.com|youtu\.be)$/],
];

const isExternal = (a) => /^https?:/.test(authoredHref(a));
const isMarketLink = (a) => /^\/(?:[^/]+\/)*[a-z]{2}\/$/.test(authoredHref(a));
const isSocialLink = (a) => {
  try {
    const host = new URL(a.href).hostname.replace(/^www\./, '');
    return SOCIAL.some(([, re]) => re.test(host));
  } catch (e) {
    return false;
  }
};

function buildSocial(list) {
  if (!list) return null;
  const ul = createTag('ul', { class: 'footer-social' });
  list.querySelectorAll('a').forEach((a) => {
    let host = '';
    try { host = new URL(a.href).hostname.replace(/^www\./, ''); } catch (e) { /* noop */ }
    const [name] = SOCIAL.find(([, re]) => re.test(host)) || ['link'];
    const link = createTag('a', { href: a.href, rel: 'noopener', 'aria-label': a.textContent.trim() });
    link.innerHTML = icon(name);
    ul.append(createTag('li', {}, link));
  });
  return ul;
}

/** Copy of an authored paragraph with `{year}` replaced, keeping inline links and emphasis. */
function legalCopy(p) {
  const copy = createTag('p', { class: 'footer-legal-copy' });
  copy.append(...p.cloneNode(true).childNodes);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    node.textContent = node.textContent.replace('{year}', new Date().getFullYear());
  }
  copy.querySelectorAll('a').forEach((a) => a.setAttribute('href', authoredHref(a)));
  return copy;
}

/** Plain list of authored links. */
function linkList(list, cls, label) {
  const ul = createTag('ul', { class: cls, 'aria-label': label });
  list.querySelectorAll('a').forEach((a) => ul.append(createTag('li', {}, createTag('a', { href: authoredHref(a) }, a.textContent.trim()))));
  return ul;
}

/**
 * `footer-layout: legal`: logo + link row, copyright/legal paragraphs, stacked legal links.
 * Section 1: brand link (optional, its text is the wordmark) and a list of links.
 * Section 2: copyright and legal paragraphs (`{year}` is replaced).
 * Section 3: legal links; a list of market links becomes the market switcher and a list of
 * social profile links becomes icons.
 * @param {Element} block
 * @param {HTMLElement[]} sections
 */
function decorateLegal(block, sections) {
  const [rowSec, copySec, ...restSecs] = sections;
  const labels = sections.reduce((all, sec) => ({ ...all, ...readLabels(sec) }), {});
  const inner = createTag('div', { class: 'footer-inner' });

  /* logo + link row */
  const row = createTag('div', { class: 'footer-legal-row' });
  const brandLink = rowSec?.querySelector(':scope > p a, :scope > h2 a, :scope > h3 a');
  const brand = createTag(brandLink ? 'a' : 'p', { class: 'footer-legal-brand' });
  if (brandLink) brand.setAttribute('href', authoredHref(brandLink));
  brand.innerHTML = LOGO_MARK;
  brand.append(createTag('span', {}, brandLink?.textContent.trim() || 'Frescopa'));
  row.append(brand);
  const rowList = rowSec?.querySelector('ul');
  if (rowList) {
    const nav = createTag('nav', { 'aria-label': labels['footer-nav'] || 'Footer' });
    nav.append(linkList(rowList, 'footer-legal-links'));
    row.append(nav);
  }
  inner.append(row);

  /* copyright + legal paragraphs */
  const copy = createTag('div', { class: 'footer-legal-text' });
  copySec?.querySelectorAll(':scope > p').forEach((p) => copy.append(legalCopy(p)));
  if (copy.children.length) inner.append(copy);

  /* stacked legal links, market switcher, social icons */
  const stacks = [];
  const extras = [];
  restSecs.flatMap((sec) => [...sec.querySelectorAll('ul')]).forEach((list) => {
    const links = [...list.querySelectorAll('a')];
    if (!links.length) return;
    if (links.every(isMarketLink)) {
      extras.push(buildMarketSwitcher(list, labels, 'footer-market'));
    } else if (links.every(isSocialLink)) {
      extras.push(buildSocial(list));
    } else {
      stacks.push(linkList(list, 'footer-legal-stack', labels['legal-nav'] || 'Legal'));
    }
  });
  const bottom = createTag('div', { class: 'footer-legal-bottom' }, [...stacks, ...extras]);
  if (bottom.children.length) inner.append(bottom);

  block.classList.add('surface-ink');
  block.append(inner);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const sections = await fetchChrome('footer');

  /* optional layout from page/site metadata, e.g. `footer-layout: legal` */
  const layout = getMetadata('footer-layout').trim().toLowerCase();
  if (layout) block.classList.add(`footer-layout-${layout}`);
  if (layout === 'legal') {
    block.textContent = '';
    decorateLegal(block, sections);
    return;
  }

  const [introSec, colsSec, bottomSec] = sections;
  const labels = readLabels(introSec);
  block.textContent = '';
  block.classList.add('surface-ink');

  const inner = createTag('div', { class: 'footer-inner' });
  const top = createTag('div', { class: 'footer-top' });

  /* brand statement + newsletter */
  const intro = createTag('div', { class: 'footer-intro' });
  const brand = createTag('p', { class: 'footer-brand' });
  brand.innerHTML = LOGO_MARK;
  const heading = introSec?.querySelector('h1, h2, h3, h4');
  if (heading) {
    const statement = createTag('p', { class: 'footer-statement' });
    statement.append(...heading.cloneNode(true).childNodes);
    intro.append(brand, statement);
  } else {
    intro.append(brand);
  }
  /* a link to a fragment (e.g. /fragments/newsletter) brings in its content, such as a form */
  const isFragmentLink = (a) => authoredHref(a).startsWith('/fragments/');
  introSec?.querySelectorAll(':scope > p').forEach((p) => {
    const link = p.querySelector('a');
    if (link && isFragmentLink(link)) {
      const slot = createTag('div', { class: 'footer-fragment' });
      intro.append(slot);
      loadFragment(authoredHref(link)).then((fragment) => {
        if (fragment) slot.append(...fragment.childNodes);
      });
      return;
    }
    intro.append(createTag('p', { class: 'footer-lede' }, p.textContent.trim()));
  });
  top.append(intro);

  /* link columns */
  if (colsSec) {
    const nav = createTag('nav', { class: 'footer-cols', 'aria-label': labels['footer-nav'] || 'Footer' });
    colsSec.querySelectorAll('h2, h3, h4').forEach((h) => {
      const list = h.nextElementSibling?.matches('ul') ? h.nextElementSibling : null;
      const col = createTag('div', { class: 'footer-col' }, createTag('h2', {}, h.textContent.trim()));
      if (list) {
        const ul = createTag('ul');
        list.querySelectorAll('a').forEach((a) => ul.append(createTag('li', {}, createTag('a', { href: authoredHref(a) }, a.textContent.trim()))));
        col.append(ul);
      }
      nav.append(col);
    });
    top.append(nav);
  }
  inner.append(top);

  /* bottom row: market, legal, copyright, social */
  const bottom = createTag('div', { class: 'footer-bottom' });
  if (bottomSec) {
    const lists = [...bottomSec.querySelectorAll('ul')];
    const marketList = lists.find((ul) => [...ul.querySelectorAll('a')].every(isMarketLink));
    const socialList = lists.find((ul) => [...ul.querySelectorAll('a')].every(isExternal));
    const legalList = lists.find((ul) => ul !== marketList && ul !== socialList);
    const market = buildMarketSwitcher(marketList, labels, 'footer-market');
    if (market) bottom.append(market);
    if (legalList) {
      const ul = createTag('ul', { class: 'footer-legal', 'aria-label': labels['legal-nav'] || 'Legal' });
      legalList.querySelectorAll('a').forEach((a) => ul.append(createTag('li', {}, createTag('a', { href: authoredHref(a) }, a.textContent.trim()))));
      bottom.append(ul);
    }
    bottomSec.querySelectorAll(':scope > p').forEach((p) => {
      bottom.append(createTag('p', { class: 'footer-copyright' }, p.textContent.trim().replace('{year}', new Date().getFullYear())));
    });
    const social = buildSocial(socialList);
    if (social) bottom.append(social);
  }
  inner.append(bottom);
  block.append(inner);
}
