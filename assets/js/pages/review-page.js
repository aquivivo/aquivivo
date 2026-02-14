// assets/js/pages/review-page.js
// Simple spaced repetition (Leitner-like) for flashcards from "Tarjetas interactivas"

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
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  applyLearningReward,
  checkpointBlockRange,
  writeCheckpoint,
} from '../progress-tools.js';

const $ = (id) => document.getElementById(id);

const NAV_QS = new URLSearchParams(window.location.search);
const TRACK = String(NAV_QS.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(NAV_QS.get('view') || '').trim().toLowerCase();
const FLOW = String(NAV_QS.get('flow') || '').trim().toLowerCase();
const MODE_PARAM = String(NAV_QS.get('mode') || '').trim().toLowerCase();
const BLOCK_PARAM = Math.max(0, Number(NAV_QS.get('block') || NAV_QS.get('checkpoint') || 0));

const DEFAULT_DAILY_LIMIT = 20;
const DAILY_CHALLENGE_LIMIT = 10;
const MINITEST_LIMIT = 12;
const SPRINT_SECONDS = 60;
const MINITEST_PASS_PCT = 80;
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
const CARD_TYPE_HINT = 'tarjeta';
const REVIEW_MODES = ['srs', 'daily', 'sprint', 'errors', 'minitest'];
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

let queue = [];
let currentIdx = 0;
let currentCard = null;
let showBack = false;
let srsMap = new Map();
let userDocCache = null;
let userLevelsCache = [];
let CURRENT_UID = null;
let allowedTopicCache = new Map();
let reviewMode = REVIEW_MODES.includes(MODE_PARAM) ? MODE_PARAM : 'srs';
let sessionCorrect = 0;
let sessionWrong = 0;
let sprintLeft = SPRINT_SECONDS;
let sprintTimerId = 0;
let sprintEnded = false;
let minitestBlock = BLOCK_PARAM > 0 ? BLOCK_PARAM : 0;
let cardsCache = [];
let mistakesCache = [];
let sessionFinalized = false;

function toDateMaybe(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts?.toDate) return ts.toDate();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function modeLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'daily') return 'Daily challenge';
  if (m === 'sprint') return 'Sprint 60s';
  if (m === 'errors') return 'Powtorka bledow';
  if (m === 'minitest') return 'Mini-test checkpoint';
  return 'SRS normal';
}

function courseBackHref(level = 'A1') {
  const lvl = String(level || 'A1').toUpperCase();
  const page = COURSE_VIEW === 'latam'
    ? 'curso-latam.html'
    : COURSE_VIEW === 'pro'
      ? 'kurs-pl.html'
      : 'course.html';
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  if (COURSE_VIEW) href += `&view=${encodeURIComponent(COURSE_VIEW)}`;
  if (FLOW === 'continuous' || COURSE_VIEW === 'pro') href += '&flow=continuous';
  return href;
}

function scorePct() {
  const total = sessionCorrect + sessionWrong;
  if (!total) return 0;
  return Math.round((sessionCorrect / total) * 100);
}

function updateModeUI() {
  const modeLabelEl = $('reviewModeLabel');
  const timerEl = $('reviewTimer');
  const subtitleEl = $('reviewSubtitle');
  const modeEl = $('reviewMode');
  const levelEl = $('reviewLevel');
  const topicEl = $('reviewTopic');
  const onlyFavEl = $('reviewOnlyFav');

  if (modeLabelEl) modeLabelEl.textContent = `Tryb: ${modeLabel(reviewMode)}`;
  if (modeEl && modeEl.value !== reviewMode) modeEl.value = reviewMode;

  if (timerEl) {
    if (reviewMode === 'sprint') {
      timerEl.style.display = '';
      timerEl.textContent = `Tiempo: ${Math.max(0, sprintLeft)}s`;
    } else {
      timerEl.style.display = 'none';
    }
  }

  if (subtitleEl) {
    if (reviewMode === 'errors') {
      subtitleEl.textContent = 'Powtorka najczestszych bledow z Twoich cwiczen.';
    } else if (reviewMode === 'daily') {
      subtitleEl.textContent = 'Codzienne 10 kart na utrwalenie i streak.';
    } else if (reviewMode === 'sprint') {
      subtitleEl.textContent = 'Masz 60 sekund. Odpowiadaj jak najszybciej.';
    } else if (reviewMode === 'minitest') {
      subtitleEl.textContent = 'Checkpoint po 3 modulach. Potrzebujesz min. 80%.';
    } else {
      subtitleEl.textContent = 'Mini-repasos para la memoria a largo plazo.';
    }
  }

  const lockTopic = reviewMode === 'errors' || reviewMode === 'minitest';
  if (topicEl) topicEl.disabled = lockTopic;
  if (levelEl) levelEl.disabled = reviewMode === 'minitest';
  if (onlyFavEl) onlyFavEl.disabled = reviewMode !== 'srs' && reviewMode !== 'daily';
}

function updateScoreUI() {
  const scoreEl = $('reviewScore');
  if (!scoreEl) return;
  const answered = sessionCorrect + sessionWrong;
  if (reviewMode === 'minitest') {
    scoreEl.textContent = `Wynik: ${sessionCorrect}/${answered || 0} (${scorePct()}%)`;
    return;
  }
  if (reviewMode === 'sprint') {
    scoreEl.textContent = `Puntos: ${sessionCorrect} OK / ${sessionWrong} no`;
    return;
  }
  scoreEl.textContent = `Puntos: ${sessionCorrect} OK / ${sessionWrong} no`;
}

function resetSession() {
  sessionCorrect = 0;
  sessionWrong = 0;
  sprintLeft = SPRINT_SECONDS;
  sprintEnded = false;
  updateModeUI();
  updateScoreUI();
}

function formatShortDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function parseProgressDocId(docId = '') {
  const raw = String(docId || '').trim();
  if (!raw) return { level: '', topicPart: '' };
  const pos = raw.indexOf('__');
  if (pos < 0) return { level: '', topicPart: raw };
  return {
    level: String(raw.slice(0, pos) || '').toUpperCase(),
    topicPart: String(raw.slice(pos + 2) || '').trim(),
  };
}

