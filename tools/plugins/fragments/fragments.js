// Import SDK for Document Authoring
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { crawl } from 'https://da.live/nx/public/utils/tree.js';

// Base path for fragments
const FRAGMENTS_BASE = '/fragments';

// Add constants at the top
const CONSTANTS = {
  AUTO_HIDE_DELAY: 1000,
  CRAWL_THROTTLE: 10,
  ICONS: {
    FOLDER: '/.da/icons/folder-icon.png',
    FOLDER_OPEN: '/.da/icons/folder-open-icon.png',
    FRAGMENT: '/.da/icons/fragment-icon.png',
  },
};

// Track currently selected fragment
let selectedFragment = null;

/**
 * Shows a user-facing message in the feedback area
 * @param {string} text - Message text to display
 * @param {boolean} isError - Whether this is an error message
 * @param {boolean} autoHide - Whether to auto-hide after delay
 */
function showMessage(text, isError = false, autoHide = false) {
  const message = document.querySelector('.feedback-message');
  const msgContainer = document.querySelector('.message-wrapper');

  if (!message || !msgContainer) return;

  message.innerHTML = text.replace(/\r?\n/g, '<br>');
  message.classList.toggle('error', isError);
  msgContainer.classList.remove('hidden');

  if (autoHide && !isError) {
    // Use CSS animation end event instead of setTimeout
    msgContainer.classList.add('auto-hide');
    const handleAnimationEnd = () => {
      msgContainer.classList.add('hidden');
      msgContainer.classList.remove('auto-hide');
      msgContainer.removeEventListener('animationend', handleAnimationEnd);
    };
    msgContainer.addEventListener('animationend', handleAnimationEnd);
  }
}

/**
 * Creates a tree structure from file paths
 * @param {Array} files - Array of file objects with paths
 * @param {string} basePath - Base path to remove from display
 * @returns {Object} Tree structure
 */
function createFileTree(files, basePath) {
  const tree = {};
  files.forEach((file) => {
    // Remove the org/repo prefix from display path
    const displayPath = file.path.replace(basePath, '');
    const parts = displayPath.split('/').filter(Boolean);
    let current = tree;
    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = {
          isFile: i === parts.length - 1 && file.path.endsWith('.html'),
          children: {},
          path: file.path, // Keep original path for link creation
        };
      }
      current = current[part].children;
    });
  });
  return tree;
}


/**
 * Shows preview in the right panel and updates selection state
 * @param {string} fragmentPath - Path to the fragment file
 * @param {string} fragmentName - Display name of the fragment
 * @param {Object} context - SDK context object
 * @param {HTMLElement} fragmentElement - The tree item element that was selected
 */
function showPreview(fragmentPath, fragmentName, context, fragmentElement) {
  const iframe = document.querySelector('.preview-iframe');
  const placeholder = document.querySelector('.preview-placeholder');
  const insertBtn = document.querySelector('.insert-btn');

  if (!iframe || !placeholder || !insertBtn) return;

  // Build preview URL
  const basePath = `/${context.org}/${context.repo}`;
  const displayPath = fragmentPath.replace(basePath, '').replace(/\.html$/, '');
  const previewUrl = `https://main--${context.repo}--${context.org}.aem.page${displayPath}`;

  // Update selection state
  if (selectedFragment && selectedFragment.element) {
    selectedFragment.element.classList.remove('selected');
    selectedFragment.element.classList.add('was-selected');
  }

  selectedFragment = {
    path: fragmentPath,
    name: fragmentName,
    element: fragmentElement,
  };

  if (fragmentElement) {
    fragmentElement.classList.remove('was-selected');
    fragmentElement.classList.add('selected');
  }

  // Enable insert button
  insertBtn.disabled = false;
  insertBtn.setAttribute('aria-label', `Insert fragment "${fragmentName}"`);

  // Show iframe, hide placeholder
  iframe.src = previewUrl;
  iframe.classList.remove('hidden');
  placeholder.classList.add('hidden');
}

/**
 * Creates a tree item element
 * @param {string} name - Item name
 * @param {Object} node - Tree node data
 * @param {Object} context - SDK context for preview URL generation
 * @returns {HTMLElement} Tree item element
 */
