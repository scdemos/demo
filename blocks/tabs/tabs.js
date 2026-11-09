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
      button.setAttribute('tabindex', isSelected ? '0' : '-1');
      button.classList.toggle('is-active', isSelected);
    }

    if (panel) {
      panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
      panel.hidden = !isSelected;
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

function handleTabKeydown(event, tabList) {
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  const keys = {
    ArrowRight: (index + 1) % tabs.length,
    ArrowLeft: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  if (!(event.key in keys)) return;
  event.preventDefault();
  const next = tabs[keys[event.key]];
  next.focus();
  next.click();
}

function buildTabsUI(tabDefs, tabsContainer, sectionId = '', label = '') {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  const selectedId = tabDefs.find((tabDef) => tabDef.id === hash)?.id || tabDefs[0]?.id;

  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'tabs-wrapper';

  const tabList = document.createElement('div');
  tabList.className = 'tabs-list';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-orientation', 'horizontal');
  if (label) tabList.setAttribute('aria-label', label);
  tabList.addEventListener('keydown', (event) => handleTabKeydown(event, tabList));

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
    button.setAttribute('tabindex', isSelected ? '0' : '-1');
    button.classList.toggle('is-active', isSelected);
    button.textContent = tabDef.title;

    const panel = document.createElement('div');
    panel.className = 'tab';
    panel.id = panelId;
    panel.role = 'tabpanel';
    panel.setAttribute('aria-labelledby', buttonId);
    panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
    panel.setAttribute('tabindex', '0');
    panel.hidden = !isSelected;
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

  const label = block.textContent.trim();
  const tabsUI = buildTabsUI(tabDefs, currSection, currSection.id || '', label);
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
