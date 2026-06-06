/* eslint-disable */
/* global WebImporter */
/**
 * Parser for carousel-stories
 * Base block: carousel
 * Source: https://www.fortinet.com/
 * Selector: .customer-stories
 * Generated: 2026-06-05
 *
 * Extracts customer story carousel slides from Fortinet homepage.
 * Each slide has: image, heading, quote/description text, and CTA links.
 * Navigation thumbnails and page indicators are decorative and not imported.
 */
export default function parse(element, { document }) {
  // Each .banner is a carousel slide
  const banners = element.querySelectorAll(':scope > .banner');
  const cells = [];

  banners.forEach((banner) => {
    // Extract the banner image (the actual customer photo, not the decorative SVG dots)
    const image = banner.querySelector('img.banner-image');

    // Extract heading
    const heading = banner.querySelector('.banner-content h2');

    // Extract quote text as description
    const quote = banner.querySelector('.banner-content .quote');

    // Extract attribution (company/person)
    const company = banner.querySelector('.banner-content .company');

    // Extract CTA links (case study, video links)
    const ctaLinks = Array.from(banner.querySelectorAll('.customer-links a'));

    // Build the slide content cell matching library example structure:
    // Row: [image], [heading], [description], [CTA links]
    // Library format shows single-column rows, so each slide is one cell array
    const slideCell = [];

    if (image) {
      slideCell.push(image);
    }

    if (heading) {
      slideCell.push(heading);
    }

    // Combine quote and attribution as the description
    if (quote || company) {
      const descContainer = document.createElement('div');
      if (quote) {
        const p = document.createElement('p');
        p.textContent = quote.textContent.trim();
        descContainer.appendChild(p);
      }
      if (company) {
        const attr = document.createElement('p');
        attr.innerHTML = company.innerHTML;
        descContainer.appendChild(attr);
      }
      slideCell.push(descContainer);
    }

    // Add CTA links
    if (ctaLinks.length > 0) {
      ctaLinks.forEach((link) => {
        slideCell.push(link);
      });
    }

    if (slideCell.length > 0) {
      cells.push(slideCell);
    }
  });

  // Add the overall "Explore All Customer Stories" CTA as a final slide/row if present
  const overallCta = element.querySelector('.cta-wrapper a.security-anchor');
  if (overallCta) {
    // Normalize the link - remove the nested button, keep just the anchor
    const ctaLink = document.createElement('a');
    ctaLink.href = overallCta.href;
    ctaLink.textContent = overallCta.textContent.trim();
    cells.push([ctaLink]);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-stories', cells });
  element.replaceWith(block);
}
