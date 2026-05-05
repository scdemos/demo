/** First row is only a hero visual (picture), headings/copy live in following rows */
function isBackgroundImageFirstRow(row) {
  if (!row || row.tagName !== 'DIV') return false;
  if (!row.querySelector('picture')) return false;
  if (row.querySelector('h1, h2, h3, h4, h5, h6')) return false;
  if (row.querySelector('.button-container, a.button')) return false;
  return true;
}

/** @param {Element} block The hero block element */
export default function decorate(block) {
  const pictures = block.querySelectorAll('picture');
  const firstRow = block.firstElementChild;

  if (pictures.length === 1 && isBackgroundImageFirstRow(firstRow)) {
    block.classList.add('hero-has-background');
  }

  if (pictures.length >= 2) {
    // Dual-image hero: first = light, second = dark
    const lightDiv = pictures[0].closest('.hero > div');
    const darkDiv = pictures[1].closest('.hero > div');
    if (lightDiv) lightDiv.classList.add('hero-img-light');
    if (darkDiv) darkDiv.classList.add('hero-img-dark');

    // In dark mode, move the dark image first so waitForFirstImage
    // eager-loads the visible (LCP) image rather than the hidden one.
    const isDark = document.body.classList.contains('dark-scheme');
    if (isDark && darkDiv && lightDiv) {
      lightDiv.parentElement.insertBefore(darkDiv, lightDiv);
    }
  } else if (pictures.length < 1) {
    block.classList.add('no-image');
  }

  const headline = block.querySelector('h1, h2');
  if (!headline) return;

  const contentDiv = headline.closest('div');
  if (!contentDiv) return;

  const children = [...contentDiv.children];
  const headIdx = children.indexOf(headline);

  for (let i = 0; i < headIdx; i += 1) {
    if (children[i].tagName === 'P' && !children[i].classList.contains('button-container')) {
      children[i].classList.add('hero-tagline');
      break;
    }
  }
}
