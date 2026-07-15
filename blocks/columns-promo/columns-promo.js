export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-promo-${cols.length}-cols`);

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add('columns-promo-img-col');
        }
      }

      // Group adjacent CTA buttons into a single row so they sit
      // side by side like the source split-banner tiles.
      const buttons = [...col.querySelectorAll('.button-container')];
      if (buttons.length > 1) {
        const group = document.createElement('div');
        group.className = 'columns-promo-cta-group';
        buttons[0].parentElement.insertBefore(group, buttons[0]);
        buttons.forEach((b) => group.append(b));
      }
    });
  });
}
