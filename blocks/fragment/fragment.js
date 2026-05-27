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

import { isUE } from '../../scripts/shared.js';
import dynamicBlocks from '../dynamic/index.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {Promise<HTMLElement>} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    const resp = await fetch(`${path}.plain.html`);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      // reset base path for media to fragment base
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
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

/**
 * Renders a sandboxed preview of the fragment in UE.
 * Uses a srcdoc iframe so UE cannot instrument the content inside it.
 * @param {Element} container The element to render into
 * @param {string} path The fragment path
 */
export async function renderFragmentPreviewForUE(container, path) {
  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return;
  const html = await resp.text();

  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((el) => el.outerHTML).join('\n');

  const srcdoc = `<!doctype html><html><head><base href="${window.location.origin}${path}">
${styles}<style>body{margin:0;pointer-events:none;user-select:none}</style>
</head><body>${html}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.className = 'fragment-ue-preview';
  iframe.sandbox = 'allow-same-origin';
  iframe.srcdoc = srcdoc;
  iframe.title = `Fragment preview: ${path}`;

  container.dataset.fragmentPath = path;
  container.classList.add('fragment-locked');
  container.replaceChildren(iframe);

  iframe.addEventListener('load', () => {
    const body = iframe.contentDocument?.body;
    if (body) iframe.style.height = `${body.scrollHeight}px`;
  });
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();

  if (isUE()) {
    await renderFragmentPreviewForUE(block, path);
    return;
  }

  const fragment = await loadFragment(path);
  if (fragment) {
    block.replaceChildren(...fragment.childNodes);
    const main = block.closest('main');
    if (main) await dynamicBlocks(main);
  }
}
