/**
 * Teaser Promo -- full-width navy CTA banner with a circular image, a
 * heading + supporting text, and a teal pill CTA pushed to the right.
 *
 * Authored as two rows (image row, text row). This groups the heading and
 * supporting copy into a `.teaser-promo-body` wrapper so the desktop layout
 * can place the copy stack and the CTA side by side.
 */
export default function decorate(block) {
  // mark the image-only column
  block.querySelectorAll(':scope > div > div').forEach((col) => {
    const pic = col.querySelector('picture');
    if (pic && col.children.length === 1) {
      col.classList.add('teaser-promo-img-col');
    }
  });

  // group heading + supporting text (everything before the CTA) into a body
  const textCell = [...block.querySelectorAll(':scope > div > div')]
    .find((col) => col.querySelector('h2, h3'));
  if (textCell) {
    const cta = textCell.querySelector('.button-container');
    const body = document.createElement('div');
    body.className = 'teaser-promo-body';
    [...textCell.children].forEach((child) => {
      if (child !== cta) body.append(child);
    });
    textCell.prepend(body);
  }
}
