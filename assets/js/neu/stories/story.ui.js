function storyDescriptorFromGridTile(tile) {
  const meta = String(tile.querySelector('.story-tile-meta')?.textContent || '');
  const author = meta.includes('|') ? meta.split('|')[0].trim() : meta.trim();
  const media = String(
    tile.querySelector('.story-tile-media img')?.getAttribute('src') ||
      tile.querySelector('.story-tile-media video')?.getAttribute('src') ||
      '',
  ).trim();
  return { author, media };
}

function storyDescriptorFromStripPill(pill) {
  const author = String(pill.querySelector('.story-pill-title')?.textContent || '').trim();
  const media = String(
    pill.querySelector('.story-pill-media img')?.getAttribute('src') ||
      pill.querySelector('.story-pill-media video')?.getAttribute('src') ||
      '',
  ).trim();
  return { author, media };
}

function applyStoryKey(node, item, storyCandidateKey) {
  if (!(node instanceof HTMLElement)) return;
  const key = String(storyCandidateKey(item) || '').trim();
  node.dataset.neuStoryKey = key;
  node.dataset.neuStorySource = String(item?.source || '');
  node.dataset.neuStoryId = String(item?.id || '');
}

function clearStoryKey(node) {
  if (!(node instanceof HTMLElement)) return;
  delete node.dataset.neuStoryKey;
  delete node.dataset.neuStorySource;
  delete node.dataset.neuStoryId;
}

function ensureStoryGridMenu(tile) {
  let menu = tile.querySelector('.neu-story-grid-menu');
  if (menu instanceof HTMLElement) return menu;

  menu = document.createElement('span');
  menu.className = 'neu-story-grid-menu';
  menu.innerHTML = `
    <span class="neu-story-menu-toggle" data-neu-story-menu-toggle="1" role="button" tabindex="0" aria-label="Opciones">&#x22ef;</span>
    <span class="neu-story-menu-panel" hidden>
      <span class="neu-story-menu-item neu-story-menu-item-danger" data-neu-story-action="delete" role="button" tabindex="0">Eliminar</span>
    </span>
  `;
  tile.append(menu);
  return menu;
}

export function closeAllStoryMenus(except = null) {
  document.querySelectorAll('.neu-story-grid-menu').forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
  });

  const modalMenu = document.getElementById('neuStoryModalMenu');
  if (modalMenu instanceof HTMLElement && modalMenu !== except) {
    modalMenu.classList.remove('is-open');
    const panel = modalMenu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
  }
}

export function toggleStoryMenu(menu) {
  if (!(menu instanceof HTMLElement)) return;
  const isOpen = menu.classList.contains('is-open');
  if (isOpen) {
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
    return;
  }

  closeAllStoryMenus(menu);
  menu.classList.add('is-open');
  const panel = menu.querySelector('.neu-story-menu-panel');
  if (panel instanceof HTMLElement) panel.hidden = false;
}

export function decorateStoriesGrid({ isDisabled, findOwnStoryCandidate, storyCandidateKey }) {
  if (isDisabled('decorators')) return;
  const grid = document.getElementById('storiesGrid');
  if (!(grid instanceof HTMLElement)) return;

  grid.querySelectorAll('.story-tile[data-story-open]').forEach((tile) => {
    const descriptor = storyDescriptorFromGridTile(tile);
    const match = findOwnStoryCandidate(descriptor);
    const existingMenu = tile.querySelector('.neu-story-grid-menu');

    if (!match) {
      existingMenu?.remove();
      clearStoryKey(tile);
      return;
    }

    applyStoryKey(tile, match, storyCandidateKey);
    ensureStoryGridMenu(tile);
  });
}

export function annotateStoriesStrip({ isDisabled, findOwnStoryCandidate, storyCandidateKey }) {
  if (isDisabled('decorators')) return;
  const strip = document.getElementById('storiesStrip');
  if (!(strip instanceof HTMLElement)) return;

  strip.querySelectorAll('.story-pill[data-story-open]').forEach((pill) => {
    const descriptor = storyDescriptorFromStripPill(pill);
    const match = findOwnStoryCandidate(descriptor);
    if (!match) {
      clearStoryKey(pill);
      return;
    }
    applyStoryKey(pill, match, storyCandidateKey);
  });
}

