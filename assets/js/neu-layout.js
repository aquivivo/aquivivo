import { auth, db } from './neu-firebase-init.js';
import { getNeuLoginPath, getNeuSocialAppPath, withNeuQuery } from './neu-paths.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

window.__NEU_LAYOUT_HANDLES_LOGOUT__ = true;

let headerMount = document.getElementById('appHeader');
let footerMount = document.getElementById('appFooter');
let profileGlobalsBound = false;
let headerBadgeBridgeBound = false;
let notificationBadgeObserver = null;
const headerBadgeState = {
  messages: 0,
  notifications: 0,
};
const PUBLIC_MARKETING_PAGES = new Set([
  'index',
  'services',
  'ayuda',
  'contacto',
  'privacy',
  'terms',
  'returns',
]);
const PAGE_ALIASES = {
  kontakt: 'contacto',
  'polityka-prywatnosci': 'privacy',
  regulamin: 'terms',
  zwroty: 'returns',
};
const NEU_USERS_COLLECTION = 'neuUsers';
const headerProfileSnapshot = {
  uid: '',
  avatarUrl: '',
  displayName: '',
  handle: '',
};
const headerProfileCache = new Map();
let headerProfileFetchToken = 0;

function isNeuLoginPage() {
  return document.body?.classList?.contains('neu-auth-page') === true;
}

function pageFromPathname() {
  const raw = String(location.pathname || '').trim().toLowerCase();
  const file = raw.split('/').pop() || '';
  if (!file) return '';
  return file.replace(/\.html$/, '');
}

function normalizePageKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return PAGE_ALIASES[key] || key;
}

function currentPageKey() {
  const fromDataset = normalizePageKey(document.body?.dataset?.page || '');
  if (fromDataset) return fromDataset;
  const fromPath = normalizePageKey(pageFromPathname());
  if (fromPath) return fromPath;
  return '';
}

function isPublicMarketingPage() {
  return PUBLIC_MARKETING_PAGES.has(currentPageKey());
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureLayoutMount(id, position = 'append') {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLElement) return existing;

  const body = document.body;
  if (!(body instanceof HTMLElement)) return null;

  const mount = document.createElement('div');
  mount.id = id;

  if (position === 'prepend') {
    body.prepend(mount);
  } else {
    body.append(mount);
  }

  return mount;
}

function ensureLayoutMounts() {
  headerMount = ensureLayoutMount('appHeader', 'prepend');
  footerMount = ensureLayoutMount('appFooter', 'append');
}

function avatarLetter(label) {
  const text = String(label || '').trim();
  return text ? text.charAt(0).toUpperCase() : 'N';
}

function displayNameFor(user) {
  const direct = String(user?.displayName || '').trim();
  if (direct) return direct;
  const email = String(user?.email || '').trim();
  if (email && email.includes('@')) return email.split('@')[0];
  return 'Neu User';
}

function handleFor(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return '@neu';
  const raw = email.split('@')[0];
  const safe = raw.replace(/[^a-z0-9._-]/g, '').slice(0, 24);
  return safe ? `@${safe}` : '@neu';
}

function photoUrlFor(user) {
  return String(user?.photoURL || '').trim();
}

function normalizeProfileHandle(value, fallback = '') {
  const raw = String(value || '').trim();
  if (raw) return raw.startsWith('@') ? raw : `@${raw}`;
  const fallbackRaw = String(fallback || '').trim();
  if (!fallbackRaw) return '';
  return fallbackRaw.startsWith('@') ? fallbackRaw : `@${fallbackRaw}`;
}

function resetHeaderProfileSnapshot() {
  const hadAnyValue =
    !!headerProfileSnapshot.uid ||
    !!headerProfileSnapshot.avatarUrl ||
    !!headerProfileSnapshot.displayName ||
    !!headerProfileSnapshot.handle;

  headerProfileSnapshot.uid = '';
  headerProfileSnapshot.avatarUrl = '';
  headerProfileSnapshot.displayName = '';
  headerProfileSnapshot.handle = '';
  return hadAnyValue;
}

