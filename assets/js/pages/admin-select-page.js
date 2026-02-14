import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const selLevel = document.getElementById('selLevel');
const btnLoadTopics = document.getElementById('btnLoadTopics');
const levelHint = document.getElementById('levelHint');

const selTopic = document.getElementById('selTopic');
const btnRefresh = document.getElementById('btnRefresh');

const topicPreview = document.getElementById('topicPreview');
const topicTitle = document.getElementById('topicTitle');
const topicSubtitle = document.getElementById('topicSubtitle');
const topicError = document.getElementById('topicError');
const quickHint = document.getElementById('quickHint');

const goLessonAdmin = document.getElementById('goLessonAdmin');
const goExerciseAdmin = document.getElementById('goExerciseAdmin');

const copyFromLevel = document.getElementById('copyFromLevel');
const copyFromTopic = document.getElementById('copyFromTopic');
const btnLoadCopyTopics = document.getElementById('btnLoadCopyTopics');
const copyToLevel = document.getElementById('copyToLevel');
const copyNewTitle = document.getElementById('copyNewTitle');
const copyNewSlug = document.getElementById('copyNewSlug');
const btnCopyTopic = document.getElementById('btnCopyTopic');
const copyStatus = document.getElementById('copyStatus');
const copyOpenTarget = document.getElementById('copyOpenTarget');
const copyOpenAdmin = document.getElementById('copyOpenAdmin');

const params = new URLSearchParams(location.search);
const intentType = (
  params.get('target') ||
  params.get('type') ||
  ''
).toLowerCase(); // 'lesson' | 'exercise'
const intentLevel = String(params.get('level') || '').toUpperCase();
const intentTopicId = String(params.get('id') || '').trim();
const intentAutoOpen = String(params.get('open') || '').trim() === '1';
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

let topicsCache = [];
let copyTopicsCache = [];

function setError(msg) {
  topicError.style.display = msg ? 'block' : 'none';
  topicError.textContent = msg || '';
}

function setPreviewVisible(visible) {
  topicPreview.style.display = visible ? 'block' : 'none';
}

function setCopyStatus(msg, bad = false) {
  if (!copyStatus) return;
  copyStatus.textContent = msg || '';
  copyStatus.style.color = bad ? 'var(--red, #ff6b6b)' : '';
}

function setActionButtonState(btn, href, enabled) {
  if (!btn) return;
  btn.href = enabled ? href : '#';
  btn.style.pointerEvents = enabled ? '' : 'none';
  btn.style.opacity = enabled ? '1' : '.55';
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildLessonAdminHref(level, id) {
  return `lessonadmin.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(id)}`;
}

function buildExerciseAdminHref(level, id, slug = '') {
  const qs = new URLSearchParams();
  qs.set('level', String(level || ''));
  qs.set('id', String(id || ''));
  const cleanSlug = String(slug || '').trim();
  if (cleanSlug) qs.set('slug', cleanSlug);
  return `ejercicioadmin.html?${qs.toString()}`;
}

function buildAdminCenterHref(level, id, target, opts = {}) {
  const qs = new URLSearchParams();
  if (target) qs.set('target', String(target));
  if (level) qs.set('level', String(level));
  if (id) qs.set('id', String(id));
  if (opts?.openNow) qs.set('open', '1');
  return `admin-select.html?${qs.toString()}`;
}

function updateQuickActions(topic, level) {
  const hasTopic = !!topic && !!level;
  if (!hasTopic) {
    setActionButtonState(goLessonAdmin, '#', false);
    setActionButtonState(goExerciseAdmin, '#', false);
    if (quickHint) quickHint.textContent = 'Najpierw wybierz temat ponizej.';
    return;
  }

  const lessonHref = buildLessonAdminHref(level, topic.id);
  const exHref = buildExerciseAdminHref(level, topic.id, topic.slug || '');
  setActionButtonState(goLessonAdmin, lessonHref, true);
  setActionButtonState(goExerciseAdmin, exHref, true);

  if (intentType === 'exercise') {
    goExerciseAdmin.className = 'btn-yellow';
    goLessonAdmin.className = 'btn-white-outline';
  } else {
    goLessonAdmin.className = 'btn-yellow';
    goExerciseAdmin.className = 'btn-white-outline';
  }

  if (quickHint) {
    const name = topic.title || topic.id;
    quickHint.textContent = `Wybrano temat: ${name} (${level}).`;
  }
}

async function ensureAdmin(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().admin !== true) {
    window.location.href = 'espanel.html';
    return false;
  }
  return true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  const ok = await ensureAdmin(user);
  if (!ok) return;
  if (VALID_LEVELS.has(intentLevel) && selLevel) selLevel.value = intentLevel;
  if (copyToLevel && selLevel) copyToLevel.value = selLevel.value;
  if (copyFromLevel && selLevel) copyFromLevel.value = selLevel.value;
  if (intentType === 'exercise' && copyOpenTarget) copyOpenTarget.value = 'exercise';
  if (intentType === 'lesson' && copyOpenTarget) copyOpenTarget.value = 'lesson';
  // Small UX: if type passed, hint in the UI (optional)
  if (intentType === 'lesson') levelHint.textContent = 'Cel: Admin lekcji';
  if (intentType === 'exercise') levelHint.textContent = 'Cel: Admin cwiczen';
  updateQuickActions(null, selLevel?.value || '');

  await loadTopics();

  if (intentTopicId) {
    const matched = topicsCache.find((x) => x.id === intentTopicId);
    if (matched) {
      selTopic.value = matched.id;
      selTopic.dispatchEvent(new Event('change'));

      if (intentAutoOpen && (intentType === 'lesson' || intentType === 'exercise')) {
        const level = selLevel?.value || intentLevel;
        const targetHref =
          intentType === 'exercise'
            ? buildExerciseAdminHref(level, matched.id, matched.slug || '')
            : buildLessonAdminHref(level, matched.id);
        window.location.href = targetHref;
      }
    } else {
      setError(`Nie znaleziono tematu ${intentTopicId} na poziomie ${selLevel.value}.`);
      updateQuickActions(null, selLevel?.value || '');
    }
  }
});