export function ensureStoryModalMenu() {
  const actions = document.querySelector('#storyModal .story-modal-actions');
  if (!(actions instanceof HTMLElement)) return null;

  let menu = document.getElementById('neuStoryModalMenu');
  if (menu instanceof HTMLElement) return menu;

  menu = document.createElement('div');
  menu.id = 'neuStoryModalMenu';
  menu.className = 'neu-story-modal-menu';
  menu.hidden = true;
  menu.innerHTML = `
    <button class="neu-story-menu-toggle" data-neu-story-menu-toggle="1" type="button" aria-label="Opciones">&#x22ef;</button>
    <div class="neu-story-menu-panel" hidden>
      <button class="neu-story-menu-item neu-story-menu-item-danger" data-neu-story-action="delete" type="button">Eliminar</button>
    </div>
  `;
  actions.prepend(menu);
  return menu;
}

function modalStoryDescriptor() {
  const modal = document.getElementById('storyModal');
  if (!(modal instanceof HTMLElement) || modal.hidden) return null;

  const titleRaw = String(document.getElementById('storyModalTitle')?.textContent || '').trim();
  const author = titleRaw.includes('|') ? titleRaw.split('|')[0].trim() : titleRaw;
  const mediaWrap = document.getElementById('storyModalMediaWrap');
  const media = String(
    mediaWrap?.querySelector('img')?.getAttribute('src') || mediaWrap?.querySelector('video')?.getAttribute('src') || '',
  ).trim();
  if (!author && !media) return null;
  return { author, media };
}

export function refreshStoryModalMenu({ isDisabled, findOwnStoryCandidate, storyCandidateKey }) {
  if (isDisabled('decorators')) return;
  const menu = ensureStoryModalMenu();
  if (!(menu instanceof HTMLElement)) return;

  const descriptor = modalStoryDescriptor();
  if (!descriptor) {
    if (!menu.hidden) menu.hidden = true;
    menu.dataset.neuStoryKey = '';
    return;
  }

  const match = findOwnStoryCandidate(descriptor);
  if (!match) {
    if (!menu.hidden) menu.hidden = true;
    menu.dataset.neuStoryKey = '';
    return;
  }

  const key = String(storyCandidateKey(match) || '').trim();
  if (menu.hidden) menu.hidden = false;
  menu.dataset.neuStoryKey = key;
}

