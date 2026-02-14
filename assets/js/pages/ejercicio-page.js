document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('uiMotion');
});

import { auth, db, storage } from '../firebase-init.js';
import { KNOWN_LEVELS, levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  applyLearningReward,
  checkpointBlockRange,
  hasCheckpoint,
  requiredCheckpointCountForRouteIndex,
} from '../progress-tools.js';

const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const TOPIC_ID = String(params.get('id') || '').trim();
const SLUG = String(params.get('slug') || '').trim();
const TRACK = String(params.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(params.get('view') || '').trim().toLowerCase();
const FLOW = String(params.get('flow') || '').trim().toLowerCase();
const CONTINUOUS_FLOW = FLOW === 'continuous' || COURSE_VIEW === 'pro';
const PAGE_MODE = String(params.get('mode') || '').trim().toLowerCase();
// Default flow: one exercise per screen (Busuu-like).
// Fallback to classic list only when explicitly requested with mode=classic.
const IMMERSIVE_MODE = PAGE_MODE !== 'classic';

const PRACTICE_COMPLETE_PCT = CONTINUOUS_FLOW ? 100 : 80;
const TEST_PASS_PCT = CONTINUOUS_FLOW ? 100 : 80;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

function navParams() {
  const parts = [];
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (COURSE_VIEW) parts.push(`view=${encodeURIComponent(COURSE_VIEW)}`);
  if (CONTINUOUS_FLOW) parts.push('flow=continuous');
  return parts.length ? `&${parts.join('&')}` : '';
}

function coursePageName() {
  if (COURSE_VIEW === 'latam') return 'curso-latam.html';
  if (COURSE_VIEW === 'pro') return 'kurs-pl.html';
  return 'course.html';
}

function courseHref(level = LEVEL) {
  const page = coursePageName();
  const lvl = String(level || LEVEL).toUpperCase();
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
  if (CONTINUOUS_FLOW) href += '&flow=continuous';
  return href;
}

function topicLevelOf(topic, fallback = LEVEL) {
  return String(topic?.level || topic?.__routeLevel || fallback || LEVEL).toUpperCase();
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

function prevLevelOf(level) {
  const lvl = String(level || '').toUpperCase();
  if (lvl === 'A2') return 'A1';
  if (lvl === 'B1') return 'A2';
  if (lvl === 'B2') return 'B1';
  return '';
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
    console.warn('[ejercicio] loadProgressMapForLevel failed', e);
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
    console.warn('[ejercicio] getRouteTopicsForLevel failed', e);
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

function showSequenceLocked(prevLevel) {
  showClassicListSection();
  if (exerciseList) exerciseList.innerHTML = '';
  if (!emptyExercises) return;

  const prev = String(prevLevel || '').toUpperCase();
  emptyExercises.style.display = 'block';
  emptyExercises.innerHTML = `
    <div style="padding:14px 14px; line-height:1.6;">
      <b>Acceso bloqueado</b><br/>
      Para abrir <b>${LEVEL}</b> primero completa <b>${prev}</b>.<br/>
      <div class="metaRow" style="margin-top:12px; flex-wrap:wrap; gap:10px;">
        <a class="btn-yellow" href="${courseHref(prev)}" style="text-decoration:none;">Ir a ${prev}</a>
        <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
      </div>
    </div>
  `;
}

function showTopicOrderLocked(nextTopic) {
  showClassicListSection();
  if (exerciseList) exerciseList.innerHTML = '';
  if (!emptyExercises) return;

  const nextLevel = topicLevelOf(nextTopic, LEVEL);
  const target = nextTopic?.id
    ? `lessonpage.html?level=${encodeURIComponent(nextLevel)}&id=${encodeURIComponent(nextTopic.id)}${navParams()}`
    : courseHref(nextLevel);
  const label = nextTopic?.title ? `Ir al tema actual: ${String(nextTopic.title)}` : 'Ir al tema actual';

  emptyExercises.style.display = 'block';
  emptyExercises.innerHTML = `
    <div style="padding:14px 14px; line-height:1.6;">
      <b>Acceso bloqueado</b><br/>
      Este tema a\u00fan no est\u00e1 desbloqueado.<br/>
      Completa el tema actual para continuar.
      <div class="metaRow" style="margin-top:12px; flex-wrap:wrap; gap:10px;">
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

function showCheckpointLocked(blockNo, route = []) {
  showClassicListSection();
  if (exerciseList) exerciseList.innerHTML = '';
  if (!emptyExercises) return;

  const block = Math.max(1, Number(blockNo || 1));
  const href = checkpointReviewHref(block, route);
  emptyExercises.style.display = 'block';
  emptyExercises.innerHTML = `
    <div style="padding:14px 14px; line-height:1.6;">
      <b>Checkpoint wymagany</b><br/>
      Zanim przejdziesz dalej, zalicz mini-test po module ${block}.<br/>
      <div class="metaRow" style="margin-top:12px; flex-wrap:wrap; gap:10px;">
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
    CURRENT_ROUTE = route.slice();
    CURRENT_ROUTE_INDEX = idx;

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
      showTopicOrderLocked(route[firstIncomplete]);
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
          CURRENT_MISSING_CHECKPOINT = block;
          showCheckpointLocked(block, route);
          return false;
        }
      }
    }

    CURRENT_MISSING_CHECKPOINT = 0;
    return true;
  } catch (e) {
    console.warn('[ejercicio] enforceTopicOrderGate failed', e);
    return true;
  }
}

async function isPrevLevelCompleted(uid, prevLevel) {
  const lvl = String(prevLevel || '').toUpperCase();
  if (!uid || !lvl) return true;
  try {
    const courseSnap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl)),
    );
    const allCourses = courseSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    const prevCourses = selectCoursesForTrack(allCourses);

    const total = prevCourses.length;
    if (!total) return true;

    const topicIdSet = new Set(prevCourses.map((t) => String(t.id)));
    const topicSlugSet = new Set(
      prevCourses.map((t) => String(t.slug || t.id || '').trim()).filter(Boolean),
    );

    const progSnap = await getDocs(
      query(collection(db, 'user_progress', uid, 'topics'), where('level', '==', lvl)),
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
    console.warn('[ejercicio] prev level check failed', e);
    return true;
  }
}

const toast = document.getElementById('toast');
const sessionEmail = document.getElementById('sessionEmail');
const topicTitle = document.getElementById('topicTitle');
const topicDesc = document.getElementById('topicDesc');
const taskChips = document.getElementById('taskChips');

const exerciseList = document.getElementById('exerciseList');
const emptyExercises = document.getElementById('emptyExercises');
const adminWrap = document.getElementById('adminWrap');

const pillLevel = document.getElementById('pillLevel');
const pillType = document.getElementById('pillType');
const pillSlug = document.getElementById('pillSlug');
const pillCount = document.getElementById('pillCount');
const pillProgress = document.getElementById('pillProgress');
const pillTestScore = document.getElementById('pillTestScore');
const pillLessonLink = document.getElementById('pillLessonLink');

const readProgressFill = document.getElementById('readProgressFill');
const readProgressText = document.getElementById('readProgressText');
const testProgressText = document.getElementById('testProgressText');

const searchInput = document.getElementById('searchInput');
const filterType = document.getElementById('filterType');
const filterTag = document.getElementById('filterTag');
const btnClearFilters = document.getElementById('btnClearFilters');

const exerciseHero = document.getElementById('exerciseHero');
const exerciseFiltersCard = document.getElementById('exerciseFiltersCard');
const exerciseListSection = document.getElementById('exerciseListSection');

const immersiveStage = document.getElementById('immersiveStage');
const immersiveTrackFill = document.getElementById('immersiveTrackFill');
const immersiveStep = document.getElementById('immersiveStep');
const immersiveType = document.getElementById('immersiveType');
const immersivePromptTitle = document.getElementById('immersivePromptTitle');
const immersiveExerciseHost = document.getElementById('immersiveExerciseHost');
const btnImmPrev = document.getElementById('btnImmPrev');
const btnImmNext = document.getElementById('btnImmNext');

  const btnLogout = document.getElementById('btnLogout');
  const btnBackLesson = document.getElementById('btnBackLesson');
  const btnBackCourse = document.getElementById('btnBackCourse');
  const btnReview = document.getElementById('btnReview');
  const btnFlashcards = document.getElementById('btnFlashcards');

const correctionModal = document.getElementById('correctionModal');
const btnFinishCorrection = document.getElementById('btnFinishCorrection');
const btnFinishMiniTest = document.getElementById('btnFinishMiniTest');
const btnCorrectionClose = document.getElementById('btnCorrectionClose');
const btnCorrectionCancel = document.getElementById('btnCorrectionCancel');
const btnCorrectionPublish = document.getElementById('btnCorrectionPublish');
const correctionText = document.getElementById('correctionText');
const correctionMeta = document.getElementById('correctionMeta');
const correctionMsg = document.getElementById('correctionMsg');
const btnCorrectionRecord = document.getElementById('btnCorrectionRecord');
const btnCorrectionClearAudio = document.getElementById('btnCorrectionClearAudio');
const correctionRecordHint = document.getElementById('correctionRecordHint');
const correctionAudioPreview = document.getElementById('correctionAudioPreview');

let corrRecorder = null;
let corrRecording = false;
let corrStream = null;
let corrChunks = [];
let corrAudioFile = null;
let corrAudioObjectUrl = '';

let cachedExercises = [];
let VIEW_EXERCISES = [];
let CURRENT_UID = null;
let CURRENT_TOPIC_KEY = null;
let currentTopic = null;
let hasShownFinish = false;
let completedAt = null;
let immersiveIndex = 0;
let immersiveHasInitialFocus = false;
let CURRENT_FLAGS = null;
let CURRENT_ROUTE = [];
let CURRENT_ROUTE_INDEX = -1;
let CURRENT_MISSING_CHECKPOINT = 0;

const progressState = {
  doneIds: new Set(),
  testResults: new Map(),
};

function isAdminUser(userDoc, email) {
  const mail = String(email || '').toLowerCase();
  return (
    ADMIN_EMAILS.includes(mail) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin'
  );
}

function showToast(msg, type = 'ok', ms = 2000) {
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.style.display = 'none'), ms);
}

function setToast(msg, type = 'ok') {
  showToast(msg, type, 2400);
}

function setCorrectionMsg(text, bad = false) {
  if (!correctionMsg) return;
  correctionMsg.textContent = text || '';
  correctionMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function setCorrectionRecordHint(text, bad = false) {
  if (!correctionRecordHint) return;
  correctionRecordHint.textContent = text || '';
  correctionRecordHint.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function clearCorrectionAudio({ stopRecording = true } = {}) {
  if (stopRecording && corrRecording) {
    try {
      corrRecorder?.stop();
    } catch {}
    corrRecording = false;
  }

  try {
    corrStream?.getTracks?.()?.forEach((t) => t.stop());
  } catch {}

  corrStream = null;
  corrRecorder = null;
  corrChunks = [];

  corrAudioFile = null;
  if (corrAudioObjectUrl) {
    try {
      URL.revokeObjectURL(corrAudioObjectUrl);
    } catch {}
  }
  corrAudioObjectUrl = '';

  if (correctionAudioPreview) {
    try {
      correctionAudioPreview.pause?.();
    } catch {}
    correctionAudioPreview.removeAttribute('src');
    correctionAudioPreview.style.display = 'none';
  }
  if (btnCorrectionClearAudio) btnCorrectionClearAudio.style.display = 'none';
  if (btnCorrectionRecord) btnCorrectionRecord.textContent = 'Grabar voz';
  setCorrectionRecordHint('');
}

function canRecordVoice() {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function ttsTextForExercise(ex) {
  const direct = extractTtsText(ex);
  if (direct) return direct;

  const prompt = String(ex?.prompt || '').trim();
  const answers = parseAnswerList(ex?.answer || '');

  if (prompt.includes('___') && answers.length) {
    let i = 0;
    return prompt.replaceAll('___', () => answers[i++] ?? answers[0]);
  }

  if (answers.length) return answers.join(' ');
  return prompt;
}

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

function playAudioUrl(url) {
  const u = String(url || '').trim();
  if (!u) return;
  try {
    const audio = new Audio(u);
    audio.play().catch(() => {});
  } catch {}
}

function playExerciseAudio(ex) {
  const audioUrl = extractAudioUrl(ex);
  if (audioUrl) {
    playAudioUrl(audioUrl);
    return;
  }
  speakPolish(ttsTextForExercise(ex));
}

const SPEAKER_ICON = '🔊';

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

function wireInlineSpeaker(spanEl, text) {
  if (!spanEl) return;
  const t = String(text || '').trim();
  if (!t) return;
  const onClick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    speakPolish(t);
  };
  spanEl.addEventListener('click', onClick);
  spanEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    onClick(ev);
  });
}

