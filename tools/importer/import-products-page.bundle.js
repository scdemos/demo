/* eslint-disable */
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

  // tools/importer/import-products-page.js
  var import_products_page_exports = {};
  __export(import_products_page_exports, {
    default: () => import_products_page_default
  });

  // tools/importer/parsers/tabs.js
  function parse(element, { document }) {
    const cells = [];
    const items = element.querySelectorAll(".carousel-item");
    items.forEach((item) => {
      const row = document.createElement("div");
      const heading = item.querySelector("h3, h2, .cmp-teaser__title, .cmp-title__text");
      if (heading) {
        const h = document.createElement("h3");
        h.textContent = heading.textContent.trim();
        row.appendChild(h);
      }
      const desc = item.querySelector(".cmp-teaser__description, .cmp-text, p");
      if (desc) {
        const p = document.createElement("p");
        p.textContent = desc.textContent.trim();
        row.appendChild(p);
      }
      const img = item.querySelector("img");
      if (img) {
        const imgEl = document.createElement("img");
        imgEl.src = img.src || img.getAttribute("src") || "";
        imgEl.alt = img.alt || "";
        row.appendChild(imgEl);
      }
      const link = item.querySelector("a");
      if (link) {
        const a = document.createElement("a");
        a.href = link.href || link.getAttribute("href") || "";
        a.textContent = link.textContent.trim() || "Learn More";
        row.appendChild(a);
      }
      if (row.children.length > 0) {
        cells.push([row]);
      }
    });
    return cells;
  }

  // tools/importer/parsers/icon-cards.js
  function parse2(element, { document }) {
    const cells = [];
    const icon = element.querySelector(".cmp-iconteaser__icon img, .cmp-iconteaser__icon");
    const heading = element.querySelector(".cmp-iconteaser__heading-title, h3");
    const description = element.querySelector(".cmp-iconteaser__description, p");
    const link = element.querySelector("a");
    const contentDiv = document.createElement("div");
    if (heading) {
      const h3 = document.createElement("h3");
      h3.textContent = heading.textContent.trim();
      contentDiv.appendChild(h3);
    }
    if (description) {
      const p = document.createElement("p");
      p.textContent = description.textContent.trim();
      contentDiv.appendChild(p);
    }
    if (link) {
      const a = document.createElement("a");
      a.href = link.href || link.getAttribute("href") || "";
      a.textContent = link.textContent.trim() || "Learn More";
      contentDiv.appendChild(a);
    }
    if (icon) {
      const iconImg = icon.querySelector("img") || icon;
      if (iconImg.tagName === "IMG") {
        const img = document.createElement("img");
        img.src = iconImg.src || iconImg.getAttribute("src") || "";
        img.alt = iconImg.alt || "";
        cells.push([img, contentDiv]);
      } else {
        cells.push([contentDiv]);
      }
    } else {
      cells.push([contentDiv]);
    }
    return cells;
  }

  // tools/importer/parsers/columns.js
  function parse3(element, { document }) {
    const cells = [];
    const columnDivs = element.querySelectorAll(":scope > .parsys, :scope > .cmp-columns__column");
    columnDivs.forEach((col) => {
      const colDiv = document.createElement("div");
      const img = col.querySelector("img");
      if (img) {
        const imgEl = document.createElement("img");
        imgEl.src = img.src || img.getAttribute("src") || "";
        imgEl.alt = img.alt || "";
        colDiv.appendChild(imgEl);
      }
      const heading = col.querySelector("h3, h4");
      if (heading) {
        const h = document.createElement("h4");
        h.textContent = heading.textContent.trim();
        colDiv.appendChild(h);
      }
      const texts = col.querySelectorAll(".cmp-text p, p");
      texts.forEach((t) => {
        const text = t.textContent.trim();
        if (text && !t.closest("h3, h4")) {
          const p = document.createElement("p");
          p.textContent = text;
          colDiv.appendChild(p);
        }
      });
      const link = col.querySelector('a.cmp-button, a[class*="button"]');
      if (link) {
        const a = document.createElement("a");
        a.href = link.href || link.getAttribute("href") || "";
        a.textContent = link.textContent.trim() || "Learn More";
        colDiv.appendChild(a);
      }
      if (colDiv.children.length > 0) {
        cells.push([colDiv]);
      }
    });
    return cells;
  }

  // tools/importer/parsers/cards.js
  function parse4(element, { document }) {
    const cells = [];
    const image = element.querySelector(".cmp-teaser__image img, .cmp-image__image, img");
    const title = element.querySelector(".cmp-teaser__title, h3");
    const description = element.querySelector(".cmp-teaser__description, .cmp-teaser__description p");
    const link = element.querySelector("a.cmp-teaser__action-link, a");
    const contentDiv = document.createElement("div");
    if (title) {
      const h3 = document.createElement("h3");
      h3.textContent = title.textContent.trim();
      contentDiv.appendChild(h3);
    }
    if (description) {
      const p = document.createElement("p");
      p.textContent = description.textContent.trim();
      contentDiv.appendChild(p);
    }
    if (link) {
      const a = document.createElement("a");
      a.href = link.href || link.getAttribute("href") || "";
      a.textContent = link.textContent.trim() || "Learn More";
      contentDiv.appendChild(a);
    }
    if (image) {
      const img = document.createElement("img");
      img.src = image.src || image.getAttribute("src") || "";
      img.alt = image.alt || "";
      cells.push([img, contentDiv]);
    } else {
      cells.push([contentDiv]);
    }
    return cells;
  }

  // tools/importer/parsers/cta-banner.js
  function parse5(element, { document }) {
    const cells = [];
    const heading = element.querySelector("h2, h1");
    if (heading) {
      const h2 = document.createElement("h2");
      h2.textContent = heading.textContent.trim();
      cells.push([h2]);
    }
    const paragraphs = element.querySelectorAll("p, .cmp-text p");
    const descTexts = [];
    paragraphs.forEach((p) => {
      const text = p.textContent.trim();
      if (text && !p.closest("h2, h1") && !p.querySelector("a")) {
        descTexts.push(text);
      }
    });
    if (descTexts.length > 0) {
      const p = document.createElement("p");
      p.textContent = descTexts.join(" ");
      cells.push([p]);
    }
    const link = element.querySelector('a.cmp-button, a[class*="button"]');
    if (link) {
      const a = document.createElement("a");
      a.href = link.href || link.getAttribute("href") || "";
      a.textContent = link.textContent.trim();
      cells.push([a]);
    }
    return cells;
  }

  // tools/importer/transformers/paylocity-cleanup.js
  var H = { before: "beforeTransform", after: "afterTransform" };
  function cleanScene7Urls(element) {
    element.querySelectorAll('img[src*="s7d9.scene7.com"]').forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        const cleaned = src.split("?")[0];
        img.setAttribute("src", cleaned);
      }
    });
  }
  function unwrapAemGridDivs(element) {
    const grids = Array.from(element.querySelectorAll(".aem-Grid"));
    grids.reverse().forEach((grid) => {
      while (grid.firstChild) {
        grid.parentNode.insertBefore(grid.firstChild, grid);
      }
      grid.remove();
    });
  }
  function cleanAttributes(element) {
    element.querySelectorAll("*").forEach((el) => {
      const attrsToRemove = [];
      for (let i = 0; i < el.attributes.length; i++) {
        const name = el.attributes[i].name;
        if (name.startsWith("data-cmp-") || name.startsWith("kameleoon") || name.startsWith("data-hs") || name.startsWith("data-hsfc") || name === "data-hover-enabled" || name === "data-placeholder-text" || name === "data-test" || name === "data-slide" || name === "data-ride" || name === "data-interval" || name === "data-pause" || name === "data-wrap" || name === "data-link-valid" || name === "data-dl_value" || name === "data-header-override" || name === "data-field-name" || name === "data-field-source" || name === "data-field-value" || name === "data-align-image" || name === "data-dropdown-init" || name === "data-render-version" || name === "data-instance-id" || name === "data-form-id" || name === "data-portal-id" || name === "data-hublet" || name === "data-fetched" || name === "data-loaded" || name === "data-region" || name === "data-field-adjusted") {
          attrsToRemove.push(name);
        }
      }
      attrsToRemove.forEach((attr) => el.removeAttribute(attr));
      if (el.hasAttribute("style")) {
        el.removeAttribute("style");
      }
      if (el.hasAttribute("itemscope")) el.removeAttribute("itemscope");
      if (el.hasAttribute("itemtype")) el.removeAttribute("itemtype");
      if (el.hasAttribute("itemprop")) el.removeAttribute("itemprop");
    });
  }
  function removeDuplicateResponsiveContainers(element) {
    element.querySelectorAll('[class*="pcty_d-md-none"]').forEach((el) => {
      el.remove();
    });
    element.querySelectorAll('[class*="thick-red-dotted-border"]').forEach((el) => {
      el.remove();
    });
  }
  function transform(hookName, element, payload) {
    if (hookName === H.before) {
      WebImporter.DOMUtils.remove(element, [
        "header",
        "nav",
        "footer",
        "#mainNav",
        ".cmp-page__skiptomaincontent",
        '[role="navigation"]'
      ]);
      WebImporter.DOMUtils.remove(element, [
        ".onetrust-consent-sdk",
        "#onetrust-consent-sdk",
        '[id*="onetrust"]',
        '[class*="optanon"]',
        "noscript",
        '[src*="googletagmanager"]',
        '[src*="facebook.com/tr"]',
        '[src*="bat.bing.com"]',
        '[src*="px.ads.linkedin"]',
        '[src*="analytics.o11"]'
      ]);
      WebImporter.DOMUtils.remove(element, [".featuredmessageflyout"]);
      WebImporter.DOMUtils.remove(element, [
        ".hubspot-forms",
        ".hs-form-html",
        ".hubspot-cmp-wrapper"
      ]);
      WebImporter.DOMUtils.remove(element, [
        ".form-storage-element",
        ".form-partnerstack-element",
        ".overrides"
      ]);
      removeDuplicateResponsiveContainers(element);
      WebImporter.DOMUtils.remove(element, [".separator"]);
      cleanScene7Urls(element);
    }
    if (hookName === H.after) {
      WebImporter.DOMUtils.remove(element, [
        ".carousel-controls",
        ".carousel-indicators"
      ]);
      WebImporter.DOMUtils.remove(element, [".sharePopOver_container"]);
      WebImporter.DOMUtils.remove(element, [".sr-only"]);
      WebImporter.DOMUtils.remove(element, ["link"]);
      element.querySelectorAll(".cmp-teaser__action-container").forEach((el) => {
        if (!el.textContent.trim()) {
          el.remove();
        }
      });
      unwrapAemGridDivs(element);
      cleanAttributes(element);
      element.querySelectorAll('a[href^="//"]').forEach((a) => {
        a.setAttribute("href", "https:" + a.getAttribute("href"));
      });
    }
  }

  // tools/importer/transformers/paylocity-sections.js
  var H2 = { before: "beforeTransform", after: "afterTransform" };
  function findSectionElement(root, selector) {
    if (!selector) return null;
    const selectors = Array.isArray(selector) ? selector : [selector];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function findTopLevelAncestor(root, el) {
    if (!el || el === root) return null;
    let current = el;
    while (current.parentElement && current.parentElement !== root) {
      current = current.parentElement;
    }
    return current.parentElement === root ? current : null;
  }
  function transform2(hookName, element, payload) {
    if (hookName === H2.after) {
      const template = payload && payload.template;
      if (!template || !template.sections || template.sections.length < 2) {
        return;
      }
      const { document } = payload;
      const sections = template.sections;
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        const sectionEl = findSectionElement(element, section.selector);
        if (!sectionEl) {
          continue;
        }
        const topAncestor = findTopLevelAncestor(element, sectionEl);
        if (!topAncestor) {
          continue;
        }
        if (section.style) {
          const sectionMetadata = WebImporter.Blocks.createBlock(document, {
            name: "Section Metadata",
            cells: { style: section.style }
          });
          topAncestor.after(sectionMetadata);
        }
        if (i > 0) {
          const hr = document.createElement("hr");
          topAncestor.before(hr);
        }
      }
    }
  }

  // tools/importer/import-products-page.js
  var parsers = {
    "tabs": parse,
    "icon-cards": parse2,
    "columns": parse3,
    "cards": parse4,
    "cta-banner": parse5
  };
  var transformers = [
    transform,
    transform2
  ];
  var PAGE_TEMPLATE = {
    name: "products-page",
    description: "Products listing page showcasing Paylocity product suite and features",
    urls: ["https://www.paylocity.com/products/"],
    blocks: [
      {
        name: "tabs",
        instances: [".carousel"]
      },
      {
        name: "icon-cards",
        instances: [".cmp-iconteaser"]
      },
      {
        name: "columns",
        instances: [".cmp-columns"]
      },
      {
        name: "cards",
        instances: [".cmp-teaser"]
      },
      {
        name: "cta-banner",
        instances: [".cmp-container__bg"]
      }
    ],
    sections: [
      {
        id: "hero",
        name: "Hero with Product Tabs",
        selector: ".carousel",
        style: null,
        blocks: ["tabs"],
        defaultContent: ["h1", "p"]
      },
      {
        id: "capabilities",
        name: "Platform Capabilities",
        selector: ".cmp-iconteaser",
        style: "grey",
        blocks: ["icon-cards"],
        defaultContent: ["h3.cmp-title__text", "h2.cmp-title__text"]
      },
      {
        id: "align-teams",
        name: "Built to Align Teams",
        selector: ".cmp-columns",
        style: null,
        blocks: ["columns"],
        defaultContent: ["h2.cmp-title__text"]
      },
      {
        id: "testimonials",
        name: "Client Testimonials",
        selector: ".cmp-teaser",
        style: null,
        blocks: ["cards"],
        defaultContent: ["h2.cmp-title__text"]
      },
      {
        id: "cta",
        name: "CTA Banner",
        selector: ".cmp-container__bg",
        style: "dark",
        blocks: ["cta-banner"],
        defaultContent: []
      },
      {
        id: "demo-cta",
        name: "Demo CTA",
        selector: ".cmp-container__bg",
        style: "dark",
        blocks: ["cta-banner"],
        defaultContent: []
      }
    ]
  };
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
  var import_products_page_default = {
    transform: (payload) => {
      const { document, url, html, params } = payload;
      const main = document.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);
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
      executeTransformers("afterTransform", main, payload);
      WebImporter.DOMUtils.remove(main, [
        "header",
        "nav",
        "footer",
        ".onetrust-consent-sdk",
        "#onetrust-consent-sdk",
        '[id*="onetrust"]',
        "noscript",
        '[class*="cookie"]',
        '[class*="tracking"]'
      ]);
      const hr = document.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document);
      WebImporter.rules.transformBackgroundImages(main, document);
      WebImporter.rules.adjustImageUrls(main, url, params.originalURL);
      const path = WebImporter.FileUtils.sanitizePath(
        new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html$/, "") || "/products"
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
  return __toCommonJS(import_products_page_exports);
})();
