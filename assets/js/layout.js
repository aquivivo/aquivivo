import { auth } from './firebase-init.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

(function () {
  const protectedPages = new Set([
    'course.html',
    'espanel.html',
    'lessonpage.html',
    'lessonadmin.html',
    'lesson.html',
    'ejercicio.html',
    'ejercicioadmin.html',
    'esadmin.html',
  ]);

  function fileName() {
    const p = (location.pathname || '').split('/').pop();
    return p || 'index.html';
  }

  function ensureCoffee() {
    if (document.getElementById('coffeeFloat')) return;
    const div = document.createElement('div');
    div.id = 'coffeeFloat';
    div.innerHTML = '<img src="assets/img/coffeeFloat.svg" alt="" />';
    document.body.appendChild(div);
  }

  function buildHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const page = document.body?.dataset?.page || '';
    const qs = new URLSearchParams(location.search);
    const level = (qs.get('level') || 'A1').toUpperCase();

    const showPanel = page !== 'login';
    const showCourse = page !== 'login';
    const showBack = page !== 'index' && page !== 'login';
    const showLogout = page !== 'login' && page !== 'index';

    const hrefInicio = 'index.html';
    const hrefPanel = 'espanel.html';
    const hrefCourse = `course.html?level=${encodeURIComponent(level)}`;

    host.innerHTML = `
      <div class="nav-glass">
        <div class="nav-line"></div>
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>
          <div class="nav-actions">
            ${showCourse ? `<a class="btn-white-outline" href="${hrefCourse}">📚 Curso</a>` : ``}
            ${showPanel ? `<a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>` : ``}
            <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
            ${showBack ? `<button class="btn-white-outline" id="btnAtras" type="button">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>` : ``}
          </div>
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
        try {
          await signOut(auth);
        } catch (e) {
          console.error(e);
        }
        window.location.href = 'login.html';
      });
    }

    // coffee (optional; hidden on mobile by CSS)
    if (page !== 'login') ensureCoffee();
  }

  function guardAuth() {
    const current = fileName();
    if (!protectedPages.has(current)) return;

    onAuthStateChanged(auth, (user) => {
      if (user) return;
      const next = encodeURIComponent(current + location.search + location.hash);
      window.location.replace(`login.html?next=${next}`);
    });
  }

  function init() {
    buildHeader();
    guardAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
