// assets/js/pages/lessonpage-page.js
// Public lesson view: reads from course_meta (docId: LEVEL__topicSlug)
// Admin link is based ONLY on users/{uid}.admin === true

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

function safeText(v) {
  return (v ?? '').toString().trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.bottom = '18px';
  el.style.transform = 'translateX(-50%)';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '999px';
  el.style.background = 'rgba(0,0,0,.55)';
  el.style.border = '1px solid rgba(255,255,255,.18)';
  el.style.backdropFilter = 'blur(10px)';
  el.style.zIndex = '9999';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.style.display = 'none';
  }, 2200);
}

function lessonDocId(level, topicSlug) {
  return `${level}__${topicSlug}`;
}

/**
 * Tries to resolve topic info from "courses" collection using:
 * 1) direct doc id
 * 2) where level + slug == topicKey
 * 3) where level + topicSlug == topicKey
 */
async function loadTopicInfo(level, topicKey) {
  const fallback = {
    title: topicKey,
    desc: '',
    slug: topicKey,
  };

  // 1) by doc id
  try {
    const snap = await getDoc(doc(db, 'courses', topicKey));
    if (snap.exists()) {
      const d = snap.data() || {};
      const slug = safeText(d.slug || d.topicSlug || topicKey);
      return {
        title: safeText(d.title || d.name || d.topic || topicKey),
        desc: safeText(d.desc || d.description || ''),
        slug,
      };
    }
  } catch (_) {}

  // 2) by slug
  try {
    const qy = query(
      collection(db, 'courses'),
      where('level', '==', level),
      where('slug', '==', topicKey),
    );
    const snap = await getDocs(qy);
    if (!snap.empty) {
      const d = snap.docs[0].data() || {};
      const slug = safeText(d.slug || d.topicSlug || topicKey);
      return {
        title: safeText(d.title || d.name || d.topic || topicKey),
        desc: safeText(d.desc || d.description || ''),
        slug,
      };
    }
  } catch (_) {}

  // 3) by topicSlug
  try {
    const qy2 = query(
      collection(db, 'courses'),
      where('level', '==', level),
      where('topicSlug', '==', topicKey),
    );
    const snap2 = await getDocs(qy2);
    if (!snap2.empty) {
      const d = snap2.docs[0].data() || {};
      const slug = safeText(d.slug || d.topicSlug || topicKey);
      return {
        title: safeText(d.title || d.name || d.topic || topicKey),
        desc: safeText(d.desc || d.description || ''),
        slug,
      };
    }
  } catch (_) {}

  return fallback;
}

function renderLesson(meta, topicInfo, level, topicKey, isAdmin) {
  const title =
    safeText(meta.titleEs || meta.title || topicInfo.title) || 'Lección';
  const desc =
    safeText(
      meta.descriptionEs || meta.desc || meta.description || topicInfo.desc,
    ) || '';

  $('lessonTitle').textContent = title;
  $('lessonDesc').textContent = desc;

  $('pillLevel').textContent = `Nivel: ${level}`;
  $('pillTopic').textContent = `Tema: ${safeText(topicInfo.title) || topicKey}`;

  // Optional pills (keep compatible with your HTML)
  const pillType = $('pillType');
  const pillDuration = $('pillDuration');
  const pillPub = $('pillPub');
  const studentHint = $('studentHint');

  const type = safeText(meta.type);
  if (pillType) {
    if (type) {
      pillType.style.display = 'inline-flex';
      pillType.textContent = `📌 ${type}`;
    } else {
      pillType.style.display = 'none';
    }
  }

  const dur = Number(meta.durationMin || meta.duration || 0);
  if (pillDuration) {
    if (dur > 0) {
      pillDuration.style.display = 'inline-flex';
      pillDuration.textContent = `⏱ ${dur} min`;
    } else {
      pillDuration.style.display = 'none';
    }
  }

  const published = meta.published === true;
  if (pillPub) {
    pillPub.style.display = 'inline-flex';
    pillPub.textContent = published ? '✅ Publicado' : '🟡 Borrador';
  }

  // Content rendering
  const content = $('lessonContent');
  const empty = $('lessonEmpty');

  const html = safeText(meta.html);

  // If not published and not admin: hide HTML
  if (!published && !isAdmin) {
    content.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent =
      'Esta lección aún no está publicada. Si eres estudiante, vuelve más tarde.';
    if (studentHint) {
      studentHint.style.display = 'block';
      studentHint.textContent =
        'Tip: si eres admin, abre la lección desde el panel admin para publicarla.';
    }
    return;
  }

  if (studentHint) studentHint.style.display = 'none';

  if (html) {
    content.innerHTML = html; // trusted admin HTML
    content.style.display = 'block';
    empty.style.display = 'none';
  } else {
    content.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent = 'Todavía no hay contenido de lección para este tema.';
  }
}

async function checkIsAdmin(user) {
  try {
    if (!user?.uid) return false;
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data()?.admin === true;
  } catch (_) {
    return false;
  }
}

async function loadLesson(level, topicKey, user) {
  const titleEl = $('lessonTitle');
  const descEl = $('lessonDesc');
  const empty = $('lessonEmpty');
  const content = $('lessonContent');
  const pillAdminLink = $('pillAdminLink');

  if (!level || !topicKey) {
    titleEl.textContent = 'Faltan parámetros';
    descEl.textContent = 'Faltan parámetros en la URL (level, id).';
    empty.style.display = 'block';
    empty.textContent =
      'Abre por ejemplo: lessonpage.html?level=A1&id=tuTopicId';
    return;
  }

  const isAdmin = await checkIsAdmin(user);

  // Admin link
  if (pillAdminLink) {
    if (isAdmin) {
      pillAdminLink.style.display = 'inline-flex';
      pillAdminLink.href = `lessonadmin.html?level=${encodeURIComponent(
        level,
      )}&id=${encodeURIComponent(topicKey)}`;
    } else {
      pillAdminLink.style.display = 'none';
    }
  }

  // Resolve topic info
  const topicInfo = await loadTopicInfo(level, topicKey);

  // Read meta from course_meta by LEVEL__slug
  const keyForDoc = safeText(topicInfo.slug) || safeText(topicKey);
  const ref = doc(db, 'course_meta', lessonDocId(level, keyForDoc));

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      renderLesson(
        { published: false, html: '' },
        topicInfo,
        level,
        topicKey,
        isAdmin,
      );
      return;
    }
    renderLesson(snap.data() || {}, topicInfo, level, topicKey, isAdmin);
  } catch (e) {
    console.error(e);
    content.style.display = 'none';
    empty.style.display = 'block';
    empty.textContent =
      'No se pudo cargar la lección. Revisa la consola y tu conexión a Firestore.';
    showToast('Error al cargar la lección');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const LEVEL = safeText(params.get('level')).toUpperCase();
  const TOPIC_ID = safeText(params.get('id'));

  // Default placeholders
  $('pillLevel').textContent = 'Nivel: —';
  $('pillTopic').textContent = 'Tema: —';

  onAuthStateChanged(auth, (user) => {
    // layout.js already guards, but keep safe:
    if (!user) return;
    loadLesson(LEVEL, TOPIC_ID, user);
  });
});
