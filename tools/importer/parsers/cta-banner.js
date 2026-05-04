/**
 * Parser: cta-banner
 * Extracts CTA banner content: heading, description, and button.
 */
export default function parse(element, { document }) {
  const cells = [];

  // Row 1: Heading
  const heading = element.querySelector('h2, h1');
  if (heading) {
    const h2 = document.createElement('h2');
    h2.textContent = heading.textContent.trim();
    cells.push([h2]);
  }

  // Row 2: Description text
  const paragraphs = element.querySelectorAll('p, .cmp-text p');
  const descTexts = [];
  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    if (text && !p.closest('h2, h1') && !p.querySelector('a')) {
      descTexts.push(text);
    }
  });
  if (descTexts.length > 0) {
    const p = document.createElement('p');
    p.textContent = descTexts.join(' ');
    cells.push([p]);
  }

  // Row 3: CTA button/link
  const link = element.querySelector('a.cmp-button, a[class*="button"]');
  if (link) {
    const a = document.createElement('a');
    a.href = link.href || link.getAttribute('href') || '';
    a.textContent = link.textContent.trim();
    cells.push([a]);
  }

  return cells;
}
