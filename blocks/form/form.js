import {
  toCamelCase, toClassName, buildBlock, decorateBlock, loadBlock,
} from '../../scripts/aem.js';
import { trackEvent } from '../../scripts/shared.js';

const DEFAULT_MESSAGES = {
  sending: 'Sending...',
  success: 'Thanks! Your message has been sent.',
  error: 'Unable to submit right now. Please try again.',
  invalid: '',
  continue: 'Continue',
  back: 'Back',
  progress: '',
};

const fill = (text, values) => text.replace(/\{([\w-]+)\}/g, (m, k) => (k in values ? values[k] : m));

/**
 * A date column value as YYYY-MM-DD: `today`, `+N` (N days from today) or a date as written.
 * @param {string} raw
 * @returns {string}
 */
function dayValue(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const days = value === 'today' ? 0 : value.match(/^\+\s*(\d+)$/)?.[1];
  if (days === undefined) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/**
 * Splits an authored options string. `|` separates options when present (so labels can
 * contain commas; end a single comma-containing option with `|`), otherwise `,`.
 * @param {string} options
 * @returns {string[]}
 */
function splitOptions(options = '') {
  return options.split(options.includes('|') ? '|' : ',').map((o) => o.trim()).filter(Boolean);
}

/** Sheet booleans arrive as `true`, `TRUE` or `True`. */
function isRequired(value) {
  return String(value).toLowerCase() === 'true';
}

function generateId(name, option = null) {
  const id = toCamelCase(name);
  return option ? `${id}-${toCamelCase(option)}` : id;
}

function buildLabel(text, type = 'label', id = null, required = false) {
  const label = createElement(type);
  label.textContent = text;
  if (id && type === 'label') label.setAttribute('for', id);
  if (required) label.dataset.required = 'true';
  return label;
}

function buildInput(field) {
  const {
    type, field: fieldName, required, default: defaultValue, placeholder,
  } = field;
  const input = createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type === 'textarea') input.rows = 5;
  else input.type = type || 'text';
  input.id = generateId(fieldName);
  input.name = input.id;
  input.required = isRequired(required);
  if (type === 'email') input.autocomplete = 'email';
  if (defaultValue) input.value = defaultValue;
  if (placeholder) input.placeholder = placeholder;
  if (type === 'date') {
    const min = dayValue(field.min);
    const max = dayValue(field.max);
    if (min) input.min = min;
    if (max) input.max = max;
  }
  return input;
}

function buildOptionInput(field, option) {
  const {
    type, field: fieldName, default: defaultValue, required,
  } = field;
  const input = createElement('input');
  input.type = type;
  input.id = generateId(fieldName, option);
  input.name = generateId(fieldName);
  input.value = option;
  input.checked = option === defaultValue;
  input.required = isRequired(required);
  return input;
}

// this site, where the block's code comes from: the page's own origin, or the site an
// aem-embed host loads it from
const SITE = new URL(import.meta.url).origin;

// `--repo--owner` of an aem.page / aem.live host, e.g. `--demo--scdemos`
const siteOf = (hostname) => hostname.match(/(--[^.]+--[^.]+)\.aem\.(page|live)$/)?.[1];

/**
 * A link to this site as a path, so it resolves on every host, including localhost and
 * an aem-embed host; links elsewhere give null. This site is the page's and the code's
 * origin, and their aem.page / aem.live hosts; `anyAem` also takes any aem.page / aem.live
 * host (the form's own sheet and confirmation links, which are always this site's).
 * @param {string} raw - Path or URL
 * @param {boolean} [anyAem] - Treat every aem.page / aem.live host as this site
 * @returns {string|null} Path (e.g. /thank-you) or null
 */
