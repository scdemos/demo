import { loadCSS } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

const CSS_CLASSES = {
  TOGGLE: 'auth-toggle',
  HANDLE: 'auth-handle',
  HANDLE_ICON: 'auth-handle-icon',
  HEADER: 'auth-header',
  CLOSE: 'auth-close',
  OPTIONS: 'auth-options',
  OPTION_BUTTON: 'auth-option-button',
  EXPANDED: 'expanded',
  HIDDEN: 'hidden',
  DRAGGING: 'dragging',
  VISIBLE: 'visible',
  BOUNCE: 'bounce',
  CURRENT_STATE: 'current-state',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
};

/**
 * @returns {boolean} true when auth=true query param is set
 */
function getAuthState() {
  const authValue = new URLSearchParams(window.location.search).get('auth');
  return authValue === 'true';
}

/**
 * @param {Element} block
 * @returns {Element}
 */
export default function decorate(block) {
  const currentState = getAuthState();
  let isExpanded = false;

  block.innerHTML = '';
  block.id = CSS_CLASSES.TOGGLE;
  block.classList.add(CSS_CLASSES.TOGGLE);

  const handleIcon = createTag('div', { class: CSS_CLASSES.HANDLE_ICON }, 'AUTH STATE');
  const handle = createTag('div', {
    class: CSS_CLASSES.HANDLE,
    title: 'Click to expand or drag to move',
  }, handleIcon);

  const headerText = createTag('span', {}, 'Auth State');
  const closeBtn = createTag('button', {
    class: CSS_CLASSES.CLOSE,
    type: 'button',
    'aria-label': 'Close auth panel',
  }, 'x');
  const header = createTag('div', { class: CSS_CLASSES.HEADER }, [headerText, closeBtn]);

  const optionsContainer = createTag('div', { class: CSS_CLASSES.OPTIONS });
  const currentStateIndicator = createTag('div', {
    class: `${CSS_CLASSES.OPTION_BUTTON} ${CSS_CLASSES.CURRENT_STATE}`,
  }, currentState ? 'Authenticated' : 'Anonymous');

  const switchButton = createTag('button', {
    class: CSS_CLASSES.OPTION_BUTTON,
    type: 'button',
    'data-auth-state': currentState ? CSS_CLASSES.ANONYMOUS : CSS_CLASSES.AUTHENTICATED,
  }, currentState ? 'Switch to Anonymous' : 'Switch to Authenticated');

  optionsContainer.append(currentStateIndicator, switchButton);

  function handleClickOutside(event) {
    if (block.contains(event.target)) return;
    if (isExpanded) {
      isExpanded = false;
      block.classList.remove(CSS_CLASSES.EXPANDED);
      handle.classList.remove(CSS_CLASSES.HIDDEN);
      document.removeEventListener('click', handleClickOutside);
    }
  }

  function togglePanel() {
    isExpanded = !isExpanded;
    block.classList.toggle(CSS_CLASSES.EXPANDED, isExpanded);
    handle.classList.toggle(CSS_CLASSES.HIDDEN, isExpanded);
    if (isExpanded) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }

  let isDragging = false;
  let dragController = null;

  function getClientCoords(event) {
    return {
      x: event.clientX || event.touches?.[0]?.clientX || 0,
      y: event.clientY || event.touches?.[0]?.clientY || 0,
    };
  }

  function onDrag(event, dragState) {
    event.preventDefault();
    const { x: clientX, y: clientY } = getClientCoords(event);
    const deltaX = clientX - dragState.startX;
    const deltaY = clientY - dragState.startY;
    const dragThreshold = 5;

    if (!isDragging && (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold)) {
      isDragging = true;
      block.classList.add(CSS_CLASSES.DRAGGING);
    }

    if (!isDragging) return;

    const newX = dragState.initialX + deltaX;
    const newY = dragState.initialY + deltaY;
    const maxX = window.innerWidth - block.offsetWidth;
    const maxY = window.innerHeight - block.offsetHeight;
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));

    block.style.left = `${constrainedX}px`;
    block.style.top = `${constrainedY}px`;
    block.style.right = 'auto';
  }

  function endDrag() {
    if (dragController) {
      dragController.abort();
      dragController = null;
    }

    if (isDragging) {
      block.classList.remove(CSS_CLASSES.DRAGGING);
      isDragging = false;
      return;
    }

    togglePanel();
  }

  function startDrag(event) {
    event.preventDefault();
    isDragging = false;

    const { x: clientX, y: clientY } = getClientCoords(event);
    const rect = block.getBoundingClientRect();
    const dragState = {
      startX: clientX,
      startY: clientY,
      initialX: rect.left,
      initialY: rect.top,
    };

    dragController = new AbortController();
    const { signal } = dragController;
    document.addEventListener('mousemove', (e) => onDrag(e, dragState), { signal });
    document.addEventListener('mouseup', endDrag, { signal });
    document.addEventListener('touchmove', (e) => onDrag(e, dragState), { signal });
    document.addEventListener('touchend', endDrag, { signal });
  }

  function handleOptionClick(targetState) {
    const url = new URL(window.location.href);
    if (targetState === CSS_CLASSES.AUTHENTICATED) {
      url.searchParams.set('auth', 'true');
    } else if (targetState === CSS_CLASSES.ANONYMOUS) {
      url.searchParams.set('auth', 'false');
    }
    window.location.href = url.toString();
  }

  handle.addEventListener('mousedown', startDrag);
  handle.addEventListener('touchstart', startDrag);
  closeBtn.addEventListener('click', togglePanel);
  switchButton.addEventListener('click', () => {
    handleOptionClick(switchButton.getAttribute('data-auth-state'));
  });

  block.append(handle, header, optionsContainer);

  block.cleanup = () => {
    document.removeEventListener('click', handleClickOutside);
    if (dragController) {
      dragController.abort();
      dragController = null;
    }
  };

  setTimeout(() => {
    block.classList.add(CSS_CLASSES.VISIBLE);
    setTimeout(() => {
      handle.classList.add(CSS_CLASSES.BOUNCE);
      setTimeout(() => handle.classList.remove(CSS_CLASSES.BOUNCE), 400);
    }, 500);
  }, 1000);

  return block;
}

/**
 * @returns {Promise<HTMLElement>}
 */
export async function createAuthToggle() {
  await loadCSS(`${window.hlx.codeBasePath}/blocks/auth-toggle/auth-toggle.css`);
  const block = createTag('div', { class: CSS_CLASSES.TOGGLE });
  document.body.append(block);
  return decorate(block);
}
