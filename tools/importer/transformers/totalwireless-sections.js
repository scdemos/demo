/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: Total Wireless section handling.
 *
 * The source page (AEM authored) nests all content under experiencefragment /
 * responsivegrid / aem-Grid columns. Each template section maps to one such
 * GridColumn. This transformer normalizes those into clean EDS sections by
 * inserting a section break (<hr>) before every section except the first,
 * and a Section Metadata block for any section that declares a `style`.
 *
 * Section selectors come straight from tools/importer/page-templates.json
 * (which were derived from the captured DOM). Runs in afterTransform only.
 */

const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName !== TransformHook.afterTransform) return;

  const template = payload && payload.template;
  const sections = (template && template.sections) || [];
  if (sections.length < 2) return;

  const doc = element.ownerDocument;

  // Process in reverse so inserting <hr>/metadata does not disturb the
  // positions of sections we have not handled yet.
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const section = sections[i];
    const sectionEl = element.querySelector(section.selector);
    if (!sectionEl) {
      // Selector didn't match on the parser-modified DOM — skip; nothing
      // to anchor the break/metadata to.
      // eslint-disable-next-line no-console
      console.warn('Section selector not found:', section.selector);
      continue;
    }

    // Section Metadata block, when the section declares a style.
    if (section.style) {
      const metadataBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells: { style: section.style },
      });
      sectionEl.after(metadataBlock);
    }

    // Section break before every section except the first.
    if (i > 0) {
      const hr = doc.createElement('hr');
      sectionEl.before(hr);
    }
  }
}
