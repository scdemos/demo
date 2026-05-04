/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import heroParser from './parsers/hero.js';
import logoWallParser from './parsers/logo-wall.js';
import iconCardsParser from './parsers/icon-cards.js';
// tabs parser not used on homepage
import columnsParser from './parsers/columns.js';
import testimonialParser from './parsers/testimonial.js';
import ctaBannerParser from './parsers/cta-banner.js';
import cardsParser from './parsers/cards.js';

// TRANSFORMER IMPORTS
import paylocityCleanupTransformer from './transformers/paylocity-cleanup.js';
import paylocitySectionsTransformer from './transformers/paylocity-sections.js';

// PARSER REGISTRY
const parsers = {
  'hero': heroParser,
  'cards': cardsParser,
  'icon-cards': iconCardsParser,
  'testimonial': testimonialParser,
  'columns': columnsParser,
  'logo-wall': logoWallParser,
  'cta-banner': ctaBannerParser,
};

// TRANSFORMER REGISTRY
const transformers = [
  paylocityCleanupTransformer,
  paylocitySectionsTransformer,
];

// PAGE TEMPLATE CONFIGURATION
const PAGE_TEMPLATE = {
  name: 'homepage',
  description: 'Paylocity homepage with hero, product highlights, testimonials, and CTAs',
  urls: ['https://www.paylocity.com/'],
  blocks: [
    {
      name: 'hero',
      instances: ['.container.responsivegrid.styleLarge.pb-5']
    },
    {
      name: 'cards',
      instances: ['.cmp-flexgrid']
    },
    {
      name: 'icon-cards',
      instances: ['.carousel']
    },
    {
      name: 'columns',
      instances: ['.cmp-columns.styleColumn1by3']
    },
    {
      name: 'testimonial',
      instances: ['.carousel-item .cmp-text']
    },
    {
      name: 'logo-wall',
      instances: ['.imagegallery']
    },
    {
      name: 'cta-banner',
      instances: ['.cmp-container__bg']
    }
  ],
  sections: [
    {
      id: 'hero',
      name: 'Hero Section',
      selector: '.container.responsivegrid.styleLarge.pb-5',
      style: null,
      blocks: ['hero'],
      defaultContent: []
    },
    {
      id: 'social-proof',
      name: 'Social Proof Logos',
      selector: '.cmp-columns.cols-md-6',
      style: null,
      blocks: ['logo-wall'],
      defaultContent: []
    },
    {
      id: 'capabilities',
      name: 'Platform Capabilities',
      selector: '.cmp-iconteaser',
      style: null,
      blocks: ['icon-cards'],
      defaultContent: ['h3.cmp-title__text', 'h2.cmp-title__text']
    },
    {
      id: 'products-carousel',
      name: 'Ultimate Platform Tabs',
      selector: '.carousel',
      style: 'grey',
      blocks: ['tabs'],
      defaultContent: ['h2.cmp-title__text']
    },
    {
      id: 'company-sizes',
      name: 'Supporting All Company Sizes',
      selector: '.cmp-columns.styleColumnTwo-1by2',
      style: null,
      blocks: ['columns'],
      defaultContent: ['h2.cmp-title__text']
    },
    {
      id: 'testimonial',
      name: 'Testimonial',
      selector: '.carousel-item .cmp-text',
      style: null,
      blocks: ['testimonial'],
      defaultContent: []
    },
    {
      id: 'differentiators',
      name: 'What Makes Paylocity Different',
      selector: '.cmp-iconteaser',
      style: null,
      blocks: ['icon-cards'],
      defaultContent: ['h2.cmp-title__text']
    },
    {
      id: 'cta-dark',
      name: 'Break Free CTA',
      selector: '.cmp-container__bg',
      style: 'dark',
      blocks: ['cta-banner'],
      defaultContent: []
    },
    {
      id: 'resources',
      name: 'Featured Resources',
      selector: '.cmp-teaser',
      style: 'grey',
      blocks: ['cards'],
      defaultContent: ['h2.cmp-title__text']
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

    // 1. Execute beforeTransform transformers (initial cleanup)
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page using embedded template
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Sort blocks deepest-first so nested blocks are extracted before parents replace them
    pageBlocks.sort((a, b) => {
      if (a.element.contains(b.element)) return 1;
      if (b.element.contains(a.element)) return -1;
      return 0;
    });

    // 4. Parse nested blocks first, moving results outside their parent block elements
    pageBlocks.forEach((block) => {
      const parser = parsers[block.name];
      if (!parser || !block.element.isConnected) return;

      // Check if this block is nested inside another block's element
      const isNested = pageBlocks.some((other) => other !== block
        && other.element.contains(block.element));

      if (isNested) {
        try {
          const cells = parser(block.element, { document, url, params });
          if (cells && cells.length > 0) {
            const blockCells = [[block.name], ...cells];
            const table = WebImporter.DOMUtils.createTable(blockCells, document);
            // Find the outermost parent block and insert after it
            let parentEl = block.element;
            pageBlocks.forEach((other) => {
              if (other !== block && other.element.contains(block.element)) {
                parentEl = other.element;
              }
            });
            parentEl.parentNode.insertBefore(table, parentEl.nextSibling);
            block.element.remove();
            block.processed = true;
          }
        } catch (e) {
          console.error(`Failed to parse nested ${block.name}:`, e);
        }
      }
    });

    // 5. Parse remaining (non-nested) blocks
    pageBlocks.forEach((block) => {
      if (block.processed) return;
      const parser = parsers[block.name];
      if (parser && block.element.isConnected) {
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

    // 5. Execute afterTransform transformers (final cleanup + section breaks)
    executeTransformers('afterTransform', main, payload);

    // 6. Remove header, nav, footer, and non-content elements
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

    // 7. Apply WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 8. Generate sanitized path
    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/index'
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
