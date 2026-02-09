// assets/js/pages/kurs-pl-page.js
// Alternate course view ("Ruta PRO") with calmer, Busuu-like unit cards.
//
// URL: kurs-pl.html?level=A1

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
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
const TRACK = String(params.get('track') || document.body?.dataset?.track || '')
  .trim()
  .toLowerCase();
const COURSE_VIEW = String(params.get('view') || document.body?.dataset?.courseview || '')
  .trim()
  .toLowerCase();
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

function navParams() {
  const parts = [];
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (COURSE_VIEW) parts.push(`view=${encodeURIComponent(COURSE_VIEW)}`);
  return parts.length ? `&${parts.join('&')}` : '';
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

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = String(value ?? '');
}

function showLevelNotice(msg) {
  if (!accessModalLine1 || !accessModalLine2) return;
  accessModalLine1.textContent = String(msg || 'Sin acceso.');
  accessModalLine2.textContent = '';
  if (accessModalBuy) accessModalBuy.href = `services.html?level=${encodeURIComponent(LEVEL)}`;
  if (accessModal) accessModal.style.display = 'flex';
}

function showAccessPopup(level) {
  if (!accessModalLine1 || !accessModalLine2) return;
  accessModalLine1.textContent = `Este nivel todavía no es tuyo 😜`;
  accessModalLine2.textContent = `Nivel: ${String(level || '').toUpperCase()}`;
  if (accessModalBuy) accessModalBuy.href = `services.html?level=${encodeURIComponent(level || LEVEL)}`;
  if (accessModal) accessModal.style.display = 'flex';
}

function hideAccessPopup() {
  if (accessModal) accessModal.style.display = 'none';
}

