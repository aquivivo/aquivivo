import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

(function () {
  const ADMIN_HREF = 'esadmin.html';

  function pageType() {
    return (document.body?.dataset?.page || '').toLowerCase();
  }

  function isPublicPage(p) {
    return p === 'login' || p === 'index';
  }

  function isAdminOnlyPage(p) {
    return (
      p === 'esadmin' ||
      p === 'admin-select' ||
      p === 'lessonadmin' ||
      p === 'ejercicioadmin'
    );
  }

  function setLoginHint(msg) {
    const el = document.getElementById('message');
    if (!el) return;
    el.className = 'msg';
    el.textContent = msg;
  }

  async function getUserDoc(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data() || {} : {};
    } catch {
      return {};
    }
  }

  function setAdminButtonVisible(visible) {
    const slot = document.getElementById('navAdminSlot');
    if (!slot) return;
    slot.innerHTML = visible
      ? `<a class="btn-yellow" href="${ADMIN_HREF}">🛡️ Admin</a>`
      : '';
  }

  function injectHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const p = pageType();
    const showBack = p !== 'index';
    const showLogout = !isPublicPage(p);

    const hrefCurso = 'espanel.html';
    const hrefPanel = 'espanel.html';
    const hrefInicio = 'index.html';

    host.innerHTML = `
      <div class="nav-glass">
        <div class="nav-line"></div>
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions">
            <span id="navAdminSlot"></span>
            <a class="btn-white-outline" href="${hrefCurso}">📚 Curso</a>
            <a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>
            <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
            ${showBack ? `<button class="btn-white-outline" id="btnAtras" type="button">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>` : ``}
          </div>
        </div>
      </div>
    `;

    const btnBack = document.getElementById('btnAtras');
    if (btnBack) btnBack.addEventListener('click', () => history.back());

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        try {
          await signOut(auth);
        } finally {
          location.href = 'login.html';
        }
      });
    }
  }

  async function guard(user) {
    const p = pageType();

    // public pages
    if (isPublicPage(p)) {
      if (p === 'login' && user && user.emailVerified) {
        const next =
          new URLSearchParams(location.search).get('next') || 'espanel.html';
        location.replace(next);
      }
      return;
    }

    // protected pages require auth
    if (!user) {
      location.replace('login.html?reason=auth');
      return;
    }

    // require verified email
    if (!user.emailVerified) {
      location.replace('login.html?reason=verify');
      return;
    }

    // Load Firestore user doc once (admin/blocked/plan/access)
    const u = await getUserDoc(user.uid);
    const isAdmin = u.admin === true;
    const blocked = u.blocked === true;

    // ✅ Global BLOCKED guard (except admin)
    if (blocked && !isAdmin) {
      const allowed = p === 'panel'; // allow to see panel message
      if (!allowed) {
        location.replace('espanel.html?reason=blocked');
        return;
      }
    }

    // admin-only pages require admin
    if (isAdminOnlyPage(p) && !isAdmin) {
      location.replace('espanel.html?reason=admin');
      return;
    }
  }

  // render header immediately
  injectHeader();

  // state + guards + admin button
  onAuthStateChanged(auth, async (user) => {
    await guard(user);

    if (user && user.emailVerified) {
      const u = await (async () => {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          return snap.exists() ? snap.data() || {} : {};
        } catch {
          return {};
        }
      })();
      setAdminButtonVisible(u.admin === true);
    } else {
      setAdminButtonVisible(false);
      if (pageType() === 'login') {
        const reason = new URLSearchParams(location.search).get('reason');
        if (reason === 'verify') {
          setLoginHint(
            'Verifica tu correo para continuar. Puedes reenviar el email abajo.',
          );
        }
      }
    }
  });
})();
