// assets/js/pages/course-page.js
// Course topics learning path (Duolingo-like):
// - Topics from courses where level == LEVEL
// - Progress from user_progress/{uid}/topics
// - Exercises count (aggregated by level/topicId)

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
  if (LEVEL === 'B1') return 'red';
  if (LEVEL === 'B2') return 'yellow';
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
  const href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;
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
  return slug ? `${LEVEL}__${slug}` : null;
}

async function loadExercisesCountMap(topicIds) {
  const ids = Array.isArray(topicIds)
    ? [...new Set(topicIds.map(String).filter(Boolean))]
    : [];
  if (!ids.length) return {};

  const counts = {};
  const idsSet = new Set(ids);

  // 1) Fast path (small payload): load all exercises for the level and count by topicId.
  // Avoids composite indexes and "in" limits.
  try {
    const snap = await getDocs(
      query(collection(db, 'exercises'), where('level', '==', LEVEL)),
    );
    snap.forEach((d) => {
      const data = d.data() || {};
      const tid = String(data.topicId || '').trim();
      if (!tid || !idsSet.has(tid)) return;
      counts[tid] = (counts[tid] || 0) + 1;
    });
  } catch (e) {
    console.warn('[course] loadExercisesCountMap failed', e);
  }

  return counts;
}

async function loadTopics(user) {
  const subtitle = $('levelSubtitle');
  const flags = await getUserFlags(user.uid, user.email);
  wireLevelButtons(flags);
  const adminQuick = document.getElementById('adminQuickLesson');
  if (adminQuick) {
    adminQuick.style.display =
      flags?.isAdmin || isAdminSession() ? '' : 'none';
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
  if (subtitle) subtitle.textContent = `Nivel ${LEVEL}`;

  const host = $('topicsList');
  if (!host) return;

  host.innerHTML = '<div class="pathLoading">Cargando ruta...</div>';

  const progressMap = previewOnly ? {} : await loadProgressMap(user.uid);

  const q = query(
    collection(db, 'courses'),
    where('level', '==', LEVEL),
    orderBy('order'),
  );

  const snap = await getDocs(q);

  const topics = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((t) => t.isArchived !== true);

  if (snap.empty || !topics.length) {
    host.innerHTML = `<div class="card" style="padding:16px;">No hay temas para este nivel.</div>`;
    if (courseRouteHint) courseRouteHint.textContent = 'No hay temas todavia.';
    if (courseRouteProgressFill) courseRouteProgressFill.style.width = '0%';
    if (btnCourseContinue) btnCourseContinue.style.display = 'none';
    return;
  }

  const mixedTopics = buildMixedRoute(topics);
  const exCountMap = previewOnly ? {} : await loadExercisesCountMap(mixedTopics.map((t) => t.id));

  const entries = mixedTopics.map((topic) => {
    const key = topicKeyFor(topic);
    const progress = key ? progressMap[key] : null;
    const st = progressState(progress);
    const exCount = Number(exCountMap[topic.id] || 0);
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
      const prefix = hasMixedTypes
        ? 'Ruta mixta (Gramatica + Vocabulario) - '
        : '';
      courseRouteHint.textContent = `${prefix}${doneCount}/${totalCount} completados - Progreso ${avgPct}%`;
    }
  }
  if (courseRouteProgressFill) {
    courseRouteProgressFill.style.width = `${previewOnly ? 0 : avgPct}%`;
  }

  if (btnCourseContinue) {
    if (previewOnly) {
      btnCourseContinue.style.display = 'none';
    } else {
      if (doneCount === totalCount) {
        btnCourseContinue.style.display = '';
        btnCourseContinue.textContent = 'Repasar';
        btnCourseContinue.href = `review.html?level=${encodeURIComponent(LEVEL)}`;
      } else {
        const current = entries[currentIdx]?.topic;
        if (!current?.id) {
          btnCourseContinue.style.display = 'none';
          return;
        }
        btnCourseContinue.style.display = '';
        btnCourseContinue.textContent = 'Continuar';
        btnCourseContinue.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(current.id)}`;
      }
    }
  }

  const UNIT_SIZE = 6;
  let html = '';
  for (let i = 0; i < entries.length; i += 1) {
    if (i % UNIT_SIZE === 0) {
      html += renderUnitHeader(Math.floor(i / UNIT_SIZE) + 1);
    }
    const e = entries[i];
    html += renderPathStep({
      topic: e.topic,
      idx: i,
      exCount: previewOnly ? 0 : e.exCount,
      progress: previewOnly ? null : e.progress,
      isCurrent: !previewOnly && i === currentIdx,
      isLast: i === entries.length - 1,
      readOnly: previewOnly,
    });
  }

  host.innerHTML = html;
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
