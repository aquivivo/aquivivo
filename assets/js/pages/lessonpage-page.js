// assets/js/pages/lessonpage-page.js
// Contract: lessonpage.html?level=A1&id=COURSE_DOC_ID

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { KNOWN_LEVELS, levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  checkpointBlockRange,
  hasCheckpoint,
  requiredCheckpointCountForRouteIndex,
} from '../progress-tools.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(window.location.search);
const LEVEL = (qs.get('level') || 'A1').toUpperCase();
const COURSE_ID = (qs.get('id') || '').trim();
const SINGLE_COURSE_KEY = 'COURSE_PATH';
const COURSE_KEY = String(qs.get('course') || '').trim() || SINGLE_COURSE_KEY;
const TRACK = String(qs.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = '';
const FLOW = String(qs.get('flow') || '').trim().toLowerCase();
const FORCE_CONTINUOUS_FOR_SINGLE_COURSE = COURSE_KEY === SINGLE_COURSE_KEY;
const CONTINUOUS_FLOW =
  FORCE_CONTINUOUS_FOR_SINGLE_COURSE || FLOW === 'continuous' || COURSE_VIEW === 'pro';
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];
let currentTopic = null;

let selectedRating = 0;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const SPEAKER_ICON = '🔊';

function speakPolish(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;

  try {
    const utter = new SpeechSynthesisUtterance(t);
    utter.lang = 'pl-PL';
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const plVoice = voices.find((v) =>
      String(v.lang || '').toLowerCase().startsWith('pl'),
    );
    if (plVoice) utter.voice = plVoice;

    window.speechSynthesis?.cancel?.();
    window.speechSynthesis?.speak?.(utter);
  } catch {}
}

function makeSpeakerBtn(text, { title = 'Odsłuchaj (PL)', tiny = true } = {}) {
  const t = String(text || '').trim();
  if (!t) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = tiny ? 'ttsIconBtn ttsIconBtn--tiny' : 'ttsIconBtn';
  btn.textContent = SPEAKER_ICON;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    speakPolish(t);
  });
  return btn;
}

function isSpeakerLabelText(raw) {
  const t = String(raw || '').trim();
  if (!t) return false;
  return /^[A-Z]{1,2}\s*:$/.test(t);
}

function decorateLessonTts(root) {
  if (!root) return;
  if (root.dataset.ttsDecorated === '1') return;
  root.dataset.ttsDecorated = '1';

  // 1) Explicit: data-tts-pl="..."
  root.querySelectorAll('[data-tts-pl]').forEach((el) => {
    const text = String(el.getAttribute('data-tts-pl') || el.textContent || '').trim();
    if (!text) return;
    const btn = makeSpeakerBtn(text, { tiny: true });
    if (!btn) return;
    btn.style.marginLeft = '8px';
    el.insertAdjacentElement('afterend', btn);
  });

  // 2) Common formatting: bold/italic fragments usually contain Polish target language
  root.querySelectorAll('b, strong, i, em').forEach((el) => {
    const text = String(el.textContent || '').trim();
    if (!text) return;
    if (isSpeakerLabelText(text)) return;
    if (text.length > 200) return;
    const next = el.nextElementSibling;
    if (next && next.classList?.contains('ttsIconBtn')) return;
    const btn = makeSpeakerBtn(text, { tiny: true });
    if (!btn) return;
    btn.style.marginLeft = '8px';
    el.insertAdjacentElement('afterend', btn);
  });

  // 3) Mini-dialogues: <b>A:</b> ... <br/>
  const labels = Array.from(root.querySelectorAll('b, strong')).filter((el) =>
    isSpeakerLabelText(el.textContent || ''),
  );
  labels.forEach((labelEl) => {
    let node = labelEl.nextSibling;
    // Skip leading whitespace
    while (node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
      node = node.nextSibling;
    }
    if (!node) return;

    let br = null;
    let text = '';
    let cursor = node;
    while (cursor) {
      if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === 'BR') {
        br = cursor;
        break;
      }
      if (cursor.nodeType === Node.ELEMENT_NODE && cursor.classList?.contains('ttsIconBtn')) {
        cursor = cursor.nextSibling;
        continue;
      }
      text += String(cursor.textContent || '');
      cursor = cursor.nextSibling;
    }
    const line = String(text || '').trim();
    if (!line) return;

    const btn = makeSpeakerBtn(line, { title: 'Odsłuchaj zdanie (PL)', tiny: true });
    if (!btn) return;
    btn.style.marginLeft = '8px';
    const host = labelEl.parentNode;
    if (!host) return;
    if (br) host.insertBefore(btn, br);
    else host.appendChild(btn);
  });
}

function isAdminUser(userDoc, email) {
  const mail = String(email || '').toLowerCase();
  return (
    ADMIN_EMAILS.includes(mail) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin'
  );
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

  const rawType = String(topic?.type || topic?.category || '').toLowerCase();
  if (rawType.includes('vocab')) return '\uD83D\uDD24'; // 🔤
  if (rawType.includes('both') || rawType.includes('+')) return '\uD83E\uDDE9'; // 🧩
  return '\uD83D\uDCD8'; // 📘
}

function setLessonHeroVisual(topic) {
  const host = $('lessonHeroIcon');
  if (!host) return;

  const imgUrl = String(topic?.imageUrl || '').trim();
  const icon = clampGlyph(topic?.icon || '', { maxChars: 6 }) || guessTopicEmoji(topic);

  host.textContent = '';
  host.innerHTML = '';
  if (imgUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = imgUrl;
    host.appendChild(img);
  } else {
    host.textContent = icon || '\uD83D\uDCD6';
  }
}

