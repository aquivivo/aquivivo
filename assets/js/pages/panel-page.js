// assets/js/pages/panel-page.js
// Panel użytkownika: status dostępu + kody promo
// Dodatki:
// - jeśli w URL jest ?as=UID i zalogowany jest admin, pokazuje podgląd panelu danego usera (read-only)
// - jeśli layout.js przekierował z reason=blocked, pokazuje komunikat

import { auth, db, storage } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan } from '../plan-levels.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  Timestamp,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const AS_UID = (qs.get('as') || '').trim(); // admin preview

function toCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

function ensureMsgBox() {
  let box = document.getElementById('promoMsg');
  if (!box) {
    const anchor =
      document.getElementById('promoList')?.parentElement ||
      document.getElementById('lastActivityCard');
    if (anchor) {
      box = document.createElement('div');
      box.id = 'promoMsg';
      box.className = 'hintSmall';
      box.style.marginTop = '10px';
      box.style.display = 'none';
      anchor.insertBefore(box, anchor.firstChild);
    }
  }
  return box;
}

function setMsg(text, kind = 'ok') {
  const box = ensureMsgBox();
  if (!box) return;
  if (!text) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.style.display = 'block';
  box.textContent = text;
  box.style.color =
    kind === 'bad'
      ? '#ffd1d7'
      : kind === 'warn'
        ? '#ffe08a'
        : 'rgba(255,255,255,0.92)';
}

function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatShortDate(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '';
  }
}

