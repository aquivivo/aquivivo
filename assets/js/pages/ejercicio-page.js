document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('uiMotion');
});

import { auth, db } from '../firebase-init.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const TOPIC_ID = String(params.get('id') || '').trim();
const SLUG = String(params.get('slug') || '').trim();

const PRACTICE_COMPLETE_PCT = 80;
const TEST_PASS_PCT = 80;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

const toast = document.getElementById('toast');
const sessionEmail = document.getElementById('sessionEmail');
const topicTitle = document.getElementById('topicTitle');
const topicDesc = document.getElementById('topicDesc');
const taskChips = document.getElementById('taskChips');

const exerciseList = document.getElementById('exerciseList');
const emptyExercises = document.getElementById('emptyExercises');
const adminWrap = document.getElementById('adminWrap');

const pillLevel = document.getElementById('pillLevel');
const pillType = document.getElementById('pillType');
const pillSlug = document.getElementById('pillSlug');
const pillCount = document.getElementById('pillCount');
const pillProgress = document.getElementById('pillProgress');
const pillTestScore = document.getElementById('pillTestScore');
const pillLessonLink = document.getElementById('pillLessonLink');

const readProgressFill = document.getElementById('readProgressFill');
const readProgressText = document.getElementById('readProgressText');
const testProgressText = document.getElementById('testProgressText');

const searchInput = document.getElementById('searchInput');
const filterType = document.getElementById('filterType');
const filterTag = document.getElementById('filterTag');
const btnClearFilters = document.getElementById('btnClearFilters');

  const btnLogout = document.getElementById('btnLogout');
  const btnBackLesson = document.getElementById('btnBackLesson');
  const btnBackCourse = document.getElementById('btnBackCourse');
  const btnReview = document.getElementById('btnReview');
  const btnFlashcards = document.getElementById('btnFlashcards');

let cachedExercises = [];
let VIEW_EXERCISES = [];
let CURRENT_UID = null;
let CURRENT_TOPIC_KEY = null;
let currentTopic = null;
let hasShownFinish = false;
let completedAt = null;

const progressState = {
  doneIds: new Set(),
  testResults: new Map(),
};

function isAdminUser(userDoc, email) {
  const mail = String(email || '').toLowerCase();
  return (
    ADMIN_EMAILS.includes(mail) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin'
  );
}

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

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeType(value) {
  return String(value || '').trim();
}

function normalizeTag(value) {
  return String(value || '').trim();
}

function normalizeTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => String(t || '').trim())
      .filter(Boolean);
  }
  return [];
}

function isTestExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('test final');
}

function parseAnswerList(raw) {
  return String(raw || '')
    .split(/[\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOptions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n/)
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [];
}

function optionLabelFromIndex(idx) {
  return String.fromCharCode(65 + idx);
}

function cleanOptionText(opt) {
  return String(opt || '').replace(/^[A-D]\s*[)\.:-]\s*/i, '').trim();
}

function topicKeyFrom(topic) {
  const slug = String(topic?.slug || topic?.id || SLUG || TOPIC_ID || '').trim();
  return slug ? `${LEVEL}__${slug}` : null;
}

function progressDocRef(uid, topicKey) {
  return doc(db, 'user_progress', uid, 'topics', topicKey);
}

function computeProgressStats() {
  const allIds = new Set(cachedExercises.map((ex) => String(ex.id)));
  const testExercises = cachedExercises.filter((ex) => isTestExercise(ex));
  const practiceExercises = cachedExercises.filter((ex) => !isTestExercise(ex));

  const doneIds = Array.from(progressState.doneIds).filter((id) => allIds.has(id));
  const doneAll = doneIds.length;

  const practiceIdSet = new Set(practiceExercises.map((ex) => String(ex.id)));
  const donePractice = doneIds.filter((id) => practiceIdSet.has(id)).length;
  const totalPractice = practiceExercises.length;
  const practicePercent = totalPractice
    ? Math.round((donePractice / totalPractice) * 100)
    : 0;

  const testIdSet = new Set(testExercises.map((ex) => String(ex.id)));
  let testAnswered = 0;
  let testCorrect = 0;
  for (const id of testIdSet) {
    const res = progressState.testResults.get(id);
    if (!res) continue;
    testAnswered += 1;
    if (res.correct === true) testCorrect += 1;
  }
  const testTotal = testExercises.length;
  const testScore = testTotal ? Math.round((testCorrect / testTotal) * 100) : 0;
  const testPassed = testTotal ? testScore >= TEST_PASS_PCT : true;

  const overallPercent = cachedExercises.length
    ? Math.round((doneAll / cachedExercises.length) * 100)
    : 0;

  const completed = practicePercent >= PRACTICE_COMPLETE_PCT && testPassed;

  return {
    totalAll: cachedExercises.length,
    doneAll,
    doneIds,
    totalPractice,
    donePractice,
    practicePercent,
    overallPercent,
    testTotal,
    testAnswered,
    testCorrect,
    testScore,
    testPassed,
    completed,
    practiceIds: practiceIdSet,
    testIds: testIdSet,
  };
}

