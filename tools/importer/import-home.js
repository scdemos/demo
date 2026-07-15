/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import heroPromoParser from './parsers/hero-promo.js';
import columnsPromoParser from './parsers/columns-promo.js';
import cardsOptionsParser from './parsers/cards-options.js';
import columnsBenefitsParser from './parsers/columns-benefits.js';
import cardsPlansParser from './parsers/cards-plans.js';
import teaserPromoParser from './parsers/teaser-promo.js';
import productGridPicksParser from './parsers/product-grid-picks.js';
import cardsBentoParser from './parsers/cards-bento.js';
import faqHomeParser from './parsers/faq-home.js';

// TRANSFORMER IMPORTS
import cleanupTransformer from './transformers/totalwireless-cleanup.js';
import sectionsTransformer from './transformers/totalwireless-sections.js';
import dmImagesTransformer from './transformers/totalwireless-dm-images.js';

// PARSER REGISTRY
const parsers = {
  'hero-promo': heroPromoParser,
  'columns-promo': columnsPromoParser,
  'cards-options': cardsOptionsParser,
  'columns-benefits': columnsBenefitsParser,
  'cards-plans': cardsPlansParser,
  'teaser-promo': teaserPromoParser,
  'product-grid-picks': productGridPicksParser,
  'cards-bento': cardsBentoParser,
  'faq-home': faqHomeParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
  name: 'home',
  description: 'Total Wireless mobile home page - hero, plan/product grids, feature promos, and supporting content sections',
  urls: [
    'https://www.totalwireless.com/m/home',
  ],
  blocks: [
    {
      name: 'hero-promo',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(4)',
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(21)',
      ],
    },
    {
      name: 'columns-promo',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(6)',
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(19)',
      ],
    },
    {
      name: 'cards-options',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(8)',
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(28)',
      ],
    },
    {
      name: 'columns-benefits',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(10)',
      ],
    },
    {
      name: 'cards-plans',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(12)',
      ],
    },
    {
      name: 'teaser-promo',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(14)',
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(23)',
      ],
    },
    {
      name: 'product-grid-picks',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(17)',
      ],
    },
    {
      name: 'cards-bento',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(24)',
      ],
    },
    {
      name: 'faq-home',
      instances: [
        'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(27)',
      ],
    },
  ],
  sections: [
    { id: 'section-1', name: 'section-1', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(4)', style: null, blocks: ['hero-promo'], defaultContent: [] },
    { id: 'section-2', name: 'section-2', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(6)', style: null, blocks: ['columns-promo'], defaultContent: [] },
    { id: 'section-3', name: 'section-3', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(8)', style: null, blocks: ['cards-options'], defaultContent: [] },
    { id: 'section-4', name: 'section-4', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(10)', style: null, blocks: ['columns-benefits'], defaultContent: [] },
    { id: 'section-5', name: 'section-5', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(12)', style: null, blocks: ['cards-plans'], defaultContent: [] },
    { id: 'section-6', name: 'section-6', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(14)', style: null, blocks: ['teaser-promo'], defaultContent: [] },
    { id: 'section-7', name: 'section-7', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn:nth-child(15)', style: null, blocks: [], defaultContent: ['body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn:nth-child(15)'] },
    { id: 'section-8', name: 'section-8', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(17)', style: null, blocks: ['product-grid-picks'], defaultContent: [] },
    { id: 'section-9', name: 'section-9', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(19)', style: null, blocks: ['columns-promo'], defaultContent: [] },
    { id: 'section-10', name: 'section-10', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(21)', style: null, blocks: ['hero-promo'], defaultContent: [] },
    { id: 'section-11', name: 'section-11', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(23)', style: null, blocks: ['teaser-promo'], defaultContent: [] },
    { id: 'section-12', name: 'section-12', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(24)', style: null, blocks: ['cards-bento'], defaultContent: [] },
    { id: 'section-13', name: 'section-13', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(26)', style: null, blocks: [], defaultContent: ['body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(26)'] },
    { id: 'section-14', name: 'section-14', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(27)', style: null, blocks: ['faq-home'], defaultContent: [] },
    { id: 'section-15', name: 'section-15', selector: 'body > div.page-content > div.root.container.responsivegrid > div.cmp-container > div.aem-Grid > div.container.responsivegrid.aem-GridColumn > div.cmp-container > div.aem-Grid > div.experiencefragment.aem-GridColumn:nth-child(28)', style: null, blocks: ['cards-options'], defaultContent: [] },
  ],
};

// TRANSFORMER REGISTRY
// cleanup runs first (beforeTransform), sections + dm-images run in afterTransform.
const transformers = [
  cleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [sectionsTransformer] : []),
  dmImagesTransformer,
];

/**
 * Execute all page transformers for a specific hook
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = { ...payload, template: PAGE_TEMPLATE };
  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

/**
 * Find all blocks on the page based on the embedded template configuration
 */
function findBlocksOnPage(document, template) {
  const pageBlocks = [];
  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
      }
      elements.forEach((element) => {
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
          section: blockDef.section || null,
        });
      });
    });
  });
  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const {
      document, url, html, params,
    } = payload;

    const main = document.body;

    // 1. beforeTransform (initial cleanup)
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block using registered parsers
    pageBlocks.forEach((block) => {
      if (!block.element.parentNode) return; // Already replaced by earlier parser
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      } else {
        console.warn(`No parser found for block: ${block.name}`);
      }
    });

    // 4. afterTransform (section breaks + DM image anchors + final cleanup)
    executeTransformers('afterTransform', main, payload);

    // 5. WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Generate sanitized path
    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, ''),
    );

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
