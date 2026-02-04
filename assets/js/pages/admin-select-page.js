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
const type = (params.get('type') || '').toLowerCase(); // 'lesson' | 'exercise'

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

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  await ensureAdmin(user);
  if (copyToLevel && selLevel) copyToLevel.value = selLevel.value;
  if (copyFromLevel && selLevel) copyFromLevel.value = selLevel.value;
  if (type === 'exercise' && copyOpenTarget) copyOpenTarget.value = 'exercise';
  if (type === 'lesson' && copyOpenTarget) copyOpenTarget.value = 'lesson';
  // Small UX: if type passed, hint in the UI (optional)
  if (type === 'lesson') levelHint.textContent = 'Cel: Admin lekcji';
  if (type === 'exercise') levelHint.textContent = 'Cel: Admin cwiczen';
});

btnLoadTopics.addEventListener('click', loadTopics);
btnRefresh.addEventListener('click', loadTopics);
btnLoadCopyTopics?.addEventListener('click', loadCopyTopics);
btnCopyTopic?.addEventListener('click', copyTopic);

selLevel?.addEventListener('change', () => {
  if (copyToLevel) copyToLevel.value = selLevel.value;
});
copyFromLevel?.addEventListener('change', loadCopyTopics);

selTopic.addEventListener('change', () => {
  const id = selTopic.value;
  const level = selLevel.value;
  const t = topicsCache.find(x => x.id === id);
  if (!t) {
    setPreviewVisible(false);
    return;
  }

  topicTitle.textContent = t.title || '(bez tytulu)';
  topicSubtitle.textContent = t.subtitle || '';
  setPreviewVisible(true);
  setError('');

  // keep consistent with your existing URLs: lessonadmin.html?level=A1&id=DOCID
  const lessonHref = `lessonadmin.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(id)}`;
  const exHref = `ejercicioadmin.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(id)}`;

  goLessonAdmin.href = lessonHref;
  goExerciseAdmin.href = exHref;

  // If user came here from a specific intent, make that button the "primary" feel.
  if (type === 'exercise') {
    goExerciseAdmin.className = 'btn-yellow';
    goLessonAdmin.className = 'btn-white-outline';
  } else {
    goLessonAdmin.className = 'btn-yellow';
    goExerciseAdmin.className = 'btn-white-outline';
  }
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
        order: data.order ?? 9999
      };
    });

    // Populate select
    selTopic.innerHTML = '';
    if (topicsCache.length === 0) {
      selTopic.innerHTML = '<option value="">-- Brak tematow na tym poziomie --</option>';
      levelHint.textContent = '0 tematow.';
      selTopic.disabled = true;
      btnRefresh.disabled = false;
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
    if ((type === 'lesson' || type === 'exercise') && topicsCache.length > 0) {
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
      const url =
        target === 'exercise'
          ? `ejercicioadmin.html?level=${encodeURIComponent(dstLevel)}&id=${encodeURIComponent(newCourseRef.id)}`
          : `lessonadmin.html?level=${encodeURIComponent(dstLevel)}&id=${encodeURIComponent(newCourseRef.id)}`;
      window.open(url, '_blank');
    }
  } catch (e) {
    console.error(e);
    setCopyStatus('Blad kopiowania. Sprawdz konsole.', true);
  }
}