function toDateMaybe(ts) {
  try {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts?.toDate) return ts.toDate();
    if (ts?.seconds != null) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function summarizeProgressDocs(docs) {
  const total = docs.length;
  let completed = 0;
  let practiceSum = 0;
  let practiceCount = 0;
  let testSum = 0;
  let testCount = 0;
  let lastTs = null;

  docs.forEach((d) => {
    const data = d.data() || {};
    if (data.completed === true) completed += 1;

    const practice = Number(data.practicePercent);
    if (!Number.isNaN(practice)) {
      practiceSum += practice;
      practiceCount += 1;
    }

    const testTotal = Number(data.testTotal || 0);
    const testScore = Number(data.testScore);
    if (testTotal > 0 && !Number.isNaN(testScore)) {
      testSum += testScore;
      testCount += 1;
    }

    const ts = data.lastActivityAt || data.updatedAt || data.completedAt || null;
    const dt = toDateMaybe(ts);
    if (dt && (!lastTs || dt.getTime() > lastTs.getTime())) lastTs = dt;
  });

  const practiceAvg = practiceCount ? Math.round(practiceSum / practiceCount) : null;
  const testAvg = testCount ? Math.round(testSum / testCount) : null;

  return {
    topicsTotal: total,
    topicsCompleted: completed,
    practiceAvg,
    testAvg,
    lastActivity: lastTs,
  };
}

async function loadProgressSummary(uid) {
  if (!uid) return;
  const tEl = $('progTopics');
  const cEl = $('progCompleted');
  const pEl = $('progPractice');
  const teEl = $('progTest');
  const lEl = $('progLastActivity');

  if (tEl) tEl.textContent = 'Temas: -';
  if (cEl) cEl.textContent = 'Completados: -';
  if (pEl) pEl.textContent = 'Práctica: -';
  if (teEl) teEl.textContent = 'Test: -';
  if (lEl) lEl.textContent = 'Última actividad: -';

  try {
    const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const summary = summarizeProgressDocs(snap.docs || []);

    if (tEl) tEl.textContent = `Temas: ${summary.topicsTotal}`;
    if (cEl)
      cEl.textContent = `Completados: ${summary.topicsCompleted}/${summary.topicsTotal}`;
    if (pEl)
      pEl.textContent =
        summary.practiceAvg == null ? 'Práctica: -' : `Práctica: ${summary.practiceAvg}%`;
    if (teEl)
      teEl.textContent = summary.testAvg == null ? 'Test: -' : `Test: ${summary.testAvg}%`;
    if (lEl) {
      const dt = summary.lastActivity ? formatShortDate(summary.lastActivity) : '';
      lEl.textContent = dt ? `Última actividad: ${dt}` : 'Última actividad: -';
    }
  } catch (e) {
    console.warn('loadProgressSummary failed', e);
  }
}

async function loadReviewSummary(uid) {
  if (!uid) return;
  const dueEl = $('reviewDue');
  const overEl = $('reviewOverdue');
  const newEl = $('reviewNew');
  const planEl = $('reviewPlan');
  const weekEl = $('reviewWeek');
  const hintEl = $('reviewHint');

  if (dueEl) dueEl.textContent = 'Na dziś: -';
  if (overEl) overEl.textContent = 'Zaległe: -';
  if (newEl) newEl.textContent = 'Nowe: -';
  if (hintEl) hintEl.textContent = '';
  if (planEl) planEl.textContent = 'Plan: 10 min dziennie';
  if (weekEl) weekEl.innerHTML = '';

  try {
    const snap = await getDocs(collection(db, 'user_spaced', uid, 'cards'));
    if (snap.empty) {
      if (hintEl) hintEl.textContent = 'Brak danych. Uruchom powtórki.';
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayMs = 24 * 60 * 60 * 1000;
    const weekCounts = Array(7).fill(0);
    let due = 0;
    let overdue = 0;

    snap.forEach((d) => {
      const data = d.data() || {};
      const dueAt = toDateMaybe(data.dueAt);
      if (!dueAt) return;
      const diff = Math.floor((dueAt.getTime() - today.getTime()) / dayMs);
      if (diff <= 0) {
        due += 1;
        if (dueAt.getTime() < now.getTime()) overdue += 1;
      }
      if (diff >= 0 && diff < 7) weekCounts[diff] += 1;
    });

    if (dueEl) dueEl.textContent = `Na dziś: ${due}`;
    if (overEl) overEl.textContent = `Zaległe: ${overdue}`;
    if (newEl) newEl.textContent = 'Nowe: +';

    if (weekEl) {
      const labels = ['Dziś', 'Jutro', 'D+2', 'D+3', 'D+4', 'D+5', 'D+6'];
      weekEl.innerHTML = weekCounts
        .map(
          (c, i) =>
            `<div class="reviewDay"><span>${labels[i]}</span><b>${c}</b></div>`,
        )
        .join('');
    }
  } catch (e) {
    console.warn('loadReviewSummary failed', e);
  }
}

async function ensureUserDoc(user) {
  if (!user?.uid) return { admin: false, access: false, plan: 'free' };

  const defaults = {
    admin: false,
    access: false,
    plan: 'free',
    promoCodes: [],
    blocked: false,
  };

  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(
        ref,
        {
          email: user.email || '',
          admin: false,
          access: false,
          plan: 'free',
          promoCodes: [],
          blocked: false,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      return { ...defaults, email: user.email || '' };
    }

    const data = snap.data() || {};
    const patch = {};
    let needPatch = false;

    if (typeof data.email !== 'string') {
      patch.email = user.email || '';
      needPatch = true;
    }
    if (typeof data.admin !== 'boolean') {
      patch.admin = false;
      needPatch = true;
    }
    if (typeof data.access === 'undefined') {
      patch.access = false;
      needPatch = true;
    }
    if (typeof data.plan !== 'string') {
      patch.plan = 'free';
      needPatch = true;
    }
    if (!Array.isArray(data.promoCodes)) {
      patch.promoCodes = [];
      needPatch = true;
    }
    if (typeof data.blocked !== 'boolean') {
      patch.blocked = false;
      needPatch = true;
    }
    if (!data.createdAt) {
      patch.createdAt = serverTimestamp();
      needPatch = true;
    }

    const isAdminUser =
      user?.email === 'aquivivo.pl@gmail.com' ||
      data?.admin === true ||
      data?.role === 'admin';

    if (needPatch && isAdminUser) await setDoc(ref, patch, { merge: true });

    return {
      ...defaults,
      email: data?.email || user.email || '',
      ...data,
      ...(needPatch && isAdminUser ? patch : {}),
    };
  } catch (e) {
    console.warn('ensureUserDoc failed', e);
    return {
      ...defaults,
      email: user.email || '',
    };
  }
}

function computeFlags(userDoc) {
  const isAdmin = userDoc?.admin === true;
  const plan = String(userDoc?.plan || 'free').toLowerCase();
  const access = userDoc?.access === true;

  const levels = parseAccessLevels(userDoc);

  const until = userDoc?.accessUntil || null;
  const untilDate = until?.toDate
    ? until.toDate()
    : until
      ? new Date(until)
      : null;
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

  const blocked = userDoc?.blocked === true;

  const hasAccess =
    isAdmin ||
    ((plan === 'premium' || (access === true && levels.length === 0)) &&
      isUntilValid);

  return {
    isAdmin,
    plan,
    access,
    hasAccess,
    until,
    hasUntil,
    isUntilValid,
    blocked,
  };
}

function renderAdminUI(isAdmin) {
  const badge = $('adminBadge');
  if (badge) badge.textContent = `(admin: ${isAdmin ? 'sí' : 'no'})`;

  const wrap = $('adminLinkWrap');
  if (wrap) {
    wrap.innerHTML = '';
  }
}

function renderCourses(userDoc, flags) {
  const host = $('coursesCards');
  if (!host) return;

  const levels = [
    { lvl: 'A1', title: 'A1 — Principiante', subtitle: 'Empieza desde cero.' },
    { lvl: 'A2', title: 'A2 — Básico', subtitle: 'Refuerza lo esencial.' },
    { lvl: 'B1', title: 'B1 — Intermedio', subtitle: 'Comunicación diaria.' },
    { lvl: 'B2', title: 'B2 — Avanzado', subtitle: 'Fluidez y matices.' },
  ];

  const canOpen = (lvl) => hasLevelAccess(flags, userDoc, lvl);

  host.innerHTML = levels
    .map(({ lvl, title, subtitle }) => {
      const href = `course.html?level=${encodeURIComponent(lvl)}`;
      const unlocked = canOpen(lvl);

      if (unlocked) {
        return `
          <a class="courseCard" href="${href}" style="text-decoration:none; color:inherit;">
            <div class="courseTop">
              <div class="courseBadge">📚 ${lvl}</div>
                <div class="muted" style="font-weight:900;">Entrar →</div>
            </div>
            <div class="courseTitle" style="margin-top:10px;">${title}</div>
            <div class="muted" style="margin-top:6px;">${subtitle}</div>
          </a>
        `;
      }

      return `
        <div class="courseCard" style="opacity:.55; filter:saturate(.75); cursor:not-allowed;">
          <div class="courseTop">
            <div class="courseBadge">🔒 ${lvl}</div>
            <div class="muted" style="font-weight:900;">Bloqueado</div>
          </div>
          <div class="courseTitle" style="margin-top:10px;">${title}</div>
          <div class="muted" style="margin-top:6px;">${subtitle}</div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <a class="btn-yellow" href="services.html?level=${encodeURIComponent(lvl)}" style="text-decoration:none;">Activar acceso</a>
            <a class="btn-white-outline" href="services.html" style="text-decoration:none;">Ver planes</a>
          </div>
        </div>
      `;
    })
    .join('');
}

function parseAccessLevels(userDoc) {
  // ✅ Primary source of truth: users.levels (A1/A2/B1/B2)
  const rawLevels = userDoc?.levels;
  if (Array.isArray(rawLevels)) {
    return rawLevels.map((x) => String(x).toUpperCase()).filter(Boolean);
  }

  // Backward compatibility: users.accessLevels
  const raw = userDoc?.accessLevels;
  if (Array.isArray(raw))
    return raw.map((x) => String(x).toUpperCase()).filter(Boolean);

  // Fallback: plan mapping (legacy + Stripe planId)
  const fromPlan = levelsFromPlan(userDoc?.plan);
  return fromPlan;
}

function hasLevelAccess(flags, userDoc, level) {
  const lvl = String(level || '').toUpperCase();
  if (flags?.isAdmin) return true;
  const levels = parseAccessLevels(userDoc);
  const allowed = flags?.hasAccess || levels.includes(lvl);
  if (!allowed) return false;
  if (!flags?.isUntilValid) return false;
  return true;
}

function renderPlans(userDoc, flags) {
  const card = $('plansCard');
  if (!card) return;

  const subtitle = $('plansSubtitle');
  const status = $('plansStatus');

  const levels = parseAccessLevels(userDoc);
  const hasAnyLevel = levels.length > 0;

  const chunks = [];
  if (flags?.isAdmin) chunks.push('admin');
  if (flags?.hasAccess && !flags?.isAdmin && !hasAnyLevel)
    chunks.push('premium');
  if (hasAnyLevel) chunks.push(`niveles: ${levels.join(', ')}`);
  if (!chunks.length) chunks.push('sin acceso');

  if (status) {
    status.style.display = 'block';
    status.textContent = `Estado: ${chunks.join(' · ')}`;
  }
  if (subtitle) {
    subtitle.textContent =
      'Elige un paquete. Las consultas son un add‑on (no desbloquean lecciones).';
  }

  // Consultations add-on (does NOT unlock lessons)
  const included = Number(userDoc?.consultationsIncluded || 0);
  const left = Number(
    userDoc?.consultationsLeft ??
      userDoc?.consultationsRemaining ??
      included ??
      0,
  );

  const c1 = $('consultIncluded');
  const c2 = $('consultLeft');
  if (c1) c1.textContent = `Incluidas: ${included}`;
  if (c2) c2.textContent = `Restantes: ${left}`;

  const consultCTA = $('btnConsultCTA');
  if (consultCTA) {
    // Configure your booking link here (Calendly / WhatsApp / your page)
    const url = String(userDoc?.consultationsBookingUrl || '').trim();
    consultCTA.href = url || '#';
    consultCTA.onclick = (e) => {
      if ((consultCTA.getAttribute('href') || '#') === '#') {
        e.preventDefault();
        setMsg('Configura el enlace de reserva en el admin.', 'warn');
      }
    };
  }

  // Scroll to promo input
  card.querySelectorAll('[data-act="scrollPromo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = $('adm_promo_code');
      box?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      box?.focus?.();
    });
  });
}

