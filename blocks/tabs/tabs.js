import { toClassName, loadCSS } from '../../scripts/aem.js';

let tabsStyleLoaded;

function getTabDefinition(section, fallbackIdx = 0) {
  const tabId = String(section.dataset?.tabId || '').trim();
  if (!tabId) return null;

  const title = String(section.dataset?.tabTitle || tabId).trim() || `Tab ${fallbackIdx + 1}`;
  return {
    id: toClassName(tabId) || `tab-${fallbackIdx + 1}`,
    title,
    section,
  };
}

function collectTabSections(currSection) {
  const tabDefs = [];
  let next = currSection.nextElementSibling;

  while (next?.classList.contains('section')) {
    const tabDef = getTabDefinition(next, tabDefs.length);
    if (!tabDef) break;
    tabDefs.push(tabDef);
    next = next.nextElementSibling;
  }

  return tabDefs;
}

function findTabGroups(main) {
  const sections = [...main.querySelectorAll('.section[data-tab-id]')]
    .filter((s) => !s.closest('.tabs-wrapper'));
  return sections.length ? [sections] : [];
}

function updateTabState(tabDefs, selectedId, tabButtons, tabPanels) {
  tabDefs.forEach((tabDef) => {
    const isSelected = tabDef.id === selectedId;
    const button = tabButtons[tabDef.id];
    const panel = tabPanels[tabDef.id];

    if (button) {
      button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      button.classList.toggle('is-active', isSelected);
    }

    if (panel) {
      panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
    }
  });
}

function scrollActiveTab(button, tabList) {
  // Center the active tab, showing equal peeks of adjacent tabs
  const listRect = tabList.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();
  const btnStart = btnRect.left - listRect.left + tabList.scrollLeft;
  const offset = btnStart - (tabList.clientWidth - button.offsetWidth) / 2;
  tabList.scrollLeft = Math.max(0, offset);
}

/*
 * Per-tab "app UI" cards. These are decorative illustrative mockups of the
 * Oura app (the source shows a different scene per tab), NOT migrated user
 * data — the authored document holds only each tab's hero + testimonial, so
 * the card set is defined here and keyed by tab-id. Each tab gets its OWN
 * cards, notification, and scene tint.
 */
const TAB_CARDS = {
  'starting-your-day': {
    tint: 'gold',
    cards: [
      {
        type: 'sleep',
        label: 'Time asleep',
        value: '8h 0m',
        sub: 'Total duration 8h 30m',
        axis: ['10:20pm', '6:06am'],
      },
      {
        type: 'readiness',
        score: 88,
        label: 'Readiness',
        headline: "Go get 'em",
        body: "A great night's sleep has your body well recovered and ready to take on the day.",
      },
    ],
  },
  'taking-a-walk': {
    tint: 'sage',
    notification: { text: 'Time to stretch your legs a bit?', time: 'now' },
    cards: [
      {
        type: 'hr',
        ago: '7 MIN AGO',
        label: 'Heart rate',
        value: '79 bpm',
        axisX: ['00', '18'],
        axisY: ['140', '38'],
        button: 'Measure heart rate',
      },
      {
        type: 'activity',
        label: 'Activity goal',
        status: 'GETTING STARTED',
        value: '900 steps',
        body: 'Keep moving through the day to reach your daily activity goal.',
        sliderLabel: 'Steps progress',
        sliderMax: '10,000',
        sliderPct: 9,
      },
    ],
  },
  'under-the-weather': {
    tint: 'brown',
    cards: [
      {
        type: 'text',
        label: 'Symptom Radar',
        headline: 'Minor signs',
        body: 'Your body is showing minor strain. Consider taking it easy and prioritizing rest today.',
        button: 'Learn more',
      },
      {
        type: 'readiness',
        score: 56,
        label: 'Readiness',
        headline: "You'll be alright",
        body: 'Recovery is a little lower today. Go gently and give your body the time it needs.',
      },
    ],
  },
  'winding-down': {
    tint: 'night',
    notification: { text: 'Your bedtime is approaching', time: 'now' },
    cards: [
      {
        type: 'bedtime',
        label: "Bedtime's approaching",
        range: '10:00 – 11:00',
        body: 'Start winding down now to get the restorative sleep your body needs tonight.',
      },
    ],
  },
  'hosting-a-party': {
    tint: 'rose',
    cards: [
      {
        type: 'stress',
        ago: '5M AGO',
        label: 'Daytime Stress',
        value: 'Engaged',
        body: 'Balanced stress levels can keep you focused and productive through the day.',
        axisX: ['12am', '6pm'],
      },
      {
        type: 'hr',
        label: 'Heart rate',
        value: '79 bpm',
        axisX: ['00', '18'],
        axisY: ['140', '38'],
        button: 'Measure heart rate',
      },
    ],
  },
};