async function toggleCorrectionRecording() {
  if (!btnCorrectionRecord) return;

  if (!canRecordVoice()) {
    setCorrectionRecordHint('Tu navegador no soporta grabación.', true);
    return;
  }

  if (corrRecording) {
    try {
      corrRecorder?.stop();
    } catch {}
    corrRecording = false;
    btnCorrectionRecord.textContent = 'Grabar voz';
    setCorrectionRecordHint('');
    return;
  }

  try {
    clearCorrectionAudio({ stopRecording: false });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    corrStream = stream;
    corrRecorder = new MediaRecorder(stream);
    corrChunks = [];

    corrRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) corrChunks.push(e.data);
    };

    corrRecorder.onstop = () => {
      const blob = new Blob(corrChunks, { type: corrRecorder?.mimeType || 'audio/webm' });
      const file = new File([blob], `correction_${Date.now()}.webm`, { type: blob.type });
      corrAudioFile = file;

      if (corrAudioObjectUrl) {
        try {
          URL.revokeObjectURL(corrAudioObjectUrl);
        } catch {}
      }
      corrAudioObjectUrl = URL.createObjectURL(blob);

      if (correctionAudioPreview) {
        correctionAudioPreview.src = corrAudioObjectUrl;
        correctionAudioPreview.style.display = 'block';
      }
      if (btnCorrectionClearAudio) btnCorrectionClearAudio.style.display = '';

      try {
        corrStream?.getTracks?.()?.forEach((t) => t.stop());
      } catch {}
      corrStream = null;
      corrRecorder = null;
      corrChunks = [];

      setCorrectionRecordHint('Voz lista.');
    };

    corrRecorder.start();
    corrRecording = true;
    btnCorrectionRecord.textContent = 'Detener';
    setCorrectionRecordHint('Grabando...');
  } catch (e) {
    console.warn('[correction] record failed', e);
    clearCorrectionAudio();
    setCorrectionRecordHint('No se pudo grabar.', true);
  }
}

function openCorrectionModal() {
  if (!correctionModal) return;
  const title = String(currentTopic?.title || currentTopic?.name || currentTopic?.slug || '').trim();
  const meta = `Nivel ${LEVEL}${title ? ` · Tema: ${title}` : ''}`;
  if (correctionMeta) correctionMeta.textContent = meta;
  setCorrectionMsg('');
  setCorrectionRecordHint('');
  if (btnCorrectionRecord) btnCorrectionRecord.disabled = !canRecordVoice();
  correctionModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  if (correctionText) correctionText.focus();
}

function closeCorrectionModal() {
  if (!correctionModal) return;
  clearCorrectionAudio();
  correctionModal.style.display = 'none';
  document.body.classList.remove('modal-open');
  setCorrectionMsg('');
}