function sitePath(raw, anyAem = false) {
  try {
    const url = new URL(String(raw || '').trim(), SITE);
    const origins = [SITE, window.location.origin];
    const own = origins.map((o) => siteOf(new URL(o).hostname)).filter(Boolean);
    const aem = siteOf(url.hostname);
    const sameSite = origins.includes(url.origin)
      || (aem && (anyAem || own.includes(aem)));
    return sameSite ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

/**
 * Where to fetch a sheet: this site's copy for links to the site (also when embedded on
 * another site), otherwise the URL as given.
 * @param {string} raw - Path or URL
 * @param {boolean} [anyAem] - See sitePath
 * @returns {string} URL to fetch
 */
const sheetUrl = (raw, anyAem = false) => {
  const path = sitePath(raw, anyAem);
  return path ? `${SITE}${path}` : String(raw).trim();
};

const isUrl = (options) => /^(https?:\/\/|\/)/.test(String(options || '').trim());

/**
 * Options listed in a sheet: `option` and `value` columns, or `name` and `id` (e.g. the
 * locations sheet), so a value can come straight from a link such as `?location=new-york`;
 * an optional `description` column adds a line under a radio or checkbox option.
 * @param {string} url - Sheet JSON: a path or full URL on this site, or a URL elsewhere
 * @returns {Promise<Array<{value: string, label: string, description: string}>>}
 */
async function loadOptions(url) {
  const resp = await fetch(sheetUrl(url));
  if (!resp.ok) throw new Error(`${resp.status}`);
  const { data = [] } = await resp.json();
  return data.map((row) => {
    const value = row.value || row.id || row.option || row.name;
    return value && { value, label: row.option || row.name || value, description: row.description || '' };
  }).filter(Boolean);
}

function appendOptions(fieldset, field, options) {
  options.forEach(({ value, label, description }) => {
    const input = buildOptionInput(field, value);
    const labelEl = buildLabel(label, 'label', input.id);
    if (description) {
      labelEl.textContent = '';
      labelEl.append(
        createElement('strong', 'option-label'),
        createElement('small', 'option-description'),
      );
      labelEl.firstChild.textContent = label;
      labelEl.lastChild.textContent = description;
    }
    labelEl.prepend(input, createElement('span'));
    fieldset.append(labelEl);
  });
}

function buildOptions(field) {
  const {
    type, options, label, required,
  } = field;
  if (!options) return null;

  const fieldset = createElement('fieldset', `form-field ${type}-field`);
  fieldset.append(buildLabel(label, 'legend', null, isRequired(required)));
  if (isUrl(options)) {
    fieldset.ready = loadOptions(options)
      .then((os) => {
        if (!os.length && isRequired(required)) throw new Error('no options');
        appendOptions(fieldset, field, os);
      })
      .catch((error) => {
        console.error('form: could not load options from', options, error);
        // a required choice that can't be shown can't be answered
        if (isRequired(required)) throw error;
      });
  } else {
    appendOptions(fieldset, field, splitOptions(options).map((o) => ({ value: o, label: o })));
  }
  return fieldset;
}

function buildSelect(field) {
  const {
    type, options, field: fieldName, label, required, placeholder,
  } = field;
  if (!options) return null;

  const wrapper = createElement('div', `form-field ${type}-field`);
  const select = createElement('select');
  select.id = generateId(fieldName);
  select.name = select.id;
  select.required = isRequired(required);
  wrapper.append(buildLabel(label, 'label', select.id, select.required), select);

  if (placeholder) {
    const placeholderOption = createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.append(placeholderOption);
  }

  if (isUrl(options)) {
    wrapper.ready = loadOptions(options)
      .then((os) => {
        if (!os.length && select.required) throw new Error('no options');
        os.forEach(({ value, label: text }) => {
          const optionEl = createElement('option');
          optionEl.value = value;
          optionEl.textContent = text;
          select.append(optionEl);
        });
      })
      .catch((error) => {
        console.error('form: could not load options from', options, error);
        if (select.required) throw error;
      });
  } else {
    splitOptions(options).forEach((option) => {
      const optionEl = createElement('option');
      optionEl.value = option;
      optionEl.textContent = option;
      select.append(optionEl);
    });
  }
  return wrapper;
}

function buildToggle(field) {
  const { label, required, default: defaultValue } = field;
  const wrapper = createElement('div', 'form-field toggle-field');
  const input = buildOptionInput({ ...field, type: 'checkbox' }, defaultValue || 'true');
  input.setAttribute('role', 'switch');
  const labelEl = buildLabel(label, 'label', input.id, isRequired(required));
  labelEl.prepend(input, createElement('span'));
  wrapper.append(labelEl);
  return wrapper;
}

function buildButton(field) {
  const { type, label } = field;
  const button = createElement('button', `button ${type === 'reset' ? 'secondary' : 'primary'}`);
  button.type = type;
  button.textContent = label;
  return button;
}

function buildTextField(field) {
  const { type, label, required } = field;
  const wrapper = createElement('div', `form-field ${type}-field`);
  const input = buildInput(field);
  wrapper.append(buildLabel(label, 'label', input.id, isRequired(required)), input);
  return wrapper;
}

/**
 * Creates a form field based on field configuration
 * @param {Object} field - Field configuration object
 * @returns {HTMLElement|null} Form field element (fieldset, div, or button)
 */
function buildField(field) {
  const {
    type, help, field: fieldName, conditional,
  } = field;
  if (type === 'submit' || type === 'reset') return buildButton(field);
  if (type === 'hidden') {
    // sent as authored (e.g. `_form` names the form in the Slack message)
    const input = createElement('input');
    input.type = 'hidden';
    input.name = fieldName;
    input.value = field.default || '';
    return input;
  }

  let el;
  if (type === 'radio' || type === 'checkbox') el = buildOptions(field);
  else if (type === 'toggle') el = buildToggle(field);
  else if (type === 'select') el = buildSelect(field);
  else el = buildTextField(field);
  if (!el) return null;

  if (help) {
    const helpText = createElement('p', 'field-help-text');
    helpText.id = `${generateId(fieldName)}-help`;
    helpText.textContent = help;
    el.append(helpText);
  }
  if (conditional) {
    [el.dataset.controller] = conditional.split('-');
    el.dataset.condition = conditional;
  }
  if (String(field.width || '').trim().toLowerCase() === 'half') el.classList.add('half');
  return el;
}

/** Points each field's inputs at its help text (also the options that came from a sheet). */
function describeFields(form) {
  form.querySelectorAll('.field-help-text').forEach((help) => {
    help.parentElement.querySelectorAll('input, select, textarea')
      .forEach((input) => input.setAttribute('aria-describedby', help.id));
  });
}

/**
 * Shows a conditional field only when its controlling input has a matching value.
 * Hidden fields are not required so they never block submission.
 * @param {HTMLFormElement} form - Form element
 */
function enableConditionals(form) {
  const fields = [...form.querySelectorAll('[data-controller]')];
  if (!fields.length) return;
  fields.forEach((field) => field.querySelectorAll('[required]').forEach((input) => {
    input.dataset.required = 'true';
  }));

  const update = (controller) => {
    const value = form.querySelector(`[name="${controller}"]:checked, select[name="${controller}"]`)?.value;
    fields.filter((field) => field.dataset.controller === controller).forEach((field) => {
      const visible = Boolean(value) && field.dataset.condition.includes(toClassName(value));
      field.hidden = !visible;
      field.querySelectorAll('[data-required]').forEach((input) => { input.required = visible; });
    });
  };

  new Set(fields.map((field) => field.dataset.controller)).forEach(update);
  form.addEventListener('change', (e) => update(e.target.name));
}

function toggleForm(form, disabled = true) {
  [...form.elements].forEach((el) => { el.disabled = disabled; });
}

function generatePayload(form) {
  const payload = {};
  [...form.elements].forEach((field) => {
    if (!field.name || field.disabled) return;
    if (field.type === 'radio') {
      if (field.checked) payload[field.name] = field.value;
    } else if (field.type === 'checkbox') {
      if (field.checked) payload[field.name] = payload[field.name] ? `${payload[field.name]},${field.value}` : field.value;
    } else {
      payload[field.name] = field.value;
    }
  });
  return payload;
}

/** Fills `{name}` placeholders in the text of `root` (e.g. `{ref}`, `{email}`). */
function fillText(root, values) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes('{')) node.nodeValue = fill(node.nodeValue, values);
  }
}

