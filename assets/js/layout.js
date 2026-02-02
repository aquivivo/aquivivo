// assets/js/layout.js
// Shared header for ALL pages except index.html (index uses layout-index.js)
// ✅ Safe injection (doesn't replace body -> footers remain)
// ✅ Uses firebase-init.js (matches your project)
// ✅ Shows Login when signed out, Logout when signed in

import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

(function () {
  const path = (location.pathname || '').toLowerCase();
  const isIndex =
    path === '/' ||
    path.endsWith('/index') ||
    path.endsWith('/index.html') ||
    path.endsWith('index.html');
  if (isIndex) return; // index uses layout-index.js

  function ensureMount() {
    let mount = document.getElementById('appHeader');
    if (mount) return mount;

    mount = document.createElement('div');
    mount.id = 'appHeader';
    document.body.insertAdjacentElement('afterbegin', mount);
    return mount;
  }

  function buildHeader(user, isAdmin) {
    const logged = !!user;

    const hrefServicios = 'services.html';
    const hrefServiciosPlanes = 'services.html#planes';
    const hrefServiciosServicios = 'services.html#servicios';
    const hrefServiciosExtras = 'services.html#extras';
    const hrefServiciosEbooks = 'services.html#ebooks';

    // Keep it simple and stable on app pages
    return `
      <header class="topbar nav-glass">
        <div class="nav-inner container">
          <a class="brand" href="index.html" aria-label="AquiVivo">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions" aria-label="Navegación">
            ${
              logged && isAdmin
                ? `<a class="btn-yellow" href="esadmin.html">🛡️ Admin</a>`
                : ''
            }
            <div class="nav-dd" id="navServiciosDD">
              <button class="btn-white-outline nav-dd-btn nav-dd-toggle" id="btnServicios" type="button" aria-haspopup="menu" aria-expanded="false">
                🧳 Servicios <span class="nav-dd-caret">▼</span>
              </button>
              <div class="nav-dd-menu" id="menuServicios" role="menu" aria-label="Servicios">
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosPlanes}">Planes</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosServicios}">Servicios</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosExtras}">Extras</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosEbooks}">Ebooks</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">Ver todo</a>
              </div>
            </div>
            <a class="btn-white-outline" href="course.html">📚 Curso</a>
            <a class="btn-yellow" href="espanel.html">🏠 Panel</a>
            <button class="btn-white-outline" id="btnBack" type="button">⬅️ Atrás</button>
            ${
              logged
                ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>`
                : `<a class="btn-white-outline" href="login.html">🔐 Iniciar sesión</a>`
            }
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </header>
    `;
  }

  function wireHeader() {
    const dd = document.getElementById('navServiciosDD');
    const btnServicios = document.getElementById('btnServicios');
    const menuServicios = document.getElementById('menuServicios');
    if (dd && btnServicios && menuServicios && !dd.dataset.wired) {
      dd.dataset.wired = '1';

      function open() {
        dd.classList.add('open');
        btnServicios.setAttribute('aria-expanded', 'true');
      }
      function close() {
        dd.classList.remove('open');
        btnServicios.setAttribute('aria-expanded', 'false');
      }
      function toggle() {
        if (dd.classList.contains('open')) close();
        else open();
      }

      btnServicios.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });

      dd.addEventListener('mouseenter', () => open());
      dd.addEventListener('mouseleave', (e) => {
        if (!dd.contains(e.relatedTarget)) close();
      });

      document.addEventListener('click', (e) => {
        if (!dd.contains(e.target)) close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }

    const backBtn = document.getElementById('btnBack');
    if (backBtn && !backBtn.dataset.wired) {
      backBtn.dataset.wired = '1';
      backBtn.addEventListener('click', () => {
        if (history.length > 1) history.back();
        else location.href = 'index.html';
      });
    }

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn && !logoutBtn.dataset.wired) {
      logoutBtn.dataset.wired = '1';
      logoutBtn.addEventListener('click', async () => {
        try {
          await signOut(auth);
        } catch (e) {
          console.error('Logout error', e);
        }
        location.href = 'index.html';
      });
    }
  }

  const mount = ensureMount();

  // Render immediately + re-render on auth changes
  onAuthStateChanged(auth, async (user) => {
    let isAdmin = false;
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        isAdmin = String(data?.role || 'user') === 'admin';
      } catch (e) {
        console.warn('[layout] admin check failed', e);
      }
    }

    mount.innerHTML = buildHeader(user, isAdmin);
    wireHeader();
  });
})();
