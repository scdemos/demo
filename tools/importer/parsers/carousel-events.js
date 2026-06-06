/* eslint-disable */
/* global WebImporter */

/**
 * Parser: carousel-events
 * Base block: carousel
 * Source: https://www.fortinet.com/
 * Selector: .events-slider
 * Generated: 2026-06-05
 *
 * UE Model: carousel-events-item (container block)
 * Fields per item:
 *   - media_image (reference) + media_imageAlt (collapsed)
 *   - content_text (richtext) - heading, date, description, CTA
 *
 * Container block: each event slide = one row, two columns (media | content)
 *
 * Extracts event carousel items from the Fortinet homepage events slider section.
 * Each slide contains: image, event title, date/description, and REGISTER NOW CTA.
 * The .events-slider element contains the section header; actual event items
 * may be direct children or in a sibling container (ftnt-news pattern).
 */
export default function parse(element, { document }) {
  // Try to find event items within the element itself first
  let items = Array.from(element.querySelectorAll('.ftnt-product, .event-item, .slide-item, .slick-slide'));

  // If no items found directly, check for a sibling container (similar to news-slider pattern)
  if (items.length === 0) {
    const parent = element.parentElement;
    if (parent) {
      const siblingContainer = parent.querySelector('.ftnt-news, .ftnt-events, .event-list, .slick-slider');
      if (siblingContainer) {
        items = Array.from(siblingContainer.querySelectorAll('.ftnt-product, .event-item, .slide-item, .slick-slide'));
      }
    }
  }

  // Fallback: look for any repeated item containers with links and images
  if (items.length === 0) {
    items = Array.from(element.querySelectorAll('[class*="product"], [class*="event"], [class*="slide"]'));
  }

  const cells = [];

  items.forEach((item, index) => {
    // Build media cell with field hint
    const mediaWrapper = document.createElement('div');
    mediaWrapper.appendChild(document.createComment(' field:media_image '));

    // Extract image - prefer data-src (lazy loaded), fall back to src
    const img = item.querySelector('img.ftnt-image, img.lozad, picture img, img');
    if (img) {
      const clonedImg = img.cloneNode(true);
      const dataSrc = clonedImg.getAttribute('data-src');
      if (dataSrc && dataSrc.startsWith('http')) {
        clonedImg.setAttribute('src', dataSrc);
      }
      // Ensure alt text is present
      if (!clonedImg.getAttribute('alt')) {
        const titleEl = item.querySelector('h3, h4, h5, .ftnt-news-title, b, strong');
        clonedImg.setAttribute('alt', titleEl ? titleEl.textContent.trim() : 'Event slide ' + (index + 1));
      }
      mediaWrapper.appendChild(clonedImg);
    }

    // Build content cell with field hint
    const contentWrapper = document.createElement('div');
    contentWrapper.appendChild(document.createComment(' field:content_text '));

    // Extract title/heading
    const titleEl = item.querySelector('h3, h4, h5, .ftnt-news-title, .ftnt-detail b, .ftnt-detail a b');
    if (titleEl) {
      const heading = document.createElement('h3');
      heading.textContent = titleEl.textContent.trim();
      contentWrapper.appendChild(heading);
    }

    // Extract date or description text
    const descEl = item.querySelector('.ftnt-news-description, .ftnt-detail span, .event-date, p');
    if (descEl) {
      const desc = document.createElement('p');
      desc.textContent = descEl.textContent.trim();
      contentWrapper.appendChild(desc);
    }

    // Extract CTA link (e.g., REGISTER NOW)
    const ctaLink = item.querySelector('a.ftnt-download-anchor, a[href]:not(.ftnt-detail a b), a[href]');
    if (ctaLink) {
      const p = document.createElement('p');
      const link = document.createElement('a');
      link.href = ctaLink.href || ctaLink.getAttribute('href') || '';
      link.textContent = ctaLink.textContent.trim() || 'Register Now';
      p.appendChild(link);
      contentWrapper.appendChild(p);
    }

    // Each event slide = one row with two columns: [media, content]
    cells.push([mediaWrapper, contentWrapper]);
  });

  // If no items found, create a minimal placeholder row with proper field hints
  if (cells.length === 0) {
    const mediaWrapper = document.createElement('div');
    mediaWrapper.appendChild(document.createComment(' field:media_image '));
    const contentWrapper = document.createElement('div');
    contentWrapper.appendChild(document.createComment(' field:content_text '));
    cells.push([mediaWrapper, contentWrapper]);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-events', cells });
  element.replaceWith(block);
}
