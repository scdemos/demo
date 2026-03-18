import { createTag } from '../../scripts/shared.js';
import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

function buildStep(row, index) {
  const cols = [...row.children];
  const titleSource = cols[0];
  const contentSource = cols[1];
  if (!titleSource || !contentSource) return null;

  const titleText = titleSource.textContent.trim() || `Step ${index + 1}`;
  const existingHeading = titleSource.querySelector(':is(h1, h2, h3, h4, h5, h6)');
  let title;
  if (existingHeading) {
    title = existingHeading;
    title.className = 'journey-map-step-title';
  } else {
    title = createTag('h3', { class: 'journey-map-step-title' });
    title.append(...[...titleSource.childNodes]);
  }
  moveInstrumentation(titleSource, title);

  const content = createTag('div', { class: 'journey-map-step-content' });
  content.append(...[...contentSource.childNodes]);
  moveInstrumentation(contentSource, content);

  const toggle = createTag('button', {
    type: 'button',
    class: 'journey-map-step-toggle',
    'aria-expanded': 'false',
  }, [
    createTag('span', { class: 'journey-map-step-toggle-copy' }, [title]),
    createTag('span', { class: 'journey-map-step-toggle-icon', 'aria-hidden': 'true' }, ''),
  ]);

  const step = createTag('article', {
    class: 'journey-map-step',
    'data-step-index': String(index),
  }, [toggle, content]);
  moveInstrumentation(row, step);

  return {
    step,
    toggle,
    content,
    titleText,
  };
}

/**
 * Decorates the journey-map block.
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  const steps = rows
    .map((row, index) => buildStep(row, index))
    .filter(Boolean);
  if (!steps.length) return;

  block.textContent = '';
  block.classList.add('journey-map');

  const intro = createTag('p', { class: 'journey-map-intro' }, 'Go step by step. Complete each checkpoint to unlock the next one.');
  const progressMeta = createTag('p', { class: 'journey-map-progress-meta' }, '');
  const progress = createTag('nav', { class: 'journey-map-progress', 'aria-label': 'Journey progress' });
  const progressList = createTag('ol', { class: 'journey-map-progress-list' });
  const checkpoints = steps.map(({ titleText }) => {
    const dot = createTag('span', { class: 'journey-map-progress-dot', 'aria-hidden': 'true' }, '');
    const item = createTag('li', {
      class: 'journey-map-progress-item',
      'aria-label': titleText,
      title: titleText,
    }, [dot]);
    progressList.append(item);
    return { item, dot };
  });
  progress.append(progressMeta, progressList);
  const track = createTag('div', { class: 'journey-map-track' });
  steps.forEach(({ step }) => track.append(step));
  const shell = createTag('div', { class: 'journey-map-shell' }, [progress, track]);
  block.append(intro, shell);

  let currentStep = -1;
  let highestStepReached = -1;

  function update() {
    const completeCount = Math.max(0, highestStepReached + 1);
    const progressRatio = steps.length > 0 ? Math.min(completeCount / steps.length, 1) : 0;
    progress.style.setProperty('--journey-progress', String(progressRatio));
    progressMeta.textContent = '';

    steps.forEach(({ step, toggle, content }, index) => {
      step.classList.remove('is-active', 'is-complete', 'is-upcoming');
      if (index <= highestStepReached) step.classList.add('is-complete');
      if (index === currentStep) step.classList.add('is-active');
      if (index > highestStepReached) step.classList.add('is-upcoming');

      const isCurrent = index === currentStep;
      const isComplete = index <= highestStepReached;
      const isUnlocked = index <= highestStepReached + 1;
      content.hidden = !isCurrent;
      toggle.setAttribute('aria-expanded', isCurrent ? 'true' : 'false');
      toggle.disabled = !isUnlocked;
      toggle.setAttribute('aria-disabled', isUnlocked ? 'false' : 'true');
      step.setAttribute('aria-current', isCurrent ? 'step' : 'false');
      step.setAttribute('data-completed', isComplete ? 'true' : 'false');
    });

    checkpoints.forEach(({ item, dot }, index) => {
      item.classList.remove('is-active', 'is-complete', 'is-upcoming');
      const isCurrent = index === currentStep;
      const isComplete = index <= highestStepReached;
      const stepHeight = steps[index]?.step?.getBoundingClientRect().height || 0;
      if (window.matchMedia('(width >= 900px)').matches) item.style.blockSize = '';
      else item.style.blockSize = stepHeight ? `${stepHeight}px` : '';
      if (isComplete) {
        item.classList.add('is-complete');
        dot.textContent = '';
      } else if (isCurrent) {
        item.classList.add('is-active');
        dot.textContent = '';
      } else {
        item.classList.add('is-upcoming');
        dot.textContent = '';
      }
    });
  }

  steps.forEach(({ toggle }, index) => {
    toggle.addEventListener('click', () => {
      if (index > highestStepReached + 1) return;
      if (currentStep === index) return;
      currentStep = index;
      highestStepReached = Math.max(highestStepReached, index);
      update();
    });
  });

  steps.forEach(({ step, toggle }, index) => {
    step.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea, label')) return;
      if (index > highestStepReached + 1) return;
      if (currentStep === index) return;
      toggle.click();
    });
  });

  update();
}
