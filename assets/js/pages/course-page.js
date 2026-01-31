// assets/js/pages/course-page.js
// Course topics list + badges:
// - lesson status from course_meta/{LEVEL}__{COURSE_ID} (html/published)
// - exercises count from exercises where level == LEVEL and topicId == COURSE_ID
// Uses existing CSS classes: coursesGrid + courseCard (already styled in styles.css)

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();

function safeText(v) {
  return String(v ?? '').replace(
    /[<>&"]/g,
    (ch) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
      })[ch],
  );
}

async function getLessonBadge(courseId) {
  try {
    const metaSnap = await getDoc(
      doc(db, 'course_meta', `${LEVEL}__${courseId}`),
    );
    if (!metaSnap.exists()) return '';
    const meta = metaSnap.data() || {};
    const hasHtml =
      typeof meta.html === 'string' && meta.html.trim().length > 0;
    if (!hasHtml) return '';
    const published = meta.published === true;
    // styles.css ma pill-blue i zwykły pill
    return published
      ? `<span class="pill pill-blue">✅ Lección</span>`
      : `<span class="pill">🟡 Borrador</span>`;
  } catch {
    return '';
  }
}

async function getExercisesCount(courseId) {
  try {
    const exQ = query(
      collection(db, 'exercises'),
      where('level', '==', LEVEL),
      where('topicId', '==', courseId),
    );
    const exSnap = await getDocs(exQ);
    return exSnap.size || 0;
  } catch {
    return 0;
  }
}

function renderCard(topic, lessonBadge, exCount) {
  const href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;

  const exBadge =
    exCount > 0 ? `<span class="pill pill-yellow">🧩 ${exCount}</span>` : '';

  const typeBadge = topic.type
    ? `<span class="courseBadge">🏷️ ${safeText(topic.type)}</span>`
    : `<span class="courseBadge">📌 Tema</span>`;

  return `
    <a class="courseCard" href="${href}" style="text-decoration:none; color:inherit;">
      <div class="courseTop">
        ${typeBadge}
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          ${lessonBadge || ''}
          ${exBadge || ''}
        </div>
      </div>

      <div class="courseTitle" style="font-size:22px; margin:12px 0 6px;">
        ${safeText(topic.title || 'Tema')}
      </div>

      <div class="courseSub" style="margin:0;">
        ${safeText(topic.desc || '')}
      </div>
    </a>
  `;
}

async function loadTopics() {
  const subtitle = $('levelSubtitle');
  if (subtitle) subtitle.textContent = `Nivel ${LEVEL}`;

  const host = $('topicsList');
  if (!host) return;

  host.innerHTML = '';

  const q = query(
    collection(db, 'courses'),
    where('level', '==', LEVEL),
    orderBy('order'),
  );

  const snap = await getDocs(q);

  for (const d of snap.docs) {
    const topic = { id: d.id, ...(d.data() || {}) };

    const [lessonBadge, exCount] = await Promise.all([
      getLessonBadge(topic.id),
      getExercisesCount(topic.id),
    ]);

    host.insertAdjacentHTML(
      'beforeend',
      renderCard(topic, lessonBadge, exCount),
    );
  }

  if (snap.empty) {
    host.innerHTML = `<div class="card" style="padding:16px;">No hay temas para este nivel.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) return; // layout.js guards
    loadTopics();
  });
});
