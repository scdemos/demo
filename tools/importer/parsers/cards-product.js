/* eslint-disable */
/* global WebImporter */

/**
 * Parser: cards-product
 * Base block: cards
 * Source selector: .product-row.ftnt-platform
 * Model: container block with child "card" items (fields: image, text)
 * Generated: 2026-06-05
 */
export default function parse(element, { document }) {
  // Each .product-card is a child item in the container block
  // Container model: each card = one row, with columns: [image, text]
  // "text" field is richtext containing: title, description, and optional link
  const cards = element.querySelectorAll('.product-card');
  const cells = [];

  cards.forEach((card) => {
    // Extract image
    const image = card.querySelector('img.product-image');

    // Build the image cell with field hint
    const imageCell = document.createDocumentFragment();
    imageCell.appendChild(document.createComment(' field:image '));
    if (image) {
      imageCell.appendChild(image);
    }

    // Build the text cell (richtext: header label, title, description, and link if card is an anchor)
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));

    // Extract header label (e.g. "ONE OPERATING SYSTEM", "ASIC POWERED")
    const headerSpan = card.querySelector('.product-card-header span');
    if (headerSpan) {
      const label = document.createElement('p');
      label.textContent = headerSpan.textContent.trim();
      textCell.appendChild(label);
    }

    // Extract title
    const title = card.querySelector('b.product-title, .product-title');
    if (title) {
      const heading = document.createElement('h3');
      heading.textContent = title.textContent.trim();
      textCell.appendChild(heading);
    }

    // Extract description
    const desc = card.querySelector('p.product-desc');
    if (desc) {
      const paragraph = document.createElement('p');
      paragraph.textContent = desc.textContent.trim();
      textCell.appendChild(paragraph);
    }

    // If the card itself is a link, add it as a CTA
    const cardLink = card.closest('a.product-card') || (card.tagName === 'A' ? card : null);
    if (cardLink && cardLink.href) {
      const link = document.createElement('a');
      link.href = cardLink.href;
      link.textContent = title ? title.textContent.trim() : 'Learn more';
      textCell.appendChild(link);
    }

    cells.push([imageCell, textCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-product', cells });
  element.replaceWith(block);
}
