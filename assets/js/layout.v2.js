import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

let _user = null;
let _isAdmin = false;

function pageId() {
  return document.body?.dataset?.page || '';
}

function isPublicPage(p) {
  return p === 'login' || p === 'index' || p === '';
}

function isAdminPage(p) {
  // admin-only pages
  return (
    p === 'esadmin' ||
    p === 'admin-select' ||
    p === 'lessonadmin' ||
    p === 'ejercicioadmin' ||
    p === 'lesson'
  );
}

function isAuthPage(p) {
  // every non-public page requires login
  return !isPublicPage(p);
}

async function resolveAdmin(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data()?.admin === true;
  } catch (e) {
    console.warn('Admin check failed:', e);
    return false;
  }
}

function redirect(to) {
  if (location.pathname.endsWith('/' + to) || location.pathname.endsWith(to)) return;
  location.href = to;
}

function enforceAccess() {
  const p = pageId();

  // login: if already logged in -> panel
  if (p === 'login' && _user) {
    redirect('espanel.html');
    return;
  }

  // protected: must be logged in
  if (isAuthPage(p) && !_user) {
    redirect('login.html');
    return;
  }

  // admin-only: must be admin
  if (isAdminPage(p) && _user && !_isAdmin) {
    redirect('espanel.html');
    return;
  }
}

function buildHeader() {
  const host = document.getElementById('appHeader');
  if (!host) return;

  const p = pageId();
  const qs = new URLSearchParams(location.search);
  const level = (qs.get('level') || 'A1').toUpperCase();

  const showNav = p !== 'login';
  const showBack = p !== 'index' && p !== 'login';
  const showLogout = p !== 'login' && p !== 'index';

  const hrefInicio = 'index.html';
  const hrefPanel = 'espanel.html';
  const hrefCourse = `course.html?level=${encodeURIComponent(level)}`;
  const hrefAdmin = 'esadmin.html';

  host.innerHTML = showNav ? `
    <div class="nav-glass">
      <div class="nav-line"></div>
      <div class="nav-inner">
        <a class="brand" href="${hrefInicio}">
          <img src="assets/img/logo.png" />
        </a>
        <div class="nav-actions">
          ${_isAdmin ? `<a class="btn-yellow" href="${hrefAdmin}">🛡️ Admin</a>` : ``}
          <a class="btn-white-outline" href="${hrefCourse}">📚 Curso</a>
          <a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>
          <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
          ${showBack ? `<button class="btn-white-outline" id="btnAtras">⬅️ Atrás</button>` : ``}
          ${showLogout ? `<button class="btn-red" id="btnLogout">Cerrar sesión</button>` : ``}
        </div>
      </div>
    </div>
  ` : ``;

  const backBtn = document.getElementById('btnAtras');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const before = location.href;
      history.back();
      setTimeout(() => {
        if (location.href === before) location.href = hrefPanel;
      }, 250);
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

function domReady() {
  return new Promise((res) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => res(), { once: true });
    } else {
      res();
    }
  });
}

(async function init() {
  await domReady();

  // render early - then update when auth resolves
  buildHeader();

  onAuthStateChanged(auth, async (user) => {
    _user = user || null;
    _isAdmin = user ? await resolveAdmin(user) : false;

    enforceAccess();
    buildHeader();
  });
})();
