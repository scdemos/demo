import { trackPromotion } from '../../scripts/shared.js';

/**
 * Teaser uses authored DOM structure directly; it's tracked as a promotion named after its heading
 * (or its bold text, for a one-line teaser).
 * @param {Element} block
 */
export default function decorate(block) {
  trackPromotion(block, block.querySelector('h1, h2, h3, h4, strong')?.textContent || '');
}
