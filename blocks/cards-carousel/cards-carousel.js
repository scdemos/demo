import { decorateIcons, toClassName } from '../../scripts/aem.js';

/**
 * Cards carousel — "features" variant: rows of [icon | heading + body + CTA],
 * three cards per slide, prev/next + dots (Platform Capabilities pattern).
 *
 * Authoring: block name `Cards Carousel`, style/class `features` (optional; added by default).
 * Icon cell: picture, img, `span.icon` from `:icon-name:` in the doc pipeline, or plain `:icon-name:` text.
 */
export default function decorate(block) {
  if (!block.classList.contains('features')) {
    block.classList.add('features');
  }

  const rows = [...block.children];
  if (rows.length === 0) return;

  const chunkSize = 3;
  const slides = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    slides.push(rows.slice(i, i + chunkSize));
  }

  const track = document.createElement('div');
  track.className = 'cards-carousel-track';
  track.style.setProperty('--slide-count', String(slides.length));

  slides.forEach((slideRows) => {
    const slideEl = document.createElement('div');
    slideEl.className = 'cards-carousel-slide';

    slideRows.forEach((row) => {
      const cells = [...row.children];
      const iconCell = cells[0];
      const contentCell = cells[1] || cells[0];

      const card = document.createElement('div');
      card.className = 'cards-carousel-card';

      const iconWrap = document.createElement('div');
      iconWrap.className = 'cards-carousel-card-icon';
      const picture = iconCell?.querySelector('picture');
      const iconSpan = iconCell?.querySelector('span.icon');
      const iconImg = picture ? null : iconCell?.querySelector('img');

      if (picture) {
        iconWrap.append(picture);
      } else if (iconSpan) {
        iconWrap.append(iconSpan);
      } else if (iconImg) {
        iconWrap.append(iconImg);
      } else {
        const raw = iconCell?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const authored = raw.match(/^:([\w-]+):$/);
        if (authored) {
          const span = document.createElement('span');
          span.className = `icon icon-${toClassName(authored[1])}`;
          iconWrap.append(span);
        } else {
          iconWrap.innerHTML = '<span class="cards-carousel-icon-placeholder" aria-hidden="true"></span>';
        }
      }

      if (iconWrap.querySelector(':scope > span.icon')) {
        decorateIcons(iconWrap);
      }

      const body = document.createElement('div');
      body.className = 'cards-carousel-card-body';

      const heading = contentCell?.querySelector('h2, h3, h4');
      if (heading) {
        body.append(heading);
      }

      contentCell?.querySelectorAll('p:not(.button-container)').forEach((p) => {
        if (!p.querySelector('a[href]')) {
          body.append(p);
        }
      });

      const link = contentCell?.querySelector('a[href]');
      if (link) {
        const linkRow = document.createElement('p');
        linkRow.className = 'cards-carousel-card-cta';
        linkRow.append(link);
        body.append(linkRow);
      }

      card.append(iconWrap, body);
      slideEl.appendChild(card);
      row.remove();
    });

    track.appendChild(slideEl);
  });

  const nav = document.createElement('div');
  nav.className = 'cards-carousel-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'cards-carousel-prev';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.innerHTML = '<span aria-hidden="true">←</span>';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'cards-carousel-next';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.innerHTML = '<span aria-hidden="true">→</span>';

  const dots = document.createElement('div');
  dots.className = 'cards-carousel-dots';

  let current = 0;
  const max = slides.length - 1;
  const slideCount = slides.length;

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, max));
    /* % is relative to the track box; track is slideCount × viewport wide, so one “page” = 100%/slideCount of the track */
    track.style.transform = `translateX(calc(-1 * ${current} * 100% / ${slideCount}))`;
    dots.querySelectorAll('.cards-carousel-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
      d.setAttribute('aria-current', i === current ? 'true' : 'false');
    });
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `cards-carousel-dot${i === 0 ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Slide ${i + 1}`);
    dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });

  prevBtn.addEventListener('click', () => {
    goTo(current > 0 ? current - 1 : max);
  });
  nextBtn.addEventListener('click', () => {
    goTo(current < max ? current + 1 : 0);
  });

  if (slides.length <= 1) {
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    dots.hidden = true;
  }

  nav.append(prevBtn, dots, nextBtn);

  block.replaceChildren(track, nav);
  goTo(0);
}
