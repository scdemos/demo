import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

const AUTOPLAY_MS = 7000;

function showSlide(block, index, { focus = false } = {}) {
  const slides = [...block.querySelectorAll('.carousel-slide')];
  const count = slides.length;
  const next = (index + count) % count;
  block.dataset.activeSlide = next;

  slides.forEach((slide, i) => {
    const active = i === next;
    slide.classList.toggle('active', active);
    slide.setAttribute('aria-hidden', String(!active));
    slide.querySelectorAll('a, button').forEach((el) => {
      if (active) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', '-1');
    });
  });

  block.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === next);
    dot.setAttribute('aria-current', i === next ? 'true' : 'false');
  });

  if (focus) slides[next].querySelector('h1, h2, h3')?.focus({ preventScroll: true });
}

function buildSlide(row, index) {
  const slide = createTag('li', {
    class: 'carousel-slide',
    role: 'group',
    'aria-roledescription': 'slide',
    id: `carousel-slide-${index}`,
  });
  const [mediaCell, contentCell] = [...row.children];
  const img = mediaCell?.querySelector('picture img');
  if (img) {
    const optimized = createOptimizedPicture(img.src, img.alt || '', index === 0, [
      { media: '(min-width: 900px)', width: '2000' },
      { width: '900' },
    ]);
    slide.append(createTag('div', { class: 'carousel-slide-media' }, optimized));
  }
  const content = createTag('div', { class: 'carousel-slide-content' });
  if (contentCell) content.append(...contentCell.childNodes);
  const heading = content.querySelector('h1, h2, h3');
  if (heading) heading.setAttribute('tabindex', '-1');
  slide.setAttribute('aria-label', heading?.textContent.trim() || `Slide ${index + 1}`);
  slide.append(content);
  return slide;
}

function startAutoplay(block) {
  if (!block.classList.contains('autoplay')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer;
  const advance = () => showSlide(block, Number(block.dataset.activeSlide) + 1);
  const stop = () => {
    clearInterval(timer);
    block.classList.add('paused');
  };
  const start = () => {
    clearInterval(timer);
    block.classList.remove('paused');
    timer = setInterval(advance, AUTOPLAY_MS);
  };
  block.style.setProperty('--carousel-interval', `${AUTOPLAY_MS}ms`);
  block.addEventListener('mouseenter', stop);
  block.addEventListener('mouseleave', start);
  block.addEventListener('focusin', stop);
  block.addEventListener('focusout', (e) => { if (!block.contains(e.relatedTarget)) start(); });
  start();
}

function buildControls(block, count) {
  const go = (delta) => showSlide(block, Number(block.dataset.activeSlide) + delta, { focus: true });
  const prev = createTag('button', { type: 'button', class: 'carousel-prev', 'aria-label': 'Previous slide' });
  const next = createTag('button', { type: 'button', class: 'carousel-next', 'aria-label': 'Next slide' });
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  const dots = createTag('ol', { class: 'carousel-dots', 'aria-label': 'Choose slide' });
  for (let i = 0; i < count; i += 1) {
    const dot = createTag('button', {
      type: 'button',
      class: 'carousel-dot',
      'aria-label': `Show slide ${i + 1} of ${count}`,
      'aria-controls': `carousel-slide-${i}`,
    });
    dot.addEventListener('click', () => showSlide(block, i, { focus: true }));
    dots.append(createTag('li', {}, dot));
  }

  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
  return createTag('div', { class: 'carousel-controls' }, [prev, dots, next]);
}

/**
 * Carousel: each row is a slide (image cell, content cell).
 * Variants: `autoplay` rotates slides with a progress indicator (paused on hover/focus).
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');
  block.setAttribute('aria-label', 'Featured');

  const track = createTag('ul', { class: 'carousel-slides' });
  rows.forEach((row, i) => track.append(buildSlide(row, i)));
  block.replaceChildren(track);

  if (rows.length > 1) block.append(buildControls(block, rows.length));
  showSlide(block, 0);
  if (rows.length > 1) startAutoplay(block);
}
