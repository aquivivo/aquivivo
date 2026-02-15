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

function renderMeta(summaryText) {
  const meta = $('versionsMeta');
  if (!meta) return;
  meta.textContent = summaryText;
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

    const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const list = LESSON_ID ? raw.filter((x) => matchesLesson(x, LESSON_ID)) : raw;
    const byType = {};
    list.forEach((x) => {
      const t = normalizeType(x);
      byType[t] = (byType[t] || 0) + 1;
    });

    const preview = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, n]) => `${t}: ${n}`)
      .join(' · ');

    const parts = [`Nivel: ${LEVEL}`, `Tema: ${TOPIC_ID}`, `Ejercicios: ${list.length}`];
    if (LESSON_ID) parts.push(`Leccion: ${LESSON_ID}`);
    if (preview) parts.push(preview);
    renderMeta(parts.join(' · '));
  } catch (e) {
    console.warn('[versions] loadSummary failed', e);
    renderMeta(`Nivel: ${LEVEL} · Tema: ${TOPIC_ID} · No se pudo cargar el resumen.`);
  }
}

bindLinks();
renderMeta(TOPIC_ID ? `Nivel: ${LEVEL} · Tema: ${TOPIC_ID}` : `Nivel: ${LEVEL}`);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await loadSummary();
});
