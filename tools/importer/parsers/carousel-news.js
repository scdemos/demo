/* eslint-disable */
/* global WebImporter */

/**
 * Parser: carousel-news
 * Base block: carousel
 * Source: https://www.fortinet.com/
 * Selector: .news-slider
 * Generated: 2026-06-05
 *
 * Extracts news carousel items from the Fortinet homepage news slider section.
 * Each slide contains: image, title heading, description text, and CTA link.
 * The .news-slider element contains only the section header; actual news items
 * are in a sibling .ftnt-news container, so we traverse to the parent to find them.
 */
export default function parse(element, { document }) {
  // The element is .news-slider which only has the section header.
  // The actual news items are in a sibling element .ftnt-news under the same parent.
  const parent = element.parentElement;
  const newsContainer = parent ? parent.querySelector('.ftnt-news, .ftnt-section.ftnt-news') : null;

  // Collect all news product items
  const items = newsContainer
    ? Array.from(newsContainer.querySelectorAll('.ftnt-product'))
    : [];

  const cells = [];

  items.forEach((item) => {
    // Extract image - prefer data-src (lazy loaded), fall back to src
    const img = item.querySelector('img.ftnt-image, img.lozad, picture img, .ftnt-picture img');
    if (img) {
      const dataSrc = img.getAttribute('data-src');
      if (dataSrc && dataSrc.startsWith('http')) {
        img.setAttribute('src', dataSrc);
      }
      cells.push([img]);
    }

    // Extract title
    const titleEl = item.querySelector('.ftnt-news-title, .ftnt-detail b, .ftnt-detail a b');
    if (titleEl) {
      const heading = document.createElement('p');
      heading.textContent = titleEl.textContent.trim();
      cells.push([heading]);
    }

    // Extract description
    const descEl = item.querySelector('.ftnt-news-description, .ftnt-detail span');
    if (descEl) {
      const desc = document.createElement('p');
      desc.textContent = descEl.textContent.trim();
      cells.push([desc]);
    }

    // Extract CTA link
    const ctaLink = item.querySelector('a.ftnt-download-anchor, .ftnt-detail a.ftnt-download-anchor');
    if (ctaLink) {
      const link = document.createElement('a');
      link.href = ctaLink.href;
      link.textContent = ctaLink.textContent.trim();
      cells.push([link]);
    }
  });

  // If no items found, create a minimal placeholder row
  if (cells.length === 0) {
    cells.push(['']);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-news', cells });
  element.replaceWith(block);
}