function createTreeItem(name, node, context) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.setAttribute('role', 'listitem');

  const content = document.createElement('div');
  content.className = 'tree-item-content';

  if (node.isFile) {
    const button = document.createElement('button');
    button.className = 'fragment-btn-item';
    button.setAttribute('role', 'button');
    const displayName = name.replace('.html', '');
    button.setAttribute('aria-label', `Preview fragment "${displayName}"`);

    const fragmentIcon = document.createElement('img');
    fragmentIcon.src = '/.da/icons/fragment-icon.png';
    fragmentIcon.alt = 'Fragment';
    fragmentIcon.className = 'tree-icon';
    fragmentIcon.setAttribute('aria-hidden', 'true');

    const textSpan = document.createElement('span');
    textSpan.textContent = displayName;

    button.appendChild(fragmentIcon);
    button.appendChild(textSpan);
    button.title = `Click to preview "${displayName}"`;

    // Click shows preview
    button.addEventListener('click', () => {
      showPreview(node.path, displayName, context, item);
    });

    content.appendChild(button);
  } else {
    const folderButton = document.createElement('button');
    folderButton.className = 'folder-btn';
    folderButton.setAttribute('role', 'button');
    folderButton.setAttribute('aria-expanded', 'false');
    folderButton.setAttribute('aria-label', `Folder ${name}`);

    const folderIcon = document.createElement('img');
    folderIcon.src = '/.da/icons/folder-icon.png';
    folderIcon.alt = ''; // Decorative image, using aria-hidden instead
    folderIcon.className = 'tree-icon folder-icon';
    folderIcon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'folder-name';
    label.textContent = name;

    folderButton.appendChild(folderIcon);
    folderButton.appendChild(label);

    const toggleFolder = () => {
      folderButton.classList.toggle('expanded');
      folderButton.setAttribute('aria-expanded', folderButton.classList.contains('expanded'));
      folderIcon.src = folderButton.classList.contains('expanded')
        ? '/.da/icons/folder-open-icon.png'
        : '/.da/icons/folder-icon.png';
      const list = item.querySelector('.tree-list');
      if (list) {
        list.classList.toggle('hidden');
      }
    };

    folderButton.addEventListener('click', toggleFolder);
    content.appendChild(folderButton);

    if (Object.keys(node.children).length > 0) {
      const list = document.createElement('div');
      list.className = 'tree-list hidden';
      list.setAttribute('role', 'list');

      Object.entries(node.children)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([childName, childNode]) => {
          list.appendChild(createTreeItem(childName, childNode, context));
        });

      item.appendChild(content);
      item.appendChild(list);
    }
  }

  if (!content.parentElement) {
    item.appendChild(content);
  }

  return item;
}

/**
 * Handles fragment insertion by inserting a link for the currently selected fragment
 * @param {Object} actions - SDK actions object
 * @param {Object} context - SDK context
 */
function handleFragmentInsert(actions, context) {
  if (!selectedFragment) {
    showMessage('No fragment selected', true);
    return;
  }

  if (!actions?.sendHTML) {
    showMessage('Cannot insert fragment: Editor not available', true);
    return;
  }

  try {
    const basePath = `/${context.org}/${context.repo}`;
    const displayPath = selectedFragment.path.replace(basePath, '').replace(/\.html$/, '');
    const fragmentUrl = `https://main--${context.repo}--${context.org}.aem.page${displayPath}`;
    actions.sendHTML(`<a href="${fragmentUrl}" class="fragment">${fragmentUrl}</a>`);
    showMessage('Fragment inserted successfully', false, true);
    actions.closeLibrary();
  } catch (error) {
    showMessage('Failed to insert fragment', true);
  }
}

/**
 * Filters tree items based on search text
 * @param {string} searchText - Text to search for
 * @param {HTMLElement} fragmentsList - List container element
 */
function filterFragments(searchText, fragmentsList) {
  const items = fragmentsList.querySelectorAll('.tree-item');
  const searchLower = searchText.toLowerCase();

  // First pass: Find matching items and their parent folders
  const matchingPaths = new Set();
  items.forEach((item) => {
    const button = item.querySelector('.fragment-btn-item');
    if (button && button.textContent.toLowerCase().includes(searchLower)) {
      // Add current item and all its parent folders to matching paths
      let current = item;
      while (current && current.classList.contains('tree-item')) {
        matchingPaths.add(current);
        current = current.parentElement.closest('.tree-item');
      }
    }
  });

  // Second pass: Show/hide items and expand folders
  items.forEach((item) => {
    const isMatching = matchingPaths.has(item);
    item.style.display = isMatching ? '' : 'none';

    // If it's a folder and it's in the matching paths, expand it
    const folderBtn = item.querySelector('.folder-btn');
    const list = item.querySelector('.tree-list');
    if (folderBtn && list && isMatching) {
      folderBtn.classList.add('expanded');
      folderBtn.setAttribute('aria-expanded', 'true');
      const folderIcon = folderBtn.querySelector('.folder-icon');
      if (folderIcon) {
        folderIcon.src = '/.da/icons/folder-open-icon.png';
      }
      list.classList.remove('hidden');
    }
  });

  // If search is cleared, restore to initial state
  if (!searchText) {
    const targetDepth = getBasePathDepth();

    items.forEach((item) => {
      // Show all items
      item.style.display = '';

      // Re-expand to initial depth
      const depth = getItemDepth(item);
      const folderBtn = item.querySelector(':scope > .tree-item-content > .folder-btn');
      const list = item.querySelector(':scope > .tree-list');

      if (folderBtn && list) {
        if (depth <= targetDepth) {
          // Expand folders within target depth
          folderBtn.classList.add('expanded');
          folderBtn.setAttribute('aria-expanded', 'true');
          const folderIcon = folderBtn.querySelector('.folder-icon');
          if (folderIcon) {
            folderIcon.src = '/.da/icons/folder-open-icon.png';
          }
          list.classList.remove('hidden');
        } else {
          // Collapse folders beyond target depth
          folderBtn.classList.remove('expanded');
          folderBtn.setAttribute('aria-expanded', 'false');
          const folderIcon = folderBtn.querySelector('.folder-icon');
          if (folderIcon) {
            folderIcon.src = '/.da/icons/folder-icon.png';
          }
          list.classList.add('hidden');
        }
      }
    });
  }
}

