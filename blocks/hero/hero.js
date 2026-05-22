/** @param {Element} block The hero block element */
export default function decorate(block) {
  if (block.classList.contains('video')) {
    const rows = [...block.children].slice(0, -1);
    rows.forEach((row) => {
      const link = row.querySelector('a[href*=".mp4"]');
      if (!link) return;
      const video = document.createElement('video');
      video.src = link.href;
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      link.replaceWith(video);
      if (video.parentElement?.tagName === 'P') video.parentElement.replaceWith(video);
    });
    if (rows.length >= 2) {
      const light = rows.find((r) => r.querySelector('video')?.src.includes('-light')) || rows[0];
      const dark = rows.find((r) => r !== light);
      light?.classList.add('hero-vid-light');
      dark?.classList.add('hero-vid-dark');
      if (document.body.classList.contains('dark-scheme') && dark && light) {
        light.parentElement.insertBefore(dark, light);
      }
    } else if (rows[0]) {
      rows[0].classList.add('hero-vid-light');
    }
  } else {
    const pictures = block.querySelectorAll('picture');

    if (pictures.length >= 2) {
      const lightDiv = pictures[0].closest('.hero > div');
      const darkDiv = pictures[1].closest('.hero > div');
      if (lightDiv) lightDiv.classList.add('hero-img-light');
      if (darkDiv) darkDiv.classList.add('hero-img-dark');

      const isDark = document.body.classList.contains('dark-scheme');
      if (isDark && darkDiv && lightDiv) {
        lightDiv.parentElement.insertBefore(darkDiv, lightDiv);
      }
    } else if (pictures.length < 1) {
      block.classList.add('no-image');
    }
  }

  const h1 = block.querySelector('h1');
  if (!h1) return;

  const contentDiv = h1.closest('div');
  if (!contentDiv) return;

  const textDiv = contentDiv.parentElement;
  if (textDiv) textDiv.classList.add('hero-text');

  const children = [...contentDiv.children];
  const h1Index = children.indexOf(h1);

  for (let i = 0; i < h1Index; i += 1) {
    if (children[i].tagName === 'P' && !children[i].classList.contains('button-container')) {
      children[i].classList.add('hero-tagline');
      break;
    }
  }
}
