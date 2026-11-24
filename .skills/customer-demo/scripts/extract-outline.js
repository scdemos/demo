/*
 * customer-demo: in-page outline extractor (paste into page.evaluate on the ORIGINAL site).
 * Returns ordered content sections with headings, paragraphs, lists, stats, images and CTAs,
 * skipping chrome (header, nav, footer, modals, cookie banners) and empty wrappers.
 * Used by scrape.mjs (and agents directly) to rebuild the full page in EDS markup without dropping
 * content. Components it can't classify are kept as `unknown` items with their text, so parity
 * checks see them instead of silently losing them.
 */
// eslint-disable-next-line no-unused-vars
function extractOutline() {
  const SKIP = 'header, footer, nav, script, style, noscript, dialog, [role=dialog], [aria-modal=true], [id*=onetrust], [class*=cookie], [class*=modal], [class*=breadcrumb]';
  const main = document.querySelector('main') || document.body;
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const txt = (e) => String(e.innerText ?? e.textContent ?? '').replace(/\s+/g, ' ').trim();
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
      } else if (tag === 'TABLE') {
        const rows = [...n.rows].map((r) => [...r.cells].map(txt));
        if (rows.length) blocks.push({ type: 'table', rows });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if (tag === 'DL') {
        blocks.push({ type: 'list', ordered: false, items: [...n.querySelectorAll('dt')].map((dt) => `${txt(dt)}: ${dt.nextElementSibling ? txt(dt.nextElementSibling) : ''}`) });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if (tag === 'FORM') {
        const fields = [...n.querySelectorAll('input, select, textarea')]
          .filter((i) => !['hidden', 'submit', 'button', 'search'].includes(i.type) && !/captcha/i.test(`${i.name} ${i.id}`))
          .map((i) => ({
            name: i.name || i.id,
            type: i.tagName === 'SELECT' ? 'select' : (i.tagName === 'TEXTAREA' ? 'textarea' : i.type),
            label: (i.labels?.[0] ? txt(i.labels[0]) : i.placeholder || i.getAttribute('aria-label') || '').slice(0, 200),
            required: i.required || /\*/.test(i.labels?.[0]?.textContent || ''),
            options: i.tagName === 'SELECT' ? [...i.options].map((o) => o.text.trim()).filter(Boolean) : undefined,
          }));
        if (fields.length) blocks.push({ type: 'form', fields });
        n.querySelectorAll('*').forEach((c) => seen.add(c));
      } else if (tag === 'IFRAME' || tag === 'VIDEO') {
        blocks.push({ type: 'embed', src: abs(n.src || n.querySelector('source')?.src || ''), title: n.title || '' });
      } else if (n.children.length && getComputedStyle(n).backgroundImage.startsWith('url(')) {
        const r = n.getBoundingClientRect();
        const m = getComputedStyle(n).backgroundImage.match(/url\(["']?([^"')]+)/);
        if (m && r.width >= 300 && r.height >= 150) blocks.push({ type: 'img', src: abs(m[1]), alt: '', w: Math.round(r.width), background: true });
      } else if (n.children.length === 0 && txt(n).length > 20 && !/^(SPAN|STRONG|EM|B|I|A|LABEL|BUTTON|LI|TD|TH|DT|DD|OPTION)$/.test(tag)) {
        // leaf text in a widget we don't classify (custom elements, divs): keep it visible
        blocks.push({ type: 'unknown', tag: tag.toLowerCase(), text: txt(n).slice(0, 500) });
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
