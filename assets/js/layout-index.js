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
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#servicios">Servicios</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#extras">Extras</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#ebooks">Ebooks</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">Ver todo</a>
              </div>
            </div>

            <a class="btn-white-outline" id="btnContacto" href="#contact">💗 Contacto</a>

            <a class="btn-yellow" id="btnPanel" href="${hrefPanel}">🏠 Libreta</a>

            <a class="btn-yellow" id="btnLogin" href="${hrefLogin}" style="display:none;">🔐 Iniciar sesión</a>
            <button class="btn-red" id="btnLogout" type="button" style="display:none;">Cerrar sesión</button>
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </div>
    `;
  }

  function injectFooter() {
    let host = document.getElementById('appFooter');
    if (!host) {
      host = document.createElement('div');
      host.id = 'appFooter';
      document.body.insertAdjacentElement('beforeend', host);
    }

    host.innerHTML = `
      <footer class="site-footer">
        <div class="nav-line nav-line-above"></div>
        <div class="footer-inner container">
          <div class="footer-text">
            © 2026 AquiVivo. Todos los derechos reservados.<br />
            Te ayudo a perder el miedo a hablar. 🌸🤍
          </div>
        </div>
      </footer>
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
      e.stopPropagation();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', hash);
    });
  }

  function setupAnchorScroll() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;

      const hash = a.getAttribute('href') || '';
      if (!hash.startsWith('#')) return;

      const target = document.getElementById(hash.slice(1));
      if (!target) return;

      e.preventDefault();

      const header = document.querySelector('.nav-glass');
      const offset = header ? header.getBoundingClientRect().height + 8 : 0;
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      history.replaceState(null, '', hash);
    });
  }

  function setupCursosScroll() {
    const btn = document.getElementById('btnCursos');
    const target = document.getElementById('cursos');
    if (!btn || !target) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#cursos');
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
  injectFooter();
  setupDropdown();
  setupContactoScroll();
  setupAnchorScroll();
  setupCursosScroll();
  setupAuthButtons();
})();
