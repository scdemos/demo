export default function decorate(block) {
  const slides = [...block.children];
  if (slides.length === 0) return;

  const track = document.createElement('div');
  track.className = 'testimonial-track';

  slides.forEach((slide) => {
    const cells = [...slide.children];
    const slideEl = document.createElement('div');
    slideEl.className = 'testimonial-slide';

    const quote = document.createElement('blockquote');
    quote.className = 'testimonial-quote';
    quote.textContent = cells[0]?.textContent?.trim() || '';

    const attribution = document.createElement('p');
    attribution.className = 'testimonial-attribution';
    attribution.textContent = cells[1]?.textContent?.trim() || '';

    slideEl.appendChild(quote);
    slideEl.appendChild(attribution);
    track.appendChild(slideEl);
  });

  // Navigation
  const nav = document.createElement('div');
  nav.className = 'testimonial-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'testimonial-prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.textContent = '←';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'testimonial-next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.textContent = '→';

  const dots = document.createElement('div');
  dots.className = 'testimonial-dots';

  let current = 0;

  function goTo(idx) {
    current = idx;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.testimonial-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = `testimonial-dot${i === 0 ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Slide ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });

  prevBtn.addEventListener('click', () => {
    goTo(current > 0 ? current - 1 : slides.length - 1);
  });

  nextBtn.addEventListener('click', () => {
    goTo(current < slides.length - 1 ? current + 1 : 0);
  });

  nav.appendChild(prevBtn);
  nav.appendChild(dots);
  nav.appendChild(nextBtn);

  block.textContent = '';
  block.appendChild(track);
  block.appendChild(nav);
}
