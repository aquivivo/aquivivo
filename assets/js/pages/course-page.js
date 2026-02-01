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

function showAccessLocked(reason = 'locked') {
  const host = document.querySelector('.container') || document.body;
  const page = document.querySelector('main.page .container') || host;

  // try to use existing empty states if present
  const grid = document.getElementById('topicsGrid') || document.getElementById('courseList') || null;

  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '16px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">🔒 Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Este nivel está bloqueado para tu cuenta en este momento.
    </div>
    <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
      <a class="btn-yellow" href="services.html?level=${encodeURIComponent(LEVEL)}" style="text-decoration:none;">Activar acceso</a>
      <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
    </div>
  `;
  if (grid) grid.innerHTML = '';
  page.prepend(card);
}

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return { isAdmin: false, hasLevelAccess: false, blocked: false };
    }

    const d = snap.data() || {};
    const isAdmin = d.admin === true;
    const blocked = d.blocked === true;

    if (isAdmin) {
      return { isAdmin: true, hasLevelAccess: true, blocked: false };
    }

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
    const timeOk = !!untilDate && !Number.isNaN(untilDate.getTime()) && untilDate.getTime() > Date.now();

    const levels = Array.isArray(d.levels)
      ? d.levels.map((x) => String(x).toUpperCase())
      : [];

    const hasLevelAccess = timeOk && levels.includes(String(LEVEL).toUpperCase());

    return { isAdmin: false, hasLevelAccess, blocked, levels };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasLevelAccess: false, blocked: false };
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

function tileAccentClass(topic){
  const raw = String(topic?.tileStyle || topic?.tileClass || '').toLowerCase().trim();
  if (!raw) return '';
  if (raw === 'yellow' || raw === 'amarillo') return 'cardAccentYellow';
  if (raw === 'blue' || raw === 'azul') return 'cardAccentBlue';
  if (raw === 'red' || raw === 'rojo') return 'cardAccentRed';
  if (raw === 'a1') return 'cardAccentBlue';
  if (raw === 'a2') return 'cardAccentBlue';
  if (raw === 'b1') return 'cardAccentRed';
  if (raw === 'b2') return 'cardAccentYellow';
  if (raw.startsWith('cardaccent')) return raw; // allow direct class
  return '';
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
  const accent = tileAccentClass(topic);
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
      <div class="card ${accent}" style="padding:16px; border-radius:24px;">
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

  if (flags.blocked) { showAccessLocked('blocked'); return; }
  if (!flags.hasLevelAccess) { showAccessLocked('locked'); return; }
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

    // Soft-delete / archive
    if (topic.isArchived === true) continue;

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
