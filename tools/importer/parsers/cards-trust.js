/* eslint-disable */
/* global WebImporter */

/**
 * Parser: cards-trust
 * Base block: cards
 * Source: https://www.fortinet.com/
 * Selector: main.ftnt-main.trusted-section
 * Generated: 2026-06-05
 *
 * Extracts trust pillar cards from the Fortinet homepage.
 * Each card has: icon image, title, description, and a link.
 * Source has 4 cards (Trusted Company, Trusted Products, Trusted Processes, Trusted Partners).
 *
 * Target table structure (from library-example.md):
 *   Row per card: image | title | description | link
 */
export default function parse(element, { document }) {
  // Select all trust card wrappers within the row container
  const trustTiles = element.querySelectorAll('.trust-wrapper a.trusted-tile');

  const cells = [];

  trustTiles.forEach((tile) => {
    // Extract image from .trust-header
    const img = tile.querySelector('.trust-header img');

    // Extract title from .trust-header > div (the text div next to the img)
    const titleDiv = tile.querySelector('.trust-header div');
    const titleText = titleDiv ? titleDiv.textContent.trim() : '';

    // Extract description from .trust-info
    const infoDiv = tile.querySelector('.trust-info');
    const descriptionText = infoDiv ? infoDiv.textContent.trim() : '';

    // Build the link using the tile's href and .trust-link text
    const linkText = tile.querySelector('.trust-link');
    const linkLabel = linkText ? linkText.textContent.trim() : 'Learn More';
    const linkHref = tile.getAttribute('href') || '';

    // Build image cell
    const imgCell = [];
    if (img) {
      const clonedImg = img.cloneNode(true);
      imgCell.push(clonedImg);
    }

    // Build title cell
    const titleEl = document.createElement('p');
    titleEl.textContent = titleText;

    // Build description cell
    const descEl = document.createElement('p');
    descEl.textContent = descriptionText;

    // Build link cell
    const linkEl = document.createElement('a');
    linkEl.href = linkHref;
    linkEl.textContent = linkLabel;

    // Each card is a row with 4 cells: image, title, description, link
    cells.push(imgCell.length ? imgCell : ['']);
    cells.push([titleEl]);
    cells.push([descEl]);
    cells.push([linkEl]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-trust', cells });
  element.replaceWith(block);
}