function summarizeProgressDocs(docs = []) {
  const total = docs.length;
  let completed = 0;
  let practiceSum = 0;
  let practiceCount = 0;
  let testSum = 0;
  let testCount = 0;
  let lastDoc = null;
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
    if (dt && (!lastTs || dt.getTime() > lastTs.getTime())) {
      lastTs = dt;
      lastDoc = { id: d.id, data };
    }
  });

  return {
    topicsTotal: total,
    topicsCompleted: completed,
    practiceAvg: practiceCount ? Math.round(practiceSum / practiceCount) : null,
    testAvg: testCount ? Math.round(testSum / testCount) : null,
    lastDoc,
    lastActivity: lastTs,
  };
}

function setPracticarOverviewDefaults() {
  const setText = (id, txt) => {
    const el = $(id);
    if (el) el.textContent = txt;
  };

  setText('prLastWhen', '—');
  setText('prLastTitle', '—');
  const link = $('prLastLink');
  if (link) link.href = courseBackHref('A1');

  setText('prProgTopics', 'Temas: -');
  setText('prProgCompleted', 'Completados: -');
  setText('prProgPractice', 'Práctica: -');
  setText('prProgTest', 'Test: -');
  setText('prProgLastActivity', 'Última actividad: -');

  setText('prDue', 'Para hoy: -');
  setText('prOverdue', 'Atrasadas: -');
  setText('prNew', 'Nuevas: -');
  setText('prPlan', 'Plan: -');
  setText('prReviewHint', '');
  const week = $('prWeek');
  if (week) week.innerHTML = '';
}

async function loadPracticarOverview(uid) {
  if (!uid) return;
  setPracticarOverviewDefaults();

  try {
    const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const summary = summarizeProgressDocs(snap.docs || []);

    const topicsEl = $('prProgTopics');
    const completedEl = $('prProgCompleted');
    const practiceEl = $('prProgPractice');
    const testEl = $('prProgTest');
    const lastActivityEl = $('prProgLastActivity');
    const lastWhenEl = $('prLastWhen');
    const lastTitleEl = $('prLastTitle');
    const lastLinkEl = $('prLastLink');

    if (topicsEl) topicsEl.textContent = `Temas: ${summary.topicsTotal}`;
    if (completedEl) {
      completedEl.textContent = `Completados: ${summary.topicsCompleted}/${summary.topicsTotal}`;
    }
    if (practiceEl) {
      practiceEl.textContent =
        summary.practiceAvg == null ? 'Práctica: -' : `Práctica: ${summary.practiceAvg}%`;
    }
    if (testEl) {
      testEl.textContent = summary.testAvg == null ? 'Test: -' : `Test: ${summary.testAvg}%`;
    }

    const dt = summary.lastActivity ? formatShortDate(summary.lastActivity) : '';
    if (lastActivityEl) {
      lastActivityEl.textContent = dt ? `Última actividad: ${dt}` : 'Última actividad: -';
    }
    if (lastWhenEl) lastWhenEl.textContent = dt || '—';

    if (summary.lastDoc) {
      const part = parseProgressDocId(summary.lastDoc.id);
      const topicId = String(summary.lastDoc.data?.topicId || part.topicPart || '').trim();
      const level = String(summary.lastDoc.data?.level || part.level || 'A1').toUpperCase();
      if (lastTitleEl) lastTitleEl.textContent = topicId ? `Tema: ${topicId}` : `Nivel ${level}`;
      if (lastLinkEl) {
        let href = courseBackHref(level);
        if (topicId) href += `&id=${encodeURIComponent(topicId)}&autostart=1`;
        lastLinkEl.href = href;
      }
    }
  } catch (e) {
    console.warn('[review] loadPracticarOverview failed', e);
  }

  try {
    const dueEl = $('prDue');
    const overEl = $('prOverdue');
    const newEl = $('prNew');
    const planEl = $('prPlan');
    const weekEl = $('prWeek');
    const hintEl = $('prReviewHint');

    const minutes = Number(userDocCache?.reviewDailyMinutes || 10);
    const limitCards = Number(userDocCache?.reviewDailyLimit || 20);
    const direction = String(userDocCache?.reviewDirection || 'pl_es');
    const dirLabel =
      direction === 'es_pl' ? 'ES → PL' : direction === 'mixed' ? 'Mixto' : 'PL → ES';
    if (planEl) {
      planEl.textContent = `Plan: ${minutes} min al día · ${limitCards} tarjetas/día · ${dirLabel}`;
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
    let fresh = 0;

    snap.forEach((d) => {
      const data = d.data() || {};
      const dueAt = toDateMaybe(data.dueAt);
      const reviews = Number(data.reviews || 0);
      if (reviews <= 0) fresh += 1;
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
    if (newEl) newEl.textContent = `Nuevas: ${fresh}`;

    if (weekEl) {
      const labels = ['Hoy', 'Mañana', 'D+2', 'D+3', 'D+4', 'D+5', 'D+6'];
      weekEl.innerHTML = weekCounts
        .map((c, i) => `<div class="reviewDay"><span>${labels[i]}</span><b>${c}</b></div>`)
        .join('');
    }
  } catch (e) {
    console.warn('[review] loadPracticarReviewSummary failed', e);
  }
}

function stopSprintTimer() {
  if (!sprintTimerId) return;
  clearInterval(sprintTimerId);
  sprintTimerId = 0;
}

function finishSprint() {
  if (sprintEnded) return;
  sprintEnded = true;
  stopSprintTimer();
  currentIdx = queue.length;
  renderCard();
}

function startSprintTimer() {
  stopSprintTimer();
  if (reviewMode !== 'sprint') return;
  sprintLeft = SPRINT_SECONDS;
  updateModeUI();
  sprintTimerId = window.setInterval(() => {
    sprintLeft -= 1;
    updateModeUI();
    if (sprintLeft <= 0) {
      finishSprint();
    }
  }, 1000);
}

function setReviewEmpty(title, message, href = 'espanel.html', btnLabel = 'Volver a la Libreta') {
  const empty = $('reviewEmpty');
  if (!empty) return;
  empty.innerHTML = `
    <div class="sectionTitle" style="margin-top: 0">${String(title || 'Sin repasos')}</div>
    <div class="muted">${String(message || '')}</div>
    <div style="margin-top: 12px">
      <a class="btn-yellow" href="${String(href || 'espanel.html')}">${String(btnLabel || 'Volver')}</a>
    </div>
  `;
}

async function finalizeSession() {
  if (sessionFinalized) return;
  sessionFinalized = true;
  stopSprintTimer();

  const answered = sessionCorrect + sessionWrong;
  const pct = scorePct();

  if (!CURRENT_UID) return;

  if (reviewMode === 'daily' && answered > 0) {
    await applyLearningReward(CURRENT_UID, {
      exp: 18,
      badges: ['daily_challenge'],
      oncePerDayKey: 'daily_challenge',
      source: 'review_daily',
    });
    setReviewEmpty(
      'Daily challenge listo',
      `Wynik: ${sessionCorrect}/${answered} (${pct}%). Wyzwanie zapisane do streaka.`,
    );
    return;
  }

  if (reviewMode === 'sprint' && answered > 0) {
    await applyLearningReward(CURRENT_UID, {
      exp: Math.max(8, sessionCorrect * 2),
      badges: sessionCorrect >= 10 ? ['sprint_10'] : [],
      oncePerDayKey: 'sprint_60',
      source: 'review_sprint',
    });
    setReviewEmpty(
      'Sprint zakonczony',
      `Czas minal. Trafione: ${sessionCorrect}, bledy: ${sessionWrong}.`,
    );
    return;
  }

  if (reviewMode === 'errors' && answered > 0) {
    await applyLearningReward(CURRENT_UID, {
      exp: Math.max(6, sessionCorrect),
      badges: sessionCorrect >= 15 ? ['error_hunter'] : [],
      oncePerDayKey: 'errors_review',
      source: 'review_errors',
    });
    setReviewEmpty(
      'Powtorka bledow zakonczona',
      `Przepracowalas ${answered} kart bledow. Wynik: ${pct}%.`,
    );
    return;
  }

  if (reviewMode === 'minitest' && answered > 0) {
    const passed = pct >= MINITEST_PASS_PCT;
    const lastTopic = cardsCache.find((c) => c.topicId)?.topicId || null;
    if (minitestBlock > 0) {
      await writeCheckpoint(
        CURRENT_UID,
        minitestBlock,
        {
          passed,
          scorePct: pct,
          answered,
          correct: sessionCorrect,
          level: cardsCache[0]?.level || null,
          lastTopicId: lastTopic,
        },
        {
          track: TRACK,
          view: COURSE_VIEW,
          flow: 'continuous',
        },
      );
    }
    if (passed) {
      await applyLearningReward(CURRENT_UID, {
        exp: 30,
        badges: ['checkpoint_pass'],
        oncePerDayKey: `checkpoint_${minitestBlock || 0}`,
        source: 'review_checkpoint',
      });
      setReviewEmpty(
        'Mini-test zaliczony',
        `Wynik ${pct}%. Kolejny modul jest odblokowany.`,
        courseBackHref(cardsCache[0]?.level || 'A1'),
        'Wroc do kursu',
      );
    } else {
      setReviewEmpty(
        'Mini-test niezaliczony',
        `Wynik ${pct}%. Potrzebujesz minimum ${MINITEST_PASS_PCT}%.`,
      );
    }
    return;
  }

  if (answered > 0) {
    await applyLearningReward(CURRENT_UID, {
      exp: Math.max(5, Math.round(answered / 2)),
      source: 'review_srs',
      oncePerDayKey: 'review_srs',
    });
  }
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

function progressPct(progress) {
  if (!progress) return 0;
  if (progress.completed === true) return 100;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  const best = testTotal > 0 ? Math.max(practice, testScore) : practice;
  const pct = Math.round(best);
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

function isTopicCompleted(progress) {
  if (!progress) return false;
  return progress.completed === true || progressPct(progress) >= 100;
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
  const lvl = String(level || '').toUpperCase();
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
    console.warn('[review] loadProgressMapForLevel failed', e);
    return {};
  }
}

async function loadRouteTopicsForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl), orderBy('order')),
    );
    const all = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true);
    const selected = selectTopicsForTrack(all);
    return buildMixedRoute(selected);
  } catch (e) {
    console.warn('[review] loadRouteTopicsForLevel failed', e);
    return [];
  }
}

