/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import carouselHeroParser from './parsers/carousel-hero.js';
import carouselNewsParser from './parsers/carousel-news.js';
import cardsPlatformParser from './parsers/cards-platform.js';
import cardsProductParser from './parsers/cards-product.js';
import cardsStatsParser from './parsers/cards-stats.js';
import carouselStoriesParser from './parsers/carousel-stories.js';
import cardsTrustParser from './parsers/cards-trust.js';
import carouselEventsParser from './parsers/carousel-events.js';

// TRANSFORMER IMPORTS
import fortinetCleanupTransformer from './transformers/fortinet-cleanup.js';
import fortinetSectionsTransformer from './transformers/fortinet-sections.js';

// PARSER REGISTRY
const parsers = {
  'carousel-hero': carouselHeroParser,
  'carousel-news': carouselNewsParser,
  'cards-platform': cardsPlatformParser,
  'cards-product': cardsProductParser,
  'cards-stats': cardsStatsParser,
  'carousel-stories': carouselStoriesParser,
  'cards-trust': cardsTrustParser,
  'carousel-events': carouselEventsParser,
};

// PAGE TEMPLATE CONFIGURATION
const PAGE_TEMPLATE = {
  name: 'homepage',
  description: 'Fortinet corporate homepage with hero, product highlights, and promotional sections',
  urls: [
    'https://www.fortinet.com/',
  ],
  blocks: [
    {
      name: 'carousel-hero',
      instances: ['section.valprop--home.ftnt--billboard'],
    },
    {
      name: 'carousel-news',
      instances: ['.news-slider'],
    },
    {
      name: 'cards-platform',
      instances: ['#fabric-area .all-boxes'],
    },
    {
      name: 'cards-product',
      instances: ['.product-row.ftnt-platform'],
    },
    {
      name: 'cards-stats',
      instances: ['.global-scale .row'],
    },
    {
      name: 'carousel-stories',
      instances: ['.customer-stories'],
    },
    {
      name: 'cards-trust',
      instances: ['main.ftnt-main.trusted-section'],
    },
    {
      name: 'carousel-events',
      instances: ['.events-slider'],
    },
  ],
  sections: [
    {
      id: 'section-1',
      name: 'Hero',
      selector: '.C926-Billboard-Sliders',
      style: 'dark',
      blocks: ['carousel-hero'],
      defaultContent: [],
    },
    {
      id: 'section-2',
      name: 'News',
      selector: '.C814-Event-News-Slider:first-of-type',
      style: 'light',
      blocks: ['carousel-news'],
      defaultContent: ['.news-slider .section-label', '.news-slider h2'],
    },
    {
      id: 'section-3',
      name: 'Platform Pillars',
      selector: '#fabric-area',
      style: 'fortinet-red',
      blocks: ['cards-platform'],
      defaultContent: ['#fabric-area .section-label', '#fabric-area h2'],
    },
    {
      id: 'section-4',
      name: 'AI Security',
      selector: '.C48-Form-HTML-Snippet:nth-of-type(2)',
      style: 'light',
      blocks: [],
      defaultContent: [".section-label:contains('AI-DRIVEN')", "h2:contains('Secure and Transform')"],
    },
    {
      id: 'section-5',
      name: 'Platform Innovation',
      selector: '.container.platform-container',
      style: 'light',
      blocks: ['cards-product'],
      defaultContent: ['.platform-container .section-label', '.platform-container h2'],
    },
    {
      id: 'section-6',
      name: 'Threat Statistics',
      selector: '.global-scale',
      style: 'navy-dark',
      blocks: ['cards-stats'],
      defaultContent: ['.global-scale .section-label', '.global-scale h2', '.global-scale .moreinfo a'],
    },
    {
      id: 'section-7',
      name: 'Customer Stories',
      selector: '.customer-stories',
      style: 'light',
      blocks: ['carousel-stories'],
      defaultContent: [],
    },
    {
      id: 'section-8',
      name: 'Trust',
      selector: 'main.ftnt-main.trusted-section',
      style: 'light',
      blocks: ['cards-trust'],
      defaultContent: ['.trusted-section h2', '.trusted-section .head-description', '.trusted-section .cta-wrapper a'],
    },
    {
      id: 'section-9',
      name: 'Events',
      selector: '.events-slider',
      style: 'light',
      blocks: ['carousel-events'],
      defaultContent: ['.events-slider h2'],
    },
  ],
};

// TRANSFORMER REGISTRY
const transformers = [
  fortinetCleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [fortinetSectionsTransformer] : []),
];

/**
 * Execute all page transformers for a specific hook
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE,
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
    const { document, url, params } = payload;

    const main = document.body;

    // 1. Execute beforeTransform transformers (initial cleanup)
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page using embedded template
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block using registered parsers
    pageBlocks.forEach((block) => {
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

    // 4. Execute afterTransform transformers (final cleanup + section breaks)
    executeTransformers('afterTransform', main, payload);

    // 5. Apply WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Generate sanitized path
    const path = WebImporter.FileUtils.sanitizePath(
      new URL(params.originalURL).pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/index',
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