async function getMyDisplayName(uid, email) {
  const fallback = String(email || '').trim() || 'Usuario';
  const short = fallback.includes('@') ? fallback.split('@')[0] : fallback;
  const fromAuth = String(auth.currentUser?.displayName || '').trim();
  if (fromAuth) return fromAuth;
  try {
    const snap = await getDoc(doc(db, 'public_users', uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      const name = String(d.displayName || d.name || '').trim();
      const handle = String(d.handle || '').trim();
      if (name) return name;
      if (handle) return `@${handle}`;
    }
  } catch {}
  return short || 'Usuario';
}

async function publishCorrectionRequest() {
  if (!CURRENT_UID) return;
  if (!currentTopic?.id) return;
  const raw = String(correctionText?.value || '').trim();
  if (raw.length < 6) {
    setCorrectionMsg('Escribe al menos una frase.', true);
    return;
  }
  if (raw.length > 2200) {
    setCorrectionMsg('El texto es demasiado largo (m\u00e1x. 2200 caracteres).', true);
    return;
  }
  if (corrRecording) {
    setCorrectionMsg('Det\u00e9n la grabaci\u00f3n primero.', true);
    return;
  }

  try {
    if (btnCorrectionPublish) btnCorrectionPublish.disabled = true;
    setCorrectionMsg('Publicando...');

    const topicTitle = String(currentTopic?.title || currentTopic?.name || '').trim();
    const authorName = await getMyDisplayName(CURRENT_UID, auth.currentUser?.email);

    const tags = [
      'Correcci\u00f3n',
      `Nivel ${LEVEL}`,
      topicTitle ? `Tema: ${topicTitle}` : '',
    ].filter(Boolean);

    const header = `Correcci\u00f3n (Nivel ${LEVEL}${topicTitle ? ` \u00b7 ${topicTitle}` : ''})`;
    const text = `${header}\n\n${raw}`;

    const voice = corrAudioFile;
    let voiceUrl = '';
    let voicePath = '';
    if (voice) {
      const MAX_VOICE_BYTES = 10 * 1024 * 1024;
      if (voice.size > MAX_VOICE_BYTES) {
        setCorrectionMsg('Audio demasiado grande (m\u00e1x. 10MB).', true);
        return;
      }
      setCorrectionMsg('Subiendo voz...');
      const safeName = String(voice.name || 'voice').replace(/[^\w.\-]+/g, '_');
      const path = `audio/corrections/${CURRENT_UID}/${Date.now()}_${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, voice);
      voiceUrl = await getDownloadURL(fileRef);
      voicePath = path;
    }

    const ref = await addDoc(collection(db, 'user_feed', CURRENT_UID, 'posts'), {
      type: 'correction',
      text,
      tags,
      level: LEVEL,
      topicId: String(currentTopic.id),
      topicTitle: topicTitle || null,
      voiceUrl: voiceUrl || null,
      voicePath: voicePath || null,
      voiceContentType: voice?.type || null,
      voiceSize: voice ? Number(voice.size || 0) : null,
      createdAt: serverTimestamp(),
      authorUid: CURRENT_UID,
      authorName: authorName || 'Usuario',
      resolved: false,
      updatedAt: serverTimestamp(),
    });

    closeCorrectionModal();
    showToast('Publicado en la comunidad.', 'ok', 1800);
    setTimeout(() => {
      window.location.href = `correccion.html?uid=${encodeURIComponent(CURRENT_UID)}&post=${encodeURIComponent(ref.id)}`;
    }, 400);
  } catch (e) {
    console.warn('[correction] publish failed', e);
    setCorrectionMsg('No se pudo publicar.', true);
  } finally {
    if (btnCorrectionPublish) btnCorrectionPublish.disabled = false;
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeType(value) {
  return String(value || '').trim();
}

function normalizeTag(value) {
  return String(value || '').trim();
}

function normalizeTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => String(t || '').trim())
      .filter(Boolean);
  }
  return [];
}

function exerciseTagList(ex) {
  return normalizeTags(ex?.tags)
    .map((t) => normalizeTag(t).toLowerCase())
    .filter(Boolean);
}

function shouldSpeakChoiceOptions(ex, options = []) {
  const tags = exerciseTagList(ex);
  if (tags.includes('type:listen_choice') || tags.includes('type:listen_fill')) return false;
  const prompt = normalizeText(ex?.prompt || '');
  if (prompt.includes('traduccion en espanol') || prompt.includes('en espanol')) return false;
  if (tags.includes('type:choice')) return true;
  if (prompt.includes('en polaco') || prompt.includes('po polsku')) return true;

  const hasPolishHint =
    Array.isArray(options) &&
    options.some((opt) => {
      const lead = stripLeadLabel(opt);
      if (/^pl\s*:/i.test(lead)) return true;
      if (/^(?:es|en)\s*:/i.test(lead)) return false;
      const text = String(lead || '')
        .replace(/^(?:pl|tts_pl|tts)\s*:\s*/i, '')
        .trim();
      return /[ąćęłńśżź]/i.test(text) || /(?:rz|cz|sz|dż|dź)/i.test(text);
    });

  return !!hasPolishHint;
}

function sanitizeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  return u.replace(/[)\],.]+$/g, '');
}

function splitNotesParts(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .flatMap((line) => line.split('|'))
    .map((p) => p.trim())
    .filter(Boolean);
}

function stripNoteLabel(part) {
  const idx = String(part || '').indexOf(':');
  if (idx < 0) return '';
  return String(part || '')
    .slice(idx + 1)
    .trim();
}

function extractAudioUrl(ex) {
  const direct = String(ex?.audioUrl || ex?.audio || '').trim();
  if (/^https?:\/\//i.test(direct)) return sanitizeUrl(direct);

  const notes = String(ex?.notes || '').trim();
  if (!notes) return '';

  const m =
    notes.match(/(?:^|\s)AUDIO_URL\s*:\s*(https?:\/\/\S+)/i) ||
    notes.match(/(?:^|\s)AUDIO\s*:\s*(https?:\/\/\S+)/i) ||
    notes.match(/(?:^|\s)URL\s*:\s*(https?:\/\/\S+)/i);
  if (m && m[1]) return sanitizeUrl(m[1]);

  const any = notes.match(/https?:\/\/\S+/i);
  return any ? sanitizeUrl(any[0]) : '';
}

function extractTtsText(ex) {
  const direct = String(ex?.ttsText || '').trim();
  if (direct) return direct;
  const notes = String(ex?.notes || '').trim();
  if (!notes) return '';
  const parts = splitNotesParts(notes);
  const pl = parts.find((p) => /^tts_pl\s*:/i.test(p));
  if (pl) return stripNoteLabel(pl);
  const any = parts.find((p) => /^tts\s*:/i.test(p));
  if (any) return stripNoteLabel(any);
  return '';
}

function isCardsExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('tarjeta');
}

function isSpeakingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  if (isSceneExercise(ex)) return false;
  return (
    t.includes('repetir') ||
    t.includes('voz') ||
    t.includes('grab') ||
    t.includes('monologo') ||
    t.includes('dialogo') ||
    t.includes('entrevista') ||
    t.includes('historia') ||
    t.includes('debate') ||
    t.includes('mision') ||
    t.includes('rol')
  );
}

function isSceneExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('scenka') ||
    t.includes('escena') ||
    t.includes('scene') ||
    t.includes('situacion') ||
    t.includes('situacion comunicativa') ||
    t.includes('dialogo guiado') ||
    t.includes('dialog wybierz') ||
    t.includes('micro dialogo')
  );
}

function isFindErrorExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('znajdz blad') ||
    t.includes('encuentra el error') ||
    t.includes('find error') ||
    t.includes('detecta error') ||
    t.includes('corrige frase')
  );
}

function isChoiceExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('opcion') ||
    t.includes('elegir') ||
    t.includes('elige') ||
    t.includes('eleccion') ||
    t.includes('verdadero') ||
    t.includes('falso') ||
    t.includes('quiz') ||
    t.includes('marcar')
  );
}

function isBinaryTrueFalseExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('verdadero o falso') ||
    t.includes('verdadero/falso') ||
    t.includes('marcar verdadero o falso') ||
    t.includes('true false') ||
    t.includes('prawda/falsz')
  );
}

function isDictationExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('dictado') || t.includes('dyktando');
}

function isDragDropExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('arrastrar') ||
    t.includes('drag') ||
    t.includes('soltar') ||
    t.includes('przeciagnij')
  );
}

function isFillExercise(ex) {
  const t = normalizeText(ex?.type || '');
  const prompt = String(ex?.prompt || '');
  return (
    t.includes('rellenar') ||
    t.includes('completar') ||
    t.includes('dictado') ||
    t.includes('espacios') ||
    t.includes('preposicion') ||
    t.includes('terminacion') ||
    prompt.includes('___')
  );
}

function isListenExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('escuchar') || t.includes('audio') || t.includes('dictado');
}

function isTestExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('test final');
}

function isMatchingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('relacionar') ||
    t.includes('unir') ||
    t.includes('emparejar') ||
    t.includes('pares') ||
    t.includes('matching') ||
    t.includes('match')
  );
}

function isOrderingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('ordenar') ||
    t.includes('orden') ||
    t.includes('secuencia') ||
    t.includes('ordenar la secuencia')
  );
}

function isWritingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('escribir') ||
    t.includes('respuesta') ||
    t.includes('responder') ||
    t.includes('describir') ||
    t.includes('decirlo de otra') ||
    t.includes('otra manera')
  );
}

function parseAnswerList(raw) {
  return String(raw || '')
    .split(/[\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseExpectedByBlank(rawAnswer, blanksCount) {
  const raw = String(rawAnswer || '').trim().replaceAll('/', '|');
  if (!raw) return [];
  if (raw.includes('||')) {
    return raw
      .split('||')
      .map((p) => parseAnswerList(p));
  }
  const list = parseAnswerList(raw);
  if (blanksCount <= 1) return [list];
  if (list.length === blanksCount) return list.map((x) => parseAnswerList(x));
  return Array.from({ length: blanksCount }, () => list);
}

function parseBooleanToken(raw) {
  const t = normalizeText(raw || '');
  if (!t) return null;
  if (
    t === 'true' ||
    t === 'verdadero' ||
    t === 'prawda' ||
    t === 'tak' ||
    t === 't' ||
    t === '1'
  )
    return true;
  if (
    t === 'false' ||
    t === 'falso' ||
    t === 'falsz' ||
    t === 'nie' ||
    t === 'n' ||
    t === '0'
  )
    return false;
  return null;
}

function normalizeDictationText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (!s) return t.length;
  if (!t) return s.length;
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function dictationSimilarity(a, b) {
  const left = normalizeDictationText(a);
  const right = normalizeDictationText(b);
  if (!left && !right) return 100;
  if (!left || !right) return 0;
  const dist = levenshteinDistance(left, right);
  const maxLen = Math.max(left.length, right.length) || 1;
  const score = Math.round((1 - dist / maxLen) * 100);
  return Math.min(100, Math.max(0, score));
}

function parseOptions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function optionLabelFromIndex(idx) {
  return String.fromCharCode(65 + idx);
}

function cleanOptionText(opt) {
  return String(opt || '').replace(/^[A-D]\s*[)\.:-]\s*/i, '').trim();
}

function shuffleArray(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stripLeadLabel(raw) {
  return String(raw || '').replace(/^\s*([A-Z]|\d+)\s*[)\.:-]\s*/i, '').trim();
}

function parseMatchAnswerMap(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  const pairs = txt
    .split(/[,\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!pairs.length) return null;
  const map = {};
  pairs.forEach((p) => {
    const m = p.match(/^\s*([A-Z])\s*[-=]\s*(\d+)\s*$/i);
    if (!m) return;
    map[String(m[1] || '').toUpperCase()] = String(m[2] || '');
  });
  return Object.keys(map).length ? map : null;
}

function parseMatchPairs(options, answerRaw) {
  const lines = Array.isArray(options)
    ? options.map((o) => String(o || '').trim()).filter(Boolean)
    : [];
  if (!lines.length) return null;

  const left = [];
  const right = [];
  const derivedMap = {}; // leftLabel -> rightLabel

  let autoLetter = 0;
  let autoNum = 1;

  lines.forEach((line) => {
    const parts = line.split(/\s*(?:=|->|→|â€”|—)\s*/);
    if (parts.length < 2) return;

    const leftRaw = parts[0];
    const rightRaw = parts.slice(1).join(' - ');

    const lm = String(leftRaw).match(/^\s*([A-Z])\s*[)\.:-]\s*(.+)$/i);
    const rm = String(rightRaw).match(/^\s*(\d+)\s*[)\.:-]\s*(.+)$/i);

    const leftLabel = lm
      ? String(lm[1] || '').toUpperCase()
      : String.fromCharCode(65 + (autoLetter++ % 26));
    const leftText = stripLeadLabel(lm ? lm[2] : leftRaw);

    const rightLabel = rm ? String(rm[1] || '') : String(autoNum++);
    const rightText = stripLeadLabel(rm ? rm[2] : rightRaw);

    left.push({ label: leftLabel, text: leftText });
    right.push({ label: rightLabel, text: rightText });
    derivedMap[leftLabel] = rightLabel;
  });

  if (!left.length || !right.length) return null;

  const fromAnswer = parseMatchAnswerMap(answerRaw);
  const correctMap = fromAnswer || derivedMap;

  return {
    left,
    right: shuffleArray(right),
    correctMap,
  };
}

function topicKeyFrom(topic) {
  const slug = String(topic?.slug || topic?.id || SLUG || TOPIC_ID || '').trim();
  const lvl = topicLevelOf(topic, LEVEL);
  return slug ? `${lvl}__${slug}` : null;
}

function progressDocRef(uid, topicKey) {
  return doc(db, 'user_progress', uid, 'topics', topicKey);
}

function expectedAnswerPreview(ex) {
  const options = parseOptions(ex?.options);
  const rawAnswer = String(ex?.answer || '').trim();
  if (!rawAnswer) return '';
  const labels = parseAnswerList(rawAnswer).map((x) => normalizeText(x));
  const byLabel = options
    .map((opt, idx) => ({
      label: normalizeText(optionLabelFromIndex(idx)),
      value: cleanOptionText(opt) || String(opt || '').trim(),
    }))
    .filter((x) => x.value);
  const mapped = byLabel
    .filter((x) => labels.includes(x.label))
    .map((x) => x.value);
  const direct = parseAnswerList(rawAnswer);
  const list = mapped.length ? mapped : direct;
  return list.slice(0, 3).join(' | ');
}

async function appendMistakeLog(ex, userAnswer, expectedAnswer = '') {
  if (!CURRENT_UID || !CURRENT_TOPIC_KEY || !ex?.id) return;
  const ref = progressDocRef(CURRENT_UID, CURRENT_TOPIC_KEY);
  const nowIso = new Date().toISOString();

  try {
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() || {} : {};
    const list = Array.isArray(data.mistakeLog) ? [...data.mistakeLog] : [];
    const expected = String(expectedAnswer || expectedAnswerPreview(ex) || '').trim();
    const answer = String(userAnswer || '').trim();

    const idx = list.findIndex((item) => {
      if (String(item?.exerciseId || '') !== String(ex.id)) return false;
      return (
        normalizeText(String(item?.expected || '')) === normalizeText(expected) &&
        normalizeText(String(item?.userAnswer || '')) === normalizeText(answer)
      );
    });

    if (idx >= 0) {
      list[idx] = {
        ...(list[idx] || {}),
        count: Number(list[idx]?.count || 1) + 1,
        lastAt: nowIso,
      };
    } else {
      list.unshift({
        id: `${ex.id}__${Date.now()}`,
        exerciseId: String(ex.id),
        type: String(ex.type || ''),
        prompt: String(ex.prompt || '').trim().slice(0, 320),
        userAnswer: answer.slice(0, 220),
        expected: expected.slice(0, 220),
        level: topicLevelOf(currentTopic, LEVEL),
        topicId: String(currentTopic?.id || TOPIC_ID || ''),
        topicSlug: String(currentTopic?.slug || ''),
        topicTitle: String(currentTopic?.title || ''),
        count: 1,
        lastAt: nowIso,
      });
    }

    await setDoc(
      ref,
      {
        mistakeLog: list.slice(0, 90),
        lastMistakeAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('[ejercicio] appendMistakeLog failed', e);
  }
}

async function clearMistakeLogForExercise(exId) {
  if (!CURRENT_UID || !CURRENT_TOPIC_KEY || !exId) return;
  const ref = progressDocRef(CURRENT_UID, CURRENT_TOPIC_KEY);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const list = Array.isArray(data.mistakeLog) ? data.mistakeLog : [];
    const next = list.filter((item) => String(item?.exerciseId || '') !== String(exId));
    if (next.length === list.length) return;
    await setDoc(
      ref,
      {
        mistakeLog: next.slice(0, 90),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('[ejercicio] clearMistakeLogForExercise failed', e);
  }
}

function computeProgressStats() {
  const allIds = new Set(cachedExercises.map((ex) => String(ex.id)));
  const testExercises = cachedExercises.filter((ex) => isTestExercise(ex));
  const practiceExercises = cachedExercises.filter((ex) => !isTestExercise(ex));

  const doneIds = Array.from(progressState.doneIds).filter((id) => allIds.has(id));
  const doneAll = doneIds.length;

  const practiceIdSet = new Set(practiceExercises.map((ex) => String(ex.id)));
  const donePractice = doneIds.filter((id) => practiceIdSet.has(id)).length;
  const totalPractice = practiceExercises.length;
  const practicePercent = totalPractice
    ? Math.round((donePractice / totalPractice) * 100)
    : 0;

  const testIdSet = new Set(testExercises.map((ex) => String(ex.id)));
  let testAnswered = 0;
  let testCorrect = 0;
  for (const id of testIdSet) {
    const res = progressState.testResults.get(id);
    if (!res) continue;
    testAnswered += 1;
    if (res.correct === true) testCorrect += 1;
  }
  const testTotal = testExercises.length;
  const testScore = testTotal ? Math.round((testCorrect / testTotal) * 100) : 0;
  const testPassed = testTotal ? testScore >= TEST_PASS_PCT : true;

  const overallPercent = cachedExercises.length
    ? Math.round((doneAll / cachedExercises.length) * 100)
    : 0;

  const completed = practicePercent >= PRACTICE_COMPLETE_PCT && testPassed;

  return {
    totalAll: cachedExercises.length,
    doneAll,
    doneIds,
    totalPractice,
    donePractice,
    practicePercent,
    overallPercent,
    testTotal,
    testAnswered,
    testCorrect,
    testScore,
    testPassed,
    completed,
    practiceIds: practiceIdSet,
    testIds: testIdSet,
  };
}

function setProgressUI() {
  const stats = computeProgressStats();

  if (pillProgress) pillProgress.textContent = `Practica: ${stats.practicePercent}%`;
  if (pillTestScore) {
    pillTestScore.textContent = stats.testTotal ? `Test: ${stats.testScore}%` : 'Test: -';
  }
  if (pillCount) pillCount.textContent = `Ejercicios: ${stats.totalAll}`;

  if (readProgressFill) readProgressFill.style.width = `${stats.practicePercent}%`;
  if (readProgressText) {
    readProgressText.textContent = stats.totalPractice
      ? `Ejercicios: ${stats.donePractice}/${stats.totalPractice} (${stats.practicePercent}%)`
      : 'Ejercicios: -';
  }
  if (testProgressText) {
    testProgressText.textContent = stats.testTotal
      ? `Test: ${stats.testCorrect}/${stats.testTotal} (${stats.testScore}%)`
      : 'Test: -';
  }

  const doneEl = document.getElementById('doneCount');
  const totalEl = document.getElementById('totalCount');
  if (doneEl) doneEl.textContent = String(stats.donePractice);
  if (totalEl) totalEl.textContent = String(stats.totalPractice);

  if (IMMERSIVE_MODE) syncImmersiveProgressUI();
  maybeFinish(stats);
}

async function loadProgressForTopic(uid) {
  if (!uid || !CURRENT_TOPIC_KEY) return;
  try {
    const snap = await getDoc(progressDocRef(uid, CURRENT_TOPIC_KEY));
    progressState.doneIds = new Set();
    progressState.testResults = new Map();
    completedAt = null;

    if (snap.exists()) {
      const data = snap.data() || {};
      const done = Array.isArray(data.doneIds) ? data.doneIds : [];
      done.forEach((id) => progressState.doneIds.add(String(id)));

      const testResults = data.testResults && typeof data.testResults === 'object'
        ? data.testResults
        : {};
      Object.keys(testResults).forEach((key) => {
        progressState.testResults.set(String(key), testResults[key]);
      });

      completedAt = data.completedAt || null;
    }
  } catch (e) {
    console.warn('Progress read failed:', e?.code || e);
  }

  setProgressUI();
}

async function saveProgress() {
  if (!CURRENT_UID || !CURRENT_TOPIC_KEY) return;

  const stats = computeProgressStats();
  const topicLevel = topicLevelOf(currentTopic, LEVEL);
  const justCompleted = stats.completed && !completedAt;
  const testResults = {};
  stats.testIds.forEach((id) => {
    const res = progressState.testResults.get(id);
    if (res) testResults[id] = res;
  });

  const payload = {
    level: topicLevel,
    topicId: currentTopic?.id || TOPIC_ID || null,
    topicSlug: currentTopic?.slug || null,
    totalExercises: stats.totalAll,
    doneIds: stats.doneIds,
    doneCount: stats.doneAll,
    overallPercent: stats.overallPercent,
    practiceTotal: stats.totalPractice,
    practiceDone: stats.donePractice,
    practicePercent: stats.practicePercent,
    testTotal: stats.testTotal,
    testAnswered: stats.testAnswered,
    testCorrect: stats.testCorrect,
    testScore: stats.testScore,
    testPassed: stats.testPassed,
    completed: stats.completed,
    testResults,
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  };

  if (justCompleted) {
    completedAt = new Date();
    payload.completedAt = serverTimestamp();
  } else if (completedAt) {
    payload.completedAt = completedAt;
  }

  try {
    await setDoc(progressDocRef(CURRENT_UID, CURRENT_TOPIC_KEY), payload, {
      merge: true,
    });
    if (justCompleted) {
      await applyLearningReward(CURRENT_UID, {
        exp: CONTINUOUS_FLOW ? 36 : 24,
        badges: ['module_complete', CONTINUOUS_FLOW ? 'continuous_route' : ''],
        onceEverKey: `topic_complete_${CURRENT_TOPIC_KEY}`,
        source: 'exercise_topic_complete',
      });
    }
  } catch (e) {
    console.warn('Progress write failed:', e?.code || e);
  }
}

function setTaskChips(exCount) {
  if (!taskChips) return;
  taskChips.innerHTML = `
    <span class="pill pill-blue">Total: ${exCount}</span>
    <span class="pill">Mostrando: ${VIEW_EXERCISES.length}</span>
  `;
}

function showClassicListSection() {
  if (!IMMERSIVE_MODE) return;
  if (immersiveStage) immersiveStage.style.display = 'none';
  if (exerciseListSection) exerciseListSection.style.display = '';
}

function immersiveTitleForExercise(ex) {
  if (isSceneExercise(ex)) return 'Mikro-scenka: wybierz najlepsza reakcje.';
  if (isFindErrorExercise(ex)) return 'Znajdz blad i wybierz poprawna wersje.';
  if (isDictationExercise(ex)) return 'Escucha y escribe el dictado.';
  if (isDragDropExercise(ex)) return 'Arrastra las palabras.';
  if (isBinaryTrueFalseExercise(ex)) return 'Verdadero o falso.';
  if (isChoiceExercise(ex)) return 'Marca la opcion correcta.';
  if (isFillExercise(ex)) return 'Completa la frase.';
  if (isMatchingExercise(ex)) return 'Relaciona los elementos.';
  if (isOrderingExercise(ex)) return 'Ordena las palabras.';
  if (isSpeakingExercise(ex)) return 'Escucha y repite.';
  if (isWritingExercise(ex)) return 'Escribe tu respuesta.';
  if (isTestExercise(ex)) return 'Comprueba tu resultado.';
  return 'Resuelve el ejercicio.';
}

function getFirstPendingImmersiveIndex() {
  const idx = VIEW_EXERCISES.findIndex((ex) => !progressState.doneIds.has(String(ex.id)));
  return idx >= 0 ? idx : 0;
}

function syncImmersiveProgressUI() {
  if (!IMMERSIVE_MODE) return;
  const total = VIEW_EXERCISES.length;
  if (!total) return;

  const idx = Math.min(Math.max(0, immersiveIndex), Math.max(0, total - 1));
  const ex = VIEW_EXERCISES[idx] || null;
  const positionPct = Math.round(((idx + 1) / total) * 100);

  if (immersiveTrackFill) immersiveTrackFill.style.width = `${positionPct}%`;
  if (immersiveStep) immersiveStep.textContent = `${idx + 1}/${total}`;
  if (immersiveType) immersiveType.textContent = String(ex?.type || 'Ejercicio');
  if (immersivePromptTitle) immersivePromptTitle.textContent = immersiveTitleForExercise(ex);

  if (btnImmPrev) btnImmPrev.disabled = idx <= 0;
  if (btnImmNext) btnImmNext.textContent = idx >= total - 1 ? 'Finalizar' : 'Siguiente';
}

function renderImmersiveMode() {
  if (!IMMERSIVE_MODE) return;
  if (!immersiveStage || !immersiveExerciseHost) return;

  if (!VIEW_EXERCISES.length) {
    showClassicListSection();
    if (emptyExercises) emptyExercises.style.display = 'block';
    return;
  }

  if (emptyExercises) emptyExercises.style.display = 'none';
  if (!immersiveHasInitialFocus) {
    immersiveIndex = getFirstPendingImmersiveIndex();
    immersiveHasInitialFocus = true;
  }
  immersiveIndex = Math.min(Math.max(0, immersiveIndex), Math.max(0, VIEW_EXERCISES.length - 1));

  if (exerciseListSection) exerciseListSection.style.display = 'none';
  if (immersiveStage) immersiveStage.style.display = 'block';
  if (exerciseList) exerciseList.innerHTML = '';

  const ex = VIEW_EXERCISES[immersiveIndex];
  immersiveExerciseHost.innerHTML = '';
  const card = makeExerciseCard(ex);
  card.classList.add('exerciseCard--immersive');
  immersiveExerciseHost.appendChild(card);

  syncImmersiveProgressUI();
}

function goToImmersiveOffset(offset) {
  if (!IMMERSIVE_MODE) return;
  if (!VIEW_EXERCISES.length) return;
  const next = immersiveIndex + Number(offset || 0);
  immersiveIndex = Math.min(Math.max(0, next), VIEW_EXERCISES.length - 1);
  renderImmersiveMode();
}

function goNextImmersiveExercise() {
  if (!IMMERSIVE_MODE) return;
  if (!VIEW_EXERCISES.length) return;
  if (immersiveIndex >= VIEW_EXERCISES.length - 1) {
    showFinishModal(computeProgressStats());
    return;
  }
  immersiveIndex += 1;
  renderImmersiveMode();
}

function onImmersiveExerciseDone(exId) {
  if (!IMMERSIVE_MODE) return;
  syncImmersiveProgressUI();
  const current = VIEW_EXERCISES[immersiveIndex];
  if (!current) return;
  if (String(current.id) !== String(exId)) return;
  if (immersiveIndex >= VIEW_EXERCISES.length - 1) return;

  const currentId = String(exId);
  setTimeout(() => {
    const stillHere = String(VIEW_EXERCISES[immersiveIndex]?.id || '') === currentId;
    if (!stillHere) return;
    immersiveIndex = Math.min(immersiveIndex + 1, VIEW_EXERCISES.length - 1);
    renderImmersiveMode();
  }, 320);
}

function setupImmersiveMode() {
  if (!IMMERSIVE_MODE) return;
  document.body.dataset.ui = 'immersive';
  if (exerciseHero) exerciseHero.classList.add('exerciseHero--immersive');
  if (exerciseFiltersCard) exerciseFiltersCard.style.display = 'none';
  if (exerciseListSection) exerciseListSection.style.display = 'none';
  if (taskChips) taskChips.style.display = 'none';

  if (btnImmPrev && !btnImmPrev.dataset.wired) {
    btnImmPrev.dataset.wired = '1';
    btnImmPrev.addEventListener('click', () => goToImmersiveOffset(-1));
  }
  if (btnImmNext && !btnImmNext.dataset.wired) {
    btnImmNext.dataset.wired = '1';
    btnImmNext.addEventListener('click', goNextImmersiveExercise);
  }
}

function buildTypeFilterOptions() {
  if (!filterType) return;
  const types = Array.from(
    new Set(cachedExercises.map((e) => normalizeType(e.type)).filter(Boolean)),
  ).sort();
  filterType.innerHTML =
    `<option value="">Tipo: todos</option>` +
    types.map((t) => `<option value="${t}">${t}</option>`).join('');
}

function buildTagFilterOptions() {
  if (!filterTag) return;
  const tags = new Set();
  cachedExercises.forEach((e) => {
    (e.tags || []).forEach((t) => tags.add(normalizeTag(t)));
  });
  const list = Array.from(tags).filter(Boolean).sort();
  filterTag.innerHTML =
    `<option value="">Tag: todos</option>` +
    list.map((t) => `<option value="${t}">${t}</option>`).join('');
}

function applyFilters() {
  const q = String(searchInput?.value || '')
    .trim()
    .toLowerCase();
  const t = String(filterType?.value || '').trim();
  const tag = String(filterTag?.value || '').trim();

  VIEW_EXERCISES = cachedExercises.filter((e) => {
    if (t && normalizeType(e.type) !== t) return false;
    if (tag) {
      const tags = (e.tags || []).map(normalizeTag);
      if (!tags.includes(tag)) return false;
    }
    if (q) {
      const blob =
        `${e.prompt || ''} ${e.answer || ''} ${(e.options || []).join(' ')} ${e.notes || ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  renderExercises();
}

function makeOptionRow({ name, value, label, checked, onChange, ttsText = '' }) {
  const row = document.createElement('label');
  row.className = 'exerciseOption';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = !!checked;
  input.addEventListener('change', onChange);

  const text = document.createElement('span');
  text.textContent = label;

  row.appendChild(input);
  row.appendChild(text);
  const tts = makeSpeakerBtn(ttsText, { tiny: true });
  if (tts) row.appendChild(tts);
  return row;
}

function setResultText(resultEl, correct, message) {
  if (!resultEl) return;
  resultEl.textContent = message || (correct ? 'Correcto.' : 'Incorrecto.');
  resultEl.classList.remove('ok', 'bad');
  resultEl.classList.add(correct ? 'ok' : 'bad');
}

function makeExerciseCard(ex) {
  const card = document.createElement('div');
  card.className = 'exerciseCard';

  const top = document.createElement('div');
  top.className = 'exerciseTop';

  const meta = document.createElement('div');
  meta.className = 'exerciseMeta';

  const typePill = document.createElement('span');
  typePill.className = 'pill';
  typePill.textContent = ex.type || 'Ejercicio';

  const orderPill = document.createElement('span');
  orderPill.className = 'pill';
  orderPill.textContent = `#${ex.order || 0}`;

  meta.appendChild(typePill);
  meta.appendChild(orderPill);

  const isTest = isTestExercise(ex);
  if (isTest) {
    const testPill = document.createElement('span');
    testPill.className = 'pill pill-yellow';
    testPill.textContent = 'Test';
    meta.appendChild(testPill);
  }

  const tags = normalizeTags(ex.tags);
  if (tags.length) {
    tags.slice(0, 4).forEach((tag) => {
      const tagPill = document.createElement('span');
      tagPill.className = 'pill';
      tagPill.textContent = `#${tag}`;
      meta.appendChild(tagPill);
    });
  }

  top.appendChild(meta);
  card.appendChild(top);

  const prompt = document.createElement('div');
  prompt.className = 'exercisePrompt';
  prompt.textContent = ex.prompt || '';
  card.appendChild(prompt);

  if (ex.imageUrl) {
    const img = document.createElement('img');
    img.className = 'exerciseImage';
    img.alt = 'Imagen';
    img.loading = 'lazy';
    img.src = ex.imageUrl;
    card.appendChild(img);
  }

  const notes = String(ex.notes || '').trim();
  if (notes) {
    const noteWrap = document.createElement('div');
    noteWrap.className = 'exerciseNoteWrap';

    const noteBtn = document.createElement('button');
    noteBtn.className = 'btn-white-outline exerciseNoteBtn';
    noteBtn.type = 'button';
    noteBtn.textContent = 'Pista';

    const noteText = document.createElement('div');
    noteText.className = 'exerciseNote';
    noteText.textContent = notes;
    noteText.style.display = 'none';

    noteBtn.addEventListener('click', () => {
      const isOpen = noteText.style.display === 'block';
      noteText.style.display = isOpen ? 'none' : 'block';
      noteBtn.textContent = isOpen ? 'Pista' : 'Ocultar pista';
    });

    noteWrap.appendChild(noteBtn);
    noteWrap.appendChild(noteText);
    card.appendChild(noteWrap);
  }

  const options = parseOptions(ex.options);

  const answerWrap = document.createElement('div');
  answerWrap.className = 'exerciseAnswer';

  const resultEl = document.createElement('div');
  resultEl.className = 'exerciseResult';

  const actions = document.createElement('div');
  actions.className = 'exerciseActions';

  if (isTest) {
    let selectedValue = '';
    let selectedLabel = '';

    if (options.length) {
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `test_${ex.id}`;

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const optionText = cleaned ? `${label}) ${cleaned}` : `${label}) ${opt}`;
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: optionText,
          checked: false,
          onChange: (ev) => {
            selectedValue = ev.target.value;
            selectedLabel = label;
          },
        });
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);
    } else {
      const input = document.createElement('input');
      input.className = 'input';
      input.placeholder = 'Escribe tu respuesta...';
      input.addEventListener('input', (ev) => {
        selectedValue = ev.target.value;
        selectedLabel = '';
      });
      answerWrap.appendChild(input);
      card.appendChild(answerWrap);
    }

    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn-yellow';
    btnCheck.textContent = 'Comprobar';

    btnCheck.addEventListener('click', async () => {
      const userAnswer = String(selectedValue || '').trim();
      if (!userAnswer) {
        showToast('Escribe o elige una respuesta.', 'warn', 1800);
        return;
      }

      const answers = parseAnswerList(ex.answer || '');
      const answerNorms = answers.map((a) => normalizeText(a));
      const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
      const userNorm = normalizeText(userAnswer);
      const labelNorm = normalizeText(selectedLabel || '');

      let correct = false;
      if (answerNorms.includes(userNorm) || answerNormsClean.includes(userNorm)) correct = true;
      if (!correct && labelNorm && (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm))) {
        correct = true;
      }

      progressState.testResults.set(String(ex.id), {
        correct,
        answer: userAnswer,
      });
      progressState.doneIds.add(String(ex.id));

      setResultText(resultEl, correct);
      if (correct) {
        await clearMistakeLogForExercise(ex.id);
      } else {
        await appendMistakeLog(ex, userAnswer, expectedAnswerPreview(ex));
      }
      await saveProgress();
      setProgressUI();
      if (IMMERSIVE_MODE) onImmersiveExerciseDone(ex.id);
    });

    actions.appendChild(btnCheck);
    card.appendChild(actions);
    card.appendChild(resultEl);

    const prev = progressState.testResults.get(String(ex.id));
    if (prev) {
      setResultText(resultEl, prev.correct === true);
    }
  } else {
    const exId = String(ex.id);
    const done = progressState.doneIds.has(exId);

    const markDone = async () => {
      progressState.doneIds.add(exId);
      await clearMistakeLogForExercise(exId);
      await saveProgress();
      setProgressUI();
      if (IMMERSIVE_MODE) onImmersiveExerciseDone(exId);
    };

    const markWrong = async (userAnswer = '', expectedAnswer = '') => {
      await appendMistakeLog(ex, userAnswer, expectedAnswer);
    };

    if (isCardsExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Este ejercicio crea fichas. Usa el modo Fichas para practicar.';
      card.appendChild(hint);

      const params = `level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(currentTopic?.id || TOPIC_ID)}`;
      const open = document.createElement('a');
      open.className = 'btn-white-outline';
      open.href = `flashcards.html?${params}`;
      open.textContent = 'Abrir fichas';
      actions.appendChild(open);

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-white-outline';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;
      btnDone.addEventListener('click', async () => {
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
      });

      actions.appendChild(btnDone);
      card.appendChild(actions);
      return card;
    }

    if (isSceneExercise(ex) && options.length && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Mikro-scenka: wybierz najlepsza reakcje.';
      card.appendChild(hint);

      const scenario = document.createElement('div');
      scenario.className = 'exerciseSceneBox';
      scenario.textContent = String(ex.prompt || '').trim();
      card.appendChild(scenario);

      let selectedValue = '';
      let selectedLabel = '';
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `scene_${ex.id}`;

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: `${label}) ${cleaned || opt}`,
          checked: false,
          onChange: (ev) => {
            selectedValue = String(ev.target.value || '');
            selectedLabel = label;
          },
          ttsText: cleaned || opt,
        });
        if (done) {
          const input = row.querySelector('input');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsluchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsluchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;
      btnCheck.addEventListener('click', async () => {
        if (done) return;
        if (!selectedValue) {
          showToast('Wybierz odpowiedz.', 'warn', 1800);
          return;
        }
        const answers = parseAnswerList(ex.answer || '');
        const answerNorms = answers.map((a) => normalizeText(a));
        const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
        const userNorm = normalizeText(selectedValue);
        const labelNorm = normalizeText(selectedLabel || '');
        const ok =
          answerNorms.includes(userNorm) ||
          answerNormsClean.includes(userNorm) ||
          (labelNorm && (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm)));

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'Nie, sproboj ponownie.');
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(selectedValue, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
        optsWrap.querySelectorAll('input[type="radio"]').forEach((i) => (i.disabled = true));
      });
      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }
      return card;
    }

    if (isFindErrorExercise(ex) && options.length && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Znajdz blad i wybierz poprawna wersje zdania.';
      card.appendChild(hint);

      const wrong = document.createElement('div');
      wrong.className = 'exerciseErrorBox';
      wrong.textContent = `Zdanie: ${String(ex.prompt || '').trim()}`;
      card.appendChild(wrong);

      let selectedValue = '';
      let selectedLabel = '';
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `fix_${ex.id}`;

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: `${label}) ${cleaned || opt}`,
          checked: false,
          onChange: (ev) => {
            selectedValue = String(ev.target.value || '');
            selectedLabel = label;
          },
          ttsText: cleaned || opt,
        });
        if (done) {
          const input = row.querySelector('input');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;
      btnCheck.addEventListener('click', async () => {
        if (done) return;
        if (!selectedValue) {
          showToast('Wybierz poprawna opcje.', 'warn', 1800);
          return;
        }
        const answers = parseAnswerList(ex.answer || '');
        const answerNorms = answers.map((a) => normalizeText(a));
        const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
        const userNorm = normalizeText(selectedValue);
        const labelNorm = normalizeText(selectedLabel || '');
        const ok =
          answerNorms.includes(userNorm) ||
          answerNormsClean.includes(userNorm) ||
          (labelNorm && (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm)));

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'Nie, to nie ta poprawka.');
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(selectedValue, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
        optsWrap.querySelectorAll('input[type="radio"]').forEach((i) => (i.disabled = true));
      });
      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }
      return card;
    }

    if (isSpeakingExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Lee en voz alta. Escucha y luego graba tu voz.';
      card.appendChild(hint);

      const checklist = [
        'Tempo i pauzy sa naturalne.',
        'Koncowki i odmiana brzmia poprawnie.',
        'Akcent w slowach jest poprawny.',
      ];
      const checkWrap = document.createElement('div');
      checkWrap.className = 'exercisePronChecklist';
      const checkInputs = [];
      checklist.forEach((label) => {
        const row = document.createElement('label');
        row.className = 'exercisePronRow';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.disabled = done;
        const span = document.createElement('span');
        span.textContent = label;
        row.appendChild(input);
        row.appendChild(span);
        checkInputs.push(input);
        checkWrap.appendChild(row);
      });
      card.appendChild(checkWrap);

      const canRec = canRecordVoice();
      let recording = false;
      let recorder = null;
      let stream = null;
      let chunks = [];
      let objectUrl = '';
      let hasAudio = false;

      const btnListen = document.createElement('button');
      btnListen.className = 'ttsIconBtn';
      btnListen.type = 'button';
      btnListen.textContent = SPEAKER_ICON;
      btnListen.title = 'Odsłuchaj (PL)';
      btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
      btnListen.addEventListener('click', () => playExerciseAudio(ex));

      const btnRec = document.createElement('button');
      btnRec.className = 'btn-white-outline';
      btnRec.type = 'button';
      btnRec.textContent = 'Grabar voz';
      btnRec.disabled = done || !canRec;

      const btnClear = document.createElement('button');
      btnClear.className = 'btn-white-outline';
      btnClear.type = 'button';
      btnClear.textContent = 'Quitar voz';
      btnClear.style.display = 'none';
      btnClear.disabled = done;

      const audio = document.createElement('audio');
      audio.controls = true;
      audio.className = 'exerciseAudioPreview';
      audio.style.display = 'none';

      const cleanup = () => {
        try {
          stream?.getTracks?.()?.forEach((t) => t.stop());
        } catch {}
        stream = null;
        recorder = null;
        chunks = [];
        recording = false;
      };

      const clearAudio = () => {
        hasAudio = false;
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
        }
        objectUrl = '';
        try {
          audio.pause?.();
        } catch {}
        audio.removeAttribute('src');
        audio.style.display = 'none';
        btnClear.style.display = 'none';
      };

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-yellow';
      btnDone.type = 'button';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;

      btnDone.addEventListener('click', async () => {
        if (!done) {
          const allChecked = checkInputs.every((i) => i.checked);
          if (!allChecked) {
            showToast('Zaznacz checklistę wymowy przed zapisaniem.', 'warn', 2100);
            return;
          }
        }
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
        btnRec.disabled = true;
        btnClear.disabled = true;
        checkInputs.forEach((i) => {
          i.checked = true;
          i.disabled = true;
        });
        cleanup();
      });

      btnClear.addEventListener('click', () => {
        if (done) return;
        clearAudio();
      });

      btnRec.addEventListener('click', async () => {
        if (done) return;
        if (!canRec) {
          showToast('Tu navegador no soporta grabación.', 'warn', 2200);
          return;
        }

        if (recording) {
          try {
            recorder?.stop();
          } catch {}
          return;
        }

        try {
          clearAudio();
          cleanup();

          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          recorder = new MediaRecorder(stream);
          chunks = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
          };

          recorder.onstop = () => {
            recording = false;
            btnRec.textContent = 'Grabar voz';

            const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
            objectUrl = URL.createObjectURL(blob);
            audio.src = objectUrl;
            audio.style.display = 'block';
            btnClear.style.display = '';
            hasAudio = true;
            btnDone.disabled = false;

            cleanup();
          };

          recorder.start();
          recording = true;
          btnRec.textContent = 'Detener';
        } catch (e) {
          console.warn('[speaking] record failed', e);
          cleanup();
          showToast('No se pudo grabar.', 'bad', 2400);
        }
      });

      if (!canRec) {
        const warn = document.createElement('div');
        warn.className = 'hintSmall';
        warn.style.marginTop = '8px';
        warn.textContent = 'Grabación no disponible en este navegador.';
        card.appendChild(warn);
        btnDone.disabled = done;
      }

      actions.appendChild(btnListen);
      actions.appendChild(btnRec);
      actions.appendChild(btnClear);
      actions.appendChild(btnDone);
      card.appendChild(actions);
      card.appendChild(audio);

      if (done) {
        checkInputs.forEach((i) => {
          i.checked = true;
          i.disabled = true;
        });
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isBinaryTrueFalseExercise(ex) && String(ex.answer || '').trim()) {
      const tfOptionsRaw = options.length ? options : ['true', 'false'];
      const tfOptions = tfOptionsRaw
        .map((opt, idx) => ({
          idx,
          label: optionLabelFromIndex(idx),
          value: cleanOptionText(opt) || String(opt || '').trim(),
        }))
        .filter((x) => x.value);

      let selectedIdx = -1;
      let selectedValue = '';

      const grid = document.createElement('div');
      grid.className = 'exerciseBinaryGrid';

      const renderSelection = () => {
        grid.querySelectorAll('.exerciseBinaryBtn').forEach((btn) => {
          const idx = Number(btn.getAttribute('data-idx') || -1);
          btn.classList.toggle('isSelected', idx === selectedIdx);
        });
      };

      tfOptions.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-white-outline exerciseBinaryBtn';
        btn.setAttribute('data-idx', String(opt.idx));
        btn.innerHTML = `<span>${safeText(opt.value)}</span>`;
        if (done) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (done) return;
          selectedIdx = opt.idx;
          selectedValue = opt.value;
          renderSelection();
        });
        grid.appendChild(btn);
      });
      card.appendChild(grid);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsluchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsluchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        if (selectedIdx < 0 || !selectedValue) {
          showToast('Elige una opcion.', 'warn', 1800);
          return;
        }

        const expectedBool = parseBooleanToken(ex.answer || '');
        let correct = false;

        if (expectedBool !== null) {
          const gotBool = parseBooleanToken(selectedValue);
          correct = gotBool !== null && gotBool === expectedBool;
        } else {
          const answers = parseAnswerList(ex.answer || '');
          const answerNorms = answers.map((a) => normalizeText(a));
          const userNorm = normalizeText(selectedValue);
          const labelNorm = normalizeText(optionLabelFromIndex(selectedIdx));
          correct = answerNorms.includes(userNorm) || answerNorms.includes(labelNorm);
        }

        setResultText(resultEl, correct, correct ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);
        if (!correct) {
          await markWrong(selectedValue, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
        grid.querySelectorAll('.exerciseBinaryBtn').forEach((b) => (b.disabled = true));
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isDictationExercise(ex) && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Escucha el audio y escribe exactamente lo que oyes.';
      card.appendChild(hint);

      const box = document.createElement('textarea');
      box.className = 'input';
      box.rows = 3;
      box.placeholder = 'Escribe el dictado aqui...';
      box.autocomplete = 'off';
      box.spellcheck = false;
      box.disabled = done;
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);

      const btnListen = document.createElement('button');
      btnListen.className = 'ttsIconBtn';
      btnListen.type = 'button';
      btnListen.textContent = SPEAKER_ICON;
      btnListen.title = 'Odsluchaj (PL)';
      btnListen.setAttribute('aria-label', 'Odsluchaj (PL)');
      btnListen.addEventListener('click', () => playExerciseAudio(ex));
      actions.appendChild(btnListen);

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const val = String(box.value || '').trim();
        if (!val) {
          showToast('Escribe lo que escuchaste.', 'warn', 1800);
          return;
        }

        const expected = String(ex.answer || '').trim();
        const exact =
          normalizeDictationText(val) === normalizeDictationText(expected);
        const score = dictationSimilarity(val, expected);
        const ok = exact || score >= 88;

        setResultText(
          resultEl,
          ok,
          ok ? `Correcto (${score}%).` : `No coincide (${score}%). Intenta de nuevo.`,
        );
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(val, expected);
          return;
        }

        box.disabled = true;
        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isDragDropExercise(ex) && options.length && String(ex.answer || '').trim()) {
      const promptText = String(ex.prompt || '');
      const parts = promptText.split('___');
      const blankCount = parts.length - 1;
      if (blankCount > 0) {
        const tokenList = shuffleArray(
          options
            .map((o, idx) => ({
              id: String(idx),
              text: stripLeadLabel(o) || String(o || '').trim(),
            }))
            .filter((t) => t.text),
        );

        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blankCount);
        const selected = Array.from({ length: blankCount }, () => null);

        const wrap = document.createElement('div');
        wrap.className = 'exerciseDragWrap';

        const promptWrap = document.createElement('div');
        promptWrap.className = 'exerciseDragPrompt';

        const bank = document.createElement('div');
        bank.className = 'exerciseDragBank';

        const tokenById = new Map(tokenList.map((t) => [t.id, t]));

        const assignedIdSet = () => {
          const ids = new Set();
          selected.forEach((sid) => {
            if (sid !== null && sid !== undefined) ids.add(String(sid));
          });
          return ids;
        };

        const findBlankByToken = (tokenId) => selected.findIndex((x) => String(x) === String(tokenId));

        const assignToken = (blankIdx, tokenId) => {
          if (done) return;
          const prevBlank = findBlankByToken(tokenId);
          if (prevBlank >= 0) selected[prevBlank] = null;
          selected[blankIdx] = String(tokenId);
          render();
        };

        const render = () => {
          const usedIds = assignedIdSet();
          promptWrap.innerHTML = '';

          parts.forEach((part, idx) => {
            const txt = document.createElement('span');
            txt.textContent = part;
            promptWrap.appendChild(txt);

            if (idx >= blankCount) return;

            const blank = document.createElement('button');
            blank.type = 'button';
            blank.className = 'exerciseDropBlank';
            blank.disabled = done;

            const sid = selected[idx];
            const token = sid !== null ? tokenById.get(String(sid)) : null;
            blank.textContent = token?.text || '...';
            blank.classList.toggle('isFilled', !!token);

            blank.addEventListener('click', () => {
              if (done) return;
              if (selected[idx] !== null) {
                selected[idx] = null;
                render();
              }
            });
            blank.addEventListener('dragover', (ev) => {
              if (done) return;
              ev.preventDefault();
              blank.classList.add('dragOver');
            });
            blank.addEventListener('dragleave', () => blank.classList.remove('dragOver'));
            blank.addEventListener('drop', (ev) => {
              if (done) return;
              ev.preventDefault();
              blank.classList.remove('dragOver');
              const tokenId = String(ev.dataTransfer?.getData('text/plain') || '').trim();
              if (!tokenId || !tokenById.has(tokenId)) return;
              assignToken(idx, tokenId);
            });

            promptWrap.appendChild(blank);
          });

          bank.innerHTML = '';
          tokenList.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-white-outline exerciseDragToken';
            btn.textContent = t.text;
            const used = usedIds.has(String(t.id));
            btn.disabled = done || used;
            btn.draggable = !done && !used;
            btn.addEventListener('dragstart', (ev) => {
              ev.dataTransfer?.setData('text/plain', String(t.id));
              ev.dataTransfer.effectAllowed = 'move';
            });
            btn.addEventListener('click', () => {
              if (done || used) return;
              const emptyIdx = selected.findIndex((x) => x === null);
              if (emptyIdx < 0) {
                showToast('Quita una palabra para reemplazarla.', 'warn', 1700);
                return;
              }
              assignToken(emptyIdx, t.id);
            });
            bank.appendChild(btn);
          });
        };

        const hint = document.createElement('div');
        hint.className = 'exerciseHint';
        hint.textContent = 'Arrastra palabras a los huecos o toca una palabra para insertarla.';
        wrap.appendChild(hint);
        wrap.appendChild(promptWrap);

        const bankLabel = document.createElement('div');
        bankLabel.className = 'exerciseHint';
        bankLabel.style.marginTop = '10px';
        bankLabel.textContent = 'Banco de palabras:';
        wrap.appendChild(bankLabel);
        wrap.appendChild(bank);
        card.appendChild(wrap);

        const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
        if (wantsListen) {
          const btnListen = document.createElement('button');
          btnListen.className = 'ttsIconBtn';
          btnListen.type = 'button';
          btnListen.textContent = SPEAKER_ICON;
          btnListen.title = 'Odsluchaj (PL)';
          btnListen.setAttribute('aria-label', 'Odsluchaj (PL)');
          btnListen.addEventListener('click', () => playExerciseAudio(ex));
          actions.appendChild(btnListen);
        }

        const btnCheck = document.createElement('button');
        btnCheck.className = 'btn-yellow';
        btnCheck.type = 'button';
        btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
        btnCheck.disabled = done;

        btnCheck.addEventListener('click', async () => {
          if (done) return;
          if (selected.some((sid) => sid === null)) {
            showToast('Completa todos los huecos.', 'warn', 1800);
            return;
          }

          let ok = true;
          for (let i = 0; i < blankCount; i += 1) {
            const sid = selected[i];
            const token = sid !== null ? tokenById.get(String(sid)) : null;
            const got = normalizeText(token?.text || '');
            const accepted = (expectedByBlank[i] || expectedByBlank[0] || []).map((x) =>
              normalizeText(x),
            );
            if (!accepted.includes(got)) {
              ok = false;
              break;
            }
          }

          const userSlots = selected.map((sid) => {
            if (sid === null || sid === undefined) return '';
            const token = tokenById.get(String(sid));
            return String(token?.text || '').trim();
          });
          setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
          card.appendChild(resultEl);
          if (!ok) {
            await markWrong(userSlots.join(' | '), ex.answer || '');
            return;
          }

          await markDone();
          btnCheck.textContent = 'Hecho';
          btnCheck.disabled = true;
          render();
        });

        actions.appendChild(btnCheck);
        card.appendChild(actions);

        if (done) {
          setResultText(resultEl, true, 'Hecho.');
          card.appendChild(resultEl);
        }

        render();
        return card;
      }
    }

    if (isChoiceExercise(ex) && options.length && String(ex.answer || '').trim()) {
      let selectedValue = '';
      let selectedLabel = '';

      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `pr_${ex.id}`;
      const speakOptions = shouldSpeakChoiceOptions(ex, options);

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const optionText = cleaned ? `${label}) ${cleaned}` : `${label}) ${opt}`;
        const ttsText = speakOptions ? (cleaned || stripLeadLabel(opt)) : '';
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: optionText,
          checked: false,
          onChange: (ev) => {
            selectedValue = ev.target.value;
            selectedLabel = label;
          },
          ttsText,
        });
        if (done) {
          const input = row.querySelector('input[type="radio"]');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const userAnswer = String(selectedValue || '').trim();
        if (!userAnswer) {
          showToast('Elige una respuesta.', 'warn', 1800);
          return;
        }

        const answers = parseAnswerList(ex.answer || '');
        const answerNorms = answers.map((a) => normalizeText(a));
        const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
        const userNorm = normalizeText(userAnswer);
        const labelNorm = normalizeText(selectedLabel || '');

        let correct = false;
        if (answerNorms.includes(userNorm) || answerNormsClean.includes(userNorm)) correct = true;
        if (
          !correct &&
          labelNorm &&
          (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm))
        ) {
          correct = true;
        }

        setResultText(resultEl, correct, correct ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);

        if (!correct) {
          await markWrong(userAnswer, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
        optsWrap.querySelectorAll('input[type="radio"]').forEach((i) => (i.disabled = true));
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isFillExercise(ex) && String(ex.answer || '').trim()) {
      const promptText = String(ex.prompt || '');
      const blankInputs = [];
      let inputBox = null;

      if (promptText.includes('___')) {
        prompt.textContent = '';
        const parts = promptText.split('___');
        parts.forEach((part, idx) => {
          prompt.appendChild(document.createTextNode(part));
          if (idx === parts.length - 1) return;

          const inp = document.createElement('input');
          inp.className = 'exerciseInlineInput';
          inp.type = 'text';
          inp.placeholder = '...';
          inp.autocomplete = 'off';
          inp.spellcheck = false;
          inp.disabled = done;
          blankInputs.push(inp);
          prompt.appendChild(inp);
        });
      } else {
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.placeholder = 'Escribe tu respuesta...';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.disabled = done;
        inputBox = inp;
        blankInputs.push(inp);
        answerWrap.appendChild(inp);
        card.appendChild(answerWrap);
      }

      const ttsPrompt = String(promptText || '').replaceAll('___', '...').trim();
      const promptSpeakBtn = makeSpeakerBtn(ttsPrompt, { title: 'Odsłuchaj zdanie (PL)', tiny: true });
      if (promptSpeakBtn) {
        promptSpeakBtn.style.marginLeft = '8px';
        prompt.appendChild(promptSpeakBtn);
      }

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const blanksCount = blankInputs.length || 1;
        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blanksCount);
        const values = blankInputs.map((i) => String(i.value || '').trim());

        if (values.some((v) => !v)) {
          showToast('Completa los espacios.', 'warn', 1800);
          return;
        }

        let ok = true;
        for (let i = 0; i < values.length; i += 1) {
          const accepted = expectedByBlank[i] || expectedByBlank[0] || [];
          const u = normalizeText(values[i]);
          const acc = accepted.map((x) => normalizeText(x));
          if (!acc.includes(u)) {
            ok = false;
            break;
          }
        }

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);

        if (!ok) {
          await markWrong(values.join(' | '), ex.answer || '');
          return;
        }

        blankInputs.forEach((i) => (i.disabled = true));
        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isMatchingExercise(ex) && options.length) {
      const parsed = parseMatchPairs(options, ex.answer || '');
      if (!parsed) {
        // If we can't parse it, fall back to the simple done button below.
      } else {
        const leftItems = parsed.left;
        const rightItems = parsed.right;
        const correctMap = parsed.correctMap || {};

        let selectedLeft = '';
        let locked = done;
        const userMap = {}; // leftLabel -> rightLabel
        const rightToLeft = {}; // rightLabel -> leftLabel

        const grid = document.createElement('div');
        grid.className = 'exerciseMatchGrid';

        const colLeft = document.createElement('div');
        colLeft.className = 'exerciseMatchCol';
        const colRight = document.createElement('div');
        colRight.className = 'exerciseMatchCol';

        const leftBtns = new Map();
        const rightBtns = new Map();

        const renderState = () => {
          leftBtns.forEach((btn, label) => {
            const paired = userMap[label] || '';
            const isSelected = selectedLeft === label;
            btn.classList.toggle('isSelected', isSelected);
            btn.classList.toggle('isPaired', !!paired);
            const badge = btn.querySelector('.exerciseMatchBadge');
            if (badge) badge.textContent = paired ? `→ ${paired}` : '';
          });
          rightBtns.forEach((btn, label) => {
            const usedBy = rightToLeft[label] || '';
            btn.classList.toggle('isPaired', !!usedBy);
          });
        };

        const assignPair = (leftLabel, rightLabel) => {
          if (!leftLabel || !rightLabel) return;

          const prevRight = userMap[leftLabel] || '';
          if (prevRight && rightToLeft[prevRight] === leftLabel) {
            delete rightToLeft[prevRight];
          }

          const prevLeft = rightToLeft[rightLabel] || '';
          if (prevLeft && userMap[prevLeft] === rightLabel) {
            delete userMap[prevLeft];
          }

          userMap[leftLabel] = rightLabel;
          rightToLeft[rightLabel] = leftLabel;
          renderState();
        };

        const resetPairs = () => {
          selectedLeft = '';
          Object.keys(userMap).forEach((k) => delete userMap[k]);
          Object.keys(rightToLeft).forEach((k) => delete rightToLeft[k]);
          renderState();
        };

        leftItems.forEach((it) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-white-outline exerciseMatchBtn';
          btn.disabled = false;
          btn.innerHTML = `
            <div class="exerciseMatchBtnTop">
              <span class="exerciseMatchLabel">${safeText(it.label)})</span>
              <span class="exerciseMatchTools">
                <span class="exerciseMatchBadge"></span>
                <span class="ttsInlineIcon" role="button" tabindex="0" title="Odsłuchaj (PL)" aria-label="Odsłuchaj (PL)">${SPEAKER_ICON}</span>
              </span>
            </div>
            <div class="exerciseMatchText">${safeText(it.text)}</div>
          `;
          wireInlineSpeaker(btn.querySelector('.ttsInlineIcon'), it.text);
          btn.addEventListener('click', () => {
            if (locked) return;
            selectedLeft = selectedLeft === it.label ? '' : it.label;
            renderState();
          });
          leftBtns.set(it.label, btn);
          colLeft.appendChild(btn);
        });

        rightItems.forEach((it) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-white-outline exerciseMatchBtn';
          btn.disabled = false;
          btn.innerHTML = `
            <div class="exerciseMatchBtnTop">
              <span class="exerciseMatchLabel">${safeText(it.label)})</span>
            </div>
            <div class="exerciseMatchText">${safeText(it.text)}</div>
          `;
          btn.addEventListener('click', () => {
            if (locked) return;
            if (!selectedLeft) {
              showToast('Elige un elemento de la izquierda.', 'warn', 1600);
              return;
            }
            assignPair(selectedLeft, it.label);
            selectedLeft = '';
            renderState();
          });
          rightBtns.set(it.label, btn);
          colRight.appendChild(btn);
        });

        grid.appendChild(colLeft);
        grid.appendChild(colRight);
        card.appendChild(grid);

        const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
        if (wantsListen) {
          const btnListen = document.createElement('button');
          btnListen.className = 'ttsIconBtn';
          btnListen.type = 'button';
          btnListen.textContent = SPEAKER_ICON;
          btnListen.title = 'Odsłuchaj (PL)';
          btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
          btnListen.addEventListener('click', () => playExerciseAudio(ex));
          actions.appendChild(btnListen);
        }

        const btnReset = document.createElement('button');
        btnReset.className = 'btn-white-outline';
        btnReset.type = 'button';
        btnReset.textContent = 'Reiniciar';
        btnReset.disabled = done;
        btnReset.addEventListener('click', resetPairs);
        actions.appendChild(btnReset);

        const btnCheck = document.createElement('button');
        btnCheck.className = 'btn-yellow';
        btnCheck.type = 'button';
        btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
        btnCheck.disabled = done;

        btnCheck.addEventListener('click', async () => {
          if (locked) return;
          const needs = leftItems.length;
          const picked = Object.keys(userMap).length;
          if (picked < needs) {
            showToast('Completa todas las parejas.', 'warn', 1800);
            return;
          }

          let ok = true;
          for (const it of leftItems) {
            const expected = String(correctMap[it.label] || '').trim();
            const got = String(userMap[it.label] || '').trim();
            if (!expected || expected !== got) {
              ok = false;
              break;
            }
          }

          setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
          card.appendChild(resultEl);
          if (!ok) {
            const pickedPairs = Object.keys(userMap)
              .sort()
              .map((label) => `${label}-${userMap[label]}`)
              .join(', ');
            await markWrong(pickedPairs, ex.answer || '');
            return;
          }

          locked = true;
          await markDone();
          btnCheck.textContent = 'Hecho';
          btnCheck.disabled = true;
          btnReset.disabled = true;
        });

        actions.appendChild(btnCheck);
        card.appendChild(actions);

        if (done) {
          setResultText(resultEl, true, 'Hecho.');
          card.appendChild(resultEl);
        } else {
          renderState();
        }

        return card;
      }
    }

    if (isOrderingExercise(ex) && options.length && String(ex.answer || '').trim()) {
      const rawTokens = options.map((o) => stripLeadLabel(o)).filter(Boolean);
      if (!rawTokens.length) {
        // fall back below
      } else {
        const tokens = shuffleArray(rawTokens.map((t, idx) => ({ id: String(idx), text: t })));
        const selected = [];
        const available = new Map(tokens.map((t) => [t.id, t]));

        const wrap = document.createElement('div');
        wrap.className = 'exerciseOrderWrap';

        const built = document.createElement('div');
        built.className = 'exerciseOrderBuilt';
        built.textContent = '';

        const bank = document.createElement('div');
        bank.className = 'exerciseOrderBank';

        const render = () => {
          const sentence = selected.map((t) => t.text).join(' ').replace(/\s+([?.!,;:])/g, '$1');
          built.innerHTML = '';
          const builtText = document.createElement('span');
          builtText.textContent = sentence || '—';
          built.appendChild(builtText);
          if (sentence) {
            const speakBtn = makeSpeakerBtn(sentence, { title: 'Odsłuchaj zdanie (PL)', tiny: true });
            if (speakBtn) {
              speakBtn.style.marginLeft = '8px';
              built.appendChild(speakBtn);
            }
          }

          bank.innerHTML = '';
          tokens.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-white-outline exerciseOrderToken';
            btn.innerHTML = '';
            const tokenText = document.createElement('span');
            tokenText.textContent = t.text;
            btn.appendChild(tokenText);
            const sp = document.createElement('span');
            sp.className = 'ttsInlineIcon';
            sp.setAttribute('role', 'button');
            sp.setAttribute('tabindex', '0');
            sp.title = 'Odsłuchaj (PL)';
            sp.setAttribute('aria-label', 'Odsłuchaj (PL)');
            sp.textContent = SPEAKER_ICON;
            wireInlineSpeaker(sp, t.text);
            btn.appendChild(sp);

            const isAvailable = available.has(t.id);
            btn.classList.toggle('isDisabled', done || !isAvailable);
            btn.addEventListener('click', () => {
              if (done) return;
              if (!available.has(t.id)) return;
              available.delete(t.id);
              selected.push(t);
              render();
            });
            bank.appendChild(btn);
          });
        };

        const reset = () => {
          if (done) return;
          selected.length = 0;
          available.clear();
          tokens.forEach((t) => available.set(t.id, t));
          render();
        };

        const undo = () => {
          if (done) return;
          const last = selected.pop();
          if (last) available.set(last.id, last);
          render();
        };

        const labelBuilt = document.createElement('div');
        labelBuilt.className = 'exerciseHint';
        labelBuilt.textContent = 'Construye la frase:';
        wrap.appendChild(labelBuilt);
        wrap.appendChild(built);

        const labelBank = document.createElement('div');
        labelBank.className = 'exerciseHint';
        labelBank.style.marginTop = '10px';
        labelBank.textContent = 'Palabras:';
        wrap.appendChild(labelBank);
        wrap.appendChild(bank);

        card.appendChild(wrap);

        const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
        if (wantsListen) {
          const btnListen = document.createElement('button');
          btnListen.className = 'ttsIconBtn';
          btnListen.type = 'button';
          btnListen.textContent = SPEAKER_ICON;
          btnListen.title = 'Odsłuchaj (PL)';
          btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
          btnListen.addEventListener('click', () => playExerciseAudio(ex));
          actions.appendChild(btnListen);
        }

        const btnUndo = document.createElement('button');
        btnUndo.className = 'btn-white-outline';
        btnUndo.type = 'button';
        btnUndo.textContent = 'Borrar \u00faltima';
        btnUndo.disabled = done;
        btnUndo.addEventListener('click', undo);
        actions.appendChild(btnUndo);

        const btnReset = document.createElement('button');
        btnReset.className = 'btn-white-outline';
        btnReset.type = 'button';
        btnReset.textContent = 'Reiniciar';
        btnReset.disabled = done;
        btnReset.addEventListener('click', reset);
        actions.appendChild(btnReset);

        const btnCheck = document.createElement('button');
        btnCheck.className = 'btn-yellow';
        btnCheck.type = 'button';
        btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
        btnCheck.disabled = done;

        btnCheck.addEventListener('click', async () => {
          if (done) return;
          if (!selected.length) {
            showToast('Ordena la frase primero.', 'warn', 1800);
            return;
          }
          const sentence = selected.map((t) => t.text).join(' ').replace(/\s+([?.!,;:])/g, '$1');
          const accepted = parseAnswerList(ex.answer || '').map((x) => normalizeText(x));
          const got = normalizeText(sentence);
          const ok = accepted.length ? accepted.includes(got) : got === normalizeText(ex.answer || '');

          setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
          card.appendChild(resultEl);
          if (!ok) {
            await markWrong(sentence, ex.answer || '');
            return;
          }

          await markDone();
          btnCheck.textContent = 'Hecho';
          btnCheck.disabled = true;
          btnUndo.disabled = true;
          btnReset.disabled = true;
          render();
        });

        actions.appendChild(btnCheck);
        card.appendChild(actions);

        if (done) {
          setResultText(resultEl, true, 'Hecho.');
          card.appendChild(resultEl);
        }

        render();
        return card;
      }
    }

    if (isWritingExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Escribe tu respuesta. Luego marca hecho.';
      card.appendChild(hint);

      const box = document.createElement('textarea');
      box.className = 'input';
      box.rows = 3;
      box.placeholder = 'Escribe aquí...';
      box.autocomplete = 'off';
      box.spellcheck = true;
      box.disabled = done;
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-yellow';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;

      btnDone.addEventListener('click', async () => {
        if (done) return;
        const val = String(box.value || '').trim();
        if (!val) {
          showToast('Escribe una respuesta primero.', 'warn', 1800);
          return;
        }
        box.disabled = true;
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      });

      actions.appendChild(btnDone);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    // fallback: simple done
    const btnDone = document.createElement('button');
    btnDone.className = 'btn-white-outline';
    btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
    btnDone.disabled = done;

    btnDone.addEventListener('click', async () => {
      await markDone();
      btnDone.textContent = 'Hecho';
      btnDone.disabled = true;
    });

    actions.appendChild(btnDone);
    card.appendChild(actions);
  }

  return card;
}