async function isLevelCompleted(uid, level) {
  const lvl = String(level || '').toUpperCase();
  if (!uid || !lvl) return true;

  const route = await loadRouteTopicsForLevel(lvl);
  if (!route.length) return true;

  const progressMap = await loadProgressMapForLevel(uid, lvl);
  return route.every((t) => {
    const key = topicProgressKey(lvl, t);
    const prog = key ? progressMap[key] : null;
    return isTopicCompleted(prog);
  });
}

async function computeUnlockedLevels(uid, accessibleLevels) {
  const ordered = LEVEL_ORDER.filter((l) => (accessibleLevels || []).includes(l));
  if (ordered.length <= 1) return ordered.length ? ordered : ['A1'];

  const unlocked = [];
  const completionCache = {};
  for (const lvl of ordered) {
    if (!unlocked.length) {
      unlocked.push(lvl);
      continue;
    }
    const prev = unlocked[unlocked.length - 1];
    if (completionCache[prev] !== true) {
      completionCache[prev] = await isLevelCompleted(uid, prev);
    }
    if (completionCache[prev] === true) unlocked.push(lvl);
    else break;
  }
  return unlocked;
}

async function loadVisibleTopicsForLevel(uid, level) {
  const lvl = String(level || '').toUpperCase();
  if (!uid || !lvl) return [];

  const cached = allowedTopicCache.get(lvl);
  if (cached && Array.isArray(cached.topics)) return cached.topics;

  const route = await loadRouteTopicsForLevel(lvl);
  if (!route.length) {
    const out = { topics: [], idSet: new Set(), slugSet: new Set() };
    allowedTopicCache.set(lvl, out);
    return out.topics;
  }

  const progressMap = await loadProgressMapForLevel(uid, lvl);
  let firstIncomplete = route.findIndex((t) => {
    const key = topicProgressKey(lvl, t);
    const prog = key ? progressMap[key] : null;
    return !isTopicCompleted(prog);
  });
  if (firstIncomplete < 0) firstIncomplete = route.length - 1;

  const visibleCount = Math.min(route.length, Math.max(1, firstIncomplete + 1));
  const topics = route.slice(0, visibleCount);

  const idSet = new Set();
  const slugSet = new Set();
  topics.forEach((t) => {
    idSet.add(String(t.id));
    const slug = String(t.slug || t.id || '').trim();
    if (slug) slugSet.add(slug);
  });

  allowedTopicCache.set(lvl, { topics, idSet, slugSet });
  return topics;
}

