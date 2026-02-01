document.addEventListener('DOMContentLoaded', ()=>{document.body.classList.add('uiMotion');});

async function trackTopicOpen(uid, courseId, level) {
  if (!uid || !courseId) return;
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? (snap.data() || {}) : {};
    const opened = data.openedTopics || {};
    const already = opened && opened[courseId] === true;

    // always update "last seen"
    const basePatch = {
      lastSeenAt: serverTimestamp(),
      lastTopicId: courseId,
      lastLevel: level || null,
    };

    if (!snap.exists()) {
      await setDoc(userRef, {
        email: auth.currentUser?.email || '',
        admin: false,
        access: false,
        plan: 'free',
        blocked: false,
        createdAt: serverTimestamp(),
        openedTopics: { [courseId]: true },
        openedTopicsCount: 1,
        ...basePatch,
      }, { merge: true });
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

import { auth, db } from '../firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  increment,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

// URL params
const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const slugParam = params.get('slug') || '';
const idParam = params.get('id') || '';

// UI refs
const toast = document.getElementById('toast');
const sessionEmail = document.getElementById('sessionEmail');
const topicTitle = document.getElementById('topicTitle');
const topicDesc = document.getElementById('topicDesc');
const taskChips = document.getElementById('taskChips');

const exerciseList = document.getElementById('exerciseList');
const emptyExercises = document.getElementById('emptyExercises');
const adminWrap = document.getElementById('adminWrap');

// pills
const pillLevel = document.getElementById('pillLevel');
const pillType = document.getElementById('pillType');
const pillSlug = document.getElementById('pillSlug');
const pillCount = document.getElementById('pillCount');
const pillProgress = document.getElementById('pillProgress');
const pillLessonLink = document.getElementById('pillLessonLink');

// filters
const searchInput = document.getElementById('searchInput');
const filterType = document.getElementById('filterType');
const filterTag = document.getElementById('filterTag');
const btnClearFilters = document.getElementById('btnClearFilters');
const toggleReorder = document.getElementById('toggleReorder');
const reorderHint = document.getElementById('reorderHint');

// admin-like inputs (student page has them but hidden / disabled)
const exType = document.getElementById('exType');
const exPrompt = document.getElementById('exPrompt');
const exAnswer = document.getElementById('exAnswer');
const exNotes = document.getElementById('exNotes');
const exOrder = document.getElementById('exOrder');
const exOptions = document.getElementById('exOptions');
const exTags = document.getElementById('exTags');
const exImageUrl = document.getElementById('exImageUrl');

// buttons (may exist in template)
const btnSave = document.getElementById('btnSave');
const btnLogout = document.getElementById('btnLogout');
const btnImport = document.getElementById('btnImport');

// internal state
let cachedExercises = [];
let VIEW_EXERCISES = [];
let currentTopic = null;

let isAdmin = false; // admin moved to ejercicioadmin.html
let IS_ADMIN = false; // admin moved to ejercicioadmin.html
let HAS_ACCESS = false;

let HAS_ORDER_CHANGES = false;
let CURRENT_TOPIC_KEY = null;
let CURRENT_UID = null;

function showToast(msg, type = 'ok', ms = 2000) {
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.style.display = 'none'), ms);
}

function setToast(msg, type = 'ok') {
  showToast(msg, type, 2400);
}

function getNextOrder() {
  const max = cachedExercises.reduce(
    (m, e) => Math.max(m, Number(e.order || 0)),
    0,
  );
  return max + 1;
}

function normalizeType(t) {
  return String(t || '').trim();
}

function normalizeTag(t) {
  return String(t || '').trim();
}

function setOptionsVisibility(type) {
  const v = normalizeType(type);
  if (!exOptions) return;
  // for multiple choice, show options; otherwise hide
  const needsOptions = /opci[oó]n m[uú]ltiple/i.test(v) || /multiple/i.test(v);
  exOptions.closest?.('.field')?.classList?.toggle('hidden', !needsOptions);
}

function applyTemplateForSelectedType(overwrite) {
  // Optional template logic; keep as-is
  if (!exType) return;
  const t = exType.value;
  setOptionsVisibility(t);

  const setIf = (el, val) => {
    if (!el) return;
    if (overwrite || !String(el.value || '').trim()) el.value = val;
  };

  if (/Rellenar los espacios/i.test(t)) {
    setIf(exPrompt, 'Completa la frase: ____');
    setIf(exAnswer, '');
    setIf(exOptions, '');
    setIf(exNotes, 'Escribe la respuesta correcta.');
  } else if (/Opción múltiple/i.test(t)) {
    setIf(exPrompt, 'Elige la opción correcta:');
    setIf(exAnswer, '');
    setIf(exOptions, 'A)\nB)\nC)');
    setIf(exNotes, 'Indica la letra correcta en la respuesta.');
  } else if (/Verdadero o falso/i.test(t)) {
    setIf(exPrompt, 'Marca verdadero o falso:');
    setIf(exAnswer, 'Verdadero');
    setIf(exOptions, 'Verdadero\nFalso');
    setIf(exNotes, '');
  }
}

