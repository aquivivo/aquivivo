// assets/js/layout.js
// Shared header/footer for ALL pages (including index.html)
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
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  where,
  setDoc,
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
  const IDLE_LIMIT_MS = 15 * 60 * 1000;
  let idleTimer = null;
  let idleEnabled = false;
  let idleBound = false;

  const TRIAL_DAYS = 7;
  const TRIAL_LEVEL = 'A1';
  const INACTIVE_PLAN_MS = 5 * 30 * 24 * 60 * 60 * 1000;
  const NO_LOGIN_MS = 2 * 30 * 24 * 60 * 60 * 1000;
  const TRIAL_INTENT_KEY = 'av_trial_intent';
  const POPUP_SEEN_PREFIX = 'av_popup_seen_';

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

  function popupKey(settings) {
    const raw =
      settings?.popupId ||
      settings?.id ||
      settings?.updatedAt?.seconds ||
      settings?.updatedAt?.toMillis?.() ||
      settings?.createdAt?.seconds ||
      settings?.createdAt?.toMillis?.() ||
      `${settings?.title || ''}|${settings?.body || ''}`;
    return `${POPUP_SEEN_PREFIX}${String(raw).slice(0, 80)}`;
  }

  function shouldShowPopup(settings, loggedIn) {
    if (!settings || settings.enabled === false) return false;
    const showOn = String(settings.showOn || 'visit').toLowerCase();
    if (showOn === 'login' && !loggedIn) return false;
    return true;
  }

  function closePopup(seenKey) {
    const overlay = document.getElementById('sitePopup');
    if (overlay) overlay.remove();
    if (seenKey) localStorage.setItem(seenKey, '1');
  }

  function renderPopup(settings) {
    if (document.getElementById('sitePopup')) return;
    const seenKey = popupKey(settings);
    if (settings?.repeat !== true && localStorage.getItem(seenKey) === '1') return;

    const title = esc(settings?.title || 'Novedad');
    const body = esc(settings?.body || '');
    const ctaLabel = String(settings?.ctaLabel || '').trim();
    const ctaUrl = String(settings?.ctaUrl || '').trim();
    const imageUrl = String(settings?.imageUrl || '').trim();

    const overlay = document.createElement('div');
    overlay.id = 'sitePopup';
    overlay.className = 'popup-overlay';
    overlay.innerHTML = `
      <div class="popup-card">
        <button class="popup-close" type="button" aria-label="Cerrar">×</button>
        ${imageUrl ? `<div class="popup-media"><img src="${esc(imageUrl)}" alt="banner" /></div>` : ''}
        <div class="popup-title">${title}</div>
        ${body ? `<div class="popup-body">${body}</div>` : ''}
        ${ctaLabel && ctaUrl ? `<a class="btn-yellow popup-cta" href="${esc(ctaUrl)}">${esc(ctaLabel)}</a>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup(seenKey);
    });
    overlay.querySelector('.popup-close')?.addEventListener('click', () => closePopup(seenKey));
    overlay.querySelector('.popup-cta')?.addEventListener('click', () => closePopup(seenKey));
    document.body.appendChild(overlay);
  }

  async function loadPopupSettings(loggedIn) {
    try {
      const snap = await getDoc(doc(db, 'site_settings', 'popup'));
      if (!snap.exists()) return;
      const settings = snap.data() || {};
      if (!shouldShowPopup(settings, loggedIn)) return;
      renderPopup(settings);
    } catch (e) {
      console.warn('[popup] load failed', e);
    }
  }

  async function logPageView(user, isAdmin) {
    if (!user?.uid) return;
    if (isAdmin) return;
    const page = document.body?.dataset?.page || location.pathname.split('/').pop() || 'page';
    const dayKey = new Date().toISOString().slice(0, 10);
    const sessionKey = `av_view_${page}_${dayKey}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;
    sessionStorage.setItem(sessionKey, '1');
    try {
      await addDoc(collection(db, 'page_views'), {
        uid: user.uid,
        page,
        dayKey,
        createdAt: serverTimestamp(),
        isAdmin: !!isAdmin,
      });
    } catch (e) {
      console.warn('[page_views] log failed', e);
    }
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

  async function upsertEmailIndex(user, profile) {
    const email = String(user?.email || '').trim();
    if (!email) return;
    const emailLower = email.toLowerCase();
    try {
      await setDoc(
        doc(db, 'email_index', emailLower),
        {
          uid: user.uid,
          emailLower,
          handle: String(profile?.handle || '').trim(),
          displayName: String(
            profile?.displayName ||
              profile?.name ||
              user?.displayName ||
              '',
          ).trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('[email_index] update failed', e);
    }
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
    const hrefPolaco = isIndex ? '#metodo-disenado-para-ti' : 'index.html#metodo-disenado-para-ti';
    const hrefTramites = isIndex ? '#mas-que-clases' : 'index.html#mas-que-clases';

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
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosPlanes}">🧾 ${labels.planes}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosServicios}">🛠️ ${labels.servicios}</a>
                <a role="menuitem" class="nav-dd-item nav-dd-item--red" id="btnTramites" href="${hrefTramites}">📄 ${labels.tramites}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosExtras}">✨ ${labels.extras}</a>
                <a role="menuitem" class="nav-dd-item" href="${hrefServiciosEbooks}">📚 ${labels.ebooks}</a>
                <div class="nav-dd-sep" aria-hidden="true"></div>
                <a role="menuitem" class="nav-dd-item nav-dd-item-strong" href="${hrefServicios}">👀 ${labels.verTodo}</a>
              </div>
            </div>
            ${isIndex ? `<a class="btn-white-outline" id="btnContacto" href="#contact">&#x1F495; Contacto</a>` : ''}
            ${
              logged
                ? `
              <div class="nav-profile" id="navProfile">
                <div class="nav-icon-wrap" id="navNotifWrap">
                  <button class="nav-icon-btn" id="navNotifBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="${labels.notifications}">
                    🔔
                    <span class="nav-badge nav-badge--yellow" id="navNotifBadge" style="display:none;">0</span>
                  </button>
                  <div class="nav-mini-menu" id="navNotifMenu" role="menu" aria-label="${labels.notifications}">
                    <div class="nav-mini-head">${labels.notifications}</div>
                    <div class="nav-mini-list" id="navNotifList">
                      <div class="nav-mini-empty">Sin notificaciones.</div>
                    </div>
                    <a class="nav-mini-footer" href="notificaciones.html">Ver todas</a>
                  </div>
                </div>
                <div class="nav-icon-wrap" id="navMsgWrap">
                  <button class="nav-icon-btn" id="navMsgBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="${labels.messages}">
                    💬
                    <span class="nav-badge nav-badge--red" id="navMsgBadge" style="display:none;">0</span>
                  </button>
                  <div class="nav-mini-menu" id="navMsgMenu" role="menu" aria-label="${labels.messages}">
                    <div class="nav-mini-head">${labels.messages}</div>
                    <div class="nav-mini-list" id="navMsgList">
                      <div class="nav-mini-empty">Sin mensajes nuevos.</div>
                    </div>
                    <a class="nav-mini-footer" href="mensajes.html">Ver todos</a>
                  </div>
                </div>
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
                    <a class="nav-profile-item" href="referidos.html">🤝 ${labels.refer}</a>
                    <a class="nav-profile-item" href="ajustes.html">⚙️ ${labels.settings}</a>
                    <a class="nav-profile-item" href="pagos.html">💳 ${labels.payments}</a>
                    <a class="nav-profile-item" href="recompensas.html">🏆 ${labels.rewards}</a>
                    <a class="nav-profile-item" href="ayuda.html">🆘 ${labels.help}</a>
                    ${logged && isAdmin ? `<a class="nav-profile-item" href="esadmin.html">🛡️ ${labels.admin}</a>` : ''}
                    <div class="nav-profile-sep" aria-hidden="true"></div>
                    <button class="nav-profile-item nav-profile-item--danger" id="navProfileLogout" type="button">🚪 ${labels.logout}</button>
                  </div>
                </div>
              </div>
            `
                : ''
            }
            <button class="btn-white-outline" id="btnBack" type="button">${labels.back}</button>
            ${logged ? '' : `<a class="btn-white-outline" href="login.html">${labels.login}</a>`}
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
            &copy; 2026 AquiVivo. Todos los derechos reservados.<br />
            Te ayudo a perder el miedo a hablar. &#x1F338;&#x1F90D;
          </div>
        </div>
      </footer>
    `;
  }

  function injectSidePanel() {
    const page = document.body?.dataset?.page || '';
    const allowed = new Set([
      'panel',
      'mensajes',
      'notificaciones',
      'pagos',
      'recompensas',
      'referidos',
      'ajustes',
      'ayuda',
      'esadmin',
      'admin-wizard',
      'admin-select',
    ]);
    if (!allowed.has(page)) return;
    const existingPanel = document.getElementById('sidePanel');
    if (existingPanel) {
      document.body.classList.add('with-side-panel');
      if (!existingPanel.classList.contains('side-panel'))
        existingPanel.classList.add('side-panel');
      return;
    }

    document.body.classList.add('with-side-panel');

    const panel = document.createElement('aside');
    panel.id = 'sidePanel';
    panel.className = 'side-panel';
    panel.innerHTML = `
      <a href="index.html" data-page="inicio">🏠 Inicio</a>
      <a href="espanel.html" data-page="panel">📒 Libreta</a>
      <a href="perfil.html" data-page="profile">👤 Perfil</a>
      <a href="espanel.html#cursos" data-page="cursos">📚 Mis cursos</a>
      <a href="review.html" data-page="practicar">🔁 Practicar</a>
      <a href="mensajes.html" data-page="mensajes">💬 Mensajes</a>
      <a href="notificaciones.html" data-page="notificaciones">🔔 Notificaciones</a>
      <a href="recompensas.html" data-page="recompensas">🏆 Recompensas</a>
      <a href="referidos.html" data-page="referidos">🤝 Recomendar</a>
      <a href="ajustes.html" data-page="ajustes">⚙️ Ajustes</a>
      <a href="pagos.html" data-page="pagos">💳 Pagos</a>
      <a href="ayuda.html" data-page="ayuda">🆘 Ayuda</a>
    `;

    const header = document.getElementById('appHeader');
    if (header) header.insertAdjacentElement('afterend', panel);
    else document.body.insertAdjacentElement('afterbegin', panel);

    const activeKey = page;
    panel.querySelectorAll('a[data-page]').forEach((link) => {
      if (link.dataset.page === activeKey) {
        link.classList.add('is-active');
      }
    });
  }

  function wireMiniMenu(wrap, btn, menu) {
    if (!wrap || !btn || !menu || wrap.dataset.wired) return;
    wrap.dataset.wired = '1';
    const canHover = window.matchMedia('(hover: hover)').matches;
    let closeTimer = null;

    const open = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(close, 160);
    };
    const cancelClose = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    };
    const toggle = () => {
      if (wrap.classList.contains('open')) close();
      else open();
    };

    if (canHover) {
      wrap.addEventListener('mouseenter', () => {
        cancelClose();
        open();
      });
      wrap.addEventListener('mouseleave', (e) => {
        if (menu.contains(e.relatedTarget)) return;
        scheduleClose();
      });
      menu.addEventListener('mouseenter', () => {
        cancelClose();
        open();
      });
      menu.addEventListener('mouseleave', (e) => {
        if (wrap.contains(e.relatedTarget)) return;
        scheduleClose();
      });
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
  }

  function setBadge(el, count) {
    if (!el) return;
    const num = Number(count || 0);
    if (!num) {
      el.style.display = 'none';
      el.textContent = '0';
      return;
    }
    el.style.display = 'inline-flex';
    el.textContent = num > 99 ? '99+' : String(num);
  }

  async function loadNotifDropdown(uid) {
    const list = document.getElementById('navNotifList');
    const badge = document.getElementById('navNotifBadge');
    if (!uid || !list || !badge) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'user_notifications', uid, 'items'),
          orderBy('createdAt', 'desc'),
          limit(6),
        ),
      );
      const items = snap.docs.map((d) => d.data() || {});
      const unread = items.filter((i) => i.read !== true).length;
      setBadge(badge, unread);
      if (!items.length) {
        list.innerHTML = '<div class="nav-mini-empty">Sin notificaciones.</div>';
        return;
      }
      list.innerHTML = items
        .map((item) => {
          const title = String(item.title || 'Notificación');
          const body = String(item.body || '');
          return `<div class="nav-mini-item ${item.read ? '' : 'is-unread'}">
            <div class="nav-mini-title">${title}</div>
            ${body ? `<div class="nav-mini-body">${body}</div>` : ''}
          </div>`;
        })
        .join('');
    } catch (e) {
      console.warn('[notifications] load failed', e);
      setBadge(badge, 0);
      list.innerHTML = '<div class="nav-mini-empty">Sin notificaciones.</div>';
    }
  }

  async function loadMsgDropdown(uid) {
    const list = document.getElementById('navMsgList');
    const badge = document.getElementById('navMsgBadge');
    if (!uid || !list || !badge) return;
    if (!list.dataset.wired) {
      list.dataset.wired = '1';
      list.addEventListener('click', (e) => {
        const item = e.target.closest('[data-conv]');
        if (!item) return;
        const convId = item.dataset.conv;
        if (!convId) return;
        e.preventDefault();
        location.href = `mensajes.html?conv=${encodeURIComponent(convId)}`;
      });
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', uid),
        ),
      );
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      items.sort((a, b) => {
        const aTime = toDateMaybe(a.lastAt) || toDateMaybe(a.createdAt);
        const bTime = toDateMaybe(b.lastAt) || toDateMaybe(b.createdAt);
        return (bTime?.getTime() || 0) - (aTime?.getTime() || 0);
      });
      const unread = items.filter((item) => {
        const lastAt = toDateMaybe(item.lastAt);
        if (!lastAt) return false;
        if (item.lastMessage?.senderId === uid) return false;
        const readRaw = item.reads ? item.reads[uid] : null;
        const readAt = toDateMaybe(readRaw);
        if (!readAt) return true;
        return lastAt.getTime() > readAt.getTime();
      }).length;
      setBadge(badge, unread);
      if (!items.length) {
        list.innerHTML = '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
        return;
      }
      const viewItems = items.slice(0, 8);
      list.innerHTML = viewItems
        .map((item) => {
          const href = `mensajes.html?conv=${encodeURIComponent(item.id)}`;
          const title =
            item.title ||
            (item.type === 'support' ? 'Soporte' : item.type === 'group' ? 'Grupo' : '') ||
            item.lastMessage?.senderName ||
            'Conversación';
          const text = String(item.lastMessage?.text || '');
          const lastAt = toDateMaybe(item.lastAt);
          const readRaw = item.reads ? item.reads[uid] : null;
          const readAt = toDateMaybe(readRaw);
          const isUnread =
            lastAt &&
            item.lastMessage?.senderId !== uid &&
            (!readAt || lastAt.getTime() > readAt.getTime());
          return `<a class="nav-mini-item ${isUnread ? 'is-unread' : ''}" href="${href}" data-conv="${item.id}">
            <div class="nav-mini-title">${String(title || 'Conversación')}</div>
            ${text ? `<div class="nav-mini-body">${text}</div>` : ''}
          </a>`;
        })
        .join('');
    } catch (e) {
      console.warn('[messages] load failed', e);
      setBadge(badge, 0);
      list.innerHTML = '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
    }
  }

  let badgeTimer = null;
  function startBadgeRefresh(uid) {
    if (badgeTimer) {
      clearInterval(badgeTimer);
      badgeTimer = null;
    }
    if (!uid) return;
    loadNotifDropdown(uid);
    loadMsgDropdown(uid);
    badgeTimer = setInterval(() => {
      loadNotifDropdown(uid);
      loadMsgDropdown(uid);
    }, 30000);
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
    const navNotifWrap = document.getElementById('navNotifWrap');
    const navNotifBtn = document.getElementById('navNotifBtn');
    const navNotifMenu = document.getElementById('navNotifMenu');
    const navMsgWrap = document.getElementById('navMsgWrap');
    const navMsgBtn = document.getElementById('navMsgBtn');
    const navMsgMenu = document.getElementById('navMsgMenu');

    wireMiniMenu(navNotifWrap, navNotifBtn, navNotifMenu);
    wireMiniMenu(navMsgWrap, navMsgBtn, navMsgMenu);

    if (profileWrap && profileToggle && profileMenu && !profileWrap.dataset.wired) {
      profileWrap.dataset.wired = '1';
      const canHover = window.matchMedia('(hover: hover)').matches;
      let closeTimer = null;
      const open = () => {
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        profileWrap.classList.add('open');
        profileToggle.setAttribute('aria-expanded', 'true');
      };
      const close = () => {
        profileWrap.classList.remove('open');
        profileToggle.setAttribute('aria-expanded', 'false');
      };
      const scheduleClose = () => {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(close, 180);
      };
      const cancelClose = () => {
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const toggle = () => {
        if (profileWrap.classList.contains('open')) close();
        else open();
      };
      if (canHover) {
        profileToggle.addEventListener('mouseenter', () => {
          cancelClose();
          open();
        });
        profileMenu.addEventListener('mouseenter', () => {
          cancelClose();
          open();
        });
        profileToggle.addEventListener('mouseleave', (e) => {
          if (profileMenu.contains(e.relatedTarget)) return;
          scheduleClose();
        });
        profileMenu.addEventListener('mouseleave', (e) => {
          if (profileToggle.contains(e.relatedTarget)) return;
          scheduleClose();
        });
      }
      profileToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });
      profileMenu.addEventListener('click', (e) => {
        e.stopPropagation();
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
        isAdmin =
          String(data?.role || 'user') === 'admin' ||
          data?.admin === true ||
          String(user?.email || '').toLowerCase() === 'aquivivo.pl@gmail.com';
      } catch (e) {
        console.warn('[layout] admin check failed', e);
      }
    }

    const profile = CURRENT_DOC || {};
    if (user) {
      await upsertEmailIndex(user, profile);
    }
    mount.innerHTML = buildHeader(user, isAdmin, profile);
    footerMount.innerHTML = buildFooter();
    wireHeader();
    injectSidePanel();
    setupAnchorScroll();

    if (user?.uid) startBadgeRefresh(user.uid);
    else startBadgeRefresh(null);

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

    if (user) await loadPopupSettings(true);
    await logPageView(user, isAdmin);
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