function parseExampleValue(raw) {
  const out = { pron: '', plExample: '', esExample: '' };
  let value = String(raw || '').trim();
  if (!value) return out;

  const pronMatch = value.match(/^\s*pron\s*:\s*(.+?)(?:\s*[·•]\s*(.+))?\s*$/i);
  if (pronMatch) {
    out.pron = String(pronMatch[1] || '').trim();
    value = String(pronMatch[2] || '').trim();
    if (!value) return out;
  }

  const splitMatch = value.match(/^(.*?)(?:\s*(?:\/|\||—|–|-)\s*)es\s*:\s*(.+)$/i);
  if (splitMatch) {
    out.plExample = String(splitMatch[1] || '').trim();
    out.esExample = String(splitMatch[2] || '').trim();
  } else {
    const esOnly = value.match(/^\s*es\s*:\s*(.+)$/i);
    if (esOnly) out.esExample = String(esOnly[1] || '').trim();
    else out.plExample = value.trim();
  }

  out.plExample = out.plExample.replace(/^\s*pl\s*:\s*/i, '').trim();
  out.esExample = out.esExample.replace(/^\s*es\s*:\s*/i, '').trim();
  return out;
}

function parseCardLine(raw) {
  let line = String(raw || '').trim();
  if (!line) return null;
  line = line.replace(/^\s*\d+\)\s*/, '').trim();

  let parts = line.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    parts = line.split(/->|=>|—|–|-/).map((p) => p.trim()).filter(Boolean);
  }
  if (parts.length < 2) return null;

  const labeled = {};
  const unlabeled = [];
  parts.forEach((p) => {
    const m = p.match(/^([A-Za-z_]+)\s*:\s*(.+)$/);
    if (m) labeled[m[1].toLowerCase()] = m[2].trim();
    else unlabeled.push(p);
  });

  const plWord = (labeled.pl || labeled.front || unlabeled[0] || '').trim();
  const esWord = (labeled.es || labeled.back || unlabeled[1] || '').trim();
  if (!plWord || !esWord) return null;

  const rawPron = (labeled.pron || labeled.phon || labeled.pronunciacion || '').trim();
  const exPlDirect = (labeled.expl || labeled.ex_pl || labeled.examplepl || labeled.ejpl || '').trim();
  const exEsDirect = (labeled.exes || labeled.ex_es || labeled.examplees || labeled.ejes || '').trim();

  const exampleRaw = (labeled.ex || labeled.ej || labeled.ejemplo || labeled.example || '').trim();
  const parsedExample = exampleRaw ? parseExampleValue(exampleRaw) : { pron: '', plExample: '', esExample: '' };

  const pron = rawPron || parsedExample.pron || '';
  const plExample = exPlDirect || parsedExample.plExample || '';
  const esExample = exEsDirect || parsedExample.esExample || '';

  const audioUrl = (labeled.audio || labeled.a || '').trim();
  const exampleAudio = (labeled.exaudio || labeled.ejaudio || labeled.ejemploaudio || labeled.exampleaudio || '').trim();

  return {
    plWord,
    esWord,
    pron,
    plExample,
    esExample,
    audioUrl: /^https?:\/\//i.test(audioUrl) ? audioUrl : '',
    exampleAudio: /^https?:\/\//i.test(exampleAudio) ? exampleAudio : '',
  };
}

function isCardExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes(CARD_TYPE_HINT);
}

function buildCardsFromExercise(ex) {
  const opts = Array.isArray(ex.options) ? ex.options : [];
  const cards = [];
  opts.forEach((line, idx) => {
    const parsed = parseCardLine(line);
    if (!parsed) return;
    cards.push({
      id: `${ex.id}__${idx + 1}`,
      exerciseId: ex.id,
      topicId: ex.topicId || null,
      level: ex.level || null,
      plWord: parsed.plWord,
      esWord: parsed.esWord,
      pron: parsed.pron || '',
      plExample: parsed.plExample || '',
      esExample: parsed.esExample || '',
      audioUrl: parsed.audioUrl || '',
      exampleAudio: parsed.exampleAudio || '',
    });
  });
  return cards;
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

function getUserLevels(docData) {
  if (docData?.admin === true || String(docData?.role || '') === 'admin') {
    return ['A1', 'A2', 'B1', 'B2'];
  }
  const rawLevels = normalizeLevelList(docData?.levels);
  if (rawLevels.length) return rawLevels;
  return normalizeLevelList(levelsFromPlan(docData?.plan));
}

async function loadAllowedTopicSets(levels) {
  const idSet = new Set();
  const slugSet = new Set();
  for (const lvlRaw of levels || []) {
    const lvl = String(lvlRaw || '').toUpperCase();
    if (!lvl) continue;
    if (CURRENT_UID) await loadVisibleTopicsForLevel(CURRENT_UID, lvl);
    const cached = allowedTopicCache.get(lvl);
    if (!cached) continue;
    cached.idSet?.forEach((v) => idSet.add(v));
    cached.slugSet?.forEach((v) => slugSet.add(v));
  }
  return { idSet, slugSet };
}

async function loadExercisesForLevels(levels, topicId) {
  const all = [];
  if (!levels.length) return all;
  const allowed = topicId ? null : await loadAllowedTopicSets(levels);
  for (const lvl of levels) {
    try {
      let q = query(collection(db, 'exercises'), where('level', '==', lvl));
      if (topicId) {
        q = query(
          collection(db, 'exercises'),
          where('level', '==', lvl),
          where('topicId', '==', topicId),
        );
      }
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const ex = { id: d.id, ...(d.data() || {}) };
        if (allowed) {
          const tid = String(ex.topicId || '').trim();
          const tslug = String(ex.topicSlug || '').trim();
          const ok =
            (tid && (allowed.idSet.has(tid) || allowed.slugSet.has(tid))) ||
            (tslug && (allowed.idSet.has(tslug) || allowed.slugSet.has(tslug)));
          if (!ok) return;
        }
        all.push(ex);
      });
    } catch (e) {
      console.warn('[review] load exercises failed', e);
    }
  }
  return all;
}

async function loadRouteTopicsForLevels(levels) {
  const route = [];
  for (const lvlRaw of levels || []) {
    const lvl = String(lvlRaw || '').toUpperCase();
    if (!lvl) continue;
    const topics = await loadRouteTopicsForLevel(lvl);
    route.push(...topics.map((t) => ({ ...t, __routeLevel: lvl })));
  }
  return route;
}