function applyHeaderProfileSnapshot(user, profileData) {
  const uid = String(user?.uid || '').trim();
  if (!uid) return false;

  const nextAvatar = String(
    profileData?.avatarUrl ||
    profileData?.avatarURL ||
    profileData?.photoURL ||
    profileData?.photoUrl ||
    profileData?.avatar ||
    '',
  ).trim();
  const nextDisplayName = String(profileData?.displayName || profileData?.name || '').trim();
  const nextHandle = normalizeProfileHandle(profileData?.handle || profileData?.username || '');

  const changed =
    headerProfileSnapshot.uid !== uid ||
    headerProfileSnapshot.avatarUrl !== nextAvatar ||
    headerProfileSnapshot.displayName !== nextDisplayName ||
    headerProfileSnapshot.handle !== nextHandle;

  if (!changed) return false;

  headerProfileSnapshot.uid = uid;
  headerProfileSnapshot.avatarUrl = nextAvatar;
  headerProfileSnapshot.displayName = nextDisplayName;
  headerProfileSnapshot.handle = nextHandle;
  return true;
}

async function readHeaderProfileSnapshot(user) {
  const uid = String(user?.uid || '').trim();
  if (!uid) return null;
  if (headerProfileCache.has(uid)) return headerProfileCache.get(uid);

  try {
    const profileSnap = await getDoc(doc(db, NEU_USERS_COLLECTION, uid));
    if (!profileSnap.exists()) {
      headerProfileCache.set(uid, null);
      return null;
    }

    const data = profileSnap.data() || null;
    headerProfileCache.set(uid, data);
    return data;
  } catch (error) {
    console.warn('[neu-layout] profile snapshot fetch failed', error);
    return null;
  }
}

async function syncHeaderProfile(user) {
  const uid = String(user?.uid || '').trim();
  if (!uid) return;

  const token = ++headerProfileFetchToken;
  const profileData = await readHeaderProfileSnapshot(user);
  if (token !== headerProfileFetchToken) return;

  const changed = applyHeaderProfileSnapshot(user, profileData);
  if (changed) render(user);
}

function safeBadgeCount(value) {
  return Math.max(0, Number(value || 0) || 0);
}

function badgeLabel(value) {
  const count = safeBadgeCount(value);
  if (!count) return '';
  return count > 99 ? '99+' : String(count);
}

function buildHeaderBadge(kind, count, ariaLabel) {
  const total = safeBadgeCount(count);
  const label = badgeLabel(total);
  const hiddenAttr = total > 0 ? '' : ' hidden aria-hidden="true"';
  const ariaAttr = total > 0 ? ` aria-label="${esc(`${ariaLabel}: ${total}`)}"` : '';
  return `<span class="neu-shell-icon-badge" data-neu-header-badge="${esc(kind)}"${hiddenAttr}${ariaAttr}>${esc(label)}</span>`;
}

