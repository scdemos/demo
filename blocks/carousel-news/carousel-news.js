function updateActiveSlide(slide) {
  const block = slide.closest('.carousel-news');
  const slideIndex = parseInt(slide.dataset.slideIndex, 10);
  block.dataset.activeSlide = slideIndex;

  const slides = block.querySelectorAll('.carousel-news-slide');

  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== slideIndex);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (idx !== slideIndex) {
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('tabindex');
      }
    });
  });

  const indicators = block.querySelectorAll('.carousel-news-slide-indicator');
  indicators.forEach((indicator, idx) => {
    if (idx !== slideIndex) {
      indicator.querySelector('button').removeAttribute('disabled');
    } else {
      indicator.querySelector('button').setAttribute('disabled', 'true');
    }
  });
}

export function showSlide(block, slideIndex = 0, behavior = 'smooth') {
  const slides = block.querySelectorAll('.carousel-news-slide');
  let realSlideIndex = slideIndex < 0 ? slides.length - 1 : slideIndex;
  if (slideIndex >= slides.length) realSlideIndex = 0;
  const activeSlide = slides[realSlideIndex];

  activeSlide.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
  block.querySelector('.carousel-news-slides').scrollTo({
    top: 0,
    left: activeSlide.offsetLeft,
    behavior,
  });
}

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-news-slide-indicators');
  if (!slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) updateActiveSlide(entry.target);
    });
  }, { threshold: 0.5 });
  block.querySelectorAll('.carousel-news-slide').forEach((slide) => {
    slideObserver.observe(slide);
  });
}

/**
 * Groups every 4 rows into a single slide:
 * Row 0: image, Row 1: title, Row 2: description (may be empty), Row 3: CTA link
 */
function createSlide(rows, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-news-slide');

  const imageDiv = document.createElement('div');
  imageDiv.classList.add('carousel-news-slide-image');

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('carousel-news-slide-content');

  rows.forEach((row, idx) => {
    const cell = row.querySelector(':scope > div');
    if (!cell) return;

    if (idx === 0) {
      // Image row
      imageDiv.append(...cell.childNodes);
    } else if (idx === 1) {
      // Title row
      const titleEl = document.createElement('h3');
      titleEl.textContent = cell.textContent.trim();
      contentDiv.append(titleEl);
    } else if (idx === 2) {
      // Description row (may be empty)
      const text = cell.textContent.trim();
      if (text) {
        const descEl = document.createElement('p');
        descEl.textContent = text;
        contentDiv.append(descEl);
      }
    } else if (idx === 3) {
      // CTA row
      const link = cell.querySelector('a');
      if (link) {
        const ctaDiv = document.createElement('div');
        ctaDiv.classList.add('carousel-news-slide-cta');
        link.classList.remove('button');
        const wrapper = link.closest('.button-container');
        if (wrapper) {
          wrapper.classList.remove('button-container');
        }
        ctaDiv.append(link);
        contentDiv.append(ctaDiv);
      }
    }
  });

  slide.append(imageDiv);
  slide.append(contentDiv);

  return slide;
}

let carouselId = 0;
export default async function decorate(block) {
  carouselId += 1;
  block.setAttribute('id', `carousel-${carouselId}`);
  const rows = [...block.querySelectorAll(':scope > div')];
  const ROWS_PER_SLIDE = 4;
  const slideCount = Math.floor(rows.length / ROWS_PER_SLIDE);
  const isSingleSlide = slideCount < 2;

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'Carousel');

  const container = document.createElement('div');
  container.classList.add('carousel-news-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-news-slides');

  let slideIndicators;
  if (!isSingleSlide) {
    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', 'Carousel Slide Controls');
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-news-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    block.append(slideIndicatorsNav);

    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-news-navigation-buttons');
    slideNavButtons.innerHTML = `
      <button type="button" class="slide-prev" aria-label="Previous Slide"></button>
      <button type="button" class="slide-next" aria-label="Next Slide"></button>
    `;

    container.append(slideNavButtons);
  }

  for (let i = 0; i < slideCount; i += 1) {
    const slideRows = rows.slice(i * ROWS_PER_SLIDE, (i + 1) * ROWS_PER_SLIDE);
    const slide = createSlide(slideRows, i, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-news-slide-indicator');
      indicator.dataset.targetSlide = i;
      indicator.innerHTML = `<button type="button" aria-label="Show Slide ${i + 1} of ${slideCount}"></button>`;
      slideIndicators.append(indicator);
    }
  }

  // Remove original rows
  rows.forEach((row) => row.remove());

  container.append(slidesWrapper);
  block.prepend(container);

  if (!isSingleSlide) {
    bindEvents(block);
  }
}
