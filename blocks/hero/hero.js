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

  // The text region is the hero cell containing the headline. Mark it so the
  // overlay CSS applies. Prefer the last top-level cell (image is first cell);
  // fall back to the h1's own wrapper.
  const textDiv = block.querySelector(':scope > div:last-child') || h1.closest('.hero > div') || h1.parentElement;
  if (!textDiv) return;
  textDiv.classList.add('hero-text');

  // Gather the headline + paragraphs in document order from the WHOLE text
  // region. DA wraps each block in its own <div>, so the eyebrow/CTA/eligibility
  // paragraphs are NOT necessarily siblings of the h1 — collect them by flow
  // instead of by direct-child so decoration works for both DA and local markup.
  const flow = [...textDiv.querySelectorAll('h1, p')];
  const h1Index = flow.indexOf(h1);

  // Eyebrow: first non-button <p> that appears before the h1 (e.g. "Oura Ring 5")
  for (let i = 0; i < h1Index; i += 1) {
    if (flow[i].tagName === 'P' && !flow[i].classList.contains('button-container')) {
      flow[i].classList.add('hero-tagline');
      decorateEyebrow(flow[i]);
      break;
    }
  }

  // CTA: a <p> after the h1 whose only content is a single link → blue pill
  // button. Done here (not just via aem.js decorateButtons) so it applies even
  // when DA's nesting keeps the link out of decorateButtons' single-child check.
  const ctaPara = flow.find((el, i) => i > h1Index
    && el.tagName === 'P'
    && el.querySelector(':scope > a')
    && !el.querySelector('img')
    && el.textContent.trim() === el.querySelector(':scope > a').textContent.trim());
  if (ctaPara) {
    ctaPara.classList.add('button-container');
    const link = ctaPara.querySelector(':scope > a');
    if (!link.classList.contains('button')) link.classList.add('button');
  }

  // Eligibility note: last plain <p> after the h1 that is neither the CTA nor
  // the eyebrow (e.g. "HSA/FSA eligible") — circular checkmark + bold first token.
  const notes = flow.filter(
    (c, i) => i > h1Index
      && c.tagName === 'P'
      && !c.classList.contains('button-container')
      && !c.classList.contains('hero-tagline'),
  );
  const note = notes[notes.length - 1];
  if (note) decorateEligibility(note);
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