btnLoadTopics.addEventListener('click', loadTopics);
btnRefresh.addEventListener('click', loadTopics);
btnLoadCopyTopics?.addEventListener('click', loadCopyTopics);
btnCopyTopic?.addEventListener('click', copyTopic);

selLevel?.addEventListener('change', () => {
  if (copyToLevel) copyToLevel.value = selLevel.value;
  updateQuickActions(null, selLevel.value);
});
copyFromLevel?.addEventListener('change', loadCopyTopics);

selTopic.addEventListener('change', () => {
  const id = selTopic.value;
  const level = selLevel.value;
  const t = topicsCache.find((x) => x.id === id);
  if (!t) {
    setPreviewVisible(false);
    updateQuickActions(null, level);
    return;
  }

  topicTitle.textContent = t.title || '(bez tytulu)';
  topicSubtitle.textContent = t.subtitle || '';
  setPreviewVisible(true);
  setError('');
  updateQuickActions(t, level);
});

async function loadTopics() {
  try {
    setError('');
    setPreviewVisible(false);

    selTopic.disabled = true;
    btnRefresh.disabled = true;

    const level = selLevel.value;
    levelHint.textContent = 'Wczytywanie tematow...';

    // Source of topics: your app uses collection 'courses' filtered by level, ordered.
    // Keep limit reasonable; you can remove limit if you want all.
    const q = query(
      collection(db, 'courses'),
      where('level', '==', level),
      orderBy('order', 'asc'),
      limit(200)
    );

    const snap = await getDocs(q);

    topicsCache = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        title: data.title || data.name || data.topicTitle || '',
        subtitle: data.subtitle || data.desc || data.description || '',
        slug: String(data.slug || '').trim(),
        order: data.order ?? 9999,
      };
    });

    // Populate select
    selTopic.innerHTML = '';
    if (topicsCache.length === 0) {
      selTopic.innerHTML = '<option value="">-- Brak tematow na tym poziomie --</option>';
      levelHint.textContent = '0 tematow.';
      selTopic.disabled = true;
      btnRefresh.disabled = false;
      updateQuickActions(null, level);
      return;
    }

    selTopic.appendChild(new Option('-- Wybierz temat --', ''));
    for (const t of topicsCache) {
      const label = t.title ? t.title : t.id;
      selTopic.appendChild(new Option(label, t.id));
    }

    levelHint.textContent = `${topicsCache.length} tematow wczytanych.`;
    selTopic.disabled = false;
    btnRefresh.disabled = false;

    // Auto-select first real topic if intent is provided
    const hasPinnedTopicForCurrentLevel =
      !!intentTopicId && !!intentLevel && intentLevel === level;
    if (
      (intentType === 'lesson' || intentType === 'exercise') &&
      !hasPinnedTopicForCurrentLevel &&
      topicsCache.length > 0
    ) {
      selTopic.value = topicsCache[0].id;
      selTopic.dispatchEvent(new Event('change'));
    }
  } catch (err) {
    console.error(err);
    setError('Nie udalo sie wczytac tematow. Sprawdz konsole i Firestore.');
    levelHint.textContent = '';
    selTopic.innerHTML = '<option value="">-- Blad wczytywania --</option>';
    selTopic.disabled = true;
    btnRefresh.disabled = false;
    updateQuickActions(null, selLevel?.value || '');
  }
}

