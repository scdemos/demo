/**
 * Parser: testimonial
 * Extracts customer testimonial quote and attribution from carousel text items.
 */
export default function parse(element, { document }) {
  const cells = [];

  const text = element.textContent.trim();
  if (!text) return cells;

  // Split on the pattern: quote text followed by attribution
  // Quotes typically start with a curly quote character
  const parts = text.split(/(?<=[”“".])\s*(?=[A-Z])/);

  let quote = '';
  let attribution = '';

  if (parts.length >= 2) {
    quote = parts[0].trim();
    attribution = parts.slice(1).join(' ').trim();
  } else {
    quote = text;
  }

  if (quote) {
    const quoteEl = document.createElement('p');
    quoteEl.textContent = quote;
    cells.push([quoteEl]);

    if (attribution) {
      const attrEl = document.createElement('p');
      attrEl.textContent = attribution;
      cells.push([attrEl]);
    }
  }

  return cells;
}