async function resolveMinitestTopicScope(levels, blockNo) {
  const route = await loadRouteTopicsForLevels(levels);
  if (!route.length) {
    return {
      block: Math.max(1, Number(blockNo || 1)),
      route: [],
      topicIdSet: new Set(),
      topicSlugSet: new Set(),
      anchorLevel: String(levels?.[0] || 'A1').toUpperCase(),
      lastTopicId: '',
    };
  }

  const block = Math.max(1, Number(blockNo || 1));
  const { start, end } = checkpointBlockRange(block);
  const chunk = route.slice(start, end + 1);
  const topicIdSet = new Set(chunk.map((t) => String(t.id)));
  const topicSlugSet = new Set(chunk.map((t) => String(t.slug || t.id || '').trim()).filter(Boolean));
  const anchor = chunk[chunk.length - 1] || route[Math.min(route.length - 1, end)];

  return {
    block,
    route,
    topicIdSet,
    topicSlugSet,
    anchorLevel: String(anchor?.__routeLevel || anchor?.level || levels?.[0] || 'A1').toUpperCase(),
    lastTopicId: String(anchor?.id || ''),
  };
}

async function loadMistakeItems(uid, levels, topicId = '') {
  const out = [];
  if (!uid) return out;

  for (const lvlRaw of levels || []) {
    const lvl = String(lvlRaw || '').toUpperCase();
    if (!lvl) continue;
    try {
      const snap = await getDocs(
        query(collection(db, 'user_progress', uid, 'topics'), where('level', '==', lvl)),
      );
      snap.forEach((d) => {
        const data = d.data() || {};
        const list = Array.isArray(data.mistakeLog) ? data.mistakeLog : [];
        list.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const tId = String(item.topicId || '').trim();
          if (topicId && topicId !== 'all' && tId !== topicId) return;
          out.push({
            ...item,
            __progressId: d.id,
            __level: lvl,
          });
        });
      });
    } catch (e) {
      console.warn('[review] loadMistakeItems failed', e);
    }
  }

  out.sort((a, b) => {
    const aTs = Date.parse(String(a?.lastAt || '')) || 0;
    const bTs = Date.parse(String(b?.lastAt || '')) || 0;
    if (aTs !== bTs) return bTs - aTs;
    return Number(b?.count || 0) - Number(a?.count || 0);
  });

  const uniq = [];
  const seen = new Set();
  out.forEach((item, idx) => {
    const key = `${String(item.exerciseId || '')}__${normalizeText(item.expected || '')}__${normalizeText(item.userAnswer || '')}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniq.push({
      ...item,
      _idx: idx + 1,
    });
  });

  return uniq.slice(0, 90);
}

function cardsFromMistakes(items) {
  return (items || []).map((m, idx) => {
    const q = String(m.prompt || '').trim() || `Blad #${idx + 1}`;
    const expected = String(m.expected || '').trim() || '(brak odpowiedzi wzorcowej)';
    const your = String(m.userAnswer || '').trim();
    const hint = your ? `Twoja odpowiedz: ${your}` : '';
    return {
      id: `mistake__${String(m.id || `${m.exerciseId || 'x'}_${idx}`)}`,
      exerciseId: String(m.exerciseId || ''),
      topicId: String(m.topicId || ''),
      level: String(m.level || m.__level || ''),
      plWord: q,
      esWord: expected,
      pron: '',
      plExample: hint,
      esExample: '',
      audioUrl: '',
      exampleAudio: '',
      favorite: false,
      frontLang: 'pl',
      backLang: 'es',
      cardSource: 'mistake',
      mistakeCount: Number(m.count || 1),
    };
  });
}

async function loadSrsMap(uid) {
  const map = new Map();
  try {
    const snap = await getDocs(collection(db, 'user_spaced', uid, 'cards'));
    snap.forEach((d) => map.set(d.id, d.data() || {}));
  } catch (e) {
    console.warn('[review] load srs failed', e);
  }
  return map;
}

function shuffleArray(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function withDirection(card, direction) {
  let frontLang = 'pl';
  if (direction === 'es_pl') frontLang = 'es';
  if (direction === 'mixed') frontLang = Math.random() < 0.5 ? 'pl' : 'es';
  const backLang = frontLang === 'pl' ? 'es' : 'pl';
  return { ...card, frontLang, backLang };
}

function buildQueue(cards, srs, limit, direction, mode = 'srs') {
  const m = String(mode || 'srs').toLowerCase();
  const cap = Math.max(1, Number(limit || DEFAULT_DAILY_LIMIT));

  if (m === 'errors') {
    return cards.slice(0, Math.min(cap, 60)).map((card) => ({
      ...card,
      frontLang: 'pl',
      backLang: 'es',
    }));
  }

  if (m === 'minitest') {
    const base = shuffleArray(cards).slice(0, Math.min(cap, MINITEST_LIMIT));
    return base.map((card) => withDirection(card, direction || 'mixed'));
  }

  if (m === 'sprint') {
    const base = shuffleArray(cards).slice(0, Math.min(50, cards.length));
    return base.map((card) => withDirection(card, direction || 'mixed'));
  }

  const now = Date.now();
  const due = [];
  const fresh = [];

  cards.forEach((card) => {
    const state = srs.get(card.id);
    const dueAt = toDateMaybe(state?.dueAt);
    if (!state) {
      fresh.push(card);
      return;
    }
    if (!dueAt || dueAt.getTime() <= now) {
      due.push(card);
    }
  });

  const list = [...due, ...fresh];
  const effectiveLimit = m === 'daily' ? DAILY_CHALLENGE_LIMIT : cap;
  return list.map((card) => withDirection(card, direction)).slice(0, effectiveLimit);
}

function updateStats() {
  const countEl = $('reviewCount');
  const newEl = $('reviewNew');
  const progEl = $('reviewProgress');

  const total = queue.length;
  const done = Math.min(currentIdx, total);
  const newCount = queue.filter((c) => !srsMap.get(c.id)).length;

  if (countEl) countEl.textContent = `Para hoy: ${total}`;
  if (newEl) {
    if (reviewMode === 'errors') newEl.textContent = `Bledy: ${mistakesCache.length}`;
    else newEl.textContent = `Nuevas: ${newCount}`;
  }
  if (progEl) progEl.textContent = `Progreso: ${done}/${total}`;
  updateScoreUI();
}

function sideData(card, lang) {
  const usePl = lang === 'pl';
  return {
    lang: usePl ? 'pl' : 'es',
    word: usePl ? card.plWord : card.esWord,
    sentence: usePl ? card.plExample : card.esExample,
    pron: usePl ? card.pron : '',
    hasAudio: usePl,
  };
}

function renderFace(container, card, lang) {
  if (!container || !card) return;

  const data = sideData(card, lang);
  container.textContent = '';

  const face = document.createElement('div');
  face.className = 'fcFace';

  const pill = document.createElement('div');
  pill.className = 'fcLangPill';
  pill.textContent = data.lang.toUpperCase();
  face.appendChild(pill);

  const wordRow = document.createElement('div');
  wordRow.className = 'fcRow';
  const wordEl = document.createElement('div');
  wordEl.className = 'fcWord';
  wordEl.textContent = data.word || '—';
  wordRow.appendChild(wordEl);

  if (data.hasAudio) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttsInlineIcon';
    btn.textContent = '🔊';
    btn.title = 'Odsłuchaj (PL)';
    btn.setAttribute('aria-label', 'Odsłuchaj (PL)');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      playPolish(card);
    });
    wordRow.appendChild(btn);
  }
  face.appendChild(wordRow);

  if (data.pron) {
    const pronEl = document.createElement('div');
    pronEl.className = 'fcPron';
    pronEl.textContent = `Wymowa: ${data.pron}`;
    face.appendChild(pronEl);
  }

  const sentRow = document.createElement('div');
  sentRow.className = 'fcRow';
  const sentEl = document.createElement('div');
  sentEl.className = 'fcSentence';
  if (!data.sentence) sentEl.classList.add('fcSentence--empty');
  sentEl.textContent = data.sentence || '—';
  sentRow.appendChild(sentEl);

  if (data.hasAudio) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttsInlineIcon';
    btn.textContent = '🔊';
    btn.title = 'Odsłuchaj zdanie (PL)';
    btn.setAttribute('aria-label', 'Odsłuchaj zdanie (PL)');
    btn.disabled = !data.sentence;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      playExample(card);
    });
    sentRow.appendChild(btn);
  }
  face.appendChild(sentRow);

  container.appendChild(face);
}