function renderPromoList(userDoc) {
  const host = $('promoList');
  if (!host) return;

  const codes = Array.isArray(userDoc?.promoCodes) ? userDoc.promoCodes : [];
  if (!codes.length) {
    host.textContent = '—';
    return;
  }

  host.innerHTML = codes
    .slice(0, 20)
    .map(
      (c) =>
        `<span style="margin-right:8px; margin-bottom:8px; display:inline-flex;">🏷️ ${String(c)}</span>`,
    )
    .join('');
}

async function logAccess(uid, action, details = {}) {
  try {
    await addDoc(collection(db, 'users', uid, 'access_logs'), {
      action,
      details,
      byUid: uid, // self (promo by user)
      byEmail: auth.currentUser?.email || null,
      createdAt: serverTimestamp(),
    });
  } catch {}
}

async function applyPromoCode(targetUid, targetDoc) {
  const input = $('adm_promo_code');
  const btn = $('addPromoBtn');
  const raw = input ? input.value : '';
  const code = toCode(raw);

  if (!code) {
    setMsg('Introduce un código.', 'warn');
    return;
  }

  setMsg('');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Aplicando…';
  }

  try {
    if (AS_UID) {
      setMsg('Modo vista: no puedes aplicar códigos aquí.', 'warn');
      return;
    }

    const promoRef = doc(db, 'promo_codes', code);
    const promoSnap = await getDoc(promoRef);

    if (!promoSnap.exists()) {
      setMsg('Código inválido.', 'bad');
      return;
    }

    const promo = promoSnap.data() || {};
    if (promo.active === false) {
      setMsg('Este código está desactivado.', 'bad');
      return;
    }

    const usedCodes = Array.isArray(targetDoc?.promoCodes)
      ? targetDoc.promoCodes
      : [];
    if (usedCodes.includes(code) && promo.repeatable !== true) {
      setMsg('Ya usaste este código.', 'warn');
      return;
    }

    const expDate = toDateMaybe(promo.expiresAt || promo.expiresOn);
    if (expDate && expDate.getTime() < Date.now()) {
      setMsg(`Este código expiró (${formatDate(expDate)}).`, 'bad');
      return;
    }

    const days = Number(promo.days || promo.durationDays || 0);
    const grantPlan = String(promo.plan || 'premium').toLowerCase();
    const stackDays = promo.stackDays !== false;

    const now = new Date();
    const currentUntil = targetDoc?.accessUntil?.toDate
      ? targetDoc.accessUntil.toDate()
      : null;
    const base =
      stackDays && currentUntil && currentUntil.getTime() > now.getTime()
        ? currentUntil
        : now;
    const newUntil = new Date(
      base.getTime() + Math.max(0, days) * 24 * 60 * 60 * 1000,
    );

    const mappedPlan = grantPlan === 'premium' ? 'premium' : grantPlan;
    const levels = levelsFromPlan(mappedPlan);
    const payload = {
      updatedAt: serverTimestamp(),
      promoCodes: arrayUnion(code),
      plan: mappedPlan,
      levels,
      access: true,
    };
    if (days > 0) payload.accessUntil = Timestamp.fromDate(newUntil);

    await updateDoc(doc(db, 'users', targetUid), payload);
    await logAccess(targetUid, 'promo_applied', { code, days });

    if (input) input.value = '';
    setMsg('Código aplicado ✅', 'ok');
  } catch (e) {
    console.error(e);
    setMsg('Error aplicando el código. Intenta de nuevo.', 'bad');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Aplicar';
    }
  }
}

