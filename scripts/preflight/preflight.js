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

function ownSources(doc, sourceOf, selector) {
  const root = sourceOf(doc.querySelector('main'), null);
  return [...doc.querySelectorAll(`main ${selector}`)]
    .map((el) => ({ el, source: sourceOf(el, null) }))
    .filter(({ source }) => source && root?.contains(source));
}

function authoredBlocks(doc, sourceOf) {
  return ownSources(doc, sourceOf, '[data-block-name]')
    .map(({ el, source }) => ({ block: el, name: el.dataset.blockName, source }));
}

function unknownBlocks(doc, sourceOf) {
  const names = Object.keys(BLOCKS);
  return authoredBlocks(doc, sourceOf).flatMap(({ name }) => {
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

function unknownVariants(doc, sourceOf) {
  const gated = getMetadata('gated', doc).trim().toLowerCase() === 'true';
  return authoredBlocks(doc, sourceOf).flatMap(({ name, source }) => {
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

function blockContent(doc, sourceOf) {
  return authoredBlocks(doc, sourceOf).flatMap(({ block, name, source }) => {
    const validate = BLOCKS[name]?.validate;
    if (!validate) return [];
    try {
      return validate(source, block) || [];
    } catch (error) {
      console.error(`preflight validator for ${name} failed`, error);
      return [];
    }
  });
}

function tabGrouping(doc, sourceOf) {
  const main = sourceOf(doc.querySelector('main'));
  const sections = [...main.querySelectorAll(':scope > div')];
  const tabIndexes = sections
    .map((section, i) => (section.hasAttribute('data-tab-id') ? i : null))
    .filter((i) => i !== null);
  if (!tabIndexes.length) return null;
  const span = tabIndexes[tabIndexes.length - 1] - tabIndexes[0] + 1;
  if (span === tabIndexes.length) return [];
  return [{
    message: 'Tab sections are separated by other sections; all tab sections on a page are merged into one set of tabs.',
    hint: 'Place all sections with a Tab ID next to each other.',
  }];
}

function sectionMetadata(doc, sourceOf) {
  return ownSources(doc, sourceOf, '.section')
    .flatMap(({ source }) => {
      const styles = [...source.classList]
        .filter((cls) => cls !== 'section' && !cls.endsWith('-container')
          && !SECTION_STYLES.includes(cls) && !matchesAny(UTILITY_CLASSES, cls))
        .map((cls) => ({
          message: `Unknown section style '${cls}'.`,
          hint: didYouMean(cls, SECTION_STYLES) || `Supported styles: ${SECTION_STYLES.join(', ')}.`,
        }));
      const keys = [...source.attributes]
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

function template(doc, sourceOf) {
  const raw = getMetadata('template', doc);
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
  return validate(doc, sourceOf);
}

const CHECKS = [
  { id: 'unknown-block', title: 'Known blocks', run: unknownBlocks },
  { id: 'unknown-variant', title: 'Known block variants', run: unknownVariants },
  { id: 'block-content', title: 'Block content', run: blockContent },
  { id: 'tab-grouping', title: 'Tab grouping', run: tabGrouping },
  { id: 'section-metadata', title: 'Section metadata', run: sectionMetadata },
  { id: 'template', title: 'Template', run: template },
];

async function runCheck({ id, title, run }, doc, sourceOf) {
  try {
    return result({ id, title, ...fromIssues(await run(doc, sourceOf)) });
  } catch (error) {
    return result({
      id,
      title,
      alignment: Alignment.NA,
      reasoning: `Check could not run: ${error.message}`,
    });
  }
}

export default async function preflight(doc = document, sources = new WeakMap(), checks = CHECKS) {
  const sourceOf = (el, fallback = el) => (el && sources.get(el)) || fallback;
  return Promise.all(checks.map((check) => runCheck(check, doc, sourceOf)));
}
