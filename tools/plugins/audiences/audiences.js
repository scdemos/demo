import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { parseAudienceDefinitions } from '../../../scripts/shared/audience-definitions.js';

const root = document.querySelector('.audience-picker');
const status = root.querySelector('.status');

/** Structural authoring keys are fixed; the inserted value is plain text, never HTML. */
function sectionMetadata(name) {
  const table = document.createElement('table');
  const header = table.insertRow().insertCell();
  header.colSpan = 2;
  header.textContent = 'Section Metadata';
  const row = table.insertRow();
  row.insertCell().textContent = 'Audience';
  row.insertCell().textContent = name;
  return table.outerHTML;
}

async function init() {
  let labels;
  try {
    const response = await fetch(new URL('./labels.json', import.meta.url));
    if (!response.ok) throw new Error(`Labels returned ${response.status}`);
    labels = await response.json();
    document.title = labels.title;
    root.querySelector('h1').textContent = labels.title;
    root.querySelector('.instructions').textContent = labels.instructions;
    status.textContent = labels.loading;
    const [{ actions }, sheet] = await Promise.all([
      DA_SDK,
      fetch('/audiences.json').then(async (result) => {
        if (!result.ok) throw new Error(`Audience sheet returned ${result.status}`);
        return result.json();
      }),
    ]);
    const rows = parseAudienceDefinitions(sheet);
    status.textContent = rows.length ? '' : labels.empty;
    rows.forEach(({ name, label, description }, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (description) {
        const detail = document.createElement('p');
        detail.id = `audience-description-${index}`;
        detail.textContent = description;
        button.setAttribute('aria-describedby', detail.id);
        item.append(detail);
      }
      item.prepend(button);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await actions.sendHTML(sectionMetadata(name));
          actions.closeLibrary();
        } catch {
          status.textContent = labels.insertError;
          button.disabled = false;
        }
      });
      root.querySelector('.choices').append(item);
    });
  } catch (error) {
    console.warn('Audience picker unavailable:', error);
    if (labels) status.textContent = labels.error;
  }
}

init();
