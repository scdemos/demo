var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tools/importer/import-copenhagen-products.js
  var import_copenhagen_products_exports = {};
  __export(import_copenhagen_products_exports, {
    default: () => import_copenhagen_products_default
  });

  // tools/importer/parsers/cards.js
  function parse(element, { document }) {
    const items = element.querySelectorAll("li.productGridItem, li.item");
    const cells = [];
    items.forEach((item) => {
      const img = item.querySelector("img");
      const name = item.querySelector(".product-name, p");
      const imgCell = document.createDocumentFragment();
      if (img) {
        const picture = document.createElement("picture");
        const newImg = document.createElement("img");
        newImg.src = img.src;
        newImg.alt = name ? name.textContent.trim() : "";
        picture.appendChild(newImg);
        imgCell.appendChild(picture);
      }
      const textCell = document.createDocumentFragment();
      if (name) {
        const p = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = name.textContent.trim();
        p.appendChild(strong);
        textCell.appendChild(p);
      }
      cells.push([imgCell, textCell]);
    });
    if (cells.length > 0) {
      const block = WebImporter.Blocks.createBlock(document, { name: "cards", cells });
      element.replaceWith(block);
    }
  }

  // tools/importer/transformers/copenhagen-cleanup.js
  var H = { before: "beforeTransform", after: "afterTransform" };
  function transform(hookName, element, payload) {
    if (hookName === H.before) {
      WebImporter.DOMUtils.remove(element, [
        "#onetrust-consent-sdk",
        '[class*="onetrust"]',
        ".doj-component",
        ".sgw-video",
        ".sgw-progress-wrap"
      ]);
    }
    if (hookName === H.after) {
      WebImporter.DOMUtils.remove(element, [
        ".template-header-wrapper",
        ".template-siteheader-wrapper",
        ".fixed-header-wrapper",
        ".gtc-sgw",
        ".global-navigation-component",
        "header",
        "nav",
        "footer",
        ".template-footer-wrapper",
        ".globalfooter-component",
        ".sortfiltercontainer",
        ".filter-wrapper",
        ".productAd",
        ".skip-nav-link-container",
        "iframe",
        "link",
        "noscript",
        "source"
      ]);
    }
  }

  // tools/importer/transformers/copenhagen-sections.js
  var H2 = { before: "beforeTransform", after: "afterTransform" };
  function transform2(hookName, element, payload) {
    if (hookName === H2.after) {
      const sections = payload && payload.template && payload.template.sections;
      if (!sections || sections.length < 2) return;
      const document = element.ownerDocument;
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        const selectors = Array.isArray(section.selector) ? section.selector : [section.selector];
        let sectionEl = null;
        for (const sel of selectors) {
          if (sel) {
            sectionEl = element.querySelector(sel);
            if (sectionEl) break;
          }
        }
        if (!sectionEl) continue;
        if (section.style) {
          const sectionMetadata = WebImporter.Blocks.createBlock(document, {
            name: "Section Metadata",
            cells: { style: section.style }
          });
          sectionEl.after(sectionMetadata);
        }
        if (i > 0) {
          const hr = document.createElement("hr");
          sectionEl.before(hr);
        }
      }
    }
  }

  // tools/importer/import-copenhagen-products.js
  var parsers = {
    "cards": parse
  };
  var PAGE_TEMPLATE = {
    name: "copenhagen-products",
    description: "Copenhagen tobacco products page with product category sections and product card grids",
    urls: [
      "https://6cad-108-6-175-67.ngrok-free.app/Copenhagen_Products.html"
    ],
    blocks: [
      {
        name: "cards",
        instances: [".gallery-items.grid"]
      }
    ],
    sections: [
      {
        id: "section-1",
        name: "Page Title",
        selector: ".productgallery-wrapper",
        style: "dark",
        blocks: [],
        defaultContent: [".productgallery-wrapper h1"]
      },
      {
        id: "section-2",
        name: "Product Categories",
        selector: [".list-container.grid", ".columncontrol-wrapper"],
        style: "dark",
        blocks: ["cards"],
        defaultContent: [
          ".sub-category-title.ff-typographyFontBrandPrimary",
          ".sub-category-title .h2.utility"
        ]
      }
    ]
  };
  var transformers = [
    transform,
    ...PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [transform2] : []
  ];
  function executeTransformers(hookName, element, payload) {
    const enhancedPayload = __spreadProps(__spreadValues({}, payload), {
      template: PAGE_TEMPLATE
    });
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
            section: blockDef.section || null
          });
        });
      });
    });
    return pageBlocks;
  }
  var import_copenhagen_products_default = {
    transform: (payload) => {
      const { document, url, params } = payload;
      const main = document.body;
      executeTransformers("beforeTransform", main, payload);
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
      executeTransformers("afterTransform", main, payload);
      const hr = document.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document);
      WebImporter.rules.transformBackgroundImages(main, document);
      WebImporter.rules.adjustImageUrls(main, url, params.originalURL);
      const path = WebImporter.FileUtils.sanitizePath(
        new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html$/, "") || "/index"
      );
      return [{
        element: main,
        path,
        report: {
          title: document.title,
          template: PAGE_TEMPLATE.name,
          blocks: pageBlocks.map((b) => b.name)
        }
      }];
    }
  };
  return __toCommonJS(import_copenhagen_products_exports);
})();