// Fixed (deterministic) hypnogram bar heights — an illustrative sleep chart.
const HYPNOGRAM = [40, 55, 70, 85, 60, 45, 62, 78, 90, 72, 55, 42, 58, 74,
  86, 68, 50, 64, 80, 70, 52, 44, 60, 76, 66, 48, 58, 72];
// Illustrative heart-rate polyline (viewBox 0 0 100 44).
const HR_LINE = '2,30 10,26 18,32 26,20 34,24 42,14 50,22 58,12 66,26 74,18 82,28 90,16 98,22';
// Illustrative daytime-stress area line (viewBox 0 0 100 44).
const STRESS_LINE = '2,34 14,30 26,32 38,22 50,26 62,16 74,20 86,12 98,18';

const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.5-9.5-9A5 5 0 0 1 12 5a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" fill="currentColor"/></svg>';
const ouraMark = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
const moonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor"/></svg>';

function arcGaugeMarkup(score, extra = '') {
  return `
    <div class="tab-statcard-gauge">
      <svg viewBox="0 0 100 60" aria-hidden="true">
        <path d="M8 56 A42 42 0 0 1 92 56" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.25"/>
        <path d="M8 56 A42 42 0 0 1 86 30" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      </svg>
      <span class="tab-statcard-score">${score}</span>
      ${extra}
    </div>`;
}

