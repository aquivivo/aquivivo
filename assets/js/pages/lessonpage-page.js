// assets/js/pages/lessonpage-page.js
// Contract: lessonpage.html?level=A1&id=COURSE_DOC_ID
// Topic: courses/{id}
// Lesson content: course_meta/{LEVEL}__{COURSE_ID}
// Access: users/{uid}.admin OR users/{uid}.access===true OR users/{uid}.plan==="premium"

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(window.location.search);
const LEVEL = (qs.get('level') || 'A1').toUpperCase();
const COURSE_ID = (qs.get('id') || '').trim();

function metaDocId(level, courseId) {
  return `${level}__${courseId}`;
}

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? snap.data() || {} : {};
    const isAdmin = d.admin === true;
    const hasAccess = isAdmin || d.access === true || d.plan === 'premium';
    return { isAdmin, hasAccess };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasAccess: false };
  }
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}
function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = v;
}

function renderLocked() {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  show($('studentHint'), true);

  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = `
      <div style="font-size:16px; line-height:1.6;">
        <b>🔒 Acceso premium</b><br/>
        Para ver esta lección necesitas acceso.<br/>
        Ve al <a href="espanel.html" style="text-decoration:underline;">Panel</a> para aplicar un código o activar el plan.
      </div>
    `;
  }
}

function renderEmpty(msg) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = msg;
  }
}

async function loadLesson(user) {
  // Pills
  const pillLevel = $('pillLevel');
  const pillTopic = $('pillTopic');
  const pillType = $('pillType');
  const pillDuration = $('pillDuration');
  const pillPub = $('pillPub');
  const pillAdminLink = $('pillAdminLink');
  const exerciseLinksWrap = $('exerciseLinksWrap');

  setText('lessonTitle', 'Cargando…');
  setText('lessonDesc', 'Cargando…');
  if (pillLevel) pillLevel.textContent = `Nivel: ${LEVEL}`;
  if (pillTopic) pillTopic.textContent = `Tema: —`;

  if (!COURSE_ID) {
    renderEmpty('Faltan parámetros en la URL (id).');
    return;
  }

  const flags = await getUserFlags(user.uid);

  // Admin link
  if (pillAdminLink && flags.isAdmin) {
    pillAdminLink.style.display = 'inline-flex';
    pillAdminLink.href = `lessonadmin.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}`;
  } else if (pillAdminLink) {
    pillAdminLink.style.display = 'none';
  }

  // Topic
  let topic = null;
  try {
    const snap = await getDoc(doc(db, 'courses', COURSE_ID));
    if (snap.exists()) topic = { id: snap.id, ...(snap.data() || {}) };
  } catch (e) {
    console.error(e);
  }
  const topicTitle = topic?.title || topic?.name || 'Lección';
  const topicDesc = topic?.desc || topic?.description || '';
  if (pillTopic) pillTopic.textContent = `Tema: ${topicTitle}`;

  // Lesson meta
  let meta = null;
  try {
    const metaSnap = await getDoc(
      doc(db, 'course_meta', metaDocId(LEVEL, COURSE_ID)),
    );
    if (metaSnap.exists()) meta = metaSnap.data() || {};
  } catch (e) {
    console.error(e);
  }

  setText(
    'lessonTitle',
    (meta?.titleEs || meta?.title || topicTitle || 'Lección').trim(),
  );
  setText(
    'lessonDesc',
    (
      meta?.descriptionEs ||
      meta?.desc ||
      meta?.description ||
      topicDesc ||
      ''
    ).trim(),
  );

  if (pillType) {
    if (meta?.type) {
      pillType.style.display = 'inline-flex';
      pillType.textContent = `📌 ${meta.type}`;
    } else {
      pillType.style.display = 'none';
    }
  }

  const dur = Number(meta?.durationMin || meta?.duration || 0);
  if (pillDuration) {
    if (dur > 0) {
      pillDuration.style.display = 'inline-flex';
      pillDuration.textContent = `⏱ ${dur} min`;
    } else {
      pillDuration.style.display = 'none';
    }
  }

  const published = meta?.published === true;
  if (pillPub) {
    pillPub.style.display = 'inline-flex';
    pillPub.textContent = published ? '✅ Publicado' : '🟡 Borrador';
  }

  // Exercise link always visible
  if (exerciseLinksWrap) {
    exerciseLinksWrap.innerHTML = `
      <a class="btn-white-outline" href="ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}">🧩 Ejercicios</a>
    `;
  }

  // Access gate
  if (!flags.hasAccess) {
    renderLocked();
    return;
  }

  // Draft gate for students
  if (!published && !flags.isAdmin) {
    renderEmpty('Esta lección aún no está publicada.');
    const hint = $('studentHint');
    if (hint) {
      hint.style.display = 'block';
      hint.textContent =
        'Vuelve más tarde. (Si eres admin, publícala desde el panel de admin.)';
    }
    return;
  }

  const html = String(meta?.html || '').trim();
  if (!html) {
    renderEmpty('Todavía no hay contenido de lección para este tema.');
    return;
  }

  const contentEl = $('lessonContent');
  if (contentEl) {
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) return; // layout.js guards
    loadLesson(user);
  });
});
