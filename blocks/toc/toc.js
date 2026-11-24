import { createTag } from '../../scripts/shared.js';
import { toClassName } from '../../scripts/aem.js';

let tocCount = 0;

function toTime(text) {
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime()) || !/\d{4}/.test(text)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return createTag('time', { datetime: iso }, text);
}

function collectHeadings(block) {
  const main = block.closest('main') || document;
  return [...main.querySelectorAll('h2')].filter((h) => !block.contains(h)
    && !h.closest('.hero, .toc, .tabs .tab[aria-hidden="true"]')
    && h.textContent.trim());
}

function watchHeadings(headings, links) {
  if (!('IntersectionObserver' in window)) return;
  const setCurrent = (id) => {
    links.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    const first = headings.find((h) => visible.has(h));
    if (first) setCurrent(first.id);
  }, { rootMargin: '-15% 0px -65% 0px' });
  headings.forEach((h) => observer.observe(h));
}

/**
 * Row 1: label (e.g. "On this page"). Optional further rows: label | value
 * governance facts (e.g. "Last updated | October 1, 2026"), shown under the list.
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  const label = rows[0]?.textContent.trim();
  const facts = rows.slice(1)
    .filter((row) => row.children.length >= 2)
    .map((row) => [row.children[0].textContent.trim(), row.children[1].textContent.trim()])
    .filter(([key, value]) => key && value);

  tocCount += 1;
  const titleId = `toc-title-${tocCount}`;
  const nav = createTag('nav', { class: 'toc-nav' });
  if (label) {
    nav.setAttribute('aria-labelledby', titleId);
    nav.append(createTag('h2', { class: 'toc-title', id: titleId }, label));
  }

  const headings = collectHeadings(block);
  const list = createTag('ol', { class: 'toc-list' });
  const links = headings.map((heading) => {
    if (!heading.id) heading.id = toClassName(heading.textContent);
    const link = createTag('a', { href: `#${heading.id}` }, heading.textContent.trim());
    list.append(createTag('li', {}, link));
    return link;
  });
  if (links.length) nav.append(list);

  if (facts.length) {
    const dl = createTag('dl', { class: 'toc-meta' });
    facts.forEach(([key, value]) => {
      dl.append(
        createTag('div', {}, [
          createTag('dt', {}, key),
          createTag('dd', {}, toTime(value) || value),
        ]),
      );
    });
    nav.append(dl);
  }

  block.replaceChildren(nav);
  watchHeadings(headings, links);
}
