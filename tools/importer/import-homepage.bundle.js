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

  // tools/importer/import-homepage.js
  var import_homepage_exports = {};
  __export(import_homepage_exports, {
    default: () => import_homepage_default
  });

  // tools/importer/parsers/hero.js
  function parse(element, { document }) {
    const cells = [];
    const imgContainer = element.querySelector('#IMAGECONTAINER, [id*="IMAGECONTAINER"]');
    if (imgContainer) {
      const wordmark = imgContainer.querySelector("img");
      if (wordmark) {
        const img = document.createElement("img");
        img.src = wordmark.src || wordmark.getAttribute("src") || "";
        img.alt = wordmark.alt || "";
        cells.push([img]);
      }
    }
    const textContainer = element.querySelector(".cmp-text");
    if (textContainer) {
      const headings = textContainer.querySelectorAll("h1");
      if (headings.length > 0) {
        const h1 = document.createElement("h1");
        const parts = [];
        headings.forEach((heading) => {
          parts.push(heading.textContent.trim());
        });
        h1.textContent = parts.join(" ");
        cells.push([h1]);
      }
    }
    const buttonRow = element.querySelector(".styleColumnPaddingMedium");
    if (buttonRow) {
      const buttons = buttonRow.querySelectorAll("a.cmp-button");
      if (buttons.length > 0) {
        const div = document.createElement("div");
        buttons.forEach((btn) => {
          const link = document.createElement("a");
          link.href = btn.href || btn.getAttribute("href") || "";
          link.textContent = btn.textContent.trim();
          div.appendChild(link);
          div.appendChild(document.createTextNode(" "));
        });
        cells.push([div]);
      }
    }
    return cells;
  }

  // tools/importer/parsers/logo-wall.js
  function parse2(element, { document }) {
    const cells = [];
    const images = element.querySelectorAll(".cmp-image__image, img");
    if (images.length > 0) {
      images.forEach((img) => {
        const clone = document.createElement("img");
        clone.src = img.src || img.getAttribute("src") || "";
        clone.alt = img.alt || "";
        cells.push([clone]);
      });
    }
    return cells;
  }

  // tools/importer/parsers/icon-cards.js
  function parse3(element, { document }) {
    const cells = [];
    const iconTeasers = element.querySelectorAll(".cmp-iconteaser");
    if (iconTeasers.length === 0) return cells;
    iconTeasers.forEach((teaser) => {
      const icon = teaser.querySelector(".cmp-iconteaser__icon img");
      const heading = teaser.querySelector(".cmp-iconteaser__heading-title, h3");
      const description = teaser.querySelector(".cmp-iconteaser__descripton p, .cmp-iconteaser__description p, .cmp-iconteaser__descripton, .cmp-iconteaser__description");
      const link = teaser.querySelector("a");
      const iconCell = document.createElement("div");
      const contentCell = document.createElement("div");
      if (icon) {
        const img = document.createElement("img");
        img.src = icon.src || icon.getAttribute("src") || "";
        img.alt = icon.alt || "";
        iconCell.appendChild(img);
      }
      if (heading) {
        const h3 = document.createElement("h3");
        h3.textContent = heading.textContent.trim();
        contentCell.appendChild(h3);
      }
      if (description) {
        const text = description.textContent.trim();
        if (text) {
          const p = document.createElement("p");
          p.textContent = text;
          contentCell.appendChild(p);
        }
      }
      if (link) {
        const a = document.createElement("a");
        a.href = link.href || link.getAttribute("href") || "";
        a.textContent = "Learn More";
        contentCell.appendChild(a);
      }
      cells.push([iconCell, contentCell]);
    });
    return cells;
  }

  // tools/importer/parsers/columns.js
  function parse4(element, { document }) {
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

  // tools/importer/parsers/testimonial.js
  function parse5(element, { document }) {
    const cells = [];
    const text = element.textContent.trim();
    if (!text) return cells;
    const parts = text.split(new RegExp('(?<=[\u201D\u201C".])\\s*(?=[A-Z])'));
    let quote = "";
    let attribution = "";
    if (parts.length >= 2) {
      quote = parts[0].trim();
      attribution = parts.slice(1).join(" ").trim();
    } else {
      quote = text;
    }
    if (quote) {
      const quoteEl = document.createElement("p");
      quoteEl.textContent = quote;
      cells.push([quoteEl]);
      if (attribution) {
        const attrEl = document.createElement("p");
        attrEl.textContent = attribution;
        cells.push([attrEl]);
      }
    }
    return cells;
  }

  // tools/importer/parsers/cta-banner.js
  function parse6(element, { document }) {
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

  // tools/importer/parsers/cards.js
  function parse7(element, { document }) {
    const cells = [];
    const teasers = element.querySelectorAll(".cmp-teaser");
    teasers.forEach((teaser) => {
      const image = teaser.querySelector(".cmp-teaser__image img, .cmp-image__image, img");
      const title = teaser.querySelector(".cmp-teaser__title, h3");
      const description = teaser.querySelector(".cmp-teaser__description p, .cmp-teaser__description");
      const link = teaser.querySelector("a.cmp-teaser__action-link, a[href]");
      const imgCell = document.createElement("div");
      const contentCell = document.createElement("div");
      if (image) {
        const img = document.createElement("img");
        img.src = image.src || image.getAttribute("src") || "";
        img.alt = image.alt || "";
        imgCell.appendChild(img);
      }
      if (title) {
        const h3 = document.createElement("h3");
        h3.textContent = title.textContent.trim();
        contentCell.appendChild(h3);
      }
      if (description) {
        const p = document.createElement("p");
        p.textContent = description.textContent.trim();
        contentCell.appendChild(p);
      }
      if (link) {
        const a = document.createElement("a");
        a.href = link.href || link.getAttribute("href") || "";
        const linkText = link.textContent.trim();
        a.textContent = linkText || "Learn More";
        contentCell.appendChild(a);
      }
      cells.push([imgCell, contentCell]);
    });
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

  // tools/importer/import-homepage.js
  var parsers = {
    "hero": parse,
    "cards": parse7,
    "icon-cards": parse3,
    "testimonial": parse5,
    "columns": parse4,
    "logo-wall": parse2,
    "cta-banner": parse6
  };
  var transformers = [
    transform,
    transform2
  ];
  var PAGE_TEMPLATE = {
    name: "homepage",
    description: "Paylocity homepage with hero, product highlights, testimonials, and CTAs",
    urls: ["https://www.paylocity.com/"],
    blocks: [
      {
        name: "hero",
        instances: [".container.responsivegrid.styleLarge.pb-5"]
      },
      {
        name: "cards",
        instances: [".cmp-flexgrid"]
      },
      {
        name: "icon-cards",
        instances: [".carousel"]
      },
      {
        name: "columns",
        instances: [".cmp-columns.styleColumn1by3"]
      },
      {
        name: "testimonial",
        instances: [".carousel-item .cmp-text"]
      },
      {
        name: "logo-wall",
        instances: [".imagegallery"]
      },
      {
        name: "cta-banner",
        instances: [".cmp-container__bg"]
      }
    ],
    sections: [
      {
        id: "hero",
        name: "Hero Section",
        selector: ".container.responsivegrid.styleLarge.pb-5",
        style: null,
        blocks: ["hero"],
        defaultContent: []
      },
      {
        id: "social-proof",
        name: "Social Proof Logos",
        selector: ".cmp-columns.cols-md-6",
        style: null,
        blocks: ["logo-wall"],
        defaultContent: []
      },
      {
        id: "capabilities",
        name: "Platform Capabilities",
        selector: ".cmp-iconteaser",
        style: null,
        blocks: ["icon-cards"],
        defaultContent: ["h3.cmp-title__text", "h2.cmp-title__text"]
      },
      {
        id: "products-carousel",
        name: "Ultimate Platform Tabs",
        selector: ".carousel",
        style: "grey",
        blocks: ["tabs"],
        defaultContent: ["h2.cmp-title__text"]
      },
      {
        id: "company-sizes",
        name: "Supporting All Company Sizes",
        selector: ".cmp-columns.styleColumnTwo-1by2",
        style: null,
        blocks: ["columns"],
        defaultContent: ["h2.cmp-title__text"]
      },
      {
        id: "testimonial",
        name: "Testimonial",
        selector: ".carousel-item .cmp-text",
        style: null,
        blocks: ["testimonial"],
        defaultContent: []
      },
      {
        id: "differentiators",
        name: "What Makes Paylocity Different",
        selector: ".cmp-iconteaser",
        style: null,
        blocks: ["icon-cards"],
        defaultContent: ["h2.cmp-title__text"]
      },
      {
        id: "cta-dark",
        name: "Break Free CTA",
        selector: ".cmp-container__bg",
        style: "dark",
        blocks: ["cta-banner"],
        defaultContent: []
      },
      {
        id: "resources",
        name: "Featured Resources",
        selector: ".cmp-teaser",
        style: "grey",
        blocks: ["cards"],
        defaultContent: ["h2.cmp-title__text"]
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
  var import_homepage_default = {
    transform: (payload) => {
      const { document, url, html, params } = payload;
      const main = document.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);
      pageBlocks.sort((a, b) => {
        if (a.element.contains(b.element)) return 1;
        if (b.element.contains(a.element)) return -1;
        return 0;
      });
      pageBlocks.forEach((block) => {
        const parser = parsers[block.name];
        if (!parser || !block.element.isConnected) return;
        const isNested = pageBlocks.some((other) => other !== block && other.element.contains(block.element));
        if (isNested) {
          try {
            const cells = parser(block.element, { document, url, params });
            if (cells && cells.length > 0) {
              const blockCells = [[block.name], ...cells];
              const table = WebImporter.DOMUtils.createTable(blockCells, document);
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
  return __toCommonJS(import_homepage_exports);
})();
