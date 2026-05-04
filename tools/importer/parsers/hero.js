/**
 * Parser: hero
 * Extracts hero content: wordmark, heading, CTAs.
 * Stops before product teasers/flexgrid content below.
 */
export default function parse(element, { document }) {
  const cells = [];

  // Find the customcontainer that holds the wordmark image (id=IMAGECONTAINER)
  const imgContainer = element.querySelector('#IMAGECONTAINER, [id*="IMAGECONTAINER"]');
  if (imgContainer) {
    const wordmark = imgContainer.querySelector('img');
    if (wordmark) {
      const img = document.createElement('img');
      img.src = wordmark.src || wordmark.getAttribute('src') || '';
      img.alt = wordmark.alt || '';
      cells.push([img]);
    }
  }

  // Find H1 headings (they're in a .cmp-text container)
  const textContainer = element.querySelector('.cmp-text');
  if (textContainer) {
    const headings = textContainer.querySelectorAll('h1');
    if (headings.length > 0) {
      const h1 = document.createElement('h1');
      const parts = [];
      headings.forEach((heading) => {
        parts.push(heading.textContent.trim());
      });
      h1.textContent = parts.join(' ');
      cells.push([h1]);
    }
  }

  // Find CTA buttons - only from .styleColumnPaddingMedium (the buttons row)
  const buttonRow = element.querySelector('.styleColumnPaddingMedium');
  if (buttonRow) {
    const buttons = buttonRow.querySelectorAll('a.cmp-button');
    if (buttons.length > 0) {
      const div = document.createElement('div');
      buttons.forEach((btn) => {
        const link = document.createElement('a');
        link.href = btn.href || btn.getAttribute('href') || '';
        link.textContent = btn.textContent.trim();
        div.appendChild(link);
        div.appendChild(document.createTextNode(' '));
      });
      cells.push([div]);
    }
  }

  return cells;
}
