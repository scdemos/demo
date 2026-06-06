/* eslint-disable */
/* global WebImporter */
/**
 * Parser: cards-platform
 * Base block: cards
 * Source: https://www.fortinet.com/
 * Selector: #fabric-area .all-boxes
 * Generated: 2026-06-05
 *
 * Source structure: 3 cards in .all-boxes, each .white-box with icon image,
 * .box-label h3 title, .box-detail containing linked title, description paragraph,
 * and ul list of product links.
 *
 * Target: Container block with card items. Each card row has 2 columns: [image] [text].
 * Model fields: image (reference), text (richtext).
 */
export default function parse(element, { document }) {
  const cards = element.querySelectorAll('.white-box');
  const cells = [];

  cards.forEach((card) => {
    // Extract image (icon) - may be an <img> element or a CSS background-image on .white-box
    let img = card.querySelector(':scope > img') || card.querySelector('img');
    if (!img) {
      // Check for CSS background-image on the card element itself
      const computedStyle = window.getComputedStyle(card);
      const bgImage = computedStyle.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (urlMatch && urlMatch[1]) {
          img = document.createElement('img');
          img.src = urlMatch[1];
          // Derive alt text from the card title
          const titleEl = card.querySelector('.box-label h3, .box-title h3');
          img.alt = titleEl ? titleEl.textContent.trim() : '';
        }
      }
    }

    // Build text content (richtext): title + description + links list
    const textFrag = document.createDocumentFragment();

    // Get the title from .box-detail a.box-title h3 (linked heading)
    const detailSection = card.querySelector('.box-detail');
    if (detailSection) {
      const titleLink = detailSection.querySelector('a.box-title');
      if (titleLink) {
        // Create a linked heading: h3 wrapping the anchor
        const h3 = document.createElement('h3');
        const link = document.createElement('a');
        link.href = titleLink.href;
        link.textContent = titleLink.textContent.trim();
        h3.appendChild(link);
        textFrag.appendChild(h3);
      }

      // Get description paragraph
      const desc = detailSection.querySelector('p');
      if (desc) {
        textFrag.appendChild(desc.cloneNode(true));
      }

      // Get product links list
      const ul = detailSection.querySelector('ul');
      if (ul) {
        textFrag.appendChild(ul.cloneNode(true));
      }
    }

    // Build image cell with field hint
    const imageCell = document.createDocumentFragment();
    imageCell.appendChild(document.createComment(' field:image '));
    if (img) {
      imageCell.appendChild(img.cloneNode(true));
    }

    // Build text cell with field hint
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));
    textCell.appendChild(textFrag);

    // Each card is a row with 2 columns: [image, text]
    cells.push([imageCell, textCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-platform', cells });
  element.replaceWith(block);
}
