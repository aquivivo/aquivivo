// assets/js/pages/review-page.js
// Simple spaced repetition (Leitner-like) for flashcards from "Tarjetas interactivas"

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
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const NAV_QS = new URLSearchParams(window.location.search);
const TRACK = String(NAV_QS.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(NAV_QS.get('view') || '').trim().toLowerCase();

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
  for (const lvl of levels || []) {
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
      console.warn('[review] load allowed topics failed', e);
    }
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
    let frontLang = 'pl';
    if (direction === 'es_pl') frontLang = 'es';
    if (direction === 'mixed') frontLang = Math.random() < 0.5 ? 'pl' : 'es';
    const backLang = frontLang === 'pl' ? 'es' : 'pl';
    return { ...card, frontLang, backLang };
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

  renderFace(frontEl, currentCard, currentCard.frontLang || 'pl');
  renderFace(backEl, currentCard, currentCard.backLang || 'es');
  if (exampleEl) {
    exampleEl.textContent = '';
    exampleEl.style.display = 'none';
  }
  if (hintEl) hintEl.textContent = 'Piensa primero y luego muestra la respuesta.';
  if (btnShow) btnShow.disabled = false;
  if (btnAudio) btnAudio.disabled = false;
  if (btnExampleAudio) btnExampleAudio.disabled = !currentCard.plExample;
  if (btnFav) {
    btnFav.disabled = false;
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
      const t = { id: d.id, ...(d.data() || {}) };
      if (t.isArchived === true) return;
      if (!topicMatchesTrack(t)) return;
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