/**
 * Replaces the form with the content of the confirmation fragment, its `{name}` placeholders
 * filled in. The form stays if the fragment fails to load.
 * @param {HTMLFormElement} form - Form element
 * @param {string} confirmationPath - Path to the confirmation fragment (e.g. /thank-you)
 * @param {Object} values - Placeholder values
 * @returns {Promise<boolean>} True if replacement succeeded
 */
async function replaceWithThankYou(form, confirmationPath, values) {
  const path = sitePath(confirmationPath, true)?.replace(/[?#].*$/, '');
  const block = form.closest('.block');
  if (!path || !block) return false;

  const link = document.createElement('a');
  link.href = path;
  const fragmentBlock = buildBlock('fragment', [[link]]);
  const holder = document.createElement('div');
  holder.hidden = true;
  holder.append(fragmentBlock);
  block.parentElement.append(holder);

  try {
    decorateBlock(fragmentBlock);
    await loadBlock(fragmentBlock);
    if (!fragmentBlock.querySelector('.section')) return false;
    fillText(fragmentBlock, values);
    const done = createElement('div', 'form-done');
    done.tabIndex = -1;
    done.append(...fragmentBlock.childNodes);
    form.replaceWith(done);
    done.focus();
    return true;
  } catch (error) {
    console.error('form: could not load confirmation fragment', path, error);
    return false;
  } finally {
    holder.remove();
  }
}

/** A short booking-style reference, e.g. K7Q2XM. */
const reference = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function handleSubmit(form, messages) {
  const status = form.querySelector('.form-status');
  const setStatus = (msg, state = '') => {
    status.textContent = msg;
    status.dataset.state = state;
  };
  const payload = generatePayload(form);
  const confirmation = form.dataset.confirmation;
  // a reference only when the success message or confirmation asks for one
  if (/\{ref\}/.test(messages.success) || confirmation) payload.reference = reference();
  const values = { ...payload, ref: payload.reference || '' };
  const succeed = () => {
    setStatus(fill(messages.success, values), 'success');
    form.reset();
    form.dispatchEvent(new CustomEvent('form:sent'));
  };
  const sent = () => trackEvent('generate_lead', { lead_source: 'form' });

  if (!form.dataset.action) {
    succeed();
    sent();
    return;
  }

  try {
    const body = JSON.stringify({ data: payload });
    toggleForm(form);
    setStatus(messages.sending);
    const response = await fetch(form.dataset.action, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    const replaced = confirmation && await replaceWithThankYou(form, confirmation, values);
    if (!replaced) succeed();
    sent();
  } catch (error) {
    setStatus(messages.error, 'error');
    console.error('form: submission failed', error);
  } finally {
    toggleForm(form, false);
  }
}

/** Marks the invalid fields of `scope`, says so in the status line and focuses the first. */
function reportInvalid(form, scope, messages) {
  const invalid = [...scope.querySelectorAll('input, select, textarea')]
    .filter((el) => !el.disabled && !el.closest('[hidden]') && !el.checkValidity());
  invalid.forEach((el) => el.setAttribute('aria-invalid', 'true'));
  if (!invalid.length) return true;
  const status = form.querySelector('.form-status');
  if (messages.invalid) {
    status.textContent = messages.invalid;
    status.dataset.state = 'error';
  }
  invalid[0].focus();
  return false;
}

function enableSubmission(form, submit, fields, messages) {
  if (submit) form.dataset.action = submit;
  const confirmation = fields.find((f) => f.type === 'confirmation');
  if (confirmation) form.dataset.confirmation = confirmation.label || confirmation.default;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.steps && !form.steps.onLast()) {
      // Enter on an earlier step continues to the next one
      form.steps.next();
      return;
    }
    if (form.steps) {
      // every step was checked on Continue; a step that is not shown can't take focus
      const invalid = [...form.elements].find((el) => !el.disabled && el.willValidate
        && !el.closest('.form-field[hidden]') && !el.checkValidity());
      const step = invalid?.closest('.form-step');
      if (step?.hidden) form.steps.show(form.steps.panels.indexOf(step));
      if (reportInvalid(form, form, messages)) handleSubmit(form, messages);
      return;
    }
    if (form.reportValidity()) {
      handleSubmit(form, messages);
      return;
    }
    reportInvalid(form, form, messages);
  });

  form.addEventListener('input', (e) => {
    if (!e.target.hasAttribute('aria-invalid') || !e.target.validity.valid) return;
    const group = e.target.name ? form.querySelectorAll(`[name="${e.target.name}"]`) : [e.target];
    group.forEach((el) => el.removeAttribute('aria-invalid'));
  });
}

