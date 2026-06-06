/* eslint-disable */
/* global WebImporter */

/**
 * Parser for carousel-hero
 * Base block: carousel-hero (container block with slide items)
 * Source: https://www.fortinet.com/
 * Selector: section.valprop--home.ftnt--billboard
 * Generated: 2026-06-05
 *
 * UE Model: carousel-hero-item
 * Fields per item:
 *   - media_image (reference) + media_imageAlt (collapsed)
 *   - content_text (richtext) - heading, description, CTAs
 *
 * Container block: each slide = one row, two columns (media | content)
 */
export default function parse(element, { document }) {
  // Select all slides from the carousel
  const slides = element.querySelectorAll('.valprop--home-slide.cycle-slide');

  // Collect all image URLs upfront to avoid any DOM timing issues
  const imageUrls = [];
  slides.forEach((slide) => {
    let imageUrl = '';
    const firstDiv = slide.children[0];
    if (firstDiv) {
      const styleAttr = firstDiv.getAttribute('style') || '';
      const urlMatch = styleAttr.match(/url\(['"]?(.*?)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        imageUrl = urlMatch[1];
      }
    }
    if (!imageUrl) {
      const imgEl = slide.querySelector('img');
      if (imgEl) {
        imageUrl = imgEl.getAttribute('src') || '';
      }
    }
    imageUrls.push(imageUrl);
  });

  const cells = [];

  slides.forEach((slide, index) => {
    const imageUrl = imageUrls[index];

    // Column 2: Content (heading, description, CTAs)
    const heading = slide.querySelector('h1, h2');
    const description = slide.querySelector('p');
    const ctaLinks = Array.from(slide.querySelectorAll('a[href]'));

    // Build media cell - create a wrapper with the image
    const mediaWrapper = document.createElement('div');
    mediaWrapper.appendChild(document.createComment(' field:media_image '));
    if (imageUrl) {
      const img = document.createElement('img');
      img.setAttribute('src', imageUrl);
      // Derive alt from the slide heading for accessibility
      const headingText = heading ? heading.textContent.trim() : '';
      img.setAttribute('alt', headingText || 'Hero slide ' + (index + 1));
      mediaWrapper.appendChild(img);
    }

    // Build content cell with field hint
    const contentWrapper = document.createElement('div');
    contentWrapper.appendChild(document.createComment(' field:content_text '));
    if (heading) {
      contentWrapper.appendChild(heading.cloneNode(true));
    }
    if (description) {
      contentWrapper.appendChild(description.cloneNode(true));
    }
    ctaLinks.forEach((cta) => {
      const p = document.createElement('p');
      const link = cta.cloneNode(true);
      link.removeAttribute('class');
      p.appendChild(link);
      contentWrapper.appendChild(p);
    });

    // Each slide = one row with two columns: [media, content]
    cells.push([mediaWrapper, contentWrapper]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-hero', cells });
  element.replaceWith(block);
}
