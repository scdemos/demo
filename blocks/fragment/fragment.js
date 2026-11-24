/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

import { fetchFragment } from '../../scripts/shared.js';
import dynamicBlocks from '../dynamic/index.js';

/**
 * Loads a fragment, in this page's market: on /de/ pages /fragments/x loads /de/fragments/x
 * when it exists, else /fragments/x. Add #_dnt to the link to always load /fragments/x.
 * @param {string} path The path to the fragment
 * @returns {Promise<HTMLElement>} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    const found = await fetchFragment(path);
    if (found) {
      const main = document.createElement('main');
      main.innerHTML = found.html;

      // reset base path for media to the fragment version that loaded
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(found.path, window.location)).href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      decorateMain(main);
      await loadSections(main);
      return main;
    }
  }
  return null;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) {
    block.replaceChildren(...fragment.childNodes);
    const main = block.closest('main');
    if (main) await dynamicBlocks(main);
  }
}
