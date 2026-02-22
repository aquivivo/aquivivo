const body = document.body;
const MODE_KEY = 'av_profile_orbit_mode';
const FEED_VIEW_KEY = 'av_profile_orbit_feed_view';

const modeButtons = Array.from(document.querySelectorAll('[data-orbit-mode]'));
const feedViewButtons = Array.from(document.querySelectorAll('[data-orbit-feed-view]'));
const jumpButtons = Array.from(document.querySelectorAll('[data-orbit-go]'));
const templateButtons = Array.from(document.querySelectorAll('[data-orbit-template]'));
const tagButtons = Array.from(document.querySelectorAll('[data-orbit-tag]'));

const searchInput = document.getElementById('profileSearchInput');
const statusInput = document.getElementById('statusInput');
const feedSearchInput = document.getElementById('feedSearchInput');
const impactBar = document.getElementById('orbitImpactBar');
const consistencyBar = document.getElementById('orbitConsistencyBar');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function asNumber(text) {
  const value = Number(String(text || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function isTypingContext(el) {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return String(el.getAttribute?.('contenteditable') || '').toLowerCase() === 'true';
}

function setMode(mode) {
  const next = ['orbit', 'focus', 'stream'].includes(mode) ? mode : 'orbit';
  body.dataset.orbitMode = next;
  modeButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.orbitMode === next);
  });
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch {
    // ignore
  }
}

function setFeedView(view) {
  const next = ['list', 'masonry'].includes(view) ? view : 'list';
  body.dataset.orbitFeedView = next;
  feedViewButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.orbitFeedView === next);
  });
  try {
    localStorage.setItem(FEED_VIEW_KEY, next);
  } catch {
    // ignore
  }
}

function openTab(tabName) {
  const key = String(tabName || '').trim();
  if (!key) return;
  const btn = document.querySelector(`.profile-tab-btn[data-tab="${key}"]`);
  if (btn instanceof HTMLButtonElement) btn.click();
}

function dispatchInput(el) {
  if (!el) return;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function useTemplate(text) {
  const value = String(text || '').trim();
  if (!value || !(statusInput instanceof HTMLTextAreaElement)) return;
  openTab('feed');
  const current = String(statusInput.value || '').trim();
  statusInput.value = current ? `${current}\n${value}` : value;
  dispatchInput(statusInput);
  statusInput.focus();
  statusInput.selectionStart = statusInput.value.length;
  statusInput.selectionEnd = statusInput.value.length;
}

function filterByTag(tag) {
  const value = String(tag || '').trim();
  if (!value || !(feedSearchInput instanceof HTMLInputElement)) return;
  openTab('feed');
  feedSearchInput.value = `#${value.replace(/^#/, '')}`;
  dispatchInput(feedSearchInput);
  feedSearchInput.focus();
  feedSearchInput.select();
}

function updateMeters() {
  if (!impactBar && !consistencyBar) return;

  const exp = asNumber(document.getElementById('statExp')?.textContent);
  const streak = asNumber(document.getElementById('statStreak')?.textContent);
  const top3 = asNumber(document.getElementById('statTop3')?.textContent);
  const followers = asNumber(document.getElementById('followersCount')?.textContent);
  const following = asNumber(document.getElementById('followingCount')?.textContent);

  const impact = clamp(Math.round(exp / 16 + top3 * 7 + followers * 0.25), 8, 100);
  const consistency = clamp(Math.round(streak * 4 + following * 0.18), 8, 100);

  if (impactBar) impactBar.style.width = `${impact}%`;
  if (consistencyBar) consistencyBar.style.width = `${consistency}%`;
}

function initMode() {
  let saved = 'orbit';
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw) saved = raw;
  } catch {
    // ignore
  }
  setMode(saved);

  modeButtons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => setMode(btn.dataset.orbitMode || 'orbit'));
  });
}

function initFeedView() {
  let saved = 'list';
  try {
    const raw = localStorage.getItem(FEED_VIEW_KEY);
    if (raw) saved = raw;
  } catch {
    // ignore
  }
  setFeedView(saved);

  feedViewButtons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => setFeedView(btn.dataset.orbitFeedView || 'list'));
  });
}

function initJumpLinks() {
  jumpButtons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const target = btn.dataset.orbitGo || '';
      openTab(target);
    });
  });
}

function initTemplates() {
  templateButtons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => useTemplate(btn.dataset.orbitTemplate || ''));
  });
}

function initTags() {
  tagButtons.forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => filterByTag(btn.dataset.orbitTag || ''));
  });
}

function initShortcuts() {
  if (body.dataset.orbitShortcuts === '1') return;
  body.dataset.orbitShortcuts = '1';

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = String(event.key || '').toLowerCase();
    const active = document.activeElement;

    if (key === '/' && !isTypingContext(active)) {
      if (!(searchInput instanceof HTMLInputElement)) return;
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (isTypingContext(active)) return;

    if (key === 'c') {
      event.preventDefault();
      openTab('feed');
      if (statusInput instanceof HTMLTextAreaElement) {
        statusInput.focus();
        statusInput.selectionStart = statusInput.value.length;
        statusInput.selectionEnd = statusInput.value.length;
      }
      return;
    }

    if (key === 'm') {
      event.preventDefault();
      openTab('media');
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      openTab('friends');
      return;
    }

    if (key === 'k') {
      event.preventDefault();
      openTab('feed');
      if (feedSearchInput instanceof HTMLInputElement) {
        feedSearchInput.focus();
        feedSearchInput.select();
      }
    }
  });
}

function observeStats() {
  const ids = ['statExp', 'statStreak', 'statTop3', 'followersCount', 'followingCount'];
  const targets = ids
    .map((id) => document.getElementById(id))
    .filter((el) => el instanceof HTMLElement);

  if (!targets.length) {
    updateMeters();
    return;
  }

  const observer = new MutationObserver(() => updateMeters());
  targets.forEach((el) => observer.observe(el, { childList: true, subtree: true, characterData: true }));

  updateMeters();
}

initMode();
initFeedView();
initJumpLinks();
initTemplates();
initTags();
initShortcuts();
observeStats();
