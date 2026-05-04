export default function decorate(block) {
  const rows = [...block.children];
  block.classList.add('cta-banner');

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells[0]) cells[0].classList.add('cta-banner-content');
  });
}
