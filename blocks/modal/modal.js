/*
 * Modal Block – opens fragment links in a dialog instead of navigating.
 */

import { loadFragment } from '../fragment/fragment.js';
import { createTag, getBlockContext, loadStylesFor } from '../../scripts/shared.js';
import dynamicBlocks from '../dynamic/index.js';

const FRAGMENT_PREFIX = '/fragments/';
let initialized = false;
let openModal;

function getFragmentPath(href = '') {
  try {
    const url = new URL(href, window.location.origin);
    if (!url.pathname.startsWith(FRAGMENT_PREFIX)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function setupFragmentModal(el) {
  if (initialized) return;
  initialized = true;

  // inside <aem-embed> the modal and its styles live in the embed's shadow root
  const { eventRoot, body } = getBlockContext(el);

  loadStylesFor(el, new URL('./modal.css', import.meta.url));

  const closeBtn = createTag('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close dialog' }, '×');
  const content = createTag('div', { class: 'modal-content' });
  const footer = createTag('div', { class: 'modal-footer', hidden: '' });
  const dialog = createTag('div', {
    class: 'modal-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Dialog',
  }, [closeBtn, content, footer]);
  const backdrop = createTag('div', { class: 'modal-backdrop', 'aria-hidden': 'true' });
  const modalRoot = createTag('div', { class: 'modal', hidden: 'true' }, [backdrop, dialog]);
  body.append(modalRoot);
  let previousFocus = null;
  let onClose = null;

  const close = () => {
    if (modalRoot.hidden) return;
    modalRoot.hidden = true;
    content.replaceChildren();
    if (onClose) onClose();
    onClose = null;
    footer.replaceChildren();
    footer.hidden = true;
    modalRoot.className = 'modal';
    dialog.setAttribute('aria-label', 'Dialog');
    body.classList.remove('is-locked');
    if (previousFocus?.focus) previousFocus.focus();
  };

  const open = async (source, options = {}) => {
    previousFocus = el.getRootNode().activeElement;
    onClose = options.onClose || null;
    if (options.className) modalRoot.classList.add(options.className);
    if (options.label) dialog.setAttribute('aria-label', options.label);
    if (options.footer) {
      footer.replaceChildren(options.footer);
      footer.hidden = false;
    }
    modalRoot.hidden = false;
    body.classList.add('is-locked');
    content.textContent = 'Loading...';
    closeBtn.focus();

    try {
      // a fragment path, or content that is already decorated (e.g. built from a sheet)
      const fragment = typeof source === 'string' ? await loadFragment(source) : source;
      if (fragment) {
        const main = createTag('main', { class: 'modal-main' });
        main.append(...fragment.childNodes);
        content.replaceChildren(main);
        await dynamicBlocks(main);
      } else {
        content.textContent = 'Unable to load this content right now.';
      }
      dialog.scrollTop = 0;
    } catch {
      content.textContent = 'Unable to load this content right now.';
    }
  };

  openModal = open;
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  eventRoot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalRoot.hidden) close();
  });

  eventRoot.addEventListener('click', (e) => {
    const link = e.target.closest('main a[href*="/fragments/"]');
    if (!link) return;
    if (link.closest('header, footer, nav, .modal')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target === '_blank') return;
    const path = getFragmentPath(link.href);
    if (!path) return;
    e.preventDefault();
    open(path);
  });
}

/**
 * Opens a fragment, or ready-made content, in the dialog from anywhere, e.g. a header button.
 * @param {string|Element} source fragment path, or an element whose children are shown
 * @param {object} [options]
 *   footer: element shown under the content; onClose: called when the dialog closes;
 *   className: extra class on the modal for this fragment; label: dialog name
 */
export async function openFragmentModal(source, options) {
  setupFragmentModal(document.querySelector('main') || document.body);
  await openModal(source, options);
}

export default function decorate(block) {
  setupFragmentModal(block);
}