function renderExercises() {
  if (!exerciseList) return;

  exerciseList.innerHTML = '';
  setTaskChips(cachedExercises.length);

  if (IMMERSIVE_MODE) {
    renderImmersiveMode();
    setProgressUI();
    return;
  }

  if (!VIEW_EXERCISES.length) {
    emptyExercises.style.display = 'block';
    return;
  }

  emptyExercises.style.display = 'none';
  VIEW_EXERCISES.forEach((ex) => {
    exerciseList.appendChild(makeExerciseCard(ex));
  });

  setProgressUI();
}

async function loadTopic() {
  if (TOPIC_ID) {
    const snap = await getDoc(doc(db, 'courses', TOPIC_ID));
    if (!snap.exists()) return null;
    const topic = { id: snap.id, ...(snap.data() || {}) };
    return topic;
  }

  if (SLUG) {
    const q = query(
      collection(db, 'courses'),
      where('level', '==', LEVEL),
      where('slug', '==', SLUG),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() || {}) };
  }

  return null;
}

async function loadExercises(topic) {
  exerciseList.innerHTML = '';
  emptyExercises.style.display = 'none';
  cachedExercises = [];
  immersiveIndex = 0;
  immersiveHasInitialFocus = false;

  CURRENT_TOPIC_KEY = topicKeyFrom(topic);

  let qEx = query(
    collection(db, 'exercises'),
    where('level', '==', LEVEL),
    where('topicId', '==', topic.id),
    orderBy('order'),
  );

  let snap = null;
  try {
    snap = await getDocs(qEx);
  } catch (e) {
    try {
      qEx = query(
        collection(db, 'exercises'),
        where('level', '==', LEVEL),
        where('topicSlug', '==', String(topic.slug || topic.id)),
        orderBy('order'),
      );
      snap = await getDocs(qEx);
    } catch (e2) {
      console.error(e2);
      snap = null;
    }
  }

  if (!snap) {
    showClassicListSection();
    emptyExercises.style.display = 'block';
    emptyExercises.textContent = 'No se pudo cargar ejercicios.';
    return;
  }

  snap.forEach((d) => {
    const data = d.data() || {};
    cachedExercises.push({ id: d.id, ...data });
  });

  await loadProgressForTopic(CURRENT_UID);

  VIEW_EXERCISES = cachedExercises.slice();
  buildTypeFilterOptions();
  buildTagFilterOptions();
  applyFilters();
}

