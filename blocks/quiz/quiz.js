import { createTag } from '../../scripts/shared.js';

function toBool(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeText(value = '') {
  return String(value).trim();
}

function parseRows(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const config = {
    completeMessage: 'Great job! You completed the quiz.',
    doNotMarkLessonAsCompleted: false,
  };

  let startIndex = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const firstCol = normalizeText(rows[i].children[0]?.textContent);
    const secondCol = normalizeText(rows[i].children[1]?.textContent);
    if (firstCol.toLowerCase() === 'questions') {
      startIndex = i + 1;
      break;
    }
    if (firstCol.toLowerCase() === 'complete message') {
      config.completeMessage = secondCol || config.completeMessage;
    }
    if (firstCol.toLowerCase() === 'do not mark lesson as completed') {
      config.doNotMarkLessonAsCompleted = toBool(secondCol);
    }
  }

  const questions = [];
  let currentQuestion = null;

  rows.slice(startIndex).forEach((row) => {
    const questionCell = normalizeText(row.children[0]?.textContent);
    const optionText = normalizeText(row.children[1]?.textContent);
    const isCorrect = toBool(row.children[2]?.textContent);
    const snippet = normalizeText(row.children[3]?.textContent);

    if (questionCell) {
      currentQuestion = {
        text: questionCell,
        options: [],
      };
      questions.push(currentQuestion);
    }
    if (!currentQuestion || !optionText) return;

    currentQuestion.options.push({
      text: optionText,
      correct: isCorrect,
      snippet,
    });
  });

  return { config, questions };
}

function getSelectedIndexes(questionEl) {
  return [...questionEl.querySelectorAll('input:checked')]
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value));
}

function isCorrectSelection(selected, correctIndexes) {
  if (selected.length !== correctIndexes.length) return false;
  return correctIndexes.every((idx) => selected.includes(idx));
}

function buildFeedback(isCorrect, snippets = []) {
  const label = isCorrect ? 'Correct' : 'Not quite';
  const text = snippets.length ? `${label} — ${snippets.join(' ')}` : label;
  return createTag('p', {
    class: `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`,
  }, text);
}

