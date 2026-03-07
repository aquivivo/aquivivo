import { auth } from './neu-firebase-init.js';
import { getNeuLoginPath, getNeuSocialAppPath, withNeuQuery } from './neu-paths.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

window.__NEU_LAYOUT_HANDLES_LOGOUT__ = true;

const body = document.body;
const headerMount = document.getElementById('appHeader');
const footerMount = document.getElementById('appFooter');
const isNeuLoginPage = body?.classList?.contains('neu-auth-page') === true;
const isNeuAppPage = body?.classList?.contains('neu-social-app') === true;
let profileGlobalsBound = false;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function currentPageHref() {
  return isNeuLoginPage ? getNeuLoginPath() : getNeuSocialAppPath();
}

function buildHeader(user) {
  const loggedIn = !!user;
  const displayName = displayNameFor(user);
  const handle = handleFor(user);
  const letter = avatarLetter(displayName);
  const currentHref = currentPageHref();
  const socialAppPath = getNeuSocialAppPath();
  const loginPath = getNeuLoginPath();
  const pulseHref = withNeuQuery(socialAppPath, { portal: 'pulse' });
  const profileHref = withNeuQuery(socialAppPath, { profile: 'me' });
  const navLinksHtml = isNeuAppPage
    ? ''
    : `
        <nav class="neu-shell-links" aria-label="Neu navigation">
          <a class="neu-shell-link" href="${socialAppPath}" ${currentHref === socialAppPath ? 'aria-current="page"' : ''}>Feed</a>
          <a class="neu-shell-link" href="${pulseHref}">Pulse</a>
          <a class="neu-shell-link" href="${profileHref}">Profile</a>
        </nav>
      `;

  return `
    <header class="neu-shell-header">
      <div class="neu-shell-bar container">
        <a class="neu-shell-brand" href="${socialAppPath}" aria-label="NEU">
          <span class="neu-shell-brand-mark">NEU</span>
          <span class="neu-shell-brand-sub">Social App</span>
        </a>

        ${navLinksHtml}

        <div class="neu-shell-actions">
          ${
            loggedIn
              ? `
                <div class="neu-shell-profile" id="navProfile">
                  <button id="navProfileToggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Open profile menu">
                    <span>${esc(letter)}</span>
                  </button>
                  <div id="navProfileMenu" role="menu" hidden>
                    <div class="neu-shell-menu-head">
                      <div class="nav-avatar"><span>${esc(letter)}</span></div>
                      <div>
                        <div class="nav-profile-name">${esc(displayName)}</div>
                        <div class="nav-profile-handle">${esc(handle)}</div>
                      </div>
                    </div>
                    <div class="neu-shell-menu-list">
                      <a class="neu-shell-menu-item" href="${profileHref}" role="menuitem">My profile</a>
                      <a class="neu-shell-menu-item" href="${pulseHref}" role="menuitem">Messages</a>
                      <button class="neu-shell-menu-item neu-shell-menu-item--danger" id="navProfileLogout" type="button">Cerrar sesion</button>
                    </div>
                  </div>
                </div>
              `
              : `
                <a class="btn-white-outline" href="${loginPath}">Entrar</a>
              `
          }
        </div>
      </div>
    </header>
  `;
}

function buildFooter() {
  return `
    <footer class="neu-shell-footer">
      <div class="neu-shell-footer-inner container">
        <div class="neu-shell-footer-copy">NEU runs as an independent app shell inside this repo.</div>
        <div class="neu-shell-footer-badge">NEU only</div>
      </div>
    </footer>
  `;
}

function closeProfileMenu() {
  const toggle = document.getElementById('navProfileToggle');
  const menu = document.getElementById('navProfileMenu');
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
  toggle.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
}

function openProfileMenu() {
  const toggle = document.getElementById('navProfileToggle');
  const menu = document.getElementById('navProfileMenu');
  if (!(toggle instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
  toggle.setAttribute('aria-expanded', 'true');
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

function render(user) {
  if (headerMount) headerMount.innerHTML = buildHeader(user);
  if (footerMount) footerMount.innerHTML = buildFooter();
  wireHeaderInteractions();
  wireLogout();
}

function init() {
  render(auth.currentUser || null);
  onAuthStateChanged(auth, (user) => {
    render(user || null);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