/**
 * Gets the depth level of a tree item
 * @param {HTMLElement} item - Tree item element
 * @returns {number} Depth level (1-based)
 */
function getItemDepth(item) {
  let depth = 0;
  let current = item;
  while (current && current.classList.contains('tree-item')) {
    depth += 1;
    current = current.parentElement.closest('.tree-item');
  }
  return depth;
}

// Function to get the depth of FRAGMENTS_BASE
function getBasePathDepth() {
  return FRAGMENTS_BASE.split('/').filter(Boolean).length; // filter(Boolean) removes empty strings
}

// Function to expand folder to specific depth
function expandToDepth(item, currentDepth, targetDepth) {
  const folderBtn = item.querySelector('.folder-btn');
  const list = item.querySelector('.tree-list');

  if (folderBtn && list && currentDepth <= targetDepth) {
    // Expand this folder
    folderBtn.classList.add('expanded');
    folderBtn.setAttribute('aria-expanded', 'true');
    const folderIcon = folderBtn.querySelector('.folder-icon');
    if (folderIcon) {
      folderIcon.src = '/.da/icons/folder-open-icon.png';
    }
    list.classList.remove('hidden');

    // Recursively expand child folders
    const childFolders = list.querySelectorAll(':scope > .tree-item');
    childFolders.forEach((childItem) => {
      expandToDepth(childItem, currentDepth + 1, targetDepth);
    });
  }
}

/**
 * Initializes the fragments interface and sets up event handlers
 */
(async function init() {
  try {
    const { actions, context } = await DA_SDK;
    const fragmentsList = document.querySelector('.fragments-list');
    const searchInput = document.querySelector('.fragment-search');
    const insertBtn = document.querySelector('.insert-btn');

  // Add search handler
  searchInput.addEventListener('input', (e) => {
    filterFragments(e.target.value, fragmentsList);
  });

  // Add Insert button handler
  insertBtn.addEventListener('click', () => {
    handleFragmentInsert(actions, context);
  });

  // Add keyboard navigation for fragments list
  fragmentsList.addEventListener('keydown', (e) => {
    const allFragments = Array.from(fragmentsList.querySelectorAll('.fragment-btn-item'));
    if (allFragments.length === 0) return;

    const currentIndex = allFragments.findIndex((btn) => btn === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % allFragments.length;
      allFragments[nextIndex].focus();
      allFragments[nextIndex].click(); // Trigger preview
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex <= 0 ? allFragments.length - 1 : currentIndex - 1;
      allFragments[prevIndex].focus();
      allFragments[prevIndex].click(); // Trigger preview
    } else if (e.key === 'Enter' && currentIndex >= 0) {
      e.preventDefault();
      // Insert button click
      insertBtn.click();
    }
  });

  // Function to load fragments
  async function loadFragments() {
    const fragmentsContainer = document.querySelector('.fragments-list');

    if (!fragmentsContainer.querySelector('.loading-state')) {
      fragmentsContainer.innerHTML = '<div class="loading-state">Loading fragments...</div>';
    }

    try {
      const files = [];
      const { context: loadContext, token } = await DA_SDK;
      const path = `/${loadContext.org}/${loadContext.repo}${FRAGMENTS_BASE}`;
      const basePath = `/${loadContext.org}/${loadContext.repo}`;

      const { results } = crawl({
        path,
        callback: (file) => {
          if (file.path.endsWith('.html')) {
            files.push(file);
          }
        },
        throttle: CONSTANTS.CRAWL_THROTTLE,
        mode: 'horizontal',
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      await results;

      // Clear loading message
      fragmentsContainer.innerHTML = '';

      if (files.length === 0) {
        fragmentsContainer.innerHTML = '<div class="loading-state">No fragments found</div>';
        return;
      }

      const tree = createFileTree(files, basePath);
      const targetDepth = getBasePathDepth();

      Object.entries(tree)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, node]) => {
          const item = createTreeItem(name, node, loadContext);
          fragmentsContainer.appendChild(item);

          // Expand folders to the target depth
          expandToDepth(item, 1, targetDepth);
        });
    } catch (error) {
      // Clear loading spinner and show error with retry option
      fragmentsContainer.innerHTML = `
        <div class="error-state">
          <p>Failed to load fragments.</p>
          <button class="retry-btn" type="button">Retry</button>
        </div>
      `;
      showMessage('Failed to load fragments. Click Retry to try again.', true);

      // Add retry handler
      const retryBtn = fragmentsContainer.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadFragments);
      }
    }
  }

  // Load fragments initially
  await loadFragments();
  } catch (error) {
    showMessage('Initialization failed. Please refresh the page.', true);
  }
}());
