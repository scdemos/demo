/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import tabsParser from './parsers/tabs.js';
import iconCardsParser from './parsers/icon-cards.js';
import columnsParser from './parsers/columns.js';
import cardsParser from './parsers/cards.js';
import ctaBannerParser from './parsers/cta-banner.js';

// TRANSFORMER IMPORTS
import paylocityCleanupTransformer from './transformers/paylocity-cleanup.js';
import paylocitySectionsTransformer from './transformers/paylocity-sections.js';

// PARSER REGISTRY
const parsers = {
  'tabs': tabsParser,
  'icon-cards': iconCardsParser,
  'columns': columnsParser,
  'cards': cardsParser,
  'cta-banner': ctaBannerParser,
};

// TRANSFORMER REGISTRY
const transformers = [
  paylocityCleanupTransformer,
  paylocitySectionsTransformer,
];

// PAGE TEMPLATE CONFIGURATION
const PAGE_TEMPLATE = {
  name: 'products-page',
  description: 'Products listing page showcasing Paylocity product suite and features',
  urls: ['https://www.paylocity.com/products/'],
  blocks: [
    {
      name: 'tabs',
      instances: ['.carousel']
    },
    {
      name: 'icon-cards',
      instances: ['.cmp-iconteaser']
    },
    {
      name: 'columns',
      instances: ['.cmp-columns']
    },
    {
      name: 'cards',
      instances: ['.cmp-teaser']
    },
    {
      name: 'cta-banner',
      instances: ['.cmp-container__bg']
    }
  ],
  sections: [
    {
      id: 'hero',
      name: 'Hero with Product Tabs',
      selector: '.carousel',
      style: null,
      blocks: ['tabs'],
      defaultContent: ['h1', 'p']
    },
    {
      id: 'capabilities',
      name: 'Platform Capabilities',
      selector: '.cmp-iconteaser',
      style: 'grey',
      blocks: ['icon-cards'],
      defaultContent: ['h3.cmp-title__text', 'h2.cmp-title__text']
    },
    {
      id: 'align-teams',
      name: 'Built to Align Teams',
      selector: '.cmp-columns',
      style: null,
      blocks: ['columns'],
      defaultContent: ['h2.cmp-title__text']
    },
    {
      id: 'testimonials',
      name: 'Client Testimonials',
      selector: '.cmp-teaser',
      style: null,
      blocks: ['cards'],
      defaultContent: ['h2.cmp-title__text']
    },
    {
      id: 'cta',
      name: 'CTA Banner',
      selector: '.cmp-container__bg',
      style: 'dark',
      blocks: ['cta-banner'],
      defaultContent: []
    },
    {
      id: 'demo-cta',
      name: 'Demo CTA',
      selector: '.cmp-container__bg',
      style: 'dark',
      blocks: ['cta-banner'],
      defaultContent: []
    }
  ]
};

/**
 * Execute all page transformers for a specific hook
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE
  };

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
      elements.forEach((element) => {
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
          section: blockDef.section || null
        });
      });
    });
  });

  return pageBlocks;
}

// EXPORT DEFAULT CONFIGURATION
export default {
  transform: (payload) => {
    const { document, url, html, params } = payload;

    const main = document.body;

    // 1. Execute beforeTransform transformers
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block - create block tables
    pageBlocks.forEach((block) => {
      const parser = parsers[block.name];
      if (parser) {
        try {
          const cells = parser(block.element, { document, url, params });
          if (cells && cells.length > 0) {
            const blockCells = [[block.name], ...cells];
            const table = WebImporter.DOMUtils.createTable(blockCells, document);
            block.element.replaceWith(table);
          }
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      }
    });

    // 4. Execute afterTransform transformers
    executeTransformers('afterTransform', main, payload);

    // 5. Remove header, nav, footer, and non-content elements
    WebImporter.DOMUtils.remove(main, [
      'header',
      'nav',
      'footer',
      '.onetrust-consent-sdk',
      '#onetrust-consent-sdk',
      '[id*="onetrust"]',
      'noscript',
      '[class*="cookie"]',
      '[class*="tracking"]',
    ]);

    // 6. Apply WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 7. Generate sanitized path
    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/products'
    );

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      }
    }];
  }
};
