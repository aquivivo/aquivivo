// assets/js/pages/review-page.js
// Simple spaced repetition (Leitner-like) for flashcards from "Tarjetas interactivas"

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan } from '../plan-levels.js';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const DAILY_LIMIT = 20;
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
const CARD_TYPE_HINT = 'tarjeta';

let queue = [];
let currentIdx = 0;
let currentCard = null;
let showBack = false;
let srsMap = new Map();

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

  const cleanSide = (val) =>
    String(val || '').replace(/^(PL|ES|EN)\s*:\s*/i, '').trim();
  return {
    front: cleanSide(parts[0]),
    back: cleanSide(parts[1]),
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
    });
  });
  return cards;
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

function getUserLevels(docData) {
  const rawLevels = Array.isArray(docData?.levels)
    ? docData.levels.map((x) => String(x).toUpperCase())
    : [];
  if (rawLevels.length) return rawLevels;
  return levelsFromPlan(docData?.plan);
}

async function loadExercisesForLevels(levels) {
  const all = [];
  if (!levels.length) return all;
  for (const lvl of levels) {
    try {
      const snap = await getDocs(query(collection(db, 'exercises'), where('level', '==', lvl)));
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

function buildQueue(cards, srs) {
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
  return list.slice(0, DAILY_LIMIT);
}

function updateStats() {
  const countEl = $('reviewCount');
  const newEl = $('reviewNew');
  const progEl = $('reviewProgress');

  const total = queue.length;
  const done = Math.min(currentIdx, total);
  const newCount = queue.filter((c) => !srsMap.get(c.id)).length;

  if (countEl) countEl.textContent = `Na dziś: ${total}`;
  if (newEl) newEl.textContent = `Nowe: ${newCount}`;
  if (progEl) progEl.textContent = `Postęp: ${done}/${total}`;
}

function renderCard() {
  const cardEl = $('reviewCard');
  const frontEl = $('reviewFront');
  const backEl = $('reviewBack');
  const hintEl = $('reviewHint');
  const btnShow = $('btnShowBack');
  const btnCorrect = $('btnCorrect');
  const btnWrong = $('btnWrong');
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
    if (frontEl) frontEl.textContent = 'Koniec powtórek 🎉';
    if (backEl) backEl.textContent = '';
    if (btnShow) btnShow.disabled = true;
    if (btnCorrect) btnCorrect.disabled = true;
    if (btnWrong) btnWrong.disabled = true;
    return;
  }

  if (frontEl) frontEl.textContent = currentCard.front || '-';
  if (backEl) backEl.textContent = currentCard.back || '-';
  if (hintEl) hintEl.textContent = 'Najpierw pomyśl, potem pokaż odpowiedź.';
  if (btnShow) btnShow.disabled = false;
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

function bindActions() {
  const btnShow = $('btnShowBack');
  const btnCorrect = $('btnCorrect');
  const btnWrong = $('btnWrong');
  const cardEl = $('reviewCard');
  const hintEl = $('reviewHint');

  btnShow?.addEventListener('click', () => {
    showBack = true;
    cardEl?.classList.add('isFlipped');
    if (btnCorrect) btnCorrect.disabled = false;
    if (btnWrong) btnWrong.disabled = false;
    if (hintEl) hintEl.textContent = 'Oceń odpowiedź: "Znam" albo "Nie wiem".';
  });

  btnCorrect?.addEventListener('click', () => markAnswer(true));
  btnWrong?.addEventListener('click', () => markAnswer(false));
}

async function initReview(user) {
  const userDoc = await getUserDoc(user.uid);
  const levels = getUserLevels(userDoc);

  const exercises = await loadExercisesForLevels(levels);
  const cards = exercises
    .filter(isCardExercise)
    .flatMap(buildCardsFromExercise);

  srsMap = await loadSrsMap(user.uid);
  queue = buildQueue(cards, srsMap);
  currentIdx = 0;
  renderCard();
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
