// assets/js/layout.js
// Shared header for ALL pages except index.html (index uses layout-index.js)
//  Safe injection (doesn't replace body -> footers remain)
//  Uses firebase-init.js (matches your project)
//  Shows Login when signed out, Logout when signed in

import { auth, db } from './firebase-init.js';
import './logger.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { normalizePlanKey, levelsFromPlan } from './plan-levels.js';

(function () {
  const path = (location.pathname || '').toLowerCase();
  const isIndex =
    path === '/' ||
    path.endsWith('/index') ||
    path.endsWith('/index.html') ||
    path.endsWith('index.html');
  const isLoginPage =
    document.body?.dataset?.page === 'login' ||
    path.endsWith('/login') ||
    path.endsWith('/login.html') ||
    path.endsWith('login.html');
  const adminPages = new Set([
    'esadmin',
    'lessonadmin',
    'ejercicioadmin',
    'adminselect',
    'admin-select',
    'admin-wizard',
  ]);
  const isAdminPage = adminPages.has(document.body?.dataset?.page);
  if (isIndex) return; // index uses layout-index.js

  const IDLE_LIMIT_MS = 15 * 60 * 1000;
  let idleTimer = null;
  let idleEnabled = false;
  let idleBound = false;

  const TRIAL_DAYS = 7;
  const TRIAL_LEVEL = 'A1';
  const INACTIVE_PLAN_MS = 5 * 30 * 24 * 60 * 60 * 1000;
  const NO_LOGIN_MS = 2 * 30 * 24 * 60 * 60 * 1000;
  const TRIAL_INTENT_KEY = 'av_trial_intent';

  let CURRENT_USER = null;
  let CURRENT_DOC = null;

  function toDateMaybe(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function avatarInitial(nameOrEmail) {
    const text = String(nameOrEmail || '').trim();
    if (!text) return 'U';
    return text[0].toUpperCase();
  }

  function usePrettyProfile() {
    const host = location.hostname || '';
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return true;
  }

  function buildProfileHref(handle, uid) {
    const safeHandle = String(handle || '').trim();
    if (safeHandle) {
      return usePrettyProfile()
        ? `/perfil/${encodeURIComponent(safeHandle)}`
        : `perfil.html?u=${encodeURIComponent(safeHandle)}`;
    }
    return `perfil.html?uid=${encodeURIComponent(uid || '')}`;
  }

  function getUserLevels(docData) {
    const rawLevels = Array.isArray(docData?.levels)
      ? docData.levels.map((x) => String(x).toUpperCase())
      : [];
    if (rawLevels.length) return rawLevels;
    return levelsFromPlan(docData?.plan);
  }

  function hasActiveAccess(docData) {
    if (!docData) return false;
    const levels = getUserLevels(docData);
    const plan = normalizePlanKey(docData?.plan);
    const untilDate = toDateMaybe(docData?.accessUntil);
    const hasUntil = !!untilDate;
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;
    const hasGlobalAccess =
      plan === 'premium' || (docData?.access === true && levels.length === 0);
    return (hasGlobalAccess || levels.length > 0) && isUntilValid;
  }

  function isTrialEligible(docData) {
    if (!docData) return false;
    if (docData.admin === true || String(docData.role || '') === 'admin')
      return false;
    if (hasActiveAccess(docData)) return false;

    const now = Date.now();
    const trialUsedAt = toDateMaybe(docData.trialUsedAt);
    const overrideAt = toDateMaybe(docData.trialEligibleAfter);
    if (!trialUsedAt) return true;
    if (overrideAt && overrideAt.getTime() <= now) return true;

    const lastLogin =
      toDateMaybe(docData.lastLoginAt) ||
      toDateMaybe(docData.lastSeenAt) ||
      toDateMaybe(docData.createdAt);
    const lastAccessEnd =
      toDateMaybe(docData.accessUntil) || trialUsedAt || lastLogin;

    const inactivePlanOk =
      !!lastAccessEnd && now - lastAccessEnd.getTime() >= INACTIVE_PLAN_MS;
    const noLoginOk =
      !!lastLogin && now - lastLogin.getTime() >= NO_LOGIN_MS;

    return inactivePlanOk || noLoginOk;
  }

  function setTrialMessage(text, type = 'warn') {
    const el = document.getElementById('trialMsg');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.style.color = type === 'ok' ? '#bde5ff' : '#ffe08a';
  }

  function getNextPath() {
    const name = location.pathname.split('/').pop() || 'index.html';
    let next = name || 'index.html';
    if (location.search) next += location.search;
    if (location.hash) next += location.hash;
    return next;
  }

  async function activateTrial(user, docData) {
    if (!user?.uid) return false;
    if (!isTrialEligible(docData)) return false;

    const userRef = doc(db, 'users', user.uid);
    const until = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const payload = {
      plan: 'trial_a1',
      levels: [TRIAL_LEVEL],
      access: false,
      blocked: false,
      accessUntil: until,
      trialUsedAt: serverTimestamp(),
      trialLevel: TRIAL_LEVEL,
      trialDays: TRIAL_DAYS,
      trialSource: 'user',
      trialEligibleAfter: null,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(userRef, payload);
      CURRENT_DOC = { ...(docData || {}), ...payload };
      setTrialMessage('Trial A1 activado por 7 dias.', 'ok');
      return true;
    } catch (e) {
      console.warn('[trial] activation failed', e);
      setTrialMessage('No se pudo activar el trial. Intentalo de nuevo.');
      return false;
    }
  }

  function updateTrialUI() {
    const btn = document.getElementById('btnTrialA1');
    if (!btn) return;

    if (!CURRENT_USER) {
      btn.disabled = false;
      setTrialMessage('Inicia sesion para activar tu prueba gratuita.');
      return;
    }

    if (!CURRENT_DOC) {
      btn.disabled = true;
      setTrialMessage('Cargando tu estado...');
      return;
    }

    if (CURRENT_DOC.admin === true || String(CURRENT_DOC.role || '') === 'admin') {
      btn.style.display = 'none';
      setTrialMessage('');
      return;
    }

    if (hasActiveAccess(CURRENT_DOC)) {
      btn.disabled = true;
      setTrialMessage('Ya tienes acceso activo.');
      return;
    }

    const ok = isTrialEligible(CURRENT_DOC);
    btn.disabled = !ok;
    if (ok) {
      setTrialMessage('Activa tu prueba gratuita de A1 (7 dias).', 'ok');
    } else {
      setTrialMessage(
        'Tu prueba ya fue usada. Vuelve cuando no tengas plan activo o tras un tiempo de inactividad.',
      );
    }
  }

  function setupTrialButton() {
    const btn = document.getElementById('btnTrialA1');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';

    btn.addEventListener('click', async () => {
      if (!CURRENT_USER) {
        localStorage.setItem(TRIAL_INTENT_KEY, '1');
        location.href = 'login.html?next=' + encodeURIComponent(getNextPath());
        return;
      }
      const ok = await activateTrial(CURRENT_USER, CURRENT_DOC);
      if (ok) updateTrialUI();
    });
  }

  function stopIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function startIdleTimer() {
    stopIdleTimer();
    idleTimer = setTimeout(handleIdleLogout, IDLE_LIMIT_MS);
  }

  async function handleIdleLogout() {
    if (!idleEnabled) return;
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('[idle] signOut failed', e);
    } finally {
      location.href = 'index.html';
    }
  }

  function bindIdleListeners() {
    if (idleBound) return;
    idleBound = true;

    const onActivity = () => {
      if (!idleEnabled) return;
      startIdleTimer();
    };

    const onVisibility = () => {
      if (!document.hidden) onActivity();
    };

    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    events.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true }),
    );
    document.addEventListener('visibilitychange', onVisibility);
  }

  function ensureMount() {
    let mount = document.getElementById('appHeader');
    if (mount) return mount;

    mount = document.createElement('div');
    mount.id = 'appHeader';
    document.body.insertAdjacentElement('afterbegin', mount);
    return mount;
  }

  function ensureFooterMount() {
    let mount = document.getElementById('appFooter');
    if (mount) return mount;

    mount = document.createElement('div');
    mount.id = 'appFooter';
    document.body.insertAdjacentElement('beforeend', mount);
    return mount;
  }

  function avatarInitial(nameOrEmail) {
    const text = String(nameOrEmail || '').trim();
    if (!text) return 'U';
    return text[0].toUpperCase();
  }

  function buildHeader(user, isAdmin, profile) {
    const logged = !!user;
    const photoURL = String(profile?.photoURL || user?.photoURL || '').trim();
    const displayName = String(
      profile?.displayName ||
        profile?.name ||
        user?.displayName ||
        user?.email ||
        '',
    ).trim();
    const handle = String(profile?.handle || '').trim();
    const avatarLetter = avatarInitial(displayName || user?.email || '');
    const profileHref = buildProfileHref(handle, user?.uid);
    const profileName = displayName || user?.email || 'Usuario';
    const labels = isAdminPage
      ? {
          navLabel: 'Nawigacja',
          home: 'Strona glowna',
          login: 'Zaloguj',
          admin: 'Admin',
          polaco: 'POLSKI',
          servicios: 'Uslugi',
          planes: 'Plany',
          tramites: 'Tramites',
          extras: 'Dodatki',
          ebooks: 'Ebooki',
          verTodo: 'Zobacz wszystko',
          libreta: 'Libreta',
          profile: 'Profil',
          myCourses: 'Moje kursy',
          messages: 'Wiadomosci',
          notifications: 'Powiadomienia',
          refer: 'Polec znajomych',
          settings: 'Ustawienia konta',
          payments: 'Historia platnosci',
          rewards: 'Moje nagrody',
          help: 'Pomoc / Zglos problem',
          back: 'Wstecz',
          logout: 'Wyloguj',
        }
      : {
          navLabel: 'Navegacion',
          home: 'Inicio',
          login: 'Iniciar sesion',
          admin: 'Admin',
          polaco: 'POLACO',
          servicios: 'Servicios',
          planes: 'Planes',
          tramites: 'Tramites',
          extras: 'Extras',
          ebooks: 'Ebooks',
          verTodo: 'Ver todo',
          libreta: 'Libreta',
          profile: 'Perfil',
          myCourses: 'Mis cursos',
          messages: 'Mensajes',
          notifications: 'Notificaciones',
          refer: 'Recomendar amigos',
          settings: 'Ajustes de cuenta',
          payments: 'Historial de pagos',
          rewards: 'Mis recompensas',
          help: 'Ayuda / Reportar',
          back: 'Atras',
          logout: 'Cerrar sesion',
        };

    if (isLoginPage) {
      return `
        <header class="topbar nav-glass">
          <div class="nav-inner container">
            <a class="brand" href="index.html" aria-label="AquiVivo">
              <img src="assets/img/logo.png" alt="AquiVivo" />
            </a>

            <div class="nav-actions" aria-label="${labels.navLabel}">
              <a class="btn-white-outline" href="index.html">${labels.home}</a>
              <a class="btn-yellow" href="login.html">${labels.login}</a>
            </div>
          </div>

          <div class="nav-line nav-line-below"></div>
        </header>
      `;
    }

    const hrefServicios = 'services.html';
    const hrefServiciosPlanes = 'services.html#planes';
    const hrefServiciosServicios = 'services.html#servicios';
    const hrefServiciosExtras = 'services.html#extras';
    const hrefServiciosEbooks = 'services.html#ebooks';
    const hrefPolaco = 'index.html#metodo-disenado-para-ti';
    const hrefTramites = 'index.html#mas-que-clases';

    // Keep it simple and stable on app pages

    return `
      <header class="topbar nav-glass">
        <div class="nav-inner container">
          <a class="brand" href="index.html" aria-label="AquiVivo">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions" aria-label="${labels.navLabel}">
            ${
              logged && isAdmin
                ? `<a class="btn-yellow" href="esadmin.html">${labels.admin}</a>`
                : ''
            }
            <a class="btn-white-outline" id="btnPolaco" href="${hrefPolaco}">${labels.polaco}</a>
            <div class="nav-dd" id="navServiciosDD">
              <button class="btn-white-outline nav-dd-btn nav-dd-toggle" id="btnServicios" type="button" aria-haspopup="menu" aria-expanded="false">
                ${labels.servicios} <span class="nav-dd-caret">v</span>
              </button>
              <div class="nav-dd-menu" id="menuServicios" role="menu" aria-label="${labels.servicios}">
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosPlanes}">${labels.planes}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosServicios}">${labels.servicios}</a>
                <a role="menuitem" class="nav-dd-item nav-dd-item--red" id="btnTramites" href="${hrefTramites}">${labels.tramites}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosExtras}">${labels.extras}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosEbooks}">${labels.ebooks}</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">${labels.verTodo}</a>
              </div>
            </div>
            <a class="btn-yellow" href="espanel.html">${labels.libreta}</a>
            ${
              logged
                ? `
              <div class="nav-profile" id="navProfile">
                <a class="nav-icon-btn" href="notificaciones.html" title="${labels.notifications}">🔔</a>
                <a class="nav-icon-btn" href="mensajes.html" title="${labels.messages}">💬</a>
                <button class="nav-avatar ${photoURL ? 'nav-avatar--img' : ''}" id="navProfileToggle" type="button" aria-haspopup="menu" aria-expanded="false">
                  ${photoURL ? `<img src="${photoURL}" alt="Foto de perfil" />` : ''}
                  <span>${avatarLetter}</span>
                </button>
                <div class="nav-profile-menu" id="navProfileMenu" role="menu" aria-label="${labels.profile}">
                  <div class="nav-profile-head">
                    <div class="nav-avatar nav-avatar--small ${photoURL ? 'nav-avatar--img' : ''}">
                      ${photoURL ? `<img src="${photoURL}" alt="Foto de perfil" />` : ''}
                      <span>${avatarLetter}</span>
                    </div>
                    <div>
                      <div class="nav-profile-name">${esc(profileName)}</div>
                      ${handle ? `<div class="nav-profile-handle">@${esc(handle)}</div>` : ''}
                    </div>
                  </div>
                  <div class="nav-profile-list">
                    <a class="nav-profile-item" href="${profileHref}">👤 ${labels.profile}</a>
                    <a class="nav-profile-item" href="espanel.html">📒 ${labels.libreta}</a>
                    <a class="nav-profile-item" href="espanel.html#cursos">📚 ${labels.myCourses}</a>
                    <a class="nav-profile-item" href="mensajes.html">💬 ${labels.messages}</a>
                    <a class="nav-profile-item" href="notificaciones.html">🔔 ${labels.notifications}</a>
                    <a class="nav-profile-item" href="referidos.html">🤝 ${labels.refer}</a>
                    <a class="nav-profile-item" href="ajustes.html">⚙️ ${labels.settings}</a>
                    <a class="nav-profile-item" href="pagos.html">💳 ${labels.payments}</a>
                    <a class="nav-profile-item" href="recompensas.html">🏆 ${labels.rewards}</a>
                    <a class="nav-profile-item" href="ayuda.html">🆘 ${labels.help}</a>
                    ${logged && isAdmin ? `<a class="nav-profile-item" href="esadmin.html">🛡️ ${labels.admin}</a>` : ''}
                    <div class="nav-profile-sep"></div>
                    <button class="nav-profile-item nav-profile-item--danger" id="navProfileLogout" type="button">🚪 ${labels.logout}</button>
                  </div>
                </div>
              </div>
            `
                : ''
            }
            <button class="btn-white-outline" id="btnBack" type="button">${labels.back}</button>
            ${
              logged
                ? `<button class="btn-red" id="btnLogout" type="button">${labels.logout}</button>`
                : `<a class="btn-white-outline" href="login.html">${labels.login}</a>`
            }
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </header>
    `;
  }

  function buildFooter() {
    return `
      <footer class="site-footer">
        <div class="nav-line nav-line-above"></div>
        <div class="footer-inner container">
          <div class="footer-text">
            (c) 2026 AquiVivo. Todos los derechos reservados.<br />
            Te ayudo a perder el miedo a hablar. 
          </div>
        </div>
      </footer>
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
        menuServicios.style.display = 'block';
      }
      function close() {
        dd.classList.remove('open');
        btnServicios.setAttribute('aria-expanded', 'false');
        menuServicios.style.display = 'none';
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

      menuServicios.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        close();
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

    const profileWrap = document.getElementById('navProfile');
    const profileToggle = document.getElementById('navProfileToggle');
    const profileMenu = document.getElementById('navProfileMenu');
    if (profileWrap && profileToggle && profileMenu && !profileWrap.dataset.wired) {
      profileWrap.dataset.wired = '1';

      const open = () => {
        profileWrap.classList.add('open');
        profileToggle.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        profileWrap.classList.remove('open');
        profileToggle.setAttribute('aria-expanded', 'false');
      };
      const toggle = () => {
        if (profileWrap.classList.contains('open')) close();
        else open();
      };

      profileToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });

      document.addEventListener('click', (e) => {
        if (!profileWrap.contains(e.target)) close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }

    const profileLogout = document.getElementById('navProfileLogout');
    if (profileLogout && !profileLogout.dataset.wired) {
      profileLogout.dataset.wired = '1';
      profileLogout.addEventListener('click', async () => {
        try {
          await signOut(auth);
        } catch (e) {
          console.error('Logout error', e);
        }
        location.href = 'index.html';
      });
    }
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

      if (hash === '#mas-que-clases') {
        const extraOffset = 140;
        const top =
          target.getBoundingClientRect().top + window.pageYOffset + extraOffset;
        window.scrollTo({ top, behavior: 'smooth' });
        history.replaceState(null, '', hash);
        return;
      }

      const header = document.querySelector('.nav-glass');
      const offset = header ? header.getBoundingClientRect().height + 8 : 0;
      const top =
        target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
      history.replaceState(null, '', hash);
    });
  }

  const mount = ensureMount();
  const footerMount = ensureFooterMount();

  // Render immediately + re-render on auth changes
  onAuthStateChanged(auth, async (user) => {
    CURRENT_USER = user || null;
    CURRENT_DOC = null;
    let isAdmin = false;
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        CURRENT_DOC = data;
        isAdmin = String(data?.role || 'user') === 'admin';
      } catch (e) {
        console.warn('[layout] admin check failed', e);
      }
    }

    const profile = CURRENT_DOC || {};
    mount.innerHTML = buildHeader(user, isAdmin, profile);
    footerMount.innerHTML = buildFooter();
    wireHeader();
    setupAnchorScroll();

    idleEnabled = !!user && !isAdmin;
    if (idleEnabled) {
      bindIdleListeners();
      startIdleTimer();
    } else {
      stopIdleTimer();
    }

    setupTrialButton();
    updateTrialUI();

    if (user && localStorage.getItem(TRIAL_INTENT_KEY) === '1') {
      localStorage.removeItem(TRIAL_INTENT_KEY);
      await activateTrial(user, CURRENT_DOC);
      updateTrialUI();
    }
  });

  const trialReady = () => {
    setupTrialButton();
    updateTrialUI();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trialReady);
  } else {
    trialReady();
  }
})();