function renderCard() {
  const cardEl = $('reviewCard');
  const frontEl = $('reviewFront');
  const backEl = $('reviewBack');
  const hintEl = $('reviewHint');
  const btnShow = $('btnShowBack');
  const btnAudio = $('btnAudio');
  const btnExampleAudio = $('btnExampleAudio');
  const btnFav = $('btnFav');
  const exampleEl = $('reviewExample');
  const btnCorrect = $('btnCorrect');
  const btnWrong = $('btnWrong');
  const empty = $('reviewEmpty');

  if (!queue.length) {
    if (cardEl) cardEl.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (reviewMode === 'errors') {
      setReviewEmpty(
        'Brak bledow do powtorki',
        'Nie ma aktywnych bledow. Rozwiaz kilka cwiczen i wroc tutaj.',
      );
    } else if (reviewMode === 'minitest') {
      setReviewEmpty(
        'Brak kart do mini-testu',
        'Dla tego checkpointu nie znaleziono kart. Dodaj fiszki do tematow.',
      );
    }
    updateStats();
    return;
  }

  if (cardEl) cardEl.style.display = '';
  if (empty) empty.style.display = 'none';

  currentCard = queue[currentIdx] || null;
  showBack = false;

  if (!currentCard) {
    if (cardEl) cardEl.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (frontEl) frontEl.textContent = 'Repaso terminado';
    if (backEl) backEl.textContent = '';
    if (btnShow) btnShow.disabled = true;
    if (btnAudio) btnAudio.disabled = true;
    if (btnExampleAudio) btnExampleAudio.disabled = true;
    if (btnFav) btnFav.disabled = true;
    if (exampleEl) exampleEl.style.display = 'none';
    if (btnCorrect) btnCorrect.disabled = true;
    if (btnWrong) btnWrong.disabled = true;
    updateStats();
    finalizeSession().catch((e) => console.warn('[review] finalizeSession failed', e));
    return;
  }

  renderFace(frontEl, currentCard, currentCard.frontLang || 'pl');
  renderFace(backEl, currentCard, currentCard.backLang || 'es');
  if (exampleEl) {
    exampleEl.textContent = '';
    exampleEl.style.display = 'none';
  }
  if (hintEl) {
    if (reviewMode === 'errors') {
      hintEl.textContent = 'To sa najczestsze pomylki. Zapamietaj poprawna forme.';
    } else if (reviewMode === 'minitest') {
      hintEl.textContent = `Mini-test: potrzebujesz ${MINITEST_PASS_PCT}% poprawnych odpowiedzi.`;
    } else if (reviewMode === 'sprint') {
      hintEl.textContent = 'Sprint: bez zastanawiania, szybka decyzja.';
    } else {
      hintEl.textContent = 'Piensa primero y luego muestra la respuesta.';
    }
  }
  if (btnShow) btnShow.disabled = false;
  if (btnAudio) btnAudio.disabled = false;
  if (btnExampleAudio) btnExampleAudio.disabled = !currentCard.plExample;
  if (btnFav) {
    const canFav = reviewMode === 'srs' || reviewMode === 'daily';
    btnFav.disabled = !canFav;
    btnFav.textContent = currentCard.favorite ? '\u2B50 Favorito' : '\u2606 Favorito';
  }
  if (btnCorrect) btnCorrect.disabled = true;
  if (btnWrong) btnWrong.disabled = true;
  if (cardEl) cardEl.classList.remove('isFlipped');
  updateStats();
}

async function saveSrs(uid, card, isCorrect) {
  const prev = srsMap.get(card.id) || {};
  const box = Math.min(
    Math.max(1, Number(prev.box || 1) + (isCorrect ? 1 : -1)),
    5,
  );
  const interval = BOX_INTERVALS[box] || 1;
  const dueAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

  const frontLang = card.frontLang || 'pl';
  const backLang = card.backLang || (frontLang === 'pl' ? 'es' : 'pl');
  const frontWord = frontLang === 'pl' ? card.plWord : card.esWord;
  const backWord = backLang === 'pl' ? card.plWord : card.esWord;

  const payload = {
    cardId: card.id,
    exerciseId: card.exerciseId || null,
    topicId: card.topicId || null,
    level: card.level || null,
    front: frontWord || '',
    back: backWord || '',
    frontLang,
    backLang,
    plWord: card.plWord || '',
    esWord: card.esWord || '',
    pron: card.pron || '',
    plExample: card.plExample || '',
    esExample: card.esExample || '',
    box,
    dueAt: Timestamp.fromDate(dueAt),
    lastReviewAt: serverTimestamp(),
    lastResult: isCorrect,
    reviews: Number(prev.reviews || 0) + 1,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'user_spaced', uid, 'cards', card.id), payload, { merge: true });
  srsMap.set(card.id, payload);
}

