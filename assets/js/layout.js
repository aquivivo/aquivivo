import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

(function () {
  const ADMIN_HREF = 'esadmin.html';

  function pageId() {
    return document.body?.dataset?.page || '';
  }

  function qsLevel() {
    const qs = new URLSearchParams(location.search);
    return (qs.get('level') || 'A1').toUpperCase();
  }

  function getNextParam() {
    try {
      const qs = new URLSearchParams(location.search);
      const next = qs.get('next');
      if (!next) return '';
      if (next.startsWith('http://') || next.startsWith('https://')) return '';
      if (next.includes('..')) return '';
      return next;
    } catch {
      return '';
    }
  }

  function redirect(to) {
    const cur = location.pathname.split('/').pop();
    if (cur === to) return;
    location.href = to;
  }

  function injectHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const page = pageId();
    const level = qsLevel();

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
            <span id="navAdminSlot"></span>
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
        location.href = 'login.html';
      });
    }
  }

  function requireAuthForPage() {
    const p = pageId();
    return p !== 'login' && p !== 'index' && p !== '';
  }

  function isAdminPage() {
    const p = pageId();
    return (
      p === 'esadmin' ||
      p === 'admin-select' ||
      p === 'lessonadmin' ||
      p === 'ejercicioadmin' ||
      p === 'lesson'
    );
  }

  function guardToLogin(reason) {
    const next = location.pathname.split('/').pop() + location.search;
    const url =
      'login.html?next=' +
      encodeURIComponent(next) +
      (reason ? '&reason=' + encodeURIComponent(reason) : '');
    location.href = url;
  }

  function enforceEmailVerification(user) {
    const p = pageId();
    const allowed = p === 'login' || p === 'index' || p === '';
    if (user && !user.emailVerified && !allowed) {
      guardToLogin('verify');
      return false;
    }
    return true;
  }

  async function setAdminButton(uid) {
    const slot = document.getElementById('navAdminSlot');
    if (!slot) return;

    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.exists() ? snap.data() : null;
      if (data?.admin) {
        slot.innerHTML = `<a class="btn-yellow" href="${ADMIN_HREF}">🛡️ Admin</a>`;
      } else {
        slot.innerHTML = ``;
      }
    } catch (e) {
      console.error('layout.js: cannot read users doc', e);
      slot.innerHTML = ``;
    }
  }

  async function ensureAdminOrRedirect(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.exists() ? snap.data() : null;
      if (!data?.admin) location.href = 'espanel.html';
    } catch {
      location.href = 'espanel.html';
    }
  }

  function boot() {
    injectHeader();

    onAuthStateChanged(auth, async (user) => {
      const p = pageId();

      // Pages that require auth
      if (requireAuthForPage() && !user) {
        guardToLogin('auth');
        return;
      }

      if (user) {
        // If not verified: keep session, but block app pages
        if (!enforceEmailVerification(user)) return;

        await setAdminButton(user.uid);

        // login: if already verified -> go to next/panel
        if (p === 'login' && user.emailVerified) {
          const next = getNextParam();
          redirect(next || 'espanel.html');
          return;
        }

        // If user enters admin without admin flag
        if (isAdminPage()) {
          await ensureAdminOrRedirect(user.uid);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
