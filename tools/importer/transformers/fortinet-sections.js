/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Fortinet section breaks and section metadata.
 * Inserts <hr> section dividers and Section Metadata blocks.
 * Uses multiple fallback selectors for robustness across DOM contexts.
 */

const SECTIONS = [
  { selectors: ['.C926-Billboard-Sliders', 'section.valprop--home', '.valprop--home-slides-container'], style: 'dark' },
  { selectors: ['.C814-Event-News-Slider', '.news-slider', '.newstemplate.ftnt-news'], style: 'light' },
  { selectors: ['#fabric-area', '.ftnt-main.bg-red', '.fabric-bg'], style: 'fortinet-red' },
  { selectors: ['.container.platform-container', '.product-row.ftnt-platform'], style: 'light' },
  { selectors: ['.global-scale'], style: 'navy-dark' },
  { selectors: ['.customer-stories'], style: 'light' },
  { selectors: ['main.ftnt-main.trusted-section', '.trusted-section'], style: 'light' },
  { selectors: ['.events-slider', '.ftnt-events'], style: 'light' },
];

export default function transform(hookName, element, payload) {
  if (hookName !== 'afterTransform') return;

  const document = element.ownerDocument;
  const matched = [];

  for (const section of SECTIONS) {
    let el = null;
    for (const sel of section.selectors) {
      el = element.querySelector(sel);
      if (el) break;
    }
    if (el) matched.push({ el, style: section.style });
  }

  if (matched.length < 2) return;

  for (let i = matched.length - 1; i >= 0; i--) {
    const { el, style } = matched[i];

    if (style) {
      const sectionMetadata = WebImporter.Blocks.createBlock(document, {
        name: 'Section Metadata',
        cells: { style },
      });
      el.after(sectionMetadata);
    }

    if (i > 0) {
      const hr = document.createElement('hr');
      el.before(hr);
    }
  }
}
