// assets/js/pages/course-page.js
// Course topics learning path (Duolingo-like):
// - Topics from courses where level == LEVEL
// - Progress from user_progress/{uid}/topics
// - Exercises count (aggregated by level/topicId)

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { KNOWN_LEVELS, levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  checkpointBlockRange,
  hasCheckpoint,
  requiredCheckpointCountForRouteIndex,
} from '../progress-tools.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const TRACK = String(params.get('track') || document.body?.dataset?.track || '')
  .trim()
  .toLowerCase();
const COURSE_VIEW = String(params.get('view') || document.body?.dataset?.courseview || '')
  .trim()
  .toLowerCase();
const FLOW = String(params.get('flow') || '')
  .trim()
  .toLowerCase();
const CONTINUOUS_FLOW = FLOW === 'continuous' || COURSE_VIEW === 'pro';
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

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

    const rawLevels = normalizeLevelList(d.levels);
    const levels = rawLevels.length ? rawLevels : normalizeLevelList(levelsFromPlan(d.plan));

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
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (COURSE_VIEW) parts.push(`view=${encodeURIComponent(COURSE_VIEW)}`);
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
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
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
    [/miast|ciudad|city|miejsc|lugar/, '\uD83C\uDFD9\uFE0F'], // 🏙️
    [/dom|casa|hogar|mieszka|viviend/, '\uD83C\uDFE0'], // 🏠
    [/rodzin|familia|amig|friend/, '\uD83D\uDC6A'], // 👪
    [/jedzen|comida|restaur|cocin|food/, '\uD83C\uDF72'], // 🍲
    [/kaw|caf\u00e9|cafe|cafetera/, '\u2615'], // ☕
    [/zakup|compras|tiend|shop|super/, '\uD83D\uDED2'], // 🛒
    [/podr\u00f3\u017c|podroz|viaj|travel|aeropuert|av[i\u00ed]on|samolot/, '\u2708\uFE0F'], // ✈️
    [/transport|metro|autob|bus|tren|train/, '\uD83D\uDE8C'], // 🚌
    [/prac|trabaj|oficin|job/, '\uD83D\uDCBC'], // 💼
    [/studi|estudi|univers|escuel|school/, '\uD83C\uDF93'], // 🎓
    [/zdrow|salud|doctor|medic|clinic/, '\uD83E\uDE7A'], // 🩺
    [/czas|tiempo|hora|reloj|time/, '\u23F0'], // ⏰
    [/pogon|pogod|clima|weather/, '\uD83C\uDF24\uFE0F'], // 🌤️
    [/muzyk|m\u00fasica|musica|music/, '\uD83C\uDFB6'], // 🎶
    [/fiest|imprez|party/, '\uD83C\uDF89'], // 🎉
    [/telefon|tel[e\u00e9]fon|llamar|call/, '\uD83D\uDCDE'], // 📞
  ];

  for (const [re, icon] of table) {
    if (re.test(hay)) return icon;
  }

  const k = topicTypeKey(topic);
  if (k === 'vocabulary') return '\uD83D\uDD24'; // 🔤
  if (k === 'both') return '\uD83E\uDDE9'; // 🧩
  return '\uD83D\uDCD8'; // 📘
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

function renderUnitHeader(n) {
  return `
    <div class="pathUnitHead">
      <div class="pathUnitTitle">Unidad ${Number(n) || 1}</div>
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
  const flags = await getUserFlags(user.uid, user.email);
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
    const routeLevels = routeLevelsFromFlags(flags, { previewOnly });
    for (const lvl of routeLevels) {
      const selected = await loadTopicsForLevel(lvl);
      const mixed = buildMixedRoute(selected).map((t) => ({ ...t, __routeLevel: lvl }));
      routeTopics.push(...mixed);
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
    const progress = key ? progressMap[key] : null;
    const st = progressState(progress);
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
  let missingCheckpoint = 0;
  if (!previewOnly && CONTINUOUS_FLOW && !flags?.isAdmin) {
    const required = requiredCheckpointCountForRouteIndex(currentIdx);
    for (let block = 1; block <= required; block += 1) {
      const ok = await hasCheckpoint(user.uid, block, {
        track: TRACK,
        view: COURSE_VIEW,
        flow: 'continuous',
      });
      if (!ok) {
        missingCheckpoint = block;
        break;
      }
    }
  }

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
      if (missingCheckpoint > 0 && CONTINUOUS_FLOW) {
        courseRouteHint.textContent = `${base} - Mini-test checkpoint ${missingCheckpoint} requerido.`;
      } else {
        courseRouteHint.textContent = base;
      }
    }
  }
  if (courseRouteProgressFill) {
    courseRouteProgressFill.style.width = `${previewOnly ? 0 : avgPct}%`;
  }

  if (btnCourseContinue) {
    if (previewOnly) {
      btnCourseContinue.style.display = 'none';
    } else if (missingCheckpoint > 0 && CONTINUOUS_FLOW) {
      const { end } = checkpointBlockRange(missingCheckpoint);
      const anchor = entries[Math.min(entries.length - 1, end)]?.topic || null;
      const anchorLevel = topicLevelOf(anchor, LEVEL);
      btnCourseContinue.style.display = '';
      btnCourseContinue.textContent = 'Mini-test checkpoint';
      btnCourseContinue.href = `review.html?level=${encodeURIComponent(anchorLevel)}&mode=minitest&block=${encodeURIComponent(missingCheckpoint)}${navParams()}`;
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

  const UNIT_SIZE = 6;
  const visibleIdx =
    missingCheckpoint > 0 && CONTINUOUS_FLOW
      ? Math.min(currentIdx, checkpointBlockRange(missingCheckpoint).end)
      : currentIdx;
  const visibleCount = Math.min(entries.length, Math.max(1, visibleIdx + 1));
  const visibleEntries = entries.slice(0, visibleCount);
  let html = '';
  for (let i = 0; i < visibleEntries.length; i += 1) {
    if (i % UNIT_SIZE === 0) {
      html += renderUnitHeader(Math.floor(i / UNIT_SIZE) + 1);
    }
    const e = visibleEntries[i];
    html += renderPathStep({
      topic: e.topic,
      idx: i,
      exCount: previewOnly ? 0 : e.exCount,
      progress: previewOnly ? null : e.progress,
      isCurrent: !previewOnly && i === visibleIdx,
      isLast: i === visibleEntries.length - 1,
      readOnly: previewOnly,
    });
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