function fillExerciseTypes() {
  // Keep existing list; if exType exists, set last used
  if (!exType) return;
  const types = [
    'Rellenar los espacios',
    'Opción múltiple',
    'Verdadero o falso',
  ];
  exType.innerHTML = types
    .map((t) => `<option value="${t}">${t}</option>`)
    .join('');
  const last = localStorage.getItem('lastExerciseType');
  if (last && types.includes(last)) exType.value = last;
  setOptionsVisibility(exType.value);
}

function buildTypeFilterOptions() {
  if (!filterType) return;
  const types = Array.from(
    new Set(cachedExercises.map((e) => normalizeType(e.type)).filter(Boolean)),
  ).sort();
  filterType.innerHTML =
    `<option value="">Wszystko</option>` +
    types.map((t) => `<option value="${t}">${t}</option>`).join('');
}

function buildTagFilterOptions() {
  if (!filterTag) return;
  const tags = new Set();
  cachedExercises.forEach((e) => {
    (e.tags || []).forEach((t) => tags.add(normalizeTag(t)));
  });
  const list = Array.from(tags).filter(Boolean).sort();
  filterTag.innerHTML =
    `<option value="">Wszystko</option>` +
    list.map((t) => `<option value="${t}">${t}</option>`).join('');
}

function applyFilters() {
  const q = String(searchInput?.value || '')
    .trim()
    .toLowerCase();
  const t = String(filterType?.value || '').trim();
  const tag = String(filterTag?.value || '').trim();

  VIEW_EXERCISES = cachedExercises.filter((e) => {
    if (t && normalizeType(e.type) !== t) return false;
    if (tag) {
      const tags = (e.tags || []).map(normalizeTag);
      if (!tags.includes(tag)) return false;
    }
    if (q) {
      const blob =
        `${e.prompt || ''} ${e.answer || ''} ${(e.options || []).join(' ')} ${e.notes || ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  renderExercises();
}

function computeProgress() {
  // Uses local progress stored per topic key
  try {
    const raw = localStorage.getItem(`progress__${CURRENT_TOPIC_KEY}`) || '{}';
    const obj = JSON.parse(raw);
    const done = Object.values(obj).filter(Boolean).length;
    const total = cachedExercises.length || 0;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  } catch {
    return { done: 0, total: cachedExercises.length || 0, pct: 0 };
  }
}

function setProgressUI() {
  const { done, total, pct } = computeProgress();
  if (pillProgress) pillProgress.textContent = `Progreso: ${pct}%`;
    try{ maybeFinish(done, total, LEVEL, TOPIC_ID); }catch{}
  if (pillCount) pillCount.textContent = `Ejercicios: ${total}`;
  const doneEl = document.getElementById('doneCount');
  const totalEl = document.getElementById('totalCount');
  if (doneEl) doneEl.textContent = String(done);
  if (totalEl) totalEl.textContent = String(total);
}

async function loadProgressForTopic(uid) {
  // no-op, local progress is enough; kept for compatibility
  setProgressUI();
}

function setTaskChips(exCount) {
  if (!taskChips) return;
  taskChips.innerHTML = `
          <span class="pill pill-blue">Total: ${exCount}</span>
          <span class="pill">Mostrando: ${VIEW_EXERCISES.length}</span>
        `;
}

function makeExerciseCard(ex) {
  // Minimal card; keep existing visuals via styles.css
  const card = document.createElement('div');
  card.className = 'exerciseCard';

  const opts = Array.isArray(ex.options) ? ex.options : [];
  const hasOpts = opts.length > 0;

  card.innerHTML = `
          <div class="exerciseTop">
            <div class="exerciseMeta">
              <span class="pill">${ex.type || 'Ejercicio'}</span>
              <span class="pill">#${ex.order || 0}</span>
            </div>
          </div>
          <div class="exercisePrompt">${ex.prompt || ''}</div>
          ${hasOpts ? `<div class="exerciseOptions">${opts.map((o) => `<div class="opt">• ${o}</div>`).join('')}</div>` : ''}
          <div class="exerciseActions">
            <button class="btn-white-outline btnMarkDone">✅ Hecho</button>
          </div>
        `;

  const btn = card.querySelector('.btnMarkDone');
  btn?.addEventListener('click', () => {
    try {
      const key = `progress__${CURRENT_TOPIC_KEY}`;
      const raw = localStorage.getItem(key) || '{}';
      const obj = JSON.parse(raw);
      obj[ex.id] = true;
      localStorage.setItem(key, JSON.stringify(obj));
      showToast('✅ Guardado (local)', 'ok', 1400);
      setProgressUI();
    } catch {
      showToast('⚠️ No se pudo guardar', 'warn', 2000);
    }
  });

  return card;
}

function renderExercises() {
  if (!exerciseList) return;

  exerciseList.innerHTML = '';
  setTaskChips(cachedExercises.length);

  const shown = VIEW_EXERCISES.length;

  if (!shown) {
    emptyExercises.style.display = 'block';
    return;
  }

  emptyExercises.style.display = 'none';

  VIEW_EXERCISES.forEach((ex) => {
    exerciseList.appendChild(makeExerciseCard(ex));
  });

  setProgressUI();
}

async function loadTopic() {
  // id contract: courses/{DOC_ID}
  const courseId = String(idParam || '').trim();
  if (!courseId) return null;

  const snap = await getDoc(doc(db, 'courses', courseId));
  if (!snap.exists()) return null;

  const topic = { id: snap.id, ...(snap.data() || {}) };
  currentTopic = topic;

  const effectiveSlug = String(topic.slug || topic.id || '');
  if (pillSlug) pillSlug.textContent = `slug: ${effectiveSlug}`;
  if (pillLevel) pillLevel.textContent = `Nivel ${LEVEL}`;
  if (pillType) pillType.textContent = topic.type || '—';

  topicTitle.textContent = topic.title || 'Tema';
  topicDesc.textContent = topic.desc || '';

  // ✅ Always show return to lesson
  if (pillLessonLink) {
    pillLessonLink.style.display = 'inline-flex';
    const topicId = String(topic.id || '');
    const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topicId)}`;
    pillLessonLink.href = url;
  }

  return topic;
}

async function loadLessonMetaPublic(topic) {
  // kept as-is (may render lesson link / materials)
  return;
}

async function loadLessonMeta(topic) {
  // student page doesn't load admin meta
  return;
}

async function loadExercises(topic) {
  exerciseList.innerHTML = '';
  emptyExercises.style.display = 'none';
  cachedExercises = [];

  const effectiveSlug = (topic && (topic.slug || topic.id || '')).toString();
  CURRENT_TOPIC_KEY = `${LEVEL}__${effectiveSlug}`;

  // primary: topicId == topic.id
  let qEx = query(
    collection(db, 'exercises'),
    where('level', '==', LEVEL),
    where('topicId', '==', topic.id),
    orderBy('order'),
  );

  let snap = null;
  try {
    snap = await getDocs(qEx);
  } catch (e) {
    // fallback: topicSlug (legacy)
    try {
      qEx = query(
        collection(db, 'exercises'),
        where('level', '==', LEVEL),
        where('topicSlug', '==', effectiveSlug),
        orderBy('order'),
      );
      snap = await getDocs(qEx);
    } catch (e2) {
      console.error(e2);
      snap = null;
    }
  }

  if (!snap) {
    emptyExercises.style.display = 'block';
    emptyExercises.textContent =
      'No se pudo cargar ejercicios (revisa consola).';
    return;
  }

  snap.forEach((d) => {
    const data = d.data() || {};
    cachedExercises.push({ id: d.id, ...data });
  });

  VIEW_EXERCISES = cachedExercises.slice();
  buildTypeFilterOptions();
  buildTagFilterOptions();
  applyFilters();

  // progress
  await loadProgressForTopic(CURRENT_UID);
}

async function computeHasAccess(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;

    const d = snap.data() || {};
    if (d.admin === true) return true;
    if (d.blocked === true) return false;

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
    const timeOk = !!untilDate && !Number.isNaN(untilDate.getTime()) && untilDate.getTime() > Date.now();

    const levels = Array.isArray(d.levels)
      ? d.levels.map((x) => String(x).toUpperCase())
      : [];

    return timeOk && levels.includes(String(LEVEL).toUpperCase());
  } catch (e) {
    console.warn('computeHasAccess failed', e);
    return false;
  }
}

function showAccessLocked() {
  try {
    if (exerciseList) exerciseList.innerHTML = '';
    if (emptyExercises) {
      emptyExercises.style.display = 'block';
      emptyExercises.innerHTML = `
              <div style="padding:14px 14px; line-height:1.6;">
                <b>🔒 Acceso premium</b><br/>
                Para ver ejercicios necesitas acceso.<br/>
                Ve al <a href="services.html" style="text-decoration:underline;">Panel</a> para aplicar un código o activar el plan.
              </div>
            `;
    }
  } catch {}
}
// ===== Auth + boot =====
let CURRENT_UID = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  
  await trackTopicOpen(user.uid, COURSE_ID, LEVEL);
sessionEmail.textContent = user.email || '(sin correo)';
  CURRENT_UID = user.uid || null;
  HAS_ACCESS = await computeHasAccess(CURRENT_UID);

  isAdmin = false; // admin moved to ejercicioadmin.html
  IS_ADMIN = false; // admin moved to ejercicioadmin.html
  adminWrap.style.display = 'none';

  fillExerciseTypes();

  if (exType) {
    // ===== Plantilla UI wiring =====
    const btnApplyTemplate = document.getElementById('btnApplyTemplate');
    const tplOverwrite = document.getElementById('tplOverwrite');

    // Apply on type change (fills only empty fields)
    if (exType)
      exType.addEventListener('change', () =>
        applyTemplateForSelectedType(false),
      );

    if (btnApplyTemplate) {
      btnApplyTemplate.addEventListener('click', () =>
        applyTemplateForSelectedType(!!tplOverwrite?.checked),
      );
    }

    // Upgrade quick buttons: set type + apply
    const wireQuick = (id, type) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.addEventListener('click', () => {
        exType.value = type;
        localStorage.setItem('lastExerciseType', type);
        applyTemplateForSelectedType(!!tplOverwrite?.checked);
        exPrompt?.focus?.();
      });
    };
    wireQuick('btnTplFill', 'Rellenar los espacios');
    wireQuick('btnTplChoice', 'Opción múltiple');
    wireQuick('btnTplTF', 'Verdadero o falso');

    // First paint: ensure options visibility matches current type
    setOptionsVisibility(exType.value);
  }

  // UI wiring
  if (filterType) {
    // default options; real types filled after load
    filterType.innerHTML = `<option value="">Wszystko</option>`;
  }
  if (!IS_ADMIN) {
    if (toggleReorder) toggleReorder.disabled = true;
    if (toggleReorder) toggleReorder.checked = false;
  }

  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterType) filterType.value = '';
      if (filterTag) filterTag.value = '';
      applyFilters();
    });
  }
  if (searchInput) searchInput.addEventListener('input', () => applyFilters());
  if (filterType) filterType.addEventListener('change', () => applyFilters());
  if (filterTag) filterTag.addEventListener('change', () => applyFilters());

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch {}
      window.location.href = 'login.html';
    });
  }

  // If missing params, do not try to query Firestore
  if (!params.get('id') && !params.get('slug')) return;

  try {
    showToast('⏳ Cargando tema...', 'warn', 1200);

    const topic = await loadTopic();
    // Lesson editor will be shown after topic loads
    if (!topic) {
      topicTitle.textContent = 'Tema no encontrado';
      topicDesc.textContent =
        'No se pudo cargar el tema. Verifica el enlace (level/slug/id).';
      pillType.textContent = '—';
      pillSlug.textContent = '—';
      pillCount.textContent = 'Ejercicios: 0';
      pillProgress.textContent = 'Progreso: 0%';
      emptyExercises.style.display = 'block';
      emptyExercises.textContent = 'Tema no encontrado.';
      return;
    }

    await loadLessonMetaPublic(topic);
    if (isAdmin) await loadLessonMeta(topic);

    // 🔒 Premium gate (students)
    if (!HAS_ACCESS) {
      showAccessLocked();
      return;
    }

    await loadExercises(topic);
    if (isAdmin) {
      exOrder.value = String(getNextOrder());
    }
  } catch (e) {
    console.error(e);
    showToast('❌ No se pudo cargar (consola)', 'bad', 3200);
    emptyExercises.style.display = 'block';
    emptyExercises.textContent = 'No se pudo cargar. Revisa la consola.';
  }
});


// --- Finish modal helpers ---
function showFinishModal(done, total, level, topicId){
  const modal = document.getElementById('finishModal');
  if(!modal) return;
  const txt = document.getElementById('finishText');
  if(txt){
    txt.textContent = `Has completado ${done}/${total} ejercicios. ¡Buen trabajo!`;
  }
  const btnLesson = document.getElementById('btnFinishLesson');
  const btnCourse = document.getElementById('btnFinishCourse');
  const btnPanel = document.getElementById('btnFinishPanel');
  if(btnLesson) btnLesson.href = `lessonpage.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(topicId)}`;
  if(btnCourse) btnCourse.href = `course.html?level=${encodeURIComponent(level)}`;
  if(btnPanel) btnPanel.href = 'espanel.html';

  const close = () => { modal.style.display = 'none'; };
  const closeBtn = document.getElementById('btnCloseFinish');
  if(closeBtn) closeBtn.onclick = close;
  modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); }, { once:true });

  modal.style.display = 'flex';
}

// Call when progress hits 100% (non-blocking)
function maybeFinish(done, total, level, topicId){
  if(!total) return;
  if(done >= total){
    // small delay so UI updates first
    setTimeout(()=> showFinishModal(done, total, level, topicId), 450);
  }
}
