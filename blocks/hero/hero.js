/** @param {Element} block The hero block element */
export default function decorate(block) {
  const pictures = block.querySelectorAll('picture');
  // Treat any embedded media (optimized <picture> or a raw authored <img>) as
  // the hero background so a single image still yields a full-bleed hero.
  const media = pictures.length ? pictures : block.querySelectorAll('img');

  if (media.length >= 2) {
    // Dual-image hero: first = light, second = dark
    const lightDiv = media[0].closest('.hero > div');
    const darkDiv = media[1].closest('.hero > div');
    if (lightDiv) lightDiv.classList.add('hero-img-light');
    if (darkDiv) darkDiv.classList.add('hero-img-dark');

    // In dark mode, move the dark image first so waitForFirstImage
    // eager-loads the visible (LCP) image rather than the hidden one.
    const isDark = document.body.classList.contains('dark-scheme');
    if (isDark && darkDiv && lightDiv) {
      lightDiv.parentElement.insertBefore(darkDiv, lightDiv);
    }
  } else if (media.length === 1) {
    // Single-image hero: mark the image's row so the background/overlay CSS applies.
    const imgDiv = media[0].closest('.hero > div');
    if (imgDiv) imgDiv.classList.add('hero-img');
  } else {
    block.classList.add('no-image');
  }

  const h1 = block.querySelector('h1');
  if (!h1) return;

  // Collect the headline + text paragraphs in document order. DA may split the
  // hero into several top-level cells (image + one cell per line), so scan the
  // whole block and exclude the image cell's own <p>. Then re-home everything
  // into the single structure the CSS expects — .hero-text > div > [...] —
  // regardless of how DA nested it. This makes decoration/layout identical for
  // both DA and local markup.
  const imageCell = [...block.children].find((c) => c.querySelector('picture, img') && !c.contains(h1));
  const flow = [...block.querySelectorAll('h1, p')]
    .filter((el) => !(imageCell && imageCell.contains(el)));
  const h1Index = flow.indexOf(h1);

  // Eyebrow: first non-button <p> before the h1 (e.g. "Oura Ring 5")
  for (let i = 0; i < h1Index; i += 1) {
    if (flow[i].tagName === 'P') {
      flow[i].classList.add('hero-tagline');
      decorateEyebrow(flow[i]);
      break;
    }
  }

  // CTA: first <p> after the h1 with a link and no image → blue pill button.
  const ctaPara = flow.find((el, i) => i > h1Index
    && el.tagName === 'P'
    && el.querySelector('a')
    && !el.querySelector('img'));
  if (ctaPara) {
    ctaPara.classList.add('button-container');
    const link = ctaPara.querySelector('a');
    if (!link.classList.contains('button')) link.classList.add('button');
  }

  // Eligibility note: last plain <p> after the h1 (no link/image, not the CTA
  // or eyebrow) e.g. "HSA/FSA eligible" — circular checkmark + bold first token.
  const notes = flow.filter((c, i) => i > h1Index
    && c.tagName === 'P'
    && c !== ctaPara
    && !c.classList.contains('hero-tagline')
    && !c.querySelector('a, img'));
  const note = notes[notes.length - 1];
  if (note) decorateEligibility(note);

  // Re-home the whole text flow into one .hero-text > div so the overlay layout
  // and typography rules (which target that single structure) always apply,
  // even when DA delivered the lines in separate cells.
  const textDiv = document.createElement('div');
  textDiv.className = 'hero-text';
  const inner = document.createElement('div');
  flow.forEach((el) => inner.append(el));
  textDiv.append(inner);

  // Drop now-empty leftover cells (e.g. DA's per-line wrapper divs), keeping the
  // image cell, then append the consolidated text region as the last child.
  [...block.children].forEach((cell) => {
    if (cell !== imageCell && !cell.querySelector('picture, img') && !cell.textContent.trim()) {
      cell.remove();
    }
  });
  block.append(textDiv);
}

/**
 * Turn a trailing product-line number into a superscript badge, e.g.
 * "Oura Ring 5" → "Oura Ring" + a filled circular "5" badge.
 * @param {Element} p the eyebrow paragraph
 */
function decorateEyebrow(p) {
  if (p.querySelector('.hero-eyebrow-badge')) return;
  const text = p.textContent.trim();
  const match = text.match(/^(.*?)\s+(\d+)$/);
  if (!match) return;
  const [, label, num] = match;
  p.textContent = `${label} `;
  const badge = document.createElement('span');
  badge.className = 'hero-eyebrow-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = num;
  p.append(badge);
  // keep the full label available to assistive tech
  p.setAttribute('aria-label', text);
}

/**
 * Prepend a circular outline checkmark icon and bold the leading token.
 * @param {Element} p the eligibility paragraph
 */
function decorateEligibility(p) {
  if (p.querySelector('.hero-check-icon')) return;
  p.classList.add('hero-eligibility');
  const text = p.textContent.trim();
  const [first, ...rest] = text.split(' ');

  const icon = document.createElement('span');
  icon.className = 'hero-check-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.25"/>'
    + '<path d="M7.5 12.4l3 3 6-6.4" stroke="currentColor" stroke-width="1.25" '
    + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const strong = document.createElement('strong');
  strong.textContent = first;
  const tail = rest.length ? ` ${rest.join(' ')}` : '';

  p.textContent = '';
  p.append(icon, strong, document.createTextNode(tail));
}
