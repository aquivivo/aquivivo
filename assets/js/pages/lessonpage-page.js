// assets/js/pages/lessonpage-page.js
// Contract: lessonpage.html?level=A1&id=COURSE_DOC_ID

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan } from '../plan-levels.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(window.location.search);
const LEVEL = (qs.get('level') || 'A1').toUpperCase();
const COURSE_ID = (qs.get('id') || '').trim();
let currentTopic = null;

let selectedRating = 0;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

function isAdminUser(userDoc, email) {
  const mail = String(email || '').toLowerCase();
  return (
    ADMIN_EMAILS.includes(mail) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin'
  );
}

function showAccessLocked() {
  const wrap = document.querySelector('.container') || document.body;
  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '14px';
  card.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Acceso requerido</div>
    <div class="muted" style="margin-top:6px; line-height:1.6;">
      Esta leccion esta bloqueada para tu cuenta.
    </div>
    <div class="metaRow" style="margin-top:14px; flex-wrap:wrap; gap:10px;">
      <a class="btn-yellow" href="services.html?level=${encodeURIComponent(LEVEL)}" style="text-decoration:none;">Activar acceso</a>
      <a class="btn-white-outline" href="espanel.html" style="text-decoration:none;">Volver al panel</a>
    </div>
  `;
  const content = $('lessonContent');
  const empty = $('lessonEmpty');
  const toc = $('tocWrap');
  const sticky = $('lessonSticky');
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

function topicKeyFrom(topic) {
  const slug = String(topic?.slug || topic?.id || COURSE_ID || '').trim();
  return slug ? `${LEVEL}__${slug}` : null;
}

async function getUserFlags(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return { isAdmin: false, hasAccess: false, levels: [], hasGlobalAccess: false };

    const d = snap.data() || {};
    const isAdmin = isAdminUser(d, auth.currentUser?.email);
    if (isAdmin) return { isAdmin: true, hasAccess: true, levels: [], hasGlobalAccess: true };

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = Array.isArray(d.levels)
      ? d.levels.map((x) => String(x).toUpperCase())
      : [];
    const levels = rawLevels.length ? rawLevels : levelsFromPlan(d.plan);

    const plan = String(d.plan || '').toLowerCase();
    const hasGlobalAccess = plan === 'premium' || (d.access === true && levels.length === 0);
    const hasAccess =
      (hasGlobalAccess || levels.includes(String(LEVEL).toUpperCase())) && isUntilValid;

    return { isAdmin: false, hasAccess, levels, hasGlobalAccess };
  } catch (e) {
    console.warn('getUserFlags failed', e);
    return { isAdmin: false, hasAccess: false, levels: [], hasGlobalAccess: false };
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

function renderEmpty(msg) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = msg;
  }
}

function renderLocked() {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = `
      <div style="font-size:16px; line-height:1.6;">
        <b>Acceso premium</b><br/>
        Para ver esta leccion necesitas acceso.<br/>
        Ve al <a href="espanel.html" style="text-decoration:underline;">Panel</a> para aplicar un codigo o activar el plan.
      </div>
    `;
  }
}

function prevLevelOf(level) {
  const lvl = String(level || '').toUpperCase();
  if (lvl === 'A2') return 'A1';
  if (lvl === 'B1') return 'A2';
  if (lvl === 'B2') return 'B1';
  return '';
}

async function isPrevLevelCompleted(uid, prevLevel) {
  if (!uid || !prevLevel) return true;
  try {
    const courseSnap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', prevLevel)),
    );
    const total = courseSnap.docs.filter((d) => (d.data() || {}).isArchived !== true)
      .length;
    if (!total) return true;

    const progSnap = await getDocs(
      query(
        collection(db, 'user_progress', uid, 'topics'),
        where('level', '==', prevLevel),
      ),
    );
    let completed = 0;
    progSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.completed === true) completed += 1;
    });
    return completed >= total;
  } catch (e) {
    console.warn('prev level check failed', e);
    return true;
  }
}

function renderLevelGate(prevLevel) {
  show($('lessonContent'), false);
  show($('tocWrap'), false);
  const empty = $('lessonEmpty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = `
      <div style="font-size:16px; line-height:1.6;">
        <b>Acceso bloqueado</b><br/>
        Para leer este nivel primero completa <b>${prevLevel}</b>.<br/>
        Ve a <a href="course.html?level=${encodeURIComponent(prevLevel)}" style="text-decoration:underline;">Programa ${prevLevel}</a>.
      </div>
    `;
  }
}

function updateProgressUI(progress) {
  const readFill = $('readProgressFill');
  const readText = $('readProgressText');
  const testText = $('testProgressText');
  const statusText = $('lessonStatusText');

  const practicePercent = Number(progress?.practicePercent || 0);
  const practiceDone = Number(progress?.practiceDone || 0);
  const practiceTotal = Number(progress?.practiceTotal || 0);
  const testScore = Number(progress?.testScore || 0);
  const testTotal = Number(progress?.testTotal || 0);
  const completed = progress?.completed === true;

  if (readFill) readFill.style.width = `${practicePercent}%`;
  if (readText) {
    readText.textContent = practiceTotal
      ? `Ejercicios: ${practiceDone}/${practiceTotal} (${practicePercent}%)`
      : 'Ejercicios: -';
  }
  if (testText) {
    testText.textContent = testTotal ? `Test: ${testScore}%` : 'Test: -';
  }
  if (statusText) {
    statusText.textContent = completed ? 'Estado: completado' : 'Estado: en progreso';
  }
}

async function loadProgress(uid, topic) {
  if (!uid || !topic) return;
  const key = topicKeyFrom(topic);
  if (!key) return;

  try {
    const snap = await getDoc(doc(db, 'user_progress', uid, 'topics', key));
    if (!snap.exists()) {
      updateProgressUI(null);
      return;
    }
    updateProgressUI(snap.data() || {});
  } catch (e) {
    console.warn('loadProgress failed', e);
  }
}

function renderRatingButtons() {
  const card = $('ratingCard');
  if (!card) return;
  card.querySelectorAll('button[data-rating]').forEach((btn) => {
    const val = Number(btn.getAttribute('data-rating') || 0);
    if (val === selectedRating) {
      btn.classList.add('btn-yellow');
      btn.classList.remove('btn-white-outline');
    } else {
      btn.classList.add('btn-white-outline');
      btn.classList.remove('btn-yellow');
    }
  });
}

function setRatingMsg(text, bad = false) {
  const el = $('ratingMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

async function loadMyReview(user, topic) {
  if (!user?.uid || !topic) return;
  const reviewId = `${user.uid}__${topic.id || COURSE_ID}`;
  try {
    const snap = await getDoc(doc(db, 'reviews', reviewId));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    selectedRating = Number(data.rating || 0);
    const text = String(data.text || data.comment || '');
    const input = $('ratingText');
    if (input) input.value = text;
    renderRatingButtons();
  } catch (e) {
    console.warn('loadMyReview failed', e);
  }
}

async function saveReview(user, topic) {
  if (!user?.uid || !topic) return;
  if (!selectedRating) {
    setRatingMsg('Elige una calificacion (1-5).', true);
    return;
  }

  const reviewId = `${user.uid}__${topic.id || COURSE_ID}`;
  const reviewRef = doc(db, 'reviews', reviewId);
  const text = String($('ratingText')?.value || '').trim();

  try {
    const snap = await getDoc(reviewRef);
    const payload = {
      userId: user.uid,
      userEmail: user.email || '',
      targetType: 'topic',
      level: LEVEL,
      topicId: topic.id || COURSE_ID,
      topicSlug: topic.slug || null,
      topicTitle: topic.title || topic.name || '',
      rating: Number(selectedRating),
      text,
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) payload.createdAt = serverTimestamp();
    await setDoc(reviewRef, payload, { merge: true });
    setRatingMsg('Gracias. Tu opinion fue guardada.');
  } catch (e) {
    console.error(e);
    setRatingMsg('No se pudo guardar la opinion.', true);
  }
}

function setupRatingCard(user, topic) {
  const card = $('ratingCard');
  if (!card) return;
  card.style.display = 'block';

  card.querySelectorAll('button[data-rating]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.getAttribute('data-rating') || 0);
      renderRatingButtons();
    });
  });

  $('btnSaveReview')?.addEventListener('click', () => saveReview(user, topic));
  renderRatingButtons();
  loadMyReview(user, topic);
}

async function loadLesson(user) {
  const pillLevel = $('pillLevel');
  const pillTopic = $('pillTopic');
  const pillType = $('pillType');
  const pillDuration = $('pillDuration');
  const pillPub = $('pillPub');
  const pillAdminLink = $('pillAdminLink');
  const readTools = $('readTools');
  const exerciseLinksWrap = $('exerciseLinksWrap');
  const extrasWrap = $('lessonExtras');

  setText('lessonTitle', 'Cargando...');
  setText('lessonDesc', 'Cargando...');
  if (pillLevel) pillLevel.textContent = `Nivel: ${LEVEL}`;
  if (pillTopic) pillTopic.textContent = 'Tema: -';

  if (!COURSE_ID) {
    renderEmpty('Faltan parametros en la URL (id).');
    return;
  }

  const flags = await getUserFlags(user.uid);
  if (!flags.hasAccess) {
    showAccessLocked();
    return;
  }

  if (readTools) readTools.style.display = '';

  if (exerciseLinksWrap) {
    exerciseLinksWrap.innerHTML = `
      <a class="btn-white-outline" href="ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}">Ejercicios</a>
      <a class="btn-white-outline" href="review.html">Repasar</a>
      <a class="btn-white-outline" href="course.html?level=${encodeURIComponent(LEVEL)}">Temas</a>
    `;
  }

  if (pillAdminLink && flags.isAdmin) {
    pillAdminLink.style.display = 'inline-flex';
    pillAdminLink.href = `lessonadmin.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(COURSE_ID)}`;
  } else if (pillAdminLink) {
    pillAdminLink.style.display = 'none';
  }

  let topic = null;
  try {
    const snap = await getDoc(doc(db, 'courses', COURSE_ID));
    if (snap.exists()) topic = { id: snap.id, ...(snap.data() || {}) };
  } catch (e) {
    console.error(e);
  }
  currentTopic = topic;

  const topicTitle = topic?.title || topic?.name || 'Leccion';
  const topicDesc = topic?.desc || topic?.description || '';
  if (pillTopic) pillTopic.textContent = `Tema: ${topicTitle}`;

  if (!flags.isAdmin) {
    const prevLevel = prevLevelOf(LEVEL);
    const hasMulti =
      flags.hasGlobalAccess ||
      (Array.isArray(flags.levels) && flags.levels.length > 1);
    if (prevLevel && hasMulti) {
      const ok = await isPrevLevelCompleted(user.uid, prevLevel);
      if (!ok) {
        renderLevelGate(prevLevel);
        return;
      }
    }
  }

  let meta = null;
  try {
    const metaSnap = await getDoc(doc(db, 'course_meta', metaDocId(LEVEL, COURSE_ID)));
    if (metaSnap.exists()) meta = metaSnap.data() || {};
  } catch (e) {
    console.error(e);
  }

  setText('lessonTitle', String(meta?.titleEs || meta?.title || topicTitle || 'Leccion').trim());
  setText(
    'lessonDesc',
    String(meta?.descriptionEs || meta?.desc || meta?.description || topicDesc || '').trim(),
  );

  function renderExtras(metaData) {
    if (!extrasWrap) return;
    const summary = String(metaData?.summary || '').trim();
    const vocab = Array.isArray(metaData?.vocab) ? metaData.vocab : [];
    const resources = Array.isArray(metaData?.resources) ? metaData.resources : [];
    const homework = String(metaData?.homework || '').trim();

    const blocks = [];

    if (summary) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Resumen</div>
          <div class="muted" style="line-height:1.6;">${summary}</div>
        </div>
      `);
    }

    if (vocab.length) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Vocabulario clave</div>
          <div class="lessonExtraList">
            ${vocab.map((v) => `<div class="lessonExtraItem">${v}</div>`).join('')}
          </div>
        </div>
      `);
    }

    if (resources.length) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Recursos</div>
          <div class="lessonExtraList">
            ${resources
              .map((r) => {
                const label = (r?.label || r?.title || r?.name || 'Recurso').trim();
                const url = (r?.url || '').trim();
                if (!url) return '';
                return `<a class="lessonExtraLink" href="${url}" target="_blank" rel="noopener">${label}</a>`;
              })
              .filter(Boolean)
              .join('')}
          </div>
        </div>
      `);
    }

    if (homework) {
      blocks.push(`
        <div class="card lessonExtraCard">
          <div class="sectionTitle" style="margin-top:0;">Tarea</div>
          <div class="muted" style="line-height:1.6;">${homework}</div>
        </div>
      `);
    }

    if (!blocks.length) {
      extrasWrap.style.display = 'none';
      extrasWrap.innerHTML = '';
      return;
    }

    extrasWrap.style.display = '';
    extrasWrap.innerHTML = blocks.join('');
  }

  if (pillType) {
    if (meta?.type) {
      pillType.style.display = 'inline-flex';
      pillType.textContent = meta.type;
    } else {
      pillType.style.display = 'none';
    }
  }

  const dur = Number(meta?.durationMin || meta?.duration || 0);
  if (pillDuration) {
    if (dur > 0) {
      pillDuration.style.display = 'inline-flex';
      pillDuration.textContent = `${dur} min`;
    } else {
      pillDuration.style.display = 'none';
    }
  }

  const published = meta?.published === true;
  if (pillPub) {
    pillPub.style.display = 'inline-flex';
    pillPub.textContent = published ? 'Publicado' : 'Borrador';
  }

  if (!flags.hasAccess) {
    renderLocked();
    return;
  }

  if (!published && !flags.isAdmin) {
    renderEmpty('Esta leccion aun no esta publicada.');
    const hint = $('studentHint');
    if (hint) {
      hint.style.display = 'block';
      hint.textContent = 'Vuelve mas tarde.';
    }
    return;
  }

  const html = String(meta?.html || '').trim();
  if (!html) {
    renderEmpty('Todavia no hay contenido de leccion para este tema.');
    return;
  }

  const contentEl = $('lessonContent');
  if (contentEl) {
    contentEl.innerHTML = html;
    contentEl.style.display = 'block';
  }

  renderExtras(meta || {});

  if (topic) setupRatingCard(user, topic);

  await trackTopicOpen(user.uid, COURSE_ID, LEVEL);
  await loadProgress(user.uid, topic || { id: COURSE_ID, slug: COURSE_ID });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    loadLesson(user);
  });
});

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
