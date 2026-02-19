// assets/js/pages/panel-page.js
// Panel użytkownika: status dostępu + kody promo
// Dodatki:
// - jeśli w URL jest ?as=UID i zalogowany jest admin, pokazuje podgląd panelu danego usera (read-only)
// - jeśli layout.js przekierował z reason=blocked, pokazuje komunikat

import { auth, db, storage } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  isQaAdminUser,
  mountQaToolsPanel,
} from '../qa-admin-tools.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  Timestamp,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  startAt,
  endAt,
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
const CHAT_UID = (qs.get('chat') || '').trim();
const QA_MODE = String(qs.get('qa') || '').trim() === '1';
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'];
const SINGLE_COURSE_KEY = 'COURSE_PATH';

function toCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function escHtml(value) {
  return String(value ?? '').replace(/[<>&"]/g, (ch) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  })[ch]);
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
        summary.practiceAvg == null
          ? 'Práctica: -'
          : `Práctica: ${summary.practiceAvg}%`;
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
  const minutesEl = $('reviewMinutes');
  const limitEl = $('reviewLimit');
  const directionEl = $('reviewDirection');
  const saveBtn = $('reviewSave');
  const saveStatus = $('reviewSaveStatus');

  if (dueEl) dueEl.textContent = 'Para hoy: -';
  if (overEl) overEl.textContent = 'Atrasadas: -';
  if (newEl) newEl.textContent = 'Nuevas: -';
  if (hintEl) hintEl.textContent = '';
  if (planEl) planEl.textContent = 'Plan: -';
  if (weekEl) weekEl.innerHTML = '';

  try {
    let settings = {};
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      settings = userSnap.exists() ? userSnap.data() || {} : {};
    } catch {}

    const minutes = Number(settings.reviewDailyMinutes || 10);
    const limit = Number(settings.reviewDailyLimit || 20);
    const direction = String(settings.reviewDirection || 'pl_es');

    if (minutesEl) minutesEl.value = String(minutes);
    if (limitEl) limitEl.value = String(limit);
    if (directionEl) directionEl.value = direction;
    const dirLabel =
      direction === 'es_pl' ? 'ES → PL' : direction === 'mixed' ? 'Mixto' : 'PL → ES';
    if (planEl)
      planEl.textContent = `Plan: ${minutes} min al día · ${limit} tarjetas/día · ${dirLabel}`;

    if (saveBtn && !saveBtn.dataset.wired) {
      saveBtn.dataset.wired = '1';
      saveBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        if (saveStatus) saveStatus.textContent = 'Guardando...';
        const m = Number(minutesEl?.value || 10);
        const l = Number(limitEl?.value || 20);
        const dir = String(directionEl?.value || 'pl_es');
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            reviewDailyMinutes: m,
            reviewDailyLimit: l,
            reviewDirection: dir,
            updatedAt: serverTimestamp(),
          });
          if (saveStatus) saveStatus.textContent = 'Guardado OK';
          setTimeout(() => {
            if (saveStatus) saveStatus.textContent = '';
          }, 2000);
          const dirLabel2 =
            dir === 'es_pl' ? 'ES → PL' : dir === 'mixed' ? 'Mixto' : 'PL → ES';
          if (planEl)
            planEl.textContent = `Plan: ${m} min al día · ${l} tarjetas/día · ${dirLabel2}`;
        } catch (e) {
          console.warn('save review settings failed', e);
          if (saveStatus) saveStatus.textContent = 'Error al guardar';
        }
      });
    }

    const snap = await getDocs(collection(db, 'user_spaced', uid, 'cards'));
    if (snap.empty) {
      if (hintEl) hintEl.textContent = 'Sin datos. Empieza un repaso.';
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

    if (dueEl) dueEl.textContent = `Para hoy: ${due}`;
    if (overEl) overEl.textContent = `Atrasadas: ${overdue}`;
    if (newEl) newEl.textContent = 'Nuevas: -';

    if (weekEl) {
      const labels = ['Hoy', 'Mañana', 'D+2', 'D+3', 'D+4', 'D+5', 'D+6'];
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

async function loadInbox() {
  if (!inboxList) return;
  inboxList.innerHTML = '<div class="muted">Cargando...</div>';
  try {
    const snap = await getDocs(
      query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(10)),
    );
    const items = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (!items.length) {
      inboxList.innerHTML = '<div class="muted">Sin novedades.</div>';
      return;
    }
    inboxList.innerHTML = items
      .map((b) => {
        const title = String(b.title || 'Aviso');
        const body = String(b.body || b.message || '');
        const rawHref = String(b.link || 'mensajes.html').trim();
        const href = rawHref.includes('notificaciones.html')
          ? 'mensajes.html'
          : rawHref;
        return `
          <a class="inboxItem" href="${href}">
            <div class="inboxTitle">${title}</div>
            <div class="inboxBody">${body}</div>
            <div class="inboxDate">${formatDate(b.createdAt)}</div>
          </a>
        `;
      })
      .join('');
  } catch (e) {
    console.warn('loadInbox failed', e);
    inboxList.innerHTML = '<div class="muted">No se pudo cargar.</div>';
  }
}

async function getAuthEmail(user) {
  const fallback = String(user?.email || '').trim();
  try {
    const token = await user?.getIdTokenResult?.();
    const tokenEmail = String(token?.claims?.email || '').trim();
    return tokenEmail || fallback;
  } catch {
    return fallback;
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
      const email = await getAuthEmail(user);
      await setDoc(
        ref,
        {
          email,
          emailLower: email ? email.toLowerCase() : '',
          admin: false,
          access: false,
          plan: 'free',
          promoCodes: [],
          blocked: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return { ...defaults, email };
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

function computeFlags(userDoc, options = {}) {
  const email = String(options?.email || userDoc?.email || '').toLowerCase();
  const isAdmin =
    options?.isAdmin === true ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin' ||
    ADMIN_EMAILS.includes(email);
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

  const hasPaidAccess =
    (plan === 'premium' || (access === true && levels.length === 0)) &&
    (isUntilValid || !hasUntil);
  const hasAccess = isAdmin || levels.length > 0 || hasPaidAccess;

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

function normalizeLevel(raw) {
  const lvl = String(raw || '').trim().toUpperCase();
  return LEVEL_ORDER.includes(lvl) ? lvl : '';
}

function levelRank(level) {
  const idx = LEVEL_ORDER.indexOf(normalizeLevel(level));
  return idx >= 0 ? idx : 999;
}

function baseCourseKeyFromId(rawId, fallback = '') {
  const id = String(rawId || '').trim();
  if (!id) return String(fallback || '').trim();
  const m = id.match(/^([A-Z0-9]+)__(.+)$/i);
  if (m && normalizeLevel(m[1])) return String(m[2] || '').trim() || id;
  return id;
}

function prettifyCourseKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return 'Curso';
  if (key.toUpperCase() === 'COURSE_PATH') return 'Curso completo de polaco';
  return `Curso ${key.replace(/[_-]+/g, ' ').trim()}`;
}

async function loadCourseCatalog() {
  try {
    const snap = await getDocs(collection(db, 'course_paths'));
    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (!docs.length) return [];

    const groups = new Map();
    docs.forEach((row) => {
      const baseKey = baseCourseKeyFromId(row.id, row.courseId || row.slug || '');
      if (!baseKey) return;
      if (!groups.has(baseKey)) groups.set(baseKey, []);
      groups.get(baseKey).push(row);
    });

    const out = [];
    for (const [baseKey, rows] of groups.entries()) {
      const sortedRows = [...rows].sort(
        (a, b) =>
          levelRank(a?.level || String(a?.id || '').split('__')[0]) -
          levelRank(b?.level || String(b?.id || '').split('__')[0]),
      );
      const levels = [];
      sortedRows.forEach((r) => {
        const lvl = normalizeLevel(r?.level || String(r?.id || '').split('__')[0]);
        if (lvl && !levels.includes(lvl)) levels.push(lvl);
      });

      const first = sortedRows[0] || {};
      const title =
        String(first?.title || '').trim() ||
        String(first?.name || '').trim() ||
        prettifyCourseKey(baseKey);
      const subtitle =
        String(first?.subtitle || first?.description || '').trim() ||
        (levels.length
          ? `Niveles: ${levels.join(' · ')}`
          : 'Ruta continua con desbloqueo progresivo.');

      out.push({
        id: baseKey,
        title,
        subtitle,
        levels,
        startLevel: levels[0] || 'A1',
        href: `course.html?level=${encodeURIComponent(levels[0] || 'A1')}&course=${encodeURIComponent(baseKey)}&flow=continuous`,
      });
    }

    return out.sort((a, b) => levelRank(a.startLevel) - levelRank(b.startLevel));
  } catch (e) {
    console.warn('[panel] loadCourseCatalog failed', e);
    return [];
  }
}

async function renderCourses(userDoc, flags) {
  const host = $('coursesCards');
  if (!host) return;

  const catalog = auth.currentUser ? await loadCourseCatalog() : [];
  const fallbackCatalog = [
    {
      id: SINGLE_COURSE_KEY,
      title: 'Curso continuo de polaco',
      subtitle: 'Una sola ruta: modulos en orden, con desbloqueo progresivo.',
      levels: [...LEVEL_ORDER],
      startLevel: 'A1',
      href: `course.html?level=A1&course=${encodeURIComponent(SINGLE_COURSE_KEY)}&flow=continuous`,
    },
  ];
  const list = catalog.length ? catalog : fallbackCatalog;

  host.innerHTML = list
    .map((course) => {
      const start = normalizeLevel(course.startLevel) || 'A1';
      const canEnter = flags?.isAdmin || hasLevelAccess(flags, userDoc, start);
      const levelsTxt = (course.levels || []).join('-') || 'A1-B2';

      if (canEnter) {
        return `
          <a class="courseCard" href="${course.href}" style="text-decoration:none; color:inherit;">
            <div class="courseTop">
              <div class="courseBadge"><span aria-hidden="true">&#x1F4DA;</span> ${levelsTxt}</div>
              <div class="muted" style="font-weight:900;">Entrar &#x2192;</div>
            </div>
            <div class="courseTitle" style="margin-top:10px;">${escHtml(course.title)}</div>
            <div class="muted" style="margin-top:6px;">${escHtml(course.subtitle)}</div>
          </a>
        `;
      }

      return `
        <div class="courseCard" style="opacity:.55; filter:saturate(.75); cursor:not-allowed;">
          <div class="courseTop">
            <div class="courseBadge"><span aria-hidden="true">&#x1F512;</span> ${levelsTxt}</div>
            <div class="muted" style="font-weight:900;">Bloqueado</div>
          </div>
          <div class="courseTitle" style="margin-top:10px;">${escHtml(course.title)}</div>
          <div class="muted" style="margin-top:6px;">${escHtml(course.subtitle)}</div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <a class="btn-yellow" href="services.html?level=${encodeURIComponent(start)}" style="text-decoration:none;">Activar acceso</a>
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
    return normalizeLevelList(rawLevels);
  }

  // Backward compatibility: users.accessLevels
  const raw = userDoc?.accessLevels;
  if (Array.isArray(raw)) return normalizeLevelList(raw);

  // Fallback: plan mapping (legacy + Stripe planId)
  const fromPlan = levelsFromPlan(userDoc?.plan);
  return normalizeLevelList(fromPlan);
}

function hasLevelAccess(flags, userDoc, level) {
  const lvl = String(level || '').toUpperCase();
  if (flags?.isAdmin) return true;
  const levels = parseAccessLevels(userDoc);
  if (levels.includes(lvl)) return true;
  if (!flags?.hasAccess) return false;
  if (flags?.hasUntil && !flags?.isUntilValid) return false;
  return true;
}

function renderPlans(userDoc, flags) {
  const card = $('plansCard');
  if (!card) return;

  const subtitle = $('plansSubtitle');
  const status = $('plansStatus');

  const levels = parseAccessLevels(userDoc);
  const hasAnyLevel = levels.length > 0;

  const untilRaw = userDoc?.accessUntil || null;
  const untilDate = untilRaw?.toDate
    ? untilRaw.toDate()
    : untilRaw
      ? new Date(untilRaw)
      : null;
  const untilOk = !!untilDate && !Number.isNaN(untilDate.getTime());
  const untilTxt = untilOk ? untilDate.toISOString().slice(0, 10) : '';

  const chunks = [];
  if (flags?.blocked) chunks.push('bloqueado');
  if (flags?.isAdmin) chunks.push('admin');
  if (flags?.hasAccess && !flags?.isAdmin && !hasAnyLevel)
    chunks.push('premium');
  if (hasAnyLevel) chunks.push(`niveles: ${levels.join(', ')}`);
  if (untilTxt) chunks.push(flags?.isUntilValid ? `hasta ${untilTxt}` : `caducó ${untilTxt}`);
  if (!chunks.length) chunks.push('sin acceso');

  if (status) {
    status.style.display = 'block';
    status.textContent = `Estado: ${chunks.join(' · ')}`;
  }
  if (subtitle) {
    subtitle.textContent =
      'Elige un paquete. Las consultas son un extra (no desbloquean lecciones).';
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
        `<span style="margin-right:8px; margin-bottom:8px; display:inline-flex;">&#x1F3F7;&#xFE0F; ${String(c)}</span>`,
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
const setDisplayName = $('setDisplayName');
const setHandle = $('setHandle');
const setGender = $('setGender');
const setLang = $('setLang');
const setGoal = $('setGoal');
const setReviewReminders = $('setReviewReminders');
const setPublicProfile = $('setPublicProfile');
const setAllowFriendRequests = $('setAllowFriendRequests');
const setAllowMessages = $('setAllowMessages');
const btnSaveSettings = $('btnSaveSettings');
const settingsMsg = $('settingsMsg');
const userReportType = $('userReportType');
const userReportLevel = $('userReportLevel');
const userReportTopic = $('userReportTopic');
const userReportMessage = $('userReportMessage');
const btnUserReport = $('btnUserReport');
const userReportStatus = $('userReportStatus');
const inboxList = $('inboxList');
const friendCode = $('friendCode');
const btnCopyFriendCode = $('btnCopyFriendCode');
const btnNewFriendCode = $('btnNewFriendCode');
const friendCodeInfo = $('friendCodeInfo');
const communitySearchAvatar = $('communitySearchAvatar');
const communitySearchAvatarImg = $('communitySearchAvatarImg');
const communitySearchAvatarFallback = $('communitySearchAvatarFallback');
const communitySearchInput = $('communitySearchInput');
const btnCommunitySearch = $('btnCommunitySearch');
const btnCommunityClear = $('btnCommunityClear');
const communitySearchStatus = $('communitySearchStatus');
const communitySearchResults = $('communitySearchResults');
const friendCodeSearch = $('friendCodeSearch');
const btnSendFriendRequest = $('btnSendFriendRequest');
const friendReqStatus = $('friendReqStatus');
const friendRequestsList = $('friendRequestsList');
const friendsList = $('friendsList');
const blockedList = $('blockedList');
const chatHeader = $('chatHeader');
const chatMessages = $('chatMessages');
const chatInput = $('chatInput');
const btnSendMessage = $('btnSendMessage');
const chatStatus = $('chatStatus');
const chatHint = $('chatHint');

let activeChatUid = '';
let activeChatProfile = null;
const publicProfileCache = new Map();
let blockedSet = new Set();
let followingSet = new Set();

function setAvatarMsg(text, bad = false) {
  if (!avatarMsg) return;
  avatarMsg.textContent = text || '';
  avatarMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function setSettingsMsg(text, bad = false) {
  if (!settingsMsg) return;
  settingsMsg.textContent = text || '';
  settingsMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function setCommunitySearchMsg(text, bad = false) {
  if (!communitySearchStatus) return;
  communitySearchStatus.textContent = text || '';
  communitySearchStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function followDocId(fromUid, toUid) {
  const a = String(fromUid || '').trim();
  const b = String(toUid || '').trim();
  return a && b ? `${a}__${b}` : '';
}

async function loadFollowingSet(myUid) {
  const uid = String(myUid || '').trim();
  if (!uid) return new Set();
  try {
    const snap = await getDocs(
      query(collection(db, 'user_follows'), where('fromUid', '==', uid), limit(500)),
    );
    followingSet = new Set();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const toUid = String(data.toUid || '').trim();
      if (toUid) followingSet.add(toUid);
    });
    return new Set(followingSet);
  } catch (e) {
    console.warn('load following set failed', e);
    followingSet = new Set();
    return new Set();
  }
}

async function setFollowing(myUid, targetUid, follow) {
  const from = String(myUid || '').trim();
  const to = String(targetUid || '').trim();
  const id = followDocId(from, to);
  if (!id || from === to) return false;
  if (follow) {
    await setDoc(
      doc(db, 'user_follows', id),
      { fromUid: from, toUid: to, createdAt: serverTimestamp() },
      { merge: true },
    );
    followingSet.add(to);
    return true;
  }
  await deleteDoc(doc(db, 'user_follows', id));
  followingSet.delete(to);
  return false;
}

function setUserReportMsg(text, bad = false) {
  if (!userReportStatus) return;
  userReportStatus.textContent = text || '';
  userReportStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

async function submitUserReport(uid, email) {
  if (!uid) return;
  const message = String(userReportMessage?.value || '').trim();
  if (!message) {
    setUserReportMsg('Escribe el mensaje.', true);
    return;
  }

  const type = String(userReportType?.value || 'other');
  const level = String(userReportLevel?.value || '').trim();
  const topicId = String(userReportTopic?.value || '').trim();

  try {
    if (btnUserReport) btnUserReport.disabled = true;
    setUserReportMsg('Enviando...');
    await addDoc(collection(db, 'user_reports'), {
      userId: uid,
      email: email || null,
      type,
      level: level || null,
      topicId: topicId || null,
      message,
      status: 'new',
      origin: 'user',
      page: location.pathname,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (userReportMessage) userReportMessage.value = '';
    if (userReportTopic) userReportTopic.value = '';
    setUserReportMsg('Enviado. Gracias!');
  } catch (e) {
    console.warn('report submit failed', e);
    setUserReportMsg('No se pudo enviar.', true);
  } finally {
    if (btnUserReport) btnUserReport.disabled = false;
  }
}

function setFriendReqMsg(text, bad = false) {
  if (!friendReqStatus) return;
  friendReqStatus.textContent = text || '';
  friendReqStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function setChatMsg(text, bad = false) {
  if (!chatStatus) return;
  chatStatus.textContent = text || '';
  chatStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function genFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normName(value) {
  return String(value || '').trim().toLowerCase();
}

function normHandle(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidHandle(value) {
  if (!value) return true;
  return /^[a-z0-9_]{3,20}$/.test(value);
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
    if (usePrettyProfile()) {
      return `/perfil/${encodeURIComponent(safeHandle)}`;
    }
    return `perfil.html?u=${encodeURIComponent(safeHandle)}`;
  }
  return `perfil.html?uid=${encodeURIComponent(uid)}`;
}

async function isHandleAvailable(handleLower, myUid) {
  if (!handleLower) return true;
  const snap = await getDocs(
    query(
      collection(db, 'public_users'),
      where('handleLower', '==', handleLower),
      limit(1),
    ),
  );
  if (snap.empty) return true;
  const hit = snap.docs[0];
  return hit?.id === myUid;
}

async function generateUniqueFriendCode() {
  for (let i = 0; i < 6; i += 1) {
    const code = genFriendCode();
    const snap = await getDocs(
      query(collection(db, 'public_users'), where('friendCode', '==', code), limit(1)),
    );
    if (snap.empty) return code;
  }
  return `${genFriendCode()}${Math.floor(Math.random() * 9)}`;
}

async function getPublicProfile(uid) {
  if (!uid) return null;
  if (publicProfileCache.has(uid)) return publicProfileCache.get(uid);
  const snap = await getDoc(doc(db, 'public_users', uid));
  const data = snap.exists() ? snap.data() || {} : null;
  publicProfileCache.set(uid, data);
  return data;
}

async function upsertPublicProfile(uid, payload) {
  if (!uid) return;
  try {
    const data = { ...payload, updatedAt: serverTimestamp() };
    if (typeof payload?.displayName === 'string') {
      data.displayNameLower = normName(payload.displayName);
    }
    await setDoc(
      doc(db, 'public_users', uid),
      data,
      { merge: true },
    );
  } catch {}
}

async function ensurePublicProfile(uid, userDoc, email) {
  if (!uid) return null;
  const ref = doc(db, 'public_users', uid);
  const snap = await getDoc(ref);
  const displayName =
    String(userDoc?.displayName || userDoc?.name || '') ||
    String(email || '').split('@')[0];
  const handle = String(userDoc?.handle || '').trim();
  const photoURL = String(userDoc?.photoURL || '');
  const displayNameLower = normName(displayName);
  const handleLower = normHandle(handle);
  const publicProfile = userDoc?.publicProfile !== false;
  const allowFriendRequests = userDoc?.allowFriendRequests !== false;
  const allowMessages = userDoc?.allowMessages !== false;

  if (snap.exists()) {
    const data = snap.data() || {};
    const updates = {};
    if (displayName && displayName !== data.displayName) updates.displayName = displayName;
    if (photoURL !== data.photoURL) updates.photoURL = photoURL;
    if (displayNameLower && displayNameLower !== data.displayNameLower)
      updates.displayNameLower = displayNameLower;
    if (handle && handle !== data.handle) updates.handle = handle;
    if (handleLower && handleLower !== data.handleLower)
      updates.handleLower = handleLower;
    if (data.publicProfile !== publicProfile) updates.publicProfile = publicProfile;
    if (data.allowFriendRequests !== allowFriendRequests)
      updates.allowFriendRequests = allowFriendRequests;
    if (data.allowMessages !== allowMessages) updates.allowMessages = allowMessages;
    if (!data.friendCode) updates.friendCode = await generateUniqueFriendCode();
    if (data.email) updates.email = null;
    if (Object.keys(updates).length) {
      updates.updatedAt = serverTimestamp();
      await updateDoc(ref, updates);
      const merged = { ...data, ...updates };
      publicProfileCache.set(uid, merged);
      return merged;
    }
    publicProfileCache.set(uid, data);
    return data;
  }

  const friendCode = await generateUniqueFriendCode();
  const payload = {
    displayName,
    photoURL,
    friendCode,
    displayNameLower,
    handle,
    handleLower,
    publicProfile,
    allowFriendRequests,
    allowMessages,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  publicProfileCache.set(uid, payload);
  return payload;
}

function renderFriendCode(profile) {
  if (!friendCode) return;
  const code = String(profile?.friendCode || '').trim();
  friendCode.value = code;
  if (friendCodeInfo) {
    friendCodeInfo.textContent = code
      ? 'Compártelo con tus amigos.'
      : 'Generando código...';
  }
}

function friendAvatarLetter(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'AM';
  const parts = safe.split(/\s+/).filter(Boolean);
  const letters = parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return letters || 'AM';
}

function renderCommunitySearchAvatar(url, name) {
  if (!communitySearchAvatar) return;
  const safeName = String(name || '').trim();
  if (communitySearchAvatarFallback)
    communitySearchAvatarFallback.textContent = friendAvatarLetter(safeName || 'Usuario');

  const imgUrl = String(url || '').trim();
  if (communitySearchAvatarImg) {
    if (imgUrl) {
      communitySearchAvatarImg.src = imgUrl;
      communitySearchAvatar.classList.add('hasImage');
    } else {
      communitySearchAvatarImg.removeAttribute('src');
      communitySearchAvatar.classList.remove('hasImage');
    }
  }
}

function renderFriendRequests(items) {
  if (!friendRequestsList) return;
  if (!items.length) {
    friendRequestsList.innerHTML = '<div class="muted">Sin solicitudes.</div>';
    return;
  }
  friendRequestsList.innerHTML = '';
  items.forEach((req) => {
    const handle = req.handle ? `@${req.handle}` : '';
    const wrap = document.createElement('div');
    wrap.className = 'friendItem';
    wrap.innerHTML = `
      <div class="friendMeta">
        <span class="friendAvatar">${friendAvatarLetter(req.name)}</span>
        <div>
          <div class="friendName">${req.name || 'Usuario'}</div>
          ${handle ? `<div class="friendHint">${handle}</div>` : ''}
        </div>
      </div>
      <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
        <button class="btn-yellow" type="button" data-accept="${req.id}">Aceptar</button>
        <button class="btn-white-outline" type="button" data-decline="${req.id}">Rechazar</button>
      </div>
    `;
    friendRequestsList.appendChild(wrap);
  });
}

function renderFriends(items) {
  if (!friendsList) return;
  if (!items.length) {
    friendsList.innerHTML = '<div class="muted">Sin amigos todavía.</div>';
    return;
  }
  friendsList.innerHTML = '';
  items.forEach((friend) => {
    const handle = friend.handle ? `@${friend.handle}` : '';
    const profileHref = buildProfileHref(friend.handle, friend.uid);
    const wrap = document.createElement('div');
    wrap.className = 'friendItem';
    wrap.innerHTML = `
      <div class="friendMeta">
        <span class="friendAvatar">${friendAvatarLetter(friend.name)}</span>
        <div>
          <div class="friendName">${friend.name || 'Usuario'}</div>
          ${handle ? `<div class="friendHint">${handle}</div>` : ''}
        </div>
      </div>
      <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
        <a class="btn-white-outline" href="${profileHref}">Perfil</a>
        <button class="btn-white-outline" type="button" data-chat="${friend.uid}">Mensaje</button>
        <button class="btn-white-outline" type="button" data-remove="${friend.uid}">Eliminar</button>
        <button class="btn-white-outline" type="button" data-block="${friend.uid}">Bloquear</button>
      </div>
    `;
    friendsList.appendChild(wrap);
  });
}

function renderBlocked(items) {
  if (!blockedList) return;
  if (!items.length) {
    blockedList.innerHTML = '<div class="muted">Sin bloqueos.</div>';
    return;
  }
  blockedList.innerHTML = '';
  items.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.className = 'friendItem';
    wrap.innerHTML = `
      <div class="friendMeta">
        <span class="friendAvatar">${friendAvatarLetter(item.name)}</span>
        <div>
          <div class="friendName">${item.name || 'Usuario'}</div>
        </div>
      </div>
      <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
        <button class="btn-white-outline" type="button" data-unblock="${item.uid}">Desbloquear</button>
      </div>
    `;
    blockedList.appendChild(wrap);
  });
}

async function loadBlocked(uid) {
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, 'user_blocks'), where('fromUid', '==', uid)),
  );
  blockedSet = new Set();
  const items = await Promise.all(
    (snap.docs || []).map(async (d) => {
      const data = d.data() || {};
      const targetUid = data.toUid || String(d.id || '').split('__')[1];
      if (targetUid) blockedSet.add(targetUid);
      const profile = await getPublicProfile(targetUid);
      return {
        uid: targetUid,
        name: profile?.displayName || '',
      };
    }),
  );
  renderBlocked(items.filter((i) => i.uid));
  return items;
}

async function removeFriend(myUid, friendUid) {
  if (!myUid || !friendUid) return;
  const ids = [`${myUid}__${friendUid}`, `${friendUid}__${myUid}`];
  for (const id of ids) {
    const snap = await getDoc(doc(db, 'friend_requests', id));
    if (snap.exists()) {
      await deleteDoc(doc(db, 'friend_requests', id));
    }
  }
}

async function blockUser(myUid, friendUid) {
  if (!myUid || !friendUid) return;
  await setDoc(doc(db, 'user_blocks', `${myUid}__${friendUid}`), {
    fromUid: myUid,
    toUid: friendUid,
    createdAt: serverTimestamp(),
  });
  await removeFriend(myUid, friendUid);
}

async function unblockUser(myUid, friendUid) {
  if (!myUid || !friendUid) return;
  await deleteDoc(doc(db, 'user_blocks', `${myUid}__${friendUid}`));
}

function renderMessages(list, myUid) {
  if (!chatMessages) return;
  if (!list.length) {
    chatMessages.innerHTML = '<div class="muted">No hay mensajes todavía.</div>';
    return;
  }
  chatMessages.innerHTML = '';
  list.forEach((msg) => {
    const isMine = msg.fromUid === myUid;
    const wrap = document.createElement('div');
    wrap.className = `chatMsg ${isMine ? 'chatMsg--me' : 'chatMsg--them'}`;
    wrap.innerHTML = `
      <div>${msg.text || ''}</div>
      <div class="chatMeta">${formatDate(msg.createdAt)}</div>
    `;
    chatMessages.appendChild(wrap);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadFriendRequests(uid) {
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, 'friend_requests'), where('toUid', '==', uid)),
  );
  const reqs = (snap.docs || [])
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((r) => r.status === 'pending');

  const enriched = await Promise.all(
    reqs.map(async (r) => {
      if (blockedSet.has(r.fromUid)) return null;
      const blockedByOther = await getDoc(
        doc(db, 'user_blocks', `${r.fromUid}__${uid}`),
      );
      if (blockedByOther.exists()) return null;
      const profile = await getPublicProfile(r.fromUid);
      return {
        ...r,
        name: profile?.displayName || '',
        handle: profile?.handle || '',
      };
    }),
  );
  const filtered = enriched.filter(Boolean);
  renderFriendRequests(filtered);
  return filtered;
}

async function loadFriends(uid) {
  if (!uid) return [];
  const incoming = await getDocs(
    query(collection(db, 'friend_requests'), where('toUid', '==', uid)),
  );
  const outgoing = await getDocs(
    query(collection(db, 'friend_requests'), where('fromUid', '==', uid)),
  );
  const all = [...(incoming.docs || []), ...(outgoing.docs || [])]
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((r) => r.status === 'accepted');

  const friendUids = Array.from(
    new Set(
      all.map((r) => (r.fromUid === uid ? r.toUid : r.fromUid)).filter(Boolean),
    ),
  );

  const profiles = await Promise.all(
    friendUids.map(async (fuid) => {
      if (blockedSet.has(fuid)) return null;
      const blockedByOther = await getDoc(doc(db, 'user_blocks', `${fuid}__${uid}`));
      if (blockedByOther.exists()) return null;
      const profile = await getPublicProfile(fuid);
      return {
        uid: fuid,
        name: profile?.displayName || '',
        handle: profile?.handle || '',
      };
    }),
  );
  const cleaned = profiles.filter(Boolean);
  renderFriends(cleaned);
  return cleaned;
}

async function sendFriendRequestToUid(myUid, targetUid) {
  if (!myUid || !targetUid) return;
  if (targetUid === myUid) {
    setFriendReqMsg('Ese código es tuyo.', true);
    return;
  }
  const targetProfile = await getPublicProfile(targetUid);
  if (targetProfile?.allowFriendRequests === false) {
    setFriendReqMsg('No acepta solicitudes.', true);
    return;
  }
  const blockedMe = await getDoc(doc(db, 'user_blocks', `${targetUid}__${myUid}`));
  if (blockedMe.exists()) {
    setFriendReqMsg('No puedes enviar solicitud.', true);
    return;
  }
  const blockedByMe = await getDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`));
  if (blockedByMe.exists()) {
    setFriendReqMsg('Desbloquea primero a este usuario.', true);
    return;
  }

  const reverseId = `${targetUid}__${myUid}`;
  const reverseSnap = await getDoc(doc(db, 'friend_requests', reverseId));
  if (reverseSnap.exists()) {
    const data = reverseSnap.data() || {};
    if (data.status === 'pending') {
      await updateDoc(doc(db, 'friend_requests', reverseId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      setFriendReqMsg('Solicitud aceptada automáticamente.');
      return;
    }
    if (data.status === 'accepted') {
      setFriendReqMsg('Ya son amigos.');
      return;
    }
  }

  const reqId = `${myUid}__${targetUid}`;
  const existing = await getDoc(doc(db, 'friend_requests', reqId));
  if (existing.exists()) {
    const data = existing.data() || {};
    if (data.status === 'pending') {
      setFriendReqMsg('Solicitud pendiente.');
      return;
    }
    if (data.status === 'accepted') {
      setFriendReqMsg('Ya son amigos.');
      return;
    }
  }

  await setDoc(doc(db, 'friend_requests', reqId), {
    fromUid: myUid,
    toUid: targetUid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  setFriendReqMsg('Solicitud enviada.');
}

async function sendFriendRequest(myUid, code) {
  const clean = toCode(code);
  if (!clean) {
    setFriendReqMsg('Escribe el código.', true);
    return;
  }
  setFriendReqMsg('Buscando...');

  const snap = await getDocs(
    query(collection(db, 'public_users'), where('friendCode', '==', clean), limit(1)),
  );
  if (snap.empty) {
    setFriendReqMsg('No existe ese código.', true);
    return;
  }

  const targetDoc = snap.docs[0];
  const targetUid = targetDoc.id;
  await sendFriendRequestToUid(myUid, targetUid);
  if (friendCodeSearch) friendCodeSearch.value = '';
}

async function openChat(myUid, friendUid) {
  if (!friendUid) return;
  const url = `mensajes.html?chat=${encodeURIComponent(friendUid)}`;
  window.location.href = url;
}

async function loadMessages(myUid, friendUid) {
  if (!myUid || !friendUid) return;
  const snap = await getDocs(
    query(collection(db, 'user_inbox', myUid, 'messages'), where('peerUid', '==', friendUid)),
  );
  const list = (snap.docs || [])
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .sort((a, b) => {
      const ad = toDateMaybe(a.createdAt)?.getTime() || 0;
      const bd = toDateMaybe(b.createdAt)?.getTime() || 0;
      return ad - bd;
    });
  renderMessages(list, myUid);
}

async function sendMessage(myUid, friendUid, text) {
  if (!myUid || !friendUid) return;
  const msg = String(text || '').trim();
  if (!msg) {
    setChatMsg('Escribe un mensaje.', true);
    return;
  }
  if (blockedSet.has(friendUid)) {
    setChatMsg('Este usuario esta bloqueado.', true);
    return;
  }
  const blockedByOther = await getDoc(doc(db, 'user_blocks', `${friendUid}__${myUid}`));
  if (blockedByOther.exists()) {
    setChatMsg('No puedes enviar mensajes.', true);
    return;
  }
  const targetProfile = await getPublicProfile(friendUid);
  if (targetProfile?.allowMessages === false) {
    setChatMsg('Este usuario no acepta mensajes.', true);
    return;
  }
  if (btnSendMessage) btnSendMessage.disabled = true;
  setChatMsg('Enviando...');
  const payload = {
    fromUid: myUid,
    toUid: friendUid,
    peerUid: friendUid,
    text: msg,
    createdAt: serverTimestamp(),
    read: false,
  };
  try {
    await addDoc(collection(db, 'user_inbox', myUid, 'messages'), payload);
    await addDoc(collection(db, 'user_inbox', friendUid, 'messages'), {
      ...payload,
      peerUid: myUid,
    });
    if (chatInput) chatInput.value = '';
    setChatMsg('Enviado.');
    await loadMessages(myUid, friendUid);
  } catch (e) {
    console.warn('send message failed', e);
    setChatMsg('No se pudo enviar.', true);
  } finally {
    if (btnSendMessage) btnSendMessage.disabled = false;
  }
}

function renderSearchResults(items, myUid) {
  if (!communitySearchResults) return;
  if (!items.length) {
    communitySearchResults.innerHTML = '<div class="muted">Sin resultados.</div>';
    return;
  }
  communitySearchResults.innerHTML = '';
  items.forEach((item) => {
    const name = item.displayName || item.name || 'Usuario';
    const handle = item.handle ? `@${item.handle}` : '';
    const wrap = document.createElement('div');
    wrap.className = 'friendItem';
    const profileHref = buildProfileHref(item.handle, item.uid);
    wrap.innerHTML = `
      <div class="friendMeta">
        <span class="friendAvatar">${friendAvatarLetter(name)}</span>
        <div>
          <div class="friendName">${name}</div>
          ${handle ? `<div class="friendHint">${handle}</div>` : ''}
        </div>
      </div>
      <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
        <a class="btn-white-outline" href="${profileHref}">Ver perfil</a>
        ${
          item.uid !== myUid
            ? `<button class="btn-white-outline" type="button" data-follow="${item.uid}" data-following="${
                followingSet.has(item.uid) ? '1' : '0'
              }">${followingSet.has(item.uid) ? 'Siguiendo' : 'Seguir'}</button>`
            : ''
        }
        ${
          item.uid !== myUid
            ? `<button class="btn-white-outline" type="button" data-add="${item.uid}">Agregar</button>`
            : ''
        }
      </div>
    `;
    communitySearchResults.appendChild(wrap);
  });
}

async function searchPublicUsers(myUid, term) {
  const q = normName(term);
  if (!q) {
    setCommunitySearchMsg('Escribe un nombre.', true);
    return;
  }
  setCommunitySearchMsg('Buscando...');
  try {
    const nameQuery = query(
      collection(db, 'public_users'),
      orderBy('displayNameLower'),
      startAt(q),
      endAt(`${q}\uf8ff`),
      limit(10),
    );
    const handleQuery = query(
      collection(db, 'public_users'),
      orderBy('handleLower'),
      startAt(q),
      endAt(`${q}\uf8ff`),
      limit(10),
    );
    const [byName, byHandle] = await Promise.all([
      getDocs(nameQuery),
      getDocs(handleQuery),
    ]);
    const merged = new Map();
    [...(byName.docs || []), ...(byHandle.docs || [])].forEach((d) => {
      if (!d?.id) return;
      if (!merged.has(d.id)) merged.set(d.id, { uid: d.id, ...(d.data() || {}) });
    });
    const results = Array.from(merged.values())
      .filter((d) => d.publicProfile !== false)
      .filter((d) => d.uid !== myUid);
    renderSearchResults(results, myUid);
    setCommunitySearchMsg(`Resultados: ${results.length}`);
  } catch (e) {
    console.warn('search public users failed', e);
    setCommunitySearchMsg('No se pudo buscar.', true);
  }
}

async function initCommunity(viewUid, viewDoc, email, isPreview) {
  if (!friendCode) return;
  const profile = await ensurePublicProfile(viewUid, viewDoc, email);
  renderFriendCode(profile);
  renderCommunitySearchAvatar(
    profile?.photoURL || '',
    profile?.displayName || viewDoc?.displayName || viewDoc?.name || '',
  );
  if (communitySearchInput) {
    const displayName = String(profile?.displayName || viewDoc?.displayName || viewDoc?.name || '').trim();
    const first = displayName ? displayName.split(/\s+/)[0] : '';
    communitySearchInput.placeholder = first
      ? `¿A quién buscas, ${first}?`
      : 'Busca por nombre o @usuario…';
  }

  if (isPreview) {
    [
      friendCodeSearch,
      btnSendFriendRequest,
      btnCopyFriendCode,
      btnNewFriendCode,
      communitySearchInput,
      btnCommunitySearch,
      btnCommunityClear,
      chatInput,
      btnSendMessage,
    ].forEach((el) => {
      if (el) el.disabled = true;
    });
    if (friendReqStatus) friendReqStatus.textContent = 'Vista previa (admin)';
    if (chatHint) chatHint.textContent = 'Vista previa (admin)';
    return;
  }

  await loadFollowingSet(viewUid);

  if (btnCopyFriendCode && !btnCopyFriendCode.dataset.wired) {
    btnCopyFriendCode.dataset.wired = '1';
    btnCopyFriendCode.addEventListener('click', async () => {
      const code = String(friendCode?.value || '').trim();
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        if (friendCodeInfo) friendCodeInfo.textContent = 'Copiado.';
      } catch {
        if (friendCodeInfo) friendCodeInfo.textContent = 'No se pudo copiar.';
      }
    });
  }

  if (btnNewFriendCode && !btnNewFriendCode.dataset.wired) {
    btnNewFriendCode.dataset.wired = '1';
    btnNewFriendCode.addEventListener('click', async () => {
      const newCode = await generateUniqueFriendCode();
      await upsertPublicProfile(viewUid, { friendCode: newCode });
      renderFriendCode({ ...profile, friendCode: newCode });
    });
  }

  if (btnSendFriendRequest && !btnSendFriendRequest.dataset.wired) {
    btnSendFriendRequest.dataset.wired = '1';
    btnSendFriendRequest.addEventListener('click', async () => {
      const code = String(friendCodeSearch?.value || '').trim();
      await sendFriendRequest(viewUid, code);
      await loadFriendRequests(viewUid);
      await loadFriends(viewUid);
    });
  }

  if (btnCommunitySearch && !btnCommunitySearch.dataset.wired) {
    btnCommunitySearch.dataset.wired = '1';
    btnCommunitySearch.addEventListener('click', async () => {
      await searchPublicUsers(viewUid, communitySearchInput?.value || '');
    });
  }
  if (btnCommunityClear && !btnCommunityClear.dataset.wired) {
    btnCommunityClear.dataset.wired = '1';
    btnCommunityClear.addEventListener('click', () => {
      if (communitySearchInput) communitySearchInput.value = '';
      if (communitySearchResults) communitySearchResults.innerHTML = '';
      setCommunitySearchMsg('');
      communitySearchInput?.focus();
    });
  }
  if (communitySearchInput && !communitySearchInput.dataset.wired) {
    communitySearchInput.dataset.wired = '1';
    let searchTimer = null;
    communitySearchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await searchPublicUsers(viewUid, communitySearchInput.value);
      }
    });
    communitySearchInput.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      const value = String(communitySearchInput.value || '').trim();
      if (!value) {
        if (communitySearchResults) communitySearchResults.innerHTML = '';
        setCommunitySearchMsg('');
        return;
      }
      if (value.length < 2) {
        setCommunitySearchMsg('Escribe 2+ letras...');
        return;
      }
      setCommunitySearchMsg('Buscando...');
      searchTimer = setTimeout(() => {
        searchPublicUsers(viewUid, value).catch(() => {});
      }, 360);
    });
  }
  if (communitySearchResults && !communitySearchResults.dataset.wired) {
    communitySearchResults.dataset.wired = '1';
    communitySearchResults.addEventListener('click', async (e) => {
      const followBtn = e.target?.closest?.('button[data-follow]');
      if (followBtn) {
        const targetUid = followBtn.getAttribute('data-follow');
        if (!targetUid || targetUid === viewUid) return;
        if (blockedSet.has(targetUid)) {
          setCommunitySearchMsg('Usuario bloqueado.', true);
          return;
        }
        const isFollowing =
          followBtn.getAttribute('data-following') === '1' || followingSet.has(targetUid);
        const next = !isFollowing;
        try {
          followBtn.disabled = true;
          await setFollowing(viewUid, targetUid, next);
          followBtn.setAttribute('data-following', next ? '1' : '0');
          followBtn.textContent = next ? 'Siguiendo' : 'Seguir';
          setCommunitySearchMsg(next ? 'Siguiendo ✅' : 'Listo ✅');
          setTimeout(() => setCommunitySearchMsg(''), 1500);
        } catch (err) {
          console.warn('toggle follow failed', err);
          setCommunitySearchMsg('No se pudo actualizar.', true);
        } finally {
          followBtn.disabled = false;
        }
        return;
      }

      const btn = e.target?.closest?.('button[data-add]');
      if (!btn) return;
      const targetUid = btn.getAttribute('data-add');
      if (!targetUid) return;
      await sendFriendRequestToUid(viewUid, targetUid);
      await loadFriendRequests(viewUid);
      await loadFriends(viewUid);
    });
  }

  if (friendRequestsList && !friendRequestsList.dataset.wired) {
    friendRequestsList.dataset.wired = '1';
    friendRequestsList.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      if (!btn) return;
      const acceptId = btn.getAttribute('data-accept');
      const declineId = btn.getAttribute('data-decline');
      if (acceptId) {
        await updateDoc(doc(db, 'friend_requests', acceptId), {
          status: 'accepted',
          updatedAt: serverTimestamp(),
        });
      }
      if (declineId) {
        await updateDoc(doc(db, 'friend_requests', declineId), {
          status: 'declined',
          updatedAt: serverTimestamp(),
        });
      }
      await loadFriendRequests(viewUid);
      await loadFriends(viewUid);
    });
  }

  if (friendsList && !friendsList.dataset.wired) {
    friendsList.dataset.wired = '1';
    friendsList.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      if (!btn) return;
      const friendUid = btn.getAttribute('data-chat');
      const removeUid = btn.getAttribute('data-remove');
      const blockUid = btn.getAttribute('data-block');
      if (friendUid) {
        await openChat(viewUid, friendUid);
        return;
      }
      if (removeUid) {
        await removeFriend(viewUid, removeUid);
        await loadBlocked(viewUid);
        await loadFriends(viewUid);
      }
      if (blockUid) {
        await blockUser(viewUid, blockUid);
        await loadBlocked(viewUid);
        await loadFriends(viewUid);
      }
    });
  }

  if (blockedList && !blockedList.dataset.wired) {
    blockedList.dataset.wired = '1';
    blockedList.addEventListener('click', async (e) => {
      const btn = e.target?.closest('button');
      if (!btn) return;
      const unblockUid = btn.getAttribute('data-unblock');
      if (!unblockUid) return;
      await unblockUser(viewUid, unblockUid);
      await loadBlocked(viewUid);
      await loadFriends(viewUid);
    });
  }

  if (btnSendMessage && !btnSendMessage.dataset.wired) {
    btnSendMessage.dataset.wired = '1';
    btnSendMessage.addEventListener('click', async () => {
      if (!activeChatUid) {
        setChatMsg('Selecciona un amigo.', true);
        return;
      }
      await sendMessage(viewUid, activeChatUid, chatInput?.value || '');
    });
  }

  if (chatInput && !chatInput.dataset.wired) {
    chatInput.dataset.wired = '1';
    chatInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!activeChatUid) {
          setChatMsg('Selecciona un amigo.', true);
          return;
        }
        await sendMessage(viewUid, activeChatUid, chatInput.value);
      }
    });
  }

  await loadBlocked(viewUid);
  await loadFriendRequests(viewUid);
  await loadFriends(viewUid);
  if (CHAT_UID) {
    await openChat(viewUid, CHAT_UID);
  }
}

function renderAvatar(url, fallbackText) {
  if (!avatarWrap || !avatarImg) return;

  if (typeof fallbackText !== 'undefined') {
    const safeFallback = String(fallbackText || '').trim();
    if (avatarFallback)
      avatarFallback.textContent = safeFallback ? safeFallback[0].toUpperCase() : '';
  }

  if (!avatarImg.dataset.wired) {
    avatarImg.dataset.wired = '1';
    avatarImg.addEventListener('load', () => {
      avatarWrap?.classList?.add?.('hasImage');
    });
    avatarImg.addEventListener('error', () => {
      avatarImg.removeAttribute('src');
      avatarWrap?.classList?.remove?.('hasImage');
    });
  }

  const imgUrl = String(url || '').trim();
  if (imgUrl) {
    // Keep fallback visible until the image is loaded.
    avatarWrap.classList.remove('hasImage');
    avatarImg.src = imgUrl;
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
  }
}

async function uploadAvatar(uid, file, currentPath) {
  if (!uid || !file) return null;
  if (!file.type.startsWith('image/')) {
    setAvatarMsg('Solo imágenes (JPG/PNG/WebP).', true);
    return null;
  }
  const maxMb = 3;
  if (file.size > maxMb * 1024 * 1024) {
    setAvatarMsg(`Máx ${maxMb}MB.`, true);
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
      await upsertPublicProfile(uid, { photoURL: url });

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
    await upsertPublicProfile(uid, { photoURL: '' });
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

function renderUserSettings(userDoc, isPreview) {
  if (setHandle) setHandle.value = String(userDoc?.handle || '');
  if (setDisplayName)
    setDisplayName.value = userDoc?.displayName || userDoc?.name || '';
  if (setGender) setGender.value = String(userDoc?.gender || '');
  if (setLang) setLang.value = String(userDoc?.lang || 'es');
  if (setGoal) setGoal.value = String(userDoc?.studyGoalMin || 10);
  if (setReviewReminders)
    setReviewReminders.checked = userDoc?.reviewReminders !== false;
  if (setPublicProfile)
    setPublicProfile.checked = userDoc?.publicProfile !== false;
  if (setAllowFriendRequests)
    setAllowFriendRequests.checked = userDoc?.allowFriendRequests !== false;
  if (setAllowMessages)
    setAllowMessages.checked = userDoc?.allowMessages !== false;

  const inputs = [
    setHandle,
    setDisplayName,
    setGender,
    setLang,
    setGoal,
    setReviewReminders,
    setPublicProfile,
    setAllowFriendRequests,
    setAllowMessages,
    btnSaveSettings,
  ].filter(Boolean);

  if (isPreview) {
    inputs.forEach((el) => {
      el.disabled = true;
    });
    if (settingsMsg) settingsMsg.textContent = 'Vista previa (admin)';
    return;
  }

  if (btnSaveSettings && !btnSaveSettings.dataset.wired) {
    btnSaveSettings.dataset.wired = '1';
    btnSaveSettings.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user?.uid) return;
      setSettingsMsg('Guardando...');
      const rawHandle = normHandle(setHandle?.value || '');
      if (!isValidHandle(rawHandle)) {
        setSettingsMsg('Usuario inválido. Usa 3-20 letras/números/_', true);
        return;
      }
      const available = await isHandleAvailable(rawHandle, user.uid);
      if (!available) {
        setSettingsMsg('Ese usuario ya existe.', true);
        return;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          handle: rawHandle || '',
          handleLower: rawHandle || '',
          displayName: String(setDisplayName?.value || '').trim(),
          gender: String(setGender?.value || '').trim(),
          lang: String(setLang?.value || 'es').trim(),
          studyGoalMin: Number(setGoal?.value || 10),
          reviewReminders: !!setReviewReminders?.checked,
          publicProfile: !!setPublicProfile?.checked,
          allowFriendRequests: !!setAllowFriendRequests?.checked,
          allowMessages: !!setAllowMessages?.checked,
          updatedAt: serverTimestamp(),
        });
        await upsertPublicProfile(user.uid, {
          handle: rawHandle || '',
          handleLower: rawHandle || '',
          displayName: String(setDisplayName?.value || '').trim(),
          publicProfile: !!setPublicProfile?.checked,
          allowFriendRequests: !!setAllowFriendRequests?.checked,
          allowMessages: !!setAllowMessages?.checked,
        });
        setSettingsMsg('Guardado OK');
        setTimeout(() => setSettingsMsg(''), 2000);
      } catch (e) {
        console.warn('save settings failed', e);
        setSettingsMsg('Error al guardar', true);
      }
    });
  }
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
      friendPercent: Number(d.refFriendPercent || 0),
      ownerPercent: Number(d.refOwnerPercent || 0),
      scope: String(d.refRewardScope || 'otros servicios'),
    };
  } catch {
    return { friendPercent: 0, ownerPercent: 0, scope: 'otros servicios' };
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
    scope: settings.scope || 'otros servicios',
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
        refRewardsList.textContent = '— No hay recompensas disponibles —';
      } else {
        refRewardsList.innerHTML = rewards
          .map((r) => {
            const pct = Number(r.value || 0);
            const scope = String(r.scope || 'otros servicios');
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

  void renderCourses(null, { isAdmin: false, hasAccess: false });

  const btn = $('addPromoBtn');
  const input = $('adm_promo_code');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html?next=espanel.html';
      return;
    }
    try {
      const baseDoc = await ensureUserDoc(user);
      const qaAdmin = await isQaAdminUser(user, baseDoc);

      // Admin preview: load target user doc
      let viewUid = user.uid;
      let viewDoc = baseDoc;

      const isAdmin = qaAdmin.allowed;
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
            panelSubtitle.innerHTML =
              'Aquí tienes tu libreta!<br />¡Qué chimba verte!';
        }
      }

      const isSelfView = viewUid === user.uid;
      const nameForAvatar = String(
        viewDoc?.displayName ||
          viewDoc?.name ||
          viewDoc?.email ||
          (isSelfView ? user.displayName || user.email : '') ||
          '',
      ).trim();
      const fallbackLetterSource = nameForAvatar.replace(/^@+/, '');
      const fallbackLetter = fallbackLetterSource
        ? fallbackLetterSource[0].toUpperCase()
        : '';
      const photoURL = String(
        viewDoc?.photoURL || (isSelfView ? user.photoURL : '') || '',
      ).trim();
      renderAvatar(photoURL, fallbackLetter);
      renderUserSettings(viewDoc, !!AS_UID);
      await initCommunity(
        viewUid,
        viewDoc,
        AS_UID ? viewDoc?.email || '' : user.email || '',
        !!AS_UID,
      );

      // user report form
      if (btnUserReport && !btnUserReport.dataset.wired) {
        btnUserReport.dataset.wired = '1';
        btnUserReport.addEventListener('click', () =>
          submitUserReport(viewUid, viewDoc?.email || user.email || ''),
        );
      }
      if (AS_UID) {
        [userReportType, userReportLevel, userReportTopic, userReportMessage, btnUserReport].forEach(
          (el) => {
            if (el) el.disabled = true;
          },
        );
        setUserReportMsg('Vista previa (admin)');
      }

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
      mountQaToolsPanel({
        enabled: QA_MODE && isAdmin,
        authUid: user.uid,
        targetUid: viewUid,
        targetEmail: String(viewDoc?.email || ''),
        adminReasons: qaAdmin.reasons || [],
        onStatus: (text, kind) => setMsg(text, kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : 'ok'),
      });

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

      const flags = computeFlags(viewDoc, {
        isAdmin,
        email: AS_UID ? viewDoc?.email || '' : user?.email || '',
      });
      await renderCourses(viewDoc, flags);
      renderPlans(viewDoc, flags);
      if (
        $('progTopics') ||
        $('progCompleted') ||
        $('progPractice') ||
        $('progTest') ||
        $('progLastActivity')
      ) {
        await loadProgressSummary(viewUid);
      }
      if ($('reviewDue') || $('reviewOverdue') || $('reviewNew') || $('reviewPlan')) {
        await loadReviewSummary(viewUid);
      }
      if ($('inboxList')) await loadInbox();

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




