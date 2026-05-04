export default function decorate(block) {
  const rows = [...block.children];
  block.classList.add('logo-wall');

  rows.forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell) => {
      cell.classList.add('logo-wall-item');
    });
  });
}
