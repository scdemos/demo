/*
 * customer-demo: in-page design probe for the ORIGINAL site (scrape.mjs and the integrated browser).
 * Evaluate it on a fully scrolled page. It returns what the demo must reproduce beyond the content:
 *  - nav: the full navigation tree (top items with their dropdown / mega-menu / sub-nav links, even
 *    when hidden), utility links, search, language/region switchers, CTAs in the header
 *  - type: the rendered type scale (h1–h4, body, small, nav, button): family, size, weight, line
 *    height, letter spacing, case, color
 *  - buttons: primary / secondary / link button styles (bg, color, border, radius, padding, case)
 *  - cards: radius, shadow, border of repeated tiles
 *  - container: the dominant content width and side gutter at this viewport
 *  - sections: rhythm (vertical padding) and background bands in order
 *  - meta: title, description, social image, language (the demo page carries the same)
 * Phase 5 maps every one of these onto a base construct (or a new one) before building.
 */
// eslint-disable-next-line no-unused-expressions
() => {
  const vw = document.documentElement.clientWidth;
  const cs = (e) => getComputedStyle(e);
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && cs(e).visibility !== 'hidden'; };
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const typo = (e) => {
    if (!e) return null;
    const s = cs(e);
    return {
      family: s.fontFamily.split(',')[0].replace(/["']/g, ''),
      size: s.fontSize,
      weight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      transform: s.textTransform,
      color: s.color,
    };
  };
  const first = (sel) => [...document.querySelectorAll(sel)].find(shown);
  const header = document.querySelector('header') || document.querySelector('[role=banner]');
  const main = document.querySelector('main') || document.body;

  // navigation trees: every nav (top bar, side rail, utility, sub-nav) with its top-level items and their
  // (possibly hidden) dropdown / mega-menu children; the main nav is the one with the most links
  const where = (n) => {
    const r = n.getBoundingClientRect();
    if (n.closest('footer')) return 'footer';
    if (r.height > 400 && r.width < 260) return 'rail';
    return n.closest('header, [role=banner]') ? 'header' : 'page';
  };
  const navs = [...document.querySelectorAll('nav, [role=navigation]')].filter((n) => !n.closest('main article') && where(n) !== 'footer').map((n) => {
    const lis = [...n.querySelectorAll('li')].filter((li) => !li.parentElement.closest('li'));
    const items = lis.slice(0, 15).map((li) => {
      const link = li.querySelector('a, button');
      const kids = [...li.querySelectorAll('a')].filter((a) => a !== link).map((a) => clean(a.textContent)).filter(Boolean);
      return { label: clean(link?.innerText || link?.textContent || li.firstChild?.textContent), visible: !!link && shown(link), children: [...new Set(kids)].slice(0, 40) };
    }).filter((x) => x.label);
    return { where: where(n), label: n.getAttribute('aria-label') || '', links: n.querySelectorAll('a').length, items };
  }).filter((n) => n.items.length >= 2 && !/cookie|privacy|consent/i.test(`${n.label} ${n.items.map((i) => i.label).join(' ')}`))
    // the primary nav lives in the header or a side rail; page-level navs (tabs, cookie dialogs) come last
    .sort((a, b) => (['header', 'rail'].includes(b.where) - ['header', 'rail'].includes(a.where)) || b.links - a.links);
  const tree = navs[0]?.items || [];
  const headerLinks = header ? [...header.querySelectorAll('a, button')].filter(shown).map((a) => clean(a.innerText || a.getAttribute('aria-label'))).filter(Boolean) : [];

  // buttons by look, not class name: a filled or outlined box with padding around short text
  const looksLikeButton = (b) => {
    const s = cs(b);
    const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) && s.backgroundColor !== cs(b.parentElement).backgroundColor;
    const outlined = parseFloat(s.borderTopWidth) >= 1 && parseFloat(s.borderLeftWidth) >= 1;
    return (filled || outlined) && parseFloat(s.paddingLeft) >= 8 && clean(b.innerText).length < 40;
  };
  const buttons = [...main.querySelectorAll('a, button, [role=button]')]
    .filter((b) => shown(b) && !b.closest('form, nav') && clean(b.innerText).length > 1 && looksLikeButton(b));
  const styleKey = (b) => { const s = cs(b); return `${s.backgroundColor}|${s.color}|${s.borderTopColor}|${s.borderRadius}`; };
  const groups = new Map();
  buttons.forEach((b) => { const k = styleKey(b); if (!groups.has(k)) groups.set(k, { n: 0, el: b }); groups.get(k).n += 1; });
  const buttonStyles = [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 4).map(({ n, el }) => {
    const s = cs(el);
    return {
      n, label: clean(el.innerText).slice(0, 30), bg: s.backgroundColor, color: s.color, border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderRadius, padding: `${s.paddingTop} ${s.paddingRight}`, transform: s.textTransform, weight: s.fontWeight, size: s.fontSize,
    };
  });

  // repeated tiles: siblings with the same class that hold a heading or image
  const cardEls = [...main.querySelectorAll('li, article, div')].filter((e) => {
    const p = e.parentElement;
    return p && p.children.length >= 3 && shown(e) && e.className && [...p.children].filter((c) => c.className === e.className).length >= 3 && e.querySelector('h2, h3, h4, img');
  });
  const card = cardEls[0];
  const cards = card ? { count: cardEls.length, radius: cs(card).borderRadius, shadow: cs(card).boxShadow, border: cs(card).borderTopWidth !== '0px' ? `${cs(card).borderTopWidth} ${cs(card).borderTopColor}` : 'none', bg: cs(card).backgroundColor } : null;

  // dominant content width: the most common width of text blocks wider than half the viewport
  const widths = new Map();
  [...main.querySelectorAll('h1, h2, p')].filter(shown).forEach((e) => {
    let n = e.parentElement;
    while (n && n !== main && n.getBoundingClientRect().width < vw * 0.5) n = n.parentElement;
    if (!n || n === main) return;
    const w = Math.round(n.getBoundingClientRect().width / 10) * 10;
    widths.set(w, (widths.get(w) || 0) + 1);
  });
  const container = [...widths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  let wrap = main;
  while (wrap.children.length === 1 && wrap.firstElementChild.children.length) wrap = wrap.firstElementChild;
  const bands = [...wrap.children].filter((e) => shown(e) && e.getBoundingClientRect().height > 60).map((e) => ({
    bg: cs(e).backgroundColor, bgImage: cs(e).backgroundImage !== 'none', padY: `${cs(e).paddingTop} ${cs(e).paddingBottom}`,
    h: Math.round(e.getBoundingClientRect().height), heading: clean(e.querySelector('h1, h2, h3')?.textContent).slice(0, 60),
  }));

  return {
    url: location.href,
    viewport: vw,
    nav: {
      tree,
      navs: navs.slice(0, 4),
      headerLinks: headerLinks.slice(0, 40),
      search: !!header?.querySelector('input[type=search], [class*=search], [aria-label*=earch i]'),
      language: !!header?.querySelector('[class*=lang], [class*=region], [class*=country], [hreflang]'),
      sticky: !!header && ['fixed', 'sticky'].includes(cs(header).position || cs(header.firstElementChild || header).position),
      height: header ? Math.round(header.getBoundingClientRect().height) : 0,
      bg: header ? cs(header.firstElementChild || header).backgroundColor : null,
    },
    type: {
      h1: typo(first('h1')), h2: typo(first('main h2, h2')), h3: typo(first('main h3, h3')), h4: typo(first('main h4, h4')),
      body: typo(first('main p')), small: typo(first('small, figcaption, .caption, [class*=disclaimer] p')),
      nav: typo(header && [...header.querySelectorAll('a')].find(shown)), button: typo(buttons[0]),
    },
    buttons: buttonStyles,
    cards,
    container: container && { width: container, gutter: Math.max(0, Math.round((vw - container) / 2)) },
    bands,
    meta: {
      title: document.title,
      description: document.querySelector('meta[name=description]')?.content || '',
      image: document.querySelector('meta[property="og:image"]')?.content || '',
      lang: document.documentElement.lang || '',
    },
  };
};
