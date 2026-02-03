// assets/js/pages/lessonpage-page.js
// Contract: lessonpage.html?level=A1&id=COURSE_DOC_ID
// Topic: courses/{id}
// Lesson content: course_meta/{LEVEL}__{COURSE_ID}
// Access: users/{uid}.admin OR users/{uid}.access===true OR users/{uid}.plan==="premium"

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan } from '../plan-levels.js';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(window.location.search);
const LEVEL = (qs.get('level') || 'A1').toUpperCase();
const COURSE_ID = (qs.get('id') || '').trim();

function showAccessLocked() {
  const wrap = document.querySelector('.container') || document.body;
  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '14px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">🔒 Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Esta lección está bloqueada para tu cuenta.
    </div>
    <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
      <a class="btn-yellow" href="services.html?level=${encodeURIComponent(LEVEL)}" style="text-decoration:none;">Activar acceso</a>
      <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
    </div>
  `;
  // hide regular content if present
  const content = document.getElementById('lessonContent');
  const empty = document.getElementById('lessonEmpty');
  const toc = document.getElementById('tocWrap');
  const sticky = document.getElementById('lessonSticky');
  if (content) content.style.display = 'none';
  if (toc) toc.style.display = 'none';
  if (sticky) sticky.style.display = 'none';
  if (empty) {
    empty.style.display = 'none';
    empty.innerHTML = '';
  }
  wrap.prepend(card);
}

async function trackTopicOpen(uid, courseId, level) {
  if (!uid || !courseId) return;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() || {} : {};
    const opened = data.openedTopics || {};
    const already = opened && opened[courseId] === true;

    // always update "last seen"
    const basePatch = {
      lastSeenAt: serverTimestamp(),
      lastTopicId: courseId,
      lastLevel: level || null,
    };

    if (!snap.exists()) {
      await setDoc(
        userRef,
        {
          email: auth.currentUser?.email || '',
          admin: false,
          access: false,
          plan: 'free',
          blocked: false,
          createdAt: serverTimestamp(),
          openedTopics: { [courseId]: true },
          openedTopicsCount: 1,
          ...basePatch,
        },
        { merge: true },
      );
      return;
    }

    if (already) {
      await updateDoc(userRef, basePatch);
      return;
    }

    await updateDoc(userRef, {
      ...basePatch,
      [`openedTopics.${courseId}`]: true,
      openedTopicsCount: increment(1),
    });
  } catch (e) {
    console.warn('trackTopicOpen failed', e);
  }
}

function metaDocId(level, courseId) {
  return `${level}__${courseId}`;
}

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return { isAdmin: false, hasAccess: false };

    const d = snap.data() || {};
    const isAdmin = d.admin === true;

    if (isAdmin) return { isAdmin: true, hasAccess: true };

    const until = d.accessUntil || null;
    const untilDate = until?.toDate
      ? until.toDate()
      : until
        ? new Date(until)
        : null;
    const hasUntil =
      !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = Array.isArray(d.levels)
      ? d.levels.map((x) => String(x).toUpperCase())
      : [];
    const levels = rawLevels.length
      ? rawLevels
      : levelsFromPlan(d.plan);

    const plan = String(d.plan || '').toLowerCase();
    const hasGlobalAccess =
      plan === 'premium' || (d.access === true && levels.length === 0);
    const hasAccess =
      (hasGlobalAccess || levels.includes(String(LEVEL).toUpperCase())) &&
      isUntilValid;

    return { isAdmin: false, hasAccess };
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
  const readTools = $('readTools');
  const lessonSticky = $('lessonSticky');
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

  if (!flags.hasAccess) {
    showAccessLocked();
    return;
  }
  // Always show reading tools (progress + ejercicios link)
  if (readTools) readTools.style.display = '';

  // Exercise links
  if (exerciseLinksWrap) {
    exerciseLinksWrap.innerHTML = `
      <a class="btn-white-outline" href="ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}">🧩 Ejercicios</a>
      <a class="btn-white-outline" href="course.html?level=${encodeURIComponent(LEVEL)}">📚 Temas</a>
    `;
  }

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

// --- TOC highlight (simple) ---
function wireTocHighlight() {
  const wrap = document.getElementById('tocList');
  const content = document.getElementById('lessonContent');
  if (!wrap || !content) return;

  const links = Array.from(wrap.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;

  const map = new Map();
  for (const a of links) {
    const id = (a.getAttribute('href') || '').slice(1);
    const el = id ? document.getElementById(id) : null;
    if (el) map.set(el, a);
  }
  if (!map.size) return;

  const setActive = (a) => {
    for (const x of links) x.classList.remove('tocActive');
    if (a) a.classList.add('tocActive');
  };

  const obs = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const top = visible[0].target;
      const a = map.get(top);
      if (a) setActive(a);
    },
    { rootMargin: '-15% 0px -70% 0px', threshold: [0.1, 0.2, 0.4, 0.6] },
  );

  for (const el of map.keys()) obs.observe(el);
}
window.addEventListener('DOMContentLoaded', () =>
  setTimeout(wireTocHighlight, 800),
);