async function getUserFlags(uid, email) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return {
        isAdmin: false,
        blocked: false,
        hasAccess: false,
        hasGlobalAccess: false,
        isUntilValid: false,
        levels: [],
      };
    }

    const d = snap.data() || {};
    const isAdmin = isAdminUser(d, email || auth.currentUser?.email);
    const blocked = d.blocked === true;
    if (isAdmin) {
      return {
        isAdmin: true,
        blocked: false,
        hasAccess: true,
        hasGlobalAccess: true,
        isUntilValid: true,
        levels: [],
      };
    }
    if (blocked) {
      return {
        isAdmin: false,
        blocked: true,
        hasAccess: false,
        hasGlobalAccess: false,
        isUntilValid: false,
        levels: [],
      };
    }

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

    return {
      isAdmin: false,
      blocked: false,
      hasAccess,
      hasGlobalAccess,
      isUntilValid,
      levels,
    };
  } catch (e) {
    console.warn('[ejercicio] getUserFlags failed', e);
    return {
      isAdmin: false,
      blocked: false,
      hasAccess: false,
      hasGlobalAccess: false,
      isUntilValid: false,
      levels: [],
    };
  }
}

async function computeHasAccess(uid) {
  const flags = await getUserFlags(uid, auth.currentUser?.email);
  return flags.hasAccess === true;
}

