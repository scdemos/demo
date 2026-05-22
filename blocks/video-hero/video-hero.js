export default function decorate(block) {
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

  const picture = block.querySelector('picture');
  const poster = picture?.querySelector('img')?.currentSrc || picture?.querySelector('img')?.src;
  const posterRow = picture?.parentElement?.parentElement;
  posterRow?.remove();

  const content = document.createElement('div');
  content.className = 'video-hero-content';
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

    const playVideo = () => {
      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => {});
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

    setVideoSource();
    window.addEventListener('aem-theme-change', (e) => {
      setVideoSource(e.detail?.theme);
    });

    if (document.visibilityState === 'visible') playVideo();
    else document.addEventListener('visibilitychange', playVideo, { once: true });
  }

  block.append(content);
}
