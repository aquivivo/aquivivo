import { auth } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

(function () {
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function smoothScrollTo(targetY, duration = 900) {
    const startY = window.pageYOffset;
    const diff = targetY - startY;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      window.scrollTo(0, startY + diff * eased);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function injectHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const hrefInicio = 'index.html';
    const hrefServicios = 'services.html';
    const hrefPolaco = '#metodo-disenado-para-ti';
    const hrefTramites = '#mas-que-clases';
    const hrefPanel = 'espanel.html';
    const hrefLogin = 'login.html';

    host.innerHTML = `
      <div class="nav-glass nav-index">
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}" aria-label="AquiVivo">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions">
            <a class="btn-white-outline" id="btnPolaco" href="${hrefPolaco}">POLACO</a>
            <div class="nav-dd" id="navServiciosDD">
              <button class="btn-white-outline nav-dd-btn" id="btnServicios" type="button" aria-haspopup="menu" aria-expanded="false">
                &#x1F9F3; Servicios <span class="nav-dd-caret">&#9660;</span>
              </button>
              <div class="nav-dd-menu" id="menuServicios" role="menu" aria-label="Servicios">
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#planes">Planes</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#servicios">Servicios</a>
                <a role="menuitem" class="nav-dd-item nav-dd-item--red" id="btnTramites" href="${hrefTramites}">Tr&aacute;mites</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#extras">Extras</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServicios}#ebooks">Ebooks</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">Ver todo</a>
              </div>
            </div>

            <a class="btn-white-outline" id="btnContacto" href="#appFooter">&#x1F495; Contacto</a>

            <a class="btn-white-outline" id="btnPanel" href="${hrefPanel}">&#x1F3E0; Libreta</a>

            <a class="btn-yellow" id="btnLogin" href="${hrefLogin}" style="display:none;">&#x1F510; Iniciar sesi&oacute;n</a>
            <button class="btn-red" id="btnLogout" type="button" style="display:none;">Cerrar sesi&oacute;n</button>
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
            &copy; 2026 AquiVivo. Todos los derechos reservados.<br />
            Te ayudo a perder el miedo a hablar. &#x1F338;&#x1F90D;
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
      menu.style.display = 'block';
    }
    function close() {
      dd.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      menu.style.display = 'none';
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
      const footer = document.getElementById('appFooter');
      if (footer) {
        e.preventDefault();
        e.stopPropagation();
        const header = document.querySelector('.nav-glass');
        const offset = (header ? header.getBoundingClientRect().height : 0) + 12;
        footer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          window.scrollBy({ top: -offset, behavior: 'auto' });
        }, 0);
        history.replaceState(null, '', '#appFooter');
        return;
      }

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

  function setupPolacoScroll() {
    const link = document.getElementById('btnPolaco');
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

  function setupTramitesScroll() {
    const id = 'mas-que-clases';

    function adjustScroll() {
      const target = document.getElementById(id);
      if (!target) {
        return;
      }

      const header = document.querySelector('.nav-glass');
      const offset = (header ? header.getBoundingClientRect().height : 0) + 32;
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      setTimeout(() => {
        window.scrollTo({ top, behavior: 'auto' });
      }, 500);
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash === `#${id}`) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            adjustScroll();
          });
        });
      }
    });
    if (window.location.hash === `#${id}`) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          adjustScroll();
        });
      });
    }
  }

  function setupAnchorScroll() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;

      const hash = a.getAttribute('href') || '';
      if (!hash.startsWith('#')) return;
      if (hash === '#mas-que-clases') return;

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
  setupPolacoScroll();
  setupTramitesScroll();
  setupAnchorScroll();
  setupCursosScroll();
  setupAuthButtons();
})();
