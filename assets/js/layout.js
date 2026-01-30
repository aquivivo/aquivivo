import { auth } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

/**
 * layout.js (ONE for all pages)
 * - injects header into #appHeader
 * - handles logout (#btnLogout)
 * - guards protected pages (redirect to login.html?next=...)
 * - optional coffee float (assets/img/coffeeFloat.svg)
 */

function isPublicPage(page) {
  return page === 'login' || page === 'index';
}

function currentPage() {
  return (document.body && document.body.dataset && document.body.dataset.page) ? document.body.dataset.page : '';
}

function buildHeader() {
  const host = document.getElementById('appHeader');
  if (!host) return;

  const page = currentPage();
  const qs = new URLSearchParams(location.search);
  const level = (qs.get('level') || 'A1').toUpperCase();

  const showNav = true;
  const showBack = page !== 'index';
  const showLogout = !isPublicPage(page);

  const hrefInicio = 'index.html';
  const hrefPanel  = 'espanel.html';
  const hrefCourse = `course.html?level=${encodeURIComponent(level)}`;

  host.innerHTML = `
    <div class="nav-glass">
      <div class="nav-line"></div>
      <div class="nav-inner">
        <a class="brand" href="${hrefInicio}">
          <img src="assets/img/logo.png" alt="AquiVivo" />
        </a>
        ${showNav ? `
          <div class="nav-actions">
            <a class="btn-white-outline" href="${hrefCourse}">📚 Curso</a>
            <a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>
            <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
            ${showBack ? `<button class="btn-white-outline" id="btnAtras" type="button">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>` : ``}
          </div>
        ` : ``}
      </div>
    </div>
  `;

  const backBtn = document.getElementById('btnAtras');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const before = location.href;
      history.back();
      setTimeout(() => {
        if (location.href === before) location.href = hrefPanel;
      }, 300);
    });
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await signOut(auth); } catch (e) { console.error(e); }
      window.location.href = 'login.html';
    });
  }
}

function ensureCoffeeFloat() {
  // optional decorative element; safe if CSS hides it on mobile
  if (document.getElementById('coffeeFloat')) return;

  // show on all pages except login
  const page = currentPage();
  if (page === 'login') return;

  const el = document.createElement('div');
  el.id = 'coffeeFloat';
  el.innerHTML = `<img src="assets/img/coffeeFloat.svg" alt="" />`;
  document.body.appendChild(el);
}

function guardAuth() {
  const page = currentPage();

  // if dataset missing -> treat as protected (safer)
  const publicPage = isPublicPage(page);
  if (publicPage) return;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
      window.location.href = `login.html?next=${next}`;
    }
  });
}

(function initLayout(){
  // build immediately
  buildHeader();
  ensureCoffeeFloat();
  guardAuth();
})();