export function ensureStoryDeleteModal() {
  let modal = document.getElementById('neuStoryDeleteModal');
  if (modal instanceof HTMLElement) return modal;

  modal = document.createElement('div');
  modal.id = 'neuStoryDeleteModal';
  modal.className = 'neu-confirm-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="neu-confirm-backdrop" data-neu-story-delete-close="1"></div>
    <div class="neu-confirm-card" role="dialog" aria-modal="true" aria-labelledby="neuStoryDeleteTitle">
      <h3 id="neuStoryDeleteTitle">Eliminar story</h3>
      <p>Se eliminara de stories y del perfil.</p>
      <div class="neu-confirm-actions">
        <button class="btn-white-outline" id="neuStoryDeleteCancelBtn" type="button">Cancelar</button>
        <button class="btn-yellow neu-danger-btn" id="neuStoryDeleteConfirmBtn" type="button">Eliminar</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

export function openStoryDeleteModal(state, storyKey) {
  const modal = ensureStoryDeleteModal();
  state.pendingDeleteKey = String(storyKey || '');
  modal.hidden = false;
}

export function closeStoryDeleteModal(state) {
  const modal = document.getElementById('neuStoryDeleteModal');
  if (modal instanceof HTMLElement) modal.hidden = true;
  state.pendingDeleteKey = '';
}

export function removeDeletedStoryFromUi(storyKey) {
  const key = String(storyKey || '').trim();
  if (!key) return;
  document.querySelectorAll(`[data-neu-story-key="${key}"]`).forEach((node) => node.remove());

  const modalMenu = document.getElementById('neuStoryModalMenu');
  if (modalMenu instanceof HTMLElement && String(modalMenu.dataset.neuStoryKey || '') === key) {
    modalMenu.hidden = true;
    modalMenu.dataset.neuStoryKey = '';
    const closeBtn = document.getElementById('storyCloseBtn');
    if (closeBtn instanceof HTMLElement) closeBtn.click();
  }
}

export function getStoryKeyFromActionTarget(node) {
  const fromModal = node.closest('#neuStoryModalMenu');
  if (fromModal instanceof HTMLElement) return String(fromModal.dataset.neuStoryKey || '').trim();

  const fromTile = node.closest('.story-tile[data-neu-story-key], .story-pill[data-neu-story-key]');
  if (fromTile instanceof HTMLElement) return String(fromTile.dataset.neuStoryKey || '').trim();
  return '';
}

export function wireStoryCrudEvents({
  state,
  isDisabled,
  scheduleStoryDecorate,
  deleteStoryByKey,
  setInlineMessage,
  refreshStoryModalMenu,
}) {
  if (state.wired) return;
  state.wired = true;

  if (!isDisabled('decorators')) ensureStoryModalMenu();
  ensureStoryDeleteModal();
  scheduleStoryDecorate({ forceReload: true });

  const storiesGrid = document.getElementById('storiesGrid');
  if (storiesGrid instanceof HTMLElement && !isDisabled('observers')) {
    state.gridObserver = new MutationObserver(() => {
      scheduleStoryDecorate();
    });
    // Root childList is enough because legacy renderer replaces tile list at root.
    state.gridObserver.observe(storiesGrid, { childList: true });
  }

  const storiesStrip = document.getElementById('storiesStrip');
  if (storiesStrip instanceof HTMLElement && !isDisabled('observers')) {
    state.stripObserver = new MutationObserver(() => {
      scheduleStoryDecorate();
    });
    state.stripObserver.observe(storiesStrip, { childList: true });
  }

  const storyModal = document.getElementById('storyModal');
  if (storyModal instanceof HTMLElement && !isDisabled('observers')) {
    state.modalObserver = new MutationObserver(() => {
      refreshStoryModalMenu();
    });
    // Observe only modal open/close; subtree watchers can trigger high-frequency loops.
    state.modalObserver.observe(storyModal, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeDelete = target.closest('[data-neu-story-delete-close], #neuStoryDeleteCancelBtn');
      if (closeDelete) {
        event.preventDefault();
        closeStoryDeleteModal(state);
        return;
      }

      const confirmDelete = target.closest('#neuStoryDeleteConfirmBtn');
      if (confirmDelete) {
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteStoryByKey(state.pendingDeleteKey).catch((error) => {
          console.error('[neu-story] delete handler failed', error);
          setInlineMessage('No se pudo eliminar la story.', true);
        });
        return;
      }

      const menuToggle = target.closest('.neu-story-menu-toggle');
      if (menuToggle) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const menu = menuToggle.closest('.neu-story-grid-menu, #neuStoryModalMenu');
        toggleStoryMenu(menu);
        return;
      }

      const menuAction = target.closest('[data-neu-story-action="delete"]');
      if (menuAction) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const key = getStoryKeyFromActionTarget(menuAction);
        closeAllStoryMenus();
        if (!key) return;
        openStoryDeleteModal(state, key);
        return;
      }

      if (!target.closest('.neu-story-grid-menu, #neuStoryModalMenu')) {
        closeAllStoryMenus();
      }

      const storyNavigationTrigger = target.closest('[data-story-open], #storyPrevBtn, #storyNextBtn, #storyCloseBtn, [data-story-close]');
      if (storyNavigationTrigger && !isDisabled('decorators')) {
        window.setTimeout(() => {
          refreshStoryModalMenu();
        }, 0);
      }
    },
    true,
  );

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const isToggle = target.matches('.neu-story-menu-toggle, [data-neu-story-action]');
    if (!isToggle) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

export function createStoryUi({ repository } = {}) {
  return {
    async init() {
      if (!repository || typeof repository.isCrudEnabled !== 'function') return;
      if (!repository.isCrudEnabled()) return;
      await repository.bootGuarded('crud_stories', () => repository.initCrud());
    },
  };
}

export async function init(deps) {
  const ui = createStoryUi(deps);
  await ui.init();
  return ui;
}