function currentRoute() {
  const params = new URLSearchParams(location.search);
  return {
    portal: String(params.get('portal') || 'feed').trim().toLowerCase() || 'feed',
    profile: String(params.get('profile') || '').trim().toLowerCase(),
    hash: String(location.hash || '').trim().replace(/^#/, '').toLowerCase(),
  };
}

function appHref(params = {}) {
  return withNeuQuery(getNeuSocialAppPath(), params);
}

function isRouteActive({ portal = '', profile = '' } = {}) {
  if (isNeuLoginPage()) return false;
  const route = currentRoute();
  const targetPortal = String(portal || '').trim().toLowerCase();
  const targetProfile = String(profile || '').trim().toLowerCase();

  if (targetProfile) {
    return route.profile === targetProfile;
  }

  if (!targetPortal) {
    return route.portal === 'feed' && !route.profile;
  }

  return route.portal === targetPortal && !route.profile;
}

function activeAttr(active) {
  return active ? 'aria-current="page"' : '';
}

function isPulseMessagesActive() {
  const route = currentRoute();
  return route.portal === 'pulse' && route.hash !== 'pulsenotifications';
}

function isPulseNotificationsActive() {
  const route = currentRoute();
  return route.portal === 'pulse' && route.hash === 'pulsenotifications';
}

function buildHeader(user) {
  const loggedIn = !!user;
  const pageKey = currentPageKey();
  const uid = String(user?.uid || '').trim();
  const hasProfileSnapshot = !!uid && headerProfileSnapshot.uid === uid;
  const displayName = hasProfileSnapshot && headerProfileSnapshot.displayName
    ? headerProfileSnapshot.displayName
    : displayNameFor(user);
  const handle = hasProfileSnapshot && headerProfileSnapshot.handle
    ? normalizeProfileHandle(headerProfileSnapshot.handle)
    : handleFor(user);
  const letter = avatarLetter(displayName);
  const photoUrl = hasProfileSnapshot && headerProfileSnapshot.avatarUrl
    ? headerProfileSnapshot.avatarUrl
    : photoUrlFor(user);
  const loginPath = getNeuLoginPath();
  const feedHref = appHref({ portal: 'feed' });
  const pulseHref = appHref({ portal: 'pulse' });
  const pulseMessagesHref = `${pulseHref}#neuInboxList`;
  const pulseNotificationsHref = `${pulseHref}#pulseNotifications`;
  const profileHref = appHref({ profile: 'me' });
  const networkHref = appHref({ portal: 'network' });
  const storiesHref = appHref({ portal: 'stories' });
  const reelsHref = appHref({ portal: 'reels' });
  const publicHomeHref = '/app/index.html';

  if (isPublicMarketingPage() && !loggedIn) {
    const isHome = pageKey === 'index';
    return `
      <header class="topbar nav-glass neu-shell-header">
        <div class="nav-inner container">
          <a class="brand neu-brand" href="${publicHomeHref}" aria-label="NEU Social App">
            <img src="assets/img/logo.png" alt="AquiVivo" />
            <span class="neu-brand-copy">
              <strong>NEU</strong>
              <small>Social App</small>
            </span>
          </a>

          <div class="nav-actions" aria-label="Public navigation">
            <a class="btn-white-outline" href="${publicHomeHref}" ${activeAttr(isHome)}>Inicio</a>
            <a class="btn-yellow" href="${loginPath}">Iniciar sesion</a>
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </header>
    `;
  }

  if (isNeuLoginPage()) {
    return `
      <header class="topbar nav-glass neu-shell-header">
        <div class="nav-inner container">
          <a class="brand neu-brand" href="${publicHomeHref}" aria-label="NEU Social App">
            <img src="assets/img/logo.png" alt="AquiVivo" />
            <span class="neu-brand-copy">
              <strong>NEU</strong>
              <small>Social App</small>
            </span>
          </a>

          <div class="nav-actions" aria-label="Neu navigation">
            <a class="btn-white-outline" href="${feedHref}">Inicio</a>
            <a class="btn-yellow" href="${loginPath}" ${activeAttr(true)}>Iniciar sesion</a>
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </header>
    `;
  }

  return `
    <header class="topbar nav-glass neu-shell-header">
      <div class="nav-inner container">
        <a class="brand neu-brand" href="${publicHomeHref}" aria-label="NEU Social App">
          <img src="assets/img/logo.png" alt="AquiVivo" />
          <span class="neu-brand-copy">
            <strong>NEU</strong>
            <small>Social App</small>
          </span>
        </a>

        <div class="nav-actions" aria-label="Neu navigation">
          <div class="nav-icon-wrap">
            <a
              class="nav-icon-btn${isPulseNotificationsActive() ? ' is-active' : ''}"
              href="${pulseNotificationsHref}"
              ${activeAttr(isPulseNotificationsActive())}
              aria-label="Powiadomienia"
              title="Powiadomienia"
            >
              <span aria-hidden="true">&#x1F514;</span>
            </a>
            ${buildHeaderBadge('notifications', headerBadgeState.notifications, 'Powiadomienia')}
          </div>
          <div class="nav-icon-wrap">
            <a
              class="nav-icon-btn${isPulseMessagesActive() ? ' is-active' : ''}"
              href="${pulseMessagesHref}"
              ${activeAttr(isPulseMessagesActive())}
              aria-label="Wiadomosci"
              title="Wiadomosci"
            >
              <span aria-hidden="true">&#x1F4AC;</span>
            </a>
            ${buildHeaderBadge('messages', headerBadgeState.messages, 'Wiadomosci')}
          </div>
          ${
            loggedIn
              ? `
                <div class="nav-profile neu-shell-profile" id="navProfile">
                  <button id="navProfileToggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Open profile menu">
                    ${
                      photoUrl
                        ? `<img src="${esc(photoUrl)}" alt="${esc(displayName)}" />`
                        : `<span>${esc(letter)}</span>`
                    }
                  </button>
                  <div class="nav-profile-menu" id="navProfileMenu" role="menu" hidden>
                    <div class="nav-profile-head">
                      <div class="nav-avatar nav-avatar--small ${photoUrl ? 'nav-avatar--img' : ''}">
                        ${photoUrl ? `<img src="${esc(photoUrl)}" alt="${esc(displayName)}" />` : ''}
                        <span>${esc(letter)}</span>
                      </div>
                      <div>
                        <div class="nav-profile-name">${esc(displayName)}</div>
                        <div class="nav-profile-handle">${esc(handle)}</div>
                      </div>
                    </div>
                    <div class="nav-profile-list">
                      <a class="nav-profile-item" href="${feedHref}" role="menuitem"><span aria-hidden="true">&#x1F3E0;</span><span>Inicio</span></a>
                      <a class="nav-profile-item" href="${profileHref}" role="menuitem"><span aria-hidden="true">&#x1F464;</span><span>Mi perfil</span></a>
                      <a class="nav-profile-item" href="${pulseMessagesHref}" role="menuitem"><span aria-hidden="true">&#x1F4AC;</span><span>Mensajes</span></a>
                      <a class="nav-profile-item" href="${pulseNotificationsHref}" role="menuitem"><span aria-hidden="true">&#x1F514;</span><span>Powiadomienia</span></a>
                      <a class="nav-profile-item" href="${networkHref}" role="menuitem"><span aria-hidden="true">&#x1F91D;</span><span>Red</span></a>
                      <a class="nav-profile-item" href="${storiesHref}" role="menuitem"><span aria-hidden="true">&#x1F4F8;</span><span>Stories</span></a>
                      <a class="nav-profile-item" href="${reelsHref}" role="menuitem"><span aria-hidden="true">&#x1F3AC;</span><span>Reels</span></a>
                      <div class="nav-profile-sep" aria-hidden="true"></div>
                      <button class="nav-profile-item nav-profile-item--danger" id="navProfileLogout" type="button">Cerrar sesion</button>
                    </div>
                  </div>
                </div>
              `
              : `
                <a class="btn-yellow" href="${loginPath}">Entrar</a>
              `
          }
        </div>

      </div>

      <div class="nav-line nav-line-below"></div>
    </header>
  `;
}

function buildFooter() {
  const feedHref = appHref({ portal: 'feed' });
  const pulseHref = appHref({ portal: 'pulse' });
  const networkHref = appHref({ portal: 'network' });
  const profileHref = appHref({ profile: 'me' });
  return `
    <footer class="site-footer neu-shell-footer">
      <div class="nav-line nav-line-above"></div>
      <div class="footer-inner container">
        <div class="footer-left">&copy; 2026 AquiVivo / NEU</div>
        <div class="footer-center">Conecta, comparte y conversa en un solo lugar.</div>
        <nav class="footer-nav" aria-label="Enlaces de la app">
          <a href="${feedHref}">Feed</a>
          <a href="${pulseHref}">Pulse</a>
          <a href="${networkHref}">Red</a>
          <a href="${profileHref}">Perfil</a>
        </nav>
      </div>
    </footer>
  `;
}

function closeProfileMenu() {
  const wrapper = document.getElementById('navProfile');
  const toggle = document.getElementById('navProfileToggle');
  const menu = document.getElementById('navProfileMenu');
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
  toggle.setAttribute('aria-expanded', 'false');
  if (wrapper instanceof HTMLElement) wrapper.classList.remove('open');
  menu.hidden = true;
}

function openProfileMenu() {
  const wrapper = document.getElementById('navProfile');
  const toggle = document.getElementById('navProfileToggle');
  const menu = document.getElementById('navProfileMenu');
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
  toggle.setAttribute('aria-expanded', 'true');
  if (wrapper instanceof HTMLElement) wrapper.classList.add('open');
  menu.hidden = false;
}

function wireHeaderInteractions() {
  const toggle = document.getElementById('navProfileToggle');
  const menu = document.getElementById('navProfileMenu');
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
  if (toggle.dataset.wired === '1') return;
  toggle.dataset.wired = '1';

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) closeProfileMenu();
    else openProfileMenu();
  });

  if (!profileGlobalsBound) {
    profileGlobalsBound = true;

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#navProfile')) return;
      closeProfileMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeProfileMenu();
    });
  }
}