function showAccessLocked() {
  const wrap = document.querySelector('.container') || document.body;
  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '14px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Esta leccion esta bloqueada para tu cuenta.
    </div>
    <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
      <a class="btn-yellow" href="services.html?level=${encodeURIComponent(LEVEL)}" style="text-decoration:none;">Activar acceso</a>
      <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
    </div>
  `;
  const content = $('lessonContent');
  const empty = $('lessonEmpty');
  const toc = $('tocWrap');
  const sticky = $('lessonSticky');
  if (content) content.style.display = 'none';
  if (toc) toc.style.display = 'none';
  if (sticky) sticky.style.display = 'none';
  if (empty) {
    empty.style.display = 'none';
    empty.innerHTML = '';
  }
  wrap.prepend(card);
}

async function trackTopicOpen(uid, courseId, level) {
  if (!uid || !courseId) return;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() || {} : {};
    const opened = data.openedTopics || {};
    const already = opened && opened[courseId] === true;

    const basePatch = {
      lastSeenAt: serverTimestamp(),
      lastTopicId: courseId,
      lastLevel: level || null,
    };

    if (!snap.exists()) {
      await setDoc(
        userRef,
        {
          email: auth.currentUser?.email || '',
          admin: false,
          access: false,
          plan: 'free',
          blocked: false,
          createdAt: serverTimestamp(),
          openedTopics: { [courseId]: true },
          openedTopicsCount: 1,
          ...basePatch,
        },
        { merge: true },
      );
      return;
    }

    if (already) {
      await updateDoc(userRef, basePatch);
      return;
    }

    await updateDoc(userRef, {
      ...basePatch,
      [`openedTopics.${courseId}`]: true,
      openedTopicsCount: increment(1),
    });
  } catch (e) {
    console.warn('trackTopicOpen failed', e);
  }
}

function metaDocId(level, courseId) {
  return `${level}__${courseId}`;
}

function navParams() {
  const parts = [];
  if (COURSE_KEY) parts.push(`course=${encodeURIComponent(COURSE_KEY)}`);
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (COURSE_VIEW) parts.push(`view=${encodeURIComponent(COURSE_VIEW)}`);
  if (CONTINUOUS_FLOW) parts.push('flow=continuous');
  return parts.length ? `&${parts.join('&')}` : '';
}

function coursePageName() {
  return 'course.html';
}

function courseHref(level = LEVEL) {
  const lvl = String(level || LEVEL).toUpperCase();
  const page = coursePageName();
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
  if (CONTINUOUS_FLOW) href += '&flow=continuous';
  return href;
}

function topicLevelOf(topic, fallback = LEVEL) {
  return String(topic?.level || topic?.__routeLevel || fallback || LEVEL).toUpperCase();
}

function routeLevelsFromFlags(flags) {
  if (flags?.isAdmin || flags?.hasGlobalAccess) return [...LEVEL_ORDER];
  if (Array.isArray(flags?.levels) && flags.levels.length) {
    const allowed = new Set(flags.levels.map((l) => String(l || '').toUpperCase()));
    const ordered = LEVEL_ORDER.filter((lvl) => allowed.has(lvl));
    return ordered.length ? ordered : [String(LEVEL || 'A1').toUpperCase()];
  }
  return [String(LEVEL || 'A1').toUpperCase()];
}

function normalizeTrack(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function courseTrackList(course) {
  const raw = course?.track;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeTrack).filter(Boolean);
  const one = normalizeTrack(raw);
  return one ? [one] : [];
}

function courseBaseKey(course) {
  return String(course?.slug || course?.id || '').trim().toLowerCase();
}

function courseOrderValue(course) {
  const n = Number(course?.order);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function selectCoursesForTrack(allCourses) {
  const list = Array.isArray(allCourses) ? allCourses : [];
  if (!TRACK) return list.filter((c) => courseTrackList(c).length === 0);

  const global = list.filter((c) => courseTrackList(c).length === 0);
  const local = list.filter((c) => courseTrackList(c).includes(TRACK));
  if (!global.length) return local;
  if (!local.length) return global;

  const map = new Map();
  global.forEach((c) => {
    const k = courseBaseKey(c);
    if (k) map.set(k, c);
  });
  local.forEach((c) => {
    const k = courseBaseKey(c);
    if (k) map.set(k, c);
  });

  return Array.from(map.values()).sort((a, b) => {
    const d = courseOrderValue(a) - courseOrderValue(b);
    if (d) return d;
    const ka = courseBaseKey(a);
    const kb = courseBaseKey(b);
    if (ka && kb && ka !== kb) return ka.localeCompare(kb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function topicKeyFrom(topic) {
  const slug = String(topic?.slug || topic?.id || COURSE_ID || '').trim();
  const lvl = topicLevelOf(topic, LEVEL);
  return slug ? `${lvl}__${slug}` : null;
}

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return { isAdmin: false, hasAccess: false, levels: [], hasGlobalAccess: false };

    const d = snap.data() || {};
    const isAdmin = isAdminUser(d, auth.currentUser?.email);
    if (isAdmin) return { isAdmin: true, hasAccess: true, levels: [], hasGlobalAccess: true };

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = normalizeLevelList(d.levels);
    const levels = rawLevels.length ? rawLevels : normalizeLevelList(levelsFromPlan(d.plan));

    const plan = String(d.plan || '').toLowerCase();
    const hasGlobalAccess = plan === 'premium' || (d.access === true && levels.length === 0);
    const hasAccess =
      (hasGlobalAccess || levels.includes(String(LEVEL).toUpperCase())) && isUntilValid;

    return { isAdmin: false, hasAccess, levels, hasGlobalAccess };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasAccess: false, levels: [], hasGlobalAccess: false };
  }
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = v;
}

function renderEmpty(msg) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = msg;
  }
}

function renderLocked() {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = `
      <div style="font-size:16px; line-height:1.6;">
        <b>Acceso premium</b><br/>
        Para ver esta leccion necesitas acceso.<br/>
        Ve al <a href="espanel.html" style="text-decoration:underline;">Panel</a> para aplicar un codigo o activar el plan.
      </div>
    `;
  }
}

function escHtml(value) {
  return String(value ?? '').replace(/[<>&"]/g, (ch) => {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return '&quot;';
  });
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

function isMiniTestLesson(lesson) {
  if (!lesson || typeof lesson !== 'object') return false;
  if (lesson.miniTest === true) return true;
  const id = String(lesson.id || '').toUpperCase();
  if (id.includes('MINITEST')) return true;
  const title = String(lesson.title || '').toLowerCase();
  return title.includes('mini test');
}

function isLevelExamLesson(lesson) {
  if (!lesson || typeof lesson !== 'object') return false;
  if (lesson.levelExam === true || lesson.finalExam === true) return true;
  const id = String(lesson.id || '').toUpperCase();
  if (id.includes('EXAMEN_GENERAL') || id.includes('FINAL_EXAM')) return true;
  const title = String(lesson.title || '').toLowerCase();
  return title.includes('examen general');
}

function isLessonCompleted(progressDoc) {
  const d = progressDoc || {};
  if (!d || typeof d !== 'object') return false;
  if (d.completed === true) return true;
  if (String(d.status || '').toLowerCase() === 'completed') return true;
  const pct = Number(d.overallPercent ?? d.progressPercent ?? d.practicePercent ?? 0);
  return Number.isFinite(pct) && pct >= 100;
}

function stripTopicPrefix(title, topicTitle = '') {
  const t = String(title || '').trim();
  if (!t) return '';
  const prefix = String(topicTitle || '').trim();
  if (!prefix) return t;
  const lower = t.toLowerCase();
  const lowerPrefix = `${prefix.toLowerCase()} - `;
  if (lower.startsWith(lowerPrefix)) return t.slice(prefix.length + 3).trim();
  return t;
}

function lessonHrefForRoute(level, topicId, lessonId) {
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  let href = `ejercicio.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}`;
  if (lessonId) href += `&lessonId=${encodeURIComponent(String(lessonId))}`;
  href += navParams();
  return href;
}

function miniTestHrefForRoute(level, topicId, miniLessonId) {
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  let href = `review.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}&mode=minitest`;
  if (miniLessonId) href += `&lessonId=${encodeURIComponent(String(miniLessonId))}`;
  href += navParams();
  return href;
}

function pickBestModuleForTopic(modules = [], { level = '', topicSlug = '' } = {}) {
  const lvl = String(level || '').toUpperCase();
  const slug = String(topicSlug || '').trim();
  const ranked = (modules || [])
    .filter(Boolean)
    .filter((m) => {
      const mLevel = String(m.level || '').toUpperCase();
      return !lvl || !mLevel || mLevel === lvl;
    })
    .sort((a, b) => {
      const aLen = Array.isArray(a.lessonIds) ? a.lessonIds.length : 0;
      const bLen = Array.isArray(b.lessonIds) ? b.lessonIds.length : 0;
      if (aLen !== bLen) return bLen - aLen;
      const aSlugMatch = slug && String(a.topicSlug || '').trim() === slug ? 1 : 0;
      const bSlugMatch = slug && String(b.topicSlug || '').trim() === slug ? 1 : 0;
      if (aSlugMatch !== bSlugMatch) return bSlugMatch - aSlugMatch;
      const aTime = parseDocTimeMs(a.updatedAt);
      const bTime = parseDocTimeMs(b.updatedAt);
      if (aTime !== bTime) return bTime - aTime;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  return ranked[0] || null;
}

async function loadTopicModuleWithLessons(level, topicId, topicSlug = '') {
  const topic = String(topicId || '').trim();
  const slug = String(topicSlug || '').trim();
  const lvl = String(level || '').toUpperCase();
  if (!topic && !slug) return { module: null, lessons: [] };

  const moduleIdCandidates = [];
  const pushModuleId = (raw) => {
    const id = String(raw || '').trim();
    if (!id) return;
    if (moduleIdCandidates.includes(id)) return;
    moduleIdCandidates.push(id);
  };

  const normalizedSlug = slug || topic;
  if (lvl && normalizedSlug) pushModuleId(`${lvl}__${normalizedSlug}__MODULE`);
  if (lvl && topic && topic !== normalizedSlug) pushModuleId(`${lvl}__${topic}__MODULE`);

  const coursePathIds = Array.from(
    new Set(
      [COURSE_KEY, SINGLE_COURSE_KEY, 'COURSE_PATH']
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  );

  for (const cpId of coursePathIds) {
    try {
      const cpSnap = await getDoc(doc(db, 'course_paths', cpId));
      if (!cpSnap.exists()) continue;
      const cpData = cpSnap.data() || {};
      const moduleIds = Array.isArray(cpData.moduleIds)
        ? cpData.moduleIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      moduleIds.forEach((mid) => {
        const token = mid.toLowerCase();
        const topicToken = topic.toLowerCase();
        const slugToken = normalizedSlug.toLowerCase();
        if (
          (topicToken && token.includes(`__${topicToken}__module`)) ||
          (slugToken && token.includes(`__${slugToken}__module`))
        ) {
          pushModuleId(mid);
        }
      });
    } catch {}
  }

  const moduleSnaps = await Promise.all(
    moduleIdCandidates.map((id) => getDoc(doc(db, 'modules', id)).catch(() => null)),
  );
  const candidates = moduleIdCandidates
    .map((id, idx) => {
      const snap = moduleSnaps[idx];
      if (!snap?.exists?.()) return null;
      return { id, ...(snap.data() || {}) };
    })
    .filter(Boolean);

  const module = pickBestModuleForTopic(candidates, { level: lvl, topicSlug: normalizedSlug });
  if (!module) return { module: null, lessons: [] };

  const lessonIds = Array.isArray(module.lessonIds)
    ? module.lessonIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!lessonIds.length) return { module, lessons: [] };

  const lessonSnaps = await Promise.all(
    lessonIds.map((id) => getDoc(doc(db, 'lessons', id)).catch(() => null)),
  );
  const lessons = lessonIds
    .map((id, idx) => {
      const snap = lessonSnaps[idx];
      if (!snap?.exists?.()) {
        return {
          id,
          title: id,
          level: lvl,
          topicId: topic || null,
          topicSlug: slug || null,
        };
      }
      return { id: snap.id, ...(snap.data() || {}) };
    })
    .filter(Boolean);

  return { module, lessons };
}

async function loadLessonProgressMap(uid, lessonIds = []) {
  const userId = String(uid || '').trim();
  const ids = Array.from(new Set((lessonIds || []).map((x) => String(x || '').trim()).filter(Boolean)));
  const out = {};
  if (!userId || !ids.length) return out;

  const docs = await Promise.all(
    ids.map((id) =>
      getDoc(doc(db, 'user_progress', userId, 'lessons', id))
        .then((snap) => ({ id, snap }))
        .catch(() => ({ id, snap: null })),
    ),
  );
  docs.forEach(({ id, snap }) => {
    if (snap?.exists?.()) out[id] = snap.data() || {};
  });
  return out;
}

function buildTopicLessonPairs(lessons = []) {
  const ordered = Array.isArray(lessons) ? lessons : [];
  const mini = ordered.filter((x) => isMiniTestLesson(x));
  const base = ordered.filter((x) => !isMiniTestLesson(x) && !isLevelExamLesson(x));
  if (!base.length) {
    return ordered.map((x) => ({ lesson: x, miniTest: null }));
  }

  const usedMini = new Set();
  const pairs = [];
  base.forEach((lesson) => {
    let miniCandidate =
      mini.find(
        (m) =>
          !usedMini.has(m.id) &&
          String(m.miniTestAfterLesson || '').trim() === String(lesson.id || '').trim(),
      ) || null;

    if (!miniCandidate) {
      miniCandidate = mini.find((m) => !usedMini.has(m.id)) || null;
    }
    if (miniCandidate) usedMini.add(miniCandidate.id);
    pairs.push({ lesson, miniTest: miniCandidate });
  });
  return pairs;
}

function normalizeTopicRoadmap(rawRoadmap = []) {
  const rows = Array.isArray(rawRoadmap) ? rawRoadmap : [];
  return rows
    .map((item, idx) => {
      const order = Number(item?.order || idx + 1);
      const lessonId = String(item?.lessonId || '').trim();
      const lessonTitle = String(item?.lessonTitle || '').trim() || `Leccion ${idx + 1}`;
      const miniTestId = String(item?.miniTestId || '').trim();
      const miniTestTitle = String(item?.miniTestTitle || '').trim() || (miniTestId ? 'Mini test' : '');
      if (!lessonId) return null;
      return {
        order: Number.isFinite(order) ? order : idx + 1,
        lessonId,
        lessonTitle,
        miniTestId,
        miniTestTitle,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function renderTopicRoadmapCards({
  level,
  topicId,
  topicTitle,
  roadmap = [],
  isAdmin = false,
}) {
  const tocWrap = $('tocWrap');
  const tocList = $('tocList');
  if (!tocWrap || !tocList) return false;
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  const steps = normalizeTopicRoadmap(roadmap);
  if (!steps.length) {
    show(tocWrap, false);
    return false;
  }

  const cards = steps.map((step, idx) => {
    const lessonHref = lessonHrefForRoute(lvl, topic, step.lessonId);
    const hasMini = !!String(step.miniTestId || '').trim();
    const miniHref = hasMini ? miniTestHrefForRoute(lvl, topic, step.miniTestId) : '';
    const statusChip = isAdmin
      ? '<span class="pill pill-blue">Listo</span>'
      : '<span class="pill">Ruta</span>';
    const miniButton = hasMini
      ? `<a class="btn-white-outline" href="${miniHref}">Mini test</a>`
      : '<button class="btn-white-outline" type="button" disabled>Mini test</button>';

    return `
      <div class="card" style="margin:0; padding:12px;">
        <div class="metaRow" style="gap:8px; flex-wrap:wrap;">
          <span class="pill">Leccion ${idx + 1}</span>
          ${statusChip}
        </div>
        <div style="font-weight:800; margin-top:8px;">${escHtml(step.lessonTitle)}</div>
        ${
          hasMini
            ? `<div class="muted" style="margin-top:6px;">Mini test: ${escHtml(step.miniTestTitle || 'Mini test')}</div>`
            : ''
        }
        <div class="metaRow" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
          <a class="btn-white-outline" href="${lessonHref}">Abrir leccion</a>
          ${miniButton}
        </div>
      </div>
    `;
  });

  tocList.innerHTML = `
    <div class="muted" style="margin-bottom:10px;">
      ${escHtml(`Ruta del tema ${topicTitle || ''}`)}
    </div>
    <div style="display:grid; grid-template-columns:1fr; gap:10px;">
      ${cards.join('')}
    </div>
  `;
  show(tocWrap, true);
  return true;
}

function renderLessonPathCards({
  level,
  topicId,
  topicTitle,
  moduleData,
  lessons,
  lessonProgressById,
  isAdmin = false,
}) {
  const tocWrap = $('tocWrap');
  const tocList = $('tocList');
  if (!tocWrap || !tocList) return false;
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  const pairs = buildTopicLessonPairs(lessons);
  if (!pairs.length) {
    show(tocWrap, false);
    return false;
  }

  const cards = pairs.map((pair, idx) => {
    const lesson = pair.lesson || {};
    const mini = pair.miniTest || null;
    const lessonId = String(lesson.id || '').trim();
    const miniId = String(mini?.id || '').trim();
    const lessonProgress = lessonId ? lessonProgressById?.[lessonId] : null;
    const miniProgress = miniId ? lessonProgressById?.[miniId] : null;
    const lessonDone = isLessonCompleted(lessonProgress);
    const miniDone = mini ? isLessonCompleted(miniProgress) : false;
    const tileDone = lessonDone && (!mini || miniDone);
    const statusChip = tileDone ? '<span class="pill pill-blue">Listo</span>' : '<span class="pill">Pendiente</span>';
    const lessonLabel = stripTopicPrefix(lesson.title || lessonId || `Leccion ${idx + 1}`, topicTitle);
    const miniLabel = mini
      ? stripTopicPrefix(mini.title || miniId || `Mini test ${idx + 1}`, topicTitle)
      : 'Mini test';

    const lessonHref = lessonHrefForRoute(lvl, topic, lessonId);
    const miniHref = mini ? miniTestHrefForRoute(lvl, topic, miniId) : '';

    const miniBtn = mini
      ? `<a class="btn-white-outline" href="${miniHref}">Mini test</a>`
      : `<button class="btn-white-outline" type="button" disabled>Mini test</button>`;
    const lessonBtn = `<a class="btn-white-outline" href="${lessonHref}">Abrir leccion</a>`;

    return `
      <div class="card" style="margin:0; padding:12px;">
        <div class="metaRow" style="gap:8px; flex-wrap:wrap;">
          <span class="pill">Leccion ${idx + 1}</span>
          ${statusChip}
        </div>
        <div style="font-weight:800; margin-top:8px;">${escHtml(lessonLabel)}</div>
        <div class="muted" style="margin-top:6px;">Mini test: ${escHtml(miniLabel)}</div>
        <div class="metaRow" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
          ${lessonBtn}
          ${miniBtn}
        </div>
      </div>
    `;
  });

  const moduleTitle = String(moduleData?.title || '').trim();
  tocList.innerHTML = `
    <div class="muted" style="margin-bottom:10px;">
      ${escHtml(moduleTitle || `Ruta del tema ${topicTitle || ''}`)}
    </div>
    <div style="display:grid; grid-template-columns:1fr; gap:10px;">
      ${cards.join('')}
    </div>
  `;
  show(tocWrap, true);
  return true;
}

function prevLevelOf(level) {
  const lvl = String(level || '').toUpperCase();
  if (lvl === 'A2') return 'A1';
  if (lvl === 'B1') return 'A2';
  if (lvl === 'B2') return 'B1';
  return '';
}

async function isPrevLevelCompleted(uid, prevLevel) {
  const lvl = String(prevLevel || '').toUpperCase();
  if (!uid || !lvl) return true;
  try {
    const courseSnap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl)),
    );
    const prevAllCourses = courseSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    const prevCourses = selectCoursesForTrack(prevAllCourses);

    const total = prevCourses.length;
    if (!total) return true;

    const topicIdSet = new Set(prevCourses.map((t) => String(t.id)));
    const topicSlugSet = new Set(
      prevCourses.map((t) => String(t.slug || t.id || '').trim()).filter(Boolean),
    );

    const progSnap = await getDocs(
      query(
        collection(db, 'user_progress', uid, 'topics'),
        where('level', '==', lvl),
      ),
    );
    let completed = 0;
    progSnap.forEach((d) => {
      const data = d.data() || {};
      if (!hasTopicMastery(data)) return;
      const tid = String(data.topicId || '').trim();
      const tslug = String(data.topicSlug || '').trim();
      if (tid && topicIdSet.has(tid)) completed += 1;
      else if (!tid && tslug && topicSlugSet.has(tslug)) completed += 1;
    });
    return completed >= total;
  } catch (e) {
    console.warn('prev level check failed', e);
    return true;
  }
}

function renderLevelGate(prevLevel) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = `
      <div style="font-size:16px; line-height:1.6;">
        <b>Acceso bloqueado</b><br/>
        Para leer este nivel primero completa <b>${prevLevel}</b>.<br/>
        Ve a <a href="${courseHref(prevLevel)}" style="text-decoration:underline;">Programa ${prevLevel}</a>.
      </div>
    `;
  }
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
  const pct = Math.round(best);
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
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

function isTopicCompleted(progress) {
  return hasTopicMastery(progress);
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

function topicProgressKey(level, topic) {
  const lvl = String(level || topicLevelOf(topic)).toUpperCase();
  const slug = String(topic?.slug || topic?.id || '').trim();
  return lvl && slug ? `${lvl}__${slug}` : null;
}

async function loadProgressMapForLevel(uid, level) {
  const lvl = String(level || '').toUpperCase();
  if (!uid || !lvl) return {};
  try {
    const snap = await getDocs(
      query(collection(db, 'user_progress', uid, 'topics'), where('level', '==', lvl)),
    );
    const map = {};
    snap.forEach((d) => {
      map[d.id] = d.data() || {};
    });
    return map;
  } catch (e) {
    console.warn('[lessonpage] loadProgressMapForLevel failed', e);
    return {};
  }
}

async function loadProgressMapForLevels(uid, levels) {
  const lvls = Array.isArray(levels) ? levels : [];
  const map = {};
  for (const lvl of lvls) {
    const partial = await loadProgressMapForLevel(uid, lvl);
    Object.assign(map, partial);
  }
  return map;
}

async function getRouteTopicsForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl), orderBy('order')),
    );
    const all = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    const selected = selectCoursesForTrack(all);
    return buildMixedRoute(selected);
  } catch (e) {
    console.warn('[lessonpage] getRouteTopicsForLevel failed', e);
    return [];
  }
}

async function getRouteTopicsForLevels(levels) {
  const lvls = Array.isArray(levels) ? levels : [];
  const route = [];
  for (const lvl of lvls) {
    const topics = await getRouteTopicsForLevel(lvl);
    route.push(...topics.map((t) => ({ ...t, __routeLevel: lvl })));
  }
  return route;
}

function renderTopicGate(nextTopic) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (!empty) return;

  const nextLevel = topicLevelOf(nextTopic, LEVEL);
  const target = nextTopic?.id
    ? `lessonpage.html?level=${encodeURIComponent(nextLevel)}&id=${encodeURIComponent(nextTopic.id)}${navParams()}`
    : courseHref(nextLevel);
  const label = nextTopic?.title ? `Ir al tema actual: ${String(nextTopic.title)}` : 'Ir al tema actual';

  empty.style.display = 'block';
  empty.innerHTML = `
    <div style="font-size:16px; line-height:1.6;">
      <b>Acceso bloqueado</b><br/>
      Este tema a\u00fan no est\u00e1 desbloqueado.<br/>
      Completa el tema actual para continuar.
      <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
        <a class="btn-yellow" href="${target}" style="text-decoration:none;">${label}</a>
        <a class="btn-white-outline" href="${courseHref(nextLevel)}" style="text-decoration:none;">Ver temas</a>
      </div>
    </div>
  `;
}

function checkpointReviewHref(blockNo, route = []) {
  const block = Math.max(1, Number(blockNo || 1));
  const { end } = checkpointBlockRange(block);
  const anchor = route[Math.min(route.length - 1, end)] || currentTopic || null;
  const anchorLevel = topicLevelOf(anchor, LEVEL);
  return `review.html?level=${encodeURIComponent(anchorLevel)}&mode=minitest&block=${encodeURIComponent(block)}${navParams()}&checkpoint=${encodeURIComponent(block)}`;
}

function renderCheckpointGate(blockNo, route = []) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (!empty) return;
  const block = Math.max(1, Number(blockNo || 1));
  const href = checkpointReviewHref(block, route);
  empty.style.display = 'block';
  empty.innerHTML = `
    <div style="font-size:16px; line-height:1.6;">
      <b>Checkpoint wymagany</b><br/>
      Aby odblokowac kolejny modul, zalicz mini-test po module ${block}.<br/>
      <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
        <a class="btn-yellow" href="${href}" style="text-decoration:none;">Uruchom mini-test</a>
        <a class="btn-white-outline" href="${courseHref(LEVEL)}" style="text-decoration:none;">Wroc do kursu</a>
      </div>
    </div>
  `;
}

async function enforceTopicOrderGate(uid, topic, flags) {
  if (!uid || !topic?.id) return true;
  try {
    const routeLevels = CONTINUOUS_FLOW ? routeLevelsFromFlags(flags) : [LEVEL];
    const route = CONTINUOUS_FLOW
      ? await getRouteTopicsForLevels(routeLevels)
      : await getRouteTopicsForLevel(LEVEL);
    if (!route.length) return true;

    const currentKey = courseBaseKey(topic);
    const currentLevel = topicLevelOf(topic, LEVEL);
    let idx = route.findIndex(
      (t) => String(t.id) === String(topic.id) && topicLevelOf(t, LEVEL) === currentLevel,
    );
    if (idx < 0 && currentKey) {
      idx = route.findIndex(
        (t) => courseBaseKey(t) === currentKey && topicLevelOf(t, LEVEL) === currentLevel,
      );
    }
    if (idx < 0) return true;

    const progressMap = CONTINUOUS_FLOW
      ? await loadProgressMapForLevels(uid, routeLevels)
      : await loadProgressMapForLevel(uid, LEVEL);
    let firstIncomplete = route.findIndex((t) => {
      const key = topicProgressKey(topicLevelOf(t, LEVEL), t);
      const prog = key ? progressMap[key] : null;
      return !isTopicCompleted(prog);
    });
    if (firstIncomplete < 0) firstIncomplete = route.length - 1;

    if (idx > firstIncomplete) {
      renderTopicGate(route[firstIncomplete]);
      return false;
    }

    if (CONTINUOUS_FLOW) {
      const requiredCheckpoints = requiredCheckpointCountForRouteIndex(idx);
      for (let block = 1; block <= requiredCheckpoints; block += 1) {
        const ok = await hasCheckpoint(uid, block, {
          track: TRACK,
          view: COURSE_VIEW,
          flow: 'continuous',
        });
        if (!ok) {
          renderCheckpointGate(block, route);
          return false;
        }
      }
    }

    return true;
  } catch (e) {
    console.warn('[lessonpage] enforceTopicOrderGate failed', e);
    return true;
  }
}

function updateProgressUI(progress) {
  const readFill = $('readProgressFill');
  const readText = $('readProgressText');
  const testText = $('testProgressText');
  const statusText = $('lessonStatusText');

  const practicePercent = Number(progress?.practicePercent || 0);
  const practiceDone = Number(progress?.practiceDone || 0);
  const practiceTotal = Number(progress?.practiceTotal || 0);
  const testScore = Number(progress?.testScore || 0);
  const testTotal = Number(progress?.testTotal || 0);
  const completed = hasTopicMastery(progress);

  if (readFill) readFill.style.width = `${practicePercent}%`;
  if (readText) {
    readText.textContent = practiceTotal
      ? `Ejercicios: ${practiceDone}/${practiceTotal} (${practicePercent}%)`
      : 'Ejercicios: -';
  }
  if (testText) {
    testText.textContent = testTotal ? `Test: ${testScore}%` : 'Test: -';
  }
  if (statusText) {
    statusText.textContent = completed ? 'Estado: completado' : 'Estado: en progreso';
  }
}

async function loadProgress(uid, topic) {
  if (!uid || !topic) return;
  const key = topicKeyFrom(topic);
  if (!key) return;

  try {
    const snap = await getDoc(doc(db, 'user_progress', uid, 'topics', key));
    if (!snap.exists()) {
      updateProgressUI(null);
      return;
    }
    updateProgressUI(snap.data() || {});
  } catch (e) {
    console.warn('loadProgress failed', e);
  }
}

function renderRatingButtons() {
  const card = $('ratingCard');
  if (!card) return;
  card.querySelectorAll('button[data-rating]').forEach((btn) => {
    const val = Number(btn.getAttribute('data-rating') || 0);
    if (val === selectedRating) {
      btn.classList.add('btn-yellow');
      btn.classList.remove('btn-white-outline');
    } else {
      btn.classList.add('btn-white-outline');
      btn.classList.remove('btn-yellow');
    }
  });
}

function setRatingMsg(text, bad = false) {
  const el = $('ratingMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

async function loadMyReview(user, topic) {
  if (!user?.uid || !topic) return;
  const reviewId = `${user.uid}__${topic.id || COURSE_ID}`;
  try {
    const snap = await getDoc(doc(db, 'reviews', reviewId));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    selectedRating = Number(data.rating || 0);
    const text = String(data.text || data.comment || '');
    const input = $('ratingText');
    if (input) input.value = text;
    renderRatingButtons();
  } catch (e) {
    console.warn('loadMyReview failed', e);
  }
}

async function saveReview(user, topic) {
  if (!user?.uid || !topic) return;
  if (!selectedRating) {
    setRatingMsg('Elige una calificacion (1-5).', true);
    return;
  }

  const reviewId = `${user.uid}__${topic.id || COURSE_ID}`;
  const reviewRef = doc(db, 'reviews', reviewId);
  const text = String($('ratingText')?.value || '').trim();

  try {
    const snap = await getDoc(reviewRef);
    const payload = {
      userId: user.uid,
      userEmail: user.email || '',
      targetType: 'topic',
      level: LEVEL,
      topicId: topic.id || COURSE_ID,
      topicSlug: topic.slug || null,
      topicTitle: topic.title || topic.name || '',
      rating: Number(selectedRating),
      text,
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) payload.createdAt = serverTimestamp();
    await setDoc(reviewRef, payload, { merge: true });
    setRatingMsg('Gracias. Tu opinion fue guardada.');
  } catch (e) {
    console.error(e);
    setRatingMsg('No se pudo guardar la opinion.', true);
  }
}

function setupRatingCard(user, topic) {
  const card = $('ratingCard');
  if (!card) return;
  card.style.display = 'block';

  card.querySelectorAll('button[data-rating]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.getAttribute('data-rating') || 0);
      renderRatingButtons();
    });
  });

  $('btnSaveReview')?.addEventListener('click', () => saveReview(user, topic));
  renderRatingButtons();
  loadMyReview(user, topic);
}

async function loadLesson(user) {
  const pillLevel = $('pillLevel');
  const pillTopic = $('pillTopic');
  const pillType = $('pillType');
  const pillDuration = $('pillDuration');
  const pillPub = $('pillPub');
  const pillAdminLink = $('pillAdminLink');
  const readTools = $('readTools');
  const exerciseLinksWrap = $('exerciseLinksWrap');
  const extrasWrap = $('lessonExtras');

  setText('lessonTitle', 'Cargando...');
  setText('lessonDesc', 'Cargando...');
  if (pillLevel) pillLevel.textContent = `Nivel: ${LEVEL}`;
  if (pillTopic) pillTopic.textContent = 'Tema: -';

  if (!COURSE_ID) {
    renderEmpty('Faltan parametros en la URL (id).');
    return;
  }

  const flags = await getUserFlags(user.uid);
  if (!flags.hasAccess) {
    showAccessLocked();
    return;
  }

  if (readTools) readTools.style.display = '';

    if (exerciseLinksWrap) {
      const params = `level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}${navParams()}`;
      exerciseLinksWrap.innerHTML = `
        <a class="btn-white-outline" href="ejercicio.html?${params}">Ejercicios</a>
        <a class="btn-white-outline" href="review.html?${params}">Repasar</a>
        <a class="btn-white-outline" href="review.html?${params}&mode=errors">Bledy</a>
        <a class="btn-white-outline" href="flashcards.html?${params}">Fichas</a>
        <a class="btn-white-outline" href="${courseHref(LEVEL)}">Temas</a>
      `;
    }

  if (pillAdminLink && flags.isAdmin) {
    pillAdminLink.style.display = 'inline-flex';
    pillAdminLink.href = `admin-select.html?target=lesson&level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}`;
  } else if (pillAdminLink) {
    pillAdminLink.style.display = 'none';
  }

  let topic = null;
  try {
    const snap = await getDoc(doc(db, 'courses', COURSE_ID));
    if (snap.exists()) topic = { id: snap.id, ...(snap.data() || {}) };
  } catch (e) {
    console.error(e);
  }
  currentTopic = topic;

  setLessonHeroVisual(topic || {});

  const topicTitle = topic?.title || topic?.name || 'Leccion';
  const topicDesc = topic?.desc || topic?.description || '';
  const topicLevel = topicLevelOf(topic, LEVEL);
  if (pillLevel) pillLevel.textContent = `Nivel: ${topicLevel}`;
  if (pillTopic) pillTopic.textContent = `Tema: ${topicTitle}`;

  if (exerciseLinksWrap) {
    const params = `level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(COURSE_ID)}${navParams()}`;
    exerciseLinksWrap.innerHTML = `
      <a class="btn-white-outline" href="ejercicio.html?${params}">Ejercicios</a>
      <a class="btn-white-outline" href="review.html?${params}">Repasar</a>
      <a class="btn-white-outline" href="review.html?${params}&mode=errors">Bledy</a>
      <a class="btn-white-outline" href="flashcards.html?${params}">Fichas</a>
      <a class="btn-white-outline" href="${courseHref(topicLevel)}">Temas</a>
    `;
  }

  if (!flags.isAdmin && !CONTINUOUS_FLOW) {
    const prevLevel = prevLevelOf(LEVEL);
    const hasMulti =
      flags.hasGlobalAccess ||
      (Array.isArray(flags.levels) && flags.levels.length > 1);
    if (prevLevel && hasMulti) {
      const ok = await isPrevLevelCompleted(user.uid, prevLevel);
      if (!ok) {
        renderLevelGate(prevLevel);
        return;
      }
    }
  }

  if (!flags.isAdmin && topic) {
    const ok = await enforceTopicOrderGate(user.uid, topic, flags);
    if (!ok) return;
  }

  let routeRendered = false;
  try {
    const topicRoadmap = normalizeTopicRoadmap(topic?.lessonRoadmap || []);
    if (topicRoadmap.length) {
      routeRendered = renderTopicRoadmapCards({
        level: topicLevel,
        topicId: String(topic?.id || COURSE_ID).trim(),
        topicTitle,
        roadmap: topicRoadmap,
        isAdmin: flags.isAdmin === true,
      });
    } else {
      const routeData = await loadTopicModuleWithLessons(
        topicLevel,
        String(topic?.id || COURSE_ID).trim(),
        String(topic?.slug || '').trim(),
      );
      const routeLessons = Array.isArray(routeData?.lessons) ? routeData.lessons : [];
      if (routeLessons.length) {
        routeRendered = renderLessonPathCards({
          level: topicLevel,
          topicId: String(topic?.id || COURSE_ID).trim(),
          topicTitle,
          moduleData: routeData?.module || null,
          lessons: routeLessons,
          lessonProgressById: {},
          isAdmin: flags.isAdmin === true,
        });
      } else {
        show($('tocWrap'), false);
      }
    }
  } catch (e) {
    console.warn('[lessonpage] route render failed', e);
    show($('tocWrap'), false);
  }

  let meta = null;
  try {
    const topicLevel = topicLevelOf(topic, LEVEL);
    const metaSnap = await getDoc(doc(db, 'course_meta', metaDocId(topicLevel, COURSE_ID)));
    if (metaSnap.exists()) meta = metaSnap.data() || {};
  } catch (e) {
    console.error(e);
  }

  setText('lessonTitle', String(meta?.titleEs || meta?.title || topicTitle || 'Leccion').trim());
  setText(
    'lessonDesc',
    String(meta?.descriptionEs || meta?.desc || meta?.description || topicDesc || '').trim(),
  );

  function renderExtras(metaData) {
    if (!extrasWrap) return;
    const summary = String(metaData?.summary || '').trim();
    const vocab = Array.isArray(metaData?.vocab) ? metaData.vocab : [];
    const resources = Array.isArray(metaData?.resources) ? metaData.resources : [];
    const homework = String(metaData?.homework || '').trim();

    const blocks = [];

    if (summary) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Resumen</div>
          <div class="muted" style="line-height:1.6;">${summary}</div>
        </div>
      `);
    }

    if (vocab.length) {
      const VOCAB_PREVIEW_MAX = 18;
      const preview = vocab.slice(0, VOCAB_PREVIEW_MAX);
      const rest = vocab.slice(VOCAB_PREVIEW_MAX);
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Vocabulario clave</div>
          <div class="lessonExtraList">
            ${preview.map((v) => `<div class="lessonExtraItem">${v}</div>`).join('')}
          </div>
          ${
            rest.length
              ? `
                <details class="lessonVocabMore" style="margin-top:10px;">
                  <summary class="btn-white-outline" style="list-style:none; cursor:pointer;">
                    Mostrar ${rest.length} más
                  </summary>
                  <div class="lessonExtraList" style="margin-top:10px;">
                    ${rest.map((v) => `<div class="lessonExtraItem">${v}</div>`).join('')}
                  </div>
                </details>
              `
              : ''
          }
        </div>
      `);
    }

    if (resources.length) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Recursos</div>
          <div class="lessonExtraList">
            ${resources
              .map((r) => {
                const label = (r?.label || r?.title || r?.name || 'Recurso').trim();
                const url = (r?.url || '').trim();
                if (!url) return '';
                return `<a class="lessonExtraLink" href="${url}" target="_blank" rel="noopener">${label}</a>`;
              })
              .filter(Boolean)
              .join('')}
          </div>
        </div>
      `);
    }

    if (homework) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Tarea</div>
          <div class="muted" style="line-height:1.6;">${homework}</div>
        </div>
      `);
    }

    if (!blocks.length) {
      extrasWrap.style.display = 'none';
      extrasWrap.innerHTML = '';
      return;
    }

    extrasWrap.style.display = '';
    extrasWrap.innerHTML = blocks.join('');
  }

  if (pillType) {
    if (meta?.type) {
      pillType.style.display = 'inline-flex';
      pillType.textContent = meta.type;
    } else {
      pillType.style.display = 'none';
    }
  }

  const dur = Number(meta?.durationMin || meta?.duration || 0);
  if (pillDuration) {
    if (dur > 0) {
      pillDuration.style.display = 'inline-flex';
      pillDuration.textContent = `${dur} min`;
    } else {
      pillDuration.style.display = 'none';
    }
  }

  const published = meta?.published === true;
  if (pillPub) {
    pillPub.style.display = 'inline-flex';
    pillPub.textContent = published ? 'Publicado' : 'Borrador';
  }

  if (!flags.hasAccess) {
    renderLocked();
    return;
  }

  if (!published && !flags.isAdmin) {
    renderEmpty('Esta leccion aun no esta publicada.');
    const hint = $('studentHint');
    if (hint) {
      hint.style.display = 'block';
      hint.textContent = 'Vuelve mas tarde.';
    }
    return;
  }

  renderExtras(meta || {});

  const html = String(meta?.html || '').trim();
  if (!html) {
    if (!routeRendered) {
      renderEmpty('Todavia no hay contenido de leccion para este tema.');
      return;
    }
    const empty = $('lessonEmpty');
    if (empty) {
      empty.style.display = 'none';
      empty.innerHTML = '';
    }
    const contentEl = $('lessonContent');
    if (contentEl) {
      contentEl.style.display = 'none';
      contentEl.innerHTML = '';
    }
  } else {
    const contentEl = $('lessonContent');
    if (contentEl) {
      contentEl.innerHTML = html;
      contentEl.style.display = 'block';
      decorateLessonTts(contentEl);
    }
  }

  if (topic) setupRatingCard(user, topic);

  await trackTopicOpen(user.uid, COURSE_ID, topicLevelOf(topic, LEVEL));
  await loadProgress(user.uid, topic || { id: COURSE_ID, slug: COURSE_ID });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    loadLesson(user);
  });
});

function wireTocHighlight() {
  const wrap = document.getElementById('tocList');
  const content = document.getElementById('lessonContent');
  if (!wrap || !content) return;

  const links = Array.from(wrap.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;

  const map = new Map();
  for (const a of links) {
    const id = (a.getAttribute('href') || '').slice(1);
    const el = id ? document.getElementById(id) : null;
    if (el) map.set(el, a);
  }
  if (!map.size) return;

  const setActive = (a) => {
    for (const x of links) x.classList.remove('tocActive');
    if (a) a.classList.add('tocActive');
  };

  const obs = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const top = visible[0].target;
      const a = map.get(top);
      if (a) setActive(a);
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: [0.1, 0.2, 0.4, 0.6] },
  );

  for (const el of map.keys()) obs.observe(el);
}
window.addEventListener('DOMContentLoaded', () =>
  setTimeout(wireTocHighlight, 800),
);
