function getVideoSources(block) {
  const videoSources = {};

  [...block.children].forEach((row) => {
    const link = row.querySelector('a[href]');
    if (link && /\.(mp4|webm|ogg)(\?|#|$)/i.test(link.href)) {
      const label = link.textContent.trim().toLowerCase();
      if (label.includes('light')) videoSources.light = link.href;
      else if (label.includes('dark')) videoSources.dark = link.href;
      else if (!videoSources.dark) videoSources.dark = link.href;
      else if (!videoSources.light) videoSources.light = link.href;
      row.remove();
    }
  });

  if (!videoSources.light) videoSources.light = videoSources.dark;
  if (!videoSources.dark) videoSources.dark = videoSources.light;

  return videoSources;
}

function decorateVideoHero(block) {
  const videoSources = getVideoSources(block);
  const picture = block.querySelector('picture');
  const poster = picture?.querySelector('img')?.currentSrc || picture?.querySelector('img')?.src;
  const posterRow = picture?.parentElement?.parentElement;
  posterRow?.remove();

  const content = document.createElement('div');
  content.className = 'hero-video-content';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      while (cell.firstChild) content.append(cell.firstChild);
    });
  });

  block.textContent = '';

  if (videoSources.light || videoSources.dark) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    if (poster) video.poster = poster;

    const source = document.createElement('source');
    video.append(source);
    block.append(video);
    block.classList.add('has-video');

    const controls = document.createElement('div');
    controls.className = 'hero-video-controls';

    const playToggle = document.createElement('button');
    playToggle.className = 'hero-video-control hero-video-play-toggle';
    playToggle.type = 'button';
    playToggle.setAttribute('aria-label', 'Pause background video');
    playToggle.textContent = 'Pause';

    const loopToggle = document.createElement('button');
    loopToggle.className = 'hero-video-control hero-video-loop-toggle';
    loopToggle.type = 'button';
    loopToggle.setAttribute('aria-label', 'Disable background video loop');
    loopToggle.setAttribute('aria-pressed', 'true');
    loopToggle.textContent = 'Loop';

    controls.append(playToggle, loopToggle);
    block.append(controls);

    const setPlayToggleState = () => {
      const paused = video.paused || video.ended;
      playToggle.textContent = paused ? 'Play' : 'Pause';
      playToggle.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} background video`);
    };

    const setLoopToggleState = () => {
      loopToggle.setAttribute('aria-pressed', String(video.loop));
      loopToggle.setAttribute('aria-label', `${video.loop ? 'Disable' : 'Enable'} background video loop`);
    };

    const playVideo = () => {
      if (video.ended) video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => {});
      setPlayToggleState();
    };

    const getTheme = () => {
      const theme = document.documentElement.dataset.theme;
      if (theme === 'light' || theme === 'dark') return theme;
      return document.body.classList.contains('light-scheme') ? 'light' : 'dark';
    };

    const setVideoSource = (theme = getTheme()) => {
      const src = videoSources[theme] || videoSources.dark || videoSources.light;
      if (!src || source.src === src) return;
      source.src = src;
      source.type = src.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      video.dataset.themeVideo = theme;
      video.load();
      playVideo();
    };

    playToggle.addEventListener('click', () => {
      if (video.paused || video.ended) playVideo();
      else video.pause();
      setPlayToggleState();
    });
    loopToggle.addEventListener('click', () => {
      video.loop = !video.loop;
      if (video.loop) video.setAttribute('loop', '');
      else video.removeAttribute('loop');
      setLoopToggleState();
    });
    video.addEventListener('play', setPlayToggleState);
    video.addEventListener('pause', setPlayToggleState);
    video.addEventListener('ended', setPlayToggleState);
    setLoopToggleState();

    setVideoSource();
    window.addEventListener('aem-theme-change', (e) => {
      setVideoSource(e.detail?.theme);
    });

    if (document.visibilityState === 'visible') playVideo();
    else document.addEventListener('visibilitychange', playVideo, { once: true });
  }

  block.append(content);
}

/** @param {Element} block The hero block element */
export default function decorate(block) {
  if (block.classList.contains('video')) {
    decorateVideoHero(block);
    return;
  }

  const pictures = block.querySelectorAll('picture');

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

  const h1 = block.querySelector('h1');
  if (!h1) return;

  // Find the first <p> that appears before the <h1> in the DOM and mark it as a tagline
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
