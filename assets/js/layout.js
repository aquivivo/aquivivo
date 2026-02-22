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
  increment,
  limit,
  orderBy,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  normalizePlanKey,
  normalizeLevelList,
  resolveAccessUntil,
  levelsFromPlan,
} from './plan-levels.js';
import { initGlobalMiniChat, destroyGlobalMiniChat } from './global-mini-chat.js';
import { buildProfileHref } from './profile-href.js';

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
  const ASSET_VERSION = '20260214z';

  let CURRENT_USER = null;
  let CURRENT_DOC = null;

  function getRuntimeAssetVersion() {
    try {
      const host = String(location.hostname || '').toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        return String(Date.now());
      }
    } catch {}
    return ASSET_VERSION;
  }

  function bustStylesCache() {
    const link = document.querySelector('link[rel="stylesheet"][href*="assets/css/styles.css"]');
    if (!link) return;
    const href = String(link.getAttribute('href') || '');
    if (!href.includes('assets/css/styles.css')) return;
    const v = getRuntimeAssetVersion();
    const withUpdatedV = href.match(/[?&]v=/)
      ? href.replace(/([?&]v=)[^&]+/, `$1${v}`)
      : `${href}${href.includes('?') ? '&' : '?'}v=${v}`;
    if (withUpdatedV !== href) link.setAttribute('href', withUpdatedV);
  }

  function toDateMaybe(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatYmd(d) {
    try {
      if (!(d instanceof Date)) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHref(raw, fallback = 'notificaciones.html') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    const lower = value.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:')
    ) {
      return fallback;
    }
    return value;
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
    if (settings?.repeat !== true && localStorage.getItem(seenKey) === '1')
      return;

    const title = esc(settings?.title || 'Novedad');
    const body = esc(settings?.body || '');
    const ctaLabel = String(settings?.ctaLabel || '').trim();
    const ctaUrl = String(settings?.ctaUrl || '').trim();
    const safeCtaUrl = safeHref(ctaUrl, '#');
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
        ${ctaLabel && ctaUrl ? `<a class="btn-yellow popup-cta" href="${esc(safeCtaUrl)}">${esc(ctaLabel)}</a>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup(seenKey);
    });
    overlay
      .querySelector('.popup-close')
      ?.addEventListener('click', () => closePopup(seenKey));
    overlay
      .querySelector('.popup-cta')
      ?.addEventListener('click', () => closePopup(seenKey));
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
    const page =
      document.body?.dataset?.page ||
      location.pathname.split('/').pop() ||
      'page';
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

  async function trackDailyActivity(user, isAdmin) {
    if (!user?.uid) return;
    if (isAdmin) return;
    const dayKey = new Date().toISOString().slice(0, 10);
    const sessionKey = `av_activity_visit_${dayKey}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;
    sessionStorage.setItem(sessionKey, '1');
    try {
      await setDoc(
        doc(db, 'user_activity', user.uid, 'days', dayKey),
        {
          uid: user.uid,
          dayKey,
          visits: increment(1),
          lastVisitAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('[activity] track failed', e);
    }
  }

  function getUserLevels(docData) {
    const rawLevels = normalizeLevelList(docData?.levels);
    if (rawLevels.length) return rawLevels;
    return normalizeLevelList(levelsFromPlan(docData?.plan));
  }

  function summarizeAccess(docData) {
    if (!docData) return '';
    const levels = getUserLevels(docData);
    const until = resolveAccessUntil(docData);
    const untilTxt = until ? formatYmd(until) : '';
    const parts = [];
    if (untilTxt) parts.push(`hasta ${untilTxt}`);
    if (levels.length) parts.push(`niveles: ${levels.join(', ')}`);
    return parts.join(' · ');
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
            profile?.displayName || profile?.name || user?.displayName || '',
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
    const untilDate = resolveAccessUntil(docData);
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
    const lastAccessEnd = resolveAccessUntil(docData) || trialUsedAt || lastLogin;

    const inactivePlanOk =
      !!lastAccessEnd && now - lastAccessEnd.getTime() >= INACTIVE_PLAN_MS;
    const noLoginOk = !!lastLogin && now - lastLogin.getTime() >= NO_LOGIN_MS;

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
    if (!btn.dataset.defaultLabel) {
      btn.dataset.defaultLabel = String(btn.textContent || '').trim() || 'Activa A1 gratis 7 dias';
    }
    const defaultLabel = btn.dataset.defaultLabel;

    if (!CURRENT_USER) {
      btn.disabled = false;
      btn.textContent = defaultLabel;
      setTrialMessage('Inicia sesión para activar tu prueba gratuita.');
      return;
    }

    if (!CURRENT_DOC) {
      btn.disabled = true;
      setTrialMessage('Cargando tu estado...');
      return;
    }

    if (
      CURRENT_DOC.admin === true ||
      String(CURRENT_DOC.role || '') === 'admin'
    ) {
      btn.style.display = 'none';
      setTrialMessage('');
      return;
    }

    if (CURRENT_DOC.blocked === true) {
      btn.disabled = true;
      btn.textContent = defaultLabel;
      setTrialMessage(
        '\u26D4\uFE0F Tu cuenta est\u00e1 bloqueada. Contacta con el administrador.',
      );
      return;
    }

    if (hasActiveAccess(CURRENT_DOC)) {
      btn.disabled = false;
      btn.textContent = 'Ir al panel';
      const summary = summarizeAccess(CURRENT_DOC);
      setTrialMessage(
        summary ? `Ya tienes acceso activo (${summary}).` : 'Ya tienes acceso activo.',
      );
      return;
    }

    const ok = isTrialEligible(CURRENT_DOC);
    if (ok) {
      btn.disabled = false;
      btn.textContent = defaultLabel;
      setTrialMessage('Activa tu prueba gratuita de A1 (7 dias).', 'ok');
    } else {
      btn.disabled = false;
      btn.textContent = 'Ver planes';
      setTrialMessage('Tu prueba ya fue usada. Compra o renueva tu acceso en Servicios.');
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

      if (!CURRENT_DOC) {
        updateTrialUI();
        return;
      }

      if (CURRENT_DOC.blocked === true) {
        updateTrialUI();
        return;
      }

      if (hasActiveAccess(CURRENT_DOC)) {
        location.href = 'perfil.html';
        return;
      }

      if (!isTrialEligible(CURRENT_DOC)) {
        location.href = 'services.html';
        return;
      }

      const ok = await activateTrial(CURRENT_USER, CURRENT_DOC);
      if (ok) {
        updateTrialUI();
      } else {
        // fallback: if trial can't be activated, show plans instead
        location.href = 'services.html';
      }
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
            search: 'Amigos',
           profile: 'Profil',
           myCourses: 'Moje kursy',
           messages: 'Mensajes',
           notifications: 'Notificaciones',
          refer: 'Amigos',
          settings: 'Ustawienia konta',
          payments: 'Historia platnosci',
          rewards: 'Pasaporte',
          help: 'Pomoc / Zglos problem',
          back: 'Wstecz',
          logout: 'Wyloguj',
        }
      : {
          navLabel: 'Navegación',
          home: 'Inicio',
          login: 'Iniciar sesión',
          admin: 'Admin',
          polaco: 'POLACO',
          servicios: 'Servicios',
          planes: 'Planes',
          tramites: 'Tramites',
          extras: 'Extras',
          ebooks: 'Ebooks',
          verTodo: 'Ver todo',
           libreta: 'Libreta',
            search: 'Amigos',
           profile: 'Perfil',
           myCourses: 'Mis cursos',
           messages: 'Mensajes',
           notifications: 'Notificaciones',
          refer: 'Amigos',
          settings: 'Ajustes de cuenta',
          payments: 'Historial de pagos',
          rewards: 'Pasaporte',
          help: 'Ayuda / Reportar',
          back: 'Atrás',
          logout: 'Cerrar sesión',
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
    const hrefContacto = 'index.html#contact';
    const hrefTramites = isIndex
      ? '#mas-que-clases'
      : 'index.html#mas-que-clases';

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
                ? `<a class="btn-yellow" href="admin-select.html">${labels.admin}</a>`
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
            <a class="btn-white-outline" id="btnContacto" href="${hrefContacto}">&#x1F495; Contacto</a>
            ${
              logged
                ? `
              <div class="nav-profile" id="navProfile">
                <div class="nav-icon-wrap" id="navNotifWrap">
                  <button class="nav-icon-btn" id="navNotifBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="${labels.notifications}">
                    <span aria-hidden="true">&#x1F514;</span><span class="nav-badge nav-badge--yellow" id="navNotifBadge" style="display:none;">0</span>
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
                    <span aria-hidden="true">&#x1F4AC;</span><span class="nav-badge nav-badge--red" id="navMsgBadge" style="display:none;">0</span>
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
                    <a class="nav-profile-item" href="${profileHref}"><span aria-hidden="true">&#x1F464;</span><span>${labels.profile}</span></a>
                    <a class="nav-profile-item" href="perfil.html?tab=courses"><span aria-hidden="true">&#x1F4DA;</span><span>${labels.myCourses}</span></a>
                    <a class="nav-profile-item" href="referidos.html"><span aria-hidden="true">&#x1F91D;</span><span>${labels.refer}</span></a>
                    <a class="nav-profile-item" href="ajustes.html"><span aria-hidden="true">&#x2699;</span><span>${labels.settings}</span></a>
                    <a class="nav-profile-item" href="pagos.html"><span aria-hidden="true">&#x1F4B3;</span><span>${labels.payments}</span></a>
                    <a class="nav-profile-item" href="recompensas.html"><span aria-hidden="true">&#x1F381;</span><span>${labels.rewards}</span></a>
                    <a class="nav-profile-item" href="ayuda.html"><span aria-hidden="true">&#x1F4A1;</span><span>${labels.help}</span></a>
                    ${logged && isAdmin ? `<a class="nav-profile-item" href="admin-select.html"><span aria-hidden="true">&#x1F6E1;</span><span>${labels.admin}</span></a>` : ''}
                    <div class="nav-profile-sep" aria-hidden="true"></div>
                    <button class="nav-profile-item nav-profile-item--danger" id="navProfileLogout" type="button">${labels.logout}</button>
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
          <div class="footer-left">&copy; 2026 AquiVivo. Todos los derechos reservados.</div>
          <div class="footer-center">Te ayudo a perder el miedo a hablar. &#x1F338;&#x1F90D;</div>
          <nav class="footer-nav" aria-label="Enlaces">
            <a href="polityka-prywatnosci.html">Pol&iacute;tica de privacidad</a>
            <a href="regulamin.html">T&eacute;rminos</a>
            <a href="zwroty.html">Devoluciones</a>
            <a href="index.html#contact">Contacto</a>
          </nav>
        </div>
      </footer>
    `;
  }

  function getAdminSideGroups() {
    return [
      {
        title: 'Start i kreatory',
        open: true,
        items: [
          {
            href: 'admin-select.html',
            label: 'Centrum admina',
            icon: '&#x1F9ED;',
            pageKeys: ['admin-select', 'adminselect'],
          },
          {
            href: 'admin-wizard.html',
            label: 'Kreator',
            icon: '&#x1F9F0;',
            pageKeys: ['admin-wizard'],
          },
          {
            href: 'lessonadmin.html',
            label: 'Admin lekcji',
            icon: '&#x1F4D8;',
            pageKeys: ['lessonadmin'],
          },
          {
            href: 'ejercicioadmin.html',
            label: 'Admin cwiczen',
            icon: '&#x1F3AF;',
            pageKeys: ['ejercicioadmin'],
          },
          {
            href: 'esadmin.html#accDashboard',
            label: 'Dashboard',
            icon: '&#x1F4CA;',
            section: 'accDashboard',
          },
        ],
      },
      {
        title: 'Sprzedaz i marketing',
        open: true,
        items: [
          {
            href: 'esadmin.html#accServices',
            label: 'Dodawanie tresci',
            icon: '&#x1F6D2;',
            section: 'accServices',
          },
          {
            href: 'esadmin.html#accPayments',
            label: 'Ceny i platnosci',
            icon: '&#x1F4B3;',
            section: 'accPayments',
          },
          {
            href: 'esadmin.html#accPromo',
            label: 'Kody promo',
            icon: '&#x1F3F7;&#xFE0F;',
            section: 'accPromo',
          },
          {
            href: 'esadmin.html#accSegments',
            label: 'Segmentacja',
            icon: '&#x1F9E9;',
            section: 'accSegments',
          },
          {
            href: 'esadmin.html#accBroadcasts',
            label: 'Mensajes',
            icon: '&#x1F4E2;',
            section: 'accBroadcasts',
          },
          {
            href: 'esadmin.html#accPublishing',
            label: 'Publikacja',
            icon: '&#x1F4DD;',
            section: 'accPublishing',
          },
          { href: 'esadmin.html#accMissing', label: 'Braki', icon: '&#x1F9F9;', section: 'accMissing' },
        ],
      },
      {
        title: 'Uzytkownicy i postep',
        open: true,
        items: [
          { href: 'esadmin.html#accUsers', label: 'Uzytkownicy', icon: '&#x1F465;', section: 'accUsers' },
          { href: 'esadmin.html#accProgress', label: 'Postepy', icon: '&#x1F4C8;', section: 'accProgress' },
          { href: 'esadmin.html#accActivity', label: 'Aktywnosc', icon: '&#x23F1;&#xFE0F;', section: 'accActivity' },
          { href: 'esadmin.html#accFlashcards', label: 'Fiszki', icon: '&#x1F0CF;', section: 'accFlashcards' },
        ],
      },
      {
        title: 'Opinie i jakosc',
        open: true,
        items: [
          { href: 'esadmin.html#accReviews', label: 'Opinie', icon: '&#x2B50;', section: 'accReviews' },
          { href: 'esadmin.html#accReports', label: 'Zgloszenia', icon: '&#x1F9FE;', section: 'accReports' },
        ],
      },
      {
        title: 'Techniczne i multimedia',
        open: true,
        items: [
          { href: 'esadmin.html#accAppLogs', label: 'Logi', icon: '&#x1F5A5;&#xFE0F;', section: 'accAppLogs' },
          {
            href: 'esadmin.html#accAudioLib',
            label: 'Biblioteka audio',
            icon: '&#x1F3A7;',
            section: 'accAudioLib',
          },
        ],
      },
    ];
  }

  function isAdminSideItemActive(item, currentPage, currentHash) {
    const pageKeys = Array.isArray(item?.pageKeys) ? item.pageKeys : [];
    const samePage = pageKeys.includes(currentPage);
    const sameSection =
      !!item?.section &&
      currentPage === 'esadmin' &&
      ((!!currentHash && currentHash === item.section) ||
        (!currentHash && item.section === 'accDashboard'));
    return samePage || sameSection;
  }

  function renderAdminSidePanel(panel, page) {
    if (!panel) return;
    const currentPage = String(page || '');
    const currentHash = String(location.hash || '').replace(/^#/, '');
    panel.classList.add('side-panel--admin');
    const html = getAdminSideGroups()
      .map((group) => {
        const hasActive = (group.items || []).some((item) =>
          isAdminSideItemActive(item, currentPage, currentHash),
        );
        const isOpen = group.open || hasActive;
        const itemsHtml = (group.items || [])
          .map((item) => {
            const active = isAdminSideItemActive(item, currentPage, currentHash);
            const cls = active ? 'side-panel-link is-active' : 'side-panel-link';
            return `<a class="${cls}" href="${item.href}"><span class="side-panel-ico" aria-hidden="true">${item.icon || ''}</span><span>${esc(item.label || '')}</span></a>`;
          })
          .join('');
        return `<details class="side-panel-group"${isOpen ? ' open' : ''}><summary class="side-panel-group-title">${esc(group.title || '')}</summary><div class="side-panel-group-list">${itemsHtml}</div></details>`;
      })
      .join('');
    panel.innerHTML = html;
  }

  function injectSidePanel() {
    const noSidePanel =
      document.body?.dataset?.noSidePanel === '1' ||
      document.body?.classList?.contains('no-side-panel');
    if (noSidePanel) {
      document.body.classList.remove('with-side-panel');
      const existing = document.getElementById('sidePanel');
      if (existing) existing.remove();
      return;
    }

    const page = document.body?.dataset?.page || '';
    const isAdminView = adminPages.has(page);
    const blocked = new Set([
      'index',
      'login',
      'contacto',
      'terms',
      'privacy',
      'returns',
    ]);
    if (!page || blocked.has(page)) return;
    const existingPanel = document.getElementById('sidePanel');
    if (existingPanel) {
      document.body.classList.add('with-side-panel');
      if (!existingPanel.classList.contains('side-panel'))
        existingPanel.classList.add('side-panel');
      if (isAdminView && existingPanel.childElementCount === 0) {
        renderAdminSidePanel(existingPanel, page);
      }
      return;
    }

    document.body.classList.add('with-side-panel');

    const panel = document.createElement('aside');
    panel.id = 'sidePanel';
    panel.className = 'side-panel';
    if (isAdminView) {
      renderAdminSidePanel(panel, page);
    } else {
      panel.innerHTML = `
      <a href="perfil.html" data-page="profile"><span class="side-panel-ico" aria-hidden="true">&#x1F464;</span><span>Perfil</span></a>
      <a href="referidos.html" data-page="amigos"><span class="side-panel-ico" aria-hidden="true">&#x1F91D;</span><span>Amigos</span></a>
      <a href="correcciones.html" data-page="correcciones"><span class="side-panel-ico" aria-hidden="true">&#x270D;&#xFE0F;</span><span>Correcciones</span></a>
      <a href="perfil.html?tab=courses" data-page="cursos"><span class="side-panel-ico" aria-hidden="true">&#x1F4DA;</span><span>Mis cursos</span></a>
      <a href="review.html" data-page="practicar"><span class="side-panel-ico" aria-hidden="true">&#x1F3AF;</span><span>Practicar</span></a>
      <a href="recompensas.html" data-page="recompensas"><span class="side-panel-ico" aria-hidden="true">&#x1F381;</span><span>Pasaporte</span></a>
      <a href="ajustes.html" data-page="ajustes"><span class="side-panel-ico" aria-hidden="true">&#x2699;</span><span>Ajustes</span></a>
      <a href="pagos.html" data-page="pagos"><span class="side-panel-ico" aria-hidden="true">&#x1F4B3;</span><span>Pagos</span></a>
      <a href="ayuda.html" data-page="ayuda"><span class="side-panel-ico" aria-hidden="true">&#x1F4A1;</span><span>Ayuda</span></a>
    `;
    }

    const header = document.getElementById('appHeader');
    if (header) header.insertAdjacentElement('afterend', panel);
    else document.body.insertAdjacentElement('afterbegin', panel);

    if (isAdminView) return;

    const activeAliases = {
      panel: 'profile',
      review: 'practicar',
      flashcards: 'practicar',
      ejercicio: 'practicar',
      buscar: 'amigos',
      referidos: 'amigos',
      course: 'cursos',
      lessonpage: 'cursos',
      lesson: 'cursos',
      correccion: 'correcciones',
    };
    const activeKey = activeAliases[page] || page;
    panel.querySelectorAll('a[data-page]').forEach((link) => {
      if (link.dataset.page === activeKey) {
        link.classList.add('is-active');
      }
    });
  }

  function upgradeInfoCardsToAccordions() {
    const page = document.body?.dataset?.page || '';
    const pages = new Set(['terms', 'privacy', 'returns', 'contacto']);
    if (!pages.has(page)) return;

    const container = document.querySelector('main.page .container');
    if (!container) return;

    const children = Array.from(container.children);
    const cardSections = children.filter(
      (el) => el?.tagName === 'SECTION' && el.classList?.contains('card'),
    );
    if (!cardSections.length) return;

    cardSections.forEach((section, idx) => {
      if (!section || section.dataset.accordionUpgraded === '1') return;
      section.dataset.accordionUpgraded = '1';

      const titleEl = section.querySelector('.sectionTitle');
      if (!titleEl) return;

      const details = document.createElement('details');
      details.className = section.className || 'card';
      details.classList.add('detailsCard');
      if (section.id) details.id = section.id;
      if (section.getAttribute('style'))
        details.setAttribute('style', section.getAttribute('style'));
      if (idx === 0) details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'sectionTitle';
      summary.textContent = String(titleEl.textContent || '').trim() || 'Detalles';
      details.appendChild(summary);

      titleEl.remove();

      const bodyEl = section.querySelector('.muted');
      if (bodyEl) bodyEl.classList.add('detailsBody');

      while (section.firstChild) {
        details.appendChild(section.firstChild);
      }

      section.replaceWith(details);
    });
  }

  function wireMiniMenu(wrap, btn, menu, onOpen) {
    if (!wrap || !btn || !menu || wrap.dataset.wired) return;
    wrap.dataset.wired = '1';
    const canHover = window.matchMedia('(hover: hover)').matches;
    let closeTimer = null;

    const open = () => {
      const wasOpen = wrap.classList.contains('open');
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      if (!wasOpen && typeof onOpen === 'function') {
        try {
          onOpen();
        } catch (e) {
          console.warn('[mini-menu] onOpen failed', e);
        }
      }
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
    list.dataset.uid = uid;
    if (!list.dataset.wired) {
      list.dataset.wired = '1';
      list.addEventListener('click', async (e) => {
        const ownerUid = list.dataset.uid;
        if (!ownerUid) return;
        const friendBtn = e.target.closest('[data-friend-action][data-friend-id]');
        if (friendBtn) {
          e.preventDefault();
          e.stopPropagation();
          const reqId = String(friendBtn.dataset.friendId || '').trim();
          const action = String(friendBtn.dataset.friendAction || '').trim();
          if (!ownerUid || !reqId || !['accept', 'decline'].includes(action)) return;
          friendBtn.disabled = true;
          const notifId = String(
            friendBtn.closest('[data-notif-id]')?.getAttribute('data-notif-id') || '',
          ).trim();
          try {
            await updateDoc(doc(db, 'friend_requests', reqId), {
              status: action === 'accept' ? 'accepted' : 'declined',
              updatedAt: serverTimestamp(),
            });
            if (notifId) {
              await updateDoc(doc(db, 'user_notifications', ownerUid, 'items', notifId), {
                read: true,
                readAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }).catch(() => null);
            }
          } catch {}
          loadNotifDropdown(ownerUid).catch(() => null);
          loadMsgDropdown(ownerUid).catch(() => null);
          return;
        }

        const item = e.target.closest('[data-notif-id]');
        const id = item?.dataset?.notifId;
        if (!id) return;
        updateDoc(doc(db, 'user_notifications', ownerUid, 'items', id), {
          read: true,
          readAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => null);
      });
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, 'user_notifications', uid, 'items'),
          orderBy('createdAt', 'desc'),
          limit(20),
        ),
      );
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((item) => String(item.type || '').toLowerCase() !== 'broadcast');

      const unreadItems = items.filter((i) => i.read !== true);
      setBadge(badge, unreadItems.length);
      if (!unreadItems.length) {
        list.innerHTML =
          '<div class="nav-mini-empty">Sin notificaciones.</div>';
        return;
      }

      const notifHtml = unreadItems
        .slice(0, 8)
        .map((item) => {
          const type = String(item.type || '').toLowerCase();
          const title = esc(String(item.title || 'Notificacion'));
          const body = esc(String(item.body || ''));
          const href = esc(safeHref(String(item.link || 'notificaciones.html').trim(), 'notificaciones.html'));
          const notifId = esc(String(item.id || ''));
          if (type === 'friend_request') {
            const data = item.data && typeof item.data === 'object' ? item.data : {};
            const fromUid = String(data.fromUid || '').trim();
            const toUid = String(data.toUid || '').trim();
            const fallbackReqId = fromUid && toUid ? `${fromUid}__${toUid}` : '';
            const reqId = String(data.requestId || fallbackReqId).trim();
            const safeReqId = esc(reqId);
            return `<div class="nav-mini-item is-unread" data-kind="friend-request" data-notif-id="${notifId}">
              <div class="nav-mini-title">${title}</div>
              ${body ? `<div class="nav-mini-body">${body}</div>` : ''}
              ${
                reqId
                  ? `<div class="metaRow" style="margin-top:6px; gap:6px; flex-wrap:wrap">
                <button class="btn-white-outline" type="button" data-friend-action="accept" data-friend-id="${safeReqId}">Aceptar</button>
                <button class="btn-white-outline" type="button" data-friend-action="decline" data-friend-id="${safeReqId}">Rechazar</button>
              </div>`
                  : ''
              }
            </div>`;
          }
          return `<a class="nav-mini-item is-unread" href="${href}" data-notif-id="${notifId}">
            <div class="nav-mini-title">${title}</div>
            ${body ? `<div class="nav-mini-body">${body}</div>` : ''}
          </a>`;
        });
      list.innerHTML = notifHtml.join('');
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
    list.dataset.uid = uid;
    if (!list.dataset.wired) {
      list.dataset.wired = '1';
      list.addEventListener('click', async (e) => {
        const row = e.target.closest('.nav-mini-item');
        if (!row) return;
        const ownerUid = list.dataset.uid;
        if (!ownerUid) return;
        const inboxMsgId = String(row.dataset.msgId || '').trim();
        if (inboxMsgId) {
          updateDoc(doc(db, 'user_inbox', ownerUid, 'messages', inboxMsgId), {
            read: true,
            readAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => null);

          const convId = String(row.dataset.conv || '').trim();
          if (convId) {
            e.preventDefault();
            const isMessagesPage = String(location.pathname || '').toLowerCase().includes('mensajes');
            const miniApi = window.__avMiniChatApi;
            if (!isMessagesPage && miniApi && typeof miniApi.openConversation === 'function') {
              miniApi.openConversation(convId);
              return;
            }
            location.href = `mensajes.html?conv=${encodeURIComponent(convId)}`;
          }
          return;
        }

        const rowKind = String(row.dataset.kind || '').trim();
        if (rowKind === 'broadcast') {
          const ts = Number(row.dataset.time || 0);
          try {
            const current = Number(localStorage.getItem(`av_broadcast_seen_${ownerUid}`) || 0);
            if (Number.isFinite(ts) && ts > current) {
              localStorage.setItem(`av_broadcast_seen_${ownerUid}`, String(ts));
            }
          } catch {}
          return;
        }

        const item = row.matches('[data-conv]') ? row : null;
        if (!item) return;
        const convId = item.dataset.conv;
        if (!convId) return;
        e.preventDefault();
        try {
          await updateDoc(doc(db, 'conversations', convId), {
            [`reads.${ownerUid}`]: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {}
        const isMessagesPage = String(location.pathname || '').toLowerCase().includes('mensajes');
        const miniApi = window.__avMiniChatApi;
        if (!isMessagesPage && miniApi && typeof miniApi.openConversation === 'function') {
          miniApi.openConversation(convId);
          return;
        }
        location.href = `mensajes.html?conv=${encodeURIComponent(convId)}`;
      });
    }
    try {
      const convSnap = await getDocs(
        query(
          collection(db, 'conversations'),
          where('participants', 'array-contains', uid),
        ),
      );
      const items = convSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      items.sort((a, b) => {
        const aTime = toDateMaybe(a.lastAt) || toDateMaybe(a.createdAt);
        const bTime = toDateMaybe(b.lastAt) || toDateMaybe(b.createdAt);
        return (bTime?.getTime() || 0) - (aTime?.getTime() || 0);
      });

      const unreadConversations = items.filter((item) => {
        const lastAt = toDateMaybe(item.lastAt);
        if (!lastAt) return false;
        if (item.lastMessage?.senderId === uid) return false;
        const readRaw = item.reads ? item.reads[uid] : null;
        const readAt = toDateMaybe(readRaw);
        if (!readAt) return true;
        return lastAt.getTime() > readAt.getTime();
      }).length;

      const broadcastSnap = await getDocs(
        query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(4)),
      );

      let seenBroadcastAt = 0;
      try {
        seenBroadcastAt = Number(localStorage.getItem(`av_broadcast_seen_${uid}`) || 0);
      } catch {
        seenBroadcastAt = 0;
      }

      const conversationRows = items.map((item) => {
        const title =
          item.title ||
          (item.type === 'support'
            ? 'Soporte'
            : item.type === 'group'
              ? 'Grupo'
              : '') ||
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
        return {
          key: `conv:${item.id}`,
          href: `mensajes.html?conv=${encodeURIComponent(item.id)}`,
          convId: item.id,
          title: String(title || 'Conversación'),
          text,
          time: lastAt?.getTime() || toDateMaybe(item.createdAt)?.getTime() || 0,
          isUnread: !!isUnread,
        };
      });

      const broadcastRows = (broadcastSnap.docs || []).map((d) => {
        const b = d.data() || {};
        const ts = toDateMaybe(b.createdAt)?.getTime() || 0;
        const rawLink = String(b.link || 'mensajes.html').trim();
        const href = rawLink.includes('notificaciones.html')
          ? 'mensajes.html'
          : safeHref(rawLink, 'mensajes.html');
        return {
          key: `broadcast:${d.id}`,
          href,
          convId: '',
          title: String(b.title || 'Mensaje del equipo'),
          text: String(b.body || ''),
          time: ts,
          isUnread: ts > seenBroadcastAt,
        };
      });

      const rows = [
        ...conversationRows.filter((r) => r.isUnread),
        ...broadcastRows.filter((r) => r.isUnread),
      ]
        .sort((a, b) => (b.time || 0) - (a.time || 0))
        .slice(0, 8);

      const unread = unreadConversations + broadcastRows.filter((r) => r.isUnread).length;
      setBadge(badge, unread);

      if (!rows.length) {
        list.innerHTML =
          '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
        return;
      }

      list.innerHTML = rows
        .map((row) => {
          const href = esc(safeHref(row.href, 'mensajes.html'));
          const title = esc(String(row.title || 'Conversacion'));
          const text = esc(String(row.text || ''));
          return `<a class="nav-mini-item is-unread" href="${href}" data-kind="${row.convId ? 'conversation' : 'broadcast'}" data-time="${Number(row.time || 0)}" ${row.convId ? `data-conv="${esc(row.convId)}"` : ''}>
            <div class="nav-mini-title">${title}</div>
            ${text ? `<div class="nav-mini-body">${text}</div>` : ''}
          </a>`;
        })
        .join('');
    } catch (e) {
      try {
        const inboxSnap = await getDocs(
          query(
            collection(db, 'user_inbox', uid, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(20),
          ),
        );
        const inboxItems = inboxSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        const unreadItems = inboxItems.filter((i) => i.read !== true).slice(0, 8);
        setBadge(badge, unreadItems.length);
        if (!unreadItems.length) {
          list.innerHTML = '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
          return;
        }
        list.innerHTML = unreadItems
          .map((item) => {
            const convId = String(item.sourceConvId || '').trim();
            const href = convId
              ? `mensajes.html?conv=${encodeURIComponent(convId)}`
              : 'mensajes.html';
            const title = String(
              item.fromName ||
                item.fromEmail ||
                item.fromUid ||
                item.senderName ||
                'Usuario',
            ).trim();
            const text = String(item.text || '').trim();
            return `<a class="nav-mini-item is-unread" href="${esc(safeHref(href, 'mensajes.html'))}" data-msg-id="${esc(String(item.id || ''))}" ${convId ? `data-conv="${esc(convId)}"` : ''}>
              <div class="nav-mini-title">${esc(title || 'Usuario')}</div>
              ${text ? `<div class="nav-mini-body">${esc(text)}</div>` : ''}
            </a>`;
          })
          .join('');
      } catch (legacyErr) {
        console.warn('[messages] load failed', e);
        console.warn('[messages] inbox fallback failed', legacyErr);
        setBadge(badge, 0);
        list.innerHTML = '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
      }
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
    wireMiniMenu(navMsgWrap, navMsgBtn, navMsgMenu, () => {
      if (!CURRENT_USER?.uid) return;
      try {
        localStorage.setItem(
          `av_broadcast_seen_${CURRENT_USER.uid}`,
          String(Date.now()),
        );
      } catch {}
      loadMsgDropdown(CURRENT_USER.uid).catch(() => null);
    });

    if (
      profileWrap &&
      profileToggle &&
      profileMenu &&
      !profileWrap.dataset.wired
    ) {
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

  function scrollToSection(hash, extraOffset = 0) {
    if (!hash || !hash.startsWith('#')) return false;
    const target = document.getElementById(hash.slice(1));
    if (!target) return false;
    const header = document.querySelector('.nav-glass');
    const offset = header ? header.getBoundingClientRect().height + extraOffset : extraOffset;
    const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', hash);
    return true;
  }

  function setupHeroShortcuts() {
    // Rely on native anchor navigation (keeps hash scrolling on index and navigation on other pages)
  }

  function setContactFormStatus(form, text, bad = false) {
    if (!form) return;
    let status = form.querySelector('[data-contact-status="1"]');
    if (!status) {
      status = document.createElement('div');
      status.setAttribute('data-contact-status', '1');
      status.className = 'hintSmall';
      status.style.marginTop = '10px';
      form.appendChild(status);
    }
    status.textContent = String(text || '').trim();
    status.style.display = text ? 'block' : 'none';
    status.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
  }

  function setupContactForm() {
    const form = document.querySelector('form.contactFormCard');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';

    const emailEl = form.querySelector('#contactEmail');
    const msgEl = form.querySelector('#contactMsg');
    const privacyEl = form.querySelector('#contactPrivacy');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (CURRENT_USER?.email && emailEl && !emailEl.value) {
      emailEl.value = CURRENT_USER.email;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = String(emailEl?.value || CURRENT_USER?.email || '')
        .trim()
        .toLowerCase();
      const message = String(msgEl?.value || '').trim();
      const privacyOk = !!privacyEl?.checked;

      if (!email || !message || !privacyOk) {
        setContactFormStatus(form, 'Completa email, mensaje y privacidad.', true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      setContactFormStatus(form, 'Enviando...');

      try {
        await addDoc(collection(db, 'contact_messages'), {
          email,
          message,
          source: 'index_contact_form',
          page: String(location.pathname || '/'),
          uid: CURRENT_USER?.uid || null,
          userEmail: CURRENT_USER?.email || null,
          status: 'new',
          createdAt: serverTimestamp(),
        });
        if (msgEl) msgEl.value = '';
        setContactFormStatus(form, 'Mensaje enviado. Gracias!');
      } catch (err) {
        console.warn('[contact form] send failed', err);
        const subject = encodeURIComponent('Mensaje desde AquiVivo');
        const body = encodeURIComponent(`Email: ${email}\n\n${message}`);
        const mailto = `mailto:aquivivo.pl@gmail.com?subject=${subject}&body=${body}`;
        setContactFormStatus(
          form,
          'No se pudo guardar en el sistema. Abriendo correo.',
          true,
        );
        window.setTimeout(() => {
          window.location.href = mailto;
        }, 120);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  bustStylesCache();
  const mount = ensureMount();
  const footerMount = ensureFooterMount();
  injectSidePanel();
  upgradeInfoCardsToAccordions();
  setupContactForm();

  // Render immediately + re-render on auth changes
  onAuthStateChanged(auth, async (user) => {
    CURRENT_USER = user || null;
    CURRENT_DOC = null;
    let isAdmin = false;
    if (user?.uid) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        let data = snap.exists() ? snap.data() || {} : {};

        // Ensure the user doc exists (needed by Firestore rules: notBlocked()/hasUserDoc()).
        if (!snap.exists()) {
          let email = String(user?.email || '').trim();
          try {
            const token = await user.getIdTokenResult?.();
            const tokenEmail = String(token?.claims?.email || '').trim();
            if (tokenEmail) email = tokenEmail;
          } catch {}
          if (email) {
            const payload = {
              email,
              emailLower: email.toLowerCase(),
              admin: false,
              blocked: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            };
            try {
              await setDoc(userRef, payload, { merge: true });
              data = payload;
            } catch (e) {
              console.warn('[layout] failed to create user doc', e);
            }
          }
        }

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
    setupContactForm();
    const contactEmailInput = document.getElementById('contactEmail');
    if (user?.email && contactEmailInput && !contactEmailInput.value) {
      contactEmailInput.value = user.email;
    }

    if (user?.uid) startBadgeRefresh(user.uid);
    else startBadgeRefresh(null);

    if (user?.uid) {
      initGlobalMiniChat({
        uid: user.uid,
        displayName:
          profile?.displayName ||
          profile?.name ||
          user?.displayName ||
          user?.email ||
          'Usuario',
      });
    } else {
      destroyGlobalMiniChat();
    }

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
    await trackDailyActivity(user, isAdmin);
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
