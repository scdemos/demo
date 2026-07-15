export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-benefits-${cols.length}-cols`);

  // Mark icon-only columns so the strip aligns icon above label.
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add('columns-benefits-img-col');
        }
      }
    });
  });
}