function showBlockedBanner() {
  const reason = new URLSearchParams(location.search).get('reason');
  if (reason === 'blocked') {
    setMsg(
      '⛔ Tu cuenta está bloqueada. Contacta con el administrador.',
      'bad',
    );
  }
}

/* ----------------------- MY REFERRAL CODE ----------------------- */
const myRefCode = $('myRefCode');
const btnCopyMyRefCode = $('btnCopyMyRefCode');
const myRefInfo = $('myRefInfo');

const avatarWrap = $('userAvatarWrap');
const avatarImg = $('userAvatarImg');
const avatarFallback = $('userAvatarFallback');
const avatarFile = $('avatarFile');
const btnAvatarUpload = $('btnAvatarUpload');
const btnAvatarRemove = $('btnAvatarRemove');
const avatarMsg = $('avatarMsg');

function setAvatarMsg(text, bad = false) {
  if (!avatarMsg) return;
  avatarMsg.textContent = text || '';
  avatarMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function renderAvatar(url) {
  if (!avatarWrap || !avatarImg) return;
  if (url) {
    avatarImg.src = url;
    avatarWrap.classList.add('hasImage');
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
  }
}

async function uploadAvatar(uid, file, currentPath) {
  if (!uid || !file) return null;
  if (!file.type.startsWith('image/')) {
    setAvatarMsg('Solo imagenes (JPG/PNG/WebP).', true);
    return null;
  }
  const maxMb = 3;
  if (file.size > maxMb * 1024 * 1024) {
    setAvatarMsg(`Max ${maxMb}MB.`, true);
    return null;
  }

  const path = `avatars/${uid}/profile_${Date.now()}`;
  const refObj = storageRef(storage, path);

  try {
    setAvatarMsg('Subiendo...');
    await uploadBytes(refObj, file, { contentType: file.type });
    const url = await getDownloadURL(refObj);
    try {
      await updateDoc(doc(db, 'users', uid), {
        photoURL: url,
        photoPath: path,
        updatedAt: serverTimestamp(),
      });

      if (currentPath) {
        try {
          await deleteObject(storageRef(storage, currentPath));
        } catch {}
      }

      renderAvatar(url);
      setAvatarMsg('Foto guardada.');
      return { url, path };
    } catch (e) {
      console.error('update profile photo failed', e);
      renderAvatar(url);
      setAvatarMsg(
        'Foto subida, pero no se pudo guardar en tu perfil. Revisa reglas de Firestore.',
        true,
      );
      return { url, path };
    }
  } catch (e) {
    console.error('uploadAvatar failed', e);
    const code = String(e?.code || '');
    if (code.includes('unauthorized') || code.includes('permission-denied')) {
      setAvatarMsg(
        'No tienes permisos para subir la foto. Revisa reglas de Storage.',
        true,
      );
    } else if (code.includes('bucket-not-found') || code.includes('project-not-found')) {
      setAvatarMsg(
        'No hay bucket de Storage configurado. Activa Storage en Firebase.',
        true,
      );
    } else if (code.includes('canceled')) {
      setAvatarMsg('Subida cancelada.', true);
    } else {
      setAvatarMsg('No se pudo subir la foto.', true);
    }
    return null;
  }
}

async function removeAvatar(uid, currentPath) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid), {
      photoURL: '',
      photoPath: '',
      updatedAt: serverTimestamp(),
    });
    if (currentPath) {
      try {
        await deleteObject(storageRef(storage, currentPath));
      } catch {}
    }
    renderAvatar('');
    setAvatarMsg('Foto eliminada.');
  } catch (e) {
    console.error('removeAvatar failed', e);
    setAvatarMsg('No se pudo eliminar la foto.', true);
  }
}

