const body = document.body;
const modeToggle = document.getElementById('ptModeToggle');
const moreWrap = document.getElementById('ptMoreWrap');
const moreToggle = document.getElementById('ptMoreToggle');
const moreMenu = document.getElementById('ptMoreMenu');
const searchInput = document.getElementById('profileSearchInput');

const MODE_KEY = 'av_profile_test_compact';

function setCompactMode(next) {
  const enabled = !!next;
  body.classList.toggle('profile-test-compact', enabled);
  if (modeToggle) {
    modeToggle.textContent = enabled ? 'Modo expandido' : 'Modo compacto';
  }
  try {
    localStorage.setItem(MODE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

function setMoreOpen(open) {
  if (!moreWrap || !moreToggle || !moreMenu) return;
  const isOpen = !!open;
  moreWrap.classList.toggle('open', isOpen);
  moreToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  moreMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function wireCompactToggle() {
  if (!modeToggle || modeToggle.dataset.wired === '1') return;
  modeToggle.dataset.wired = '1';
  modeToggle.addEventListener('click', () => {
    const next = !body.classList.contains('profile-test-compact');
    setCompactMode(next);
  });

  try {
    const saved = localStorage.getItem(MODE_KEY) === '1';
    setCompactMode(saved);
  } catch {
    setCompactMode(false);
  }
}

function wireMoreMenu() {
  if (!moreWrap || !moreToggle || !moreMenu || moreWrap.dataset.wired === '1') return;
  moreWrap.dataset.wired = '1';

  moreToggle.addEventListener('click', (event) => {
    event.preventDefault();
    const next = !moreWrap.classList.contains('open');
    setMoreOpen(next);
  });

  document.addEventListener('click', (event) => {
    if (!moreWrap.classList.contains('open')) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (moreWrap.contains(target)) return;
    setMoreOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMoreOpen(false);
  });
}

function wireSearchShortcut() {
  if (!searchInput) return;
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/') return;
    const active = document.activeElement;
    const isTyping =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active?.getAttribute?.('contenteditable') === 'true';
    if (isTyping) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  });
}

wireCompactToggle();
wireMoreMenu();
wireSearchShortcut();
