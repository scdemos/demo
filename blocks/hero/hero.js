/** @param {Element} block The hero block element */
export default function decorate(block) {
  const pictures = block.querySelectorAll('picture');

  if (pictures.length >= 2) {
    const lightDiv = pictures[0].closest('.hero > div');
    const darkDiv = pictures[1].closest('.hero > div');
    if (lightDiv) lightDiv.classList.add('hero-img-light');
    if (darkDiv) darkDiv.classList.add('hero-img-dark');
  } else if (pictures.length < 1) {
    block.classList.add('no-image');
  }

  const heading = block.querySelector('h1, h2');
  if (!heading) return;

  // Find the first <p> that appears before the heading in the DOM and mark it as a tagline
  const contentDiv = heading.closest('div');
  if (!contentDiv) return;

  const textDiv = contentDiv.parentElement;
  if (textDiv) textDiv.classList.add('hero-text');

  const children = [...contentDiv.children];
  const headingIndex = children.indexOf(heading);

  for (let i = 0; i < headingIndex; i += 1) {
    if (children[i].tagName === 'P' && !children[i].classList.contains('button-container')) {
      children[i].classList.add('hero-tagline');
      break;
    }
  }

  // Wrap runs of consecutive .button-container paragraphs so they can be laid out side-by-side
  const buttonContainers = [...contentDiv.querySelectorAll(':scope > p.button-container')];
  let i = 0;
  while (i < buttonContainers.length) {
    const group = [buttonContainers[i]];
    let j = i + 1;
    while (
      j < buttonContainers.length
      && buttonContainers[j].previousElementSibling === buttonContainers[j - 1]
    ) {
      group.push(buttonContainers[j]);
      j += 1;
    }
    if (group.length > 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'hero-button-group';
      group[0].parentNode.insertBefore(wrapper, group[0]);
      group.forEach((bc) => wrapper.appendChild(bc));
    }
    i = j;
  }
}