function renderCard(card) {
  const el = document.createElement('div');
  el.className = `tab-statcard tab-statcard-${card.type}`;

  if (card.type === 'sleep') {
    const bars = HYPNOGRAM.map((h) => `<span style="height:${h}%"></span>`).join('');
    el.innerHTML = `
      <p class="tab-statcard-label">${card.label}</p>
      <p class="tab-statcard-value">${card.value}</p>
      <p class="tab-statcard-sub">${card.sub}</p>
      <div class="tab-statcard-chart">${bars}</div>
      <div class="tab-statcard-axis"><span>${card.axis[0]}</span><span>${card.axis[1]}</span></div>`;
  } else if (card.type === 'readiness') {
    el.innerHTML = `
      ${arcGaugeMarkup(card.score)}
      <p class="tab-statcard-label">${card.label}</p>
      <p class="tab-statcard-headline">${card.headline}</p>
      <p class="tab-statcard-body">${card.body}</p>`;
  } else if (card.type === 'hr') {
    el.innerHTML = `
      <div class="tab-statcard-head">
        <p class="tab-statcard-label">${card.label}</p>
        ${card.ago ? `<span class="tab-statcard-ago">${card.ago}</span>` : ''}
      </div>
      <p class="tab-statcard-value">${card.value}</p>
      <div class="tab-statcard-linechart">
        <span class="tab-statcard-yaxis"><span>${card.axisY[0]}</span><span>${card.axisY[1]}</span></span>
        <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${HR_LINE}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="tab-statcard-axis"><span>${card.axisX[0]}</span><span>${card.axisX[1]}</span></div>
      <button type="button" class="tab-statcard-btn" tabindex="-1">${heartIcon}<span>${card.button}</span></button>`;
  } else if (card.type === 'activity') {
    el.innerHTML = `
      <p class="tab-statcard-label">${card.label}</p>
      <p class="tab-statcard-status">${card.status}</p>
      <p class="tab-statcard-value">${card.value}</p>
      <p class="tab-statcard-body">${card.body}</p>
      <div class="tab-statcard-slider">
        <div class="tab-statcard-slider-track"><span style="width:${card.sliderPct}%"></span><i style="left:${card.sliderPct}%"></i></div>
        <div class="tab-statcard-axis"><span>${card.sliderLabel}</span><span>${card.sliderMax}</span></div>
      </div>`;
  } else if (card.type === 'text') {
    el.innerHTML = `
      <p class="tab-statcard-label">${card.label}</p>
      <p class="tab-statcard-headline">${card.headline}</p>
      <p class="tab-statcard-body">${card.body}</p>
      <button type="button" class="tab-statcard-btn" tabindex="-1"><span>${card.button}</span></button>`;
  } else if (card.type === 'bedtime') {
    el.innerHTML = `
      ${arcGaugeMarkup('', `<span class="tab-statcard-gauge-icon">${moonIcon}</span>`)}
      <div class="tab-statcard-gauge-marks"><span>9pm</span><span>12am</span></div>
      <p class="tab-statcard-label">${card.label}</p>
      <p class="tab-statcard-value">${card.range}</p>
      <p class="tab-statcard-body">${card.body}</p>`;
  } else if (card.type === 'stress') {
    el.innerHTML = `
      <div class="tab-statcard-head">
        <p class="tab-statcard-label">${card.label}</p>
        ${card.ago ? `<span class="tab-statcard-ago">${card.ago}</span>` : ''}
      </div>
      <p class="tab-statcard-value">${card.value}</p>
      <p class="tab-statcard-body">${card.body}</p>
      <div class="tab-statcard-linechart">
        <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${STRESS_LINE}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="tab-statcard-axis"><span>${card.axisX[0]}</span><span>${card.axisX[1]}</span></div>`;
  }

  return el;
}

/**
 * Build the center "app UI" cards for a given tab. Decorative illustration,
 * not migrated content (hence aria-hidden). Falls back to nothing when a tab
 * has no defined card set.
 * @param {string} tabId the tab identifier
 */
function buildTabCards(tabId) {
  const spec = TAB_CARDS[tabId];
  if (!spec) return null;

  const wrap = document.createElement('div');
  wrap.className = `tab-statcards tab-statcards-${spec.tint}`;
  wrap.setAttribute('aria-hidden', 'true'); // decorative illustration, not content

  if (spec.notification) {
    const pill = document.createElement('div');
    pill.className = 'tab-statcard-notification';
    pill.innerHTML = `
      <span class="tab-statcard-notification-icon">${ouraMark}</span>
      <span class="tab-statcard-notification-text">${spec.notification.text}</span>
      <span class="tab-statcard-notification-time">${spec.notification.time}</span>`;
    wrap.append(pill);
  }

  spec.cards.forEach((card) => wrap.append(renderCard(card)));
  return wrap;
}

/**
 * Lay a tab panel out as the source three-part row: left media, center app-UI
 * cards (per tab), right testimonial. Non-destructive to authored content.
 * @param {Element} section the authored tab section inside the panel
 * @param {string} tabId the tab identifier used to select the card set
 */