let formCount = 0;

/**
 * Keeps ids unique when a page has several forms (e.g. the contact form and the footer
 * newsletter both have an email field): every form after the first gets a numbered suffix,
 * and its labels and descriptions follow. Field names, and so the payload, are unchanged.
 * @param {HTMLFormElement} form
 */
function makeIdsUnique(form) {
  formCount += 1;
  if (formCount === 1) return;
  const ids = new Map();
  form.querySelectorAll('[id]').forEach((el) => {
    ids.set(el.id, `${el.id}-${formCount}`);
    el.id = ids.get(el.id);
  });
  form.querySelectorAll('label[for]').forEach((label) => {
    if (ids.has(label.htmlFor)) label.htmlFor = ids.get(label.htmlFor);
  });
  form.querySelectorAll('[aria-describedby]').forEach((el) => {
    const refs = el.getAttribute('aria-describedby').split(/\s+/).map((id) => ids.get(id) || id);
    el.setAttribute('aria-describedby', refs.join(' '));
  });
}

/** What a field's answer reads as in the review step. */
function answerOf(field) {
  if (field.matches('.radio-field, .checkbox-field')) {
    return [...field.querySelectorAll('input:checked')]
      .map((input) => (input.closest('label').querySelector('.option-label') || input.closest('label')).textContent.trim())
      .join(', ');
  }
  const control = field.querySelector('input, select, textarea');
  if (!control || control.type === 'checkbox') return '';
  if (control.tagName === 'SELECT') return control.value ? control.selectedOptions[0].textContent : '';
  if (control.type === 'date' && control.value) {
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'full' })
      .format(new Date(`${control.value}T00:00`));
  }
  return control.value.trim();
}

