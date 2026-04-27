/* eslint-disable */
/* global WebImporter */

/**
 * Parser for cards block.
 * Source: https://6cad-108-6-175-67.ngrok-free.app/Copenhagen_Products.html
 * Extracts product cards from .gallery-items.grid lists.
 * Each li.productGridItem has an image and product name.
 */
export default function parse(element, { document }) {
  const items = element.querySelectorAll('li.productGridItem, li.item');
  const cells = [];

  items.forEach((item) => {
    const img = item.querySelector('img');
    const name = item.querySelector('.product-name, p');

    const imgCell = document.createDocumentFragment();
    if (img) {
      const picture = document.createElement('picture');
      const newImg = document.createElement('img');
      newImg.src = img.src;
      newImg.alt = name ? name.textContent.trim() : '';
      picture.appendChild(newImg);
      imgCell.appendChild(picture);
    }

    const textCell = document.createDocumentFragment();
    if (name) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = name.textContent.trim();
      p.appendChild(strong);
      textCell.appendChild(p);
    }

    cells.push([imgCell, textCell]);
  });

  if (cells.length > 0) {
    const block = WebImporter.Blocks.createBlock(document, { name: 'cards', cells });
    element.replaceWith(block);
  }
}
