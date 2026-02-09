// assets/js/pages/flashcards-page.js
// Modo fichas tipo Quizlet (sin SRS)

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
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const PRE_LEVEL = String(params.get('level') || '').toUpperCase();
const PRE_TOPIC = String(params.get('id') || params.get('topic') || '').trim();
const TRACK = String(params.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(params.get('view') || '').trim().toLowerCase();

const fcLevel = $('fcLevel');
const fcTopic = $('fcTopic');
const fcDirection = $('fcDirection');
const fcReload = $('fcReload');
const fcShuffle = $('fcShuffle');
const fcOnlyFav = $('fcOnlyFav');
const fcStatus = $('fcStatus');

const fcCard = $('fcCard');
const fcFront = $('fcFront');
const fcBack = $('fcBack');
const fcExample = $('fcExample');
const fcEmpty = $('fcEmpty');

const fcFlip = $('fcFlip');
const fcAudio = $('fcAudio');
const fcExampleAudio = $('fcExampleAudio');
const fcFav = $('fcFav');
const fcPrev = $('fcPrev');
const fcNext = $('fcNext');

const CARD_TYPE_HINT = 'tarjeta';

let currentUserDoc = null;
let cards = [];
let currentIndex = 0;
let isFlipped = false;
let favMap = new Map();
let allowedTopicCache = new Map();

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
  const list = [];
  opts.forEach((line, idx) => {
    const parsed = parseCardLine(line);
    if (!parsed) return;
    list.push({
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
  return list;
}

function getUserLevels(userDoc, email) {
  const isAdmin =
    String(email || '').toLowerCase() === 'aquivivo.pl@gmail.com' ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin';
  if (isAdmin) return ['A1', 'A2', 'B1', 'B2'];

  const raw = normalizeLevelList(userDoc?.levels);
  if (raw.length) return raw;

  const fromPlan = normalizeLevelList(levelsFromPlan(userDoc?.plan));
  return fromPlan.length ? fromPlan : ['A1'];
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

async function loadFavMap(uid) {
  const map = new Map();
  if (!uid) return map;
  try {
    const snap = await getDocs(collection(db, 'user_spaced', uid, 'cards'));
    snap.forEach((d) => map.set(d.id, d.data() || {}));
  } catch (e) {
    console.warn('[flashcards] load favs failed', e);
  }
  return map;
}

function setStatus(text) {
  if (!fcStatus) return;
  fcStatus.textContent = text || '';
}

function setEmptyState(isEmpty) {
  if (fcCard) fcCard.style.display = isEmpty ? 'none' : '';
  if (fcEmpty) fcEmpty.style.display = isEmpty ? 'block' : 'none';
}

function renderCard() {
  if (!cards.length) {
    setEmptyState(true);
    setStatus('0 tarjetas');
    return;
  }

  setEmptyState(false);

  const card = cards[currentIndex];
  if (!card) return;

  if (fcFront) fcFront.textContent = card.front || '-';
  if (fcBack) fcBack.textContent = card.back || '-';
  if (fcExample) {
    if (card.example) {
      fcExample.textContent = `Ejemplo: ${card.example}`;
      fcExample.style.display = '';
    } else {
      fcExample.textContent = '';
      fcExample.style.display = 'none';
    }
  }

  if (fcCard) fcCard.classList.toggle('isFlipped', isFlipped);
  if (fcFav) fcFav.textContent = card.favorite ? '\u2B50 Favorito' : '\u2606 Favorito';
  if (fcExampleAudio) fcExampleAudio.disabled = !card.example;
  setStatus(`Tarjeta ${currentIndex + 1} de ${cards.length}`);
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
  speakPolish(polishSpeechText(card.plText));
}

function playExample(card) {
  if (!card || !card.example) return;
  if (card.exampleAudio) {
    const audio = new Audio(card.exampleAudio);
    audio.play().catch(() => {});
    return;
  }
  speakPolish(polishSpeechText(card.example));
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
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    const prev = favMap.get(card.id) || {};
    favMap.set(card.id, { ...prev, favorite: next });
    card.favorite = next;
    if (fcOnlyFav?.checked && !next) {
      await loadCards();
      return;
    }
    renderCard();
  } catch (e) {
    console.warn('[flashcards] toggle favorite failed', e);
  }
}

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function applyDirection(list, direction) {
  return list.map((card) => {
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
}

async function loadTopics(level, selectedId) {
  if (!fcTopic) return;
  fcTopic.innerHTML = '<option value="all">Todos los temas</option>';
  if (!level) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', level), orderBy('order')),
    );
    const topics = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((t) => t.isArchived !== true)
      .filter(topicMatchesTrack);

    topics.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title || t.slug || t.id;
      fcTopic.appendChild(opt);
    });

    if (selectedId && topics.some((t) => t.id === selectedId)) {
      fcTopic.value = selectedId;
    }
  } catch (e) {
    console.warn('[flashcards] loadTopics failed', e);
  }
}

async function loadAllowedTopicSetsForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return { idSet: new Set(), slugSet: new Set() };
  const cached = allowedTopicCache.get(lvl);
  if (cached) return cached;

  const idSet = new Set();
  const slugSet = new Set();
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', lvl), orderBy('order')),
    );
    snap.forEach((d) => {
      const topic = { id: d.id, ...(d.data() || {}) };
      if (topic.isArchived === true) return;
      if (!topicMatchesTrack(topic)) return;
      idSet.add(String(topic.id));
      const slug = String(topic.slug || topic.id || '').trim();
      if (slug) slugSet.add(slug);
    });
  } catch (e) {
    console.warn('[flashcards] loadAllowedTopicSetsForLevel failed', e);
  }

  const out = { idSet, slugSet };
  allowedTopicCache.set(lvl, out);
  return out;
}

