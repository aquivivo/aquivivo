import { auth } from './firebase-init.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

(function () {
  function buildHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const page = document.body?.dataset?.page || '';
    const qs = new URLSearchParams(location.search);
    const level = (qs.get('level') || 'A1').toUpperCase();

    const showPanel = page !== 'login';
    const showCourse = page !== 'login';
    const showBack = page !== 'index';
    const showLogout = page !== 'login' && page !== 'index';

    const hrefInicio = 'index.html';
    const hrefPanel = 'espanel.html';
    const hrefCourse = `course.html?level=${encodeURIComponent(level)}`;

    host.innerHTML = `
      <div class="nav-glass">
        <div class="nav-line"></div>
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}">
            <img src="assets/img/logo.png" />
          </a>
          <div class="nav-actions">
            ${showCourse ? `<a class="btn-white-outline" href="${hrefCourse}">📚 Curso</a>` : ``}
            ${showPanel ? `<a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>` : ``}
            <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
            ${showBack ? `<button class="btn-white-outline" id="btnAtras">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout">Cerrar sesión</button>` : ``}
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildHeader);
  } else {
    buildHeader();
  }
})();