function setProgressUI() {
  const stats = computeProgressStats();

  if (pillProgress) pillProgress.textContent = `Practica: ${stats.practicePercent}%`;
  if (pillTestScore) {
    pillTestScore.textContent = stats.testTotal ? `Test: ${stats.testScore}%` : 'Test: -';
  }
  if (pillCount) pillCount.textContent = `Ejercicios: ${stats.totalAll}`;

  if (readProgressFill) readProgressFill.style.width = `${stats.practicePercent}%`;
  if (readProgressText) {
    readProgressText.textContent = stats.totalPractice
      ? `Ejercicios: ${stats.donePractice}/${stats.totalPractice} (${stats.practicePercent}%)`
      : 'Ejercicios: -';
  }
  if (testProgressText) {
    testProgressText.textContent = stats.testTotal
      ? `Test: ${stats.testCorrect}/${stats.testTotal} (${stats.testScore}%)`
      : 'Test: -';
  }

  const doneEl = document.getElementById('doneCount');
  const totalEl = document.getElementById('totalCount');
  if (doneEl) doneEl.textContent = String(stats.donePractice);
  if (totalEl) totalEl.textContent = String(stats.totalPractice);

  maybeFinish(stats);
}

async function loadProgressForTopic(uid) {
  if (!uid || !CURRENT_TOPIC_KEY) return;
  try {
    const snap = await getDoc(progressDocRef(uid, CURRENT_TOPIC_KEY));
    progressState.doneIds = new Set();
    progressState.testResults = new Map();
    completedAt = null;

    if (snap.exists()) {
      const data = snap.data() || {};
      const done = Array.isArray(data.doneIds) ? data.doneIds : [];
      done.forEach((id) => progressState.doneIds.add(String(id)));

      const testResults = data.testResults && typeof data.testResults === 'object'
        ? data.testResults
        : {};
      Object.keys(testResults).forEach((key) => {
        progressState.testResults.set(String(key), testResults[key]);
      });

      completedAt = data.completedAt || null;
    }
  } catch (e) {
    console.warn('Progress read failed:', e?.code || e);
  }

  setProgressUI();
}

async function saveProgress() {
  if (!CURRENT_UID || !CURRENT_TOPIC_KEY) return;

  const stats = computeProgressStats();
  const testResults = {};
  stats.testIds.forEach((id) => {
    const res = progressState.testResults.get(id);
    if (res) testResults[id] = res;
  });

  const payload = {
    level: LEVEL,
    topicId: currentTopic?.id || TOPIC_ID || null,
    topicSlug: currentTopic?.slug || null,
    totalExercises: stats.totalAll,
    doneIds: stats.doneIds,
    doneCount: stats.doneAll,
    overallPercent: stats.overallPercent,
    practiceTotal: stats.totalPractice,
    practiceDone: stats.donePractice,
    practicePercent: stats.practicePercent,
    testTotal: stats.testTotal,
    testAnswered: stats.testAnswered,
    testCorrect: stats.testCorrect,
    testScore: stats.testScore,
    testPassed: stats.testPassed,
    completed: stats.completed,
    testResults,
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  };

  if (stats.completed && !completedAt) {
    payload.completedAt = serverTimestamp();
  } else if (completedAt) {
    payload.completedAt = completedAt;
  }

  try {
    await setDoc(progressDocRef(CURRENT_UID, CURRENT_TOPIC_KEY), payload, {
      merge: true,
    });
  } catch (e) {
    console.warn('Progress write failed:', e?.code || e);
  }
}

