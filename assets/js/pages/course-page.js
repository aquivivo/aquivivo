// assets/js/pages/course-page.js
// Course topics learning path (Duolingo-like):
// - Topics from courses where level == LEVEL
// - Progress from user_progress/{uid}/topics
// - Exercises count (aggregated by level/topicId)

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { KNOWN_LEVELS, levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import { isQaAdminUser } from '../qa-admin-tools.js';
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
const SINGLE_COURSE_KEY = 'COURSE_PATH';
const COURSE_KEY = SINGLE_COURSE_KEY;
const TRACK = String(params.get('track') || document.body?.dataset?.track || '')
  .trim()
  .toLowerCase();
const COURSE_VIEW = '';
const FLOW = String(params.get('flow') || '')
  .trim()
  .toLowerCase();
const FORCE_CONTINUOUS_FOR_SINGLE_COURSE = COURSE_KEY === SINGLE_COURSE_KEY;
const CONTINUOUS_FLOW =
  FORCE_CONTINUOUS_FOR_SINGLE_COURSE || FLOW === 'continuous' || COURSE_VIEW === 'pro';
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

const STAMP_CATALOG_BY_LEVEL = {
  A1: {
    region: 'Wielkopolskie',
    cities: [
      { city: 'Pozna\u0144', landmark: 'Stary Rynek' },
      { city: 'Pozna\u0144', landmark: 'Ostr\u00f3w Tumski' },
      { city: 'Pozna\u0144', landmark: 'Zamek Cesarski' },
      { city: 'Pozna\u0144', landmark: 'Brama Poznania' },
      { city: 'Pozna\u0144', landmark: 'Cytadela' },
      { city: 'K\u00f3rnik', landmark: 'Zamek' },
      { city: 'Rogalin', landmark: 'Pa\u0142ac' },
      { city: 'Gniezno', landmark: 'Katedra' },
      { city: 'Go\u0142uch\u00f3w', landmark: 'Zamek' },
      { city: 'Kalisz', landmark: 'Ratusz' },
      { city: 'Leszno', landmark: 'Rynek' },
      { city: 'Konin', landmark: 'S\u0142up Koni\u0144ski' },
      { city: 'Pi\u0142a', landmark: 'Rynek' },
      { city: 'Szamotu\u0142y', landmark: 'Zamek G\u00f3rk\u00f3w' },
      { city: 'Wrze\u015bnia', landmark: 'Pomnik Dzieci Wrzesi\u0144skich' },
      { city: 'Puszczykowo', landmark: 'Muzeum Fiedlera' },
      { city: 'L\u0105d', landmark: 'Opactwo Cysters\u00f3w' },
      { city: 'Wolsztyn', landmark: 'Parowozownia' },
    ],
  },
  A2: {
    region: 'Dolno\u015bl\u0105skie',
    cities: [
      { city: 'Wroc\u0142aw', landmark: 'Rynek' },
      { city: 'Wroc\u0142aw', landmark: 'Hala Stulecia' },
      { city: 'Wroc\u0142aw', landmark: 'Ostr\u00f3w Tumski' },
      { city: 'Wroc\u0142aw', landmark: 'Panorama Rac\u0142awicka' },
      { city: 'Wroc\u0142aw', landmark: 'Ogr\u00f3d Japo\u0144ski' },
      { city: '\u015awidnica', landmark: 'Ko\u015bci\u00f3\u0142 Pokoju' },
      { city: 'Wa\u0142brzych', landmark: 'Zamek Ksi\u0105\u017c' },
      { city: 'K\u0142odzko', landmark: 'Twierdza' },
      { city: 'Le\u015bna', landmark: 'Zamek Czocha' },
      { city: 'Jelenia G\u00f3ra', landmark: 'Rynek' },
      { city: 'Legnica', landmark: 'Zamek Piastowski' },
      { city: 'Karpacz', landmark: '\u015awi\u0105tynia Wang' },
      { city: 'Lubi\u0105\u017c', landmark: 'Opactwo Cysters\u00f3w' },
      { city: 'Jawor', landmark: 'Ko\u015bci\u00f3\u0142 Pokoju' },
      { city: 'Boles\u0142awiec', landmark: 'Rynek' },
      { city: 'L\u0105dek-Zdr\u00f3j', landmark: 'Rynek' },
      { city: 'Z\u0142otoryja', landmark: 'Rynek' },
      { city: 'Szczawno-Zdr\u00f3j', landmark: 'Pijalnia W\u00f3d' },
    ],
  },
  B1: {
    region: 'Ma\u0142opolskie',
    cities: [
      { city: 'Krak\u00f3w', landmark: 'Wawel' },
      { city: 'Krak\u00f3w', landmark: 'Rynek G\u0142\u00f3wny' },
      { city: 'Krak\u00f3w', landmark: 'Sukiennice' },
      { city: 'Krak\u00f3w', landmark: 'Ko\u015bci\u00f3\u0142 Mariacki' },
      { city: 'Krak\u00f3w', landmark: 'Kazimierz' },
      { city: 'Wieliczka', landmark: 'Kopalnia Soli' },
      { city: 'Zakopane', landmark: 'Giewont' },
      { city: 'Zakopane', landmark: 'Krup\u00f3wki' },
      { city: 'Tatry', landmark: 'Morskie Oko' },
      { city: 'Niedzica', landmark: 'Zamek' },
      { city: 'Nowy S\u0105cz', landmark: 'Rynek' },
      { city: 'Tarn\u00f3w', landmark: 'Rynek' },
      { city: 'Bochnia', landmark: 'Kopalnia Soli' },
      { city: 'Ojc\u00f3w', landmark: 'Zamek' },
      { city: 'Kalwaria Zebrzydowska', landmark: 'Sanktuarium' },
      { city: 'Lanckorona', landmark: 'Rynek' },
      { city: 'Krynica-Zdr\u00f3j', landmark: 'Deptak' },
      { city: 'O\u015bwi\u0119cim', landmark: 'Miejsce Pami\u0119ci' },
    ],
  },
  B2: {
    region: 'Mazowieckie',
    cities: [
      { city: 'Warszawa', landmark: 'Stare Miasto' },
      { city: 'Warszawa', landmark: 'Zamek Kr\u00f3lewski' },
      { city: 'Warszawa', landmark: 'Pa\u0142ac Kultury' },
      { city: 'Warszawa', landmark: 'Muzeum POLIN' },
      { city: 'Wilan\u00f3w', landmark: 'Pa\u0142ac' },
      { city: '\u017belazowa Wola', landmark: 'Dom Chopina' },
      { city: 'Warszawa', landmark: '\u0141azienki Kr\u00f3lewskie' },
      { city: 'Warszawa', landmark: 'Centrum Nauki Kopernik' },
      { city: 'Warszawa', landmark: 'Muzeum Powstania Warszawskiego' },
      { city: 'P\u0142ock', landmark: 'Wzg\u00f3rze Tumskie' },
      { city: 'Czersk', landmark: 'Zamek' },
      { city: 'Radom', landmark: 'Rynek' },
      { city: 'Sierpc', landmark: 'Skansen' },
      { city: 'Modlin', landmark: 'Twierdza' },
      { city: 'Pu\u0142tusk', landmark: 'Rynek' },
      { city: 'Opinog\u00f3ra', landmark: 'Muzeum Romantyzmu' },
      { city: 'Sochaczew', landmark: 'Muzeum Kolei W\u0105skotorowej' },
      { city: '\u017byrard\u00f3w', landmark: 'Osada Fabryczna' },
    ],
  },
};
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
const courseRouteHint = document.getElementById('courseRouteHint');
const courseRouteProgressFill = document.getElementById('courseRouteProgressFill');
const btnCourseContinue = document.getElementById('btnCourseContinue');

function showAccessLocked() {
  const host = document.querySelector('.container') || document.body;
  const page = document.querySelector('main.page .container') || host;

  const grid =
    document.getElementById('topicsList') ||
    document.getElementById('topicsGrid') ||
    document.getElementById('courseList') ||
    null;

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
  if (courseRouteHint) courseRouteHint.textContent = 'Acceso requerido.';
  if (courseRouteProgressFill) courseRouteProgressFill.style.width = '0%';
  if (btnCourseContinue) btnCourseContinue.style.display = 'none';
  page.prepend(card);
}

async function getUserFlags(authUser) {
  const uid = String(authUser?.uid || '').trim();
  const email = String(authUser?.email || '').trim();
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? snap.data() || {} : {};
    const qaAdmin = await isQaAdminUser(authUser, data);
    const isAdmin = qaAdmin.allowed || isAdminUser(data, email);

    if (!snap.exists()) {
      if (isAdmin || isAdminUser(null, email)) {
        return { isAdmin: true, hasLevelAccess: true, blocked: false };
      }
      return { isAdmin: false, hasLevelAccess: false, blocked: false };
    }

    const d = data;
    const blocked = d.blocked === true;

    if (isAdmin) {
      return { isAdmin: true, hasLevelAccess: true, blocked: false };
    }

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = normalizeLevelList(d.levels);
    const levels = rawLevels.length ? rawLevels : normalizeLevelList(levelsFromPlan(d.plan));

    const plan = String(d.plan || '').toLowerCase();
    const hasGlobalAccess = plan === 'premium' || (d.access === true && levels.length === 0);
    const hasExplicitLevel = levels.includes(String(LEVEL).toUpperCase());
    const hasLevelAccess =
      hasExplicitLevel || (hasGlobalAccess && (isUntilValid || !hasUntil));

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
  if (CONTINUOUS_FLOW) {
    CURRENT_FLAGS = flags || null;
    return;
  }
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
  if (CONTINUOUS_FLOW) return;
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

function truncateText(raw, maxLen) {
  const s = String(raw ?? '').trim();
  const max = Number(maxLen || 0);
  if (!s || !max || max < 8) return s;
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

function clampGlyph(raw, { maxChars = 6 } = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return Array.from(s)
    .slice(0, Math.max(1, Number(maxChars || 6)))
    .join('');
}

function normalizeTrack(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function topicTrackList(topic) {
  const raw = topic?.track;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeTrack).filter(Boolean);
  const one = normalizeTrack(raw);
  return one ? [one] : [];
}

function topicBaseKey(topic) {
  return String(topic?.slug || topic?.id || '').trim().toLowerCase();
}

function topicOrderValue(topic) {
  const n = Number(topic?.order);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function selectTopicsForTrack(allTopics) {
  const list = Array.isArray(allTopics) ? allTopics : [];
  if (!TRACK) return list.filter((t) => topicTrackList(t).length === 0);

  const global = list.filter((t) => topicTrackList(t).length === 0);
  const local = list.filter((t) => topicTrackList(t).includes(TRACK));
  if (!global.length) return local;
  if (!local.length) return global;

  const map = new Map();
  global.forEach((t) => {
    const k = topicBaseKey(t);
    if (k) map.set(k, t);
  });
  local.forEach((t) => {
    const k = topicBaseKey(t);
    if (k) map.set(k, t);
  });

  return Array.from(map.values()).sort((a, b) => {
    const d = topicOrderValue(a) - topicOrderValue(b);
    if (d) return d;
    const ka = topicBaseKey(a);
    const kb = topicBaseKey(b);
    if (ka && kb && ka !== kb) return ka.localeCompare(kb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function prevLevelOf(level) {
  const lvl = String(level || '').toUpperCase();
  if (lvl === 'A2') return 'A1';
  if (lvl === 'B1') return 'A2';
  if (lvl === 'B2') return 'B1';
  return '';
}

function navParams() {
  const parts = [];
  parts.push(`course=${encodeURIComponent(SINGLE_COURSE_KEY)}`);
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (CONTINUOUS_FLOW) parts.push('flow=continuous');
  return parts.length ? `&${parts.join('&')}` : '';
}

function topicLevelOf(topic, fallback = LEVEL) {
  return String(topic?.level || topic?.__routeLevel || fallback || LEVEL).toUpperCase();
}

function routeLevelsFromFlags(flags, { previewOnly = false } = {}) {
  if (flags?.isAdmin || isAdminSession()) return [...LEVEL_ORDER];
  if (previewOnly) return ['A1'];
  if (flags?.hasGlobalAccess) return [...LEVEL_ORDER];
  if (Array.isArray(flags?.levels) && flags.levels.length) {
    const allowed = new Set(flags.levels.map((l) => String(l || '').toUpperCase()));
    const ordered = LEVEL_ORDER.filter((lvl) => allowed.has(lvl));
    return ordered.length ? ordered : [String(LEVEL || 'A1').toUpperCase()];
  }
  if (flags?.hasLevelAccess) return [String(LEVEL || 'A1').toUpperCase()];
  return ['A1'];
}

function courseHref(level = LEVEL) {
  const page = String(location.pathname || '').split('/').pop() || 'course.html';
  const lvl = String(level || LEVEL).toUpperCase();
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (COURSE_KEY) href += `&course=${encodeURIComponent(COURSE_KEY)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (CONTINUOUS_FLOW) href += '&flow=continuous';
  return href;
}

function applyLevelButtonVisibility(unlockedLevels) {
  if (CONTINUOUS_FLOW) return;
  const unlocked = new Set((unlockedLevels || []).map((l) => String(l || '').toUpperCase()));
  document.querySelectorAll('.levelButtons a[href]').forEach((link) => {
    try {
      const href = link.getAttribute('href') || '';
      const url = new URL(href, location.href);
      if (url.pathname !== location.pathname) return;
      const level = String(url.searchParams.get('level') || '').toUpperCase();
      if (!level) return;
      link.style.display = unlocked.has(level) ? '' : 'none';
    } catch {}
  });
}

async function loadTopicsForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl), orderBy('order')),
    );
    const all = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    return selectTopicsForTrack(all);
  } catch (e) {
    console.warn('[course] loadTopicsForLevel failed', e);
    return [];
  }
}

function normalizeLevel(raw) {
  const lvl = String(raw || '').trim().toUpperCase();
  return LEVEL_ORDER.includes(lvl) ? lvl : '';
}

function levelOrderIndex(level) {
  const idx = LEVEL_ORDER.indexOf(normalizeLevel(level));
  return idx >= 0 ? idx : 999;
}

function coursePathBaseKey(pathOrId) {
  const raw =
    typeof pathOrId === 'string'
      ? pathOrId
      : String(pathOrId?.id || pathOrId?.courseId || pathOrId?.slug || '');
  const id = String(raw || '').trim();
  if (!id) return '';
  const m = id.match(/^([A-Z0-9]+)__(.+)$/i);
  if (m && normalizeLevel(m[1])) return String(m[2] || '').trim() || id;
  return id;
}

function coursePathLevel(pathOrId) {
  const fromField = normalizeLevel(pathOrId?.level);
  if (fromField) return fromField;
  const id = String(typeof pathOrId === 'string' ? pathOrId : pathOrId?.id || '').trim();
  const m = id.match(/^([A-Z0-9]+)__/i);
  return m ? normalizeLevel(m[1]) : '';
}

function sortCoursePathDocs(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const d = levelOrderIndex(coursePathLevel(a)) - levelOrderIndex(coursePathLevel(b));
    if (d) return d;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

async function loadCoursePathDocsForKey(key) {
  const requested = String(SINGLE_COURSE_KEY || key || '').trim();
  if (!requested) return [];
  const base = coursePathBaseKey(requested) || requested;
  const ids = new Set([requested, base]);
  LEVEL_ORDER.forEach((lvl) => {
    ids.add(`${lvl}__${base}`);
    ids.add(`${lvl}__${requested}`);
  });

  const refs = [...ids]
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .map((id) => doc(db, 'course_paths', id));

  const snaps = await Promise.all(refs.map((refItem) => getDoc(refItem).catch(() => null)));
  const found = snaps
    .filter((snap) => snap?.exists?.())
    .map((snap) => ({ id: snap.id, ...(snap.data() || {}) }));
  return sortCoursePathDocs(found);
}

async function loadDefaultCoursePathDocs() {
  try {
    const snap = await getDocs(collection(db, 'course_paths'));
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((row) => String(coursePathBaseKey(row) || '').toUpperCase() === SINGLE_COURSE_KEY);
    if (!rows.length) return [];

    const groups = new Map();
    rows.forEach((row) => {
      const key = coursePathBaseKey(row);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const ranked = [...groups.values()]
      .map((group) => sortCoursePathDocs(group))
      .sort((a, b) => {
        const aLevels = new Set(a.map((x) => coursePathLevel(x))).size;
        const bLevels = new Set(b.map((x) => coursePathLevel(x))).size;
        if (bLevels !== aLevels) return bLevels - aLevels;
        return levelOrderIndex(coursePathLevel(a[0])) - levelOrderIndex(coursePathLevel(b[0]));
      });
    return ranked[0] || [];
  } catch {
    return [];
  }
}

async function loadRouteTopicsFromCoursePaths(pathDocs) {
  const rows = sortCoursePathDocs(pathDocs);
  if (!rows.length) return [];

  const moduleIds = [];
  const moduleLevelMap = new Map();
  rows.forEach((row) => {
    const lvl = coursePathLevel(row) || LEVEL;
    const ids = Array.isArray(row?.moduleIds) ? row.moduleIds : [];
    ids.forEach((rawId) => {
      const moduleId = String(rawId || '').trim();
      if (!moduleId || moduleLevelMap.has(moduleId)) return;
      moduleLevelMap.set(moduleId, lvl);
      moduleIds.push(moduleId);
    });
  });
  if (!moduleIds.length) return [];

  const moduleSnaps = await Promise.all(
    moduleIds.map((moduleId) => getDoc(doc(db, 'modules', moduleId)).catch(() => null)),
  );
  const modules = moduleIds
    .map((moduleId, idx) => {
      const snap = moduleSnaps[idx];
      if (!snap?.exists?.()) return null;
      return { id: moduleId, ...(snap.data() || {}) };
    })
    .filter(Boolean);
  if (!modules.length) return [];

  const topicIds = [
    ...new Set(
      modules
        .map((m) => String(m?.topicId || '').trim())
        .filter(Boolean),
    ),
  ];
  const topicSnaps = await Promise.all(
    topicIds.map((topicId) => getDoc(doc(db, 'courses', topicId)).catch(() => null)),
  );
  const topicMap = new Map();
  topicIds.forEach((topicId, idx) => {
    const snap = topicSnaps[idx];
    if (!snap?.exists?.()) return;
    topicMap.set(topicId, { id: topicId, ...(snap.data() || {}) });
  });

  const used = new Set();
  let seq = 0;
  const out = [];

  modules.forEach((moduleItem) => {
    const lvl = coursePathLevel(moduleItem) || moduleLevelMap.get(moduleItem.id) || LEVEL;
    const topicId =
      String(moduleItem?.topicId || '').trim() ||
      String(moduleItem?.topicSlug || '').trim() ||
      String(moduleItem?.id || '').trim();
    if (!topicId) return;

    const baseTopic = topicMap.get(String(moduleItem?.topicId || '').trim()) || {};
    const topicSlug = String(moduleItem?.topicSlug || baseTopic?.slug || topicId).trim();
    const unique = `${lvl}__${topicSlug || topicId}`;
    if (used.has(unique)) return;
    used.add(unique);

    seq += 1;
    out.push({
      ...baseTopic,
      id: topicId,
      slug: topicSlug,
      title:
        String(moduleItem?.title || '').trim() ||
        String(baseTopic?.title || baseTopic?.name || '').trim() ||
        `Tema ${seq}`,
      desc: String(baseTopic?.desc || baseTopic?.subtitle || '').trim(),
      type: moduleItem?.type || baseTopic?.type || baseTopic?.category || 'both',
      order: seq,
      __routeLevel: lvl,
    });
  });

  return out;
}

function topicProgressKey(level, topic) {
  const lvl = String(level || topicLevelOf(topic)).toUpperCase();
  const slug = String(topic?.slug || topic?.id || '').trim();
  return lvl && slug ? `${lvl}__${slug}` : null;
}

async function isLevelCompleted(uid, level, progressMap) {
  if (!uid || !level) return true;
  const lvl = String(level || '').toUpperCase();
  const topics = await loadTopicsForLevel(lvl);
  if (!topics.length) return true;
  return topics.every((t) => {
    const key = topicProgressKey(lvl, t);
    const prog = key ? progressMap?.[key] : null;
    return progressState(prog).done;
  });
}

async function computeUnlockedLevels(uid, flags, progressMap, { previewOnly = false } = {}) {
  if (flags?.isAdmin || isAdminSession()) return [...LEVEL_ORDER];

  const accessible = new Set();
  if (previewOnly) {
    accessible.add('A1');
  } else if (flags?.hasGlobalAccess) {
    LEVEL_ORDER.forEach((l) => accessible.add(l));
  } else if (Array.isArray(flags?.levels)) {
    flags.levels.forEach((l) => accessible.add(String(l || '').toUpperCase()));
  } else if (flags?.hasLevelAccess) {
    accessible.add(String(LEVEL || '').toUpperCase());
  }

  const orderedAccessible = LEVEL_ORDER.filter((l) => accessible.has(l));
  if (orderedAccessible.length <= 1) return orderedAccessible.length ? orderedAccessible : ['A1'];

  const unlocked = [];
  const completionCache = {};

  for (const lvl of orderedAccessible) {
    if (!unlocked.length) {
      unlocked.push(lvl);
      continue;
    }
    const prev = unlocked[unlocked.length - 1];
    if (completionCache[prev] !== true) {
      completionCache[prev] = await isLevelCompleted(uid, prev, progressMap);
    }
    if (completionCache[prev] === true) unlocked.push(lvl);
    else break;
  }
  return unlocked;
}

function guessTopicEmoji(topic) {
  const title = String(topic?.title || topic?.name || '').toLowerCase();
  const slug = String(topic?.slug || topic?.id || '').toLowerCase();
  const tags = Array.isArray(topic?.tags) ? topic.tags.join(' ').toLowerCase() : '';
  const hay = `${title} ${slug} ${tags}`;

  const table = [
    [/miast|ciudad|city|miejsc|lugar/, '\uD83C\uDFD9\uFE0F'], // Ã°Å¸Ââ„¢Ã¯Â¸Â
    [/dom|casa|hogar|mieszka|viviend/, '\uD83C\uDFE0'], // Ã°Å¸ÂÂ 
    [/rodzin|familia|amig|friend/, '\uD83D\uDC6A'], // Ã°Å¸â€˜Âª
    [/jedzen|comida|restaur|cocin|food/, '\uD83C\uDF72'], // Ã°Å¸ÂÂ²
    [/kaw|caf\u00e9|cafe|cafetera/, '\u2615'], // Ã¢Ëœâ€¢
    [/zakup|compras|tiend|shop|super/, '\uD83D\uDED2'], // Ã°Å¸â€ºâ€™
    [/podr\u00f3\u017c|podroz|viaj|travel|aeropuert|av[i\u00ed]on|samolot/, '\u2708\uFE0F'], // Ã¢Å“Ë†Ã¯Â¸Â
    [/transport|metro|autob|bus|tren|train/, '\uD83D\uDE8C'], // Ã°Å¸Å¡Å’
    [/prac|trabaj|oficin|job/, '\uD83D\uDCBC'], // Ã°Å¸â€™Â¼
    [/studi|estudi|univers|escuel|school/, '\uD83C\uDF93'], // Ã°Å¸Å½â€œ
    [/zdrow|salud|doctor|medic|clinic/, '\uD83E\uDE7A'], // Ã°Å¸Â©Âº
    [/czas|tiempo|hora|reloj|time/, '\u23F0'], // Ã¢ÂÂ°
    [/pogon|pogod|clima|weather/, '\uD83C\uDF24\uFE0F'], // Ã°Å¸Å’Â¤Ã¯Â¸Â
    [/muzyk|m\u00fasica|musica|music/, '\uD83C\uDFB6'], // Ã°Å¸Å½Â¶
    [/fiest|imprez|party/, '\uD83C\uDF89'], // Ã°Å¸Å½â€°
    [/telefon|tel[e\u00e9]fon|llamar|call/, '\uD83D\uDCDE'], // Ã°Å¸â€œÅ¾
  ];

  for (const [re, icon] of table) {
    if (re.test(hay)) return icon;
  }

  const k = topicTypeKey(topic);
  if (k === 'vocabulary') return '\uD83D\uDD24'; // Ã°Å¸â€Â¤
  if (k === 'both') return '\uD83E\uDDE9'; // Ã°Å¸Â§Â©
  return '\uD83D\uDCD8'; // Ã°Å¸â€œËœ
}

function renderTopicVisual(topic, accent) {
  const img = String(topic?.imageUrl || '').trim();
  const icon = clampGlyph(topic?.icon || '', { maxChars: 6 }) || guessTopicEmoji(topic);

  if (img) {
    return `
      <div class="topicThumb" data-accent="${accent}">
        <img class="topicThumbImg" src="${safeText(img)}" alt="" loading="lazy" />
      </div>
    `;
  }

  return `
    <div class="topicThumb topicThumb--emoji" data-accent="${accent}" aria-hidden="true">
      <span class="topicThumbEmoji">${safeText(icon)}</span>
    </div>
  `;
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

function clamp(n, min, max) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function typeLabel(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return '';
  if (t === 'grammar' || t === 'gramatyka') return 'Gramatica';
  if (
    t === 'vocab' ||
    t === 'vocabulary' ||
    t === 'vocabulario' ||
    t === 'slownictwo' ||
    t === 's\u0142ownictwo'
  )
    return 'Vocabulario';
  if (t === 'both' || t.includes('+')) return 'Gramatica + vocabulario';
  return String(raw || '').trim();
}

function progressPct(progress) {
  if (!progress) return 0;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  if (!CONTINUOUS_FLOW && progress.completed === true) return 100;
  const best = testTotal > 0
    ? CONTINUOUS_FLOW
      ? Math.min(practice, testScore)
      : Math.max(practice, testScore)
    : practice;
  return clamp(Math.round(best), 0, 100);
}

function hasTopicMastery(progress) {
  if (!progress) return false;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  if (CONTINUOUS_FLOW) {
    const practiceOk = practice >= 100;
    const testOk = testTotal > 0 ? testScore >= 100 : true;
    return practiceOk && testOk;
  }
  return progress.completed === true || progressPct(progress) >= 100;
}

function progressState(progress) {
  const pct = progressPct(progress);
  const done = hasTopicMastery(progress);
  const hasAny =
    progress &&
    (pct > 0 ||
      Number(progress.practiceDone || 0) > 0 ||
      Number(progress.testTotal || 0) > 0);
  return {
    pct,
    done,
    inProgress: !done && hasAny,
    isNew: !done && !hasAny,
  };
}

function ringSvg(pct) {
  const safePct = clamp(pct, 0, 100);
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (safePct / 100) * c;
  const gap = Math.max(0, c - dash);
  return `
    <svg class="pathRing" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle class="pathRingBg" cx="22" cy="22" r="${r}" />
      <circle class="pathRingFg" cx="22" cy="22" r="${r}" stroke-dasharray="${dash} ${gap}" />
    </svg>
  `;
}

function topicTypeKey(topic) {
  const raw = String(topic?.type || topic?.category || '').trim().toLowerCase();
  if (!raw) return 'grammar';

  if (
    raw === 'vocab' ||
    raw === 'vocabulary' ||
    raw === 'vocabulario' ||
    raw === 'slownictwo' ||
    raw === 's\u0142ownictwo'
  )
    return 'vocabulary';

  if (
    raw === 'grammar' ||
    raw === 'gramatyka' ||
    raw === 'gramatica' ||
    raw === 'gram\u00e1tica'
  )
    return 'grammar';

  if (raw === 'both' || raw === 'mix' || raw === 'mixed' || raw === 'mieszane' || raw.includes('+'))
    return 'both';

  return raw;
}

function topicAccent(topic) {
  const t = topicTypeKey(topic);
  if (t === 'vocabulary') return 'yellow';
  if (t === 'grammar') return 'blue';
  if (t === 'both') return 'red';

  const cls = tileAccentClass(topic);
  if (cls.toLowerCase().includes('yellow')) return 'yellow';
  if (cls.toLowerCase().includes('red')) return 'red';
  if (cls.toLowerCase().includes('blue')) return 'blue';
  // fallback: by level (keeps your palette consistent)
  const lvl = topicLevelOf(topic);
  if (lvl === 'B1') return 'red';
  if (lvl === 'B2') return 'yellow';
  return 'blue';
}

function interleaveLists(a, b) {
  const out = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function buildMixedRoute(topics) {
  const grammar = [];
  const vocab = [];
  const both = [];
  const other = [];

  (topics || []).forEach((t) => {
    const k = topicTypeKey(t);
    if (k === 'vocabulary') vocab.push(t);
    else if (k === 'grammar') grammar.push(t);
    else if (k === 'both') both.push(t);
    else other.push(t);
  });

  if (!grammar.length || !vocab.length) return topics || [];

  const mixed = [];
  const max = Math.max(grammar.length, vocab.length, both.length);
  for (let i = 0; i < max; i += 1) {
    if (grammar[i]) mixed.push(grammar[i]);
    if (vocab[i]) mixed.push(vocab[i]);
    if (both[i]) mixed.push(both[i]);
  }
  return [...mixed, ...other];
}

function renderUnitHeader(n, level = '') {
  const lvl = String(level || '').toUpperCase().trim();
  const title = lvl ? `Nivel ${lvl}` : `Unidad ${Number(n) || 1}`;
  return `
    <div class="pathUnitHead">
      <div class="pathUnitTitle">${title}</div>
    </div>
  `;
}

function renderMetaPills(topic, exCount, progress) {
  const pills = [];
  const label = typeLabel(topic?.type);
  if (label) pills.push(`<span class="pill">${safeText(label)}</span>`);

  const n = Number(exCount || 0);
  if (n > 0) pills.push(`<span class="pill pill-yellow">${n} ejercicios</span>`);

  const st = progressState(progress);
  if (st.done) pills.push('<span class="pill pill-blue">Listo</span>');
  else if (st.inProgress && st.pct > 0)
    pills.push(`<span class="pill">Progreso ${st.pct}%</span>`);

  return pills.join('');
}

function renderPathStep({
  topic,
  idx,
  exCount,
  progress,
  isCurrent,
  isLast,
  readOnly,
}) {
  const title = safeText(topic?.title || 'Tema');
  const desc = safeText(truncateText(topic?.desc || '', 120));
  const topicLevel = topicLevelOf(topic);
  let href = `lessonpage.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(topic.id)}`;
  href += navParams();
  const st = progressState(progress);
  const accent = topicAccent(topic);

  const stepClass = [
    'pathStep',
    idx % 2 ? 'is-alt' : '',
    st.done ? 'is-done' : '',
    st.inProgress ? 'is-progress' : '',
    st.isNew ? 'is-new' : '',
    isCurrent ? 'is-current' : '',
    isLast ? 'is-last' : '',
    readOnly ? 'is-readonly' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const innerText = st.done ? '&#x2713;' : isCurrent ? '&#9654;' : String(idx + 1);
  const meta = renderMetaPills(topic, exCount, progress);

  const nodeInner = `<div class="pathNodeInner" aria-hidden="true">${innerText}</div>`;

  const node = readOnly
    ? `<div class="pathNode" data-accent="${accent}" aria-disabled="true" tabindex="0">${nodeInner}</div>`
    : `<a class="pathNode" data-accent="${accent}" href="${href}" aria-label="Abrir: ${title}">${nodeInner}</a>`;

  const visual = renderTopicVisual(topic, accent);

  const cardInner = `
    <div class="pathCardTop">
      ${visual}
      <div class="pathCardText">
        <div class="pathCardTitle">${title}</div>
        ${desc ? `<div class="pathCardDesc">${desc}</div>` : ''}
        ${meta ? `<div class="pathCardMeta">${meta}</div>` : ''}
      </div>
    </div>
  `;

  const card = readOnly
    ? `<div class="pathCard" data-accent="${accent}" aria-disabled="true">${cardInner}</div>`
    : `<a class="pathCard" data-accent="${accent}" href="${href}" aria-label="Abrir: ${title}">${cardInner}</a>`;

  return `
    <div class="${stepClass}">
      <div class="pathRail">
        ${node}
        <div class="pathConnector" aria-hidden="true"></div>
      </div>
      ${card}
    </div>
  `;
}

function stampCatalogForLevel(level = '') {
  const lvl = String(level || '').toUpperCase();
  return STAMP_CATALOG_BY_LEVEL[lvl] || STAMP_CATALOG_BY_LEVEL.A1;
}

function parseDocTimeMs(raw) {
  try {
    if (raw?.toDate && typeof raw.toDate === 'function') {
      const d = raw.toDate();
      return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
    }
    const d = raw ? new Date(raw) : null;
    const t = d?.getTime?.();
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function topicDoneTimeMs(progress) {
  if (!progress || typeof progress !== 'object') return 0;
  const fields = ['completedAt', 'updatedAt', 'lastCompletedAt', 'doneAt'];
  let best = 0;
  fields.forEach((key) => {
    const ms = parseDocTimeMs(progress[key]);
    if (ms > best) best = ms;
  });
  return best;
}

function formatStampDate(ms) {
  const ts = Number(ms || 0);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return '';
  }
}

function renderPassportStamp(lines = []) {
  const textRows = (Array.isArray(lines) ? lines : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map((line) => `<div style="line-height:1.2; white-space:nowrap;">${safeText(line)}</div>`)
    .join('');
  if (!textRows) return '';
  return `
    <div style="display:flex; justify-content:center; width:100%;">
      <div style="width:min(100%, 440px); transform:rotate(-3deg); border:3px double rgba(255,112,150,0.92); border-radius:4px; padding:12px 14px; text-align:center; text-transform:uppercase; font-weight:900; letter-spacing:1.15px; color:rgba(255,112,150,0.95); background:rgba(255,112,150,0.05); box-shadow:0 0 0 1px rgba(255,112,150,0.45) inset;">
        ${textRows}
      </div>
    </div>
  `;
}

function renderLevelStampStep({
  level,
  done,
  doneAtMs = 0,
  readOnly,
  isLast,
  idx,
}) {
  if (!done) return '';
  const lvl = String(level || '').toUpperCase() || 'A1';
  const stamp = stampCatalogForLevel(lvl);
  const region = String(stamp?.region || 'Polska');
  const dateLabel = formatStampDate(doneAtMs);
  const stampHtml = renderPassportStamp(['AquiVivo', region, dateLabel]);
  const stepClass = [
    'pathStep',
    Number(idx || 0) % 2 ? 'is-alt' : '',
    'is-done',
    isLast ? 'is-last' : '',
    readOnly ? 'is-readonly' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <div class="${stepClass}">
      <div class="pathRail">
        <div class="pathNode" data-accent="yellow" aria-hidden="true">
          <div class="pathNodeInner">&#x2713;</div>
        </div>
        <div class="pathConnector" aria-hidden="true"></div>
      </div>
      ${stampHtml}
    </div>
  `;
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
  const lvl = topicLevelOf(topic);
  return slug ? `${lvl}__${slug}` : null;
}

function exerciseCountKey(level, topicId) {
  const lvl = String(level || '').toUpperCase();
  const tid = String(topicId || '').trim();
  return lvl && tid ? `${lvl}__${tid}` : '';
}

async function loadExercisesCountMapForTopics(topics) {
  const list = Array.isArray(topics) ? topics : [];
  if (!list.length) return {};

  const byLevel = new Map();
  list.forEach((t) => {
    const lvl = topicLevelOf(t);
    const tid = String(t?.id || '').trim();
    if (!lvl || !tid) return;
    if (!byLevel.has(lvl)) byLevel.set(lvl, new Set());
    byLevel.get(lvl).add(tid);
  });

  const counts = {};
  for (const [lvl, idSet] of byLevel.entries()) {
    try {
      const snap = await getDocs(query(collection(db, 'exercises'), where('level', '==', lvl)));
      snap.forEach((d) => {
        const data = d.data() || {};
        const tid = String(data.topicId || '').trim();
        if (!tid || !idSet.has(tid)) return;
        const key = exerciseCountKey(lvl, tid);
        counts[key] = (counts[key] || 0) + 1;
      });
    } catch (e) {
      console.warn('[course] loadExercisesCountMapForTopics failed', lvl, e);
    }
  }

  return counts;
}

async function loadTopics(user) {
  const subtitle = $('levelSubtitle');
  const flags = await getUserFlags(user);
  wireLevelButtons(flags);

  const adminQuick = document.getElementById('adminQuickLesson');
  if (adminQuick) {
    adminQuick.href = `admin-select.html?level=${encodeURIComponent(LEVEL)}`;
    adminQuick.style.display = flags?.isAdmin || isAdminSession() ? '' : 'none';
  }

  if (flags.blocked) {
    showAccessLocked();
    return;
  }

  const previewOnly = !flags.hasLevelAccess && LEVEL === 'A1';
  if (!flags.hasLevelAccess && !previewOnly) {
    showAccessLocked();
    return;
  }

  if (subtitle) {
    subtitle.textContent = CONTINUOUS_FLOW ? 'Curso continuo A1-B2' : `Nivel ${LEVEL}`;
  }

  const host = $('topicsList');
  if (!host) return;

  host.innerHTML = '<div class="pathLoading">Cargando ruta...</div>';

  const progressMap = previewOnly ? {} : await loadProgressMap(user.uid);
  let routeTopics = [];

  if (CONTINUOUS_FLOW) {
    const pathDocs = COURSE_KEY
      ? await loadCoursePathDocsForKey(COURSE_KEY)
      : await loadDefaultCoursePathDocs();

    if (pathDocs.length) {
      const fromPaths = await loadRouteTopicsFromCoursePaths(pathDocs);
      if (fromPaths.length) routeTopics = fromPaths;

      const firstTitle = pathDocs
        .map((x) => String(x?.title || x?.name || '').trim())
        .find(Boolean);
      if (subtitle && firstTitle) subtitle.textContent = firstTitle;
    }

    if (!routeTopics.length) {
      for (const lvl of LEVEL_ORDER) {
        const selected = await loadTopicsForLevel(lvl);
        const mixed = buildMixedRoute(selected).map((t) => ({ ...t, __routeLevel: lvl }));
        routeTopics.push(...mixed);
      }
    }
  } else {
    const unlockedLevels = await computeUnlockedLevels(user.uid, flags, progressMap, { previewOnly });
    applyLevelButtonVisibility(unlockedLevels);
    if (!previewOnly && !unlockedLevels.includes(LEVEL)) {
      const prev = prevLevelOf(LEVEL);
      const msg = prev
        ? `Para abrir ${LEVEL} primero completa ${prev}.`
        : `Este nivel todavia esta bloqueado.`;
      host.innerHTML = `
        <div class="card" style="padding:16px;">
          <div class="sectionTitle" style="margin-top:0;">Acceso bloqueado</div>
          <div class="muted" style="margin-top:6px; line-height:1.6;">${msg}</div>
          <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
            ${prev ? `<a class="btn-yellow" href="${courseHref(prev)}" style="text-decoration:none;">Ir a ${prev}</a>` : ''}
            <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
          </div>
        </div>
      `;
      if (courseRouteHint) courseRouteHint.textContent = 'Acceso bloqueado.';
      if (courseRouteProgressFill) courseRouteProgressFill.style.width = '0%';
      if (btnCourseContinue) btnCourseContinue.style.display = 'none';
      return;
    }

    const selected = await loadTopicsForLevel(LEVEL);
    routeTopics = buildMixedRoute(selected).map((t) => ({ ...t, __routeLevel: LEVEL }));
  }

  if (!routeTopics.length) {
    const emptyMsg = CONTINUOUS_FLOW
      ? 'No hay modulos para este curso todavia.'
      : TRACK
        ? 'No hay temas para esta ruta.'
        : 'No hay temas para este nivel.';
    host.innerHTML = `<div class="card" style="padding:16px;">${emptyMsg}</div>`;
    if (courseRouteHint) courseRouteHint.textContent = 'No hay temas todavia.';
    if (courseRouteProgressFill) courseRouteProgressFill.style.width = '0%';
    if (btnCourseContinue) btnCourseContinue.style.display = 'none';
    return;
  }

  const exCountMap = previewOnly ? {} : await loadExercisesCountMapForTopics(routeTopics);

  const entries = routeTopics.map((topic) => {
    const key = topicKeyFor(topic);
    const rawProgress = key ? progressMap[key] : null;
    const progress = flags?.isAdmin
      ? {
          completed: true,
          practicePercent: 100,
          testTotal: 1,
          testScore: 100,
        }
      : rawProgress;
    const st = flags?.isAdmin
      ? { pct: 100, done: true, inProgress: false, isNew: false }
      : progressState(rawProgress);
    const exKey = exerciseCountKey(topicLevelOf(topic), topic.id);
    const exCount = Number(exCountMap[exKey] || 0);
    return { topic, progress, st, exCount };
  });

  const counts = entries.reduce(
    (acc, e) => {
      const k = topicTypeKey(e.topic);
      if (k === 'vocabulary') acc.vocabulary += 1;
      else if (k === 'grammar') acc.grammar += 1;
      else if (k === 'both') acc.both += 1;
      else acc.other += 1;
      return acc;
    },
    { grammar: 0, vocabulary: 0, both: 0, other: 0 },
  );
  const hasMixedTypes = counts.grammar > 0 && counts.vocabulary > 0;

  let currentIdx = entries.findIndex((e) => !e.st.done);
  if (currentIdx < 0) currentIdx = entries.length - 1;

  const doneCount = entries.filter((e) => e.st.done).length;
  const totalCount = entries.length;
  const avgPct = totalCount
    ? Math.round(entries.reduce((sum, e) => sum + Number(e.st.pct || 0), 0) / totalCount)
    : 0;

  if (courseRouteHint) {
    if (previewOnly) {
      courseRouteHint.textContent = 'Vista previa: puedes ver los temas de A1.';
    } else {
      const prefix = CONTINUOUS_FLOW
        ? 'Curso continuo A1-B2 - '
        : hasMixedTypes
          ? 'Ruta mixta (Gramatica + Vocabulario) - '
          : '';
      const base = `${prefix}${doneCount}/${totalCount} completados - Progreso ${avgPct}%`;
      courseRouteHint.textContent = base;
    }
  }
  if (courseRouteProgressFill) {
    courseRouteProgressFill.style.width = `${previewOnly ? 0 : avgPct}%`;
  }

  if (btnCourseContinue) {
    if (previewOnly) {
      btnCourseContinue.style.display = 'none';
    } else if (doneCount === totalCount) {
      btnCourseContinue.style.display = '';
      btnCourseContinue.textContent = 'Repasar';
      const finalTopic = entries[Math.max(0, entries.length - 1)]?.topic || null;
      const finalLevel = topicLevelOf(finalTopic, LEVEL);
      btnCourseContinue.href = `review.html?level=${encodeURIComponent(finalLevel)}${navParams()}`;
    } else {
      const current = entries[currentIdx]?.topic;
      if (!current?.id) {
        btnCourseContinue.style.display = 'none';
      } else {
        const currentLevel = topicLevelOf(current);
        btnCourseContinue.style.display = '';
        btnCourseContinue.textContent = 'Continuar';
        btnCourseContinue.href = `lessonpage.html?level=${encodeURIComponent(currentLevel)}&id=${encodeURIComponent(current.id)}${navParams()}`;
      }
    }
  }

  const unlockedBoundary = flags?.isAdmin
    ? Math.max(0, entries.length - 1)
    : Math.max(0, currentIdx);

  const levelStats = new Map();
  entries.forEach((entry) => {
    const lvl = topicLevelOf(entry.topic, LEVEL);
    const prev = levelStats.get(lvl) || { total: 0, done: 0, doneAtMs: 0 };
    prev.total += 1;
    if (entry.st.done) {
      prev.done += 1;
      const doneMs = topicDoneTimeMs(entry.progress);
      if (doneMs > prev.doneAtMs) prev.doneAtMs = doneMs;
    }
    levelStats.set(lvl, prev);
  });

  let currentLevelHeader = '';
  let levelSectionNo = 0;
  let renderIdx = 0;
  let html = '';
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const entryLevel = topicLevelOf(e.topic, LEVEL);
    if (entryLevel !== currentLevelHeader) {
      currentLevelHeader = entryLevel;
      levelSectionNo += 1;
      html += renderUnitHeader(levelSectionNo, entryLevel);
    }

    html += renderPathStep({
      topic: e.topic,
      idx: i,
      exCount: previewOnly ? 0 : e.exCount,
      progress: previewOnly ? null : e.progress,
      isCurrent: !previewOnly && !flags?.isAdmin && i === currentIdx,
      isLast: false,
      readOnly: previewOnly || i > unlockedBoundary,
    });
    renderIdx += 1;

    const nextLevel = i < entries.length - 1 ? topicLevelOf(entries[i + 1]?.topic, LEVEL) : '';
    const levelEnds = i === entries.length - 1 || nextLevel !== entryLevel;
    if (levelEnds) {
      const lvlStats = levelStats.get(entryLevel) || { total: 0, done: 0, doneAtMs: 0 };
      const levelDone = !!(
        flags?.isAdmin ||
        (lvlStats.total > 0 && lvlStats.done >= lvlStats.total)
      );
      const levelStampHtml = renderLevelStampStep({
        level: entryLevel,
        done: levelDone,
        doneAtMs: lvlStats.doneAtMs,
        readOnly: previewOnly || i > unlockedBoundary,
        isLast: i === entries.length - 1,
        idx: renderIdx,
      });
      if (levelStampHtml) {
        html += levelStampHtml;
        renderIdx += 1;
      }
    }
  }

  host.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  const heroIcon = document.getElementById('heroLevelIcon');
  if (heroIcon) heroIcon.textContent = CONTINUOUS_FLOW ? 'PL' : LEVEL;

  document.querySelectorAll('.levelButtons a[href]').forEach((link) => {
    try {
      const raw = link.getAttribute('href') || '';
      const url = new URL(raw, location.href);
      const level = (url.searchParams.get('level') || '').toUpperCase();
      if (url.pathname === location.pathname && level) {
        if (CONTINUOUS_FLOW) {
          link.style.display = 'none';
        }
        if (COURSE_KEY) url.searchParams.set('course', COURSE_KEY);
        if (TRACK) url.searchParams.set('track', TRACK);
        if (COURSE_VIEW) url.searchParams.set('view', COURSE_VIEW);
        if (CONTINUOUS_FLOW) url.searchParams.set('flow', 'continuous');
        link.setAttribute('href', `${url.pathname}${url.search}`);
        return;
      }
      if (CONTINUOUS_FLOW) {
        const text = String(link.textContent || '').trim().toUpperCase();
        if (LEVEL_ORDER.includes(text)) link.style.display = 'none';
      }
    } catch {}
  });

  initLevelButtonsGuard();
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    loadTopics(user);
  });
});