function layoutTabPanel(section, tabId) {
  const wrapper = section.querySelector('.default-content-wrapper') || section;
  const img = wrapper.querySelector('img');
  const paras = [...wrapper.querySelectorAll('p')];
  if (!img || !paras.length) return; // leave non-standard panels untouched

  const media = document.createElement('div');
  media.className = 'tab-panel-media';
  media.append(img.closest('picture') || img);

  const testimonial = document.createElement('div');
  testimonial.className = 'tab-panel-testimonial';
  paras.forEach((p) => testimonial.append(p));

  const layout = document.createElement('div');
  layout.className = 'tab-panel-layout';
  const cards = buildTabCards(tabId);
  layout.append(media, ...(cards ? [cards] : []), testimonial);
  wrapper.replaceChildren(layout);
}

function buildTabsUI(tabDefs, tabsContainer, sectionId = '') {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  const selectedId = tabDefs.find((tabDef) => tabDef.id === hash)?.id || tabDefs[0]?.id;

  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'tabs-wrapper';

  const tabList = document.createElement('div');
  tabList.className = 'tabs-list';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-orientation', 'horizontal');

  const tabContent = document.createElement('div');
  tabContent.className = 'tabs-content';

  const tabButtons = {};
  const tabPanels = {};

  tabDefs.forEach((tabDef) => {
    const baseId = `${tabDef.id}${sectionId ? `-${sectionId}` : ''}`;
    const buttonId = `desktop-${baseId}`;
    const panelId = `desktop-panel-${baseId}`;
    const isSelected = tabDef.id === selectedId;

    const button = document.createElement('button');
    button.className = 'tabs-tab';
    button.id = buttonId;
    button.type = 'button';
    button.role = 'tab';
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    button.classList.toggle('is-active', isSelected);
    button.textContent = tabDef.title;

    const panel = document.createElement('div');
    panel.className = 'tab';
    panel.id = panelId;
    panel.role = 'tabpanel';
    panel.setAttribute('aria-labelledby', buttonId);
    panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
    layoutTabPanel(tabDef.section, tabDef.id);
    panel.append(tabDef.section);

    button.addEventListener('click', () => {
      updateTabState(tabDefs, tabDef.id, tabButtons, tabPanels);
      scrollActiveTab(button, tabList);
      window.history.pushState({}, '', `${window.location.pathname}#${tabDef.id}`);
    });

    tabButtons[tabDef.id] = button;
    tabPanels[tabDef.id] = panel;
    tabList.append(button);
    tabContent.append(panel);
  });

  tabsWrapper.append(tabList, tabContent);

  // Scroll the initially selected tab into view on load
  const activeButton = tabButtons[selectedId];
  if (activeButton) {
    requestAnimationFrame(() => scrollActiveTab(activeButton, tabList));
  }

  return tabsWrapper;
}

function buildTabsFromSections(tabSections) {
  if (!tabSections.length) return;
  const first = tabSections[0];
  const parent = first.parentNode;
  if (!parent) return;

  const tabDefs = tabSections
    .map((section, index) => getTabDefinition(section, index))
    .filter(Boolean);
  if (!tabDefs.length) return;

  tabDefs.forEach((def) => def.section.classList.remove('tabs'));

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'section tabs';
  parent.insertBefore(tabsContainer, first);

  const tabsUI = buildTabsUI(tabDefs, tabsContainer, first.id || '');
  tabsContainer.append(tabsUI);
}

export default function decorate(block) {
  const currSection = block.closest('.section');
  if (!currSection) return;

  const tabDefs = collectTabSections(currSection);
  if (!tabDefs.length) return;

  currSection.classList.add('tabs');
  tabDefs.forEach((def) => def.section.classList.remove('tabs'));

  const tabsUI = buildTabsUI(tabDefs, currSection, currSection.id || '');
  block.replaceChildren(tabsUI);
}

export async function createTabs(main) {
  if (!main) return;
  if (!tabsStyleLoaded) {
    tabsStyleLoaded = loadCSS(`${window.hlx.codeBasePath}/blocks/tabs/tabs.css`);
  }
  await tabsStyleLoaded;
  const tabGroups = findTabGroups(main);
  tabGroups.forEach((group) => buildTabsFromSections(group));
}
