import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

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

  // Optional layout from site/page metadata, e.g. `footer-layout: legal`
  const layout = getMetadata('footer-layout').toLowerCase();
  if (layout) block.classList.add(`footer-layout-${layout}`);

  // merge social icons into copyright row (default layout only)
  const sections = block.querySelectorAll('.section');
  if (!layout && sections.length >= 4) {
    const copyrightSection = sections[2];
    const socialSection = sections[3];
    const socialUl = socialSection.querySelector('ul');
    const copyrightWrapper = copyrightSection.querySelector('.default-content-wrapper');
    if (socialUl && copyrightWrapper) {
      const pipe = document.createElement('span');
      pipe.className = 'footer-separator';
      pipe.textContent = '|';
      copyrightWrapper.append(pipe, socialUl);
      socialSection.remove();
    }
  }
}