async function loadCards() {
  const level = String(fcLevel?.value || '').toUpperCase();
  const topicId = String(fcTopic?.value || '').trim();
  const direction = String(fcDirection?.value || 'pl_es');

  if (!level) return;

  setStatus('Cargando...');

  try {
    let q = query(collection(db, 'exercises'), where('level', '==', level));
    if (topicId && topicId !== 'all') {
      q = query(
        collection(db, 'exercises'),
        where('level', '==', level),
        where('topicId', '==', topicId),
      );
    }
    const snap = await getDocs(q);
    const exercises = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const allowed =
      topicId && topicId !== 'all' ? null : await loadAllowedTopicSetsForLevel(level);
    const visibleExercises = allowed
      ? exercises.filter((ex) => {
          const tid = String(ex.topicId || '').trim();
          const tslug = String(ex.topicSlug || '').trim();
          return (
            (tid && (allowed.idSet.has(tid) || allowed.slugSet.has(tid))) ||
            (tslug && (allowed.idSet.has(tslug) || allowed.slugSet.has(tslug)))
          );
        })
      : exercises;

    const base = visibleExercises
      .filter(isCardExercise)
      .flatMap(buildCardsFromExercise)
      .map((c) => ({ ...c, favorite: favMap.get(c.id)?.favorite === true }));

    let list = applyDirection(base, direction);
    if (fcOnlyFav?.checked) list = list.filter((c) => c.favorite);
    cards = list;
    currentIndex = 0;
    isFlipped = false;
    renderCard();
  } catch (e) {
    console.warn('[flashcards] loadCards failed', e);
    cards = [];
    renderCard();
  }
}

function bindActions() {
  fcReload?.addEventListener('click', () => loadCards());
  fcShuffle?.addEventListener('click', () => {
    if (!cards.length) return;
    cards = shuffleArray(cards);
    currentIndex = 0;
    isFlipped = false;
    renderCard();
    setStatus(`Barajadas · ${cards.length} tarjetas`);
  });

  fcFlip?.addEventListener('click', () => {
    if (!cards.length) return;
    isFlipped = !isFlipped;
    renderCard();
  });
  fcAudio?.addEventListener('click', () => {
    if (!cards.length) return;
    playPolish(cards[currentIndex]);
  });
  fcExampleAudio?.addEventListener('click', () => {
    if (!cards.length) return;
    playExample(cards[currentIndex]);
  });
  fcFav?.addEventListener('click', async () => {
    if (!cards.length) return;
    await toggleFavorite(cards[currentIndex]);
  });
  fcPrev?.addEventListener('click', () => {
    if (!cards.length) return;
    currentIndex = (currentIndex - 1 + cards.length) % cards.length;
    isFlipped = false;
    renderCard();
  });
  fcNext?.addEventListener('click', () => {
    if (!cards.length) return;
    currentIndex = (currentIndex + 1) % cards.length;
    isFlipped = false;
    renderCard();
  });

  fcLevel?.addEventListener('change', async () => {
    await loadTopics(fcLevel.value, '');
    await loadCards();
  });
  fcTopic?.addEventListener('change', () => loadCards());
  fcDirection?.addEventListener('change', () => loadCards());
  fcOnlyFav?.addEventListener('change', () => loadCards());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') fcNext?.click();
    if (e.key === 'ArrowLeft') fcPrev?.click();
    if (e.key === ' ') {
      e.preventDefault();
      fcFlip?.click();
    }
  });
}

async function init(user) {
  currentUserDoc = await getUserDoc(user.uid);
  favMap = await loadFavMap(user.uid);
  const levels = getUserLevels(currentUserDoc, user.email);

  if (fcLevel) {
    fcLevel.innerHTML = '';
    levels.forEach((lvl) => {
      const opt = document.createElement('option');
      opt.value = lvl;
      opt.textContent = lvl;
      fcLevel.appendChild(opt);
    });
  }

  const preferred = levels.includes(PRE_LEVEL) ? PRE_LEVEL : levels[0];
  if (fcLevel) fcLevel.value = preferred;

  const direction = String(currentUserDoc?.reviewDirection || 'pl_es');
  if (fcDirection) fcDirection.value = direction;

  await loadTopics(preferred, PRE_TOPIC);
  await loadCards();
}

bindActions();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=flashcards.html';
    return;
  }
  await init(user);
});

