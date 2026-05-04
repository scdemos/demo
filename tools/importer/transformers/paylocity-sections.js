/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Paylocity section breaks and section metadata.
 * All selectors verified against migration-work/cleaned.html (homepage DOM)
 * and tools/importer/page-templates.json.
 *
 * Runs in afterTransform only. Uses payload.template.sections to insert
 * <hr> section breaks and Section Metadata blocks for sections with a style.
 *
 * Section selectors from page-templates.json (homepage template):
 *   - hero:              .container.responsivegrid.styleLarge.pb-5
 *   - social-proof:      .cmp-columns.cols-md-6
 *   - capabilities:      .cmp-iconteaser
 *   - products-carousel:  .carousel
 *   - company-sizes:     .cmp-columns.styleColumnTwo-1by2
 *   - testimonial:       .carousel-item .cmp-text
 *   - differentiators:   .cmp-iconteaser
 *   - cta-dark:          .cmp-container__bg
 *   - resources:         .cmp-teaser
 *   - demo-cta:          .cmp-container__bg
 */
const H = { before: 'beforeTransform', after: 'afterTransform' };

/**
 * Find the first element matching a selector (string or array of strings).
 * If an array is provided, tries each selector and returns the first match.
 * Searches within the given root element.
 */
function findSectionElement(root, selector) {
  if (!selector) return null;
  const selectors = Array.isArray(selector) ? selector : [selector];
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Find the closest ancestor of el that is a direct child of root (main).
 * Section break <hr> elements need to be inserted at the top level of main,
 * not deep inside nested containers.
 */
function findTopLevelAncestor(root, el) {
  if (!el || el === root) return null;
  let current = el;
  while (current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current.parentElement === root ? current : null;
}

export default function transform(hookName, element, payload) {
  if (hookName === H.after) {
    const template = payload && payload.template;
    if (!template || !template.sections || template.sections.length < 2) {
      return;
    }

    const { document } = payload;
    const sections = template.sections;

    // Process sections in reverse order so DOM insertions don't shift
    // positions of elements we haven't processed yet.
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i];
      const sectionEl = findSectionElement(element, section.selector);

      if (!sectionEl) {
        continue;
      }

      // Find the top-level ancestor of the matched element within main
      const topAncestor = findTopLevelAncestor(element, sectionEl);
      if (!topAncestor) {
        continue;
      }

      // Insert Section Metadata block if this section has a style
      if (section.style) {
        const sectionMetadata = WebImporter.Blocks.createBlock(document, {
          name: 'Section Metadata',
          cells: { style: section.style },
        });
        // Insert Section Metadata after the section's top-level ancestor
        topAncestor.after(sectionMetadata);
      }

      // Insert <hr> before each non-first section (creates section break)
      if (i > 0) {
        const hr = document.createElement('hr');
        topAncestor.before(hr);
      }
    }
  }
}
