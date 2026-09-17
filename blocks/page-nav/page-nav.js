/*
 * Page nav block — in-page anchor navigation (secondary nav).
 * Authored as a list of links whose hrefs point to section anchors on the page
 * (e.g. #your-industry). One link may target the demo/contact section and is
 * rendered as the right-aligned CTA pill (matched by an #…demo / contact href).
 * Behavior: sticky under the header, smooth-scroll to sections, and a scrollspy
 * that highlights the link for the section currently in view.
 */

function getStickyOffset() {
  // The bar pins to the top of the viewport (top: 0), so scroll targets only
  // need to clear the bar's own height.
  const bar = document.querySelector('.page-nav.block');
  return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
}

export default function decorate(block) {
  const links = [...block.querySelectorAll('a')];
  if (!links.length) return;

  const nav = document.createElement('nav');
  nav.className = 'page-nav-inner';
  nav.setAttribute('aria-label', 'On this page');

  const list = document.createElement('ul');
  list.className = 'page-nav-list';

  const anchors = [];
  links.forEach((a) => {
    // Strip EDS button auto-decoration so links aren't rendered as red pills.
    a.classList.remove('button');
    a.closest('.button-container')?.classList.remove('button-container');
    const href = a.getAttribute('href') || '';
    const isCta = /demo|contact/i.test(href);
    if (isCta) {
      a.classList.add('page-nav-cta');
      nav.dataset.hasCta = 'true';
      nav.append(a);
      // On-page CTA anchors smooth-scroll too (rather than a hard jump).
      if (href.startsWith('#')) anchors.push(a);
      return;
    }
    const li = document.createElement('li');
    a.classList.add('page-nav-link');
    li.append(a);
    list.append(li);
    if (href.startsWith('#')) anchors.push(a);
  });

  nav.prepend(list);
  block.textContent = '';
  block.append(nav);

  // Fixed-on-scroll: the block lives inside a short section, so position:sticky
  // can't hold it across the page. Instead, pin it to the top of the viewport
  // (position:fixed) once its natural position scrolls out of view. A sentinel
  // marks that natural position; an IntersectionObserver watches it so the
  // pinned state always reflects the real layout — unlike a scroll handler run
  // at decorate time, which can misfire before the page has finished laying out.
  const sentinel = document.createElement('div');
  sentinel.className = 'page-nav-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  block.before(sentinel);

  const placeholder = document.createElement('div');
  placeholder.className = 'page-nav-placeholder';
  placeholder.hidden = true;
  block.before(placeholder);

  const setFixed = (fixed) => {
    if (fixed === block.classList.contains('is-fixed')) return;
    if (fixed) {
      placeholder.style.height = `${block.offsetHeight}px`;
      placeholder.hidden = false;
    } else {
      placeholder.hidden = true;
    }
    block.classList.toggle('is-fixed', fixed);
  };

  const stickyObserver = new IntersectionObserver(([entry]) => {
    // Pin once the sentinel has scrolled above the top of the viewport.
    setFixed(entry.boundingClientRect.top < 0);
  }, { threshold: 0 });
  stickyObserver.observe(sentinel);

  // Smooth scroll accounting for the sticky bar. Set scroll-margin-top on the
  // target so the browser reserves space for the pinned bar (plus breathing
  // room) and then let scrollIntoView do the scroll. Using scroll-margin rather
  // than a pre-computed absolute offset keeps the landing accurate even if the
  // layout above shifts (lazy images, reveal animations) mid-scroll.
  const scrollToTarget = (target) => {
    target.style.scrollMarginTop = `${getStickyOffset() + 24}px`;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  anchors.forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      scrollToTarget(target);
      window.history.replaceState(null, '', `#${id}`);
    });
  });

  // Scrollspy — highlight the link whose section is currently in view.
  const sections = anchors
    .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const setActive = (id) => {
      anchors.forEach((a) => {
        a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`);
      });
    };
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((en) => en.isIntersecting)
        .sort((x, y) => y.intersectionRatio - x.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, {
      rootMargin: `-${getStickyOffset() + 20}px 0px -55% 0px`,
      threshold: [0, 0.25, 0.5],
    });
    sections.forEach((s) => observer.observe(s));
  }
}
