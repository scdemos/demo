import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

function normalizeFooterGroups(block) {
  const navSection = block.querySelector('.footer-nav');
  if (!navSection) return;

  const groups = navSection.querySelectorAll(':scope > div > ul > li');
  groups.forEach((group) => {
    const headingPara = group.querySelector(':scope > p');
    if (headingPara) {
      const heading = headingPara.querySelector('strong');
      if (heading && heading.textContent) {
        headingPara.classList.add('footer-group-heading');
      }
    }
  });
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
    const fragment = await loadFragment(footerPath);

    block.textContent = '';
    const footer = document.createElement('div');
    while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
    block.append(footer);
  }

  const sections = block.querySelectorAll('.section');
  if (sections.length >= 4) {
    sections[0].classList.add('footer-brand');
    sections[1].classList.add('footer-nav');
    sections[2].classList.add('footer-social');
    sections[3].classList.add('footer-legal');
  }

  normalizeFooterGroups(block);
}
