import { auth } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

(function () {
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function injectHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const hrefInicio = 'index.html';
    const hrefServicios = 'services.html';
    const hrefPanel = 'espanel.html';
    const hrefLogin = 'login.html';

    host.innerHTML = `
      <div class="nav-glass nav-index">
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}" aria-label="AquiVivo">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions">
            <div class="nav-dd" id="navServiciosDD">
              <button class="btn-white-outline nav-dd-btn" id="btnServicios" type="button" aria-haspopup="menu" aria-expanded="false">
                🧳 Servicios <span class="nav-dd-caret">▼</span>
              </button>
              <div class="nav-dd-menu" id="menuServicios" role="menu" aria-label="Servicios">
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#planes">Planes</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#consultas">Consultas</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#extras">Extras</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">Ver todo</a>
              </div>
            </div>

            <a class="btn-white-outline" id="btnContacto" href="#contact">💗 Contacto</a>

            <a class="btn-yellow" id="btnPanel" href="${hrefPanel}">🏠 Ir al Panel</a>

            <a class="btn-yellow" id="btnLogin" href="${hrefLogin}" style="display:none;">🔐 Iniciar sesión</a>
            <button class="btn-red" id="btnLogout" type="button" style="display:none;">Cerrar sesión</button>
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </div>
    `;
  }

  function setupDropdown() {
    const dd = document.getElementById('navServiciosDD');
    const btn = document.getElementById('btnServicios');
    const menu = document.getElementById('menuServicios');
    if (!dd || !btn || !menu) return;

    function open() {
      dd.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      dd.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
      if (dd.classList.contains('open')) close();
      else open();
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    dd.addEventListener('mouseenter', () => open());
    dd.addEventListener('mouseleave', (e) => {
      // only close if the pointer truly left the dropdown (not when moving into the menu)
      if (!dd.contains(e.relatedTarget)) close();
    });

    document.addEventListener('click', (e) => {
      if (!dd.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function setupContactoScroll() {
    const link = document.getElementById('btnContacto');
    if (!link) return;

    link.addEventListener('click', (e) => {
      const hash = link.getAttribute('href') || '';
      if (!hash.startsWith('#')) return;

      const target = document.getElementById(hash.slice(1));
      if (!target) return;

      e.preventDefault();

      // offset = header height
      const header = document.querySelector('.nav-glass');
      const offset = header ? header.getBoundingClientRect().height : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset - 10;

      window.scrollTo({ top, behavior: 'smooth' });
      history.replaceState(null, '', hash);
    });
  }

  function setupAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const btnPanel = document.getElementById('btnPanel');
    if (!btnLogin || !btnLogout || !btnPanel) return;

    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } finally {
        location.href = 'index.html';
      }
    });

    onAuthStateChanged(auth, (user) => {
      const loggedIn = !!user && user.emailVerified;

      // On index: if logged in -> show Panel + Logout
      // If not -> show Login + Panel (Panel can still go to login via guard)
      if (loggedIn) {
        btnLogin.style.display = 'none';
        btnLogout.style.display = '';
        btnPanel.style.display = '';
      } else {
        btnLogin.style.display = '';
        btnLogout.style.display = 'none';
        btnPanel.style.display = '';
      }
    });
  }

  injectHeader();
  setupDropdown();
  setupContactoScroll();
  setupAuthButtons();
})();