function setTaskChips(exCount) {
  if (!taskChips) return;
  taskChips.innerHTML = `
    <span class="pill pill-blue">Total: ${exCount}</span>
    <span class="pill">Mostrando: ${VIEW_EXERCISES.length}</span>
  `;
}

function buildTypeFilterOptions() {
  if (!filterType) return;
  const types = Array.from(
    new Set(cachedExercises.map((e) => normalizeType(e.type)).filter(Boolean)),
  ).sort();
  filterType.innerHTML =
    `<option value="">Tipo: todos</option>` +
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
    `<option value="">Tag: todos</option>` +
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

function makeOptionRow({ name, value, label, checked, onChange }) {
  const row = document.createElement('label');
  row.className = 'exerciseOption';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = !!checked;
  input.addEventListener('change', onChange);

  const text = document.createElement('span');
  text.textContent = label;

  row.appendChild(input);
  row.appendChild(text);
  return row;
}

function setResultText(resultEl, correct, message) {
  if (!resultEl) return;
  resultEl.textContent = message || (correct ? 'Correcto.' : 'Incorrecto.');
  resultEl.classList.remove('ok', 'bad');
  resultEl.classList.add(correct ? 'ok' : 'bad');
}

function makeExerciseCard(ex) {
  const card = document.createElement('div');
  card.className = 'exerciseCard';

  const top = document.createElement('div');
  top.className = 'exerciseTop';

  const meta = document.createElement('div');
  meta.className = 'exerciseMeta';

  const typePill = document.createElement('span');
  typePill.className = 'pill';
  typePill.textContent = ex.type || 'Ejercicio';

  const orderPill = document.createElement('span');
  orderPill.className = 'pill';
  orderPill.textContent = `#${ex.order || 0}`;

  meta.appendChild(typePill);
  meta.appendChild(orderPill);

  const isTest = isTestExercise(ex);
  if (isTest) {
    const testPill = document.createElement('span');
    testPill.className = 'pill pill-yellow';
    testPill.textContent = 'Test';
    meta.appendChild(testPill);
  }

  const tags = normalizeTags(ex.tags);
  if (tags.length) {
    tags.slice(0, 4).forEach((tag) => {
      const tagPill = document.createElement('span');
      tagPill.className = 'pill';
      tagPill.textContent = `#${tag}`;
      meta.appendChild(tagPill);
    });
  }

  top.appendChild(meta);
  card.appendChild(top);

  const prompt = document.createElement('div');
  prompt.className = 'exercisePrompt';
  prompt.textContent = ex.prompt || '';
  card.appendChild(prompt);

  if (ex.imageUrl) {
    const img = document.createElement('img');
    img.className = 'exerciseImage';
    img.alt = 'Imagen';
    img.loading = 'lazy';
    img.src = ex.imageUrl;
    card.appendChild(img);
  }

  const notes = String(ex.notes || '').trim();
  if (notes) {
    const noteWrap = document.createElement('div');
    noteWrap.className = 'exerciseNoteWrap';

    const noteBtn = document.createElement('button');
    noteBtn.className = 'btn-white-outline exerciseNoteBtn';
    noteBtn.type = 'button';
    noteBtn.textContent = 'Pista';

    const noteText = document.createElement('div');
    noteText.className = 'exerciseNote';
    noteText.textContent = notes;
    noteText.style.display = 'none';

    noteBtn.addEventListener('click', () => {
      const isOpen = noteText.style.display === 'block';
      noteText.style.display = isOpen ? 'none' : 'block';
      noteBtn.textContent = isOpen ? 'Pista' : 'Ocultar pista';
    });

    noteWrap.appendChild(noteBtn);
    noteWrap.appendChild(noteText);
    card.appendChild(noteWrap);
  }

  const options = parseOptions(ex.options);

  const answerWrap = document.createElement('div');
  answerWrap.className = 'exerciseAnswer';

  const resultEl = document.createElement('div');
  resultEl.className = 'exerciseResult';

  const actions = document.createElement('div');
  actions.className = 'exerciseActions';

  if (isTest) {
    let selectedValue = '';
    let selectedLabel = '';

    if (options.length) {
      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `test_${ex.id}`;

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const optionText = cleaned ? `${label}) ${cleaned}` : `${label}) ${opt}`;
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: optionText,
          checked: false,
          onChange: (ev) => {
            selectedValue = ev.target.value;
            selectedLabel = label;
          },
        });
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);
    } else {
      const input = document.createElement('input');
      input.className = 'input';
      input.placeholder = 'Escribe tu respuesta...';
      input.addEventListener('input', (ev) => {
        selectedValue = ev.target.value;
        selectedLabel = '';
      });
      answerWrap.appendChild(input);
      card.appendChild(answerWrap);
    }

    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn-yellow';
    btnCheck.textContent = 'Comprobar';

    btnCheck.addEventListener('click', async () => {
      const userAnswer = String(selectedValue || '').trim();
      if (!userAnswer) {
        showToast('Escribe o elige una respuesta.', 'warn', 1800);
        return;
      }

      const answers = parseAnswerList(ex.answer || '');
      const answerNorms = answers.map((a) => normalizeText(a));
      const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
      const userNorm = normalizeText(userAnswer);
      const labelNorm = normalizeText(selectedLabel || '');

      let correct = false;
      if (answerNorms.includes(userNorm) || answerNormsClean.includes(userNorm)) correct = true;
      if (!correct && labelNorm && (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm))) {
        correct = true;
      }

      progressState.testResults.set(String(ex.id), {
        correct,
        answer: userAnswer,
      });
      progressState.doneIds.add(String(ex.id));

      setResultText(resultEl, correct);
      await saveProgress();
      setProgressUI();
    });

    actions.appendChild(btnCheck);
    card.appendChild(actions);
    card.appendChild(resultEl);

    const prev = progressState.testResults.get(String(ex.id));
    if (prev) {
      setResultText(resultEl, prev.correct === true);
    }
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn-white-outline';
    const done = progressState.doneIds.has(String(ex.id));
    btn.textContent = done ? 'Hecho' : 'Marcar hecho';
    btn.disabled = done;

    btn.addEventListener('click', async () => {
      progressState.doneIds.add(String(ex.id));
      btn.textContent = 'Hecho';
      btn.disabled = true;
      await saveProgress();
      setProgressUI();
    });

    actions.appendChild(btn);
    card.appendChild(actions);
  }

  return card;
}