function renderMyRefCode(userDoc) {
  if (!myRefCode) return;
  const code = String(userDoc?.refCode || '').trim();
  if (!code) {
    myRefCode.value = '';
    if (myRefInfo) myRefInfo.textContent = 'El código se crea solito ✨';
    return;
  }
  myRefCode.value = code;
  if (myRefInfo) myRefInfo.textContent = 'Cópialo y compártelo.';
}

async function ensureMyRefCode(viewUid, viewDoc) {
  // Do not generate in admin preview
  if (typeof AS_UID !== 'undefined' && AS_UID) return viewDoc;

  const current = String(viewDoc?.refCode || '').trim();
  if (current) return viewDoc;

  try {
    const user = auth.currentUser;
    if (!user?.uid || user.uid !== viewUid) return viewDoc;

    const code = genRefCode(
      viewDoc?.displayName || viewDoc?.email || user.email || viewUid,
    );
    await updateDoc(doc(db, 'users', viewUid), {
      refCode: code,
      refCodeCreatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...(viewDoc || {}), refCode: code };
  } catch (e) {
    console.warn('ensureMyRefCode failed', e);
    return viewDoc;
  }
}

btnCopyMyRefCode?.addEventListener('click', async () => {
  const code = String(myRefCode?.value || '').trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    if (myRefInfo) myRefInfo.textContent = 'Copiado ✅';
  } catch {
    if (myRefInfo) myRefInfo.textContent = 'No se pudo copiar.';
  }
});