function fillReview(panels, index) {
  const list = panels[index].querySelector('.form-review');
  if (!list) return;
  list.textContent = '';
  panels.slice(0, index).forEach((panel) => {
    panel.querySelectorAll('.form-field:not([hidden], .toggle-field)').forEach((field) => {
      const title = field.querySelector(':scope > legend, :scope > label:first-child');
      if (!title || field.matches('.checkbox-field') && !field.querySelector('input:checked')) return;
      const dt = createElement('dt');
      dt.textContent = title.textContent;
      const dd = createElement('dd');
      dd.textContent = answerOf(field) || '—';
      const row = createElement('div');
      row.append(dt, dd);
      list.append(row);
    });
  });
}

/**
 * Splits the form at its `step` rows: one panel per step with a progress list, Back and
 * Continue buttons, and a check of each step's fields before the next. A `review` row starts
 * a step that lists the answers given so far.
 */
function enableSteps(form, panels, messages) {
  const stepper = createElement('ol', 'form-stepper');
  if (messages.progress) stepper.setAttribute('aria-label', messages.progress);
  panels.forEach((panel) => {
    const li = createElement('li');
    li.textContent = panel.dataset.label;
    stepper.append(li);
  });
  form.prepend(stepper);

  let current = 0;
  const show = (index, focus = true) => {
    current = index;
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
    [...stepper.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < index);
      if (i === index) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    fillReview(panels, index);
    const status = form.querySelector('.form-status');
    status.textContent = '';
    status.dataset.state = '';
    if (focus) panels[index].querySelector('.form-step-title')?.focus();
  };

  const next = () => {
    if (reportInvalid(form, panels[current], messages)) show(current + 1);
  };
  form.addEventListener('click', (e) => {
    const button = e.target.closest('[data-step]');
    if (!button) return;
    if (button.dataset.step === 'back') show(current - 1);
    else next();
  });
  form.addEventListener('form:sent', () => {
    stepper.hidden = true;
    panels.forEach((panel) => { panel.hidden = true; });
  });
  form.steps = {
    panels, show, next, onLast: () => current === panels.length - 1,
  };
  show(0, false);
}

function startStep(form, field) {
  const panel = createElement('section', 'form-step');
  panel.dataset.label = field.label || '';
  if (field.label) {
    const title = createElement('h2', 'form-step-title');
    title.textContent = field.label;
    title.tabIndex = -1;
    panel.append(title);
  }
  if (field.help) {
    const help = createElement('p', 'form-step-help');
    help.textContent = field.help;
    panel.append(help);
  }
  if (field.type === 'review') panel.append(createElement('dl', 'form-review'));
  form.append(panel);
  return panel;
}

function stepButtons(panel, index, count, messages, submitButtons) {
  const buttons = createElement('div', 'button-wrapper');
  if (index > 0) {
    const back = createElement('button', 'button secondary');
    back.type = 'button';
    back.dataset.step = 'back';
    back.textContent = messages.back;
    buttons.append(back);
  }
  if (index < count - 1) {
    const next = createElement('button', 'button primary');
    next.type = 'button';
    next.dataset.step = 'next';
    next.textContent = messages.continue;
    buttons.append(next);
  } else {
    buttons.append(...submitButtons);
  }
  panel.append(buttons);
}

function readMessages(fields) {
  const messages = { ...DEFAULT_MESSAGES };
  fields.filter((f) => f.type === 'message' && f.field in messages)
    .forEach((f) => { messages[f.field] = f.label || f.default || ''; });
  return messages;
}

