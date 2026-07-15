/**
 * Hero Promo — promotional banner with text (left) and a foreground
 * product image (right) on a teal gradient card.
 * @param {Element} block The hero-promo block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  const imageRow = rows[0];
  const textRow = rows[rows.length - 1];

  if (imageRow) imageRow.classList.add('hero-promo-image');

  const textCell = textRow?.querySelector(':scope > div');
  if (!textCell) return;
  textRow.classList.add('hero-promo-text');

  // Group consecutive CTA buttons into a single horizontal row so they
  // sit side by side regardless of their individual widths.
  const buttons = [...textCell.querySelectorAll(':scope > p.button-container')];
  if (buttons.length > 0) {
    const cta = document.createElement('div');
    cta.className = 'hero-promo-cta';
    buttons[0].before(cta);
    buttons.forEach((btn) => cta.append(btn));
  }
}
