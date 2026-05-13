/** @param {Element} block The hero block element */
export default function decorate(block) {
  // --- Video background ---
  // Supports both an <a href="*.mp4"> link and a plain-text URL dropped into the block
  const MP4_RE = /https?:\/\/\S+\.mp4\b/i;
  const videoAnchor = [...block.querySelectorAll('a')].find((a) => MP4_RE.test(a.href));
  const videoTextEl = !videoAnchor && [...block.querySelectorAll('div, p')].find((el) => MP4_RE.test(el.textContent?.trim()));
  const videoSrc = videoAnchor?.href || videoTextEl?.textContent?.trim().match(MP4_RE)?.[0];

  if (videoSrc) {
    const cell = (videoAnchor || videoTextEl).closest('.hero > div');

    const video = document.createElement('video');
    video.className = 'hero-video';
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('disablepictureinpicture', '');

    const source = document.createElement('source');
    source.src = videoSrc;
    source.type = 'video/mp4';
    video.append(source);

    if (cell) {
      cell.innerHTML = '';
      const inner = document.createElement('div');
      inner.append(video);
      cell.append(inner);
      cell.classList.add('hero-video-wrap');
    }
    block.classList.add('has-video');
  }

  // --- Dual-image (used when no video) ---
  const pictures = block.querySelectorAll('picture');

  if (!videoSrc && pictures.length >= 2) {
    const lightDiv = pictures[0].closest('.hero > div');
    const darkDiv = pictures[1].closest('.hero > div');
    if (lightDiv) lightDiv.classList.add('hero-img-light');
    if (darkDiv) darkDiv.classList.add('hero-img-dark');

    const isDark = document.body.classList.contains('dark-scheme');
    if (isDark && darkDiv && lightDiv) {
      lightDiv.parentElement.insertBefore(darkDiv, lightDiv);
    }
  } else if (!videoSrc && pictures.length < 1) {
    block.classList.add('no-image');
  }

  // --- Tagline ---
  const h1 = block.querySelector('h1');
  if (!h1) return;

  const contentDiv = h1.closest('div');
  if (!contentDiv) return;

  const children = [...contentDiv.children];
  const h1Index = children.indexOf(h1);

  for (let i = 0; i < h1Index; i += 1) {
    if (children[i].tagName === 'P' && !children[i].classList.contains('button-container')) {
      children[i].classList.add('hero-tagline');
      break;
    }
  }
}
