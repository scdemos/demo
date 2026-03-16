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
  const wrap = createTag('div', {
    class: `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`,
  });
  wrap.append(createTag('p', { class: 'quiz-feedback-result' }, isCorrect ? 'Correct' : 'Not quite'));
  if (!snippets.length) return wrap;

  const list = createTag('ul', { class: 'quiz-feedback-snippets' });
  snippets.forEach((snippet) => list.append(createTag('li', {}, snippet)));
  wrap.append(list);
  return wrap;
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
  }, '←') : null;
  const navNext = isSlider ? createTag('button', {
    type: 'button',
    class: 'quiz-nav-btn quiz-nav-next',
    'aria-label': 'Next question',
  }, '→') : null;
  const navCount = isSlider ? createTag('p', { class: 'quiz-nav-count' }, '') : null;

  function renderSlider() {
    if (!isSlider) return;
    sliderTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
    navCount.textContent = `${currentIndex + 1} / ${questions.length}`;
    navPrev.disabled = currentIndex === 0;
    navPrev.classList.toggle('is-hidden', currentIndex === 0);
    navNext.hidden = currentIndex === questions.length - 1;
    navNext.classList.toggle('is-hidden', currentIndex === questions.length - 1);
    submit.hidden = currentIndex !== questions.length - 1;
  }

  if (isSlider) {
    const nav = createTag('div', { class: 'quiz-nav' }, [navPrev, navCount, navNext]);
    const sliderShell = createTag('div', { class: 'quiz-slider-shell' }, [sliderViewport, nav]);
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
      questionEl.classList.remove('is-correct', 'is-incorrect');
      optionEls.forEach((el) => el.classList.remove('is-selected', 'is-correct', 'is-wrong'));

      if (!selected.length) {
        allAnswered = false;
        feedbackSlot.append(buildFeedback(false, ['Please select an answer before submitting.']));
        questionEl.classList.add('is-incorrect');
        return;
      }

      const correct = isCorrectSelection(selected, correctIndexes);
      if (correct) score += 1;
      questionEl.classList.add(correct ? 'is-correct' : 'is-incorrect');

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
      status.textContent = `${config.completeMessage} (${score}/${total})`;
      if (!config.doNotMarkLessonAsCompleted) {
        window.dispatchEvent(new CustomEvent('quiz:completed', { detail: { score, total } }));
      }
    } else {
      status.textContent = `You got ${score}/${total}. Review the feedback and try again.`;
    }
  });
}
