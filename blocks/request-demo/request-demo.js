import { createTag } from '../../scripts/shared.js';

/*
 * Request demo — a two-column band. Left: value proposition (heading, checkmark
 * bullets, stat callouts, "trusted by" line + optional client logos). Right: a
 * "Request a demo" form.
 * Authored as two rows:
 *   Row 1 (left column):
 *     - heading
 *     - bulleted list of value points
 *     - a sub-list (or paragraphs) of "NUMBER label" stats — each "<strong>75%</strong> faster…"
 *     - a trailing paragraph = the "trusted by" line
 *     - optional images = client logos
 *   Row 2 (right column):
 *     - heading (form title)
 *     - paragraph (form subtext)
 *     - a trailing paragraph = the privacy / legal note (kept as-is)
 * The form fields themselves are generated here so authors don't hand-build inputs.
 */

const FIELDS = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  { name: 'lastName', label: 'Last name', type: 'text', required: true },
  { name: 'company', label: 'Company', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  {
    name: 'country',
    label: 'Country',
    type: 'select',
    required: true,
    placeholder: 'Select a country',
    options: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'India', 'Other'],
  },
  { name: 'jobTitle', label: 'Job Title', type: 'text', required: true },
  {
    name: 'platform',
    label: "Platform(s) you'd like to demo",
    type: 'select',
    placeholder: 'Select a platform(s)',
    options: ['Bodhi', 'Slingshot', 'Sustain'],
  },
];

function buildField({
  name, label, type, required, placeholder, options,
}) {
  const wrap = createTag('div', { class: 'request-demo-field' });
  const id = `rd-${name}`;
  const labelText = `${label}${required ? '*' : ''}`;
  wrap.append(createTag('label', { for: id }, labelText));

  if (type === 'select') {
    const select = createTag('select', { id, name });
    if (required) select.required = true;
    select.append(createTag('option', { value: '', selected: true, disabled: true }, placeholder || `Select ${label}`));
    (options || []).forEach((opt) => select.append(createTag('option', { value: opt }, opt)));
    wrap.append(select);
  } else {
    const input = createTag('input', { id, name, type: type || 'text' });
    if (required) input.required = true;
    wrap.append(input);
  }
  return wrap;
}

export default function decorate(block) {
  const [leftRow, rightRow] = block.children;

  // ----- Left column: value proposition -----
  if (leftRow) {
    leftRow.classList.add('request-demo-info');
    const cell = leftRow.firstElementChild;
    if (cell) {
      while (cell.firstChild) leftRow.append(cell.firstChild);
      cell.remove();
    }

    // Turn a stats list ("<strong>75%</strong> faster modernization") into stat blocks.
    const lists = [...leftRow.querySelectorAll('ul, ol')];
    const statList = lists.find((l) => l.querySelector('strong'));
    if (statList) {
      const stats = createTag('div', { class: 'request-demo-stats' });
      [...statList.children].forEach((li) => {
        const strong = li.querySelector('strong');
        const stat = createTag('div', { class: 'request-demo-stat' });
        if (strong) {
          stat.append(createTag('span', { class: 'request-demo-stat-num' }, strong.textContent.trim()));
          strong.remove();
        }
        const label = li.textContent.trim();
        if (label) stat.append(createTag('p', { class: 'request-demo-stat-label' }, label));
        stats.append(stat);
      });
      statList.replaceWith(stats);
    }

    // Remaining bullet list = value points.
    leftRow.querySelector('ul, ol')?.classList.add('request-demo-points');

    // Any images = client logos.
    const logos = [...leftRow.querySelectorAll('picture, img')];
    if (logos.length) {
      const strip = createTag('div', { class: 'request-demo-logos' });
      logos.forEach((el) => strip.append(el.closest('picture') || el));
      leftRow.append(strip);
    }
  }

  // ----- Right column: form -----
  if (rightRow) {
    rightRow.classList.add('request-demo-form-col');
    const cell = rightRow.firstElementChild;
    if (cell) {
      while (cell.firstChild) rightRow.append(cell.firstChild);
      cell.remove();
    }

    // The last paragraph is the privacy/legal note — keep it aside.
    const paras = [...rightRow.querySelectorAll('p')];
    const privacy = paras[paras.length - 1];
    privacy?.classList.add('request-demo-privacy');

    const form = createTag('form', { class: 'request-demo-form', novalidate: '' });
    form.append(createTag('p', { class: 'request-demo-required' }, '*Required field'));

    const grid = createTag('div', { class: 'request-demo-fields' });
    FIELDS.forEach((f) => grid.append(buildField(f)));
    form.append(grid);

    const message = createTag('div', { class: 'request-demo-field request-demo-message' });
    message.append(createTag('label', { for: 'rd-message' }, 'Message'));
    message.append(createTag('textarea', {
      id: 'rd-message',
      name: 'message',
      rows: '3',
      placeholder: 'Anything else we should know to make this demo valuable for you?',
    }));
    form.append(message);

    const footer = createTag('div', { class: 'request-demo-footer' });
    const consentId = 'rd-consent';
    const consent = createTag('label', { class: 'request-demo-consent', for: consentId });
    consent.append(createTag('input', { type: 'checkbox', id: consentId, name: 'consent' }));
    consent.append(createTag('span', {}, 'Sign me up to receive future marketing communications regarding our products, services and events.'));
    footer.append(consent);

    const submit = createTag('button', { type: 'submit', class: 'request-demo-submit' });
    submit.append(createTag('span', {}, 'Submit'));
    footer.append(submit);
    form.append(footer);

    // Insert the form after the heading/subtext, before the privacy note.
    if (privacy) rightRow.insertBefore(form, privacy);
    else rightRow.append(form);
  }
}
