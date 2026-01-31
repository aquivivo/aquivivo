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
  const ADMIN_HREF = 'esadmin.html';

  function getLevelParam() {
    const qs = new URLSearchParams(location.search);
    const v = qs.get('level');
    return v ? v.toUpperCase() : null;
  }

  function injectHeader() {
    const host = document.getElementById('appHeader');
    if (!host) return;

    const page = (document.body?.dataset?.page || '').toLowerCase();
    const levelParam = getLevelParam();
    const level = (levelParam || 'A1').toUpperCase();

    const showPanel = page !== 'login';
    const showCourse = page !== 'login';
    const showBack = page !== 'index';
    const showLogout = page !== 'login' && page !== 'index';

    const hrefInicio = 'index.html';
    const hrefPanel = 'espanel.html';

    // ✅ Jeśli nie ma level w URL -> najpierw Panel (wybór kursu)
    // ✅ Jeśli level jest w URL -> deep link do listy tematów w tym levelu
    const hrefCourse = levelParam
      ? `course.html?level=${encodeURIComponent(level)}`
      : 'espanel.html';

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

  function pageType() {
    return (document.body?.dataset?.page || '').toLowerCase();
  }

  function isPublicPage(p) {
    return p === 'login' || p === 'index';
  }

  function isProtectedPage(p) {
    return !isPublicPage(p);
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

  async function isAdmin(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() && snap.data()?.admin === true;
    } catch {
      return false;
    }
  }

  function setAdminButtonVisible(visible) {
    const slot = document.getElementById('navAdminSlot');
    if (!slot) return;
    slot.innerHTML = visible
      ? `<a class="btn-yellow" href="${ADMIN_HREF}">🛡️ Admin</a>`
      : '';
  }

  async function guard(user) {
    const p = pageType();

    if (isPublicPage(p)) {
      if (p === 'login' && user && user.emailVerified) {
        const next =
          new URLSearchParams(location.search).get('next') || 'espanel.html';
        location.replace(next);
      }
      return;
    }

    if (isProtectedPage(p) && !user) {
      location.replace('login.html?reason=auth');
      return;
    }
    if (!user) return;

    if (!user.emailVerified) {
      location.replace('login.html?reason=verify');
      return;
    }

    if (isAdminOnlyPage(p)) {
      const ok = await isAdmin(user.uid);
      if (!ok) {
        location.replace('espanel.html?reason=admin');
        return;
      }
    }
  }

  injectHeader();

  onAuthStateChanged(auth, async (user) => {
    await guard(user);

    if (user && user.emailVerified) {
      const ok = await isAdmin(user.uid);
      setAdminButtonVisible(ok);
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
