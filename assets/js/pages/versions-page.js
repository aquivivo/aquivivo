// assets/js/pages/versions-page.js
import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  getDocs,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const LEVEL = String(params.get('level') || 'A1').toUpperCase();
const TOPIC_ID = String(params.get('id') || '').trim();
const LESSON_ID = String(params.get('lessonId') || '').trim();
const COURSE_KEY = String(params.get('course') || '').trim();
const TRACK = String(params.get('track') || '').trim();
const VIEW = String(params.get('view') || '').trim();
const FLOW = String(params.get('flow') || '').trim();

const $ = (id) => document.getElementById(id);

function withContext(page, { includeLesson = false, extra = {} } = {}) {
  const url = new URL(page, window.location.href);
  if (LEVEL) url.searchParams.set('level', LEVEL);
  if (TOPIC_ID) url.searchParams.set('id', TOPIC_ID);
  if (includeLesson && LESSON_ID) url.searchParams.set('lessonId', LESSON_ID);
  if (COURSE_KEY) url.searchParams.set('course', COURSE_KEY);
  if (TRACK) url.searchParams.set('track', TRACK);
  if (VIEW) url.searchParams.set('view', VIEW);
  if (FLOW) url.searchParams.set('flow', FLOW);
  Object.entries(extra || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim()) {
      url.searchParams.set(k, String(v));
    }
  });
  return `${url.pathname}${url.search}`;
}

function matchesLesson(exercise, lessonId) {
  const wanted = String(lessonId || '').trim();
  if (!wanted) return true;

  const one = String(exercise?.lessonId || '').trim();
  if (one && one === wanted) return true;

  const many = Array.isArray(exercise?.lessonIds)
    ? exercise.lessonIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (many.includes(wanted)) return true;

  const notes = String(exercise?.notes || '');
  return notes.includes(`lessonId:${wanted}`);
}

function normalizeType(exercise) {
  const raw = String(exercise?.type || exercise?.baseType || '').trim();
  return raw || 'sin_tipo';
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
  return major * 100000000 + datePart;
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

function renderMeta(summaryText) {
  const meta = $('versionsMeta');
  if (!meta) return;
  meta.textContent = summaryText;
}

function typeLabel(type) {
  const raw = String(type || '').trim();
  if (!raw) return 'Sin tipo';
  const key = raw.toLowerCase();
  const labels = {
    tarjeta_vocabulario: 'Tarjetas',
    matching_pairs_es_pl: 'Relacionar (ES-PL)',
    matching_example_to_word: 'Relacionar ejemplo-palabra',
    matching_word_to_example: 'Relacionar palabra-ejemplo',
    fill_blank_typed: 'Completar hueco (escribir)',
    fill_blank_word_bank: 'Completar hueco (banco)',
    listen_arrange_tiles: 'Escuchar y ordenar',
    dictation_sentence: 'Dictado (frase)',
    dictation_word: 'Dictado (palabra)',
    correct_the_error: 'Corrige el error',
    boss_mixed_test: 'Test mixto',
    quick_quiz: 'Quiz rapido',
  };
  return labels[key] || raw.replaceAll('_', ' ');
}

function exercisePrompt(exercise) {
  const prompt = String(
    exercise?.prompt ||
      exercise?.question ||
      exercise?.title ||
      exercise?.instruction?.es ||
      exercise?.instruction?.pl ||
      '',
  ).trim();
  return prompt || '(sin prompt)';
}

function renderList(exercises = []) {
  const body = $('versionsBody');
  const empty = $('versionsEmpty');
  if (!body) return;

  body.innerHTML = '';
  const list = Array.isArray(exercises) ? exercises : [];
  if (!list.length) {
    body.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  body.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const groups = new Map();
  list.forEach((exercise) => {
    const type = normalizeType(exercise);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(exercise);
  });

  const sorted = [...groups.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], 'es');
  });

  sorted.forEach(([type, items]) => {
    const section = document.createElement('section');
    section.className = 'card';
    section.style.marginTop = '10px';
    section.style.padding = '12px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between';
    head.style.gap = '8px';

    const title = document.createElement('div');
    title.style.fontWeight = '800';
    title.style.fontSize = '18px';
    title.textContent = typeLabel(type);

    const badge = document.createElement('span');
    badge.className = 'btn-white-outline';
    badge.style.padding = '4px 12px';
    badge.style.fontSize = '14px';
    badge.textContent = `${items.length}`;

    head.appendChild(title);
    head.appendChild(badge);
    section.appendChild(head);

    const listEl = document.createElement('div');
    listEl.style.marginTop = '10px';
    listEl.style.display = 'grid';
    listEl.style.gap = '8px';

    const maxItems = 6;
    items.slice(0, maxItems).forEach((exercise, index) => {
      const row = document.createElement('div');
      row.style.padding = '8px 10px';
      row.style.border = '1px solid rgba(255,255,255,.25)';
      row.style.borderRadius = '10px';

      const promptLine = document.createElement('div');
      promptLine.textContent = `${index + 1}. ${exercisePrompt(exercise)}`;

      row.appendChild(promptLine);
      listEl.appendChild(row);
    });

    if (items.length > maxItems) {
      const more = document.createElement('div');
      more.className = 'subtitle';
      more.style.padding = '2px 4px';
      more.textContent = `+${items.length - maxItems} mas`;
      listEl.appendChild(more);
    }

    section.appendChild(listEl);
    body.appendChild(section);
  });
}

function bindLinks() {
  const btnLesson = $('btnVersionsLesson');
  const btnFlashcards = $('btnVersionsFlashcards');
  const btnMinitest = $('btnVersionsMinitest');
  const btnTopic = $('btnVersionsTopic');

  if (btnLesson) btnLesson.href = withContext('lesson.html', { includeLesson: true });
  if (btnFlashcards) btnFlashcards.href = withContext('flashcards.html', { includeLesson: true });
  if (btnMinitest) btnMinitest.href = withContext('minitest.html', { includeLesson: true });
  if (btnTopic) btnTopic.href = withContext('lessonpage.html');
}

async function loadSummary() {
  if (!TOPIC_ID) {
    renderMeta(`Nivel: ${LEVEL}`);
    renderList([]);
    return;
  }

  try {
    let snap = await getDocs(
      query(
        collection(db, 'exercises'),
        where('level', '==', LEVEL),
        where('topicId', '==', TOPIC_ID),
      ),
    );

    if (snap.empty) {
      snap = await getDocs(
        query(
          collection(db, 'exercises'),
          where('level', '==', LEVEL),
          where('topicSlug', '==', TOPIC_ID),
        ),
      );
    }

    const raw = filterToNewestSeedVersion(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    const list = LESSON_ID ? raw.filter((x) => matchesLesson(x, LESSON_ID)) : raw;

    const parts = [`Nivel: ${LEVEL}`, `Tema: ${TOPIC_ID}`, `Ejercicios: ${list.length}`];
    if (LESSON_ID) parts.push(`Lección: ${LESSON_ID}`);
    renderMeta(parts.join(' | '));
    renderList(list);
  } catch (e) {
    console.warn('[versions] loadSummary failed', e);
    renderMeta(`Nivel: ${LEVEL} | Tema: ${TOPIC_ID} | No se pudo cargar el resumen.`);
    renderList([]);
  }
}

bindLinks();
renderMeta(TOPIC_ID ? `Nivel: ${LEVEL} | Tema: ${TOPIC_ID}` : `Nivel: ${LEVEL}`);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await loadSummary();
});
