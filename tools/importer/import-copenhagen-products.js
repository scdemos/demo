/* eslint-disable */
/* global WebImporter */

import cardsParser from './parsers/cards.js';
import copenhagenCleanupTransformer from './transformers/copenhagen-cleanup.js';
import copenhagenSectionsTransformer from './transformers/copenhagen-sections.js';

const parsers = {
  'cards': cardsParser,
};

const PAGE_TEMPLATE = {
  name: 'copenhagen-products',
  description: 'Copenhagen tobacco products page with product category sections and product card grids',
  urls: [
    'https://6cad-108-6-175-67.ngrok-free.app/Copenhagen_Products.html',
  ],
  blocks: [
    {
      name: 'cards',
      instances: ['.gallery-items.grid'],
    },
  ],
  sections: [
    {
      id: 'section-1',
      name: 'Page Title',
      selector: '.productgallery-wrapper',
      style: 'dark',
      blocks: [],
      defaultContent: ['.productgallery-wrapper h1'],
    },
    {
      id: 'section-2',
      name: 'Product Categories',
      selector: ['.list-container.grid', '.columncontrol-wrapper'],
      style: 'dark',
      blocks: ['cards'],
      defaultContent: [
        '.sub-category-title.ff-typographyFontBrandPrimary',
        '.sub-category-title .h2.utility',
      ],
    },
  ],
};

const transformers = [
  copenhagenCleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1
    ? [copenhagenSectionsTransformer]
    : []),
];

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
          section: blockDef.section || null,
        });
      });
    });
  });

  return pageBlocks;
}

export default {
  transform: (payload) => {
    const { document, url, params } = payload;
    const main = document.body;

    executeTransformers('beforeTransform', main, payload);

    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    pageBlocks.forEach((block) => {
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      }
    });

    executeTransformers('afterTransform', main, payload);

    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

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