function wireLevelButtons(flags) {
  const links = Array.from(document.querySelectorAll('.levelButtons a[href]'));
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

function truncateText(raw, maxLen) {
  const s = String(raw ?? '').trim();
  const max = Number(maxLen || 0);
  if (!s || !max || max < 8) return s;
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

function clamp(n, min, max) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
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

function topicMatchesTrack(topic) {
  const tracks = topicTrackList(topic);
  if (TRACK) return tracks.includes(TRACK);
  return tracks.length === 0;
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

  if (
    raw === 'both' ||
    raw === 'mix' ||
    raw === 'mixed' ||
    raw === 'mieszane' ||
    raw.includes('+')
  )
    return 'both';

  return raw;
}

function topicAccent(topic) {
  const t = topicTypeKey(topic);
  if (t === 'vocabulary') return 'yellow';
  if (t === 'grammar') return 'blue';
  if (t === 'both') return 'red';
  if (LEVEL === 'B1') return 'red';
  if (LEVEL === 'B2') return 'yellow';
  return 'blue';
}

function typeLabel(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return '';
  if (t === 'grammar' || t === 'gramatyka') return 'Gramática';
  if (
    t === 'vocab' ||
    t === 'vocabulary' ||
    t === 'vocabulario' ||
    t === 'slownictwo' ||
    t === 's\u0142ownictwo'
  )
    return 'Vocabulario';
  if (t === 'both' || t.includes('+')) return 'Mixto';
  return String(raw || '').trim();
}

function progressPct(progress) {
  if (!progress) return 0;
  if (progress.completed === true) return 100;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  const best = testTotal > 0 ? Math.max(practice, testScore) : practice;
  return clamp(Math.round(best), 0, 100);
}

function progressState(progress) {
  const pct = progressPct(progress);
  const done = progress?.completed === true || pct >= 100;
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

function ringSvg(pct, accent) {
  const safePct = clamp(pct, 0, 100);
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (safePct / 100) * c;
  const gap = Math.max(0, c - dash);
  return `
    <svg class="kpRing" viewBox="0 0 44 44" data-accent="${safeText(accent)}" aria-hidden="true" focusable="false">
      <circle class="kpRingBg" cx="22" cy="22" r="${r}" />
      <circle class="kpRingFg" cx="22" cy="22" r="${r}" stroke-dasharray="${dash} ${gap}" />
    </svg>
  `;
}

function guessTopicEmoji(topic) {
  const title = String(topic?.title || topic?.name || '').toLowerCase();
  const slug = String(topic?.slug || topic?.id || '').toLowerCase();
  const tags = Array.isArray(topic?.tags) ? topic.tags.join(' ').toLowerCase() : '';
  const hay = `${title} ${slug} ${tags}`;

  const table = [
    [/miast|ciudad|city|miejsc|lugar/, '\uD83C\uDFD9\uFE0F'],
    [/dom|casa|hogar|mieszka|viviend/, '\uD83C\uDFE0'],
    [/rodzin|familia|amig|friend/, '\uD83D\uDC6A'],
    [/jedzen|comida|restaur|cocin|food/, '\uD83C\uDF72'],
    [/kaw|caf\u00e9|cafe|cafetera/, '\u2615'],
    [/zakup|compras|tiend|shop|super/, '\uD83D\uDED2'],
    [/podr\u00f3\u017c|podroz|viaj|travel|aeropuert|av[i\u00ed]on|samolot/, '\u2708\uFE0F'],
    [/transport|metro|autob|bus|tren|train/, '\uD83D\uDE8C'],
    [/prac|trabaj|oficin|job/, '\uD83D\uDCBC'],
    [/studi|estudi|univers|escuel|school/, '\uD83C\uDF93'],
    [/zdrow|salud|doctor|medic|clinic/, '\uD83E\uDE7A'],
    [/czas|tiempo|hora|reloj|time/, '\u23F0'],
    [/pogon|pogod|clima|weather/, '\uD83C\uDF24\uFE0F'],
    [/muzyk|m\u00fasica|musica|music/, '\uD83C\uDFB6'],
    [/fiest|imprez|party/, '\uD83C\uDF89'],
    [/telefon|tel[e\u00e9]fon|llamar|call/, '\uD83D\uDCDE'],
  ];

  for (const [re, icon] of table) {
    if (re.test(hay)) return icon;
  }

  const k = topicTypeKey(topic);
  if (k === 'vocabulary') return '\uD83D\uDD24';
  if (k === 'both') return '\uD83E\uDDE9';
  return '\uD83D\uDCD8';
}

function renderTopicVisual(topic, accent) {
  const img = String(topic?.imageUrl || '').trim();
  const icon = clampGlyph(topic?.icon || '', { maxChars: 6 }) || guessTopicEmoji(topic);
  if (img) {
    return `
      <div class="topicThumb" data-accent="${safeText(accent)}">
        <img class="topicThumbImg" src="${safeText(img)}" alt="" loading="lazy" />
      </div>
    `;
  }
  return `
    <div class="topicThumb topicThumb--emoji" data-accent="${safeText(accent)}" aria-hidden="true">
      <span class="topicThumbEmoji">${safeText(icon)}</span>
    </div>
  `;
}

function buildMixedUnits(topics) {
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

  // Fallback: single-topic units (keeps orderBy('order') sequence).
  if (!grammar.length || !vocab.length) {
    const base = (topics || []).slice();
    return base.map((t) => [t]).filter((u) => u.length);
  }

  const units = [];
  const max = Math.max(grammar.length, vocab.length, both.length);
  for (let i = 0; i < max; i += 1) {
    const unit = [];
    if (grammar[i]) unit.push(grammar[i]);
    if (vocab[i]) unit.push(vocab[i]);
    if (both[i]) unit.push(both[i]);
    if (unit.length) units.push(unit);
  }

  other.forEach((t) => units.push([t]));
  return units;
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
    console.warn('[kurs-pl] getUserFlags failed', e);
    return { isAdmin: false, hasLevelAccess: false, blocked: false };
  }
}

function showAccessLocked() {
  const host = document.querySelector('.container') || document.body;
  const page = document.querySelector('main.page .container') || host;
  const grid = document.getElementById('unitsList');

  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '16px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Este nivel está bloqueado para tu cuenta en este momento.
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

async function loadProgressMap(uid) {
  try {
    const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const map = {};
    snap.forEach((d) => {
      map[d.id] = d.data() || {};
    });
    return map;
  } catch (e) {
    console.warn('[kurs-pl] loadProgressMap failed', e);
    return {};
  }
}

function topicKeyFor(topic) {
  const slug = String(topic?.slug || topic?.id || '').trim();
  return slug ? `${LEVEL}__${slug}` : null;
}

async function loadExercisesCountMap(topicIds) {
  const ids = Array.isArray(topicIds)
    ? [...new Set(topicIds.map(String).filter(Boolean))]
    : [];
  if (!ids.length) return {};

  const counts = {};
  const idsSet = new Set(ids);
  try {
    const snap = await getDocs(query(collection(db, 'exercises'), where('level', '==', LEVEL)));
    snap.forEach((d) => {
      const data = d.data() || {};
      const tid = String(data.topicId || '').trim();
      if (!tid || !idsSet.has(tid)) return;
      counts[tid] = (counts[tid] || 0) + 1;
    });
  } catch (e) {
    console.warn('[kurs-pl] loadExercisesCountMap failed', e);
  }
  return counts;
}

function renderLessonRow({ topic, idx, exCount, progress, isCurrent, readOnly }) {
  const title = safeText(topic?.title || 'Tema');
  const desc = safeText(truncateText(topic?.desc || '', 84));
  let href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;

  const st = progressState(progress);
  const accent = topicAccent(topic);

  const iconInner = st.done ? '&#x2713;' : isCurrent ? '&#9654;' : String(idx + 1);
  const metaBits = [];
  const label = typeLabel(topic?.type);
  if (label) metaBits.push(`<span class="pill">${safeText(label)}</span>`);
  if (exCount > 0) metaBits.push(`<span class="pill pill-yellow">${Number(exCount)} ejercicios</span>`);
  if (st.done) metaBits.push('<span class="pill pill-blue">Listo</span>');
  else if (st.inProgress && st.pct > 0) metaBits.push(`<span class="pill">Progreso ${st.pct}%</span>`);

  const visual = renderTopicVisual(topic, accent);

  const rowInner = `
    <div class="kpLessonRail" aria-hidden="true">
      <div class="kpLessonDot" data-accent="${safeText(accent)}">
        ${ringSvg(st.pct, accent)}
        <div class="kpLessonDotInner">${iconInner}</div>
      </div>
    </div>
    <div class="kpLessonBody">
      <div class="kpLessonTop">
        ${visual}
        <div class="kpLessonText">
          <div class="kpLessonTitle">${title}</div>
          ${desc ? `<div class="kpLessonDesc">${desc}</div>` : ''}
          ${metaBits.length ? `<div class="kpLessonMeta">${metaBits.join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;

  if (readOnly) {
    return `<div class="kpLesson isReadOnly" data-accent="${safeText(accent)}" aria-disabled="true">${rowInner}</div>`;
  }
  return `<a class="kpLesson" data-accent="${safeText(accent)}" href="${href}" aria-label="Abrir: ${title}">${rowInner}</a>`;
}

function renderUnit({ unitNo, unitEntries, startIdx, currentIdx, readOnly }) {
  const total = unitEntries.length;
  const doneCount = unitEntries.filter((e) => e.st.done).length;
  const avgPct = total
    ? Math.round(unitEntries.reduce((sum, e) => sum + Number(e.st.pct || 0), 0) / total)
    : 0;
  const isCurrentUnit = currentIdx >= startIdx && currentIdx < startIdx + total;

  const summaryText = readOnly
    ? `Vista previa · ${total} lecciones`
    : `${doneCount}/${total} completadas · ${avgPct}%`;

  const lessonsHtml = unitEntries
    .map((e, i) =>
      renderLessonRow({
        topic: e.topic,
        idx: startIdx + i,
        exCount: readOnly ? 0 : e.exCount,
        progress: readOnly ? null : e.progress,
        isCurrent: !readOnly && startIdx + i === currentIdx,
        readOnly,
      }),
    )
    .join('');

  return `
    <details class="card kpUnit" ${isCurrentUnit ? 'open' : ''}>
      <summary class="kpUnitSummary">
        <div class="kpUnitLeft">
          <div class="kpUnitTitle">Unidad ${Number(unitNo) || 1}</div>
          <div class="kpUnitSub mutedStrong">${summaryText}</div>
        </div>
        <div class="kpUnitRight">
          <div class="kpUnitPct">${readOnly ? '' : `${avgPct}%`}</div>
          <div class="kpUnitCaret" aria-hidden="true">v</div>
        </div>
      </summary>
      <div class="kpLessonList">
        ${lessonsHtml}
      </div>
    </details>
  `;
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

  const btnQuickReview = document.getElementById('btnQuickReview');
  if (btnQuickReview) btnQuickReview.href = `review.html?level=${encodeURIComponent(LEVEL)}${navParams()}`;

  const btnQuickPassport = document.getElementById('btnQuickPassport');
  if (btnQuickPassport) btnQuickPassport.href = `recompensas.html?level=${encodeURIComponent(LEVEL)}${navParams()}`;

  const host = document.getElementById('unitsList');
  if (!host) return;
  host.innerHTML = '<div class="pathLoading">Cargando unidades...</div>';

  const progressMap = previewOnly ? {} : await loadProgressMap(user.uid);

  const q = query(collection(db, 'courses'), where('level', '==', LEVEL), orderBy('order'));
  const snap = await getDocs(q);

  const topics = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((t) => t.isArchived !== true)
    .filter(topicMatchesTrack);

  if (snap.empty || !topics.length) {
    host.innerHTML = `<div class="card" style="padding:16px;">${TRACK ? 'No hay temas para esta ruta.' : 'No hay temas para este nivel.'}</div>`;
    if (courseRouteHint) courseRouteHint.textContent = TRACK ? 'No hay temas para esta ruta todavía.' : 'No hay temas todavía.';
    if (courseRouteProgressFill) courseRouteProgressFill.style.width = '0%';
    if (btnCourseContinue) btnCourseContinue.style.display = 'none';
    return;
  }

  const units = buildMixedUnits(topics);
  const mixedTopics = units.flat();
  const exCountMap = previewOnly
    ? {}
    : await loadExercisesCountMap(mixedTopics.map((t) => t.id));

  const entries = mixedTopics.map((topic) => {
    const key = topicKeyFor(topic);
    const progress = key ? progressMap[key] : null;
    const st = progressState(progress);
    const exCount = Number(exCountMap[topic.id] || 0);
    return { topic, progress, st, exCount };
  });

  let currentIdx = entries.findIndex((e) => !e.st.done);
  if (currentIdx < 0) currentIdx = entries.length - 1;

  const doneCount = entries.filter((e) => e.st.done).length;
  const totalCount = entries.length;
  const avgPct = totalCount
    ? Math.round(entries.reduce((sum, e) => sum + Number(e.st.pct || 0), 0) / totalCount)
    : 0;

  if (courseRouteHint) {
    courseRouteHint.textContent = previewOnly
      ? 'Vista previa: puedes ver los temas de A1.'
      : `${doneCount}/${totalCount} completados · Progreso ${avgPct}%`;
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
      btnCourseContinue.href = `review.html?level=${encodeURIComponent(LEVEL)}${navParams()}`;
    } else {
      const current = entries[currentIdx]?.topic;
      if (!current?.id) {
        btnCourseContinue.style.display = 'none';
      } else {
        btnCourseContinue.style.display = '';
        btnCourseContinue.textContent = 'Continuar';
        let href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(current.id)}`;
        if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
        if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
        btnCourseContinue.href = href;
      }
    }
  }

  let html = '';
  let cursor = 0;
  for (let u = 0; u < units.length; u += 1) {
    const unitLen = units[u].length;
    const chunk = entries.slice(cursor, cursor + unitLen);
    html += renderUnit({
      unitNo: u + 1,
      unitEntries: chunk,
      startIdx: cursor,
      currentIdx,
      readOnly: previewOnly,
    });
    cursor += unitLen;
  }

  host.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  const heroIcon = document.getElementById('heroLevelIcon');
  if (heroIcon) heroIcon.textContent = LEVEL;
  const btnClassic = document.getElementById('btnClassicView');
  if (btnClassic) {
    const base = `course.html?level=${encodeURIComponent(LEVEL)}`;
    btnClassic.href = TRACK ? `${base}&track=${encodeURIComponent(TRACK)}` : base;
  }

  document.querySelectorAll('.levelButtons a[href]').forEach((link) => {
    try {
      const raw = link.getAttribute('href') || '';
      const url = new URL(raw, location.href);
      const level = (url.searchParams.get('level') || '').toUpperCase();
      if (!level) return;
      if (url.pathname !== location.pathname) return;
      if (TRACK) url.searchParams.set('track', TRACK);
      if (COURSE_VIEW) url.searchParams.set('view', COURSE_VIEW);
      link.setAttribute('href', `${url.pathname}${url.search}`);
    } catch {}
  });

  initLevelButtonsGuard();
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    loadTopics(user);
  });
});
