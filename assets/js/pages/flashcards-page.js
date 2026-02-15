// assets/js/pages/flashcards-page.js
// Modo fichas tipo Quizlet (sin SRS)

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
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const PRE_LEVEL = String(params.get('level') || '').toUpperCase();
const PRE_TOPIC = String(params.get('id') || params.get('topic') || '').trim();
const PRE_LESSON = String(params.get('lessonId') || '').trim();
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
const LEVEL_ORDER = Array.isArray(KNOWN_LEVELS) && KNOWN_LEVELS.length
  ? KNOWN_LEVELS
  : ['A1', 'A2', 'B1', 'B2'];

let currentUserDoc = null;
let CURRENT_UID = null;
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
    console.warn('[flashcards] loadProgressMapForLevel failed', e);
    return {};
  }
}

async function loadRouteTopicsForLevel(level) {
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
    const selected = selectTopicsForTrack(all);
    return buildMixedRoute(selected);
  } catch (e) {
    console.warn('[flashcards] loadRouteTopicsForLevel failed', e);
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

function deckTags(ex) {
  if (!Array.isArray(ex?.tags)) return [];
  return ex.tags.map((t) => normalizeText(t)).filter(Boolean);
}

function isTopicDeckExercise(ex) {
  const notes = normalizeText(ex?.notes || '');
  if (notes.includes('deck:topic')) return true;
  if (deckTags(ex).includes('scope:topic')) return true;

  const lessonId = String(ex?.lessonId || '').trim();
  const lessonIds = Array.isArray(ex?.lessonIds)
    ? ex.lessonIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return !lessonId && lessonIds.length > 1;
}

function exerciseMatchesLesson(ex, lessonId) {
  const wanted = String(lessonId || '').trim();
  if (!wanted) return true;
  if (isTopicDeckExercise(ex)) return false;
  const one = String(ex?.lessonId || '').trim();
  if (one && one === wanted) return true;
  const many = Array.isArray(ex?.lessonIds)
    ? ex.lessonIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (many.includes(wanted)) return true;
  const notes = String(ex?.notes || '');
  if (notes.includes(`lessonId:${wanted}`)) return true;
  return false;
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
      plWord: parsed.plWord,
      esWord: parsed.esWord,
      pron: parsed.pron || '',
      plExample: parsed.plExample || '',
      esExample: parsed.esExample || '',
      audioUrl: parsed.audioUrl || '',
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
  if (!cards.length) {
    setEmptyState(true);
    setStatus('0 tarjetas');
    return;
  }

  setEmptyState(false);

  const card = cards[currentIndex];
  if (!card) return;

  renderFace(fcFront, card, card.frontLang || 'pl');
  renderFace(fcBack, card, card.backLang || 'es');
  if (fcExample) {
    fcExample.textContent = '';
    fcExample.style.display = 'none';
  }

  if (fcCard) fcCard.classList.toggle('isFlipped', isFlipped);
  if (fcFav) fcFav.textContent = card.favorite ? '\u2B50 Favorito' : '\u2606 Favorito';
  if (fcExampleAudio) fcExampleAudio.disabled = !card.plExample;
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
    let frontLang = 'pl';
    if (direction === 'es_pl') frontLang = 'es';
    if (direction === 'mixed') frontLang = Math.random() < 0.5 ? 'pl' : 'es';
    const backLang = frontLang === 'pl' ? 'es' : 'pl';
    return { ...card, frontLang, backLang };
  });
}

async function loadTopics(level, selectedId) {
  if (!fcTopic) return;
  fcTopic.innerHTML = '<option value="all">Todos los temas</option>';
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return;

  try {
    const topics = CURRENT_UID ? await loadVisibleTopicsForLevel(CURRENT_UID, lvl) : [];
    topics.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title || t.slug || t.id;
      fcTopic.appendChild(opt);
    });

    const wanted = String(selectedId || '').trim();
    if (wanted && wanted !== 'all' && topics.some((t) => t.id === wanted)) {
      fcTopic.value = wanted;
    } else if (wanted && wanted !== 'all') {
      const opt = document.createElement('option');
      opt.value = wanted;
      opt.textContent = wanted;
      fcTopic.appendChild(opt);
      fcTopic.value = wanted;
    } else {
      fcTopic.value = 'all';
    }
  } catch (e) {
    console.warn('[flashcards] loadTopics failed', e);
  }
}

