import { auth } from './firebase-init.js';
import './logger.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { db } from './firebase-init.js';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

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

    const title = String(settings?.title || 'Novedad');
    const body = String(settings?.body || '');
    const ctaLabel = String(settings?.ctaLabel || '').trim();
    const ctaUrl = String(settings?.ctaUrl || '').trim();
    const imageUrl = String(settings?.imageUrl || '').trim();

    const overlay = document.createElement('div');
    overlay.id = 'sitePopup';
    overlay.className = 'popup-overlay';
    overlay.innerHTML = `
      <div class="popup-card">
        <button class="popup-close" type="button" aria-label="Cerrar">×</button>
        ${imageUrl ? `<div class="popup-media"><img src="${imageUrl}" alt="banner" /></div>` : ''}
        <div class="popup-title">${title.replace(/</g, '&lt;')}</div>
        ${body ? `<div class="popup-body">${body.replace(/</g, '&lt;')}</div>` : ''}
        ${ctaLabel && ctaUrl ? `<a class="btn-yellow popup-cta" href="${ctaUrl}">${ctaLabel.replace(/</g, '&lt;')}</a>` : ''}
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
    const page = document.body?.dataset?.page || location.pathname.split('/').pop() || 'index';
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

  function avatarInitial(nameOrEmail) {
    const text = String(nameOrEmail || '').trim();
    if (!text) return 'U';
    return text[0].toUpperCase();
  }

  function usePrettyProfile() {
    const host = location.hostname || '';
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    if (host.endsWith('github.io')) return false;
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

  function toDateMaybe(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizePlanKey(planId) {
    return String(planId || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/\s+/g, ' ');
  }

  const KNOWN_LEVELS = ['A1', 'A2', 'B1', 'B2'];

  function normalizeLevelList(raw) {
    const set = new Set();
    const push = (lvl) => {
      if (KNOWN_LEVELS.includes(lvl)) set.add(lvl);
    };

    const addFromValue = (value) => {
      const s = String(value ?? '').toUpperCase();
      const matches = s.match(/A1|A2|B1|B2/g);
      if (!matches) return;
      matches.forEach(push);
    };

    if (Array.isArray(raw)) raw.forEach(addFromValue);
    else addFromValue(raw);

    return Array.from(set);
  }

  function levelsFromPlan(planId) {
    const key = normalizePlanKey(planId);
    const map = {
      a1: ['A1'],
      a2: ['A2'],
      b1: ['B1'],
      b2: ['B2'],
      premium: ['A1', 'A2', 'B1', 'B2'],
      premium_a1: ['A1', 'A2'],
      premium_b1: ['A1', 'A2', 'B1'],
      premium_b2: ['A1', 'A2', 'B1', 'B2'],
      'vip a1 + a2 + b1': ['A1', 'A2', 'B1'],
      'vip a1 + a2 + b1 + b2': ['A1', 'A2', 'B1', 'B2'],
    };
    return map[key] ? [...map[key]] : [];
  }

  function getUserLevels(docData) {
    const rawLevels = normalizeLevelList(docData?.levels);
    if (rawLevels.length) return rawLevels;
    return normalizeLevelList(levelsFromPlan(docData?.plan));
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
      setTrialMessage('\u2705 Trial A1 activado por 7 días.', 'ok');
      return true;
    } catch (e) {
      console.warn('[trial] activation failed', e);
      setTrialMessage('No se pudo activar el trial. Inténtalo de nuevo.');
      return false;
    }
  }

  function updateTrialUI() {
    const btn = document.getElementById('btnTrialA1');
    if (!btn) return;

    if (!CURRENT_USER) {
      btn.disabled = false;
      setTrialMessage('Inicia sesión para activar tu prueba gratuita.');
      return;
    }

    if (!CURRENT_DOC) {
      btn.disabled = true;
      setTrialMessage('\u23F3 Cargando tu estado...');
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
      setTrialMessage('Activa tu prueba gratuita de A1 (7 días).', 'ok');
    } else {
      setTrialMessage(
        'Tu prueba ya fue usada. Vuelve cuando no tengas plan activo o tras un tiempo de inactividad.',
      );
    }
  }

  function setupTrialButton() {
    const btn = document.getElementById('btnTrialA1');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (!CURRENT_USER) {
        localStorage.setItem(TRIAL_INTENT_KEY, '1');
        location.href = 'login.html?next=' + encodeURIComponent('index.html');
        return;
      }
      const ok = await activateTrial(CURRENT_USER, CURRENT_DOC);
      if (ok) updateTrialUI();
    });
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


            <div class="nav-profile" id="navProfile" style="display:none;">
              <div class="nav-icon-wrap" id="navNotifWrap">
                <button class="nav-icon-btn" id="navNotifBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="Notificaciones">
                  &#128276;
                  <span class="nav-badge nav-badge--yellow" id="navNotifBadge" style="display:none;">0</span>
                </button>
                <div class="nav-mini-menu" id="navNotifMenu" role="menu" aria-label="Notificaciones">
                  <div class="nav-mini-head">Notificaciones</div>
                  <div class="nav-mini-list" id="navNotifList">
                    <div class="nav-mini-empty">Sin notificaciones.</div>
                  </div>
                  <a class="nav-mini-footer" href="notificaciones.html">Ver todas</a>
                </div>
              </div>
              <div class="nav-icon-wrap" id="navMsgWrap">
                <button class="nav-icon-btn" id="navMsgBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="Mensajes">
                  &#128172;
                  <span class="nav-badge nav-badge--red" id="navMsgBadge" style="display:none;">0</span>
                </button>
                <div class="nav-mini-menu" id="navMsgMenu" role="menu" aria-label="Mensajes">
                  <div class="nav-mini-head">Mensajes</div>
                  <div class="nav-mini-list" id="navMsgList">
                    <div class="nav-mini-empty">Sin mensajes nuevos.</div>
                  </div>
                  <a class="nav-mini-footer" href="mensajes.html">Ver todos</a>
                </div>
              </div>
              <button class="nav-avatar" id="navAvatarLink" type="button" aria-haspopup="menu" aria-expanded="false">
                <img id="navAvatarImg" alt="Foto de perfil" style="display:none;" />
                <span id="navAvatarFallback">U</span>
              </button>
              <div class="nav-profile-menu" id="navProfileMenu" role="menu" aria-label="Perfil">
                <div class="nav-profile-head">
                  <div class="nav-avatar nav-avatar--small" id="navProfileAvatar">
                    <img id="navProfileAvatarImg" alt="Foto de perfil" style="display:none;" />
                    <span id="navProfileAvatarFallback">U</span>
                  </div>
                  <div>
                    <div class="nav-profile-name" id="navProfileName">Usuario</div>
                    <div class="nav-profile-handle" id="navProfileHandle"></div>
                  </div>
                </div>
                <div class="nav-profile-list">
                  <a class="nav-profile-item" id="navProfilePublic" href="#">&#128100; Perfil</a>
                  <a class="nav-profile-item" href="${hrefPanel}">&#128211; Libreta</a>
                  <a class="nav-profile-item" href="${hrefPanel}#cursos">&#128218; Mis cursos</a>
                  <a class="nav-profile-item" href="referidos.html">&#129309; Recomendar amigos</a>
                  <a class="nav-profile-item" href="ajustes.html">&#9881; Ajustes de cuenta</a>
                  <a class="nav-profile-item" href="pagos.html">&#128179; Historial de pagos</a>
                  <a class="nav-profile-item" href="recompensas.html">&#127942; Mis recompensas</a>
                  <a class="nav-profile-item" href="ayuda.html">&#129509; Ayuda / Reportar</a>
                  <a class="nav-profile-item" id="navProfileAdmin" href="esadmin.html" style="display:none;">&#128737; Admin</a>
                  <div class="nav-profile-sep" aria-hidden="true"></div>
                  <button class="nav-profile-item nav-profile-item--danger" id="navProfileLogout" type="button">Cerrar sesión</button>
                </div>
              </div>
            </div>

            <a class="btn-yellow" id="btnLogin" href="${hrefLogin}" style="display:none;">&#x1F510; Iniciar sesi&oacute;n</a>
            <div class="nav-admin-stack" id="navAdminStack" style="display:none;">

              <a class="btn-yellow" id="btnAdmin" href="esadmin.html" style="display:none;">&#x1F6E1;&#xFE0F; Admin</a>
            </div>
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

    menu.addEventListener('click', (e) => {
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

  function setupServicesPlusCTAs() {
    const tramites = document.getElementById('btnServicesTramites');
    const business = document.getElementById('btnServicesBusiness');
    const go = (hash) => {
      location.href = `services.html${hash || ''}`;
    };
    if (tramites) tramites.addEventListener('click', () => go('#servicios'));
    if (business) business.addEventListener('click', () => go('#extras'));
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
    try {
      const snap = await getDocs(
        query(
          collection(db, 'user_inbox', uid, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(8),
        ),
      );
      const items = snap.docs.map((d) => d.data() || {});
      const unread = items.filter((i) => i.read !== true).length;
      setBadge(badge, unread);
      if (!items.length) {
        list.innerHTML = '<div class="nav-mini-empty">Sin mensajes nuevos.</div>';
        return;
      }
      list.innerHTML = items
        .map((item) => {
          const name = String(item.fromName || item.fromEmail || 'Usuario');
          const text = String(item.text || '');
          return `<div class="nav-mini-item ${item.read ? '' : 'is-unread'}">
            <div class="nav-mini-title">${name}</div>
            ${text ? `<div class="nav-mini-body">${text}</div>` : ''}
          </div>`;
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

  function setupAuthButtons() {
    const btnLogin = document.getElementById('btnLogin');
    const btnAdmin = document.getElementById('btnAdmin');
    const adminStack = document.getElementById('navAdminStack');
    const navProfile = document.getElementById('navProfile');
    const navAvatarLink = document.getElementById('navAvatarLink');
    const navAvatarImg = document.getElementById('navAvatarImg');
    const navAvatarFallback = document.getElementById('navAvatarFallback');
    const navProfileMenu = document.getElementById('navProfileMenu');
    const navProfileAdmin = document.getElementById('navProfileAdmin');
    const navProfileLogout = document.getElementById('navProfileLogout');
    const navProfilePublic = document.getElementById('navProfilePublic');
    const navProfileName = document.getElementById('navProfileName');
    const navProfileHandle = document.getElementById('navProfileHandle');
    const navProfileAvatar = document.getElementById('navProfileAvatar');
    const navProfileAvatarImg = document.getElementById('navProfileAvatarImg');
    const navProfileAvatarFallback = document.getElementById('navProfileAvatarFallback');
    const navNotifWrap = document.getElementById('navNotifWrap');
    const navNotifBtn = document.getElementById('navNotifBtn');
    const navNotifMenu = document.getElementById('navNotifMenu');
    const navMsgWrap = document.getElementById('navMsgWrap');
    const navMsgBtn = document.getElementById('navMsgBtn');
    const navMsgMenu = document.getElementById('navMsgMenu');
    if (!btnLogin) return;

    onAuthStateChanged(auth, async (user) => {
      CURRENT_USER = user || null;
      CURRENT_DOC = null;
      const loggedIn = !!user && user.emailVerified;
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
          console.warn('[layout-index] admin check failed', e);
        }
      }

      btnLogin.style.display = loggedIn ? 'none' : '';

      if (adminStack) adminStack.style.display = loggedIn && isAdmin ? 'flex' : 'none';
      if (btnAdmin) btnAdmin.style.display = loggedIn && isAdmin ? '' : 'none';

      if (navProfile) {
        if (!loggedIn) {
          navProfile.style.display = 'none';
        } else {
          const photoURL = String(CURRENT_DOC?.photoURL || user?.photoURL || '').trim();
          const displayName = String(
            CURRENT_DOC?.displayName ||
              CURRENT_DOC?.name ||
              user?.displayName ||
              user?.email ||
              '',
          ).trim();
          const handle = String(CURRENT_DOC?.handle || '').trim();
          const letter = avatarInitial(displayName || user?.email || '');
          const profileHref = buildProfileHref(handle, user?.uid);

          if (navAvatarFallback) navAvatarFallback.textContent = letter || 'U';
          if (navProfileAvatarFallback) navProfileAvatarFallback.textContent = letter || 'U';
          if (navProfileName) navProfileName.textContent = displayName || user?.email || 'Usuario';
          if (navProfileHandle) navProfileHandle.textContent = handle ? `@${handle}` : '';
          if (navProfilePublic) navProfilePublic.href = profileHref;

          if (photoURL) {
            if (navAvatarImg) {
              navAvatarImg.src = photoURL;
              navAvatarImg.style.display = 'block';
            }
            if (navProfileAvatarImg) {
              navProfileAvatarImg.src = photoURL;
              navProfileAvatarImg.style.display = 'block';
            }
            if (navAvatarLink) navAvatarLink.classList.add('nav-avatar--img');
            if (navProfileAvatar) navProfileAvatar.classList.add('nav-avatar--img');
          } else {
            if (navAvatarImg) {
              navAvatarImg.removeAttribute('src');
              navAvatarImg.style.display = 'none';
            }
            if (navProfileAvatarImg) {
              navProfileAvatarImg.removeAttribute('src');
              navProfileAvatarImg.style.display = 'none';
            }
            if (navAvatarLink) navAvatarLink.classList.remove('nav-avatar--img');
            if (navProfileAvatar) navProfileAvatar.classList.remove('nav-avatar--img');
          }

          if (navProfileAdmin) navProfileAdmin.style.display = loggedIn && isAdmin ? '' : 'none';
          navProfile.style.display = 'inline-flex';
        }
      }

      if (navProfile && navAvatarLink && navProfileMenu && !navProfile.dataset.wired) {
        navProfile.dataset.wired = '1';
        const canHover = window.matchMedia('(hover: hover)').matches;
        let closeTimer = null;
        const open = () => {
          if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
          }
          navProfile.classList.add('open');
          navAvatarLink.setAttribute('aria-expanded', 'true');
        };
        const close = () => {
          navProfile.classList.remove('open');
          navAvatarLink.setAttribute('aria-expanded', 'false');
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
          if (navProfile.classList.contains('open')) close();
          else open();
        };
        if (canHover) {
          navAvatarLink.addEventListener('mouseenter', () => {
            cancelClose();
            open();
          });
          navProfileMenu.addEventListener('mouseenter', () => {
            cancelClose();
            open();
          });
          navAvatarLink.addEventListener('mouseleave', (e) => {
            if (navProfileMenu.contains(e.relatedTarget)) return;
            scheduleClose();
          });
          navProfileMenu.addEventListener('mouseleave', (e) => {
            if (navAvatarLink.contains(e.relatedTarget)) return;
            scheduleClose();
          });
        }
        navAvatarLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        });
        navProfileMenu.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        document.addEventListener('click', (e) => {
          if (!navProfile.contains(e.target)) close();
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') close();
        });
      }

      if (navProfileLogout && !navProfileLogout.dataset.wired) {
        navProfileLogout.dataset.wired = '1';
        navProfileLogout.addEventListener('click', async () => {
          try {
            await signOut(auth);
          } finally {
            location.href = 'index.html';
          }
        });
      }

      if (loggedIn) {
        wireMiniMenu(navNotifWrap, navNotifBtn, navNotifMenu);
        wireMiniMenu(navMsgWrap, navMsgBtn, navMsgMenu);
        startBadgeRefresh(user.uid);
      } else {
        startBadgeRefresh(null);
      }

      idleEnabled = !!user && !isAdmin;
      if (idleEnabled) {
        bindIdleListeners();
        startIdleTimer();
      } else {
        stopIdleTimer();
      }

      updateTrialUI();

      if (loggedIn && localStorage.getItem(TRIAL_INTENT_KEY) === '1') {
        localStorage.removeItem(TRIAL_INTENT_KEY);
        await activateTrial(user, CURRENT_DOC);
        updateTrialUI();
      }

      if (loggedIn) await loadPopupSettings(true);
      await logPageView(user, isAdmin);
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
  setupServicesPlusCTAs();
  setupAuthButtons();
  setupTrialButton();
})();
