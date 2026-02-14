// assets/js/pages/versions-page.js
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

const meta = $('versionsMeta');
if (meta) {
  meta.textContent = TOPIC_ID
    ? `Nivel: ${LEVEL}  Tema: ${TOPIC_ID}`
    : `Nivel: ${LEVEL}`;
}

const btnLesson = $('btnVersionsLesson');
const btnFlashcards = $('btnVersionsFlashcards');
const btnMinitest = $('btnVersionsMinitest');
const btnTopic = $('btnVersionsTopic');

if (btnLesson) btnLesson.href = withContext('lesson.html', { includeLesson: true });
if (btnFlashcards) btnFlashcards.href = withContext('flashcards.html', { includeLesson: true });
if (btnMinitest) btnMinitest.href = withContext('minitest.html', { includeLesson: true });
if (btnTopic) btnTopic.href = withContext('lessonpage.html');
