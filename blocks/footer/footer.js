import { createTag } from '../../scripts/shared.js';
import {
  authoredHref, buildMarketSwitcher, fetchChrome, icon, LOGO_MARK, readLabels,
} from '../header/header.js';

const SOCIAL = [
  ['instagram', /instagram\.com$/],
  ['linkedin', /linkedin\.com$/],
  ['youtube', /(youtube\.com|youtu\.be)$/],
];

const isExternal = (a) => /^https?:/.test(authoredHref(a));
const isMarketLink = (a) => /^\/(?:[^/]+\/)*[a-z]{2}\/[a-z]{2}\/$/.test(authoredHref(a));

function buildNewsletter(labels) {
  const id = 'footer-newsletter-email';
  const form = createTag('form', { class: 'footer-newsletter', novalidate: '' });
  const label = createTag('label', { for: id, class: 'visually-hidden' }, labels['email-label'] || 'Email address');
  const input = createTag('input', {
    id,
    name: 'email',
    type: 'email',
    autocomplete: 'email',
    required: '',
    placeholder: labels.placeholder || 'name@example.com',
    'aria-describedby': `${id}-error`,
  });
  const button = createTag('button', { type: 'submit', class: 'button primary' }, labels.subscribe || 'Subscribe');
  const error = createTag('p', { class: 'footer-newsletter-error', id: `${id}-error`, 'aria-live': 'polite' });
  const status = createTag('p', { class: 'footer-newsletter-status', role: 'status' });
  form.append(label, input, button, error, status);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.checkValidity()) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = labels['email-error'] || 'Enter an email address like name@example.com.';
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    status.textContent = labels.thanks || '';
    form.reset();
  });
  return form;
}

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

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const sections = await fetchChrome('footer');
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
  introSec?.querySelectorAll(':scope > p').forEach((p) => intro.append(createTag('p', { class: 'footer-lede' }, p.textContent.trim())));
  intro.append(buildNewsletter(labels));
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
