import { readBlockConfig } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

/**
 * Library metadata, read by the Experience Workspace block library (e.g. `description`).
 * On the library page itself the description shows under the variant's heading, so each
 * section reads as one labelled variant rather than page content.
 * @param {Element} block
 */
export default function decorate(block) {
  const { description } = readBlockConfig(block);
  block.textContent = '';
  if (description) block.append(createTag('p', { class: 'library-metadata-description' }, description));
}