async function appendReviewMistakeLog(uid, card, userAnswer = '[review:no lo se]') {
  const userId = String(uid || '').trim();
  if (!userId || !card) return;

  const level = String(card.level || '').toUpperCase();
  const topicId = String(card.topicId || '').trim();
  if (!level || !topicId) return;

  const topicKey = `${level}__${topicId}`;
  const ref = doc(db, 'user_progress', userId, 'topics', topicKey);
  const nowIso = new Date().toISOString();

  const front = sideData(card, card.frontLang || 'pl');
  const back = sideData(card, card.backLang || (card.frontLang === 'pl' ? 'es' : 'pl'));
  const prompt = String(front.word || '').trim();
  const expected = String(back.word || '').trim();
  const answer = String(userAnswer || '').trim();

  try {
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() || {} : {};
    const list = Array.isArray(data.mistakeLog) ? [...data.mistakeLog] : [];

    const idx = list.findIndex((item) => {
      if (String(item?.exerciseId || '') !== String(card.exerciseId || card.id || '')) return false;
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
        id: `review_${String(card.id || card.exerciseId || Date.now())}_${Date.now()}`,
        exerciseId: String(card.exerciseId || card.id || ''),
        type: 'review_card',
        prompt: prompt.slice(0, 320),
        userAnswer: answer.slice(0, 220),
        expected: expected.slice(0, 220),
        level,
        topicId,
        topicSlug: String(card.topicSlug || topicId || ''),
        topicTitle: '',
        count: 1,
        lastAt: nowIso,
      });
    }

    await setDoc(
      ref,
      {
        level,
        topicId,
        mistakeLog: list.slice(0, 90),
        lastMistakeAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('[review] appendReviewMistakeLog failed', e);
  }
}

async function markAnswer(isCorrect) {
  if (!auth.currentUser || !currentCard) return;
  if (reviewMode === 'sprint' && sprintEnded) return;

  if (isCorrect) sessionCorrect += 1;
  else sessionWrong += 1;
  updateScoreUI();

  if (!isCorrect && currentCard.cardSource !== 'mistake') {
    await appendReviewMistakeLog(auth.currentUser.uid, currentCard);
  }

  if (currentCard.cardSource !== 'mistake') {
    await saveSrs(auth.currentUser.uid, currentCard, isCorrect);
  }
  currentIdx += 1;
  renderCard();
}

function speakPolish(text) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'pl-PL';
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const plVoice = voices.find((v) =>
    String(v.lang || '').toLowerCase().startsWith('pl'),
  );
  if (plVoice) utter.voice = plVoice;
  window.speechSynthesis?.cancel?.();
  window.speechSynthesis?.speak?.(utter);
}

function polishSpeechText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const stripKnownLabel = (part) => {
    const p = String(part || '').trim();
    const m = p.match(/^(?:tts_pl|tts|pl)\s*:\s*(.+)$/i);
    return m && m[1] ? String(m[1]).trim() : p;
  };

  if (!text.includes('|')) return stripKnownLabel(text);

  const parts = text
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  const prefer = parts.find((p) => /^(?:tts_pl|pl)\s*:/i.test(p));
  if (prefer) return stripKnownLabel(prefer);

  const fallback = parts.find((p) => !/^(?:es|en)\s*:/i.test(p));
  return fallback ? stripKnownLabel(fallback) : '';
}

function playPolish(card) {
  if (!card) return;
  if (card.audioUrl) {
    const audio = new Audio(card.audioUrl);
    audio.play().catch(() => {});
    return;
  }
  speakPolish(polishSpeechText(card.plWord));
}

function playExample(card) {
  if (!card || !card.plExample) return;
  if (card.exampleAudio) {
    const audio = new Audio(card.exampleAudio);
    audio.play().catch(() => {});
    return;
  }
  speakPolish(polishSpeechText(card.plExample));
}

