/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-stats variant.
 * Base block: cards-stats
 * Source: https://www.fortinet.com/
 * Selector: .global-scale .row
 * Generated: 2026-06-05
 *
 * Source structure: .row > .col-lg-4.col-sm-6 > .stat-info > .stat-num (span + suffix) + description text
 * Target structure: Container block - each stat item = one row with [image, text] columns
 * UE Model fields: image (reference), text (richtext)
 */
export default function parse(element, { document }) {
  // Extract all stat cards from the source
  const statItems = element.querySelectorAll(':scope > .col-lg-4, :scope > .col-sm-6, :scope > [class*="col-"]');

  const cells = [];

  statItems.forEach((item) => {
    const statInfo = item.querySelector('.stat-info');
    if (!statInfo) return;

    const statNum = statInfo.querySelector('.stat-num');

    // Build the text content cell with field hint
    const textFrag = document.createDocumentFragment();
    textFrag.appendChild(document.createComment(' field:text '));

    if (statNum) {
      // Extract the number from span and suffix from text node
      const span = statNum.querySelector('span');
      const numberValue = span ? span.textContent.trim() : '';

      // Get suffix letter (T, K, B, M) from text nodes in .stat-num
      let suffix = '';
      statNum.childNodes.forEach((node) => {
        if (node.nodeType === 3) { // text node
          const text = node.textContent.trim();
          if (text && text.length <= 2) {
            suffix = text;
          }
        }
      });

      // Get description text from .stat-info (text after .stat-num)
      let description = '';
      statInfo.childNodes.forEach((node) => {
        if (node.nodeType === 3) { // text node
          const text = node.textContent.trim();
          if (text) {
            description = text;
          }
        }
      });

      // Create a paragraph with the stat value as heading and description
      const heading = document.createElement('h3');
      heading.textContent = `${numberValue}${suffix}`;

      const desc = document.createElement('p');
      desc.textContent = description;

      textFrag.appendChild(heading);
      textFrag.appendChild(desc);
    }

    // Image cell is empty (no images in source stats)
    // For container blocks: each row = [image, text]
    cells.push(['', textFrag]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-stats', cells });
  element.replaceWith(block);
}