function renderExercises() {
  if (!exerciseList) return;

  exerciseList.innerHTML = '';
  setTaskChips(cachedExercises.length);

  if (!VIEW_EXERCISES.length) {
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
  if (TOPIC_ID) {
    const snap = await getDoc(doc(db, 'courses', TOPIC_ID));
    if (!snap.exists()) return null;
    const topic = { id: snap.id, ...(snap.data() || {}) };
    return topic;
  }

  if (SLUG) {
    const q = query(
      collection(db, 'courses'),
      where('level', '==', LEVEL),
      where('slug', '==', SLUG),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() || {}) };
  }

  return null;
}

async function loadExercises(topic) {
  exerciseList.innerHTML = '';
  emptyExercises.style.display = 'none';
  cachedExercises = [];

  CURRENT_TOPIC_KEY = topicKeyFrom(topic);

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
    try {
      qEx = query(
        collection(db, 'exercises'),
        where('level', '==', LEVEL),
        where('topicSlug', '==', String(topic.slug || topic.id)),
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
    emptyExercises.textContent = 'No se pudo cargar ejercicios.';
    return;
  }

  snap.forEach((d) => {
    const data = d.data() || {};
    cachedExercises.push({ id: d.id, ...data });
  });

  await loadProgressForTopic(CURRENT_UID);

  VIEW_EXERCISES = cachedExercises.slice();
  buildTypeFilterOptions();
  buildTagFilterOptions();
  applyFilters();
}

async function computeHasAccess(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;

    const d = snap.data() || {};
    if (isAdminUser(d, auth.currentUser?.email)) return true;
    if (d.blocked === true) return false;

    const until = d.accessUntil || null;
    const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
    const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
    const timeOk = hasUntil ? untilDate.getTime() > Date.now() : false;

    const rawLevels = normalizeLevelList(d.levels);
    const levels = rawLevels.length ? rawLevels : normalizeLevelList(levelsFromPlan(d.plan));

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
          <b>Acceso premium</b><br/>
          Para ver ejercicios necesitas acceso.<br/>
          Ve al <a href="services.html" style="text-decoration:underline;">Panel</a> para aplicar un codigo o activar el plan.
        </div>
      `;
    }
  } catch {}
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

function showFinishModal(stats) {
  const modal = document.getElementById('finishModal');
  if (!modal) return;

  const txt = document.getElementById('finishText');
  if (txt) {
    const exerciseLine = stats.totalPractice
      ? `Ejercicios: ${stats.donePractice}/${stats.totalPractice}.`
      : 'Ejercicios completados.';
    const testLine = stats.testTotal
      ? `Test: ${stats.testScore}%.`
      : 'Test completado.';
    txt.textContent = `${exerciseLine} ${testLine}`;
  }

  const btnLesson = document.getElementById('btnFinishLesson');
  const btnCourse = document.getElementById('btnFinishCourse');
  const btnPanel = document.getElementById('btnFinishPanel');
  if (btnLesson && currentTopic?.id)
    btnLesson.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(currentTopic.id)}`;
  if (btnCourse)
    btnCourse.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
  if (btnPanel) btnPanel.href = 'espanel.html';

  const close = () => {
    modal.style.display = 'none';
  };
  const closeBtn = document.getElementById('btnCloseFinish');
  if (closeBtn) closeBtn.onclick = close;
  modal.addEventListener(
    'click',
    (e) => {
      if (e.target === modal) close();
    },
    { once: true },
  );

  modal.style.display = 'flex';
}

function maybeFinish(stats) {
  if (!stats.completed || hasShownFinish) return;
  hasShownFinish = true;
  setTimeout(() => showFinishModal(stats), 450);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  CURRENT_UID = user.uid || null;
  if (sessionEmail) sessionEmail.textContent = user.email || '(sin correo)';

  adminWrap && (adminWrap.style.display = 'none');

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch {}
      window.location.href = 'login.html';
    });
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

  if (!TOPIC_ID && !SLUG) return;

  try {
    showToast('Cargando tema...', 'warn', 1200);

    const topic = await loadTopic();
    if (!topic) {
      if (topicTitle) topicTitle.textContent = 'Tema no encontrado';
      if (topicDesc)
        topicDesc.textContent =
          'No se pudo cargar el tema. Verifica el enlace (level/slug/id).';
      if (pillType) pillType.textContent = '-';
      if (pillSlug) pillSlug.textContent = 'slug: -';
      if (pillCount) pillCount.textContent = 'Ejercicios: 0';
      if (pillProgress) pillProgress.textContent = 'Practica: 0%';
      if (pillTestScore) pillTestScore.textContent = 'Test: 0%';
      if (emptyExercises) {
        emptyExercises.style.display = 'block';
        emptyExercises.textContent = 'Tema no encontrado.';
      }
      return;
    }

    currentTopic = topic;

    if (pillLevel) pillLevel.textContent = `Nivel: ${LEVEL}`;
    if (pillType) {
      if (topic.type) {
        pillType.style.display = 'inline-flex';
        pillType.textContent = topic.type;
      } else {
        pillType.style.display = 'none';
      }
    }

    const effectiveSlug = String(topic.slug || topic.id || '');
    if (pillSlug) pillSlug.textContent = effectiveSlug ? `slug: ${effectiveSlug}` : 'slug: -';

    if (topicTitle) topicTitle.textContent = topic.title || 'Tema';
    if (topicDesc) topicDesc.textContent = topic.desc || '';

      if (pillLessonLink && topic.id) {
        pillLessonLink.style.display = 'inline-flex';
        const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;
        pillLessonLink.href = url;
        if (btnBackLesson) btnBackLesson.href = url;
      }
      if (btnReview && topic.id) {
        btnReview.href = `review.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;
      }
      if (btnFlashcards && topic.id) {
        btnFlashcards.href = `flashcards.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}`;
      }
    if (btnBackCourse) {
      btnBackCourse.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
    }

    const hasAccess = await computeHasAccess(CURRENT_UID);
    if (!hasAccess) {
      showAccessLocked();
      return;
    }

    await trackTopicOpen(user.uid, topic.id, LEVEL);

    await loadExercises(topic);
  } catch (e) {
    console.error(e);
    showToast('No se pudo cargar.', 'bad', 3200);
    if (emptyExercises) {
      emptyExercises.style.display = 'block';
      emptyExercises.textContent = 'No se pudo cargar. Revisa la consola.';
    }
  }
});