async function loadAllowedTopicSetsForLevel(level) {
  const lvl = String(level || '').toUpperCase();
  if (!lvl) return { idSet: new Set(), slugSet: new Set() };
  const cached = allowedTopicCache.get(lvl);
  if (cached && cached.idSet && cached.slugSet) return cached;

  if (CURRENT_UID) await loadVisibleTopicsForLevel(CURRENT_UID, lvl);
  const fresh = allowedTopicCache.get(lvl);
  return fresh && fresh.idSet && fresh.slugSet
    ? fresh
    : { idSet: new Set(), slugSet: new Set() };
}

async function loadCards() {
  const level = String(fcLevel?.value || '').toUpperCase();
  const topicId = String(fcTopic?.value || '').trim();
  const forcedTopicId = topicId && topicId !== 'all' ? topicId : String(PRE_TOPIC || '').trim();
  const direction = String(fcDirection?.value || 'pl_es');

  if (!level) return;

  setStatus('Cargando...');

  try {
    let q = query(collection(db, 'exercises'), where('level', '==', level));
    if (forcedTopicId) {
      q = query(
        collection(db, 'exercises'),
        where('level', '==', level),
        where('topicId', '==', forcedTopicId),
      );
    }
    let snap = await getDocs(q);
    if (forcedTopicId && snap.empty) {
      snap = await getDocs(
        query(
          collection(db, 'exercises'),
          where('level', '==', level),
          where('topicSlug', '==', forcedTopicId),
        ),
      );
    }
    const exercises = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const allowed =
      forcedTopicId ? null : await loadAllowedTopicSetsForLevel(level);
    const visibleExercises = allowed && (allowed.idSet.size || allowed.slugSet.size)
      ? exercises.filter((ex) => {
          const tid = String(ex.topicId || '').trim();
          const tslug = String(ex.topicSlug || '').trim();
          return (
            (tid && (allowed.idSet.has(tid) || allowed.slugSet.has(tid))) ||
            (tslug && (allowed.idSet.has(tslug) || allowed.slugSet.has(tslug)))
          );
        })
      : exercises;

    const cardExercises = visibleExercises.filter(isCardExercise);
    const scopedCards = PRE_LESSON
      ? cardExercises.filter((ex) => exerciseMatchesLesson(ex, PRE_LESSON))
      : (() => {
          const topicDecks = cardExercises.filter(isTopicDeckExercise);
          return topicDecks.length ? topicDecks : cardExercises;
        })();
    const base = scopedCards
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
  if (fcAudio) {
    fcAudio.classList.remove('btn-white-outline');
    fcAudio.classList.add('ttsIconBtn');
    fcAudio.textContent = '🔊';
    fcAudio.title = 'Odsłuchaj (PL)';
    fcAudio.setAttribute('aria-label', 'Odsłuchaj (PL)');
  }
  if (fcExampleAudio) {
    fcExampleAudio.classList.remove('btn-white-outline');
    fcExampleAudio.classList.add('ttsIconBtn');
    fcExampleAudio.textContent = '🔊';
    fcExampleAudio.title = 'Odsłuchaj przykład (PL)';
    fcExampleAudio.setAttribute('aria-label', 'Odsłuchaj przykład (PL)');
  }

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
  CURRENT_UID = user?.uid || null;
  currentUserDoc = await getUserDoc(user.uid);
  favMap = await loadFavMap(user.uid);
  const levels = getUserLevels(currentUserDoc, user.email);
  const accessible = LEVEL_ORDER.filter((l) => levels.includes(l));
  const isAdmin =
    String(user.email || '').toLowerCase() === 'aquivivo.pl@gmail.com' ||
    currentUserDoc?.admin === true ||
    String(currentUserDoc?.role || '').toLowerCase() === 'admin';
  const unlocked = isAdmin ? accessible : await computeUnlockedLevels(user.uid, accessible);
  const visibleLevels = unlocked.length ? unlocked : ['A1'];

  if (fcLevel) {
    fcLevel.innerHTML = '';
    visibleLevels.forEach((lvl) => {
      const opt = document.createElement('option');
      opt.value = lvl;
      opt.textContent = lvl;
      fcLevel.appendChild(opt);
    });
  }

  const preferred = visibleLevels.includes(PRE_LEVEL) ? PRE_LEVEL : visibleLevels[0];
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

