// assets/js/pages/course-page.js
// Course topics list + badges:
// - lesson status from course_meta/{LEVEL}__{COURSE_ID} (html/published)
// - exercises count from exercises where level == LEVEL and topicId == COURSE_ID

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan } from '../plan-levels.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

function isAdminUser(userDoc, email) {
  const mail = String(email || '').toLowerCase();
  return (
    ADMIN_EMAILS.includes(mail) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin'
  );
}

function isAdminSession() {
  const mail = String(auth.currentUser?.email || '').toLowerCase();
  return ADMIN_EMAILS.includes(mail);
}

let CURRENT_FLAGS = null;

const accessModal = document.getElementById('accessModal');
const accessModalClose = document.getElementById('accessModalClose');
const accessModalBuy = document.getElementById('accessModalBuy');
const accessModalLine1 = document.getElementById('accessModalLine1');
const accessModalLine2 = document.getElementById('accessModalLine2');

function showAccessLocked() {
  const host = document.querySelector('.container') || document.body;
  const page = document.querySelector('main.page .container') || host;

  const grid = document.getElementById('topicsGrid') || document.getElementById('courseList') || null;

  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '16px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Este nivel esta bloqueado para tu cuenta en este momento.
    </div>
    <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
      <a class="btn-yellow" href="services.html?level=${encodeURIComponent(LEVEL)}" style="text-decoration:none;">Activar acceso</a>
      <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
    </div>
  `;
  if (grid) grid.innerHTML = '';
  page.prepend(card);
}

async function getUserFlags(uid, email) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      if (isAdminUser(null, email)) {
        return { isAdmin: true, hasLevelAccess: true, blocked: false };
      }
      return { isAdmin: false, hasLevelAccess: false, blocked: false };
    }

    const d = snap.data() || {};
    const isAdmin = isAdminUser(d, email);
    const blocked = d.blocked === true;

    if (isAdmin) {
      return { isAdmin: true, hasLevelAccess: true, blocked: false };
    }

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = Array.isArray(d.levels)
      ? d.levels.map((x) => String(x).toUpperCase())
      : [];
    const levels = rawLevels.length ? rawLevels : levelsFromPlan(d.plan);

    const plan = String(d.plan || '').toLowerCase();
    const hasGlobalAccess = plan === 'premium' || (d.access === true && levels.length === 0);
    const hasLevelAccess =
      (hasGlobalAccess || levels.includes(String(LEVEL).toUpperCase())) && isUntilValid;

    return {
      isAdmin: false,
      hasLevelAccess,
      hasGlobalAccess,
      blocked,
      isUntilValid,
      hasUntil,
      levels,
    };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasLevelAccess: false, blocked: false };
  }
}

function showLevelNotice(text) {
  const buttons = document.querySelector('.levelButtons');
  const host = buttons?.parentElement || buttons || document.querySelector('.container');
  if (!host) return;

  let box = document.getElementById('levelNotice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'levelNotice';
    box.className = 'hintSmall';
    box.style.marginTop = '10px';
    box.style.color = '#ffe08a';
    if (buttons && buttons.parentElement === host) {
      buttons.insertAdjacentElement('afterend', box);
    } else {
      host.appendChild(box);
    }
  }
  box.textContent = text || '';
  if (text) {
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.textContent = '';
    }, 3000);
  }
}

function showAccessPopup(level) {
  if (isAdminSession()) return;
  if (!accessModal) return;
  const lvl = String(level || '').toUpperCase();
  if (accessModalLine1) {
    accessModalLine1.textContent =
      lvl && lvl !== 'A1'
        ? `Este nivel ${lvl} todav\u00eda no es tuyo \uD83D\uDE1C`
        : `Este nivel todav\u00eda no es tuyo \uD83D\uDE1C`;
  }
  if (accessModalLine2) {
    accessModalLine2.textContent = '...y sigamos d\u00e1ndole duro al Polaco.';
  }
  if (accessModalBuy) {
    accessModalBuy.href = `services.html?level=${encodeURIComponent(lvl || LEVEL)}`;
  }
  accessModal.style.display = 'flex';
}

function hideAccessPopup() {
  if (!accessModal) return;
  accessModal.style.display = 'none';
}

function wireLevelButtons(flags) {
  const links = document.querySelectorAll('.levelButtons a[href]');
  if (!links.length) return;

  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const level = (new URL(href, location.href).searchParams.get('level') || '').toUpperCase();
    if (!level || level === 'A1') return;

    if (flags?.isAdmin || isAdminSession()) return;

    const levelAllowed =
      flags?.isAdmin ||
      flags?.hasGlobalAccess ||
      (Array.isArray(flags?.levels) && flags.levels.includes(level));
    const hasAccessForLevel = levelAllowed && !!flags?.isUntilValid;

    if (hasAccessForLevel) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      showLevelNotice('Sin acceso. Solo puedes ver los temas de A1.');
    });
  });
  CURRENT_FLAGS = flags || null;
}

function initLevelButtonsGuard() {
  accessModalClose?.addEventListener('click', hideAccessPopup);
  accessModal?.addEventListener('click', (e) => {
    if (e.target === accessModal) hideAccessPopup();
  });

  document.addEventListener('click', (e) => {
    const link = e.target?.closest?.('.levelButtons a[href]');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    const level = (new URL(href, location.href).searchParams.get('level') || '').toUpperCase();

    if (!level || level === 'A1') return;

    if (isAdminSession()) return;

    const f = CURRENT_FLAGS;
    if (!f) {
      e.preventDefault();
      showLevelNotice('Cargando permisos...');
      return;
    }

    const levelAllowed =
      f.isAdmin ||
      f.hasGlobalAccess ||
      (Array.isArray(f.levels) && f.levels.includes(level));
    const hasAccessForLevel = levelAllowed && !!f.isUntilValid;

    if (!hasAccessForLevel && !f.isAdmin) {
      e.preventDefault();
      showAccessPopup(level);
    }
  });
}

function safeText(v) {
  return String(v ?? '').replace(/[<>&"]/g, (ch) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  })[ch]);
}

function tileAccentClass(topic) {
  const raw = String(topic?.tileStyle || topic?.tileClass || '').toLowerCase().trim();
  if (!raw) return '';
  if (raw === 'yellow' || raw === 'amarillo') return 'cardAccentYellow';
  if (raw === 'blue' || raw === 'azul') return 'cardAccentBlue';
  if (raw === 'red' || raw === 'rojo') return 'cardAccentRed';
  if (raw === 'a1') return 'cardAccentBlue';
  if (raw === 'a2') return 'cardAccentBlue';
  if (raw === 'b1') return 'cardAccentRed';
  if (raw === 'b2') return 'cardAccentYellow';
  if (raw.startsWith('cardaccent')) return raw;
  return '';
}

async function getLessonBadge(courseId) {
  try {
    const metaSnap = await getDoc(doc(db, 'course_meta', `${LEVEL}__${courseId}`));
    if (!metaSnap.exists()) return '';
    const meta = metaSnap.data() || {};
    const hasHtml = typeof meta.html === 'string' && meta.html.trim().length > 0;
    if (!hasHtml) return '';
    const published = meta.published === true;
    return published
      ? `<span class="pill pill-blue">Leccion</span>`
      : `<span class="pill">Borrador</span>`;
  } catch {
    return '';
  }
}

async function getExercisesCount(courseId) {
  try {
    const exQ = query(
      collection(db, 'exercises'),
      where('level', '==', LEVEL),
      where('topicId', '==', courseId),
    );
    const exSnap = await getDocs(exQ);
    return exSnap.size || 0;
  } catch {
    return 0;
  }
}

async function loadProgressMap(uid) {
  try {
    const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const map = {};
    snap.forEach((d) => {
      map[d.id] = d.data() || {};
    });
    return map;
  } catch (e) {
    console.warn('loadProgressMap failed', e);
    return {};
  }
}

function topicKeyFor(topic) {
  const slug = String(topic?.slug || topic?.id || '').trim();
  return slug ? `${LEVEL}__${slug}` : null;
}

function buildProgressBadges(progress) {
  if (!progress) return '';
  const badges = [];
  const practicePercent = Number(progress.practicePercent || 0);
  const testScore = Number(progress.testScore || 0);
  const testTotal = Number(progress.testTotal || 0);
  const completed = progress.completed === true;

  if (completed) {
    badges.push('<span class="pill pill-blue">Completado</span>');
  } else if (practicePercent > 0) {
    badges.push(`<span class="pill">Progreso ${practicePercent}%</span>`);
  }

  if (testTotal > 0) {
    badges.push(`<span class="pill pill-yellow">Test ${testScore}%</span>`);
  }

  return badges.join('');
}

function renderCard(topic, lessonBadge, exCount, hasLevelAccess, readOnly, progress) {
  const accent = tileAccentClass(topic);
  const href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;

  const exBadge = exCount > 0 ? `<span class="pill pill-yellow">Ejercicios ${exCount}</span>` : '';

  const accessBadge = readOnly
    ? `<span class="pill">Vista previa</span>`
    : hasLevelAccess
      ? `<span class="pill pill-blue">Acceso</span>`
      : `<span class="pill pill-red">Premium</span>`;

  const typeBadge = topic.type
    ? `<span class="pill" style="font-weight:900;">${safeText(topic.type)}</span>`
    : `<span class="pill" style="font-weight:900;">Tema</span>`;

  const title = safeText(topic.title || 'Tema');
  const desc = safeText(topic.desc || '');
  const progressBadges = buildProgressBadges(progress);

  const isCompleted = progress?.completed === true;
  const hasProgress =
    progress &&
    (Number(progress.practicePercent || 0) > 0 ||
      Number(progress.testScore || 0) > 0 ||
      Number(progress.practiceDone || 0) > 0 ||
      Number(progress.testTotal || 0) > 0);
  const isInProgress = !!hasProgress && !isCompleted;
  const extraStyle = [
    isCompleted
      ? 'opacity:.55; filter:saturate(.45) brightness(.85); background: rgba(6, 18, 45, 0.98) !important; box-shadow: 0 10px 28px rgba(0,0,0,0.25) !important;'
      : '',
    isInProgress ? 'border:2px solid rgba(255,107,107,0.65) !important; box-shadow: 0 0 0 1px rgba(255,107,107,0.2);' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = `
      <div class="card ${accent}" style="padding:16px; border-radius:24px; ${extraStyle}">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${typeBadge}
            ${accessBadge}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
            ${lessonBadge || ''}
            ${exBadge || ''}
            ${progressBadges}
            ${readOnly ? '' : `<span class="pill" style="opacity:.9;">Entrar</span>`}
          </div>
        </div>

        <div class="courseTitle" style="font-family:'Playfair Display',serif; font-weight:900; font-size:26px; margin:12px 0 6px; line-height:1.12;">
          ${title}
        </div>

        ${desc ? `<div class="muted" style="margin:0; line-height:1.65;">${desc}</div>` : ''}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          ${readOnly ? `<span class="pill">Solo temas</span>` : `<span class="pill">Leccion</span><span class="pill">Ejercicios</span>`}
        </div>
      </div>
  `;

  const outerClass = `courseCard${isCompleted ? ' isCompleted' : ''}${isInProgress ? ' isInProgress' : ''}`;

  if (readOnly) {
    return `<div class="${outerClass}" style="text-decoration:none; color:inherit;">${inner}</div>`;
  }

  return `<a class="${outerClass}" href="${href}" style="text-decoration:none; color:inherit;">${inner}</a>`;
}

async function loadTopics(user) {
  const subtitle = $('levelSubtitle');
  const flags = await getUserFlags(user.uid, user.email);
  wireLevelButtons(flags);

  if (flags.blocked) {
    showAccessLocked();
    return;
  }
  const previewOnly = !flags.hasLevelAccess && LEVEL === 'A1';
  if (!flags.hasLevelAccess && !previewOnly) {
    showAccessLocked();
    return;
  }
  if (subtitle) subtitle.textContent = `Nivel ${LEVEL}`;

  const host = $('topicsList');
  if (!host) return;

  host.innerHTML = '';

  const progressMap = previewOnly ? {} : await loadProgressMap(user.uid);

  const q = query(
    collection(db, 'courses'),
    where('level', '==', LEVEL),
    orderBy('order'),
  );

  const snap = await getDocs(q);

  const topics = snap.docs
    .map((d, idx) => ({ idx, topic: { id: d.id, ...(d.data() || {}) } }))
    .filter((t) => t.topic.isArchived !== true);

  // move completed to the end, keep original order otherwise
  topics.sort((a, b) => {
    if (previewOnly) return a.idx - b.idx;
    const keyA = topicKeyFor(a.topic);
    const keyB = topicKeyFor(b.topic);
    const doneA = keyA && progressMap[keyA]?.completed === true ? 1 : 0;
    const doneB = keyB && progressMap[keyB]?.completed === true ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    return a.idx - b.idx;
  });

  for (const item of topics) {
    const topic = item.topic;
    const [lessonBadge, exCount] = previewOnly
      ? ['', 0]
      : await Promise.all([getLessonBadge(topic.id), getExercisesCount(topic.id)]);

    const key = topicKeyFor(topic);
    const progress = key ? progressMap[key] : null;

    host.insertAdjacentHTML(
      'beforeend',
      renderCard(topic, lessonBadge, exCount, flags.hasLevelAccess, previewOnly, progress),
    );
  }

  if (snap.empty) {
    host.innerHTML = `<div class="card" style="padding:16px;">No hay temas para este nivel.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const heroIcon = document.getElementById('heroLevelIcon');
  if (heroIcon) heroIcon.textContent = LEVEL;
  initLevelButtonsGuard();
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    loadTopics(user);
  });
});