function showAccessLocked() {
  try {
    showClassicListSection();
    if (exerciseList) exerciseList.innerHTML = '';
    if (emptyExercises) {
      emptyExercises.style.display = 'block';
      emptyExercises.innerHTML = `
        <div style="padding:14px 14px; line-height:1.6;">
          <b>Acceso premium</b><br/>
          Para ver ejercicios necesitas acceso.<br/>
          Ve al <a href="services.html" style="text-decoration:underline;">Panel</a> para aplicar un codigo o activar el plan.
        </div>
      `;
    }
  } catch {}
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

function showFinishModal(stats) {
  const modal = document.getElementById('finishModal');
  if (!modal) return;
  const topicLevel = topicLevelOf(currentTopic, LEVEL);
  const checkpointBoundary =
    CONTINUOUS_FLOW &&
    Number.isFinite(CURRENT_ROUTE_INDEX) &&
    CURRENT_ROUTE_INDEX >= 0 &&
    (CURRENT_ROUTE_INDEX + 1) % 3 === 0;
  const checkpointNo = checkpointBoundary ? Math.floor((CURRENT_ROUTE_INDEX + 1) / 3) : 0;

  const txt = document.getElementById('finishText');
  if (txt) {
    const exerciseLine = stats.totalPractice
      ? `Ejercicios: ${stats.donePractice}/${stats.totalPractice}.`
      : 'Ejercicios completados.';
    const testLine = stats.testTotal
      ? `Test: ${stats.testScore}%.`
      : 'Test completado.';
    if (stats.completed) {
      if (checkpointBoundary) {
        txt.textContent = `${exerciseLine} ${testLine} Swietnie. Teraz zrob mini-test checkpoint ${checkpointNo}, aby odblokowac kolejne 3 moduly.`;
      } else {
        txt.textContent = `${exerciseLine} ${testLine}`;
      }
    } else if (CONTINUOUS_FLOW) {
      txt.textContent = `${exerciseLine} ${testLine} Powtorka wymagana: potrzebujesz 100% praktyki i 100% testu, aby odblokowac kolejny modul.`;
    } else {
      txt.textContent = `${exerciseLine} ${testLine} Aun faltan ejercicios por completar.`;
    }
  }

  const btnLesson = document.getElementById('btnFinishLesson');
  const btnCourse = document.getElementById('btnFinishCourse');
  const btnPanel = document.getElementById('btnFinishPanel');
  const btnMini = btnFinishMiniTest;
  if (btnLesson && currentTopic?.id)
    btnLesson.href = `lessonpage.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(currentTopic.id)}${navParams()}`;
  if (btnLesson) {
    btnLesson.textContent = stats.completed ? 'Volver a la leccion' : 'Volver al modulo';
  }
  if (btnCourse) {
    btnCourse.href = courseHref(topicLevel);
    btnCourse.textContent = stats.completed ? 'Ver temas' : 'Repetir modulo';
  }
  if (btnPanel) btnPanel.href = 'espanel.html';
  if (btnMini) {
    if (stats.completed && checkpointBoundary && checkpointNo > 0) {
      btnMini.style.display = '';
      btnMini.href = checkpointReviewHref(checkpointNo, CURRENT_ROUTE);
    } else if (CURRENT_MISSING_CHECKPOINT > 0) {
      btnMini.style.display = '';
      btnMini.href = checkpointReviewHref(CURRENT_MISSING_CHECKPOINT, CURRENT_ROUTE);
    } else {
      btnMini.style.display = 'none';
      btnMini.removeAttribute('href');
    }
  }

  const close = () => {
    modal.style.display = 'none';
  };

  if (btnFinishCorrection) {
    btnFinishCorrection.disabled = false;
    btnFinishCorrection.onclick = () => {
      close();
      openCorrectionModal();
    };
  }

  const closeBtn = document.getElementById('btnCloseFinish');
  if (closeBtn) closeBtn.onclick = close;
  modal.addEventListener(
    'click',
    (e) => {
      if (e.target === modal) close();
    },
    { once: true },
  );

  modal.style.display = 'flex';
}

function maybeFinish(stats) {
  if (!stats.completed || hasShownFinish) return;
  hasShownFinish = true;
  setTimeout(() => showFinishModal(stats), 450);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  CURRENT_UID = user.uid || null;
  if (sessionEmail) sessionEmail.textContent = user.email || '(sin correo)';

  adminWrap && (adminWrap.style.display = 'none');
  setupImmersiveMode();

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch {}
      window.location.href = 'login.html';
    });
  }

  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterType) filterType.value = '';
      if (filterTag) filterTag.value = '';
      applyFilters();
    });
  }
  if (searchInput) searchInput.addEventListener('input', () => applyFilters());
  if (filterType) filterType.addEventListener('change', () => applyFilters());
  if (filterTag) filterTag.addEventListener('change', () => applyFilters());

  if (!TOPIC_ID && !SLUG) return;

  if (correctionModal && !correctionModal.dataset.wired) {
    correctionModal.dataset.wired = '1';
    btnCorrectionClose?.addEventListener('click', closeCorrectionModal);
    btnCorrectionCancel?.addEventListener('click', closeCorrectionModal);
    btnCorrectionPublish?.addEventListener('click', publishCorrectionRequest);
    btnCorrectionRecord?.addEventListener('click', toggleCorrectionRecording);
    btnCorrectionClearAudio?.addEventListener('click', () => clearCorrectionAudio());
    correctionModal.addEventListener('click', (e) => {
      if (e.target === correctionModal) closeCorrectionModal();
    });
  }

  try {
    showToast('Cargando tema...', 'warn', 1200);

    const topic = await loadTopic();
    if (!topic) {
      showClassicListSection();
      if (topicTitle) topicTitle.textContent = 'Tema no encontrado';
      if (topicDesc)
        topicDesc.textContent =
          'No se pudo cargar el tema. Verifica el enlace (level/slug/id).';
      if (pillType) pillType.textContent = '-';
      if (pillSlug) pillSlug.textContent = 'slug: -';
      if (pillCount) pillCount.textContent = 'Ejercicios: 0';
      if (pillProgress) pillProgress.textContent = 'Practica: 0%';
      if (pillTestScore) pillTestScore.textContent = 'Test: 0%';
      if (emptyExercises) {
        emptyExercises.style.display = 'block';
        emptyExercises.textContent = 'Tema no encontrado.';
      }
      return;
    }

    currentTopic = topic;
    const topicLevel = topicLevelOf(topic, LEVEL);

    if (pillLevel) pillLevel.textContent = `Nivel: ${topicLevel}`;
    if (pillType) {
      if (topic.type) {
        pillType.style.display = 'inline-flex';
        pillType.textContent = topic.type;
      } else {
        pillType.style.display = 'none';
      }
    }

    const effectiveSlug = String(topic.slug || topic.id || '');
    if (pillSlug) pillSlug.textContent = effectiveSlug ? `slug: ${effectiveSlug}` : 'slug: -';

    if (topicTitle) topicTitle.textContent = topic.title || 'Tema';
    if (topicDesc) topicDesc.textContent = topic.desc || '';

      if (pillLessonLink && topic.id) {
        pillLessonLink.style.display = 'inline-flex';
        const url = `lessonpage.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
        pillLessonLink.href = url;
        if (btnBackLesson) btnBackLesson.href = url;
      }
      if (btnReview && topic.id) {
        btnReview.href = `review.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
      }
      if (btnFlashcards && topic.id) {
        btnFlashcards.href = `flashcards.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
      }
    if (btnBackCourse) {
      btnBackCourse.href = courseHref(topicLevel);
    }

    const flags = await getUserFlags(CURRENT_UID, user.email);
    CURRENT_FLAGS = flags;
    CURRENT_ROUTE = [];
    CURRENT_ROUTE_INDEX = -1;
    CURRENT_MISSING_CHECKPOINT = 0;
    if (!flags.hasAccess) {
      showAccessLocked();
      return;
    }

    if (!flags.isAdmin) {
      if (!CONTINUOUS_FLOW) {
        const prevLevel = prevLevelOf(LEVEL);
        const hasMulti =
          flags.hasGlobalAccess || (Array.isArray(flags.levels) && flags.levels.length > 1);
        if (prevLevel && hasMulti) {
          const ok = await isPrevLevelCompleted(CURRENT_UID, prevLevel);
          if (!ok) {
            showSequenceLocked(prevLevel);
            return;
          }
        }
      }

      const ok = await enforceTopicOrderGate(CURRENT_UID, topic, flags);
      if (!ok) return;
    }

    await trackTopicOpen(user.uid, topic.id, topicLevel);

    await loadExercises(topic);
  } catch (e) {
    console.error(e);
    showToast('No se pudo cargar.', 'bad', 3200);
    if (emptyExercises) {
      showClassicListSection();
      emptyExercises.style.display = 'block';
      emptyExercises.textContent = 'No se pudo cargar. Revisa la consola.';
    }
  }
});
