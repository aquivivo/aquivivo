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
  deleteDoc,
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
const LESSON_ID = String(params.get('lessonId') || '').trim();
const SINGLE_COURSE_KEY = 'COURSE_PATH';
const COURSE_KEY = String(params.get('course') || '').trim() || SINGLE_COURSE_KEY;
const SLUG = String(params.get('slug') || '').trim();
const TRACK = String(params.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = '';
const FLOW = String(params.get('flow') || '').trim().toLowerCase();
const FORCE_CONTINUOUS_FOR_SINGLE_COURSE = COURSE_KEY === SINGLE_COURSE_KEY;
const CONTINUOUS_FLOW =
  FORCE_CONTINUOUS_FOR_SINGLE_COURSE || FLOW === 'continuous' || COURSE_VIEW === 'pro';
const PAGE_MODE = String(params.get('mode') || '').trim().toLowerCase();
// Default flow: one exercise per screen (Busuu-like).
// Fallback to classic list only when explicitly requested with mode=classic.
const IMMERSIVE_MODE = PAGE_MODE !== 'classic';
// Strict linear flow: one step at a time; next step requires solving current.
const STRICT_LINEAR_FLOW = IMMERSIVE_MODE;
// Keep back access so user can revisit previous exercise in the same flow.
const ALLOW_BACK_NAV = true;
// Keep one shared CTA in bottom nav ("Comprobar").
const SHOW_IMMERSIVE_NEXT_BUTTON = true;

const PRACTICE_COMPLETE_PCT = CONTINUOUS_FLOW ? 100 : 80;
const TEST_PASS_PCT = CONTINUOUS_FLOW ? 100 : 80;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

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
  const page = coursePageName();
  const lvl = String(level || LEVEL).toUpperCase();
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
  if (CONTINUOUS_FLOW) href += '&flow=continuous';
  if (COURSE_VIEW === 'pro' || CONTINUOUS_FLOW) href += '&map=1';
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
    let all = [];
    const orderedSnap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl), orderBy('order')),
    );
    all = orderedSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    if (!all.length) {
      const plainSnap = await getDocs(query(collection(db, 'courses'), where('level', '==', lvl)));
      all = plainSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((t) => t.isArchived !== true)
        .sort((a, b) => {
          const ao = Number(a?.order);
          const bo = Number(b?.order);
          const da = Number.isFinite(ao) ? ao : Number.POSITIVE_INFINITY;
          const db = Number.isFinite(bo) ? bo : Number.POSITIVE_INFINITY;
          if (da !== db) return da - db;
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
    }
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
      <b>Checkpoint obligatorio</b><br/>
      Antes de continuar, completa el mini-test del modulo ${block}.<br/>
      <div class="metaRow" style="margin-top:12px; flex-wrap:wrap; gap:10px;">
        <a class="btn-yellow" href="${href}" style="text-decoration:none;">Abrir mini-test</a>
        <a class="btn-white-outline" href="${courseHref(LEVEL)}" style="text-decoration:none;">Volver al curso</a>
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
const btnImmHint = document.getElementById('btnImmHint');
const btnImmPrev = document.getElementById('btnImmPrev');
const btnImmNext = document.getElementById('btnImmNext');
const btnImmDontKnow = document.getElementById('btnImmDontKnow');

  const btnLogout = document.getElementById('btnLogout');
  const btnBackLesson = document.getElementById('btnBackLesson');
  const btnBackCourse = document.getElementById('btnBackCourse');
  const btnReview = document.getElementById('btnReview');
  const btnFlashcards = document.getElementById('btnFlashcards');
  const btnResetCourse = document.getElementById('btnResetCourse');

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
let resetCourseBusy = false;

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
  const prompt = String(ex?.prompt || '').trim();
  const direct = extractTtsText(ex);
  if (direct) {
    const directNorm = normalizeText(direct).replace(/[().]/g, '').trim();
    const looksLikeOptionId =
      /^[a-z]$/.test(directNorm) || /^\d+$/.test(directNorm) || /^[a-z]-\d+$/i.test(directNorm);
    if (!looksLikeOptionId || !prompt) return direct;
  }

  const audioSentence = String(
    ex?.audioSentencePl || ex?.sentencePl || ex?.sourceExample || ex?.target?.pl || '',
  ).trim();
  if (audioSentence) return audioSentence;

  const answerObj = answerObjectOf(ex?.answer);
  let answers = [];
  if (answerObj) {
    const source = [];
    if (Array.isArray(answerObj.accepted)) source.push(...answerObj.accepted);
    if (typeof answerObj.text === 'string') source.push(answerObj.text);
    if (typeof answerObj.value === 'string') source.push(answerObj.value);
    if (typeof answerObj.answer === 'string') source.push(answerObj.answer);
    if (typeof answerObj.correct === 'string') source.push(answerObj.correct);
    answers = parseAnswerList(source);
  } else {
    answers = parseAnswerList(ex?.answer || '');
  }

  if (prompt.includes('___') && answers.length) {
    let i = 0;
    return prompt.replaceAll('___', () => answers[i++] ?? answers[0]);
  }

  if (prompt) return prompt;
  const answerSpeech = answers
    .map((x) => String(x || '').trim())
    .filter((x) => {
      const n = normalizeText(x).replace(/[().]/g, '').trim();
      return n && !/^[a-z]$/i.test(n) && !/^\d+$/.test(n) && !/^[a-z]-\d+$/i.test(n);
    })
    .filter((x) => x.length > 1);
  if (answerSpeech.length) return answerSpeech.join(' ');
  return prompt;
}

function pickPolishVoice(synth) {
  const voices = synth?.getVoices?.() || [];
  if (!voices.length) return null;
  const exact = voices.find((v) => String(v.lang || '').toLowerCase() === 'pl-pl');
  if (exact) return exact;
  const pl = voices.find((v) => String(v.lang || '').toLowerCase().startsWith('pl'));
  if (pl) return pl;
  const fallback =
    voices.find((v) => String(v.lang || '').toLowerCase().startsWith('es')) || voices[0];
  return fallback || null;
}

function speakPolish(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;

  try {
    const synth = window.speechSynthesis;
    const preferredVoice = pickPolishVoice(synth);
    const utter = new SpeechSynthesisUtterance(t);
    utter.lang = 'pl-PL';
    if (preferredVoice) utter.voice = preferredVoice;

    synth?.cancel?.();
    synth?.resume?.();
    synth?.speak?.(utter);
    return true;
  } catch {
    return false;
  }
}

function playAudioUrl(url) {
  const u = String(url || '').trim();
  if (!u) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const audio = new Audio(u);
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play()
        .then(() => resolve(true))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

function fallbackPolishTtsUrl(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const clipped = t.slice(0, 260);
  const q = encodeURIComponent(clipped);
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pl&q=${q}`;
}

async function playExerciseAudio(ex) {
  const audioUrl = extractAudioUrl(ex);
  if (audioUrl) {
    const played = await playAudioUrl(audioUrl);
    if (played) return;
  }
  const tts = ttsTextForExercise(ex);
  const spoken = speakPolish(tts);
  if (spoken) return;
  const fallback = fallbackPolishTtsUrl(tts);
  if (fallback) await playAudioUrl(fallback);
}

function speakPolishWithFallback(text) {
  const t = String(text || '').trim();
  if (!t) return;
  const spoken = speakPolish(t);
  if (spoken) return;
  const fallback = fallbackPolishTtsUrl(t);
  if (fallback) {
    playAudioUrl(fallback).catch(() => {});
  }
}

function clearNonInputTextSelection(target = null) {
  const node = target && target.nodeType === 1 ? target : null;
  if (node && node.closest('input, textarea, [contenteditable="true"]')) return;
  try {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount) sel.removeAllRanges();
  } catch {}
}

function maybeAutoAcceptChoice(btnCheck, selectedOptionId, correctOptionId) {
  if (!btnCheck || btnCheck.disabled) return;
  const selected = normalizeOptionId(selectedOptionId);
  const correct = normalizeOptionId(correctOptionId);
  if (!selected || !correct || selected !== correct) return;
  setTimeout(() => {
    if (!btnCheck.disabled) btnCheck.click();
  }, 0);
}

const SPEAKER_ICON = '\u{1F50A}';

function makeSpeakerBtn(text, { title = 'Escuchar (PL)', tiny = true } = {}) {
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
    speakPolishWithFallback(t);
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
    speakPolishWithFallback(t);
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
    setCorrectionRecordHint('Tu navegador no soporta grabacion.', true);
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
  const meta = `Nivel ${LEVEL}${title ? ` - Tema: ${title}` : ''}`;
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

function seedVersionScore(raw) {
  const text = String(raw || '').trim();
  if (!text) return -1;
  const m = text.match(/^v(\d+)(?:[_-](\d{4})[-_](\d{2})[-_](\d{2}))?/i);
  if (!m) return 0;
  const major = Number(m[1] || 0);
  const year = Number(m[2] || 0);
  const month = Number(m[3] || 0);
  const day = Number(m[4] || 0);
  const datePart = year * 10000 + month * 100 + day;
  return major * 1_0000_0000 + datePart;
}

function newestSeedVersion(items = []) {
  let best = '';
  let bestScore = -1;
  for (const item of items || []) {
    const current = String(item?.seedVersion || '').trim();
    if (!current) continue;
    const score = seedVersionScore(current);
    if (score > bestScore || (score === bestScore && current > best)) {
      best = current;
      bestScore = score;
    }
  }
  return best;
}

function filterToNewestSeedVersion(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return list;
  const best = newestSeedVersion(list);
  if (!best) return list;
  const filtered = list.filter((item) => String(item?.seedVersion || '').trim() === best);
  return filtered.length ? filtered : list;
}

function normalizeOrthographyText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[`´’]/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPolishMarks(value) {
  return normalizeOrthographyText(value)
    .replace(/\u0142/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function orthographyHint(userRaw, expectedRaw) {
  const user = normalizeOrthographyText(userRaw);
  const expectedList = parseAnswerList(expectedRaw)
    .map((item) => normalizeOrthographyText(item))
    .filter(Boolean);
  if (!user || !expectedList.length) {
    return 'Pista: revisa ortografia y terminacion.';
  }

  const userPlain = stripPolishMarks(user);
  const expectedPlain = expectedList.map((item) => stripPolishMarks(item));
  if (expectedPlain.includes(userPlain) && !expectedList.includes(user)) {
    return 'Pista: falta algun signo polaco (ą, ć, ę, ł, ń, ó, ś, ż, ź).';
  }

  const expectedJoined = expectedList.join(' ');
  if (/(ch|cz|sz|rz|dż|dź)/i.test(expectedJoined)) {
    return 'Pista: revisa digrafos polacos (h/ch/cz/sz/rz/dż/dź).';
  }

  return 'Pista: revisa ortografia y terminacion.';
}

function strictAnswerMatch(userRaw, expectedRaw, opts = {}) {
  const user = normalizeOrthographyText(userRaw);
  if (!user) return false;
  const expectedList = parseAcceptedAnswerValues(expectedRaw)
    .map((item) => normalizeOrthographyText(item))
    .filter(Boolean);
  if (!expectedList.length) return false;
  if (expectedList.includes(user)) return true;

  const answerObj = answerObjectOf(expectedRaw);
  const plainAllowed =
    opts.allowPlainMatch === true ||
    answerObj?.ignorePolishMarks === true ||
    answerObj?.ignoreDiacritics === true;
  const toleranceRaw =
    opts.tolerance ??
    answerObj?.typoTolerance ??
    answerObj?.tolerance ??
    answerObj?.levenshtein ??
    0;
  const tolerance = Math.max(0, Number(toleranceRaw || 0));
  const userPlain = stripPolishMarks(user);

  if (plainAllowed && expectedList.some((item) => stripPolishMarks(item) === userPlain)) {
    return true;
  }

  if (tolerance <= 0) return false;
  return expectedList.some((item) => levenshteinDistance(userPlain, stripPolishMarks(item)) <= tolerance);
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
      return /[\u0105\u0107\u0119\u0142\u0144\u015b\u017c\u017a]/i.test(text) || /(?:rz|cz|sz|d\u017c|d\u017a)/i.test(text);
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

function presentableTheoryNotes(raw, ex = null) {
  const parts = splitNotesParts(raw);
  if (!parts.length) return '';
  const hiddenKeyPattern =
    '(?:tts(?:_pl)?|audio(?:_url)?|exaudio|url|video_url|image_url|record|grabacion)';
  const hiddenHead = new RegExp(`^${hiddenKeyPattern}\\s*:`, 'i');
  const hiddenPronunciation =
    /^(?:[-*]\s*)?(?:pron\.?|wymowa|pronunciacion|pronunciación)\s*:/i;
  const hiddenInline = new RegExp(
    `(?:^|\\s)${hiddenKeyPattern}\\s*:\\s*(?:https?:\\/\\/\\S+|[^|\\n]+)`,
    'gi',
  );
  const out = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map((part) => part.replace(hiddenInline, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .filter((part) => !hiddenHead.test(part))
    .filter((part) => !/^https?:\/\//i.test(part));
  const answerTokens = parseAnswerList(ex?.answer || '')
    .map((a) => normalizeText(a))
    .filter((a) => a.length >= 2);

  const filtered = out.filter((line) => {
    const text = String(line || '').trim();
    if (!text) return false;
    if (hiddenPronunciation.test(text)) return false;
    if (/^(?:es|trad|traduccion|traducción|instruccion|instrucción)\s*:/i.test(text)) return false;
    const norm = normalizeText(text);
    if (!norm) return false;

    // Hide lines that reveal the exact answer (e.g. "4 = cztery").
    if (/[=:]/.test(text) && answerTokens.some((ans) => norm.includes(ans))) return false;
    if (/^(?:respuesta|answer|odpowiedz)\s*:/i.test(text)) return false;
    return true;
  });

  return filtered.join('\n').replace(/\n{2,}/g, '\n').trim();
}

function noteLineValue(rawNotes, prefixRegexList = []) {
  const parts = splitNotesParts(rawNotes);
  if (!parts.length || !Array.isArray(prefixRegexList) || !prefixRegexList.length) return '';
  const found = parts.find((part) => prefixRegexList.some((rx) => rx.test(String(part || '').trim())));
  return found ? stripNoteLabel(found) : '';
}

function toOneLine(value, maxLen = 120) {
  const line = String(value || '')
    .split(/\r?\n/)
    .map((part) => String(part || '').trim())
    .filter(Boolean)[0] || '';
  if (!line) return '';
  if (line.length <= maxLen) return line;
  return `${line.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
}

function exerciseMicroHint(ex) {
  const answerObj = answerObjectOf(ex?.answer);
  const direct =
    String(
      ex?.microHint ||
        ex?.micro_hint ||
        ex?.hint ||
        ex?.instructionShort ||
        ex?.instruction_short ||
        answerObj?.microHint ||
        '',
    ).trim();
  if (direct) return toOneLine(direct, 100);

  const fromNotes = noteLineValue(ex?.notes || '', [
    /^micro_hint\s*:/i,
    /^hint_short\s*:/i,
    /^hint\s*:/i,
  ]);
  if (fromNotes) return toOneLine(fromNotes, 100);

  return toOneLine(immersiveTitleForExercise(ex), 100);
}

function hasExplicitExerciseHint(ex) {
  const answerObj = answerObjectOf(ex?.answer);
  const direct = String(
    ex?.microHint ||
      ex?.micro_hint ||
      ex?.hint ||
      ex?.instructionShort ||
      ex?.instruction_short ||
      ex?.instructionEs ||
      ex?.instructionsEs ||
      ex?.taskEs ||
      ex?.instruction ||
      answerObj?.microHint ||
      '',
  ).trim();
  if (direct) return true;
  const fromNotes = noteLineValue(ex?.notes || '', [
    /^micro_hint\s*:/i,
    /^hint_short\s*:/i,
    /^hint\s*:/i,
    /^instruccion(?:_es)?\s*:/i,
    /^instrucci.n(?:_es)?\s*:/i,
    /^task(?:_es)?\s*:/i,
  ]);
  return !!String(fromNotes || '').trim();
}

function exerciseInstructionEs(ex) {
  const micro = exerciseMicroHint(ex);
  if (micro) return micro;

  const direct =
    String(
      ex?.instructionEs ||
        ex?.instructionsEs ||
        ex?.taskEs ||
        ex?.instruction ||
        '',
    ).trim();
  if (direct) return toOneLine(direct, 120);

  const fromNotes = noteLineValue(ex?.notes || '', [
    /^instruccion(?:_es)?\s*:/i,
    /^instrucci.n(?:_es)?\s*:/i,
    /^task(?:_es)?\s*:/i,
  ]);
  if (fromNotes) return toOneLine(fromNotes, 120);

  return toOneLine(immersiveTitleForExercise(ex), 100);
}

function exerciseTranslationEs(ex) {
  const direct = String(ex?.translationEs || ex?.translation || ex?.translateEs || '').trim();
  if (direct) return direct;

  const fromNotes = noteLineValue(ex?.notes || '', [
    /^es\s*:/i,
    /^traduccion(?:_es)?\s*:/i,
    /^traducción(?:_es)?\s*:/i,
  ]);
  return fromNotes || '';
}

function splitPromptDirectiveEs(rawPrompt) {
  const prompt = String(rawPrompt || '').trim();
  if (!prompt) return { instructionPrefix: '', promptBody: '' };
  const m = prompt.match(
    /^\s*(elige|escoge|selecciona|marca|completa|rellena|traduce|encuentra|ordena|une|relaciona)\s*:\s*/i,
  );
  if (!m) return { instructionPrefix: '', promptBody: prompt };
  const prefix = String(m[1] || '').trim();
  const body = String(prompt.slice(m[0].length) || '').trim();
  return {
    instructionPrefix: prefix,
    promptBody: body || prompt,
  };
}

function looksLikeInstructionEs(raw) {
  const t = normalizeText(raw || '');
  if (!t) return false;
  return (
    t.includes('elige') ||
    t.includes('escoge') ||
    t.includes('selecciona') ||
    t.includes('marca') ||
    t.includes('completa') ||
    t.includes('rellena') ||
    t.includes('traduce') ||
    t.includes('escucha') ||
    t.includes('encuentra') ||
    t.includes('ordena') ||
    t.includes('relaciona') ||
    t.includes('une') ||
    t.includes('opcion correcta') ||
    t.includes('traduccion')
  );
}

function isGenericInstructionEs(raw) {
  const t = normalizeText(raw || '').replace(/[.!?]+$/g, '').trim();
  if (!t) return false;
  const generic = [
    'marca la opcion correcta',
    'elige la opcion correcta',
    'escoge la opcion correcta',
    'selecciona la opcion correcta',
    'completa la frase',
    'ordena las palabras',
    'escucha y escribe',
    'verdadero o falso',
    'relaciona los elementos',
  ];
  return generic.some((g) => t === g || t.startsWith(`${g} `));
}

function promptIsSelfSufficientTask(raw) {
  const t = normalizeText(raw || '');
  if (!t) return false;
  if (
    t.includes('jak po polsku') ||
    t.includes('jak po hiszpansku') ||
    t.includes('co znaczy') ||
    t.includes('co to znaczy') ||
    t.includes('uzupelnij') ||
    t.includes('dopasuj') ||
    t.includes('uloz zdanie')
  ) {
    return true;
  }
  return /\?$/.test(String(raw || '').trim());
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
    t.includes('rol') ||
    t.includes('repeat after audio') ||
    t.includes('repeat_after_audio') ||
    t.includes('speak the answer') ||
    t.includes('speak_answer')
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
    t.includes('marcar') ||
    t.includes('multiple choice') ||
    t.includes('multiple_choice') ||
    t.includes('listen choose') ||
    t.includes('listen_choose') ||
    t.includes('choose reaction') ||
    t.includes('choose_reaction') ||
    t.includes('picture selection') ||
    t.includes('picture_selection') ||
    t.includes('choose correct form') ||
    t.includes('choose_correct_form')
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
  return (
    t.includes('dictado') ||
    t.includes('dyktando') ||
    t.includes('dictation')
  );
}

function isDragDropExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('arrastrar') ||
    t.includes('drag') ||
    t.includes('soltar') ||
    t.includes('przeciagnij') ||
    t.includes('listen arrange') ||
    t.includes('listen_arrange')
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
    t.includes('fill blank') ||
    t.includes('fill_blank') ||
    t.includes('complete ending') ||
    t.includes('complete_ending') ||
    t.includes('type the translation') ||
    t.includes('type_translation') ||
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
    t.includes('match') ||
    t.includes('matching pairs') ||
    t.includes('matching_pairs')
  );
}

function isOrderingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('ordenar') ||
    t.includes('orden') ||
    t.includes('secuencia') ||
    t.includes('ordenar la secuencia') ||
    t.includes('word bank sentence') ||
    t.includes('word_bank_sentence') ||
    t.includes('word tiles') ||
    t.includes('word_tiles')
  );
}

function isAnagramExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('anagrama') ||
    t.includes('ordena letras') ||
    t.includes('ordena las letras') ||
    t.includes('ułoz litery') ||
    t.includes('uloz litery')
  );
}

function isTranslateExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('traduce') ||
    t.includes('traduccion guiada') ||
    t.includes('translation') ||
    t.includes('tlumaczenie')
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
    t.includes('otra manera') ||
    t.includes('mini writing') ||
    t.includes('mini_writing') ||
    t.includes('write from picture') ||
    t.includes('write_from_picture') ||
    t.includes('answer the question') ||
    t.includes('answer_the_question') ||
    t.includes('mini task writing') ||
    t.includes('mini_task_writing') ||
    t.includes('transform sentence') ||
    t.includes('transform_sentence')
  );
}

function parseAnswerList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => parseAnswerList(item))
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  }

  if (raw && typeof raw === 'object') {
    const parts = [];
    if (Array.isArray(raw.accepted)) parts.push(...raw.accepted);
    if (typeof raw.text === 'string') parts.push(raw.text);
    if (typeof raw.value === 'string') parts.push(raw.value);
    if (typeof raw.answer === 'string') parts.push(raw.answer);
    if (typeof raw.correct === 'string') parts.push(raw.correct);
    return parts
      .flatMap((item) => parseAnswerList(item))
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  }

  return String(raw || '')
    .split(/[\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function answerObjectOf(rawAnswer) {
  if (!rawAnswer || typeof rawAnswer !== 'object' || Array.isArray(rawAnswer)) return null;
  return rawAnswer;
}

function parseAcceptedAnswerValues(rawAnswer) {
  return parseAnswerList(rawAnswer)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
}

function escapeRegexLiteral(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function promptPartToRegex(part) {
  return escapeRegexLiteral(String(part || '').replace(/\u00a0/g, ' '))
    .replace(/\s+/g, '\\s+');
}

function extractBlankValuesFromSentence(promptText, sentence, blanksCount) {
  const prompt = String(promptText || '').trim();
  const fullSentence = String(sentence || '').trim();
  if (!prompt || !fullSentence || !prompt.includes('___')) return null;
  const parts = prompt.split('___');
  if (parts.length - 1 !== blanksCount) return null;

  const pattern = ['^\\s*'];
  for (let i = 0; i < parts.length; i += 1) {
    pattern.push(promptPartToRegex(parts[i]));
    if (i < parts.length - 1) pattern.push('\\s*(.*?)\\s*');
  }
  pattern.push('\\s*$');

  let match = null;
  try {
    match = fullSentence.match(new RegExp(pattern.join(''), 'i'));
  } catch {
    return null;
  }
  if (!match) return null;

  const blanks = match
    .slice(1)
    .map((x) => String(x || '').trim())
    .slice(0, blanksCount);
  if (blanks.length !== blanksCount || blanks.some((x) => !x)) return null;
  return blanks;
}

function parseExpectedByBlank(rawAnswer, blanksCount, promptText = '') {
  const raw = String(rawAnswer || '').trim().replaceAll('/', '|');
  if (!raw) return [];
  if (raw.includes('||')) {
    return raw
      .split('||')
      .map((p) => parseAnswerList(p));
  }

  const list = parseAnswerList(raw);
  const extractedByBlank = Array.from({ length: Math.max(1, blanksCount) }, () => []);
  let extractedAny = false;

  list.forEach((candidate) => {
    const extracted = extractBlankValuesFromSentence(promptText, candidate, Math.max(1, blanksCount));
    if (!extracted) return;
    extractedAny = true;
    extracted.forEach((value, idx) => {
      if (!extractedByBlank[idx]) extractedByBlank[idx] = [];
      extractedByBlank[idx].push(value);
    });
  });

  const uniq = (arr) => Array.from(new Set((arr || []).map((x) => String(x || '').trim()).filter(Boolean)));

  if (blanksCount <= 1) {
    if (!extractedAny) return [list];
    const contextTokens = String(promptText || '')
      .split('___')
      .map((p) => normalizeOrthographyText(p))
      .filter(Boolean);
    const directShort = list.filter((item) => {
      const norm = normalizeOrthographyText(item);
      if (!norm) return false;
      return !contextTokens.some((ctx) => ctx && norm.includes(ctx));
    });
    return [uniq([...(extractedByBlank[0] || []), ...directShort])];
  }

  if (extractedAny) {
    const byBlank = extractedByBlank.map((row) => uniq(row));
    if (byBlank.every((row) => row.length)) return byBlank;
  }

  if (list.length === blanksCount) return list.map((x) => parseAnswerList(x));
  return Array.from({ length: blanksCount }, () => list);
}

function parseBooleanToken(raw) {
  const first = parseAcceptedAnswerValues(raw)[0] || raw;
  const t = normalizeText(first || '');
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
    return raw
      .map((o) => {
        if (o && typeof o === 'object') {
          return String(o.text ?? o.label ?? o.value ?? '').trim();
        }
        return String(o || '').trim();
      })
      .filter(Boolean);
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

function optionIdFromIndex(idx) {
  return optionLabelFromIndex(idx).toLowerCase();
}

function normalizeOptionId(raw, fallback = '') {
  const base = String(raw || fallback || '')
    .trim()
    .toLowerCase();
  return base.replace(/\s+/g, '_');
}

function parseOptionItems(rawOptions) {
  if (Array.isArray(rawOptions)) {
    return rawOptions
      .map((item, idx) => {
        if (item && typeof item === 'object') {
          const text = String(item.text ?? item.label ?? item.value ?? '').trim();
          const id = normalizeOptionId(item.id ?? item.optionId, optionIdFromIndex(idx));
          return {
            id: id || optionIdFromIndex(idx),
            text,
          };
        }
        const textRaw = String(item || '').trim();
        const text = cleanOptionText(textRaw) || textRaw;
        return {
          id: optionIdFromIndex(idx),
          text,
        };
      })
      .filter((opt) => !!opt.text);
  }

  const lines = parseOptions(rawOptions);
  return lines
    .map((line, idx) => ({
      id: optionIdFromIndex(idx),
      text: cleanOptionText(line) || String(line || '').trim(),
    }))
    .filter((opt) => !!opt.text);
}

function resolveCorrectOptionId(ex, optionItems = []) {
  const answerObj = answerObjectOf(ex?.answer);
  const explicitId = normalizeOptionId(answerObj?.correctOptionId || answerObj?.correctOption || '');
  if (explicitId) {
    const found = optionItems.find((opt) => normalizeOptionId(opt.id) === explicitId);
    if (found) return found.id;
  }

  const acceptedNorm = parseAcceptedAnswerValues(ex?.answer)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (!acceptedNorm.length) return '';

  const foundByValue = optionItems.find((opt, idx) => {
    const idNorm = normalizeText(opt.id || '');
    const labelNorm = normalizeText(optionLabelFromIndex(idx));
    const textNorm = normalizeText(opt.text || '');
    return (
      acceptedNorm.includes(idNorm) ||
      acceptedNorm.includes(labelNorm) ||
      acceptedNorm.includes(textNorm)
    );
  });
  return foundByValue?.id || '';
}

function findOptionItem(optionItems = [], optionId = '') {
  const idNorm = normalizeOptionId(optionId);
  if (!idNorm) return null;
  return optionItems.find((item) => normalizeOptionId(item.id) === idNorm) || null;
}

function isChoiceAnswerCorrect(
  ex,
  optionItems = [],
  { selectedOptionId = '', selectedValue = '', selectedLabel = '' } = {},
) {
  const selectedItem = findOptionItem(optionItems, selectedOptionId);
  const selectedText = String(selectedItem?.text || selectedValue || '').trim();
  const selectedIdNorm = normalizeText(selectedItem?.id || selectedOptionId || '');

  const correctId = resolveCorrectOptionId(ex, optionItems);
  if (correctId) {
    return normalizeOptionId(correctId) === normalizeOptionId(selectedOptionId);
  }

  const answers = parseAcceptedAnswerValues(ex?.answer);
  const answerNorms = answers.map((a) => normalizeText(a));
  const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
  const selectedTextNorm = normalizeText(selectedText);
  const selectedLabelNorm = normalizeText(selectedLabel || '');

  return (
    answerNorms.includes(selectedTextNorm) ||
    answerNormsClean.includes(selectedTextNorm) ||
    answerNorms.includes(selectedLabelNorm) ||
    answerNormsClean.includes(selectedLabelNorm) ||
    answerNorms.includes(selectedIdNorm)
  );
}

function canonicalExerciseType(ex) {
  if (isDictationExercise(ex)) return 'dictation';
  if (isDragDropExercise(ex)) return 'listen_arrange';
  if (isMatchingExercise(ex)) return 'matching';
  if (isOrderingExercise(ex)) return 'word_tiles';
  if (isFillExercise(ex)) return 'fill_blank';
  if (isBinaryTrueFalseExercise(ex)) return 'binary_choice';
  if (isChoiceExercise(ex)) return 'multiple_choice';
  if (isSpeakingExercise(ex)) return 'repeat_after_audio';
  if (isWritingExercise(ex)) return 'mini_writing';
  return String(ex?.type || 'exercise').trim().toLowerCase().replace(/\s+/g, '_');
}

function buildExerciseModel(ex) {
  const optionItems = parseOptionItems(ex?.options);
  const accepted = parseAcceptedAnswerValues(ex?.answer);
  const correctOptionId = resolveCorrectOptionId(ex, optionItems);
  return {
    id: String(ex?.id || '').trim(),
    type: canonicalExerciseType(ex),
    level: String(ex?.level || LEVEL || '').toUpperCase(),
    prompt: String(ex?.prompt || ex?.question || ex?.title || '').trim(),
    microHint: exerciseMicroHint(ex),
    audio: String(ex?.audio || ex?.audioUrl || extractAudioUrl(ex) || '').trim(),
    options: optionItems.map((opt) => ({
      id: String(opt.id || '').trim(),
      text: String(opt.text || '').trim(),
    })),
    answer: {
      correctOptionId: String(correctOptionId || '').trim(),
      accepted,
    },
    ui: {
      variant: String(ex?.ui?.variant || ex?.uiVariant || 'standard').trim() || 'standard',
    },
  };
}

function normalizeAnswerGroup(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  return Array.from(
    new Set(
      list
        .flatMap((item) => parseAnswerList(item))
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );
}

function legacyAnswerForBlankGroups(groups) {
  const clean = (Array.isArray(groups) ? groups : [])
    .map((group) => normalizeAnswerGroup(group))
    .filter((group) => group.length);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0].join('|');
  return clean.map((group) => group.join('|')).join('||');
}

function normalizedBlankGroups(ex) {
  const answerObj = answerObjectOf(ex?.answer);
  const candidates = [
    ex?.blanks,
    ex?.acceptedByBlank,
    ex?.expectedByBlank,
    ex?.fill?.blanks,
    answerObj?.blanks,
    answerObj?.acceptedByBlank,
    answerObj?.expectedByBlank,
    answerObj?.byBlank,
  ].filter(Boolean);

  for (const item of candidates) {
    if (!Array.isArray(item)) continue;
    if (item.some(Array.isArray)) {
      const groups = item.map((group) => normalizeAnswerGroup(group)).filter((group) => group.length);
      if (groups.length) return groups;
      continue;
    }
    const flat = normalizeAnswerGroup(item);
    if (flat.length) return [flat];
  }

  const accepted = answerObj?.accepted;
  if (Array.isArray(accepted) && accepted.some(Array.isArray)) {
    const groups = accepted
      .map((group) => normalizeAnswerGroup(group))
      .filter((group) => group.length);
    if (groups.length) return groups;
  }
  if (Array.isArray(accepted)) {
    const flat = normalizeAnswerGroup(accepted);
    if (flat.length) return [flat];
  }

  const parsed = parseAcceptedAnswerValues(ex?.answer);
  return parsed.length ? [parsed] : [];
}

function ensurePromptHasBlanks(promptRaw, blankCount) {
  const prompt = String(promptRaw || '').trim();
  const count = Math.max(1, Number(blankCount || 1));
  if (prompt.includes('___')) return prompt;
  if (!prompt) return Array.from({ length: count }, () => '___').join(' ');
  return `${prompt} ${Array.from({ length: count }, () => '___').join(' ')}`.trim();
}

function normalizedTokenBank(ex) {
  const first = [
    ex?.bank,
    ex?.tiles,
    ex?.wordBank,
    ex?.drag?.bank,
    ex?.drag?.tokens,
    ex?.options,
  ];
  for (const candidate of first) {
    const parsed = parseOptions(candidate);
    if (parsed.length) return parsed.map((item) => stripLeadLabel(item) || String(item || '').trim());
  }
  return [];
}

function normalizedMatchingPairs(ex) {
  const answerObj = answerObjectOf(ex?.answer);
  const pools = [ex?.pairs, ex?.matching?.pairs, answerObj?.pairs];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const pairs = pool
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const left = String(item.left ?? item.l ?? item.source ?? item.a ?? '').trim();
        const right = String(item.right ?? item.r ?? item.target ?? item.b ?? '').trim();
        if (!left || !right) return null;
        return { left, right };
      })
      .filter(Boolean);
    if (pairs.length) return pairs;
  }
  return [];
}

function optionLineLooksLikeMatch(line) {
  const txt = String(line || '').trim();
  if (!txt) return false;
  return /\s(?:=|->|\u2192|\u2014)\s/.test(txt);
}

function mapPairsToLegacyMatching(pairs) {
  const safe = Array.isArray(pairs) ? pairs : [];
  if (!safe.length) return { options: [], answer: '' };

  const options = [];
  const links = [];
  safe.forEach((pair, idx) => {
    const leftLabel = String.fromCharCode(65 + (idx % 26));
    const rightLabel = String(idx + 1);
    const left = String(pair.left || '').trim();
    const right = String(pair.right || '').trim();
    if (!left || !right) return;
    options.push(`${leftLabel}) ${left} = ${rightLabel}) ${right}`);
    links.push(`${leftLabel}-${rightLabel}`);
  });
  return {
    options,
    answer: links.join(', '),
  };
}

function normalizedBaseType(raw) {
  const t = normalizeText(raw || '');
  if (!t) return '';
  if (t.includes('multiple choice') || t.includes('multiple_choice')) return 'multiple_choice';
  if (t.includes('binary') || t.includes('true false') || t.includes('true_false')) return 'binary_choice';
  if (t.includes('dictation')) return 'dictation';
  if (t.includes('listen arrange') || t.includes('listen_arrange') || t.includes('drag')) {
    return 'listen_arrange';
  }
  if (t.includes('matching')) return 'matching';
  if (t.includes('word tiles') || t.includes('word_tiles') || t.includes('ordering')) {
    return 'word_tiles';
  }
  if (t.includes('fill blank') || t.includes('fill_blank') || t.includes('fill')) return 'fill_blank';
  if (t.includes('repeat') || t.includes('speaking') || t.includes('speak')) return 'repeat_after_audio';
  if (t.includes('writing') || t.includes('mini_writing')) return 'mini_writing';
  if (t.includes('scene') || t.includes('dialogue') || t.includes('dialogo')) return 'scene';
  if (t.includes('find error') || t.includes('error')) return 'find_error';
  if (t.includes('translation') || t.includes('translate')) return 'translate';
  if (t.includes('anagram')) return 'anagram';
  return '';
}

function typeTokenForBaseType(baseType) {
  const key = normalizedBaseType(baseType);
  if (key === 'multiple_choice') return 'multiple_choice';
  if (key === 'binary_choice') return 'true false';
  if (key === 'dictation') return 'dictation';
  if (key === 'listen_arrange') return 'listen_arrange';
  if (key === 'matching') return 'matching_pairs';
  if (key === 'word_tiles') return 'word_tiles';
  if (key === 'fill_blank') return 'fill_blank';
  if (key === 'repeat_after_audio') return 'repeat_after_audio';
  if (key === 'mini_writing') return 'mini_writing';
  if (key === 'scene') return 'scene';
  if (key === 'find_error') return 'find error';
  if (key === 'translate') return 'type_translation';
  if (key === 'anagram') return 'anagram';
  return String(baseType || '').trim();
}

function normalizeExercise(ex) {
  const src = ex && typeof ex === 'object' ? ex : {};
  const out = { ...src };
  const explicitBase = normalizedBaseType(out.baseType || out.ui?.baseType || out.renderer);
  const baseType = explicitBase || canonicalExerciseType(out);
  const answerObj = answerObjectOf(out.answer);

  if (explicitBase) {
    const currentType = String(out.type || '').trim();
    if (currentType) out.variant = String(out.variant || currentType).trim();
    out.type = typeTokenForBaseType(explicitBase);
  }

  if (baseType === 'matching') {
    const pairOptions = normalizedMatchingPairs(out);
    const optionLines = parseOptions(out.options);
    const looksLegacy = optionLines.some(optionLineLooksLikeMatch);
    if (pairOptions.length && !looksLegacy) {
      const mapped = mapPairsToLegacyMatching(pairOptions);
      out.options = mapped.options;
      if (!String(out.answer || '').trim()) out.answer = mapped.answer;
    } else if (Array.isArray(out.options) && out.options.some((o) => o && typeof o === 'object')) {
      out.options = parseOptions(out.options);
    }
  }

  if (baseType === 'fill_blank' || baseType === 'listen_arrange') {
    const groups = normalizedBlankGroups(out);
    const answerString = legacyAnswerForBlankGroups(groups);
    if (answerString) out.answer = answerString;

    if (baseType === 'listen_arrange') {
      const blankCount = Math.max(
        groups.length,
        String(out.prompt || '').includes('___')
          ? String(out.prompt || '').split('___').length - 1
          : 0,
        1,
      );
      out.prompt = ensurePromptHasBlanks(out.prompt, blankCount);
      const bank = normalizedTokenBank(out);
      if (bank.length) out.options = bank;
    } else if (baseType === 'fill_blank') {
      const blankCount = Math.max(
        groups.length,
        String(out.prompt || '').includes('___')
          ? String(out.prompt || '').split('___').length - 1
          : 0,
        1,
      );
      out.prompt = ensurePromptHasBlanks(out.prompt, blankCount);
    }
  } else if (answerObj && typeof answerObj === 'object' && Array.isArray(answerObj.accepted)) {
    out.answer = {
      ...answerObj,
      accepted: normalizeAnswerGroup(answerObj.accepted),
    };
  }

  if (Array.isArray(out.options) && out.options.some((item) => item && typeof item === 'object')) {
    out.options = out.options.map((item, idx) => {
      const text = String(item?.text ?? item?.label ?? item?.value ?? '').trim();
      const id = normalizeOptionId(item?.id ?? item?.optionId, optionIdFromIndex(idx));
      return text ? { id: id || optionIdFromIndex(idx), text } : null;
    }).filter(Boolean);
  }

  return out;
}

function cleanOptionText(opt) {
  return String(opt || '').replace(/^[A-D]\s*[)\.:-]\s*/i, '').trim();
}

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    const parts = line.split(/\s*(?:=|->|\u2192|\u2014)\s*/);
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

function matchesLesson(exercise, lessonId) {
  const wanted = String(lessonId || '').trim();
  if (!wanted) return true;

  const notesNorm = normalizeText(exercise?.notes || '');
  const tagsNorm = normalizeTags(exercise?.tags || []).map((t) => normalizeText(t));
  const one = String(exercise?.lessonId || '').trim();
  const many = Array.isArray(exercise?.lessonIds)
    ? exercise.lessonIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const isTopicDeck =
    notesNorm.includes('deck:topic') ||
    tagsNorm.includes('scope:topic') ||
    (!one && many.length > 1);
  if (isTopicDeck) return false;

  if (one && one === wanted) return true;

  if (many.includes(wanted)) return true;

  const notes = String(exercise?.notes || '');
  return notes.includes(`lessonId:${wanted}`);
}

function progressDocRef(uid, topicKey) {
  return doc(db, 'user_progress', uid, 'topics', topicKey);
}

function expectedAnswerPreview(ex) {
  const optionItems = parseOptionItems(ex?.options);
  const answers = parseAcceptedAnswerValues(ex?.answer);
  if (!answers.length) return '';
  const labels = answers.map((x) => normalizeText(x));
  const mapped = optionItems
    .map((opt, idx) => ({
      id: normalizeText(opt.id || ''),
      label: normalizeText(optionLabelFromIndex(idx)),
      value: String(opt.text || '').trim(),
    }))
    .filter((item) => item.value)
    .filter((item) => labels.includes(item.id) || labels.includes(item.label))
    .map((item) => item.value);
  const list = mapped.length ? mapped : answers;
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
  if (isSceneExercise(ex)) return 'Microescena: elige la mejor respuesta.';
  if (isFindErrorExercise(ex)) return 'Encuentra el error y elige la version correcta.';
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

function getImmersivePrimaryButton() {
  if (!immersiveExerciseHost) return null;
  const explicit = immersiveExerciseHost.querySelector('[data-immersive-primary="1"]');
  if (explicit && String(explicit.tagName || '').toUpperCase() === 'BUTTON') return explicit;

  const yellow = immersiveExerciseHost.querySelector('.exerciseActions .btn-yellow');
  if (yellow && String(yellow.tagName || '').toUpperCase() === 'BUTTON') return yellow;

  const fallback = Array.from(immersiveExerciseHost.querySelectorAll('.exerciseActions button')).find(
    (btn) => !btn.classList.contains('ttsIconBtn'),
  );
  return fallback || null;
}

function triggerImmersivePrimaryAction() {
  if (!IMMERSIVE_MODE) return;
  const btn = getImmersivePrimaryButton();
  if (!btn || btn.disabled) {
    showToast('Completa este ejercicio primero.', 'warn', 1400);
    return;
  }
  btn.click();
}

async function markCurrentAsDontKnow() {
  if (!IMMERSIVE_MODE) return;
  if (!VIEW_EXERCISES.length) return;

  const ex = VIEW_EXERCISES[immersiveIndex];
  if (!ex) return;
  const exId = String(ex.id || '').trim();
  if (!exId) return;
  if (progressState.doneIds.has(exId)) {
    showToast('Este ejercicio ya esta completado.', 'warn', 1300);
    return;
  }

  const expected = String(expectedAnswerPreview(ex) || ex.answer || '').trim();
  await appendMistakeLog(ex, '[no sé]', expected);
  progressState.doneIds.add(exId);
  if (isTestExercise(ex)) {
    progressState.testResults.set(exId, {
      correct: false,
      answer: '[no sé]',
    });
  }

  await saveProgress();
  setProgressUI();
  showToast(
    expected ? `No pasa nada. Respuesta correcta: ${expected}` : 'Marcado como "No sé".',
    'warn',
    2400,
  );
  onImmersiveExerciseDone(exId);
}

function toggleImmersiveHint() {
  if (!IMMERSIVE_MODE || !immersiveExerciseHost) return;
  const note = immersiveExerciseHost.querySelector('.exerciseNote');
  if (!note) {
    showToast('Sin pista para este ejercicio.', 'warn', 1400);
    if (btnImmHint) btnImmHint.classList.remove('is-active');
    return;
  }
  const isOpen = note.style.display === 'block';
  note.style.display = isOpen ? 'none' : 'block';
  if (btnImmHint) btnImmHint.classList.toggle('is-active', !isOpen);
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

  if (btnImmPrev) {
    btnImmPrev.style.display = ALLOW_BACK_NAV ? '' : 'none';
    btnImmPrev.disabled = !ALLOW_BACK_NAV || idx <= 0;
  }
  if (btnImmNext) {
    btnImmNext.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    btnImmNext.textContent = 'Comprobar';
    const primary = getImmersivePrimaryButton();
    btnImmNext.disabled = !SHOW_IMMERSIVE_NEXT_BUTTON || !primary || primary.disabled;
  }
  if (btnImmDontKnow) {
    btnImmDontKnow.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    btnImmDontKnow.disabled =
      !SHOW_IMMERSIVE_NEXT_BUTTON || !ex || progressState.doneIds.has(String(ex.id || ''));
  }
  if (btnImmHint) {
    btnImmHint.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    const note = immersiveExerciseHost?.querySelector('.exerciseNote');
    const hasNote = !!note;
    btnImmHint.disabled = !hasNote;
    btnImmHint.classList.toggle('is-active', !!note && note.style.display === 'block');
  }
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
  const allDone = VIEW_EXERCISES.every((item) =>
    progressState.doneIds.has(String(item.id)),
  );
  if (allDone) {
    showFinishModal(computeProgressStats());
    return;
  }
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

  let card = null;
  let renderFailed = false;

  try {
    card = makeExerciseCard(ex);
  } catch (e) {
    renderFailed = true;
    console.error('[ejercicio] immersive render failed', e);
  }

  if (!card || typeof card.classList?.add !== 'function') {
    renderFailed = true;
    const fallback = document.createElement('div');
    fallback.className = 'exerciseCard';
    fallback.innerHTML = `<div class="exercisePrompt">No se pudo mostrar este ejercicio.</div>
      <div class="exerciseNote" style="display:block;margin-top:10px;">
        Puedes continuar y revisarlo despues.
      </div>`;
    const skipWrap = document.createElement('div');
    skipWrap.className = 'exerciseActions';
    skipWrap.style.justifyContent = 'center';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-yellow';
    skipBtn.textContent = immersiveIndex >= VIEW_EXERCISES.length - 1 ? 'Finalizar' : 'Continuar';
    skipBtn.addEventListener('click', () => {
      if (immersiveIndex >= VIEW_EXERCISES.length - 1) {
        showFinishModal(computeProgressStats());
        return;
      }
      immersiveIndex += 1;
      renderImmersiveMode();
    });
    skipWrap.appendChild(skipBtn);
    fallback.appendChild(skipWrap);
    card = fallback;
  }

  card.classList.add('exerciseCard--immersive');
  immersiveExerciseHost.appendChild(card);

  syncImmersiveProgressUI();
  if (renderFailed && btnImmNext) btnImmNext.disabled = false;
}

function goToImmersiveOffset(offset) {
  if (!IMMERSIVE_MODE) return;
  if (!VIEW_EXERCISES.length) return;
  if (!ALLOW_BACK_NAV && Number(offset || 0) < 0) return;
  const next = immersiveIndex + Number(offset || 0);
  immersiveIndex = Math.min(Math.max(0, next), VIEW_EXERCISES.length - 1);
  renderImmersiveMode();
}

function goNextImmersiveExercise() {
  if (!IMMERSIVE_MODE) return;
  if (!VIEW_EXERCISES.length) return;
  if (STRICT_LINEAR_FLOW) {
    const current = VIEW_EXERCISES[immersiveIndex];
    const currentDone = current
      ? progressState.doneIds.has(String(current.id))
      : false;
    if (!currentDone) {
      showToast('Primero completa este ejercicio.', 'warn', 1800);
      return;
    }
  }
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
  if (immersiveIndex >= VIEW_EXERCISES.length - 1) {
    showFinishModal(computeProgressStats());
    return;
  }

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
  if (btnImmPrev) {
    btnImmPrev.style.display = ALLOW_BACK_NAV ? '' : 'none';
    btnImmPrev.disabled = !ALLOW_BACK_NAV;
  }
  if (btnImmNext) {
    btnImmNext.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    btnImmNext.textContent = 'Comprobar';
    btnImmNext.disabled = !SHOW_IMMERSIVE_NEXT_BUTTON;
  }
  if (btnImmDontKnow) {
    btnImmDontKnow.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    btnImmDontKnow.disabled = !SHOW_IMMERSIVE_NEXT_BUTTON;
  }
  if (btnImmHint) {
    btnImmHint.style.display = SHOW_IMMERSIVE_NEXT_BUTTON ? '' : 'none';
    btnImmHint.disabled = false;
    btnImmHint.classList.remove('is-active');
  }

  if (btnImmPrev && !btnImmPrev.dataset.wired) {
    btnImmPrev.dataset.wired = '1';
    btnImmPrev.addEventListener('click', () => goToImmersiveOffset(-1));
  }
  if (btnImmNext && !btnImmNext.dataset.wired) {
    btnImmNext.dataset.wired = '1';
    btnImmNext.addEventListener('click', triggerImmersivePrimaryAction);
  }
  if (btnImmDontKnow && !btnImmDontKnow.dataset.wired) {
    btnImmDontKnow.dataset.wired = '1';
    btnImmDontKnow.addEventListener('click', () => {
      markCurrentAsDontKnow().catch((e) => {
        console.warn('[ejercicio] dont-know failed', e);
      });
    });
  }
  if (btnImmHint && !btnImmHint.dataset.wired) {
    btnImmHint.dataset.wired = '1';
    btnImmHint.addEventListener('click', () => toggleImmersiveHint());
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
      const answerBlob = parseAcceptedAnswerValues(e.answer || '').join(' ');
      const optionsBlob = parseOptions(e.options || '').join(' ');
      const blob =
        `${e.prompt || ''} ${answerBlob} ${optionsBlob} ${e.notes || ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  renderExercises();
}

function setExerciseCardState(card, state) {
  if (!card) return;
  const allowed = new Set([
    'idle',
    'selected',
    'checked_correct',
    'checked_wrong',
    'disabled',
  ]);
  const next = allowed.has(String(state || '')) ? String(state) : 'idle';
  card.dataset.exerciseState = next;
}

function lockExerciseCard(card, locked = true) {
  if (!card) return;
  card.dataset.exerciseLocked = locked ? '1' : '0';
}

function markCardAsSelectedFromNode(node) {
  const card = node?.closest?.('.exerciseCard');
  if (!card) return;
  if (card.dataset.exerciseLocked === '1') return;
  setExerciseCardState(card, 'selected');
}

function wireSelectionInput(field) {
  if (!field) return;
  const mark = () => markCardAsSelectedFromNode(field);
  field.addEventListener('input', mark);
  field.addEventListener('change', mark);
  field.addEventListener('focus', mark);
}

function syncChoiceOptionState(optsWrap, { selectedId = '', correctId = '', checked = false } = {}) {
  if (!optsWrap) return;
  const selectedNorm = normalizeOptionId(selectedId);
  const correctNorm = normalizeOptionId(correctId);
  const rows = Array.from(optsWrap.querySelectorAll('.exerciseOption'));
  rows.forEach((row) => {
    const rowId = normalizeOptionId(row.dataset.optionId || '');
    const isSelected = !!selectedNorm && rowId === selectedNorm;
    const isCorrect = !!checked && !!correctNorm && rowId === correctNorm;
    const isWrong = !!checked && isSelected && !!correctNorm && rowId !== correctNorm;
    row.classList.toggle('isSelected', isSelected);
    row.classList.toggle('isCorrect', isCorrect);
    row.classList.toggle('isWrong', isWrong);
    row.classList.toggle('isDisabled', !!checked);
    const input = row.querySelector('input[type="radio"]');
    if (input && checked) input.disabled = true;
  });
}

function makeOptionRow({
  name,
  value,
  label,
  checked,
  onChange,
  ttsText = '',
  optionId = '',
}) {
  const row = document.createElement('label');
  row.className = 'exerciseOption';
  row.dataset.optionId = normalizeOptionId(optionId || value || '');

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = !!checked;
  if (row.dataset.optionId) input.dataset.optionId = row.dataset.optionId;
  input.addEventListener('change', (ev) => {
    markCardAsSelectedFromNode(ev.target);
    if (typeof onChange === 'function') onChange(ev);
  });

  const text = document.createElement('span');
  text.textContent = label;

  row.appendChild(input);
  row.appendChild(text);
  return row;
}

function setResultText(resultEl, correct, message) {
  if (!resultEl) return;
  resultEl.textContent =
    message || (correct ? 'Correcto.' : 'Incorrecto. Pista: revisa ortografia y gramatica.');
  resultEl.classList.remove('ok', 'bad');
  resultEl.classList.add(correct ? 'ok' : 'bad');
  const card = resultEl.closest?.('.exerciseCard');
  if (card) {
    setExerciseCardState(card, correct ? 'checked_correct' : 'checked_wrong');
  }
}

const POLISH_ASSIST_TOKENS = [
  '\u0105',
  '\u0107',
  '\u0119',
  '\u0142',
  '\u0144',
  '\u00f3',
  '\u015b',
  '\u017c',
  '\u017a',
  'h',
  'w',
  'z',
  'ch',
  'cz',
  'sz',
  'rz',
  'si',
  'ci',
  'ni',
  'zi',
  'dzi',
  'dz',
  'd\u017c',
  'd\u017a',
];

const LETTER_SLOT_GROUPS = new Map();
let LETTER_SLOT_SEQ = 0;

function splitChars(text) {
  return Array.from(String(text || ''));
}

function createLetterSlotsInput(template, { disabled = false } = {}) {
  const groupId = `slot_${Date.now()}_${LETTER_SLOT_SEQ++}`;
  const wrapper = document.createElement('span');
  wrapper.className = 'exerciseLetterSlots';
  wrapper.dataset.slotGroup = groupId;

  const mask = splitChars(String(template || '').replace(/\r?\n/g, ' ').trim());
  const pattern = mask.length ? mask : ['_'];
  const cells = [];
  const map = [];

  pattern.forEach((ch) => {
    if (ch === ' ') {
      const sep = document.createElement('span');
      sep.className = 'exerciseLetterSpace';
      sep.textContent = '·';
      sep.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(sep);
      map.push({ space: true, cell: null });
      return;
    }

    const cell = document.createElement('input');
    cell.type = 'text';
    cell.inputMode = 'text';
    cell.autocomplete = 'off';
    cell.spellcheck = false;
    cell.maxLength = 1;
    cell.className = 'exerciseLetterCell';
    cell.dataset.slotGroup = groupId;
    cell.dataset.slotIndex = String(cells.length);
    cell.disabled = !!disabled;
    cell.style.color = '#ffffff';
    cell.style.setProperty('-webkit-text-fill-color', '#ffffff');
    cell.style.caretColor = '#ffffff';
    cell.style.lineHeight = '1';
    cell.style.textAlign = 'center';
    cell.style.fontSize = '1.12rem';
    cell.style.fontWeight = '700';
    cell.style.opacity = '1';
    wrapper.appendChild(cell);
    map.push({ space: false, cell });
    cells.push(cell);
  });

  const nextIndex = (idx) => {
    let i = Number(idx) + 1;
    while (i < cells.length && cells[i]?.disabled) i += 1;
    return i < cells.length ? i : -1;
  };
  const prevIndex = (idx) => {
    let i = Number(idx) - 1;
    while (i >= 0 && cells[i]?.disabled) i -= 1;
    return i >= 0 ? i : -1;
  };
  const focusIndex = (idx) => {
    const i = Number(idx);
    if (!Number.isFinite(i) || i < 0 || i >= cells.length) return;
    const target = cells[i];
    if (!target || target.disabled) return;
    target.focus();
    try {
      target.setSelectionRange(target.value.length, target.value.length);
    } catch {}
  };
  const sanitizeChars = (value) =>
    splitChars(String(value || '').replace(/\s+/g, '')).filter((ch) => ch && ch.trim() !== '');

  const insertAt = (startIdx, token) => {
    const chars = sanitizeChars(token);
    if (!chars.length) return;
    let idx = Number(startIdx);
    if (!Number.isFinite(idx) || idx < 0) idx = 0;
    for (const ch of chars) {
      if (idx < 0 || idx >= cells.length) break;
      const cell = cells[idx];
      if (cell && !cell.disabled) cell.value = ch;
      idx = nextIndex(idx);
      if (idx < 0) break;
    }
    const focus = idx >= 0 ? idx : cells.length - 1;
    focusIndex(focus);
  };

  const getValue = () => {
    let out = '';
    let cellIdx = 0;
    map.forEach((item) => {
      if (item.space) {
        out += ' ';
        return;
      }
      const value = String(cells[cellIdx]?.value || '').trim();
      out += value;
      cellIdx += 1;
    });
    return out.replace(/\s+/g, ' ').trim();
  };

  const isComplete = () => cells.every((c) => String(c.value || '').trim().length === 1);

  const clear = () => {
    cells.forEach((c) => {
      c.value = '';
    });
    focusIndex(0);
  };

  const setDisabled = (flag) => {
    cells.forEach((c) => {
      c.disabled = !!flag;
    });
  };

  cells.forEach((cell, idx) => {
    cell.addEventListener('input', () => {
      markCardAsSelectedFromNode(cell);
      const chars = sanitizeChars(cell.value);
      cell.value = chars[0] || '';
      if (chars.length > 1) {
        insertAt(idx, chars.join(''));
        return;
      }
      if (cell.value) {
        const n = nextIndex(idx);
        if (n >= 0) focusIndex(n);
      }
    });

    cell.addEventListener('keydown', (ev) => {
      if (ev.key === 'Backspace' && !cell.value) {
        const p = prevIndex(idx);
        if (p >= 0) {
          ev.preventDefault();
          const prev = cells[p];
          if (prev && !prev.disabled) prev.value = '';
          focusIndex(p);
        }
      } else if (ev.key === 'ArrowLeft') {
        const p = prevIndex(idx);
        if (p >= 0) {
          ev.preventDefault();
          focusIndex(p);
        }
      } else if (ev.key === 'ArrowRight') {
        const n = nextIndex(idx);
        if (n >= 0) {
          ev.preventDefault();
          focusIndex(n);
        }
      }
    });

    cell.addEventListener('paste', (ev) => {
      const txt = String(ev.clipboardData?.getData('text') || '').trim();
      if (!txt) return;
      ev.preventDefault();
      insertAt(idx, txt);
    });
  });

  LETTER_SLOT_GROUPS.set(groupId, {
    insertAt,
    getValue,
    isComplete,
    clear,
    setDisabled,
    focusFirst: () => focusIndex(0),
    fields: cells.slice(),
  });

  return {
    el: wrapper,
    groupId,
    fields: cells.slice(),
    getValue,
    isComplete,
    clear,
    disable: setDisabled,
    focusFirst: () => focusIndex(0),
    insertAt,
  };
}

function insertTokenAtCaret(field, token) {
  if (!field || field.disabled || field.readOnly) return;
  if (field.classList?.contains('exerciseLetterCell')) {
    const groupId = String(field.dataset.slotGroup || '').trim();
    const idx = Number(field.dataset.slotIndex || 0);
    const ctrl = groupId ? LETTER_SLOT_GROUPS.get(groupId) : null;
    if (ctrl && typeof ctrl.insertAt === 'function') {
      ctrl.insertAt(Number.isFinite(idx) ? idx : 0, token);
      return;
    }
  }
  const value = String(field.value || '');
  const start =
    Number.isInteger(field.selectionStart) && field.selectionStart >= 0
      ? field.selectionStart
      : value.length;
  const end =
    Number.isInteger(field.selectionEnd) && field.selectionEnd >= start
      ? field.selectionEnd
      : start;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
  field.value = next;
  const caret = start + token.length;
  try {
    field.setSelectionRange(caret, caret);
  } catch {}
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function attachPolishAssistPad(card, fields = []) {
  if (!card || !Array.isArray(fields) || !fields.length) return;
  if (card.querySelector('.exercisePolishPad')) return;

  const textFields = fields.filter((field) => {
    if (!field || typeof field.tagName !== 'string') return false;
    const tag = String(field.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const type = String(field.type || 'text').toLowerCase();
    return type === 'text' || type === 'search';
  });
  if (!textFields.length) return;

  let activeField = textFields[0];

  const markActiveIfText = (target) => {
    if (!target || typeof target.tagName !== 'string') return;
    const tag = String(target.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') {
      activeField = target;
      return;
    }
    if (tag !== 'INPUT') return;
    const type = String(target.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'search') return;
    activeField = target;
  };

  textFields.forEach((field) => {
    field.addEventListener('focus', () => markActiveIfText(field));
  });

  const wrap = document.createElement('div');
  wrap.className = 'exercisePolishPad';

  const title = document.createElement('div');
  title.className = 'exercisePolishPadLabel';
  title.textContent = 'Teclado PL';
  wrap.appendChild(title);

  const keys = document.createElement('div');
  keys.className = 'exercisePolishPadKeys';

  POLISH_ASSIST_TOKENS.forEach((token) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-white-outline exercisePolishPadKey';
    btn.textContent = token;
    btn.addEventListener('click', () => {
      const target =
        (activeField && !activeField.disabled && !activeField.readOnly
          ? activeField
          : null) || textFields.find((f) => !f.disabled && !f.readOnly);
      if (!target) {
        showToast('Selecciona un campo de texto.', 'warn', 1200);
        return;
      }
      insertTokenAtCaret(target, token);
      target.focus();
    });
    keys.appendChild(btn);
  });

  wrap.appendChild(keys);
  card.appendChild(wrap);
}

function makeExerciseCard(ex) {
  const exerciseModel = buildExerciseModel(ex);
  const card = document.createElement('div');
  card.className = 'exerciseCard';
  setExerciseCardState(card, 'idle');
  lockExerciseCard(card, false);
  card.addEventListener('selectstart', (ev) => {
    const target = ev?.target;
    if (target && target.closest && target.closest('input, textarea, [contenteditable="true"]')) return;
    ev.preventDefault();
  });
  card.addEventListener('mouseup', (ev) => clearNonInputTextSelection(ev?.target));
  card.addEventListener('touchend', (ev) => clearNonInputTextSelection(ev?.target));
  card.addEventListener('click', (ev) => clearNonInputTextSelection(ev?.target));

  const top = document.createElement('div');
  top.className = 'exerciseTop';

  const meta = document.createElement('div');
  meta.className = 'exerciseMeta';

  const typePill = document.createElement('span');
  typePill.className = 'pill';
  typePill.textContent = ex.type || exerciseModel.type || 'Ejercicio';

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

  if (!IMMERSIVE_MODE) {
    top.appendChild(meta);
    card.appendChild(top);
  }

  const promptSource = String(exerciseModel.prompt || '').trim();
  const promptParts = splitPromptDirectiveEs(promptSource);
  const promptText = promptParts.promptBody || promptSource;
  const instructionBase = exerciseModel.microHint || exerciseInstructionEs(ex);
  const directive = String(promptParts.instructionPrefix || '').trim();
  const directiveSentence = directive
    ? `${directive.charAt(0).toUpperCase()}${directive.slice(1)}.`
    : '';
  const instructionText = directiveSentence
    ? normalizeText(instructionBase).includes(normalizeText(directive))
      ? instructionBase
      : `${directiveSentence} ${instructionBase}`.trim()
    : instructionBase;
  const promptIsInstruction = looksLikeInstructionEs(promptText);
  const hasExplicitHint = hasExplicitExerciseHint(ex) || !!directiveSentence;
  const redundantGenericHint =
    isGenericInstructionEs(instructionText) && !!String(promptText || '').trim() && !promptIsInstruction;
  const showInstructionBlock =
    hasExplicitHint && !!instructionText && !promptIsInstruction && !redundantGenericHint;

  if (showInstructionBlock) {
    const instructionBlock = document.createElement('div');
    instructionBlock.className = 'exerciseInstruction';
    const instructionBody = document.createElement('div');
    instructionBody.className = 'exerciseInstructionText';
    instructionBody.textContent = toOneLine(instructionText, 100);
    instructionBlock.appendChild(instructionBody);
    card.appendChild(instructionBlock);
  }

  const promptBlock = document.createElement('div');
  promptBlock.className = 'exercisePromptBlock';

  const promptRow = document.createElement('div');
  promptRow.className = 'exercisePromptRow';

  const prompt = document.createElement('div');
  prompt.className = 'exercisePrompt';
  prompt.textContent = promptText;
  promptRow.appendChild(prompt);

  const promptSpeaker = document.createElement('button');
  promptSpeaker.type = 'button';
  promptSpeaker.className = 'ttsIconBtn exercisePromptSpeaker';
  promptSpeaker.textContent = SPEAKER_ICON;
  promptSpeaker.title = 'Escuchar (PL)';
  promptSpeaker.setAttribute('aria-label', 'Escuchar (PL)');
  promptSpeaker.addEventListener('click', () => {
    const visiblePrompt = String(prompt.textContent || promptText || '').trim();
    const forceExerciseAudio = isListenExercise(ex) || isDictationExercise(ex) || !!extractAudioUrl(ex);
    const ttsModel = visiblePrompt ? { ...ex, ttsText: visiblePrompt } : ex;
    if (forceExerciseAudio) {
      playExerciseAudio(ttsModel);
      return;
    }
    speakPolishWithFallback(visiblePrompt || ttsTextForExercise(ttsModel));
  });
  promptRow.appendChild(promptSpeaker);

  promptBlock.appendChild(promptRow);
  card.appendChild(promptBlock);

  const translationValue = String(exerciseTranslationEs(ex) || '').trim();
  if (translationValue && !IMMERSIVE_MODE) {
    const translationBlock = document.createElement('div');
    translationBlock.className = 'exerciseTranslation';
    const translationText = document.createElement('div');
    translationText.className = 'exerciseTranslationText';
    translationText.textContent = toOneLine(translationValue, 120);
    translationBlock.appendChild(translationText);
    card.appendChild(translationBlock);
  }

  const audioTools = document.createElement('div');
  audioTools.className = 'exerciseAudioTools';
  const recRow = document.createElement('div');
  recRow.className = 'exerciseRecordRow';
  let hasRecordingUI = false;
  if (canRecordVoice()) {
    let recording = false;
    let recorder = null;
    let recStream = null;
    let chunks = [];
    let recUrl = '';

    const btnRec = document.createElement('button');
    btnRec.type = 'button';
    btnRec.className = 'btn-white-outline';
    btnRec.textContent = 'Grabar mi voz';

    const btnRecClear = document.createElement('button');
    btnRecClear.type = 'button';
    btnRecClear.className = 'btn-white-outline';
    btnRecClear.textContent = 'Borrar grabacion';
    btnRecClear.style.display = 'none';

    const recPreview = document.createElement('audio');
    recPreview.className = 'exerciseAudioPreview';
    recPreview.controls = true;
    recPreview.style.display = 'none';

    const stopStream = () => {
      try {
        recStream?.getTracks?.()?.forEach((t) => t.stop());
      } catch {}
      recStream = null;
    };

    const clearPreview = () => {
      if (recUrl) {
        try {
          URL.revokeObjectURL(recUrl);
        } catch {}
      }
      recUrl = '';
      try {
        recPreview.pause?.();
      } catch {}
      recPreview.removeAttribute('src');
      recPreview.style.display = 'none';
      btnRecClear.style.display = 'none';
    };

    btnRec.addEventListener('click', async () => {
      if (recording) {
        try {
          recorder?.stop();
        } catch {}
        return;
      }
      try {
        clearPreview();
        stopStream();

        recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(recStream);
        chunks = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          recording = false;
          btnRec.textContent = 'Grabar mi voz';
          const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
          recUrl = URL.createObjectURL(blob);
          recPreview.src = recUrl;
          recPreview.style.display = '';
          btnRecClear.style.display = '';
          stopStream();
        };

        recorder.start();
        recording = true;
        btnRec.textContent = 'Detener grabacion';
      } catch (err) {
        console.warn('[ejercicio] universal record failed', err);
        stopStream();
        showToast('No se pudo grabar audio.', 'bad', 2000);
      }
    });

    btnRecClear.addEventListener('click', () => {
      clearPreview();
    });

    recRow.appendChild(btnRec);
    recRow.appendChild(btnRecClear);
    recRow.appendChild(recPreview);
    hasRecordingUI = true;
  } else {
    hasRecordingUI = false;
  }
  if (hasRecordingUI) {
    audioTools.appendChild(recRow);
    card.appendChild(audioTools);
  }

  if (ex.imageUrl) {
    const img = document.createElement('img');
    img.className = 'exerciseImage';
    img.alt = 'Imagen';
    img.loading = 'lazy';
    img.src = ex.imageUrl;
    card.appendChild(img);
  }

  const notes = presentableTheoryNotes(ex.notes || '', ex);
  if (notes) {
    const noteWrap = document.createElement('div');
    noteWrap.className = 'exerciseNoteWrap';

    const noteBtn = document.createElement('button');
    noteBtn.className = 'btn-white-outline exerciseNoteBtn';
    noteBtn.type = 'button';
    noteBtn.textContent = 'Pista';

    const noteText = document.createElement('div');
    noteText.className = 'exerciseNote';
    noteText.textContent = toOneLine(notes, 150);
    noteText.style.display = IMMERSIVE_MODE ? 'none' : 'none';
    if (IMMERSIVE_MODE) {
      noteBtn.style.display = 'none';
    }

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
  const optionItems = exerciseModel.options.length
    ? exerciseModel.options.map((opt) => ({ id: opt.id, text: opt.text }))
    : parseOptionItems(ex.options);

  const answerWrap = document.createElement('div');
  answerWrap.className = 'exerciseAnswer';

  const resultEl = document.createElement('div');
  resultEl.className = 'exerciseResult';

  const actions = document.createElement('div');
  actions.className = 'exerciseActions';

  if (isTest) {
    let selectedValue = '';
    let selectedLabel = '';
    let selectedOptionId = '';
    let optsWrap = null;
    const correctOptionId = resolveCorrectOptionId(ex, optionItems);
    const testDone = progressState.doneIds.has(String(ex.id));
    if (testDone) {
      setExerciseCardState(card, 'disabled');
      lockExerciseCard(card, true);
    }

    if (optionItems.length) {
      optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `test_${ex.id}`;

      optionItems.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const optionText = String(opt.text || '').trim();
        const row = makeOptionRow({
          name: groupName,
          value: optionText,
          label: optionText,
          checked: false,
          optionId: opt.id,
          onChange: (ev) => {
            selectedOptionId = String(ev.target.dataset.optionId || opt.id || '');
            selectedValue = optionText;
            selectedLabel = label;
            syncChoiceOptionState(optsWrap, {
              selectedId: selectedOptionId,
              correctId: correctOptionId,
              checked: false,
            });
          },
        });
        optsWrap.appendChild(row);
      });
      promptBlock.appendChild(optsWrap);
    } else {
      const input = document.createElement('input');
      input.className = 'input';
      input.placeholder = 'Escribe tu respuesta...';
      input.addEventListener('input', (ev) => {
        selectedValue = ev.target.value;
        selectedLabel = '';
      });
      wireSelectionInput(input);
      answerWrap.appendChild(input);
      card.appendChild(answerWrap);
      attachPolishAssistPad(card, [input]);
    }

    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn-yellow';
    btnCheck.textContent = 'Comprobar';
    btnCheck.disabled = testDone;

    btnCheck.addEventListener('click', async () => {
      if (testDone) return;
      const userAnswer = String(selectedValue || '').trim();
      if (!userAnswer) {
        showToast('Escribe o elige una respuesta.', 'warn', 1800);
        return;
      }

      let correct = false;
      if (optionItems.length) {
        correct = isChoiceAnswerCorrect(ex, optionItems, {
          selectedOptionId,
          selectedValue: userAnswer,
          selectedLabel,
        });
        syncChoiceOptionState(optsWrap, {
          selectedId: selectedOptionId,
          correctId: correctOptionId,
          checked: true,
        });
      } else {
        correct = strictAnswerMatch(userAnswer, ex.answer || '', { allowPlainMatch: true });
      }

      progressState.testResults.set(String(ex.id), {
        correct,
        answer: userAnswer,
      });
      progressState.doneIds.add(String(ex.id));
      lockExerciseCard(card, true);

      if (correct) {
        setResultText(resultEl, true);
      } else if (!optionItems.length) {
        setResultText(
          resultEl,
          false,
          `Incorrecto. ${orthographyHint(userAnswer, ex.answer || '')}`,
        );
      } else {
        setResultText(resultEl, false);
      }
      if (!correct) {
        await appendMistakeLog(ex, userAnswer, expectedAnswerPreview(ex));
      }
      await saveProgress();
      setProgressUI();
      btnCheck.disabled = true;
      if (IMMERSIVE_MODE) onImmersiveExerciseDone(ex.id);
    });

    actions.appendChild(btnCheck);
    card.appendChild(actions);
    card.appendChild(resultEl);

    const prev = progressState.testResults.get(String(ex.id));
    if (prev) {
      setResultText(resultEl, prev.correct === true);
      btnCheck.disabled = true;
      lockExerciseCard(card, true);
      if (optionItems.length) {
        const prevAnswer = String(prev.answer || '').trim();
        const prevItem =
          optionItems.find((opt) => normalizeOptionId(opt.id) === normalizeOptionId(prevAnswer)) ||
          optionItems.find((opt) => normalizeText(opt.text) === normalizeText(prevAnswer));
        syncChoiceOptionState(optsWrap, {
          selectedId: prevItem?.id || '',
          correctId: correctOptionId,
          checked: true,
        });
      }
    }
  } else {
    const exId = String(ex.id);
    const done = progressState.doneIds.has(exId);
    if (done) {
      setExerciseCardState(card, 'disabled');
      lockExerciseCard(card, true);
    }

    const markDone = async () => {
      lockExerciseCard(card, true);
      if (
        card.dataset.exerciseState === 'idle' ||
        card.dataset.exerciseState === 'selected'
      ) {
        setExerciseCardState(card, 'disabled');
      }
      progressState.doneIds.add(exId);
      await saveProgress();
      setProgressUI();
      if (IMMERSIVE_MODE) onImmersiveExerciseDone(exId);
    };

    const markWrong = async (userAnswer = '', expectedAnswer = '') => {
      setExerciseCardState(card, 'checked_wrong');
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

    if (isSceneExercise(ex) && optionItems.length && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Microescena: elige la mejor respuesta.';
      card.appendChild(hint);

      let selectedValue = '';
      let selectedLabel = '';
      let selectedOptionId = '';
      const correctOptionId = resolveCorrectOptionId(ex, optionItems);
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `scene_${ex.id}`;
      let btnCheck = null;

      optionItems.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const optionText = String(opt.text || '').trim();
        const row = makeOptionRow({
          name: groupName,
          value: optionText,
          label: optionText,
          checked: false,
          optionId: opt.id,
          onChange: (ev) => {
            selectedOptionId = String(ev.target.dataset.optionId || opt.id || '');
            selectedValue = optionText;
            selectedLabel = label;
            syncChoiceOptionState(optsWrap, {
              selectedId: selectedOptionId,
              correctId: correctOptionId,
              checked: false,
            });
            maybeAutoAcceptChoice(btnCheck, selectedOptionId, correctOptionId);
          },
          ttsText: optionText,
        });
        if (done) {
          const input = row.querySelector('input');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      promptBlock.appendChild(optsWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Escuchar (PL)';
        btnListen.setAttribute('aria-label', 'Escuchar (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;
      btnCheck.addEventListener('click', async () => {
        if (done) return;
        if (!selectedValue || !selectedOptionId) {
          showToast('Elige una respuesta.', 'warn', 1800);
          return;
        }
        const ok = isChoiceAnswerCorrect(ex, optionItems, {
          selectedOptionId,
          selectedValue,
          selectedLabel,
        });
        syncChoiceOptionState(optsWrap, {
          selectedId: selectedOptionId,
          correctId: correctOptionId,
          checked: true,
        });

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'No, intenta otra vez.');
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(selectedValue, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });
      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
        syncChoiceOptionState(optsWrap, {
          selectedId: resolveCorrectOptionId(ex, optionItems),
          correctId: resolveCorrectOptionId(ex, optionItems),
          checked: true,
        });
      }
      return card;
    }

    if (isFindErrorExercise(ex) && optionItems.length && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Encuentra el error y elige la version correcta.';
      card.appendChild(hint);

      const wrong = document.createElement('div');
      wrong.className = 'exerciseErrorBox';
      wrong.textContent = `Frase: ${promptText}`;
      promptBlock.appendChild(wrong);

      let selectedValue = '';
      let selectedLabel = '';
      let selectedOptionId = '';
      const correctOptionId = resolveCorrectOptionId(ex, optionItems);
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `fix_${ex.id}`;
      let btnCheck = null;

      optionItems.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const optionText = String(opt.text || '').trim();
        const row = makeOptionRow({
          name: groupName,
          value: optionText,
          label: optionText,
          checked: false,
          optionId: opt.id,
          onChange: (ev) => {
            selectedOptionId = String(ev.target.dataset.optionId || opt.id || '');
            selectedValue = optionText;
            selectedLabel = label;
            syncChoiceOptionState(optsWrap, {
              selectedId: selectedOptionId,
              correctId: correctOptionId,
              checked: false,
            });
            maybeAutoAcceptChoice(btnCheck, selectedOptionId, correctOptionId);
          },
          ttsText: optionText,
        });
        if (done) {
          const input = row.querySelector('input');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      promptBlock.appendChild(optsWrap);

      btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;
      btnCheck.addEventListener('click', async () => {
        if (done) return;
        if (!selectedValue || !selectedOptionId) {
          showToast('Elige la opcion correcta.', 'warn', 1800);
          return;
        }
        const ok = isChoiceAnswerCorrect(ex, optionItems, {
          selectedOptionId,
          selectedValue,
          selectedLabel,
        });
        syncChoiceOptionState(optsWrap, {
          selectedId: selectedOptionId,
          correctId: correctOptionId,
          checked: true,
        });

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'No, esa no es la correccion.');
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(selectedValue, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });
      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
        syncChoiceOptionState(optsWrap, {
          selectedId: resolveCorrectOptionId(ex, optionItems),
          correctId: resolveCorrectOptionId(ex, optionItems),
          checked: true,
        });
      }
      return card;
    }

    if (isSpeakingExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Lee en voz alta. Escucha y luego graba tu voz.';
      card.appendChild(hint);

      const checklist = [
        'El ritmo y las pausas son naturales.',
        'Las terminaciones y la flexion son correctas.',
        'El acento en las palabras es correcto.',
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
      btnListen.title = 'Escuchar (PL)';
      btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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
            showToast('Marca la checklist de pronunciacion antes de guardar.', 'warn', 2100);
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
          showToast('Tu navegador no soporta grabacion.', 'warn', 2200);
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
        warn.textContent = 'Grabacion no disponible en este navegador.';
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
          setExerciseCardState(card, 'selected');
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
        btnListen.title = 'Escuchar (PL)';
        btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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
      wireSelectionInput(box);
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);
      attachPolishAssistPad(card, [box]);

      const btnListen = document.createElement('button');
      btnListen.className = 'ttsIconBtn';
      btnListen.type = 'button';
      btnListen.textContent = SPEAKER_ICON;
      btnListen.title = 'Escuchar (PL)';
      btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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

        const answerObj = answerObjectOf(ex.answer);
        const expectedList = parseAcceptedAnswerValues(ex.answer || '').filter(Boolean);
        const expectedFirst = String(expectedList[0] || ex.answer || '').trim();
        const typoTolerance = Number(answerObj?.typoTolerance ?? answerObj?.tolerance ?? 1);
        const exact = strictAnswerMatch(val, ex.answer || '', {
          allowPlainMatch: true,
          tolerance: Number.isFinite(typoTolerance) ? Math.max(0, Math.min(2, typoTolerance)) : 1,
        });
        const score = expectedList.length
          ? Math.max(...expectedList.map((item) => dictationSimilarity(val, item)))
          : dictationSimilarity(val, expectedFirst);
        const ok = exact;

        setResultText(
          resultEl,
          ok,
          ok
            ? `Correcto (${score}%).`
            : `No coincide (${score}%). ${orthographyHint(val, ex.answer || '')}`,
        );
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(val, ex.answer || '');
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

        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blankCount, promptText);
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
          btnListen.title = 'Escuchar (PL)';
          btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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

    if (isChoiceExercise(ex) && optionItems.length && String(ex.answer || '').trim()) {
      let selectedValue = '';
      let selectedLabel = '';
      let selectedOptionId = '';
      const correctOptionId = resolveCorrectOptionId(ex, optionItems);
      let btnCheck = null;

      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `pr_${ex.id}`;
      const speakOptions = shouldSpeakChoiceOptions(ex, options);

      optionItems.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const optionText = String(opt.text || '').trim();
        const ttsText = speakOptions ? optionText : '';
        const row = makeOptionRow({
          name: groupName,
          value: optionText,
          label: optionText,
          checked: false,
          optionId: opt.id,
          onChange: (ev) => {
            selectedOptionId = String(ev.target.dataset.optionId || opt.id || '');
            selectedValue = optionText;
            selectedLabel = label;
            syncChoiceOptionState(optsWrap, {
              selectedId: selectedOptionId,
              correctId: correctOptionId,
              checked: false,
            });
            maybeAutoAcceptChoice(btnCheck, selectedOptionId, correctOptionId);
          },
          ttsText,
        });
        if (done) {
          const input = row.querySelector('input[type="radio"]');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      promptBlock.appendChild(optsWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Escuchar (PL)';
        btnListen.setAttribute('aria-label', 'Escuchar (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const userAnswer = String(selectedValue || '').trim();
        if (!userAnswer || !selectedOptionId) {
          showToast('Elige una respuesta.', 'warn', 1800);
          return;
        }

        const correct = isChoiceAnswerCorrect(ex, optionItems, {
          selectedOptionId,
          selectedValue: userAnswer,
          selectedLabel,
        });
        syncChoiceOptionState(optsWrap, {
          selectedId: selectedOptionId,
          correctId: correctOptionId,
          checked: true,
        });

        setResultText(resultEl, correct, correct ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);

        if (!correct) {
          await markWrong(userAnswer, expectedAnswerPreview(ex));
          return;
        }

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
        syncChoiceOptionState(optsWrap, {
          selectedId: resolveCorrectOptionId(ex, optionItems),
          correctId: resolveCorrectOptionId(ex, optionItems),
          checked: true,
        });
      }

      return card;
    }

    if (isTranslateExercise(ex) && String(ex.answer || '').trim()) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Traduce al polaco y escribe la respuesta correcta.';
      card.appendChild(hint);

      const box = document.createElement('textarea');
      box.className = 'input';
      box.rows = 3;
      box.placeholder = 'Escribe tu traduccion en polaco...';
      box.autocomplete = 'off';
      box.spellcheck = false;
      box.disabled = done;
      wireSelectionInput(box);
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const val = String(box.value || '').trim();
        if (!val) {
          showToast('Escribe tu traduccion.', 'warn', 1700);
          return;
        }
        const ok = strictAnswerMatch(val, ex.answer || '', { allowPlainMatch: true });
        setResultText(
          resultEl,
          ok,
          ok ? 'Correcto.' : `Intenta otra vez. ${orthographyHint(val, ex.answer || '')}`,
        );
        card.appendChild(resultEl);
        if (!ok) {
          await markWrong(val, ex.answer || '');
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

    if (isAnagramExercise(ex) && String(ex.answer || '').trim()) {
      let rawTokens = options.map((o) => stripLeadLabel(o)).filter(Boolean);
      if (rawTokens.length === 1) {
        const maybeSplit = rawTokens[0]
          .split(/[\s,;|]+/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (maybeSplit.length > 1) rawTokens = maybeSplit;
      }
      if (!rawTokens.length) {
        rawTokens = String(parseAnswerList(ex.answer || '')[0] || ex.answer || '')
          .split('')
          .map((x) => x.trim())
          .filter(Boolean);
      }
      if (rawTokens.length > 1) {
        const tokens = shuffleArray(rawTokens.map((t, idx) => ({ id: String(idx), text: t })));
        const selected = [];
        const available = new Map(tokens.map((t) => [t.id, t]));

        const wrap = document.createElement('div');
        wrap.className = 'exerciseOrderWrap';

        const built = document.createElement('div');
        built.className = 'exerciseOrderBuilt';

        const bank = document.createElement('div');
        bank.className = 'exerciseOrderBank';

        const buildWord = () =>
          selected
            .map((t) => String(t?.text || '').trim())
            .join('')
            .replace(/\s+/g, ' ')
            .trim();

        const render = () => {
          built.innerHTML = '';
          const builtText = document.createElement('span');
          builtText.textContent = buildWord() || '-';
          built.appendChild(builtText);

          bank.innerHTML = '';
          tokens.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-white-outline exerciseOrderToken';
            btn.textContent = t.text;
            const isAvailable = available.has(t.id);
            btn.classList.toggle('isDisabled', done || !isAvailable);
            btn.disabled = done || !isAvailable;
            btn.addEventListener('click', () => {
              if (done || !available.has(t.id)) return;
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
        labelBuilt.textContent = 'Forma la palabra correcta:';
        wrap.appendChild(labelBuilt);
        wrap.appendChild(built);

        const labelBank = document.createElement('div');
        labelBank.className = 'exerciseHint';
        labelBank.style.marginTop = '10px';
        labelBank.textContent = 'Letras / silabas:';
        wrap.appendChild(labelBank);
        wrap.appendChild(bank);
        card.appendChild(wrap);

        const btnUndo = document.createElement('button');
        btnUndo.className = 'btn-white-outline';
        btnUndo.type = 'button';
        btnUndo.textContent = 'Borrar ultima';
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
          const val = buildWord();
          if (!val) {
            showToast('Completa la palabra.', 'warn', 1500);
            return;
          }
          const ok = strictAnswerMatch(val, ex.answer || '', { allowPlainMatch: true });
          setResultText(
            resultEl,
            ok,
            ok ? 'Correcto.' : `Intenta otra vez. ${orthographyHint(val, ex.answer || '')}`,
          );
          card.appendChild(resultEl);
          if (!ok) {
            await markWrong(val, ex.answer || '');
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

    if (isFillExercise(ex) && String(ex.answer || '').trim()) {
      const fillPromptText = promptText;
      const slotFields = [];
      const slotControllers = [];
      let btnCheck = null;

      if (fillPromptText.includes('___')) {
        prompt.textContent = '';
        const parts = fillPromptText.split('___');
        const blanksCount = Math.max(1, parts.length - 1);
        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blanksCount, fillPromptText);

        parts.forEach((part, idx) => {
          prompt.appendChild(document.createTextNode(part));
          if (idx === parts.length - 1) return;

          const accepted = expectedByBlank[idx] || expectedByBlank[0] || [];
          const template = String(accepted[0] || '').trim();
          const slot = createLetterSlotsInput(template, { disabled: done });
          slotControllers.push(slot);
          slotFields.push(...slot.fields);
          prompt.appendChild(slot.el);
        });
      } else {
        const accepted = parseExpectedByBlank(ex.answer || '', 1, fillPromptText)[0] || [];
        const template = String(accepted[0] || ex.answer || '').trim();
        const slot = createLetterSlotsInput(template, { disabled: done });
        slotControllers.push(slot);
        slotFields.push(...slot.fields);
        answerWrap.appendChild(slot.el);
        card.appendChild(answerWrap);
      }

      if (slotFields.length) {
        attachPolishAssistPad(card, slotFields);
      }

      const tryAutoAcceptFill = () => {
        if (done || !btnCheck || btnCheck.disabled) return;
        const blanksCount = slotControllers.length || 1;
        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blanksCount, fillPromptText);
        const values = slotControllers.map((slot) => String(slot.getValue() || '').trim());
        if (!values.length) return;
        if (slotControllers.some((slot) => !slot.isComplete()) || values.some((v) => !v)) return;
        let ok = true;
        for (let i = 0; i < values.length; i += 1) {
          const accepted = expectedByBlank[i] || expectedByBlank[0] || [];
          const u = normalizeOrthographyText(values[i]);
          const acc = accepted.map((x) => normalizeOrthographyText(x));
          if (!acc.includes(u)) {
            ok = false;
            break;
          }
        }
        if (ok) btnCheck.click();
      };

      btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      slotFields.forEach((field) => {
        field.addEventListener('input', () => {
          setTimeout(() => {
            tryAutoAcceptFill();
          }, 0);
        });
      });

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const blanksCount = slotControllers.length || 1;
        const expectedByBlank = parseExpectedByBlank(ex.answer || '', blanksCount, fillPromptText);
        const values = slotControllers.map((slot) => String(slot.getValue() || '').trim());

        if (slotControllers.some((slot) => !slot.isComplete()) || values.some((v) => !v)) {
          showToast('Completa los espacios.', 'warn', 1800);
          return;
        }

        let ok = true;
        let hintMsg = '';
        for (let i = 0; i < values.length; i += 1) {
          const accepted = expectedByBlank[i] || expectedByBlank[0] || [];
          const u = normalizeOrthographyText(values[i]);
          const acc = accepted.map((x) => normalizeOrthographyText(x));
          if (!acc.includes(u)) {
            ok = false;
            hintMsg = orthographyHint(values[i], accepted.join('|'));
            break;
          }
        }

        setResultText(
          resultEl,
          ok,
          ok ? 'Correcto.' : `Intenta de nuevo. ${hintMsg || 'Revisa la ortografia.'}`,
        );
        card.appendChild(resultEl);

        if (!ok) {
          await markWrong(values.join(' | '), ex.answer || '');
          return;
        }

        slotControllers.forEach((slot) => slot.disable(true));
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
            if (badge) badge.textContent = paired ? `-> ${paired}` : '';
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
                <span class="ttsInlineIcon" role="button" tabindex="0" title="Escuchar (PL)" aria-label="Escuchar (PL)">${SPEAKER_ICON}</span>
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
          btnListen.title = 'Escuchar (PL)';
          btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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
        let btnCheck = null;
        const buildSentenceText = () =>
          selected
            .map((t) => t.text)
            .join(' ')
            .replace(/\s+([?.!,;:])/g, '$1');
        const tryAutoAcceptOrder = () => {
          if (done || !btnCheck || btnCheck.disabled) return;
          if (selected.length < tokens.length) return;
          const sentence = buildSentenceText();
          const ok = strictAnswerMatch(sentence, ex.answer || '', { allowPlainMatch: true });
          if (!ok) return;
          setTimeout(() => {
            if (!btnCheck.disabled) btnCheck.click();
          }, 0);
        };

        const wrap = document.createElement('div');
        wrap.className = 'exerciseOrderWrap';

        const built = document.createElement('div');
        built.className = 'exerciseOrderBuilt';
        built.textContent = '';

        const bank = document.createElement('div');
        bank.className = 'exerciseOrderBank';

        const render = () => {
          const sentence = buildSentenceText();
          built.innerHTML = '';
          const builtText = document.createElement('span');
          builtText.textContent = sentence || '-';
          built.appendChild(builtText);
          if (sentence) {
            const speakBtn = makeSpeakerBtn(sentence, { title: 'Escuchar la frase (PL)', tiny: true });
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
            sp.title = 'Escuchar (PL)';
            sp.setAttribute('aria-label', 'Escuchar (PL)');
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
          tryAutoAcceptOrder();
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
          btnListen.title = 'Escuchar (PL)';
          btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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

        btnCheck = document.createElement('button');
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
          const sentence = buildSentenceText();
          const ok = strictAnswerMatch(sentence, ex.answer || '', {
            allowPlainMatch: true,
          });

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
      box.placeholder = 'Escribe aqui...';
      box.autocomplete = 'off';
      box.spellcheck = true;
      box.disabled = done;
      wireSelectionInput(box);
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);
      attachPolishAssistPad(card, [box]);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Escuchar (PL)';
        btnListen.setAttribute('aria-label', 'Escuchar (PL)');
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

  LETTER_SLOT_GROUPS.clear();
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

  const loaded = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    loaded.push(normalizeExercise({ id: d.id, ...data }));
  });
  const newestSeedScoped = filterToNewestSeedVersion(loaded);
  let scoped = newestSeedScoped;
  if (LESSON_ID) {
    const filtered = newestSeedScoped.filter((item) => matchesLesson(item, LESSON_ID));
    if (filtered.length) scoped = filtered;
  }
  cachedExercises = scoped;

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

async function resetCourseFromStart() {
  if (!CURRENT_UID) {
    showToast('Sesion no activa.', 'warn', 1800);
    return;
  }
  if (resetCourseBusy) return;

  const ok = window.confirm(
    'Zresetowac kurs i zaczac od poczatku? To usunie postep cwiczen dla tej trasy.',
  );
  if (!ok) return;

  resetCourseBusy = true;
  const originalLabel = btnResetCourse?.textContent || 'Resetear curso';
  if (btnResetCourse) {
    btnResetCourse.disabled = true;
    btnResetCourse.textContent = 'Reseteando...';
  }

  try {
    const flags =
      CURRENT_FLAGS || (await getUserFlags(CURRENT_UID, auth.currentUser?.email || ''));
    const levelsToReset = CONTINUOUS_FLOW
      ? [...LEVEL_ORDER]
      : routeLevelsFromFlags(flags || {}).slice(0, 1);
    const route = CONTINUOUS_FLOW
      ? await getRouteTopicsForLevels(levelsToReset)
      : await getRouteTopicsForLevel(String(LEVEL || 'A1').toUpperCase());
    const progressKeys = new Set(
      route
        .map((topic) => topicProgressKey(topicLevelOf(topic, LEVEL), topic))
        .filter(Boolean),
    );

    const refsToDelete = [];
    try {
      const topicSnap = await getDocs(collection(db, 'user_progress', CURRENT_UID, 'topics'));
      topicSnap.forEach((d) => {
        if (!progressKeys.size || progressKeys.has(String(d.id || ''))) refsToDelete.push(d.ref);
      });
    } catch (e) {
      console.warn('[ejercicio] reset topics read failed', e);
    }

    if (CONTINUOUS_FLOW) {
      try {
        const cpSnap = await getDocs(collection(db, 'user_progress', CURRENT_UID, 'checkpoints'));
        cpSnap.forEach((d) => refsToDelete.push(d.ref));
      } catch (e) {
        console.warn('[ejercicio] reset checkpoints read failed', e);
      }
    }

    for (let i = 0; i < refsToDelete.length; i += 20) {
      const chunk = refsToDelete.slice(i, i + 20);
      await Promise.all(chunk.map((ref) => deleteDoc(ref)));
    }

    progressState.doneIds = new Set();
    progressState.testResults = new Map();
    completedAt = null;
    hasShownFinish = false;

    const firstTopic = route.find((t) => String(t?.id || '').trim()) || currentTopic;
    if (firstTopic?.id) {
      const firstLevel = topicLevelOf(firstTopic, LEVEL);
      const href = `ejercicio.html?level=${encodeURIComponent(firstLevel)}&id=${encodeURIComponent(firstTopic.id)}${navParams()}`;
      window.location.href = href;
      return;
    }

    await loadExercises(currentTopic);
    showToast('Curso reseteado.', 'ok', 1800);
  } catch (e) {
    console.error('[ejercicio] resetCourseFromStart failed', e);
    showToast('No se pudo resetear el curso.', 'bad', 2600);
  } finally {
    resetCourseBusy = false;
    if (btnResetCourse) {
      btnResetCourse.disabled = false;
      btnResetCourse.textContent = originalLabel;
    }
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
        txt.textContent = `${exerciseLine} ${testLine} Excelente. Ahora haz el mini-test checkpoint ${checkpointNo} para desbloquear los siguientes 3 modulos.`;
      } else {
        txt.textContent = `${exerciseLine} ${testLine}`;
      }
    } else if (CONTINUOUS_FLOW) {
      txt.textContent = `${exerciseLine} ${testLine} Se requiere repaso: necesitas 100% de practica y 100% de test para desbloquear el siguiente modulo.`;
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
    btnLesson.textContent = stats.completed ? 'Volver a la lección' : 'Volver al módulo';
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
  if (btnResetCourse && !btnResetCourse.dataset.wired) {
    btnResetCourse.dataset.wired = '1';
    btnResetCourse.addEventListener('click', () => {
      resetCourseFromStart().catch((e) => {
        console.error('[ejercicio] reset click failed', e);
      });
    });
  }

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
        btnReview.href = `review.html?level=${encodeURIComponent(topicLevel)}&id=${encodeURIComponent(topic.id)}${navParams()}&mode=errors`;
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
    if (btnResetCourse) btnResetCourse.style.display = flags.hasAccess ? '' : 'none';
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