/* ----------------------- REFERRAL APPLY + STATS ----------------------- */
const useRefCode = $('useRefCode');
const btnApplyRefCode = $('btnApplyRefCode');
const applyRefStatus = $('applyRefStatus');

const refStatInvites = $('refStatInvites');
const refStatRewards = $('refStatRewards');
const refRewardsList = $('refRewardsList');

function setInlineStatus(el, text, kind = 'ok') {
  if (!el) return;
  el.textContent = text || '';
  el.style.color =
    kind === 'bad'
      ? '#ffd1d7'
      : kind === 'warn'
        ? '#ffe08a'
        : 'rgba(255,255,255,0.92)';
}

function normCode(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function genRefCode(baseRaw) {
  const base =
    String(baseRaw || 'AQUIVIVO')
      .split('@')[0]
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 6) || 'AQUIVI';

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suf = '';
  for (let i = 0; i < 4; i++)
    suf += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${base}-${suf}`;
}

async function getReferralSettings() {
  try {
    const snap = await getDoc(doc(db, 'promo_codes', '_REFERRAL_SETTINGS'));
    const d = snap.exists() ? snap.data() || {} : {};
    return {
      friendPercent: Number(d.refFriendPercent ?? 0),
      ownerPercent: Number(d.refOwnerPercent ?? 0),
      scope: String(d.refRewardScope || 'inne usługi'),
    };
  } catch {
    return { friendPercent: 0, ownerPercent: 0, scope: 'inne usługi' };
  }
}

async function findUserByRefCode(code) {
  const q1 = query(
    collection(db, 'users'),
    where('refCode', '==', code),
    limit(1),
  );
  const snap = await getDocs(q1);
  let hit = null;
  snap.forEach((d) => {
    if (!hit) hit = d;
  });
  return hit;
}

async function createOwnerReward(ownerUid, settings, referredUid) {
  // Minimal reward record (later you can connect this to checkout/services)
  await addDoc(collection(db, 'rewards'), {
    ownerUid,
    kind: 'PERCENT',
    value: Number(settings.ownerPercent || 0),
    scope: settings.scope || 'inne usługi',
    status: 'AVAILABLE',
    source: 'REFERRAL',
    referredUid: referredUid || null,
    createdAt: serverTimestamp(),
  });
}

async function applyReferralCode(myUid, myDoc) {
  const code = normCode(useRefCode?.value || '');
  if (!code) {
    setInlineStatus(applyRefStatus, 'Escribe un código.', 'warn');
    return;
  }

  // only once per account
  if (myDoc?.referredByCode) {
    setInlineStatus(
      applyRefStatus,
      'Ya tienes un código asociado a tu cuenta.',
      'warn',
    );
    return;
  }

  setInlineStatus(applyRefStatus, 'Verificando…');
  btnApplyRefCode && (btnApplyRefCode.disabled = true);

  try {
    const ownerSnap = await findUserByRefCode(code);
    if (!ownerSnap) {
      setInlineStatus(applyRefStatus, 'No se encontró ese código.', 'bad');
      return;
    }

    const ownerUid = ownerSnap.id;
    if (ownerUid === myUid) {
      setInlineStatus(
        applyRefStatus,
        'No puedes usar tu propio código.',
        'bad',
      );
      return;
    }

    const settings = await getReferralSettings();

    // 1) Mark on user (friend)
    await updateDoc(doc(db, 'users', myUid), {
      referredByUid: ownerUid,
      referredByCode: code,
      referralAppliedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2) Create referral record (status CONFIRMED for now - can be changed to pending once payments exist)
    await addDoc(collection(db, 'referrals'), {
      code,
      ownerUid,
      newUserUid: myUid,
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });
    // 3) Reward is created after referral is CONFIRMED (admin / purchase)

    setInlineStatus(applyRefStatus, 'Código asociado ✅', 'ok');
    if (useRefCode) useRefCode.value = '';
  } catch (e) {
    console.error(e);
    setInlineStatus(applyRefStatus, 'Error. Inténtalo de nuevo.', 'bad');
  } finally {
    btnApplyRefCode && (btnApplyRefCode.disabled = false);
  }
}

/* ----------------------- REWARD REDEEM ----------------------- */
const refRewardsActions = $('refRewardsActions');

function genOneTimeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suf = '';
  for (let i = 0; i < 6; i++)
    suf += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BONO-${suf}`;
}

