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

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? (snap.data() || {}) : {};
    const isAdmin = d.admin === true;
    const access = d.access === true;
    const plan = String(d.plan || 'free').toLowerCase();
    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? (untilDate.getTime() > Date.now()) : false;

    const levels = Array.isArray(d.accessLevels) ? d.accessLevels.map(x => String(x).toUpperCase()) : [];
    const hasLevelAccess = isAdmin || access || plan === 'premium' || isUntilValid || levels.includes(String(LEVEL).toUpperCase());
    const blocked = d.blocked === true;
    return { isAdmin, hasLevelAccess, blocked, plan, levels };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasLevelAccess: false, blocked: false, plan: 'free', levels: [] };
  }
}

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

function renderCard(topic, lessonBadge, exCount, hasLevelAccess) {
  const href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;

  const exBadge =
    exCount > 0 ? `<span class="pill pill-yellow">🧩 ${exCount}</span>` : '';

  const accessBadge = hasLevelAccess
    ? `<span class="pill pill-blue">✅ Acceso</span>`
    : `<span class="pill pill-red">🔒 Premium</span>`;

  const typeBadge = topic.type
    ? `<span class="pill" style="font-weight:900;">🏷️ ${safeText(topic.type)}</span>`
    : `<span class="pill" style="font-weight:900;">📌 Tema</span>`;

  const title = safeText(topic.title || 'Tema');
  const desc = safeText(topic.desc || '');

  return `
    <a class="courseCard" href="${href}" style="text-decoration:none; color:inherit;">
      <div class="card" style="padding:16px; border-radius:24px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${typeBadge}
            ${accessBadge}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:center;">
            ${lessonBadge || ''}
            ${exBadge || ''}
            <span class="pill" style="opacity:.9;">Entrar →</span>
          </div>
        </div>

        <div class="courseTitle" style="font-family:'Playfair Display',serif; font-weight:900; font-size:26px; margin:12px 0 6px; line-height:1.12;">
          ${title}
        </div>

        ${desc ? `<div class="muted" style="margin:0; line-height:1.65;">${desc}</div>` : ''}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <span class="pill">📖 Lección</span>
          <span class="pill">🧩 Ejercicios</span>
        </div>
      </div>
    </a>
  `;
}

async function loadTopics(user) {
  const subtitle = $('levelSubtitle');
  const flags = await getUserFlags(user.uid);

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
      renderCard(topic, lessonBadge, exCount, flags.hasLevelAccess),
    );
  }

  if (snap.empty) {
    host.innerHTML = `<div class="card" style="padding:16px;">No hay temas para este nivel.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) return; // layout.js guards
    loadTopics(user);
  });
});