async function toggleFavorite(card) {
  const user = auth.currentUser;
  if (!user?.uid || !card) return;
  const next = !card.favorite;
  try {
    await setDoc(
      doc(db, 'user_spaced', user.uid, 'cards', card.id),
      {
        favorite: next,
        cardId: card.id,
        exerciseId: card.exerciseId || null,
        topicId: card.topicId || null,
        level: card.level || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    const prev = srsMap.get(card.id) || {};
    srsMap.set(card.id, { ...prev, favorite: next });
    card.favorite = next;
    renderCard();
  } catch (e) {
    console.warn('[review] toggle favorite failed', e);
  }
}

function bindActions() {
  const btnShow = $('btnShowBack');
  const btnCorrect = $('btnCorrect');
  const btnWrong = $('btnWrong');
  const btnAudio = $('btnAudio');
  const btnExampleAudio = $('btnExampleAudio');
  const btnFav = $('btnFav');
  const cardEl = $('reviewCard');
  const hintEl = $('reviewHint');

  if (btnAudio) {
    btnAudio.classList.remove('btn-white-outline');
    btnAudio.classList.add('ttsIconBtn');
    btnAudio.textContent = '🔊';
    btnAudio.title = 'Odsłuchaj (PL)';
    btnAudio.setAttribute('aria-label', 'Odsłuchaj (PL)');
  }
  if (btnExampleAudio) {
    btnExampleAudio.classList.remove('btn-white-outline');
    btnExampleAudio.classList.add('ttsIconBtn');
    btnExampleAudio.textContent = '🔊';
    btnExampleAudio.title = 'Odsłuchaj przykład (PL)';
    btnExampleAudio.setAttribute('aria-label', 'Odsłuchaj przykład (PL)');
  }

  btnShow?.addEventListener('click', () => {
    showBack = true;
    cardEl?.classList.add('isFlipped');
    if (btnCorrect) btnCorrect.disabled = false;
    if (btnWrong) btnWrong.disabled = false;
    if (hintEl) hintEl.textContent = 'Evalúa tu respuesta: "La sé" o "No lo sé".';
  });

  btnAudio?.addEventListener('click', () => {
    playPolish(currentCard);
  });
  btnExampleAudio?.addEventListener('click', () => {
    playExample(currentCard);
  });
  btnFav?.addEventListener('click', async () => {
    await toggleFavorite(currentCard);
  });

  btnCorrect?.addEventListener('click', () => markAnswer(true));
  btnWrong?.addEventListener('click', () => markAnswer(false));
}

async function loadTopicsForLevel(level) {
  const topicSelect = $('reviewTopic');
  if (!topicSelect) return;
  topicSelect.innerHTML = '<option value="all">Todos los temas</option>';
  const lvl = String(level || '').toUpperCase();
  if (!lvl || lvl === 'ALL') {
    topicSelect.disabled = true;
    return;
  }
  topicSelect.disabled = false;

  try {
    const topics = CURRENT_UID ? await loadVisibleTopicsForLevel(CURRENT_UID, lvl) : [];
    topics.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title || t.slug || t.id;
      topicSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn('[review] load topics failed', e);
  }
}

async function refreshReview() {
  if (!auth.currentUser) return;
  const levelEl = $('reviewLevel');
  const topicEl = $('reviewTopic');
  const modeEl = $('reviewMode');
  const selectedMode = String(modeEl?.value || reviewMode || 'srs').toLowerCase();
  reviewMode = REVIEW_MODES.includes(selectedMode) ? selectedMode : 'srs';

  sessionFinalized = false;
  stopSprintTimer();
  resetSession();
  updateModeUI();

  const selectedLevel = String(levelEl?.value || '').toUpperCase();
  const topicId = String(topicEl?.value || '').trim();

  const levels =
    selectedLevel && selectedLevel !== 'ALL'
      ? [selectedLevel]
      : userLevelsCache;
  const activeLevels = reviewMode === 'minitest' ? userLevelsCache : levels;

  srsMap = await loadSrsMap(auth.currentUser.uid);
  let cards = [];
  mistakesCache = [];

  const onlyFav = $('reviewOnlyFav')?.checked;
  const direction = String(userDocCache?.reviewDirection || 'pl_es');
  const limit = Number(userDocCache?.reviewDailyLimit || DEFAULT_DAILY_LIMIT);

  if (reviewMode === 'errors') {
    mistakesCache = await loadMistakeItems(
      auth.currentUser.uid,
      activeLevels,
      topicId && topicId !== 'all' ? topicId : '',
    );
    cards = cardsFromMistakes(mistakesCache);
  } else {
    const topicFilter = reviewMode === 'minitest' ? '' : topicId && topicId !== 'all' ? topicId : '';
    let exercises = await loadExercisesForLevels(activeLevels, topicFilter);

    if (reviewMode === 'minitest') {
      if (!minitestBlock || minitestBlock < 1) minitestBlock = BLOCK_PARAM > 0 ? BLOCK_PARAM : 1;
      const scope = await resolveMinitestTopicScope(activeLevels, minitestBlock);
      minitestBlock = scope.block;
      exercises = exercises.filter((ex) => {
        const tid = String(ex.topicId || '').trim();
        const tslug = String(ex.topicSlug || '').trim();
        return (
          (tid && (scope.topicIdSet.has(tid) || scope.topicSlugSet.has(tid))) ||
          (tslug && (scope.topicIdSet.has(tslug) || scope.topicSlugSet.has(tslug)))
        );
      });
    }

    cards = exercises
      .filter(isCardExercise)
      .flatMap(buildCardsFromExercise)
      .map((c) => ({ ...c, favorite: srsMap.get(c.id)?.favorite === true }));

    if (onlyFav && (reviewMode === 'srs' || reviewMode === 'daily')) {
      cards = cards.filter((c) => c.favorite);
    }
  }

  cardsCache = cards.slice();
  queue = buildQueue(
    cards,
    srsMap,
    reviewMode === 'minitest' ? MINITEST_LIMIT : limit,
    direction,
    reviewMode,
  );
  currentIdx = 0;
  renderCard();
  if (reviewMode === 'sprint' && queue.length) startSprintTimer();
}

async function initReview(user) {
  CURRENT_UID = user?.uid || null;
  allowedTopicCache = new Map();
  userDocCache = await getUserDoc(user.uid);
  await loadPracticarOverview(user.uid);
  const accessibleLevels = getUserLevels(userDocCache);
  const accessible = LEVEL_ORDER.filter((l) => accessibleLevels.includes(l));
  const isAdmin = userDocCache?.admin === true || String(userDocCache?.role || '') === 'admin';
  const unlocked = isAdmin ? accessible : await computeUnlockedLevels(user.uid, accessible);
  userLevelsCache = unlocked.length ? unlocked : ['A1'];

  const levelEl = $('reviewLevel');
  if (levelEl) {
    levelEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = 'Todos los niveles';
    levelEl.appendChild(optAll);
    userLevelsCache.forEach((lvl) => {
      const opt = document.createElement('option');
      opt.value = lvl;
      opt.textContent = lvl;
      levelEl.appendChild(opt);
    });
  }

  const modeEl = $('reviewMode');
  if (modeEl) {
    const preferred = REVIEW_MODES.includes(MODE_PARAM) ? MODE_PARAM : reviewMode;
    reviewMode = preferred;
    modeEl.value = preferred;
  }

  const params = new URLSearchParams(window.location.search);
  const preLevel = String(params.get('level') || '').toUpperCase();
  const preTopic = String(params.get('id') || params.get('topic') || '').trim();

  if (levelEl) {
    if (preLevel && userLevelsCache.includes(preLevel)) {
      levelEl.value = preLevel;
    } else {
      levelEl.value = 'ALL';
    }
  }

  await loadTopicsForLevel(levelEl?.value || 'ALL');
  if (preTopic) {
    const topicEl = $('reviewTopic');
    if (topicEl) topicEl.value = preTopic;
  }

  const applyBtn = $('reviewApply');
  applyBtn?.addEventListener('click', refreshReview);
  modeEl?.addEventListener('change', async () => {
    reviewMode = REVIEW_MODES.includes(String(modeEl.value || '').toLowerCase())
      ? String(modeEl.value || '').toLowerCase()
      : 'srs';
    updateModeUI();
    await refreshReview();
  });
  levelEl?.addEventListener('change', async () => {
    await loadTopicsForLevel(levelEl.value);
    await refreshReview();
  });
  $('reviewTopic')?.addEventListener('change', refreshReview);
  $('reviewOnlyFav')?.addEventListener('change', refreshReview);

  updateModeUI();
  await refreshReview();
}

document.addEventListener('DOMContentLoaded', () => {
  bindActions();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html?next=review.html';
      return;
    }
    await initReview(user);
  });
});