async function redeemReward(rewardId, rewardData) {
  if (!rewardId) return;

  // Generate a ONE_TIME promo code for the reward and mark reward USED.
  const pct = Number(rewardData?.value || 0);
  const scope = String(rewardData?.scope || 'otros servicios');

  if (
    !confirm(
      `¿Usar recompensa -${pct}% (${scope})? Se generará un cupón de un solo uso.`,
    )
  )
    return;

  try {
    const code = genOneTimeCode();

    // Create promo code document (one-time)
    await setDoc(
      doc(db, 'promo_codes', code),
      {
        code,
        kind: 'ONE_TIME',
        percent: pct,
        plan: 'reward',
        days: 0,
        usageLimit: 1,
        usedCount: 0,
        active: true,
        scope,
        source: 'REWARD',
        rewardId,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Mark reward as used
    await updateDoc(doc(db, 'rewards', rewardId), {
      status: 'USED',
      usedAt: serverTimestamp(),
      promoCode: code,
    });

    alert(`Cupón generado: ${code}`);
  } catch (e) {
    console.error(e);
    alert('Error al usar la recompensa.');
  }
}

async function loadReferralStats(viewUid) {
  if (!viewUid) return;

  // Invites: count referrals where ownerUid == viewUid
  try {
    const qInv = query(
      collection(db, 'referrals'),
      where('ownerUid', '==', viewUid),
      limit(200),
    );
    const snapInv = await getDocs(qInv);
    const invites = snapInv.size || 0;
    if (refStatInvites)
      refStatInvites.textContent = `👥 Recomendaciones: ${invites}`;
  } catch {}

  // Rewards: list AVAILABLE rewards for owner
  try {
    const qRw = query(
      collection(db, 'rewards'),
      where('ownerUid', '==', viewUid),
      where('status', '==', 'AVAILABLE'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    const snapRw = await getDocs(qRw);
    const rewards = [];
    snapRw.forEach((d) => {
      const r = d.data() || {};
      rewards.push({ id: d.id, ...r });
    });
    if (refStatRewards)
      refStatRewards.textContent = `🎫 Recompensas: ${rewards.length}`;
    if (refRewardsList) {
      if (!rewards.length) {
        refRewardsList.textContent = '— Brak dostępnych nagród —';
      } else {
        refRewardsList.innerHTML = rewards
          .map((r) => {
            const pct = Number(r.value || 0);
            const scope = String(r.scope || 'inne usługi');
            return `<div style="display:inline-flex; margin-right:8px; margin-bottom:8px;">🎫 -${pct}% · ${scope}</div>`;
          })
          .join('');
      }
    }
  } catch {}
}

refRewardsList?.addEventListener('click', async (e) => {
  const btn = e.target?.closest?.('button');
  if (!btn) return;
  const act = btn.getAttribute('data-reward-act');
  const id = btn.getAttribute('data-reward-id');
  if (act !== 'use' || !id) return;

  try {
    const snap = await getDoc(doc(db, 'rewards', id));
    if (!snap.exists()) return;
    await redeemReward(id, snap.data() || {});
    const user = auth.currentUser;
    if (user?.uid) await loadReferralStats(user.uid);
  } catch (e) {
    console.error(e);
  }
});

btnApplyRefCode?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user?.uid) return;
  const snap = await getDoc(doc(db, 'users', user.uid));
  const myDoc = snap.exists() ? snap.data() || {} : {};
  await applyReferralCode(user.uid, myDoc);

  // refresh stats after apply
  await loadReferralStats(user.uid);
});

document.addEventListener('DOMContentLoaded', () => {
  const panelTitle = $('panelTitle');
  const panelSubtitle = $('panelSubtitle');
  if (panelTitle) panelTitle.textContent = '¡Buenas!';
  if (panelSubtitle)
    panelSubtitle.innerHTML = 'Aquí tienes tu libreta!<br />¡Qué chimba verte!';

  renderCourses(null, { isAdmin: false, hasAccess: false });

  const btn = $('addPromoBtn');
  const input = $('adm_promo_code');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html?next=espanel.html';
      return;
    }
    try {
      const baseDoc = await ensureUserDoc(user);

      // Admin preview: load target user doc
      let viewUid = user.uid;
      let viewDoc = baseDoc;

      const isAdmin = baseDoc.admin === true;
      if (AS_UID) {
        if (!isAdmin) {
          setMsg('Acceso denegado (solo admin).', 'bad');
          return;
        }
        viewUid = AS_UID;
        const snap = await getDoc(doc(db, 'users', viewUid));
        viewDoc = snap.exists() ? snap.data() || {} : {};
        setMsg(`👀 Vista del panel de: ${viewDoc.email || viewUid}`, 'warn');
      } else {
        showBlockedBanner();
      }

      const emailEl = $('userEmail');
      if (emailEl)
        emailEl.textContent = AS_UID ? viewDoc.email || '—' : user.email || '—';

      if (panelTitle || panelSubtitle) {
        const gender = String(viewDoc.gender || '').toLowerCase();
        if (gender === 'papi') {
          if (panelTitle) panelTitle.textContent = '¡Buenas Papi!';
          if (panelSubtitle)
            panelSubtitle.innerHTML =
              'Aquí tienes tu libreta!<br />¡Qué chimba verte!';
        } else if (gender === 'mami') {
          if (panelTitle) panelTitle.textContent = '¡Buenas Mami!';
          if (panelSubtitle)
            panelSubtitle.innerHTML =
              'Aquí tienes tu libreta!<br />¡Qué chimba verte!';
        } else {
          if (panelTitle) panelTitle.textContent = '¡Buenas!';
          if (panelSubtitle)
            panelSubtitle.textContent =
              'Aqui tienes tu libreta! ¡Que chimba verte!';
        }
      }

      renderAvatar(viewDoc?.photoURL || '');

      if (AS_UID) {
        if (btnAvatarUpload) btnAvatarUpload.disabled = true;
        if (btnAvatarRemove) btnAvatarRemove.disabled = true;
        if (avatarFile) avatarFile.disabled = true;
      } else {
        let avatarPath = String(viewDoc?.photoPath || '');
        btnAvatarUpload?.addEventListener('click', () => avatarFile?.click());
        avatarFile?.addEventListener('change', async (e) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const res = await uploadAvatar(user.uid, file, avatarPath);
          if (res?.path) avatarPath = res.path;
          if (avatarFile) avatarFile.value = '';
        });
        btnAvatarRemove?.addEventListener('click', async () => {
          await removeAvatar(user.uid, avatarPath);
          avatarPath = '';
        });
      }

      renderAdminUI(isAdmin);

      renderPromoList(viewDoc);

      viewDoc = await ensureMyRefCode(viewUid, viewDoc);
      renderMyRefCode(viewDoc);

      await loadReferralStats(viewUid);

      // Referral apply disabled in preview mode
      if (AS_UID) {
        if (useRefCode) useRefCode.disabled = true;
        if (btnApplyRefCode) btnApplyRefCode.disabled = true;
        if (applyRefStatus)
          applyRefStatus.textContent = 'Vista previa (admin) — desactivado.';
      }

      const flags = computeFlags(viewDoc);
      renderCourses(viewDoc, flags);
      renderPlans(viewDoc, flags);
      await loadProgressSummary(viewUid);
      await loadReviewSummary(viewUid);

      if (btn) {
        btn.onclick = async () => {
          const fresh = await getDoc(doc(db, 'users', viewUid));
          const latest = fresh.exists() ? fresh.data() || {} : viewDoc;
          await applyPromoCode(viewUid, latest);

          const after = await getDoc(doc(db, 'users', viewUid));
          const afterDoc = after.exists() ? after.data() || {} : latest;
          renderPromoList(afterDoc);
        };
      }

      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') btn?.click();
        });
      }

      // Disable promo applying in preview mode
      if (AS_UID) {
        if (input) input.disabled = true;
        if (btn) btn.disabled = true;
      }
    } catch (e) {
      console.error('[panel init]', e);
      setMsg('Error de permisos. Revisa reglas de Firestore.', 'bad');
    }
  });
});