/**
 * Creates a complete form from field configurations
 * @param {Array<Object>} fields - Array of field configurations
 * @param {string} [submit] - Submit URL
 * @param {boolean} [multiStep] - Split the form at its `step` rows
 * @returns {HTMLFormElement} Complete form element; `form.ready` resolves when every option list
 * from a sheet has loaded
 */
function buildForm(fields, submit, multiStep = false) {
  const form = createElement('form');
  form.noValidate = true;
  const messages = readMessages(fields);
  const stepped = multiStep && fields.some((f) => f.type === 'step' || f.type === 'review');

  const buttons = [];
  const panels = [];
  const pending = [];
  let target = form;
  fields.forEach((field) => {
    if (['confirmation', 'message'].includes(field.type)) return;
    if (field.type === 'step' || field.type === 'review') {
      if (stepped) {
        target = startStep(form, field);
        panels.push(target);
      }
      return;
    }
    const el = buildField(field);
    if (!el) return;
    if (el.ready) pending.push(el.ready);
    if (field.type === 'submit' || field.type === 'reset') {
      buttons.push(el);
      return;
    }
    if (field.type === 'hidden') {
      form.append(el);
      return;
    }
    // fields above the first step start an untitled one
    if (stepped && target === form) {
      target = startStep(form, {});
      panels.push(target);
    }
    target.append(el);
  });

  if (stepped) {
    panels.forEach((panel, i) => stepButtons(panel, i, panels.length, messages, buttons));
  } else if (buttons.length) {
    const wrapper = createElement('div', 'button-wrapper');
    wrapper.append(...buttons);
    form.append(wrapper);
  }

  const status = createElement('p', 'form-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.append(status);

  enableSubmission(form, submit, fields, messages);
  if (stepped) enableSteps(form, panels, messages);
  // options from a sheet arrive later: the form waits for them, then sets up what depends on
  // every input
  toggleForm(form);
  form.ready = Promise.all(pending).then(() => {
    describeFields(form);
    makeIdsUnique(form);
    enableConditionals(form);
    toggleForm(form, false);
  });
  return form;
}

/**
 * Fills fields from the page's query (`?location=new-york&experience=workshop`), or from the
 * `data-query` of the element embedding the block (aem-embed). Options match by value or label.
 * Checkboxes are never filled: agreeing (e.g. to terms) has to be the visitor's own click.
 */
function prefill(form, block) {
  const params = new URLSearchParams(window.location.search);
  const query = block.getRootNode().host?.dataset.query;
  new URLSearchParams(query || '').forEach((value, key) => params.set(key, value));
  params.forEach((raw, key) => {
    const wanted = toClassName(raw);
    if (!wanted) return;
    const matches = (v) => v === raw || toClassName(v) === wanted;
    const controls = [...form.elements]
      .filter((el) => el.name === key && !['hidden', 'checkbox'].includes(el.type));
    controls.forEach((el) => {
      if (el.type === 'radio') {
        const label = el.closest('label');
        const name = (label?.querySelector('.option-label') || label)?.textContent.trim();
        if (!matches(el.value) && !matches(name || '')) return;
        el.checked = true;
      } else if (el.tagName === 'SELECT') {
        const option = [...el.options].find((o) => o.value && (matches(o.value) || matches(o.textContent)));
        if (!option) return;
        el.value = option.value;
      } else {
        el.value = raw;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

/** The fields of a sheet, also when it is one tab of a workbook (the first tab). */
function sheetRows(json) {
  if (Array.isArray(json?.data)) return json.data;
  const first = json?.[':names']?.[0];
  return first ? json[first]?.data : null;
}

/**
 * Form block. First link = field definitions (sheet JSON), optional second link = submit URL.
 * Variant `multi-step` splits the form at its `step` rows. Text that belongs next to the
 * form goes after the block, arranged with section metadata (Layout, Arrange).
 * @param {HTMLElement} block - Form block element
 */
export default async function decorate(block) {
  const [source, submit] = [...block.querySelectorAll('a[href]')].map((a) => a.href);
  try {
    if (!source) throw new Error('missing form definition link');
    const resp = await fetch(sheetUrl(source, true));
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    const data = sheetRows(await resp.json());
    if (!Array.isArray(data)) throw new Error('no form fields');
    const form = buildForm(data, submit, block.classList.contains('multi-step'));
    block.replaceChildren(form);
    await form.ready;
    prefill(form, block);
  } catch (error) {
    console.error('form: could not build form from', source, error);
    block.parentElement.remove();
  }
}