/**
 * Loads and decorates the quiz block.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const { config, questions } = parseRows(block);
  if (!questions.length) {
    block.textContent = '';
    block.append(createTag('p', { class: 'quiz-empty' }, 'No quiz questions found.'));
    return;
  }

  block.textContent = '';
  block.classList.add('quiz');

  const status = createTag('div', { class: 'quiz-status', role: 'status', 'aria-live': 'polite' });
  const completeBanner = createTag('div', { class: 'quiz-complete-banner', hidden: true });
  const form = createTag('form', { class: 'quiz-form' });
  const submit = createTag('button', { type: 'submit', class: 'quiz-submit' }, 'Check answers');
  const isSlider = questions.length > 1;
  const sliderTrack = createTag('div', { class: isSlider ? 'quiz-slider-track' : 'quiz-questions-list' });
  const sliderViewport = isSlider ? createTag('div', { class: 'quiz-slider' }, sliderTrack) : null;

  questions.forEach((question, qIndex) => {
    const correctIndexes = question.options
      .map((option, index) => (option.correct ? index : null))
      .filter((idx) => idx !== null);
    const multiCorrect = correctIndexes.length > 1;
    const fieldset = createTag('fieldset', { class: 'quiz-question', 'data-question-index': String(qIndex) });
    const legend = createTag('legend', { class: 'quiz-question-title' }, question.text);
    fieldset.append(legend);
    if (multiCorrect) {
      fieldset.append(createTag('p', { class: 'quiz-instruction' }, 'Select all that apply.'));
    }

    const options = createTag('div', { class: 'quiz-options' });
    question.options.forEach((option, oIndex) => {
      const inputId = `quiz-${qIndex}-${oIndex}`;
      const input = createTag('input', {
        id: inputId,
        type: multiCorrect ? 'checkbox' : 'radio',
        name: `question-${qIndex}`,
        value: String(oIndex),
      });
      const label = createTag('label', { class: 'quiz-option', for: inputId }, [
        input,
        createTag('span', { class: 'quiz-option-label' }, option.text),
      ]);
      options.append(label);
    });

    const feedbackSlot = createTag('div', { class: 'quiz-feedback-slot' });
    fieldset.append(options, feedbackSlot);
    fieldset.dataset.correctIndexes = JSON.stringify(correctIndexes);
    sliderTrack.append(fieldset);
  });

  let currentIndex = 0;
  const navPrev = isSlider ? createTag('button', {
    type: 'button',
    class: 'quiz-nav-btn quiz-nav-prev',
    'aria-label': 'Previous question',
  }, '← Back') : null;
  const navNext = isSlider ? createTag('button', {
    type: 'button',
    class: 'quiz-nav-btn quiz-nav-next',
    'aria-label': 'Next question',
  }, 'Next →') : null;
  const dots = isSlider ? questions.map((_, i) => createTag('li', {
    class: `quiz-nav-dot${i === 0 ? ' is-active' : ''}`,
    'aria-hidden': 'true',
  })) : [];
  const navDots = isSlider ? createTag('ol', { class: 'quiz-nav-dots' }, dots) : null;

  function currentQuestionAnswered() {
    const currentQuestion = sliderTrack.querySelectorAll('.quiz-question')[currentIndex];
    return currentQuestion ? getSelectedIndexes(currentQuestion).length > 0 : false;
  }

  function renderSlider() {
    if (!isSlider) return;
    sliderTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === currentIndex));
    navPrev.disabled = currentIndex === 0;
    navPrev.classList.toggle('is-hidden', currentIndex === 0);
    navNext.classList.toggle('is-hidden', currentIndex === questions.length - 1);
    navNext.disabled = !currentQuestionAnswered();
    submit.hidden = currentIndex !== questions.length - 1;
  }

  if (isSlider) {
    const nav = createTag('div', { class: 'quiz-nav' }, [navPrev, navDots, navNext]);
    const sliderShell = createTag('div', { class: 'quiz-slider-shell' }, [sliderViewport, nav, completeBanner]);
    form.append(sliderShell);
  } else {
    form.append(sliderTrack);
  }
  form.append(submit);
  block.append(status, form);

  navPrev?.addEventListener('click', () => {
    currentIndex = Math.max(0, currentIndex - 1);
    renderSlider();
  });

  navNext?.addEventListener('click', () => {
    currentIndex = Math.min(questions.length - 1, currentIndex + 1);
    renderSlider();
  });

  sliderTrack.addEventListener('change', () => {
    navNext.disabled = !currentQuestionAnswered();
  });

  renderSlider();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let score = 0;
    let allAnswered = true;
    const questionEls = [...form.querySelectorAll('.quiz-question')];

    questionEls.forEach((questionEl) => {
      const selected = getSelectedIndexes(questionEl);
      const correctIndexes = JSON.parse(questionEl.dataset.correctIndexes || '[]');
      const feedbackSlot = questionEl.querySelector('.quiz-feedback-slot');
      const optionEls = [...questionEl.querySelectorAll('.quiz-option')];
      feedbackSlot.textContent = '';
      optionEls.forEach((el) => el.classList.remove('is-selected', 'is-correct', 'is-wrong'));

      if (!selected.length) {
        allAnswered = false;
        feedbackSlot.append(buildFeedback(false, ['Please select an answer before submitting.']));
        return;
      }

      const correct = isCorrectSelection(selected, correctIndexes);
      if (correct) score += 1;

      const snippets = [];
      selected.forEach((selectedIndex) => {
        const label = optionEls[selectedIndex];
        const isCorrectOption = correctIndexes.includes(selectedIndex);
        label?.classList.add('is-selected', isCorrectOption ? 'is-correct' : 'is-wrong');
        const snippet = questions[Number(questionEl.dataset.questionIndex)].options[selectedIndex]?.snippet;
        if (snippet) snippets.push(snippet);
      });
      if (!snippets.length && !correct) {
        const firstCorrect = correctIndexes[0];
        const fallback = questions[Number(questionEl.dataset.questionIndex)].options[firstCorrect]?.snippet;
        if (fallback) snippets.push(fallback);
      }
      feedbackSlot.append(buildFeedback(correct, snippets));
    });

    if (!allAnswered) {
      if (isSlider) {
        const firstUnanswered = questionEls.findIndex((questionEl) => !getSelectedIndexes(questionEl).length);
        if (firstUnanswered >= 0) {
          currentIndex = firstUnanswered;
          renderSlider();
        }
      }
      status.textContent = 'Please answer all questions and try again.';
      return;
    }

    const total = questions.length;
    if (score === total) {
      completeBanner.textContent = config.completeMessage;
      completeBanner.className = 'quiz-complete-banner is-success';
      completeBanner.hidden = false;
      status.textContent = `${config.completeMessage} (${score}/${total})`;
      if (!config.doNotMarkLessonAsCompleted) {
        window.dispatchEvent(new CustomEvent('quiz:completed', { detail: { score, total } }));
      }
    } else {
      completeBanner.textContent = `You scored ${score} of ${total} — review each question and try again.`;
      completeBanner.className = 'quiz-complete-banner is-retry';
      completeBanner.hidden = false;
      status.textContent = `You got ${score}/${total}.`;
    }
  });
}
