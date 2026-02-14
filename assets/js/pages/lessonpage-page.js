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

  const rawType = String(topic?.type || topic?.category || '').toLowerCase();
  if (rawType.includes('vocab')) return '\uD83D\uDD24'; // Ã°Å¸â€Â¤
  if (rawType.includes('both') || rawType.includes('+')) return '\uD83E\uDDE9'; // Ã°Å¸Â§Â©
  return '\uD83D\uDCD8'; // Ã°Å¸â€œËœ
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

function completionTimeMsFromProgress(progressDoc) {
  if (!progressDoc || typeof progressDoc !== 'object') return 0;
  const keys = ['completedAt', 'updatedAt', 'lastCompletedAt', 'doneAt'];
  let best = 0;
  keys.forEach((key) => {
    const ms = parseDocTimeMs(progressDoc[key]);
    if (ms > best) best = ms;
  });
  return best;
}

function completionTimeMsForStep(step, lessonProgressById = {}) {
  const id = String(step?.id || '').trim();
  if (id) return completionTimeMsFromProgress(lessonProgressById?.[id]);
  const deps = Array.isArray(step?.unlockFromIds) ? step.unlockFromIds : [];
  let best = 0;
  deps.forEach((depIdRaw) => {
    const depId = String(depIdRaw || '').trim();
    if (!depId) return;
    const ms = completionTimeMsFromProgress(lessonProgressById?.[depId]);
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
  const rows = (Array.isArray(lines) ? lines : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map((line) => `<div style="line-height:1.2; white-space:nowrap;">${escHtml(line)}</div>`)
    .join('');
  if (!rows) return '';
  return `
    <div style="display:flex; justify-content:center; width:100%;">
      <div style="width:min(100%, 400px); transform:rotate(-3deg); border:3px double rgba(255,112,150,0.92); border-radius:4px; padding:10px 12px; text-align:center; text-transform:uppercase; font-weight:900; letter-spacing:1.1px; color:rgba(255,112,150,0.95); background:rgba(255,112,150,0.05); box-shadow:0 0 0 1px rgba(255,112,150,0.45) inset;">
        ${rows}
      </div>
    </div>
  `;
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
  let href = `lesson.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}`;
  if (lessonId) href += `&lessonId=${encodeURIComponent(String(lessonId))}`;
  href += navParams();
  return href;
}

function versionsHrefForRoute(level, topicId, lessonId) {
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  let href = `versions.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}`;
  if (lessonId) href += `&lessonId=${encodeURIComponent(String(lessonId))}`;
  href += navParams();
  return href;
}

function miniTestHrefForRoute(level, topicId, miniLessonId, blockNo = 0) {
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  let href = `minitest.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}`;
  if (miniLessonId) href += `&lessonId=${encodeURIComponent(String(miniLessonId))}`;
  const block = Number(blockNo || 0);
  if (!miniLessonId && Number.isFinite(block) && block > 0) {
    href += `&block=${encodeURIComponent(String(block))}&checkpoint=${encodeURIComponent(String(block))}`;
  }
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

function flashcardsHrefForRoute(level, topicId, lessonId = '') {
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  let href = `flashcards.html?level=${encodeURIComponent(lvl)}&id=${encodeURIComponent(topic)}`;
  const id = String(lessonId || '').trim();
  if (id) href += `&lessonId=${encodeURIComponent(id)}`;
  href += navParams();
  return href;
}

function ensureLessonRouteStyles() {
  if (document.getElementById('lessonRouteStyles')) return;
  const style = document.createElement('style');
  style.id = 'lessonRouteStyles';
  style.textContent = `
    body[data-page='lessonpage'] #tocWrap { margin-top: 0 !important; }
    body[data-page='lessonpage'] #tocWrap .sectionTitle { display: none !important; }
    body[data-page='lessonpage'] #tocList {
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body[data-page='lessonpage'] .lessonRoutePath {
      display: grid;
      gap: 14px;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathStep {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 14px;
      align-items: stretch;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathRail {
      width: 72px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathConnector {
      flex: 1;
      width: 3px;
      border-radius: 999px;
      margin-top: 10px;
      background: rgba(255, 255, 255, 0.12);
      min-height: 16px;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathStep.is-last .pathConnector {
      display: none;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathNode {
      width: 54px;
      height: 54px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(188, 211, 255, 0.24);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      color: inherit;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathNode[data-accent='yellow'] {
      border-color: rgba(252, 209, 22, 0.38);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathNode[data-accent='blue'] {
      border-color: rgba(188, 211, 255, 0.32);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathNode[data-accent='red'] {
      border-color: rgba(206, 17, 38, 0.3);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathNodeInner {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 16px;
      background: rgba(7, 18, 44, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathStep.is-current .pathNode {
      box-shadow: 0 0 0 6px rgba(252, 209, 22, 0.14), 0 18px 52px rgba(0, 0, 0, 0.32);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathStep.is-current .pathNodeInner {
      background: rgba(252, 209, 22, 0.22);
      border-color: rgba(252, 209, 22, 0.35);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCard {
      display: block;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: inherit;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCard[data-accent='yellow'] {
      border-left: 6px solid rgba(252, 209, 22, 0.35);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCard[data-accent='blue'] {
      border-left: 6px solid rgba(188, 211, 255, 0.28);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCard[data-accent='red'] {
      border-left: 6px solid rgba(206, 17, 38, 0.22);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathStep.is-current .pathCard {
      border-color: rgba(252, 209, 22, 0.34);
      background: rgba(252, 209, 22, 0.06);
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCardTop {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCardText {
      flex: 1;
      min-width: 0;
    }
    body[data-page='lessonpage'] .lessonRoutePath .topicThumb {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(7, 18, 44, 0.45);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
      flex: 0 0 auto;
    }
    body[data-page='lessonpage'] .lessonRoutePath .topicThumb[data-accent='yellow'] {
      border-color: rgba(252, 209, 22, 0.35);
    }
    body[data-page='lessonpage'] .lessonRoutePath .topicThumb[data-accent='blue'] {
      border-color: rgba(188, 211, 255, 0.28);
    }
    body[data-page='lessonpage'] .lessonRoutePath .topicThumb[data-accent='red'] {
      border-color: rgba(206, 17, 38, 0.22);
    }
    body[data-page='lessonpage'] .lessonRoutePath .topicThumbEmoji {
      font-size: 22px;
      line-height: 1;
    }
    body[data-page='lessonpage'] .lessonRoutePath .lessonPathHead {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCardTitle {
      font-weight: 900;
      font-size: 15px;
      letter-spacing: 0.1px;
      min-width: 0;
    }
    body[data-page='lessonpage'] .lessonRoutePath .pathCardDesc {
      margin-top: 5px;
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.82;
    }
    body[data-page='lessonpage'] .lessonRoutePath .lessonStepActions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    body[data-page='lessonpage'] .lessonRoutePath .lessonStepActionBtn {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    body[data-page='lessonpage'] .lessonRoutePath .lessonStepActionBtn:hover,
    body[data-page='lessonpage'] .lessonRoutePath .lessonStepActionBtn:focus {
      background: rgba(255, 255, 255, 0.18);
      border-color: rgba(252, 209, 22, 0.4);
    }
    body[data-page='lessonpage'] .lessonRoutePath .lessonStepActionBtn[disabled] {
      opacity: 0.55;
      cursor: not-allowed;
    }
    @media (max-width: 760px) {
      body[data-page='lessonpage'] .lessonRoutePath .pathStep {
        grid-template-columns: 58px 1fr;
        gap: 10px;
      }
      body[data-page='lessonpage'] .lessonRoutePath .pathRail {
        width: 58px;
      }
      body[data-page='lessonpage'] .lessonRoutePath .pathNode {
        width: 48px;
        height: 48px;
      }
      body[data-page='lessonpage'] .lessonRoutePath .pathNodeInner {
        width: 38px;
        height: 38px;
        font-size: 14px;
      }
      body[data-page='lessonpage'] .lessonRoutePath .lessonStepActionBtn {
        width: 30px;
        height: 30px;
        font-size: 14px;
      }
    }
  `;
  document.head.appendChild(style);
}

function hideLessonHeroAndLegacyPanels() {
  document.querySelector('.heroBanner')?.setAttribute('style', 'display:none !important;');
  const readTools = $('readTools');
  if (readTools) readTools.style.display = 'none';
  const content = $('lessonContent');
  if (content) {
    content.style.display = 'none';
    content.innerHTML = '';
  }
  const extras = $('lessonExtras');
  if (extras) {
    extras.style.display = 'none';
    extras.innerHTML = '';
  }
  const rating = $('ratingCard');
  if (rating) rating.style.display = 'none';
  const sticky = $('lessonSticky');
  if (sticky) sticky.style.display = 'none';
  const hint = $('studentHint');
  if (hint) hint.style.display = 'none';
}

const STAMP_CATALOG_BY_LEVEL = {
  A1: {
    region: 'Wielkopolskie',
    cities: [
      { city: 'Poznań', landmark: 'Stary Rynek' },
      { city: 'Poznań', landmark: 'Ostrów Tumski' },
      { city: 'Poznań', landmark: 'Zamek Cesarski' },
      { city: 'Poznań', landmark: 'Brama Poznania' },
      { city: 'Poznań', landmark: 'Cytadela' },
      { city: 'Kórnik', landmark: 'Zamek' },
      { city: 'Rogalin', landmark: 'Pałac' },
      { city: 'Gniezno', landmark: 'Katedra' },
      { city: 'Gołuchów', landmark: 'Zamek' },
      { city: 'Kalisz', landmark: 'Ratusz' },
      { city: 'Leszno', landmark: 'Rynek' },
      { city: 'Konin', landmark: 'Słup Koniński' },
      { city: 'Piła', landmark: 'Rynek' },
      { city: 'Szamotuły', landmark: 'Zamek Górków' },
      { city: 'Września', landmark: 'Pomnik Dzieci Wrzesińskich' },
      { city: 'Puszczykowo', landmark: 'Muzeum Fiedlera' },
      { city: 'Ląd', landmark: 'Opactwo Cystersów' },
      { city: 'Wolsztyn', landmark: 'Parowozownia' },
    ],
  },
  A2: {
    region: 'Dolnośląskie',
    cities: [
      { city: 'Wrocław', landmark: 'Rynek' },
      { city: 'Wrocław', landmark: 'Hala Stulecia' },
      { city: 'Wrocław', landmark: 'Ostrów Tumski' },
      { city: 'Wrocław', landmark: 'Panorama Racławicka' },
      { city: 'Wrocław', landmark: 'Ogród Japoński' },
      { city: 'Świdnica', landmark: 'Kościół Pokoju' },
      { city: 'Wałbrzych', landmark: 'Zamek Książ' },
      { city: 'Kłodzko', landmark: 'Twierdza' },
      { city: 'Leśna', landmark: 'Zamek Czocha' },
      { city: 'Jelenia Góra', landmark: 'Rynek' },
      { city: 'Legnica', landmark: 'Zamek Piastowski' },
      { city: 'Karpacz', landmark: 'Świątynia Wang' },
      { city: 'Lubiąż', landmark: 'Opactwo Cystersów' },
      { city: 'Jawor', landmark: 'Kościół Pokoju' },
      { city: 'Bolesławiec', landmark: 'Rynek' },
      { city: 'Lądek-Zdrój', landmark: 'Rynek' },
      { city: 'Złotoryja', landmark: 'Rynek' },
      { city: 'Szczawno-Zdrój', landmark: 'Pijalnia Wód' },
    ],
  },
  B1: {
    region: 'Małopolskie',
    cities: [
      { city: 'Kraków', landmark: 'Wawel' },
      { city: 'Kraków', landmark: 'Rynek Główny' },
      { city: 'Kraków', landmark: 'Sukiennice' },
      { city: 'Kraków', landmark: 'Kościół Mariacki' },
      { city: 'Kraków', landmark: 'Kazimierz' },
      { city: 'Wieliczka', landmark: 'Kopalnia Soli' },
      { city: 'Zakopane', landmark: 'Giewont' },
      { city: 'Zakopane', landmark: 'Krupówki' },
      { city: 'Tatry', landmark: 'Morskie Oko' },
      { city: 'Niedzica', landmark: 'Zamek' },
      { city: 'Nowy Sącz', landmark: 'Rynek' },
      { city: 'Tarnów', landmark: 'Rynek' },
      { city: 'Bochnia', landmark: 'Kopalnia Soli' },
      { city: 'Ojców', landmark: 'Zamek' },
      { city: 'Kalwaria Zebrzydowska', landmark: 'Sanktuarium' },
      { city: 'Lanckorona', landmark: 'Rynek' },
      { city: 'Krynica-Zdrój', landmark: 'Deptak' },
      { city: 'Oświęcim', landmark: 'Miejsce Pamięci' },
    ],
  },
  B2: {
    region: 'Mazowieckie',
    cities: [
      { city: 'Warszawa', landmark: 'Stare Miasto' },
      { city: 'Warszawa', landmark: 'Zamek Królewski' },
      { city: 'Warszawa', landmark: 'Pałac Kultury' },
      { city: 'Warszawa', landmark: 'Muzeum POLIN' },
      { city: 'Wilanów', landmark: 'Pałac' },
      { city: 'Żelazowa Wola', landmark: 'Dom Chopina' },
      { city: 'Warszawa', landmark: 'Łazienki Królewskie' },
      { city: 'Warszawa', landmark: 'Centrum Nauki Kopernik' },
      { city: 'Warszawa', landmark: 'Muzeum Powstania Warszawskiego' },
      { city: 'Płock', landmark: 'Wzgórze Tumskie' },
      { city: 'Czersk', landmark: 'Zamek' },
      { city: 'Radom', landmark: 'Rynek' },
      { city: 'Sierpc', landmark: 'Skansen' },
      { city: 'Modlin', landmark: 'Twierdza' },
      { city: 'Pułtusk', landmark: 'Rynek' },
      { city: 'Opinogóra', landmark: 'Muzeum Romantyzmu' },
      { city: 'Sochaczew', landmark: 'Muzeum Kolei Wąskotorowej' },
      { city: 'Żyrardów', landmark: 'Osada Fabryczna' },
    ],
  },
};
function stampCatalogForLevel(level = LEVEL) {
  const lvl = String(level || LEVEL).toUpperCase();
  return STAMP_CATALOG_BY_LEVEL[lvl] || STAMP_CATALOG_BY_LEVEL.A1;
}

function stampForIndex(level = LEVEL, index = 0) {
  const catalog = stampCatalogForLevel(level);
  const cities = Array.isArray(catalog?.cities) ? catalog.cities : [];
  if (!cities.length) {
    return {
      region: String(catalog?.region || 'Polska'),
      city: `Ciudad ${Number(index || 0) + 1}`,
      landmark: 'Sello',
    };
  }
  const safeIndex = Math.max(0, Number(index || 0));
  const row = cities[safeIndex % cities.length] || cities[0];
  return {
    region: String(catalog?.region || 'Polska'),
    city: String(row?.city || `Ciudad ${safeIndex + 1}`),
    landmark: String(row?.landmark || 'Sello'),
  };
}

function topicStampSeed(topicOrderRaw, topicId = '', topicSlug = '') {
  const topicOrder = Number(topicOrderRaw);
  if (Number.isFinite(topicOrder) && topicOrder > 0) {
    return Math.max(0, Math.floor(topicOrder) - 1);
  }
  const key = String(topicSlug || topicId || '')
    .trim()
    .toLowerCase();
  if (!key) return 0;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return Number(hash % 1000);
}

function gcd(a, b) {
  let x = Math.abs(Number(a || 0));
  let y = Math.abs(Number(b || 0));
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function stampStrideForCount(count) {
  const n = Math.max(0, Number(count || 0));
  if (n <= 2) return 1;
  const preferred = [7, 5, 11, 13, 17, 19, 23, 29, 31];
  for (const step of preferred) {
    if (step < n && gcd(step, n) === 1) return step;
  }
  for (let step = n - 1; step >= 2; step -= 1) {
    if (gcd(step, n) === 1) return step;
  }
  return 1;
}

function buildRouteStepsFromRoadmap(
  roadmap = [],
  {
    level = LEVEL,
    topicTitle = '',
    includeTopicReward = false,
    includeLevelReward = false,
    stampSeed = 0,
  } = {},
) {
  const rows = normalizeTopicRoadmap(roadmap);
  const out = [];
  const unlockAllIds = [];
  const catalog = stampCatalogForLevel(level);
  const cities = Array.isArray(catalog?.cities) ? catalog.cities : [];
  const count = cities.length;
  const stride = stampStrideForCount(count);
  const seed = Math.max(0, Math.floor(Number(stampSeed || 0)));
  const baseStampOffset = count > 0 ? (seed * stride) % count : 0;

  rows.forEach((row, idx) => {
    const seq = idx + 1;
    const lessonId = String(row.lessonId || '').trim();
    const testId = String(row.miniTestId || '').trim();

    if (lessonId) {
      out.push({
        kind: 'lesson',
        seq,
        id: lessonId,
        title: String(row.lessonTitle || '').trim() || `Leccion ${seq}`,
      });
      unlockAllIds.push(lessonId);
    }

    out.push({
      kind: 'test',
      seq,
      id: testId,
      title: String(row.miniTestTitle || '').trim() || `Mini test ${seq}`,
    });
    if (testId) unlockAllIds.push(testId);

    const stamp = stampForIndex(level, baseStampOffset + idx);
    out.push({
      kind: 'reward_mini',
      seq,
      id: '',
      unlockFromIds: testId ? [testId] : [],
      title: `Sello desbloqueado: ${stamp.city}`,
      subtitle: `Mini test ${seq} - ${stamp.landmark}`,
      region: stamp.region,
      city: stamp.city,
      landmark: stamp.landmark,
    });
  });

  if (includeTopicReward) {
    const topicStamp = stampForIndex(level, baseStampOffset + rows.length);
    out.push({
      kind: 'reward_topic',
      seq: rows.length + 1,
      id: '',
      unlockFromIds: unlockAllIds.slice(),
      title: `Sello del tema: ${String(topicTitle || 'Tema').trim() || 'Tema'}`,
      subtitle: `${topicStamp.city} - ${topicStamp.landmark}`,
      region: topicStamp.region,
      city: topicStamp.city,
      landmark: topicStamp.landmark,
    });
  }

  if (includeLevelReward) {
    const region = stampCatalogForLevel(level)?.region || 'Polska';
    out.push({
      kind: 'reward_level',
      seq: rows.length + 1,
      id: '',
      unlockFromIds: unlockAllIds.slice(),
      title: `Sello del voivodato: ${region}`,
      subtitle: 'Nivel completado',
      region,
    });
  }

  return out;
}

function isRewardStep(step) {
  return String(step?.kind || '').startsWith('reward_');
}

function isActionStep(step) {
  const kind = String(step?.kind || '');
  return kind === 'lesson' || kind === 'test';
}

function isStepCompleted(step, lessonProgressById = {}, isAdmin = false) {
  if (isAdmin) return true;
  const id = String(step?.id || '').trim();
  if (id) return isLessonCompleted(lessonProgressById?.[id]);

  if (isRewardStep(step)) {
    const deps = Array.isArray(step?.unlockFromIds) ? step.unlockFromIds : [];
    if (!deps.length) return false;
    return deps.every((depId) => isLessonCompleted(lessonProgressById?.[String(depId || '').trim()]));
  }

  return false;
}

function renderLessonPathAction(href, icon, label, disabled = false) {
  const text = escHtml(String(icon || '').trim() || '*');
  const title = escHtml(String(label || '').trim() || 'Accion');
  if (disabled || !href) {
    return `<button class="lessonStepActionBtn" type="button" disabled title="${title}" aria-label="${title}">${text}</button>`;
  }
  return `<a class="lessonStepActionBtn" href="${href}" title="${title}" aria-label="${title}">${text}</a>`;
}

function buildTopicRoadmapFromTopicDoc(topic = {}) {
  const direct = normalizeTopicRoadmap(topic?.lessonRoadmap || []);
  if (direct.length) return direct;

  const lessonIdsRaw = Array.isArray(topic?.lessonIds) ? topic.lessonIds : [];
  const miniIdsRaw = Array.isArray(topic?.miniTestIds) ? topic.miniTestIds : [];

  const lessonIds = lessonIdsRaw
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .filter((id) => !id.toUpperCase().includes('MINITEST'));
  const miniIds = miniIdsRaw.map((x) => String(x || '').trim()).filter(Boolean);

  if (!lessonIds.length) return [];

  return lessonIds.map((lessonId, idx) => {
    const miniByIdx = miniIds[idx] || '';
    const miniByPattern =
      miniIds.find((x) => x.includes(`${lessonId}__MINITEST`) || x.includes(`${lessonId.split('__').slice(-1)[0]}__MINITEST`)) ||
      '';
    const miniTestId = miniByIdx || miniByPattern || '';
    return {
      order: idx + 1,
      lessonId,
      lessonTitle: `Leccion ${idx + 1}`,
      miniTestId,
      miniTestTitle: miniTestId ? `Mini test ${idx + 1}` : '',
    };
  });
}

function renderTopicRoadmapCards({
  level,
  topicId,
  topicTitle,
  roadmap = [],
  isAdmin = false,
  lessonProgressById = {},
  stampSeed = 0,
}) {
  ensureLessonRouteStyles();
  hideLessonHeroAndLegacyPanels();
  const tocWrap = $('tocWrap');
  const tocList = $('tocList');
  if (!tocWrap || !tocList) return false;
  const lvl = String(level || LEVEL).toUpperCase();
  const topic = String(topicId || COURSE_ID).trim();
  const steps = buildRouteStepsFromRoadmap(roadmap, {
    level: lvl,
    topicTitle,
    includeTopicReward: false,
    includeLevelReward: false,
    stampSeed,
  });
  if (!steps.length) {
    show(tocWrap, false);
    return false;
  }

  const completed = steps.map((step) => isStepCompleted(step, lessonProgressById, isAdmin));
  const visibleEntries = steps
    .map((step, idx) => ({ step, done: completed[idx] }))
    .filter((entry) => !isRewardStep(entry.step) || entry.done);

  let currentIdx = visibleEntries.findIndex(
    (entry) => isActionStep(entry.step) && !entry.done,
  );
  if (currentIdx < 0) currentIdx = visibleEntries.findIndex((entry) => !entry.done);
  if (currentIdx < 0) currentIdx = visibleEntries.length - 1;

  const cards = visibleEntries.map((entry, idx) => {
    const step = entry.step;
    const kind = String(step?.kind || '');
    const isTest = kind === 'test';
    const isLesson = kind === 'lesson';
    const isReward = isRewardStep(step);

    const accent = isLesson ? 'blue' : isTest ? 'yellow' : 'red';
    const icon = isLesson
      ? '\uD83D\uDCD8'
      : isTest
        ? '\uD83E\uDDEA'
        : kind === 'reward_level'
          ? '\uD83C\uDFDB\uFE0F'
          : '\uD83D\uDEC2';

    const hrefPrimary = isLesson
      ? lessonHrefForRoute(lvl, topic, step.id)
      : isTest
        ? miniTestHrefForRoute(lvl, topic, step.id, step.seq)
        : '';
    const hrefCards = isLesson ? flashcardsHrefForRoute(lvl, topic, step.id || '') : '';
    const hrefExercise = isLesson ? versionsHrefForRoute(lvl, topic, step.id) : '';

    const done = entry.done;
    const stepClass = [
      'pathStep',
      idx === currentIdx ? 'is-current' : '',
      done ? 'is-done' : '',
      idx === visibleEntries.length - 1 ? 'is-last' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const nodeInner = done ? '&#x2713;' : isTest ? '\uD83E\uDDEA' : isReward ? '\uD83D\uDEC2' : String(step.seq);

    const actions = isLesson
      ? [
          renderLessonPathAction(hrefPrimary, '\uD83D\uDCD6', 'Leccion', !hrefPrimary),
          renderLessonPathAction(hrefCards, '\uD83D\uDD16', 'Fichas', !hrefCards),
          renderLessonPathAction(hrefExercise, '\u270D\uFE0F', 'Ejercicios', !hrefExercise),
        ].join('')
      : '';

    let cardHtml = '';
    if (isReward) {
      const stampDate = formatStampDate(completionTimeMsForStep(step, lessonProgressById));
      const city = String(step?.city || '').trim();
      const landmark = String(step?.landmark || '').trim();
      const region = String(step?.region || '').trim();
      const placeLine = [city, landmark].filter(Boolean).join(' - ');
      const mainLine = placeLine || region || String(step?.title || 'Sello').trim();
      const extraLine = placeLine && region ? region : '';
      cardHtml = renderPassportStamp(['AquiVivo', mainLine, extraLine, stampDate]);
    } else {
      const subtitle = String(step?.subtitle || '').trim();
      const head = `
        <div class="lessonPathHead">
          <div class="pathCardTitle">${escHtml(step.title)}</div>
          ${actions ? `<div class="lessonStepActions">${actions}</div>` : ''}
        </div>
        ${subtitle ? `<div class="pathCardDesc">${escHtml(subtitle)}</div>` : ''}
      `;

      const cardInner = `
        <div class="pathCardTop">
          <div class="topicThumb topicThumb--emoji" data-accent="${accent}" aria-hidden="true">
            <span class="topicThumbEmoji">${icon}</span>
          </div>
          <div class="pathCardText">${head}</div>
        </div>
      `;
      cardHtml = isTest && hrefPrimary
        ? `<a class="pathCard" data-accent="${accent}" href="${hrefPrimary}" aria-label="${escHtml(step.title)}">${cardInner}</a>`
        : `<div class="pathCard" data-accent="${accent}">${cardInner}</div>`;
    }

    return `
      <div class="${stepClass}">
        <div class="pathRail">
          <div class="pathNode" data-accent="${accent}" aria-hidden="true">
            <div class="pathNodeInner">${nodeInner}</div>
          </div>
          <div class="pathConnector" aria-hidden="true"></div>
        </div>
        ${cardHtml}
      </div>
    `;
  });

  tocList.innerHTML = `<div class="lessonRoutePath">${cards.join('')}</div>`;
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
  stampSeed = 0,
  isAdmin = false,
}) {
  const pairs = buildTopicLessonPairs(lessons);
  const roadmap = pairs.map((pair, idx) => {
    const lesson = pair.lesson || {};
    const mini = pair.miniTest || null;
    const lessonId = String(lesson.id || '').trim();
    const miniId = String(mini?.id || '').trim();
    return {
      order: idx + 1,
      lessonId,
      lessonTitle: stripTopicPrefix(lesson.title || lessonId || `Leccion ${idx + 1}`, topicTitle),
      miniTestId: miniId,
      miniTestTitle: stripTopicPrefix(mini?.title || miniId || `Mini test ${idx + 1}`, topicTitle),
    };
  });
  return renderTopicRoadmapCards({
    level,
    topicId,
    topicTitle,
    roadmap,
    isAdmin,
    lessonProgressById: lessonProgressById || {},
    stampSeed,
  });
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
  return `minitest.html?level=${encodeURIComponent(anchorLevel)}&block=${encodeURIComponent(block)}${navParams()}&checkpoint=${encodeURIComponent(block)}`;
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
  ensureLessonRouteStyles();
  hideLessonHeroAndLegacyPanels();

  if (readTools) readTools.style.display = '';

    if (exerciseLinksWrap) {
      const params = `level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}${navParams()}`;
      exerciseLinksWrap.innerHTML = `
        <a class="btn-white-outline" href="versions.html?${params}">Ejercicios</a>
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
  const currentTopicStampSeed = topicStampSeed(
    topic?.order,
    String(topic?.id || COURSE_ID).trim(),
    String(topic?.slug || '').trim(),
  );
  if (pillLevel) pillLevel.textContent = `Nivel: ${topicLevel}`;
  if (pillTopic) pillTopic.textContent = `Tema: ${topicTitle}`;

  if (exerciseLinksWrap) {
    const params = `level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(COURSE_ID)}${navParams()}`;
    exerciseLinksWrap.innerHTML = `
      <a class="btn-white-outline" href="versions.html?${params}">Ejercicios</a>
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
    const topicRoadmap = buildTopicRoadmapFromTopicDoc(topic || {});
    if (topicRoadmap.length) {
      const roadmapLessonIds = topicRoadmap
        .flatMap((row) => [row.lessonId, row.miniTestId])
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const lessonProgressById = flags.isAdmin
        ? {}
        : await loadLessonProgressMap(user.uid, roadmapLessonIds);
      routeRendered = renderTopicRoadmapCards({
        level: topicLevel,
        topicId: String(topic?.id || COURSE_ID).trim(),
        topicTitle,
        roadmap: topicRoadmap,
        isAdmin: flags.isAdmin === true,
        lessonProgressById,
        stampSeed: currentTopicStampSeed,
      });
    } else {
      const routeData = await loadTopicModuleWithLessons(
        topicLevel,
        String(topic?.id || COURSE_ID).trim(),
        String(topic?.slug || '').trim(),
      );
      const routeLessons = Array.isArray(routeData?.lessons) ? routeData.lessons : [];
      if (routeLessons.length) {
        const lessonIds = routeLessons
          .map((row) => String(row?.id || '').trim())
          .filter(Boolean);
        const lessonProgressById = flags.isAdmin
          ? {}
          : await loadLessonProgressMap(user.uid, lessonIds);
        routeRendered = renderLessonPathCards({
          level: topicLevel,
          topicId: String(topic?.id || COURSE_ID).trim(),
          topicTitle,
          moduleData: routeData?.module || null,
          lessons: routeLessons,
          lessonProgressById,
          stampSeed: currentTopicStampSeed,
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

  await trackTopicOpen(user.uid, COURSE_ID, topicLevelOf(topic, LEVEL));
  await loadProgress(user.uid, topic || { id: COURSE_ID, slug: COURSE_ID });

  if (routeRendered) {
    const empty = $('lessonEmpty');
    if (empty) {
      empty.style.display = 'none';
      empty.innerHTML = '';
    }
    return;
  }
  renderEmpty('Todavia no hay lecciones en este tema.');
  return;

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