async function loadCopyTopics() {
  try {
    setCopyStatus('');
    if (!copyFromLevel || !copyFromTopic) return;
    copyFromTopic.disabled = true;
    if (btnLoadCopyTopics) btnLoadCopyTopics.disabled = true;

    const level = copyFromLevel.value;
    const q = query(
      collection(db, 'courses'),
      where('level', '==', level),
      orderBy('order', 'asc'),
      limit(200),
    );
    const snap = await getDocs(q);
    copyTopicsCache = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    copyFromTopic.innerHTML = '';
    if (!copyTopicsCache.length) {
      copyFromTopic.innerHTML = '<option value="">-- Brak tematow --</option>';
      setCopyStatus('Brak tematow na tym poziomie.', true);
    } else {
      copyFromTopic.appendChild(new Option('-- Wybierz temat --', ''));
      copyTopicsCache.forEach((t) => {
        const label = t.title || t.name || t.slug || t.id;
        copyFromTopic.appendChild(new Option(label, t.id));
      });
      setCopyStatus(`${copyTopicsCache.length} tematow.`);
    }
  } catch (e) {
    console.error(e);
    setCopyStatus('Blad wczytywania tematow.', true);
  } finally {
    if (copyFromTopic) copyFromTopic.disabled = false;
    if (btnLoadCopyTopics) btnLoadCopyTopics.disabled = false;
  }
}

async function getNextCourseOrder(level) {
  const q = query(
    collection(db, 'courses'),
    where('level', '==', level),
    orderBy('order', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 1;
  const top = snap.docs[0].data() || {};
  return Number(top.order || 0) + 1;
}

async function copyTopic() {
  if (!copyFromLevel || !copyFromTopic || !copyToLevel) return;
  const srcLevel = copyFromLevel.value;
  const srcId = copyFromTopic.value;
  const dstLevel = copyToLevel.value || selLevel.value;

  if (!srcId) {
    setCopyStatus('Wybierz temat zrodlowy.', true);
    return;
  }

  setCopyStatus('Kopiowanie...');
  try {
    const srcSnap = await getDoc(doc(db, 'courses', srcId));
    if (!srcSnap.exists()) {
      setCopyStatus('Nie znaleziono tematu zrodlowego.', true);
      return;
    }
    const src = srcSnap.data() || {};
    const newTitle = String(copyNewTitle?.value || '').trim() || src.title || src.name || '';
    const newSlug =
      String(copyNewSlug?.value || '').trim() ||
      String(src.slug || '') ||
      slugify(newTitle);

    const order = await getNextCourseOrder(dstLevel);
    const newCourseRef = doc(collection(db, 'courses'));
    await setDoc(newCourseRef, {
      ...src,
      title: newTitle || src.title || '',
      name: newTitle || src.name || '',
      slug: newSlug || src.slug || '',
      level: dstLevel,
      order,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    // Copy course_meta (lesson)
    const metaSrcRef = doc(db, 'course_meta', `${srcLevel}__${srcId}`);
    const metaSnap = await getDoc(metaSrcRef);
    if (metaSnap.exists()) {
      const meta = metaSnap.data() || {};
      const metaDstRef = doc(db, 'course_meta', `${dstLevel}__${newCourseRef.id}`);
      await setDoc(
        metaDstRef,
        {
          ...meta,
          level: dstLevel,
          topicSlug: newSlug || meta.topicSlug || '',
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    // Copy exercises
    let exSnap = null;
    try {
      const qx = query(
        collection(db, 'exercises'),
        where('level', '==', srcLevel),
        where('topicId', '==', srcId),
      );
      exSnap = await getDocs(qx);
    } catch (e) {
      console.warn('Primary exercises copy query failed', e);
    }
    if (!exSnap || exSnap.empty) {
      const qx2 = query(
        collection(db, 'exercises'),
        where('level', '==', srcLevel),
        where('topicSlug', '==', String(src.slug || srcId)),
      );
      exSnap = await getDocs(qx2);
    }

    const batchLimit = 400;
    let batch = writeBatch(db);
    let pending = 0;
    let copied = 0;

    for (const d of exSnap.docs) {
      const ex = d.data() || {};
      const ref = doc(collection(db, 'exercises'));
      batch.set(ref, {
        ...ex,
        level: dstLevel,
        topicId: newCourseRef.id,
        topicSlug: newSlug || ex.topicSlug || '',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      pending += 1;
      copied += 1;
      if (pending >= batchLimit) {
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();

    setCopyStatus(`Gotowe. Nowy temat: ${newCourseRef.id} (cwiczenia: ${copied})`);
    if (copyNewTitle) copyNewTitle.value = '';
    if (copyNewSlug) copyNewSlug.value = '';

    if (copyOpenAdmin?.checked) {
      const target = String(copyOpenTarget?.value || 'lesson');
      const url = buildAdminCenterHref(dstLevel, newCourseRef.id, target);
      window.open(url, '_blank');
    }
  } catch (e) {
    console.error(e);
    setCopyStatus('Blad kopiowania. Sprawdz konsole.', true);
  }
}