function wireLogout() {
  const logoutButton = document.getElementById('navProfileLogout');
  if (!(logoutButton instanceof HTMLButtonElement)) return;
  if (logoutButton.dataset.wired === '1') return;
  logoutButton.dataset.wired = '1';

  logoutButton.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await signOut(auth);
      location.href = getNeuLoginPath();
    } catch (error) {
      console.error('[neu-layout] signOut failed', error);
      window.alert('No se pudo cerrar sesion. Intenta de nuevo.');
    }
  });
}

function syncHeaderBadgeDom(kind) {
  const badge = document.querySelector(`[data-neu-header-badge="${kind}"]`);
  if (!(badge instanceof HTMLElement)) return;

  const total = safeBadgeCount(headerBadgeState[kind]);
  const label = badgeLabel(total);
  if (!total) {
    badge.hidden = true;
    badge.textContent = '';
    badge.setAttribute('aria-hidden', 'true');
    badge.removeAttribute('aria-label');
    return;
  }

  const ariaBase = kind === 'notifications' ? 'Powiadomienia' : 'Wiadomosci';
  badge.hidden = false;
  badge.textContent = label;
  badge.removeAttribute('aria-hidden');
  badge.setAttribute('aria-label', `${ariaBase}: ${total}`);
}

function syncHeaderBadges() {
  syncHeaderBadgeDom('messages');
  syncHeaderBadgeDom('notifications');
}

