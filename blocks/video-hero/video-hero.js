export default function decorate(block) {
  let videoSrc;

  [...block.children].some((row) => {
    const link = row.querySelector('a[href]');
    if (link && /\.(mp4|webm|ogg)(\?|#|$)/i.test(link.href)) {
      videoSrc = link.href;
      row.remove();
      return true;
    }
    return false;
  });

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

  if (videoSrc) {
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
    source.src = videoSrc;
    source.type = videoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    video.append(source);
    block.append(video);
    block.classList.add('has-video');

    const playVideo = () => {
      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => {});
    };
    if (document.visibilityState === 'visible') playVideo();
    else document.addEventListener('visibilitychange', playVideo, { once: true });
  }

  block.append(content);
}
