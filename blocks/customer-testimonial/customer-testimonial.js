/*
 * Customer testimonial — a single pull-quote with a monospace eyebrow, a large
 * quoted statement framed by a left accent bar, and an attribution (speaker
 * role + company). Authored as three rows:
 *   1. Eyebrow    (e.g. "What our customers say")
 *   2. Quote      (the testimonial text)
 *   3. Attribution (role on the first line, company on the second)
 * Source: publicissapient.com/industries/financial-services
 */

export default function decorate(block) {
  const rows = [...block.children];
  const [eyebrowRow, quoteRow, attribRow] = rows;

  if (eyebrowRow) {
    eyebrowRow.classList.add('customer-testimonial-eyebrow');
  }

  if (quoteRow) {
    quoteRow.classList.add('customer-testimonial-quote');
  }

  if (attribRow) {
    attribRow.classList.add('customer-testimonial-attribution');
    const lines = attribRow.querySelectorAll('p');
    lines[0]?.classList.add('customer-testimonial-role');
    lines[1]?.classList.add('customer-testimonial-firm');
  }
}
