// assets/js/pages/lesson-page.js
import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const LEVEL = String(params.get('level') || 'A1').toUpperCase();
const TOPIC_ID = String(params.get('id') || '').trim();
const LESSON_ID = String(params.get('lessonId') || '').trim();
const COURSE_KEY = String(params.get('course') || '').trim();
const TRACK = String(params.get('track') || '').trim();
const VIEW = String(params.get('view') || '').trim();
const FLOW = String(params.get('flow') || '').trim();

function escapeHtml(value) {
  return String(value ?? '').replace(/[<>&"]/g, (ch) => {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return '&quot;';
  });
}

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

function renderBlocks(blocks = []) {
  const list = Array.isArray(blocks) ? blocks : [];
  return list
    .map((b) => {
      const kind = String(b?.kind || '').toLowerCase();
      if (kind === 'heading') {
        const level = String(b?.level || 'h3').toLowerCase() === 'h2' ? 'h2' : 'h3';
        const txt = escapeHtml(String(b?.text || '').trim());
        if (!txt) return '';
        return `<${level} style="margin:14px 0 8px;">${txt}</${level}>`;
      }
      if (kind === 'divider') {
        return '<hr style="border:0; border-top:1px solid rgba(255,255,255,.2); margin:14px 0;"/>';
      }
      if (kind === 'tip' || kind === 'example') {
        const title = escapeHtml(String(b?.title || '').trim());
        const text = escapeHtml(String(b?.text || '').trim());
        if (!title && !text) return '';
        return `
          <div class="card" style="margin:10px 0; padding:10px;">
            ${title ? `<div style="font-weight:800; margin-bottom:6px;">${title}</div>` : ''}
            ${text ? `<div class="subtitle">${text}</div>` : ''}
          </div>
        `;
      }
      if (kind === 'image') {
        const src = String(b?.url || '').trim();
        if (!src) return '';
        const caption = escapeHtml(String(b?.caption || '').trim());
        return `
          <figure style="margin:12px 0;">
            <img src="${escapeHtml(src)}" alt="" style="max-width:100%; border-radius:12px;"/>
            ${caption ? `<figcaption class="subtitle" style="margin-top:6px;">${caption}</figcaption>` : ''}
          </figure>
        `;
      }
      const text = escapeHtml(String(b?.text || '').trim());
      if (!text) return '';
      return `<p style="margin:8px 0; line-height:1.6;">${text}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function setEmpty(text) {
  const empty = $('lessonEmpty');
  const content = $('lessonContent');
  if (content) content.innerHTML = '';
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = text;
  }
}

async function loadLessonData() {
  if (!TOPIC_ID) {
    setEmpty('Falta id del tema en la URL.');
    return;
  }

  const btnBack = $('btnLessonBack');
  const btnFlash = $('btnLessonFlashcards');
  const btnEx = $('btnLessonExercises');
  const btnMini = $('btnLessonMiniTest');
  if (btnBack) btnBack.href = withContext('lessonpage.html');
  if (btnFlash) btnFlash.href = withContext('flashcards.html', { includeLesson: true });
  if (btnEx) btnEx.href = withContext('versions.html', { includeLesson: true });
  if (btnMini) btnMini.href = withContext('minitest.html', { includeLesson: true });

  let topic = null;
  try {
    const topicSnap = await getDoc(doc(db, 'courses', TOPIC_ID));
    if (topicSnap.exists()) topic = { id: topicSnap.id, ...(topicSnap.data() || {}) };
  } catch {}

  const topicTitle = String(topic?.title || topic?.name || TOPIC_ID);
  const titleEl = $('lessonTitle');
  const metaEl = $('lessonMeta');
  if (metaEl) metaEl.textContent = `Nivel: ${LEVEL}  Tema: ${topicTitle}`;

  const candidateIds = [];
  if (LESSON_ID) candidateIds.push(LESSON_ID);
  candidateIds.push(`${LEVEL}__${TOPIC_ID}`);

  let lessonDoc = null;
  for (const id of candidateIds) {
    try {
      const snap = await getDoc(doc(db, 'lessons', id));
      if (snap.exists()) {
        lessonDoc = { id: snap.id, ...(snap.data() || {}) };
        break;
      }
    } catch {}
  }

  const lessonTitle = String(lessonDoc?.title || lessonDoc?.name || '').trim();
  if (titleEl) titleEl.textContent = lessonTitle || topicTitle || 'Lección';

  const content = $('lessonContent');
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'none';
    empty.textContent = '';
  }
  if (!content) return;

  const html = String(lessonDoc?.html || '').trim();
  if (html) {
    content.innerHTML = html;
    return;
  }

  const blocks = lessonDoc?.blocks;
  if (Array.isArray(blocks) && blocks.length) {
    content.innerHTML = renderBlocks(blocks);
    return;
  }

  setEmpty('Todavía no hay contenido de lección para este paso.');
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const next = encodeURIComponent(`lesson.html${window.location.search || ''}`);
    window.location.href = `login.html?next=${next}`;
    return;
  }
  await loadLessonData();
});
