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

  // tools/importer/parsers/carousel-hero.js
  function parse(element, { document }) {
    const slides = element.querySelectorAll(".valprop--home-slide.cycle-slide");
    const imageUrls = [];
    slides.forEach((slide) => {
      let imageUrl = "";
      const firstDiv = slide.children[0];
      if (firstDiv) {
        const styleAttr = firstDiv.getAttribute("style") || "";
        const urlMatch = styleAttr.match(/url\(['"]?(.*?)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          imageUrl = urlMatch[1];
        }
      }
      if (!imageUrl) {
        const imgEl = slide.querySelector("img");
        if (imgEl) {
          imageUrl = imgEl.getAttribute("src") || "";
        }
      }
      imageUrls.push(imageUrl);
    });
    const cells = [];
    slides.forEach((slide, index) => {
      const imageUrl = imageUrls[index];
      const heading = slide.querySelector("h1, h2");
      const description = slide.querySelector("p");
      const ctaLinks = Array.from(slide.querySelectorAll("a[href]"));
      const mediaWrapper = document.createElement("div");
      mediaWrapper.appendChild(document.createComment(" field:media_image "));
      if (imageUrl) {
        const img = document.createElement("img");
        img.setAttribute("src", imageUrl);
        const headingText = heading ? heading.textContent.trim() : "";
        img.setAttribute("alt", headingText || "Hero slide " + (index + 1));
        mediaWrapper.appendChild(img);
      }
      const contentWrapper = document.createElement("div");
      contentWrapper.appendChild(document.createComment(" field:content_text "));
      if (heading) {
        contentWrapper.appendChild(heading.cloneNode(true));
      }
      if (description) {
        contentWrapper.appendChild(description.cloneNode(true));
      }
      ctaLinks.forEach((cta) => {
        const p = document.createElement("p");
        const link = cta.cloneNode(true);
        link.removeAttribute("class");
        p.appendChild(link);
        contentWrapper.appendChild(p);
      });
      cells.push([mediaWrapper, contentWrapper]);
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-hero", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-news.js
  function parse2(element, { document }) {
    const parent = element.parentElement;
    const newsContainer = parent ? parent.querySelector(".ftnt-news, .ftnt-section.ftnt-news") : null;
    const items = newsContainer ? Array.from(newsContainer.querySelectorAll(".ftnt-product")) : [];
    const cells = [];
    items.forEach((item) => {
      const img = item.querySelector("img.ftnt-image, img.lozad, picture img, .ftnt-picture img");
      if (img) {
        const dataSrc = img.getAttribute("data-src");
        if (dataSrc && dataSrc.startsWith("http")) {
          img.setAttribute("src", dataSrc);
        }
        cells.push([img]);
      }
      const titleEl = item.querySelector(".ftnt-news-title, .ftnt-detail b, .ftnt-detail a b");
      if (titleEl) {
        const heading = document.createElement("p");
        heading.textContent = titleEl.textContent.trim();
        cells.push([heading]);
      }
      const descEl = item.querySelector(".ftnt-news-description, .ftnt-detail span");
      if (descEl) {
        const desc = document.createElement("p");
        desc.textContent = descEl.textContent.trim();
        cells.push([desc]);
      }
      const ctaLink = item.querySelector("a.ftnt-download-anchor, .ftnt-detail a.ftnt-download-anchor");
      if (ctaLink) {
        const link = document.createElement("a");
        link.href = ctaLink.href;
        link.textContent = ctaLink.textContent.trim();
        cells.push([link]);
      }
    });
    if (cells.length === 0) {
      cells.push([""]);
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-news", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-platform.js
  function parse3(element, { document }) {
    const cards = element.querySelectorAll(".white-box");
    const cells = [];
    cards.forEach((card) => {
      let img = card.querySelector(":scope > img") || card.querySelector("img");
      if (!img) {
        const computedStyle = window.getComputedStyle(card);
        const bgImage = computedStyle.backgroundImage;
        if (bgImage && bgImage !== "none") {
          const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch && urlMatch[1]) {
            img = document.createElement("img");
            img.src = urlMatch[1];
            const titleEl = card.querySelector(".box-label h3, .box-title h3");
            img.alt = titleEl ? titleEl.textContent.trim() : "";
          }
        }
      }
      const textFrag = document.createDocumentFragment();
      const detailSection = card.querySelector(".box-detail");
      if (detailSection) {
        const titleLink = detailSection.querySelector("a.box-title");
        if (titleLink) {
          const h3 = document.createElement("h3");
          const link = document.createElement("a");
          link.href = titleLink.href;
          link.textContent = titleLink.textContent.trim();
          h3.appendChild(link);
          textFrag.appendChild(h3);
        }
        const desc = detailSection.querySelector("p");
        if (desc) {
          textFrag.appendChild(desc.cloneNode(true));
        }
        const ul = detailSection.querySelector("ul");
        if (ul) {
          textFrag.appendChild(ul.cloneNode(true));
        }
      }
      const imageCell = document.createDocumentFragment();
      imageCell.appendChild(document.createComment(" field:image "));
      if (img) {
        imageCell.appendChild(img.cloneNode(true));
      }
      const textCell = document.createDocumentFragment();
      textCell.appendChild(document.createComment(" field:text "));
      textCell.appendChild(textFrag);
      cells.push([imageCell, textCell]);
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "cards-platform", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-product.js
  function parse4(element, { document }) {
    const cards = element.querySelectorAll(".product-card");
    const cells = [];
    cards.forEach((card) => {
      const image = card.querySelector("img.product-image");
      const imageCell = document.createDocumentFragment();
      imageCell.appendChild(document.createComment(" field:image "));
      if (image) {
        imageCell.appendChild(image);
      }
      const textCell = document.createDocumentFragment();
      textCell.appendChild(document.createComment(" field:text "));
      const headerSpan = card.querySelector(".product-card-header span");
      if (headerSpan) {
        const label = document.createElement("p");
        label.textContent = headerSpan.textContent.trim();
        textCell.appendChild(label);
      }
      const title = card.querySelector("b.product-title, .product-title");
      if (title) {
        const heading = document.createElement("h3");
        heading.textContent = title.textContent.trim();
        textCell.appendChild(heading);
      }
      const desc = card.querySelector("p.product-desc");
      if (desc) {
        const paragraph = document.createElement("p");
        paragraph.textContent = desc.textContent.trim();
        textCell.appendChild(paragraph);
      }
      const cardLink = card.closest("a.product-card") || (card.tagName === "A" ? card : null);
      if (cardLink && cardLink.href) {
        const link = document.createElement("a");
        link.href = cardLink.href;
        link.textContent = title ? title.textContent.trim() : "Learn more";
        textCell.appendChild(link);
      }
      cells.push([imageCell, textCell]);
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "cards-product", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-stats.js
  function parse5(element, { document }) {
    const statItems = element.querySelectorAll(':scope > .col-lg-4, :scope > .col-sm-6, :scope > [class*="col-"]');
    const cells = [];
    statItems.forEach((item) => {
      const statInfo = item.querySelector(".stat-info");
      if (!statInfo) return;
      const statNum = statInfo.querySelector(".stat-num");
      const textFrag = document.createDocumentFragment();
      textFrag.appendChild(document.createComment(" field:text "));
      if (statNum) {
        const span = statNum.querySelector("span");
        const numberValue = span ? span.textContent.trim() : "";
        let suffix = "";
        statNum.childNodes.forEach((node) => {
          if (node.nodeType === 3) {
            const text = node.textContent.trim();
            if (text && text.length <= 2) {
              suffix = text;
            }
          }
        });
        let description = "";
        statInfo.childNodes.forEach((node) => {
          if (node.nodeType === 3) {
            const text = node.textContent.trim();
            if (text) {
              description = text;
            }
          }
        });
        const heading = document.createElement("h3");
        heading.textContent = `${numberValue}${suffix}`;
        const desc = document.createElement("p");
        desc.textContent = description;
        textFrag.appendChild(heading);
        textFrag.appendChild(desc);
      }
      cells.push(["", textFrag]);
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "cards-stats", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-stories.js
  function parse6(element, { document }) {
    const banners = element.querySelectorAll(":scope > .banner");
    const cells = [];
    banners.forEach((banner) => {
      const image = banner.querySelector("img.banner-image");
      const heading = banner.querySelector(".banner-content h2");
      const quote = banner.querySelector(".banner-content .quote");
      const company = banner.querySelector(".banner-content .company");
      const ctaLinks = Array.from(banner.querySelectorAll(".customer-links a"));
      const slideCell = [];
      if (image) {
        slideCell.push(image);
      }
      if (heading) {
        slideCell.push(heading);
      }
      if (quote || company) {
        const descContainer = document.createElement("div");
        if (quote) {
          const p = document.createElement("p");
          p.textContent = quote.textContent.trim();
          descContainer.appendChild(p);
        }
        if (company) {
          const attr = document.createElement("p");
          attr.innerHTML = company.innerHTML;
          descContainer.appendChild(attr);
        }
        slideCell.push(descContainer);
      }
      if (ctaLinks.length > 0) {
        ctaLinks.forEach((link) => {
          slideCell.push(link);
        });
      }
      if (slideCell.length > 0) {
        cells.push(slideCell);
      }
    });
    const overallCta = element.querySelector(".cta-wrapper a.security-anchor");
    if (overallCta) {
      const ctaLink = document.createElement("a");
      ctaLink.href = overallCta.href;
      ctaLink.textContent = overallCta.textContent.trim();
      cells.push([ctaLink]);
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-stories", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-trust.js
  function parse7(element, { document }) {
    const trustTiles = element.querySelectorAll(".trust-wrapper a.trusted-tile");
    const cells = [];
    trustTiles.forEach((tile) => {
      const img = tile.querySelector(".trust-header img");
      const titleDiv = tile.querySelector(".trust-header div");
      const titleText = titleDiv ? titleDiv.textContent.trim() : "";
      const infoDiv = tile.querySelector(".trust-info");
      const descriptionText = infoDiv ? infoDiv.textContent.trim() : "";
      const linkText = tile.querySelector(".trust-link");
      const linkLabel = linkText ? linkText.textContent.trim() : "Learn More";
      const linkHref = tile.getAttribute("href") || "";
      const imgCell = [];
      if (img) {
        const clonedImg = img.cloneNode(true);
        imgCell.push(clonedImg);
      }
      const titleEl = document.createElement("p");
      titleEl.textContent = titleText;
      const descEl = document.createElement("p");
      descEl.textContent = descriptionText;
      const linkEl = document.createElement("a");
      linkEl.href = linkHref;
      linkEl.textContent = linkLabel;
      cells.push(imgCell.length ? imgCell : [""]);
      cells.push([titleEl]);
      cells.push([descEl]);
      cells.push([linkEl]);
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "cards-trust", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-events.js
  function parse8(element, { document }) {
    let items = Array.from(element.querySelectorAll(".ftnt-product, .event-item, .slide-item, .slick-slide"));
    if (items.length === 0) {
      const parent = element.parentElement;
      if (parent) {
        const siblingContainer = parent.querySelector(".ftnt-news, .ftnt-events, .event-list, .slick-slider");
        if (siblingContainer) {
          items = Array.from(siblingContainer.querySelectorAll(".ftnt-product, .event-item, .slide-item, .slick-slide"));
        }
      }
    }
    if (items.length === 0) {
      items = Array.from(element.querySelectorAll('[class*="product"], [class*="event"], [class*="slide"]'));
    }
    const cells = [];
    items.forEach((item, index) => {
      const mediaWrapper = document.createElement("div");
      mediaWrapper.appendChild(document.createComment(" field:media_image "));
      const img = item.querySelector("img.ftnt-image, img.lozad, picture img, img");
      if (img) {
        const clonedImg = img.cloneNode(true);
        const dataSrc = clonedImg.getAttribute("data-src");
        if (dataSrc && dataSrc.startsWith("http")) {
          clonedImg.setAttribute("src", dataSrc);
        }
        if (!clonedImg.getAttribute("alt")) {
          const titleEl2 = item.querySelector("h3, h4, h5, .ftnt-news-title, b, strong");
          clonedImg.setAttribute("alt", titleEl2 ? titleEl2.textContent.trim() : "Event slide " + (index + 1));
        }
        mediaWrapper.appendChild(clonedImg);
      }
      const contentWrapper = document.createElement("div");
      contentWrapper.appendChild(document.createComment(" field:content_text "));
      const titleEl = item.querySelector("h3, h4, h5, .ftnt-news-title, .ftnt-detail b, .ftnt-detail a b");
      if (titleEl) {
        const heading = document.createElement("h3");
        heading.textContent = titleEl.textContent.trim();
        contentWrapper.appendChild(heading);
      }
      const descEl = item.querySelector(".ftnt-news-description, .ftnt-detail span, .event-date, p");
      if (descEl) {
        const desc = document.createElement("p");
        desc.textContent = descEl.textContent.trim();
        contentWrapper.appendChild(desc);
      }
      const ctaLink = item.querySelector("a.ftnt-download-anchor, a[href]:not(.ftnt-detail a b), a[href]");
      if (ctaLink) {
        const p = document.createElement("p");
        const link = document.createElement("a");
        link.href = ctaLink.href || ctaLink.getAttribute("href") || "";
        link.textContent = ctaLink.textContent.trim() || "Register Now";
        p.appendChild(link);
        contentWrapper.appendChild(p);
      }
      cells.push([mediaWrapper, contentWrapper]);
    });
    if (cells.length === 0) {
      const mediaWrapper = document.createElement("div");
      mediaWrapper.appendChild(document.createComment(" field:media_image "));
      const contentWrapper = document.createElement("div");
      contentWrapper.appendChild(document.createComment(" field:content_text "));
      cells.push([mediaWrapper, contentWrapper]);
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-events", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/fortinet-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.beforeTransform) {
      WebImporter.DOMUtils.remove(element, [
        "aside.dg-consent-banner",
        "#sf-chat-text-bubble",
        "#embedded-messaging",
        '[id^="batBeacon"]'
      ]);
    }
    if (hookName === TransformHook.afterTransform) {
      WebImporter.DOMUtils.remove(element, [
        ".main-nav.experiencefragment",
        ".footer-nav.experiencefragment",
        ".C991-CSS-JS",
        ".disable-background",
        "iframe"
      ]);
    }
  }

  // tools/importer/transformers/fortinet-sections.js
  var SECTIONS = [
    { selectors: [".C926-Billboard-Sliders", "section.valprop--home", ".valprop--home-slides-container"], style: "dark" },
    { selectors: [".C814-Event-News-Slider", ".news-slider", ".newstemplate.ftnt-news"], style: "light" },
    { selectors: ["#fabric-area", ".ftnt-main.bg-red", ".fabric-bg"], style: "fortinet-red" },
    { selectors: [".container.platform-container", ".product-row.ftnt-platform"], style: "light" },
    { selectors: [".global-scale"], style: "navy-dark" },
    { selectors: [".customer-stories"], style: "light" },
    { selectors: ["main.ftnt-main.trusted-section", ".trusted-section"], style: "light" },
    { selectors: [".events-slider", ".ftnt-events"], style: "light" }
  ];
  function transform2(hookName, element, payload) {
    if (hookName !== "afterTransform") return;
    const document = element.ownerDocument;
    const matched = [];
    for (const section of SECTIONS) {
      let el = null;
      for (const sel of section.selectors) {
        el = element.querySelector(sel);
        if (el) break;
      }
      if (el) matched.push({ el, style: section.style });
    }
    if (matched.length < 2) return;
    for (let i = matched.length - 1; i >= 0; i--) {
      const { el, style } = matched[i];
      if (style) {
        const sectionMetadata = WebImporter.Blocks.createBlock(document, {
          name: "Section Metadata",
          cells: { style }
        });
        el.after(sectionMetadata);
      }
      if (i > 0) {
        const hr = document.createElement("hr");
        el.before(hr);
      }
    }
  }

  // tools/importer/import-homepage.js
  var parsers = {
    "carousel-hero": parse,
    "carousel-news": parse2,
    "cards-platform": parse3,
    "cards-product": parse4,
    "cards-stats": parse5,
    "carousel-stories": parse6,
    "cards-trust": parse7,
    "carousel-events": parse8
  };
  var PAGE_TEMPLATE = {
    name: "homepage",
    description: "Fortinet corporate homepage with hero, product highlights, and promotional sections",
    urls: [
      "https://www.fortinet.com/"
    ],
    blocks: [
      {
        name: "carousel-hero",
        instances: ["section.valprop--home.ftnt--billboard"]
      },
      {
        name: "carousel-news",
        instances: [".news-slider"]
      },
      {
        name: "cards-platform",
        instances: ["#fabric-area .all-boxes"]
      },
      {
        name: "cards-product",
        instances: [".product-row.ftnt-platform"]
      },
      {
        name: "cards-stats",
        instances: [".global-scale .row"]
      },
      {
        name: "carousel-stories",
        instances: [".customer-stories"]
      },
      {
        name: "cards-trust",
        instances: ["main.ftnt-main.trusted-section"]
      },
      {
        name: "carousel-events",
        instances: [".events-slider"]
      }
    ],
    sections: [
      {
        id: "section-1",
        name: "Hero",
        selector: ".C926-Billboard-Sliders",
        style: "dark",
        blocks: ["carousel-hero"],
        defaultContent: []
      },
      {
        id: "section-2",
        name: "News",
        selector: ".C814-Event-News-Slider:first-of-type",
        style: "light",
        blocks: ["carousel-news"],
        defaultContent: [".news-slider .section-label", ".news-slider h2"]
      },
      {
        id: "section-3",
        name: "Platform Pillars",
        selector: "#fabric-area",
        style: "fortinet-red",
        blocks: ["cards-platform"],
        defaultContent: ["#fabric-area .section-label", "#fabric-area h2"]
      },
      {
        id: "section-4",
        name: "AI Security",
        selector: ".C48-Form-HTML-Snippet:nth-of-type(2)",
        style: "light",
        blocks: [],
        defaultContent: [".section-label:contains('AI-DRIVEN')", "h2:contains('Secure and Transform')"]
      },
      {
        id: "section-5",
        name: "Platform Innovation",
        selector: ".container.platform-container",
        style: "light",
        blocks: ["cards-product"],
        defaultContent: [".platform-container .section-label", ".platform-container h2"]
      },
      {
        id: "section-6",
        name: "Threat Statistics",
        selector: ".global-scale",
        style: "navy-dark",
        blocks: ["cards-stats"],
        defaultContent: [".global-scale .section-label", ".global-scale h2", ".global-scale .moreinfo a"]
      },
      {
        id: "section-7",
        name: "Customer Stories",
        selector: ".customer-stories",
        style: "light",
        blocks: ["carousel-stories"],
        defaultContent: []
      },
      {
        id: "section-8",
        name: "Trust",
        selector: "main.ftnt-main.trusted-section",
        style: "light",
        blocks: ["cards-trust"],
        defaultContent: [".trusted-section h2", ".trusted-section .head-description", ".trusted-section .cta-wrapper a"]
      },
      {
        id: "section-9",
        name: "Events",
        selector: ".events-slider",
        style: "light",
        blocks: ["carousel-events"],
        defaultContent: [".events-slider h2"]
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
        if (elements.length === 0) {
          console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
        }
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
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_homepage_default = {
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
        } else {
          console.warn(`No parser found for block: ${block.name}`);
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
  return __toCommonJS(import_homepage_exports);
})();
