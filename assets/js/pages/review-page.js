// assets/js/pages/review-page.js
// Simple spaced repetition (Leitner-like) for flashcards from "Tarjetas interactivas"

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
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_DAILY_LIMIT = 20;
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
const CARD_TYPE_HINT = 'tarjeta';

let queue = [];
let currentIdx = 0;
let currentCard = null;
let showBack = false;
let srsMap = new Map();
let userDocCache = null;
let userLevelsCache = [];

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

  const front = (labeled.pl || labeled.front || unlabeled[0] || '').trim();
  const back = (labeled.es || labeled.back || unlabeled[1] || '').trim();
  if (!front || !back) return null;

  const example = (labeled.ex || labeled.ej || labeled.ejemplo || labeled.example || '').trim();
  const audioUrl = (labeled.audio || labeled.a || '').trim();
  const exampleAudio = (labeled.exaudio || labeled.ejaudio || labeled.ejemploaudio || labeled.exampleaudio || '').trim();

  const plText = (labeled.pl || front).trim();

  return {
    front,
    back,
    plText,
    example,
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
      front: parsed.front,
      back: parsed.back,
      plText: parsed.plText || parsed.front,
      audioUrl: parsed.audioUrl || '',
      example: parsed.example || '',
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
  const rawLevels = Array.isArray(docData?.levels)
    ? docData.levels.map((x) => String(x).toUpperCase())
    : [];
  if (rawLevels.length) return rawLevels;
  return levelsFromPlan(docData?.plan);
}

async function loadExercisesForLevels(levels, topicId) {
  const all = [];
  if (!levels.length) return all;
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
      snap.forEach((d) => all.push({ id: d.id, ...(d.data() || {}) }));
    } catch (e) {
      console.warn('[review] load exercises failed', e);
    }
  }
  return all;
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

function buildQueue(cards, srs, limit, direction) {
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

  const withDirection = list.map((card) => {
    let flip = false;
    if (direction === 'es_pl') flip = true;
    if (direction === 'mixed') flip = Math.random() < 0.5;
    if (!flip) return card;
    return {
      ...card,
      front: card.back,
      back: card.front,
      plText: card.plText,
      audioUrl: card.audioUrl,
    };
  });

  return withDirection.slice(0, limit || DEFAULT_DAILY_LIMIT);
}

function updateStats() {
  const countEl = $('reviewCount');
  const newEl = $('reviewNew');
  const progEl = $('reviewProgress');

  const total = queue.length;
  const done = Math.min(currentIdx, total);
  const newCount = queue.filter((c) => !srsMap.get(c.id)).length;

  if (countEl) countEl.textContent = `Para hoy: ${total}`;
  if (newEl) newEl.textContent = `Nuevas: ${newCount}`;
  if (progEl) progEl.textContent = `Progreso: ${done}/${total}`;
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
  const btnExampleAudio = $('btnExampleAudio');
  const btnFav = $('btnFav');
  const empty = $('reviewEmpty');

  if (!queue.length) {
    if (cardEl) cardEl.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (cardEl) cardEl.style.display = '';
  if (empty) empty.style.display = 'none';

  currentCard = queue[currentIdx] || null;
  showBack = false;

  if (!currentCard) {
    if (frontEl) frontEl.textContent = 'Repaso terminado';
    if (backEl) backEl.textContent = '';
    if (btnShow) btnShow.disabled = true;
    if (btnAudio) btnAudio.disabled = true;
    if (btnExampleAudio) btnExampleAudio.disabled = true;
    if (btnFav) btnFav.disabled = true;
    if (exampleEl) exampleEl.style.display = 'none';
    if (btnCorrect) btnCorrect.disabled = true;
    if (btnWrong) btnWrong.disabled = true;
    return;
  }

  if (frontEl) frontEl.textContent = currentCard.front || '-';
  if (backEl) backEl.textContent = currentCard.back || '-';
  if (exampleEl) {
    if (currentCard.example) {
      exampleEl.textContent = `Ejemplo: ${currentCard.example}`;
      exampleEl.style.display = '';
    } else {
      exampleEl.textContent = '';
      exampleEl.style.display = 'none';
    }
  }
  if (hintEl) hintEl.textContent = 'Piensa primero y luego muestra la respuesta.';
  if (btnShow) btnShow.disabled = false;
  if (btnAudio) btnAudio.disabled = false;
  if (btnExampleAudio) btnExampleAudio.disabled = !currentCard.example;
  if (btnFav) {
    btnFav.disabled = false;
    btnFav.textContent = currentCard.favorite ? '? Favorito' : '? Favorito';
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

  const payload = {
    cardId: card.id,
    exerciseId: card.exerciseId || null,
    topicId: card.topicId || null,
    level: card.level || null,
    front: card.front || '',
    back: card.back || '',
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

async function markAnswer(isCorrect) {
  if (!auth.currentUser || !currentCard) return;
  await saveSrs(auth.currentUser.uid, currentCard, isCorrect);
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

function playPolish(card) {
  if (!card) return;
  if (card.audioUrl) {
    const audio = new Audio(card.audioUrl);
    audio.play().catch(() => {});
    return;
  }
  speakPolish(card.plText || card.front || '');
}

function playExample(card) {
  if (!card || !card.example) return;
  if (card.exampleAudio) {
    const audio = new Audio(card.exampleAudio);
    audio.play().catch(() => {});
    return;
  }
  speakPolish(card.example);
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
  const cardEl = $('reviewCard');
  const hintEl = $('reviewHint');

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
  if (!level || level === 'ALL') {
    topicSelect.disabled = true;
    return;
  }
  topicSelect.disabled = false;

  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', level), orderBy('order')),
    );
    snap.forEach((d) => {
      const t = d.data() || {};
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = t.title || t.slug || d.id;
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
  const selectedLevel = String(levelEl?.value || '').toUpperCase();
  const topicId = String(topicEl?.value || '').trim();

  const levels =
    selectedLevel && selectedLevel !== 'ALL'
      ? [selectedLevel]
      : userLevelsCache;

  srsMap = await loadSrsMap(auth.currentUser.uid);
  const exercises = await loadExercisesForLevels(
    levels,
    topicId && topicId !== 'all' ? topicId : '',
  );
  const cards = exercises
    .filter(isCardExercise)
    .flatMap(buildCardsFromExercise)
    .map((c) => ({ ...c, favorite: srsMap.get(c.id)?.favorite === true }));
  const limit = Number(userDocCache?.reviewDailyLimit || DEFAULT_DAILY_LIMIT);
  const direction = String(userDocCache?.reviewDirection || 'pl_es');
  let list = buildQueue(cards, srsMap, limit, direction);
  const onlyFav = $('reviewOnlyFav')?.checked;
  if (onlyFav) list = list.filter((c) => c.favorite);
  queue = list;
  currentIdx = 0;
  renderCard();
}

async function initReview(user) {
  userDocCache = await getUserDoc(user.uid);
  userLevelsCache = getUserLevels(userDocCache);

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
  levelEl?.addEventListener('change', async () => {
    await loadTopicsForLevel(levelEl.value);
    await refreshReview();
  });
  $('reviewTopic')?.addEventListener('change', refreshReview);
  $('reviewOnlyFav')?.addEventListener('change', refreshReview);

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



