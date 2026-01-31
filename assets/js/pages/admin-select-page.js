import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection, query, where, orderBy, limit, getDocs, doc, getDoc
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

const params = new URLSearchParams(location.search);
const type = (params.get('type') || '').toLowerCase(); // 'lesson' | 'exercise'

let topicsCache = [];

function setError(msg) {
  topicError.style.display = msg ? 'block' : 'none';
  topicError.textContent = msg || '';
}

function setPreviewVisible(visible) {
  topicPreview.style.display = visible ? 'block' : 'none';
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
  // Small UX: if type passed, hint in the UI (optional)
  if (type === 'lesson') levelHint.textContent = 'Destino: Admin lección';
  if (type === 'exercise') levelHint.textContent = 'Destino: Admin ejercicios';
});

btnLoadTopics.addEventListener('click', loadTopics);
btnRefresh.addEventListener('click', loadTopics);

selTopic.addEventListener('change', () => {
  const id = selTopic.value;
  const level = selLevel.value;
  const t = topicsCache.find(x => x.id === id);
  if (!t) {
    setPreviewVisible(false);
    return;
  }

  topicTitle.textContent = t.title || '(sin título)';
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
    levelHint.textContent = 'Cargando temas…';

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
      selTopic.innerHTML = '<option value="">— No hay temas en este nivel —</option>';
      levelHint.textContent = '0 temas.';
      selTopic.disabled = true;
      btnRefresh.disabled = false;
      return;
    }

    selTopic.appendChild(new Option('— Elige un tema —', ''));
    for (const t of topicsCache) {
      const label = t.title ? t.title : t.id;
      selTopic.appendChild(new Option(label, t.id));
    }

    levelHint.textContent = `${topicsCache.length} temas cargados.`;
    selTopic.disabled = false;
    btnRefresh.disabled = false;

    // Auto-select first real topic if intent is provided
    if ((type === 'lesson' || type === 'exercise') && topicsCache.length > 0) {
      selTopic.value = topicsCache[0].id;
      selTopic.dispatchEvent(new Event('change'));
    }
  } catch (err) {
    console.error(err);
    setError('No se pudieron cargar los temas. Revisa la consola y Firestore.');
    levelHint.textContent = '';
    selTopic.innerHTML = '<option value="">— Error al cargar —</option>';
    selTopic.disabled = true;
    btnRefresh.disabled = false;
  }
}