function setHeaderBadge(kind, count) {
  if (!(kind in headerBadgeState)) return;
  headerBadgeState[kind] = safeBadgeCount(count);
  syncHeaderBadgeDom(kind);
}

function countNotificationItems(container) {
  if (!(container instanceof HTMLElement)) return 0;

  const unreadSelectors = [
    '[data-notification-unread="1"]',
    '[data-unread="1"]',
    '[aria-unread="true"]',
    '.is-unread',
  ];
  const unreadMatches = container.querySelectorAll(unreadSelectors.join(',')).length;
  if (unreadMatches > 0) return unreadMatches;

  return Array.from(container.children).filter((node) => {
    return (
      node instanceof HTMLElement &&
      !node.hidden &&
      !node.classList.contains('hidden')
    );
  }).length;
}

function syncNotificationBadgeFromDom() {
  const container = document.getElementById('pulseNotifications');
  setHeaderBadge('notifications', countNotificationItems(container));
}

function wireNotificationBadgeObserver() {
  const container = document.getElementById('pulseNotifications');
  if (!(container instanceof HTMLElement)) {
    if (notificationBadgeObserver) {
      notificationBadgeObserver.disconnect();
      notificationBadgeObserver = null;
    }
    setHeaderBadge('notifications', 0);
    return;
  }

  syncNotificationBadgeFromDom();

  if (notificationBadgeObserver) {
    notificationBadgeObserver.disconnect();
  }

  notificationBadgeObserver = new MutationObserver(() => {
    syncNotificationBadgeFromDom();
  });
  notificationBadgeObserver.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'data-unread', 'data-notification-unread', 'aria-unread'],
  });
}

function wireHeaderBadgeBridge() {
  if (headerBadgeBridgeBound) return;
  headerBadgeBridgeBound = true;

  window.__neuHeaderBadges = {
    setMessages(count) {
      setHeaderBadge('messages', count);
    },
    setNotifications(count) {
      setHeaderBadge('notifications', count);
    },
    getState() {
      return { ...headerBadgeState };
    },
    syncNotificationsFromDom() {
      syncNotificationBadgeFromDom();
    },
  };

  window.addEventListener('neu:header-badge', (event) => {
    const kind = String(event?.detail?.kind || '').trim().toLowerCase();
    const count = event?.detail?.count;
    if (!kind) return;
    setHeaderBadge(kind, count);
  });
}

function render(user) {
  ensureLayoutMounts();
  if (headerMount) headerMount.innerHTML = buildHeader(user);
  if (footerMount) footerMount.innerHTML = buildFooter();
  syncHeaderBadges();
  wireHeaderInteractions();
  wireLogout();
  wireHeaderBadgeBridge();
  wireNotificationBadgeObserver();
}

function init() {
  const initialUser = auth.currentUser || null;
  if (!initialUser) {
    resetHeaderProfileSnapshot();
  } else if (headerProfileSnapshot.uid && headerProfileSnapshot.uid !== String(initialUser.uid || '').trim()) {
    resetHeaderProfileSnapshot();
  }
  render(initialUser);
  if (initialUser) {
    void syncHeaderProfile(initialUser);
  }

  onAuthStateChanged(auth, (user) => {
    const authUser = user || null;
    if (!authUser) {
      headerProfileFetchToken += 1;
      resetHeaderProfileSnapshot();
      render(null);
      return;
    }

    if (headerProfileSnapshot.uid && headerProfileSnapshot.uid !== String(authUser.uid || '').trim()) {
      resetHeaderProfileSnapshot();
    }

    render(authUser);
    void syncHeaderProfile(authUser);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
