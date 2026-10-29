import { getMetadata, toClassName } from '../aem.js';
import {
  Alignment, result, fromIssues, didYouMean, matchesAny,
} from './utils.js';
import BLOCKS, { GATED_VARIANTS, UTILITY_CLASSES } from './blocks.js';
import TEMPLATES from './templates.js';

const SECTION_STYLES = [
  'light', 'dark-scheme', 'light-scheme', 'divider', 'gradient', 'highlight',
  'ink', 'rust', 'warm', 'center', 'login-teaser-image', 'tabs',
];
const SECTION_KEYS = ['tab-id', 'tab-title', 'view', 'mbox', 'mbox-action'];
const SECTION_INTERNAL_ATTRS = ['data-section-status'];

const blockLabel = (name) => `'${name}' block`;

const sectionsOf = (main) => [...main.querySelectorAll(':scope > .section')];

const blocksOf = (main) => [...main.querySelectorAll('.block[data-block-name]')]
  .map((source) => ({ name: source.dataset.blockName, source }));

function unknownBlocks(doc, main) {
  if (!main) return null;
  const names = Object.keys(BLOCKS);
  return blocksOf(main).flatMap(({ name }) => {
    const entry = BLOCKS[name];
    if (!entry) {
      return [{ message: `Unknown block '${name}'.`, hint: didYouMean(name, names) || 'Use a block from the block library.' }];
    }
    if (entry.authored === false) {
      return [{
        message: `${blockLabel(name)} is added automatically and should not be authored.`,
        hint: `Remove the ${name} block from the page.`,
      }];
    }
    return [];
  });
}

function unknownVariants(doc, main) {
  if (!main) return null;
  const gated = getMetadata('gated', doc).trim().toLowerCase() === 'true';
  return blocksOf(main).flatMap(({ name, source }) => {
    const entry = BLOCKS[name];
    if (!entry || entry.authored === false) return [];
    const allowed = entry.variants || [];
    return [...source.classList]
      .filter((cls) => cls !== name && cls !== 'block')
      .flatMap((variant) => {
        if (GATED_VARIANTS.includes(variant)) {
          return gated ? [] : [{
            message: `${blockLabel(name)} variant '${variant}' has no effect because the page is not gated.`,
            hint: 'Set Gated to true in the page metadata, or remove the variant.',
          }];
        }
        if (matchesAny([...allowed, ...UTILITY_CLASSES], variant)) return [];
        const named = allowed.filter((v) => typeof v === 'string');
        return [{
          message: `Unknown ${blockLabel(name)} variant '${variant}'.`,
          hint: didYouMean(variant, named)
            || (named.length ? `Supported variants: ${named.join(', ')}.` : `The ${name} block has no variants.`),
        }];
      });
  });
}

function blockContent(doc, main) {
  if (!main) return null;
  return blocksOf(main).flatMap(({ name, source }) => {
    const validate = BLOCKS[name]?.validate;
    if (!validate) return [];
    try {
      return validate(source) || [];
    } catch (error) {
      console.error(`preflight validator for ${name} failed`, error);
      return [];
    }
  });
}

function tabGrouping(doc, main) {
  if (!main) return null;
  const sections = sectionsOf(main);
  const isTab = (section) => section?.hasAttribute('data-tab-id');
  if (!sections.some(isTab)) return null;
  const claimed = new Set();
  sections.forEach((section, i) => {
    if (!section.querySelector('.tabs.block')) return;
    for (let j = i + 1; isTab(sections[j]); j += 1) claimed.add(j);
  });
  const leftover = sections
    .map((section, i) => (isTab(section) && !claimed.has(i) ? i : null))
    .filter((i) => i !== null);
  if (!leftover.length || leftover[leftover.length - 1] - leftover[0] + 1 === leftover.length) return [];
  return [{
    message: 'Tab sections not following a tabs block are separated by other sections; they are all merged into one set of tabs.',
    hint: 'Place sections with a Tab ID right after each other, or after a tabs block.',
  }];
}

function sectionMetadata(doc, main) {
  if (!main) return null;
  return sectionsOf(main).flatMap((section) => {
    const styles = [...section.classList]
      .filter((cls) => cls !== 'section' && !/-(container|wrapper)$/.test(cls)
        && !SECTION_STYLES.includes(cls) && !matchesAny(UTILITY_CLASSES, cls))
      .map((cls) => ({
        message: `Unknown section style '${cls}'.`,
        hint: didYouMean(cls, SECTION_STYLES) || `Supported styles: ${SECTION_STYLES.join(', ')}.`,
      }));
    const keys = [...section.attributes]
      .map(({ name }) => name)
      .filter((name) => name.startsWith('data-') && !SECTION_INTERNAL_ATTRS.includes(name))
      .map((name) => name.slice('data-'.length))
      .filter((key) => !SECTION_KEYS.includes(key))
      .map((key) => ({
        message: `Unknown section metadata '${key}'.`,
        hint: didYouMean(key, SECTION_KEYS) || `Supported section metadata: Style, ${SECTION_KEYS.join(', ')}.`,
      }));
    return [...styles, ...keys];
  });
}

function template(doc, main) {
  const raw = getMetadata('template', doc).trim();
  if (!raw) return null;
  const name = toClassName(raw);
  const validate = TEMPLATES[name];
  if (!validate) {
    const names = Object.keys(TEMPLATES);
    return [{
      message: `Unknown template '${raw}'.`,
      hint: didYouMean(name, names) || `Supported templates: ${names.join(', ')}.`,
    }];
  }
  if (raw !== name) {
    return [{
      message: `Template '${raw}' is not loaded.`,
      hint: `Set Template to '${name}'.`,
    }];
  }
  return validate(doc, main || doc.querySelector('main'));
}

const CHECKS = [
  { id: 'unknown-block', title: 'Known blocks', run: unknownBlocks },
  { id: 'unknown-variant', title: 'Known block variants', run: unknownVariants },
  { id: 'block-content', title: 'Block content', run: blockContent },
  { id: 'tab-grouping', title: 'Tab grouping', run: tabGrouping },
  { id: 'section-metadata', title: 'Section metadata', run: sectionMetadata },
  { id: 'template', title: 'Template', run: template },
];

async function runCheck({ id, title, run }, doc, main) {
  try {
    return result({ id, title, ...fromIssues(await run(doc, main)) });
  } catch (error) {
    return result({
      id,
      title,
      alignment: Alignment.NA,
      reasoning: `Check could not run: ${error.message}`,
    });
  }
}

export default async function preflight(doc = document, source = null, checks = CHECKS) {
  return Promise.all(checks.map((check) => runCheck(check, doc, source)));
}
