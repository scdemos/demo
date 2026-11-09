import { toClassName } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

const format = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const stripNote = (text) => text.replace(/\s*\([^)]*\)\s*$/, '').trim();
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function readRows(block) {
  const cells = {};
  const asides = [];
  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    if (!keyCell || !valueCell) return;
    const key = toClassName(keyCell.textContent);
    if (key === 'aside') asides.push(valueCell);
    else cells[key] = valueCell;
  });
  return { cells, asides };
}

const text = (cell) => cell?.textContent.trim() || '';
const plainParas = (cell) => (cell ? [...cell.querySelectorAll('p')].filter((p) => !p.querySelector('a')).map((p) => p.textContent.trim()) : []);
const heading = (cell) => cell?.querySelector('h1, h2, h3, h4, h5, h6')?.textContent.trim() || '';
const labelOf = (cell) => plainParas(cell)[0] || (cell?.querySelector('p, ul, ol, h1, h2, h3, h4') ? '' : text(cell));
const escape = (str) => String(str).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function errorEl(id) {
  return createTag('p', { class: 'booking-error', id: `${id}-error` });
}

function describe(el, ...ids) {
  const set = new Set((el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  ids.forEach((id) => set.add(id));
  el.setAttribute('aria-describedby', [...set].join(' '));
}

function buildField(id, labelText, control, hintText) {
  const field = createTag('div', { class: 'booking-field' });
  control.id = id;
  field.append(createTag('label', { for: id }, labelText));
  if (hintText) {
    field.append(createTag('p', { class: 'booking-hint', id: `${id}-hint` }, hintText));
    describe(control, `${id}-hint`);
  }
  field.append(control, errorEl(id));
  return field;
}

function buildSelect(name, placeholder, options, required) {
  const select = createTag('select', { name });
  if (required) select.required = true;
  select.append(createTag('option', { value: '' }, placeholder || ''));
  options.forEach(({ value, label }) => select.append(createTag('option', { value }, label)));
  return select;
}

function listOptions(cell) {
  return [...(cell?.querySelectorAll('li') || [])].map((li) => {
    const label = li.textContent.trim();
    return { value: toClassName(label), label };
  });
}

async function locationOptions(cell) {
  const link = cell?.querySelector('a[href$=".json"]');
  if (!link) return listOptions(cell);
  try {
    // resolve against this site, not the page hosting the block (aem-embed)
    const resp = await fetch(new URL(new URL(link.href).pathname, import.meta.url));
    if (!resp.ok) throw new Error(resp.status);
    const { data = [] } = await resp.json();
    return data.filter((l) => l.id).map((l) => ({
      value: l.id,
      label: [l.neighbourhood, l.city].filter(Boolean).join(', ') || l.name,
    }));
  } catch (e) {
    console.error('booking: could not load locations', e);
    return [];
  }
}

function buildExperience(cell, label) {
  const fieldset = createTag('fieldset', { class: 'booking-fieldset' });
  const legend = createTag('legend', { class: 'booking-legend' });
  legend.append(createTag('h2', { class: 'booking-step-title' }, heading(cell) || label));
  const group = createTag('div', { class: 'booking-choices' });
  [...(cell?.querySelectorAll('li') || [])].forEach((li, i) => {
    const strong = li.querySelector('strong');
    const title = (strong || li).textContent.trim();
    const desc = strong ? li.textContent.replace(strong.textContent, '').trim() : '';
    const id = `booking-experience-${i}`;
    const input = createTag('input', {
      type: 'radio', name: 'experience', id, value: toClassName(title), required: '',
    });
    input.dataset.label = title;
    const body = createTag('span', { class: 'booking-choice-body' }, createTag('strong', {}, title));
    if (desc) body.append(createTag('span', {}, desc));
    group.append(createTag('label', { class: 'booking-choice', for: id }, [input, body]));
  });
  fieldset.append(legend, group, errorEl('booking-experience'));
  fieldset.querySelectorAll('input').forEach((r) => describe(r, 'booking-experience-error'));
  return fieldset;
}

function buildButtons(cells, { back = true, next = true } = {}) {
  const row = createTag('div', { class: 'booking-actions' });
  if (back) row.append(createTag('button', { type: 'button', class: 'button secondary', 'data-step': 'prev' }, text(cells.back)));
  if (next) row.append(createTag('button', { type: 'button', class: 'button primary', 'data-step': 'next' }, text(cells.continue)));
  else row.append(createTag('button', { type: 'submit', class: 'button primary' }, text(cells.submit)));
  return row;
}

function panel(title, ...children) {
  const section = createTag('section', { class: 'booking-panel' });
  if (title) section.append(createTag('h2', { class: 'booking-step-title' }, title));
  section.append(...children);
  return section;
}

function validateField(field, cells) {
  const root = field.getRootNode(); // document, or the shadow root when embedded
  const error = root.getElementById(`${field.id}-error`)
    || (field.type === 'radio' && root.getElementById(`booking-${field.name}-error`));
  let message = '';
  const value = field.type === 'checkbox' ? field.checked : field.value.trim();
  if (field.type === 'radio') {
    const group = field.form.querySelectorAll(`[name="${field.name}"]`);
    message = [...group].some((r) => r.checked) ? '' : text(cells.required);
  } else if (field.required && !value) {
    message = field.type === 'checkbox' ? text(cells['consent-error']) || text(cells.required) : text(cells.required);
  } else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    message = text(cells['email-error']);
  } else if (value && field.type === 'tel' && value.replace(/\D/g, '').length < 10) {
    message = text(cells['phone-error']);
  } else if (value && field.type === 'date' && !field.validity.valid) {
    message = text(cells['date-error']) || text(cells.required);
  }
  if (field.type === 'radio') {
    field.form.querySelectorAll(`[name="${field.name}"]`).forEach((r) => r.setAttribute('aria-invalid', String(Boolean(message))));
  } else {
    field.setAttribute('aria-invalid', String(Boolean(message)));
  }
  if (error) {
    error.textContent = message;
    if (field.type !== 'radio') describe(field, error.id);
  }
  return !message;
}

function validateScope(scope, cells) {
  const seen = new Set();
  const fields = [...scope.querySelectorAll('input, select, textarea')].filter((f) => {
    if (f.type !== 'radio') return true;
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
  const invalid = fields.filter((f) => !validateField(f, cells));
  if (invalid.length) {
    const first = invalid[0];
    const target = first.type === 'radio' ? first.form.querySelector(`[name="${first.name}"]:checked`) || first : first;
    target.focus();
  }
  return invalid.length === 0;
}

function prefill(form, block) {
  const params = new URLSearchParams(window.location.search);
  // when embedded (aem-embed), the host element passes prefill values in data-query
  const query = block.getRootNode().host?.dataset.query;
  new URLSearchParams(query || '').forEach((value, key) => params.set(key, value));
  params.forEach((raw, key) => {
    const value = toClassName(raw);
    const match = (v) => v === raw || toClassName(v) === value || toClassName(v).split('-').includes(value);
    const fields = [...form.querySelectorAll(`[name="${key}"]`)];
    fields.forEach((f) => {
      if (f.type === 'radio') {
        if (match(f.value)) f.checked = true;
      } else if (f.tagName === 'SELECT') {
        const option = [...f.options].find((o) => o.value && (match(o.value) || match(o.text)));
        if (option) f.value = option.value;
      } else if (f.type !== 'checkbox') {
        f.value = raw;
      }
    });
  });
}

function summaryValue(form, name) {
  const field = form.elements[name];
  if (!field) return '';
  if (field instanceof RadioNodeList) {
    const checked = [...field].find((r) => r.checked);
    return checked ? checked.dataset.label || checked.value : '';
  }
  if (field.tagName === 'SELECT') return field.value ? field.options[field.selectedIndex].text : '';
  if (field.type === 'date' && field.value) {
    const date = new Date(`${field.value}T00:00`);
    return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'full' }).format(date);
  }
  return field.value.trim();
}

/** @param {Element} block */
export default async function decorate(block) {
  const { cells, asides } = readRows(block);
  const stepLabels = cells.steps?.querySelector('li')
    ? [...cells.steps.querySelectorAll('li')].map((li) => li.textContent.trim())
    : text(cells.steps).split(',').map((s) => s.trim()).filter(Boolean);
  const locations = await locationOptions(cells.location);

  const form = createTag('form', { class: 'booking-form', novalidate: '' });
  const formTitle = text(cells.title) || stepLabels.join(' · ');
  form.setAttribute('aria-label', formTitle);

  // stepper
  const stepper = createTag('ol', { class: 'booking-stepper', 'aria-label': text(cells.progress) || null });
  stepLabels.forEach((label) => stepper.append(createTag('li', {}, label)));

  // step 1: experience
  const step1 = panel('', buildExperience(cells.experience || cells.service, stepLabels[0]), buildButtons(cells, { back: false }));

  // step 2: location, date, time
  const locParas = plainParas(cells.location);
  const locSelect = buildSelect('location', locParas[1], locations, true);
  const today = new Date();
  const max = new Date(today);
  max.setDate(max.getDate() + Number(text(cells['booking-window']) || 180));
  const dateInput = createTag('input', {
    type: 'date', name: 'date', required: '', min: isoDay(today), max: isoDay(max),
  });
  const timeParas = plainParas(cells.time);
  const timeSelect = buildSelect('time', timeParas[1], [...(cells.time?.querySelectorAll('li') || [])]
    .map((li) => ({ value: li.textContent.trim(), label: li.textContent.trim() })), true);
  const when = createTag('div', { class: 'booking-row' }, [
    buildField('booking-date', labelOf(cells.date), dateInput, plainParas(cells.date)[1]),
    buildField('booking-time', timeParas[0] || '', timeSelect),
  ]);
  const step2 = panel(
    heading(cells.location) || stepLabels[1],
    buildField('booking-location', locParas[0] || '', locSelect),
    when,
    buildButtons(cells),
  );

  // step 3: details
  const detail = (key, type, attrs = {}) => {
    const paras = plainParas(cells[key]);
    const control = type === 'textarea'
      ? createTag('textarea', { name: key, rows: '4', ...attrs })
      : createTag('input', { type, name: key, ...attrs });
    return buildField(`booking-${key}`, paras[0] || labelOf(cells[key]), control, paras[1]);
  };
  const step3 = panel(
    heading(cells.details) || text(cells.details) || stepLabels[2],
    createTag('div', { class: 'booking-row' }, [
      detail('name', 'text', { autocomplete: 'name', required: '' }),
      detail('email', 'email', { autocomplete: 'email', required: '' }),
    ]),
    detail('phone', 'tel', { autocomplete: 'tel' }),
    detail('notes', 'textarea'),
    buildButtons(cells),
  );

  // step 4: review + consent
  const summaryFields = [
    ['experience', stepLabels[0]],
    ['location', locParas[0]],
    ['date', labelOf(cells.date)],
    ['time', timeParas[0]],
    ['name', labelOf(cells.name)],
    ['email', labelOf(cells.email)],
    ['phone', labelOf(cells.phone)],
  ];
  const summary = createTag('dl', { class: 'booking-summary' });
  summaryFields.forEach(([name, label]) => {
    const dd = createTag('dd');
    dd.dataset.summary = name;
    summary.append(createTag('div', {}, [createTag('dt', {}, stripNote(label || name)), dd]));
  });
  const consentInput = createTag('input', {
    type: 'checkbox', name: 'consent', id: 'booking-consent', required: '',
  });
  const consentText = createTag('span');
  if (cells.consent) {
    const p = cells.consent.querySelector('p');
    consentText.append(...(p || cells.consent).childNodes);
  }
  const consent = createTag('div', { class: 'booking-field' }, [
    createTag('label', { class: 'booking-checkbox', for: 'booking-consent' }, [consentInput, consentText]),
    errorEl('booking-consent'),
  ]);
  const step4 = panel(
    heading(cells.review) || text(cells.review) || stepLabels[3],
    summary,
    consent,
    buildButtons(cells, { next: false }),
  );

  // confirmation
  const done = createTag('section', {
    class: 'booking-panel booking-done', hidden: '', tabindex: '-1',
  });
  const successTemplate = cells.success ? cells.success.innerHTML : '';

  const status = createTag('p', { class: 'booking-status', role: 'status', 'aria-live': 'polite' });
  const panels = [step1, step2, step3, step4];
  form.append(stepper, ...panels, done, status);

  // behaviour
  let current = 0;
  const show = (index, focus = true) => {
    current = index;
    panels.forEach((p, i) => { p.hidden = i !== index; });
    [...stepper.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < index);
      if (i === index) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    form.querySelectorAll('[data-summary]').forEach((dd) => {
      dd.textContent = summaryValue(form, dd.dataset.summary) || '—';
    });
    status.textContent = '';
    if (focus) {
      const title = panels[index].querySelector('.booking-step-title');
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
    }
  };

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    if (btn.dataset.step === 'next' && validateScope(panels[current], cells)) show(current + 1);
    if (btn.dataset.step === 'prev') show(current - 1);
  });
  const revalidate = (e) => {
    if (e.target.matches?.('[aria-invalid="true"]')) validateField(e.target, cells);
  };
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateScope(form, cells)) {
      status.dataset.state = 'error';
      status.textContent = text(cells.errors);
      return;
    }
    const ref = `FRE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const vars = { ref };
    summaryFields.forEach(([name]) => { vars[name] = escape(summaryValue(form, name)); });
    done.innerHTML = format(successTemplate, vars);
    stepper.hidden = true;
    panels.forEach((p) => { p.hidden = true; });
    done.hidden = false;
    status.textContent = '';
    done.focus();
  });

  prefill(form, block);
  show(0, false);

  const layout = createTag('div', { class: 'booking-layout' }, form);
  if (asides.length) {
    const aside = createTag('div', { class: 'booking-aside' });
    asides.forEach((cell) => {
      const card = createTag('div', { class: 'booking-aside-panel' });
      card.append(...cell.childNodes);
      aside.append(card);
    });
    layout.append(aside);
  }
  block.replaceChildren(layout);
}
