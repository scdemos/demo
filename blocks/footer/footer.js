import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Build a newsletter signup form from the lead-capture band.
 * Content (heading + note) stays in the fragment; only the input/button
 * controls are constructed here (they can't live in a plain fragment).
 * @param {Element} band the section that contains the newsletter heading
 */
function buildNewsletterForm(band) {
  const heading = band.querySelector('h2, h3');
  if (!heading || band.querySelector('form')) return;

  const form = document.createElement('form');
  form.className = 'footer-newsletter-form';
  form.setAttribute('role', 'form');
  form.action = '/newsletter';
  form.method = 'get';

  const input = document.createElement('input');
  input.type = 'email';
  input.name = 'email';
  input.placeholder = 'Email address';
  input.setAttribute('aria-label', 'Email address');
  input.className = 'footer-newsletter-input';
  input.autocomplete = 'email';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'footer-newsletter-submit';
  submit.setAttribute('aria-label', 'Sign up for the newsletter');
  submit.innerHTML = '<span aria-hidden="true">→</span>';

  form.append(input, submit);
  // insert the form right after the heading
  heading.insertAdjacentElement('afterend', form);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment (skip if aem-embed already provided content)
  if (block.textContent === '') {
    const footerMeta = getMetadata('footer');
    const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
    // Try the authored path, then fall back to the basename at root. DA can
    // publish the fragment at /footer even when metadata points to /content/footer
    // (or vice-versa); trying both avoids a 404 that would blank the footer.
    let fragment = await loadFragment(footerPath);
    if (!fragment) {
      const alt = footerPath.startsWith('/content/')
        ? footerPath.replace('/content/', '/')
        : `/content${footerPath}`;
      if (alt !== footerPath) fragment = await loadFragment(alt);
    }
    if (!fragment) return; // nothing to render; don't crash on a missing fragment

    block.textContent = '';
    const footer = document.createElement('div');
    while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
    block.append(footer);
  }

  const sections = [...block.querySelectorAll(':scope > div > .section, :scope > div > div')];

  // Tag semantic bands so CSS can lay them out (brand, lead, links, legal).
  sections.forEach((section) => {
    if (section.querySelector('.footer-brand-tag')) return;
    if (section.querySelector('img') && section.querySelector('ul')) {
      section.classList.add('footer-brand-band');
    } else if (section.querySelector('h2')) {
      section.classList.add('footer-lead-band');
    } else if (section.querySelectorAll(':scope > div h3').length >= 2
      || section.querySelectorAll('h3').length >= 2) {
      section.classList.add('footer-links-band');
    } else {
      section.classList.add('footer-legal-band');
    }
  });

  // Link columns: wrap each heading + its following list into a column so the
  // flat (DA-safe) h3/ul fragment lays out as multi-column on desktop.
  // The section pipeline nests content under .default-content-wrapper, so
  // group inside that wrapper (which carries the grid layout).
  const linksBand = block.querySelector('.footer-links-band');
  const linksHost = linksBand?.querySelector('.default-content-wrapper') || linksBand;
  if (linksHost && !linksHost.querySelector('.footer-link-col')) {
    linksHost.classList.add('footer-links-grid');
    const cols = [];
    [...linksHost.children].forEach((child) => {
      if (child.tagName === 'H3') {
        const col = document.createElement('div');
        col.className = 'footer-link-col';
        col.append(child);
        cols.push(col);
      } else if (cols.length) {
        cols[cols.length - 1].append(child);
      }
    });
    linksHost.append(...cols);
  }

  // Newsletter form (lead-capture band)
  const lead = block.querySelector('.footer-lead-band');
  if (lead) buildNewsletterForm(lead);

  // Locale toggle: turn the standalone "English" paragraph in the legal band
  // into an accessible button.
  const legal = block.querySelector('.footer-legal-band');
  if (legal) {
    const paras = [...legal.querySelectorAll(':scope > p, p')];
    const localePara = paras.find((p) => /^english$/i.test(p.textContent.trim()));
    if (localePara && !localePara.querySelector('button')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'footer-locale-toggle';
      btn.setAttribute('aria-label', 'Select language');
      btn.textContent = localePara.textContent.trim();
      localePara.replaceChildren(btn);
    }
  }
}
