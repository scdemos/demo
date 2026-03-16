import { createTag } from '../../scripts/shared.js';

/**
 * Social share block – renders ShareThis inline share buttons.
 * ShareThis script is loaded by delayed.js; this block only provides the markup.
 */
export default function decorate(block) {
  block.setAttribute('aria-label', 'Share this page');

  const shareButtons = createTag('div', {
    class: 'sharethis-share-buttons',
    'data-type': 'inline-share-buttons',
  }, [
    createTag('span', { 'data-network': 'facebook' }),
    createTag('span', { 'data-network': 'twitter' }),
    createTag('span', { 'data-network': 'linkedin' }),
    createTag('span', { 'data-network': 'email' }),
    createTag('span', { 'data-network': 'sharethis' }),
  ]);

  block.replaceChildren(shareButtons);
}
