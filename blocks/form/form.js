import {
  toCamelCase, toClassName, buildBlock, decorateBlock, loadBlock,
} from '../../scripts/aem.js';
import { trackEvent } from '../../scripts/shared.js';

const DEFAULT_MESSAGES = {
  sending: 'Sending...',
  success: 'Thanks! Your message has been sent.',
  error: 'Unable to submit right now. Please try again.',
  invalid: '',
};

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

function buildOptions(field) {
  const {
    type, options, label, required,
  } = field;
  if (!options) return null;

  const fieldset = createElement('fieldset', `form-field ${type}-field`);
  fieldset.append(buildLabel(label, 'legend', null, isRequired(required)));
  splitOptions(options).forEach((option) => {
    const input = buildOptionInput(field, option);
    const labelEl = buildLabel(option, 'label', input.id);
    labelEl.prepend(input, createElement('span'));
    fieldset.append(labelEl);
  });
  return fieldset;
}

async function buildOptionsFromUrl(url) {
  const resp = await fetch(url);
  const { data } = await resp.json();
  return data.map(({ option, value }) => {
    const optionEl = createElement('option');
    optionEl.value = value || option;
    optionEl.textContent = option || value;
    return optionEl;
  });
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

  if (/^https?:\/\//.test(options)) {
    buildOptionsFromUrl(options).then((os) => select.append(...os));
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
    el.querySelectorAll('input, select, textarea').forEach((input) => input.setAttribute('aria-describedby', helpText.id));
  }
  if (conditional) {
    [el.dataset.controller] = conditional.split('-');
    el.dataset.condition = conditional;
  }
  return el;
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

/**
 * Normalizes confirmation path to a same-origin path for fragment loading.
 * @param {string} raw - Raw path or URL from form config
 * @returns {string|null} Normalized path (e.g. /thank-you) or null if invalid
 */
function normalizeConfirmationPath(raw) {
  try {
    const url = new URL(String(raw || '').trim(), window.location.origin);
    // links to this site's aem.page / aem.live hosts work on every host, including localhost
    const sameSite = url.origin === window.location.origin || /\.aem\.(page|live)$/.test(url.hostname);
    return sameSite ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Replaces the form block with the content of the confirmation fragment.
 * The form stays visible if the fragment fails to load.
 * @param {HTMLFormElement} form - Form element
 * @param {string} confirmationPath - Path to thank you page (e.g. /thank-you)
 * @returns {Promise<boolean>} True if replacement succeeded
 */
async function replaceWithThankYou(form, confirmationPath) {
  const path = normalizeConfirmationPath(confirmationPath);
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
    block.replaceChildren(...fragmentBlock.childNodes);
    return true;
  } catch (error) {
    console.error('form: could not load confirmation fragment', path, error);
    return false;
  } finally {
    holder.remove();
  }
}

async function handleSubmit(form, messages) {
  const status = form.querySelector('.form-status');
  const setStatus = (msg, state = '') => {
    status.textContent = msg;
    status.dataset.state = state;
  };
  const succeed = () => {
    setStatus(messages.success, 'success');
    form.reset();
  };
  const sent = () => trackEvent('generate_lead', { lead_source: 'form' });

  if (!form.dataset.action) {
    succeed();
    sent();
    return;
  }

  try {
    const body = JSON.stringify({ data: generatePayload(form) });
    toggleForm(form);
    setStatus(messages.sending);
    const response = await fetch(form.dataset.action, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    const replaced = form.dataset.confirmation
      && await replaceWithThankYou(form, form.dataset.confirmation);
    if (!replaced) succeed();
    sent();
  } catch (error) {
    setStatus(messages.error, 'error');
    console.error('form: submission failed', error);
  } finally {
    toggleForm(form, false);
  }
}

function enableSubmission(form, submit, fields) {
  if (submit) form.dataset.action = submit;
  const messages = { ...DEFAULT_MESSAGES };
  fields.filter((f) => f.type === 'message' && f.field in messages)
    .forEach((f) => { messages[f.field] = f.label || f.default || ''; });
  const confirmation = fields.find((f) => f.type === 'confirmation');
  if (confirmation) form.dataset.confirmation = confirmation.label || confirmation.default;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.reportValidity()) {
      handleSubmit(form, messages);
      return;
    }
    const invalid = [...form.querySelectorAll(':invalid:not(fieldset)')];
    invalid.forEach((el) => el.setAttribute('aria-invalid', 'true'));
    const status = form.querySelector('.form-status');
    if (messages.invalid) {
      status.textContent = messages.invalid;
      status.dataset.state = 'error';
    }
    invalid[0]?.focus();
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

/**
 * Creates a complete form from field configurations
 * @param {Array<Object>} fields - Array of field configurations
 * @param {string} [submit] - Submit URL
 * @returns {HTMLFormElement} Complete form element
 */
function buildForm(fields, submit) {
  const form = createElement('form');
  form.noValidate = true;

  const buttons = createElement('div', 'button-wrapper');
  fields.forEach((field) => {
    if (field.type === 'confirmation' || field.type === 'message') return;
    const el = buildField(field);
    if (!el) return;
    if (field.type === 'submit' || field.type === 'reset') buttons.append(el);
    else form.append(el);
  });
  if (buttons.children.length) form.append(buttons);

  const status = createElement('p', 'form-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.append(status);

  makeIdsUnique(form);
  enableConditionals(form);
  enableSubmission(form, submit, fields);
  return form;
}

/**
 * Form block. First link = field definitions (sheet JSON), optional second link = submit URL.
 * @param {HTMLElement} block - Form block element
 */
export default async function decorate(block) {
  const [source, submit] = [...block.querySelectorAll('a[href]')].map((a) => a.href);
  try {
    if (!source) throw new Error('missing form definition link');
    const resp = await fetch(new URL(source).pathname);
    if (!resp.ok) throw new Error(`${resp.status}: ${resp.statusText}`);
    const { data } = await resp.json();
    if (!Array.isArray(data)) throw new Error('no form fields');
    block.replaceChildren(buildForm(data, submit));
  } catch (error) {
    console.error('form: could not build form from', source, error);
    block.parentElement.remove();
  }
}
