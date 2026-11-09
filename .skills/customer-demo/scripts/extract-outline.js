/*
 * customer-demo: in-page outline extractor (paste into page.evaluate on the ORIGINAL site).
 * Returns ordered content sections with headings, paragraphs, lists, stats, images and CTAs,
 * skipping chrome (header, nav, footer, modals, cookie banners) and empty wrappers.
 * Used by import-page.mjs to rebuild the full page in EDS markup without dropping content.
 */
// eslint-disable-next-line no-unused-vars
function extractOutline() {
  const SKIP = 'header, footer, nav, script, style, noscript, dialog, [role=dialog], [aria-modal=true], [id*=onetrust], [class*=cookie], [class*=modal], [class*=breadcrumb], [class*=sidebar]';
  const main = document.querySelector('main') || document.body;
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const txt = (e) => e.innerText.replace(/\s+/g, ' ').trim();
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };

  const blocks = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const seen = new Set();
  let n = walker.nextNode();
  while (n) {
    const tag = n.tagName;
    if (!seen.has(n) && visible(n)) {
      if (/^H[1-4]$/.test(tag)) {
        blocks.push({ type: 'h', level: Number(tag[1]), text: txt(n) });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if (tag === 'P' && txt(n).length > 1) {
        const a = n.querySelector('a[href]');
        const onlyLink = a && txt(a) === txt(n);
        blocks.push(onlyLink ? { type: 'cta', text: txt(a), href: abs(a.getAttribute('href')) } : { type: 'p', text: txt(n), html: n.innerHTML });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if ((tag === 'UL' || tag === 'OL') && !n.closest('ul ul, ol ol')) {
        const items = [...n.children].filter((li) => li.tagName === 'LI').map(txt).filter(Boolean);
        if (items.length) blocks.push({ type: 'list', ordered: tag === 'OL', items });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if (tag === 'IMG') {
        const r = n.getBoundingClientRect();
        if (r.width >= 120) blocks.push({ type: 'img', src: abs(n.currentSrc || n.src), alt: n.alt || '', w: Math.round(r.width) });
      } else if (tag === 'A' && /btn|button|cta/i.test(n.className) && txt(n)) {
        blocks.push({ type: 'cta', text: txt(n), href: abs(n.getAttribute('href') || '#') });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      }
    }
    n = walker.nextNode();
  }

  // group into sections at each H1/H2
  const sections = [];
  let cur = null;
  blocks.forEach((b) => {
    if (b.type === 'h' && b.level <= 2) {
      cur = { title: b, items: [] };
      sections.push(cur);
    } else {
      if (!cur) { cur = { title: null, items: [] }; sections.push(cur); }
      cur.items.push(b);
    }
  });
  return { title: document.title, url: location.href, sections };
}
