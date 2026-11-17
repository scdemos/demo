/*
 * customer-demo: in-page page inventory for the fidelity gate (capture.mjs and the integrated browser).
 * Evaluate this function in a fully scrolled page; it returns header anatomy (height, rows, logo,
 * sticky, mega menu), footer links, side rail, readability and, per top-level content section:
 * headings, text blocks, layout (alignment, text width), tone, full bleed, columns, carousel, CTAs,
 * images, forms and inputs. compare.mjs turns two of these (original vs demo) into PASS/FAIL checks.
 */
// eslint-disable-next-line no-unused-expressions
() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.height > 60 && r.width > 200 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const main = document.querySelector('main') || document.body;
  // descend through single-child wrappers to find the list of content sections
  let container = main;
  while (container.children.length === 1 && container.firstElementChild.children.length) container = container.firstElementChild;
  const sections = [...container.children].filter(visible);
  const bg = (e) => {
    let n = e;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)') return c;
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const columns = (e) => {
    const kids = [...e.querySelectorAll('h2, h3, img, form, li, article')].map((k) => Math.round(k.getBoundingClientRect().x / 40));
    return new Set(kids).size;
  };
  const vw = document.documentElement.clientWidth;
  const lumOf = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const shown = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  // visible text blocks: the provenance check (no invented copy) matches them against the original
  const texts = (e) => [...new Set([...e.querySelectorAll('h1, h2, h3, h4, h5, p, li, td, th, blockquote, figcaption, dd, dt')]
    .filter((t) => shown(t) && !t.querySelector('p, li, h1, h2, h3, h4'))
    .map((t) => clean(t.innerText)).filter((t) => t.length >= 25))].slice(0, 80);
  // layout: where the text sits (centered vs start) and how wide it runs, as % of the viewport
  const layout = (e) => {
    const els = [...e.querySelectorAll('h1, h2, h3, p')].filter((t) => shown(t) && clean(t.innerText).length > 2);
    if (!els.length) return null;
    const rs = els.map((t) => t.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const right = Math.max(...rs.map((r) => r.right));
    const centered = els.filter((t) => getComputedStyle(t).textAlign === 'center').length;
    return {
      align: centered > els.length / 2 ? 'center' : 'start',
      left: Math.round((left / vw) * 100),
      width: Math.round(((right - left) / vw) * 100),
    };
  };
  // carousels/sliders by role, common library classes, or prev/next + dot controls
  const carousel = (e) => !!e.querySelector('[aria-roledescription=carousel], [class*=carousel], [class*=slider], [class*=swiper], [class*=slick], [class*=splide], [class*=glide], [class*=owl-]')
    || [...e.querySelectorAll('button, [role=button], a')].filter((b) => /prev|next|previous|slide/i.test(`${b.getAttribute('aria-label') || ''} ${b.className}`)).length >= 2;
  const inventory = (e) => ({
    box: box(e),
    bg: bg(e),
    tone: lumOf(bg(e)) < 0.2 ? 'dark' : 'light',
    bleed: e.getBoundingClientRect().width >= vw * 0.97,
    layout: layout(e),
    carousel: carousel(e),
    texts: texts(e),
    // short visible labels (CTAs, buttons): checked for provenance too
    labels: [...new Set([...e.querySelectorAll('a.button, button, [role=button], a[class*=btn], a[class*=cta]')]
      .filter((b) => shown(b) && !b.closest('form')).map((b) => clean(b.innerText)).filter((t) => t.split(' ').length >= 2 && t.length < 60))].slice(0, 30),
    headings: [...e.querySelectorAll('h1, h2, h3, h4')].filter((h) => h.offsetParent).map((h) => `${h.tagName}: ${h.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)}`),
    textChars: e.innerText.replace(/\s+/g, ' ').trim().length,
    links: e.querySelectorAll('a[href]').length,
    // CTAs only: controls inside forms are covered by the forms/inputs check (Marketo etc. inflate them)
    buttons: [...e.querySelectorAll('button, a.button, [role=button], input[type=submit]')].filter((b) => b.offsetParent && !b.closest('form')).length,
    images: [...e.querySelectorAll('img, picture, svg')].filter((i) => i.getBoundingClientRect().width > 40).length,
    forms: [...e.querySelectorAll('form')].filter((f) => f.offsetParent && f.querySelector('input:not([type=hidden]):not([type=search]), select, textarea')).length,
    // visible, user-facing fields only (no hidden/search/captcha plumbing)
    inputs: [...e.querySelectorAll('input, select, textarea')]
      .filter((i) => i.offsetParent && !['hidden', 'search', 'submit', 'button'].includes(i.type) && !/recaptcha|captcha|honeypot|search/i.test(`${i.name} ${i.id} ${i.className}`))
      .map((i) => `${i.tagName.toLowerCase()}:${i.type || ''}:${(i.labels?.[0]?.textContent || i.placeholder || i.name || '').trim().slice(0, 40)}`),
    columns: columns(e),
  });
  const header = document.querySelector('header') || document.querySelector('[role=banner]');
  // header anatomy: height, rows (utility bar / main nav / sub-nav), logo placement, sticky, mega menu
  const headerInfo = (h) => {
    const r = h.getBoundingClientRect();
    const ctl = [...h.querySelectorAll('a, button, input, [role=button]')];
    const vis = ctl.filter(shown);
    // rows only count controls inside the header bar (a fixed side rail inside <header> is the rail check)
    const inBar = vis.filter((x) => x.getBoundingClientRect().top < r.bottom + 2);
    const rows = new Set(inBar.map((x) => { const b = x.getBoundingClientRect(); return Math.round((b.top + b.height / 2 - r.top) / 24); })).size;
    const logo = [...h.querySelectorAll('img, svg, picture, [class*=logo]')].map((x) => x.getBoundingClientRect()).find((b) => b.width > 30 && b.height > 10);
    const pos = (x) => getComputedStyle(x).position;
    return {
      box: box(h),
      bg: bg(h.firstElementChild || h),
      rows,
      sticky: [h, ...h.children].some((x) => ['fixed', 'sticky'].includes(pos(x))),
      logo: logo ? { x: Math.round(logo.left), w: Math.round(logo.width), h: Math.round(logo.height), centered: Math.abs(logo.left + logo.width / 2 - vw / 2) < vw * 0.06 } : null,
      // links that exist but aren't shown: mega menus and dropdown sub-navs
      hiddenLinks: ctl.filter((x) => x.tagName === 'A' && !vis.includes(x)).length,
      items: vis.map((x) => (x.innerText || x.placeholder || x.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 40),
    };
  };
  const footer = document.querySelector('footer');
  // side rail: a tall, narrow navigation column pinned to the left edge (nav/aside or any fixed element)
  const rail = [...document.querySelectorAll('nav, aside, nav > *, header *')].find((n) => {
    const r = n.getBoundingClientRect();
    return r.left < 5 && r.width > 40 && r.width < 200 && r.height > 400 && n.querySelectorAll('a').length >= 3;
  });
  // readability: text whose contrast against its effective background is below 3:1
  const lum = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // The background is read from what is actually painted under the text (elementsFromPoint), not
  // from DOM ancestors: negative-margin overlaps, absolute layers and bands otherwise fool the check.
  // Text over an image is skipped (needs a visual check).
  const opaque = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0(\.[0-4]\d*)?\)$/.test(c);
  const paintedBg = (e) => {
    // sites often set `scroll-behavior: smooth`; the hit test needs the scroll to land synchronously
    e.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = e.getBoundingClientRect();
    const hits = document.elementsFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
    // only what is painted beneath the text: start at the element (or its nearest hit ancestor)
    const start = hits.findIndex((n) => n === e || n.contains(e));
    if (start < 0) return bg(e); // covered (e.g. by a sticky bar) — fall back to DOM ancestors
    for (const n of hits.slice(start)) {
      if (/^(IMG|PICTURE|VIDEO|CANVAS|svg)$/.test(n.tagName)) return null;
      if (getComputedStyle(n).backgroundImage !== 'none' && n !== e) return null;
      const c = getComputedStyle(n).backgroundColor;
      if (opaque(c)) return c;
    }
    return bg(e);
  };
  const lowContrast = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main a, main label, footer p, header a')]
    .filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => {
      const under = paintedBg(e);
      if (!under) return null;
      const a = lum(getComputedStyle(e).color);
      const b = lum(under);
      return { t: e.innerText.trim().slice(0, 40), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
    })
    .filter((x) => x && x.ratio < 3);
  window.scrollTo(0, 0);
  return {
    theme: document.documentElement.dataset.theme || null,
    declaredScheme: document.querySelector('meta[name="color-scheme"]')?.content || null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    lowContrast: lowContrast.slice(0, 10),
    title: document.title,
    height: document.body.scrollHeight,
    header: header && headerInfo(header),
    rail: rail && { box: box(rail), items: rail.innerText.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 20) },
    footer: footer && { ...inventory(footer), links: [...footer.querySelectorAll('a')].map((a) => a.textContent.trim()).filter(Boolean) },
    sections: sections.map(inventory),
    dialogs: [...document.querySelectorAll('dialog[open], [role=dialog]')].filter((d) => d.offsetParent).length,
  };
};
