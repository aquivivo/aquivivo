import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const modeNew = $('modeNew');
const modeEdit = $('modeEdit');
const modeStatus = $('modeStatus');
const editPicker = $('editPicker');
const editLevel = $('editLevel');
const editTopic = $('editTopic');
const btnLoadEditTopics = $('btnLoadEditTopics');

const courseLevel = $('courseLevel');
const courseTitle = $('courseTitle');
const courseSlug = $('courseSlug');
const courseType = $('courseType');
const courseDesc = $('courseDesc');
const courseOrder = $('courseOrder');
const btnSaveCourse = $('btnSaveCourse');
const courseStatus = $('courseStatus');
const wizCopyFromLevel = $('wizCopyFromLevel');
const wizCopyFromTopic = $('wizCopyFromTopic');
const btnWizLoadCopyTopics = $('btnWizLoadCopyTopics');
const wizCopyToLevel = $('wizCopyToLevel');
const wizCopyNewTitle = $('wizCopyNewTitle');
const wizCopyNewSlug = $('wizCopyNewSlug');
const btnWizCopyTopic = $('btnWizCopyTopic');
const wizCopyStatus = $('wizCopyStatus');

const lessonPublish = $('lessonPublish');
const lessonDuration = $('lessonDuration');
const lessonOutline = $('lessonOutline');
const lessonHtml = $('lessonHtml');
const btnSaveLesson = $('btnSaveLesson');
const btnPublishLesson = $('btnPublishLesson');
const btnSkipLesson = $('btnSkipLesson');
const lessonStatus = $('lessonStatus');
const wizBlocksList = $('wizBlocksList');
const btnWizAddHeading = $('btnWizAddHeading');
const btnWizAddText = $('btnWizAddText');
const btnWizAddImage = $('btnWizAddImage');
const btnWizAddTip = $('btnWizAddTip');
const btnWizAddExample = $('btnWizAddExample');
const btnWizAddDivider = $('btnWizAddDivider');
const btnWizClearBlocks = $('btnWizClearBlocks');
const btnWizTplGrammar = $('btnWizTplGrammar');
const btnWizTplVocab = $('btnWizTplVocab');
const btnWizTplPremium = $('btnWizTplPremium');
const btnWizTplRepaso = $('btnWizTplRepaso');
const btnWizOutlineReplace = $('btnWizOutlineReplace');
const btnWizOutlineAppend = $('btnWizOutlineAppend');
const wizOutlineStatus = $('wizOutlineStatus');

const wizBulkArea = $('wizBulkArea');
const btnWizParse = $('btnWizParse');
const wizBulkStatus = $('wizBulkStatus');
const bulkImportFile = $('bulkImportFile');
const btnLoadBulkFile = $('btnLoadBulkFile');
const btnBulkClear = $('btnBulkClear');
const bulkMapUse = $('bulkMapUse');
const bulkMapType = $('bulkMapType');
const bulkMapPrompt = $('bulkMapPrompt');
const bulkMapAnswer = $('bulkMapAnswer');
const bulkMapOptions = $('bulkMapOptions');
const bulkMapCategory = $('bulkMapCategory');
const bulkMapTags = $('bulkMapTags');
const bulkMapNotes = $('bulkMapNotes');
const bulkMapImage = $('bulkMapImage');
const bulkMapOrder = $('bulkMapOrder');
const bulkMapChips = $('bulkMapChips');
const mapValEls = {
  type: $('mapValType'),
  prompt: $('mapValPrompt'),
  answer: $('mapValAnswer'),
  options: $('mapValOptions'),
  category: $('mapValCategory'),
  tags: $('mapValTags'),
  notes: $('mapValNotes'),
  imageUrl: $('mapValImage'),
  order: $('mapValOrder'),
};

const wizFlashArea = $('wizFlashArea');
const btnWizFlash = $('btnWizFlash');
const wizFlashStatus = $('wizFlashStatus');

const wizLibLevel = $('wizLibLevel');
const wizLibSet = $('wizLibSet');
const btnWizLib = $('btnWizLib');
const wizLibStatus = $('wizLibStatus');
const wizLibEmptyOnly = $('wizLibEmptyOnly');
const btnWizLibAll = $('btnWizLibAll');
const wizLibAllStatus = $('wizLibAllStatus');
const btnGoExerciseAdmin = $('btnGoExerciseAdmin');
const wizSingleStatus = $('wizSingleStatus');
const btnGoExerciseAdminHeader = $('btnGoExerciseAdminHeader');
const wizSingleStatusTop = $('wizSingleStatusTop');
const btnGoExerciseAdminStep2 = $('btnGoExerciseAdminStep2');
const wizSingleStatusStep2 = $('wizSingleStatusStep2');
const wizLibPreview = $('wizLibPreview');

const btnStep3Next = $('btnStep3Next');

const summaryBox = $('summaryBox');
const summaryLesson = $('summaryLesson');
const summaryExercises = $('summaryExercises');
const summarySidebar = $('summarySidebar');
const btnSaveAll = $('btnSaveAll');
const saveAllStatus = $('saveAllStatus');
const btnOpenLessonAdmin = $('btnOpenLessonAdmin');
const btnOpenExerciseAdmin = $('btnOpenExerciseAdmin');

const stepNav = $('stepNav');
const steps = Array.from(document.querySelectorAll('.wizardStep'));

let MODE = 'new';
let CURRENT_USER = null;
let IS_ADMIN = false;

let currentCourseId = null;
let currentCourseLevel = null;
let currentCourseSlug = null;
let currentCourseTitle = null;
let currentCourseDoc = null;

let editTopicsCache = [];
let copyTopicsCache = [];
let lessonExists = false;
let loadedLesson = null;
let BLOCKS = [];

function setStatus(el, msg, bad = false) {
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = bad ? 'var(--red, #ff6b6b)' : '';
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function newBlock(kind) {
  const base = { id: uid(), kind };
  if (kind === 'heading') return { ...base, level: 'h2', text: 'Titulo' };
  if (kind === 'text') return { ...base, text: '' };
  if (kind === 'image') return { ...base, url: '', caption: '' };
  if (kind === 'tip')
    return { ...base, title: 'Consejo', text: '' };
  if (kind === 'example')
    return { ...base, title: 'Ejemplo', text: '' };
  if (kind === 'divider') return { ...base };
  return base;
}

function renderBlocks() {
  if (!wizBlocksList) return;
  wizBlocksList.innerHTML = '';
  if (!BLOCKS.length) {
    wizBlocksList.innerHTML =
      '<div class="hintSmall">Brak blokow. Dodaj blok przyciskami powyzej lub uzyj outline.</div>';
    return;
  }

  const labelMap = {
    heading: 'Tytul',
    text: 'Tekst',
    image: 'Obraz',
    tip: 'Wskazowka',
    example: 'Przyklad',
    divider: 'Separator',
  };

  BLOCKS.forEach((b, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '12px';
    card.style.marginTop = '10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.gap = '10px';
    head.innerHTML = `<div style="font-weight:900;">${labelMap[b.kind] || b.kind}</div>`;

    const toolWrap = document.createElement('div');
    toolWrap.style.display = 'flex';
    toolWrap.style.gap = '6px';
    const btnUp = document.createElement('button');
    btnUp.className = 'btn-white-outline';
    btnUp.type = 'button';
    btnUp.textContent = 'Gora';
    const btnDown = document.createElement('button');
    btnDown.className = 'btn-white-outline';
    btnDown.type = 'button';
    btnDown.textContent = 'Dol';
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-red';
    btnDel.type = 'button';
    btnDel.textContent = 'Usun';
    toolWrap.appendChild(btnUp);
    toolWrap.appendChild(btnDown);
    toolWrap.appendChild(btnDel);
    head.appendChild(toolWrap);

    const body = document.createElement('div');
    body.style.marginTop = '10px';

    const bindInput = (el, key) => {
      const handler = () => {
        b[key] = el.value;
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    };

    if (b.kind === 'heading') {
      body.innerHTML = `
        <label class="muted" style="font-weight:800;">Tekst</label>
        <input class="input" data-k="text" />
        <label class="muted" style="font-weight:800; margin-top:8px;">Poziom</label>
        <select class="select" data-k="level">
          <option value="h2">H2</option>
          <option value="h3">H3</option>
        </select>
      `;
    } else if (b.kind === 'text') {
      body.innerHTML = `
        <label class="muted" style="font-weight:800;">Tekst</label>
        <textarea data-k="text" rows="4"></textarea>
      `;
    } else if (b.kind === 'image') {
      body.innerHTML = `
        <label class="muted" style="font-weight:800;">URL obrazu</label>
        <input class="input" data-k="url" placeholder="https://..." />
        <label class="muted" style="font-weight:800; margin-top:8px;">Podpis (opcjonalnie)</label>
        <input class="input" data-k="caption" placeholder="Opis pod obrazem" />
      `;
    } else if (b.kind === 'tip' || b.kind === 'example') {
      body.innerHTML = `
        <label class="muted" style="font-weight:800;">Tytul</label>
        <input class="input" data-k="title" />
        <label class="muted" style="font-weight:800; margin-top:8px;">Tresc</label>
        <textarea data-k="text" rows="4"></textarea>
      `;
    } else if (b.kind === 'divider') {
      body.innerHTML = '<div class="hintSmall">Separator wizualny.</div>';
    }

    body.querySelectorAll('[data-k]').forEach((el) => {
      const key = el.getAttribute('data-k');
      el.value = b[key] || '';
      bindInput(el, key);
    });

    btnUp.addEventListener('click', () => {
      if (idx <= 0) return;
      const tmp = BLOCKS[idx - 1];
      BLOCKS[idx - 1] = BLOCKS[idx];
      BLOCKS[idx] = tmp;
      renderBlocks();
    });
    btnDown.addEventListener('click', () => {
      if (idx >= BLOCKS.length - 1) return;
      const tmp = BLOCKS[idx + 1];
      BLOCKS[idx + 1] = BLOCKS[idx];
      BLOCKS[idx] = tmp;
      renderBlocks();
    });
    btnDel.addEventListener('click', () => {
      BLOCKS.splice(idx, 1);
      renderBlocks();
    });

    card.appendChild(head);
    card.appendChild(body);
    wizBlocksList.appendChild(card);
  });
}

function addBlock(kind) {
  BLOCKS.push(newBlock(kind));
  renderBlocks();
}

function setTemplate(kind) {
  if (kind === 'grammar') {
    BLOCKS = [
      { ...newBlock('heading'), text: 'Objetivo', level: 'h2' },
      {
        ...newBlock('text'),
        text: 'Despues de esta leccion podras...',
      },
      { ...newBlock('heading'), text: 'Explicacion', level: 'h2' },
      {
        ...newBlock('text'),
        text: 'Explica la regla en 3-5 puntos.',
      },
      {
        ...newBlock('example'),
        title: 'Ejemplos',
        text: '1) ...\n2) ...\n3) ...',
      },
      {
        ...newBlock('tip'),
        title: 'Consejo',
        text: 'Errores comunes o truco.',
      },
      { ...newBlock('heading'), text: 'Mini practica', level: 'h2' },
      {
        ...newBlock('text'),
        text: '2-4 frases para completar.',
      },
    ];
  } else if (kind === 'vocab') {
    BLOCKS = [
      { ...newBlock('heading'), text: 'Objetivo', level: 'h2' },
      {
        ...newBlock('text'),
        text: 'Aprenderas vocabulario sobre...',
      },
      { ...newBlock('heading'), text: 'Palabras clave', level: 'h2' },
      {
        ...newBlock('text'),
        text: '- palabra - traduccion\n- palabra - traduccion',
      },
      { ...newBlock('heading'), text: 'Frases utiles', level: 'h2' },
      {
        ...newBlock('example'),
        title: 'Ejemplos',
        text: '1) ...\n2) ...',
      },
    ];
  } else if (kind === 'premium') {
    BLOCKS = [
      { ...newBlock('heading'), text: 'Leccion premium', level: 'h2' },
      {
        ...newBlock('text'),
        text: 'Mas ejemplos y practica guiada.',
      },
      { ...newBlock('heading'), text: 'Warm-up', level: 'h2' },
      { ...newBlock('text'), text: '2-3 preguntas rapidas.' },
      { ...newBlock('heading'), text: 'Contenido', level: 'h2' },
      { ...newBlock('text'), text: 'Explicacion principal.' },
      { ...newBlock('example'), title: 'Ejemplos', text: '1) ...\n2) ...' },
    ];
  } else if (kind === 'repaso') {
    BLOCKS = [
      { ...newBlock('heading'), text: 'Repaso', level: 'h2' },
      { ...newBlock('text'), text: 'Resumen en 4-5 puntos.' },
      { ...newBlock('heading'), text: 'Mini test', level: 'h2' },
      { ...newBlock('example'), title: 'Preguntas', text: '1) ...\n2) ...' },
    ];
  }
  renderBlocks();
}

async function ensureAdmin(user) {
  if (!user?.uid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return false;
    const data = snap.data() || {};
    return data.admin === true || String(data.role || '') === 'admin';
  } catch (e) {
    console.warn('[wizard] admin check failed', e);
    return false;
  }
}

function setMode(next) {
  MODE = next === 'edit' ? 'edit' : 'new';
  if (editPicker) editPicker.style.display = MODE === 'edit' ? 'block' : 'none';
  if (courseLevel) courseLevel.disabled = MODE === 'edit' && !!currentCourseId;
  if (modeStatus) {
    modeStatus.textContent =
      MODE === 'edit'
        ? 'Tryb edycji: wybierz temat powyzej.'
        : 'Tryb nowy: wpisz dane kursu.';
  }
}

function setStep(step) {
  steps.forEach((el) => {
    if (!el) return;
    el.style.display = String(el.id) === `step${step}` ? 'block' : 'none';
  });
  if (stepNav) {
    stepNav.querySelectorAll('[data-step]').forEach((btn) => {
      const isActive = Number(btn.getAttribute('data-step') || 0) === step;
      btn.classList.toggle('btn-yellow', isActive);
      btn.classList.toggle('btn-white-outline', !isActive);
    });
  }
}

function resetCourseForm() {
  if (courseLevel) courseLevel.value = 'A1';
  if (courseTitle) courseTitle.value = '';
  if (courseSlug) courseSlug.value = '';
  if (courseType) courseType.value = 'grammar';
  if (courseDesc) courseDesc.value = '';
  if (courseOrder) courseOrder.value = '';
  currentCourseId = null;
  currentCourseLevel = null;
  currentCourseSlug = null;
  currentCourseTitle = null;
  currentCourseDoc = null;
  lessonExists = false;
  loadedLesson = null;
  if (lessonPublish) lessonPublish.checked = false;
  if (lessonDuration) lessonDuration.value = '';
  if (lessonOutline) lessonOutline.value = '';
  if (lessonHtml) lessonHtml.value = '';
  BLOCKS = [];
  renderBlocks();
}

function setCourseFormFromDoc(docData, docId) {
  const data = docData || {};
  currentCourseId = docId || data.id || null;
  currentCourseLevel = String(
    data.level || courseLevel?.value || 'A1',
  ).toUpperCase();
  currentCourseSlug = String(data.slug || data.id || docId || '').trim();
  currentCourseTitle = String(data.title || data.name || '').trim();
  currentCourseDoc = data;

  if (courseLevel) courseLevel.value = currentCourseLevel || 'A1';
  if (courseTitle) courseTitle.value = currentCourseTitle || '';
  if (courseSlug) courseSlug.value = currentCourseSlug || '';
  if (courseType) courseType.value = String(data.type || 'grammar');
  if (courseDesc)
    courseDesc.value = String(
      data.desc || data.subtitle || data.description || '',
    );
  if (courseOrder)
    courseOrder.value = data.order != null ? String(data.order) : '';

  if (courseLevel) courseLevel.disabled = MODE === 'edit';
}

async function loadEditTopics() {
  if (!editLevel || !editTopic) return;
  const level = String(editLevel.value || 'A1').toUpperCase();
  editTopic.disabled = true;
  setStatus(modeStatus, 'Wczytywanie tematow...');
  try {
    const snap = await getDocs(
      query(
        collection(db, 'courses'),
        where('level', '==', level),
        orderBy('order', 'asc'),
      ),
    );
    editTopicsCache = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    editTopic.innerHTML = '';
    if (!editTopicsCache.length) {
      editTopic.appendChild(new Option('-- Brak tematow --', ''));
      setStatus(modeStatus, 'Brak tematow na tym poziomie.', true);
      return;
    }
    editTopic.appendChild(new Option('-- Wybierz temat --', ''));
    editTopicsCache.forEach((t) => {
      const label = t.title || t.name || t.slug || t.id;
      editTopic.appendChild(new Option(label, t.id));
    });
    setStatus(modeStatus, `Wczytano: ${editTopicsCache.length}`);
  } catch (e) {
    console.error(e);
    setStatus(modeStatus, 'Blad wczytywania tematow.', true);
  } finally {
    editTopic.disabled = false;
  }
}

async function loadSelectedTopic() {
  if (!editTopic) return;
  const id = String(editTopic.value || '').trim();
  if (!id) return;
  let topic = editTopicsCache.find((t) => t.id === id) || null;
  if (!topic) {
    const snap = await getDoc(doc(db, 'courses', id));
    if (snap.exists()) topic = { id: snap.id, ...(snap.data() || {}) };
  }
  if (!topic) return;
  setCourseFormFromDoc(topic, id);
  await loadLessonMeta();
  setStep(2);
}

async function getNextCourseOrder(level) {
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', level)),
    );
    let max = 0;
    snap.forEach((d) => {
      const val = Number(d.data()?.order || 0);
      if (val > max) max = val;
    });
    return max + 1;
  } catch (e) {
    console.warn('[wizard] getNextCourseOrder failed', e);
    return 1;
  }
}

async function saveCourse() {
  const level = String(courseLevel?.value || 'A1').toUpperCase();
  const title = String(courseTitle?.value || '').trim();
  const type = String(courseType?.value || 'grammar');
  const desc = String(courseDesc?.value || '').trim();
  let slug = String(courseSlug?.value || '').trim();
  let order = Number(courseOrder?.value || 0);

  if (!title) {
    setStatus(courseStatus, 'Wpisz tytul.', true);
    return false;
  }

  if (!slug) slug = slugify(title);
  if (!order || order < 1) order = await getNextCourseOrder(level);

  const payload = {
    level,
    title,
    name: title,
    slug,
    desc,
    subtitle: desc,
    type,
    order,
    updatedAt: serverTimestamp(),
  };

  try {
    setStatus(courseStatus, 'Zapisywanie...');
    if (currentCourseId) {
      await setDoc(doc(db, 'courses', currentCourseId), payload, {
        merge: true,
      });
    } else {
      const ref = doc(collection(db, 'courses'));
      currentCourseId = ref.id;
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    }
    currentCourseLevel = level;
    currentCourseSlug = slug;
    currentCourseTitle = title;
    if (courseSlug) courseSlug.value = slug;
    if (courseOrder) courseOrder.value = String(order);
    setStatus(courseStatus, 'Zapisano OK');
    setStep(2);
    updateSummary();
    return true;
  } catch (e) {
    console.error(e);
    setStatus(courseStatus, 'Blad zapisu.', true);
    return false;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseOutlineToBlocks(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const blocks = [];
  let buffer = [];

  const flushText = () => {
    if (!buffer.length) return;
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ ...newBlock('text'), text });
    buffer = [];
  };

  const setTitle = (line) => {
    const t = line.replace(/^title:\s*/i, '').trim();
    if (t && courseTitle && !courseTitle.value) courseTitle.value = t;
  };
  const setDesc = (line) => {
    const d = line.replace(/^(desc|description):\s*/i, '').trim();
    if (d && courseDesc && !courseDesc.value) courseDesc.value = d;
  };
  const setTime = (line) => {
    const v = line.replace(/^(time|duration):\s*/i, '').trim();
    const n = Number(String(v).replace(/[^\d]/g, ''));
    if (!Number.isNaN(n) && lessonDuration)
      lessonDuration.value = n ? String(n) : '';
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const trimmed = line.trim();

    if (!trimmed) {
      flushText();
      continue;
    }
    if (/^title:\s*/i.test(trimmed)) {
      flushText();
      setTitle(trimmed);
      continue;
    }
    if (/^(desc|description):\s*/i.test(trimmed)) {
      flushText();
      setDesc(trimmed);
      continue;
    }
    if (/^(time|duration):\s*/i.test(trimmed)) {
      flushText();
      setTime(trimmed);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushText();
      blocks.push(newBlock('divider'));
      continue;
    }

    if (/^###\s+/.test(trimmed) || /^h3:\s*/i.test(trimmed)) {
      flushText();
      const text = trimmed.replace(/^###\s+|^h3:\s*/i, '').trim();
      blocks.push({ ...newBlock('heading'), level: 'h3', text });
      continue;
    }
    if (/^##\s+/.test(trimmed) || /^h2:\s*/i.test(trimmed)) {
      flushText();
      const text = trimmed.replace(/^##\s+|^h2:\s*/i, '').trim();
      blocks.push({ ...newBlock('heading'), level: 'h2', text });
      continue;
    }

    if (/^tip:\s*/i.test(trimmed)) {
      flushText();
      const body = trimmed.replace(/^tip:\s*/i, '').trim();
      const parts = body
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean);
      const title = parts.length > 1 ? parts[0] : 'Consejo';
      const text =
        parts.length > 1 ? parts.slice(1).join(' | ') : parts[0] || '';
      blocks.push({ ...newBlock('tip'), title, text });
      continue;
    }

    if (/^ex:\s*/i.test(trimmed)) {
      flushText();
      const body = trimmed.replace(/^ex:\s*/i, '').trim();
      const parts = body
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean);
      const title = parts.length > 1 ? parts[0] : 'Ejemplo';
      const text =
        parts.length > 1 ? parts.slice(1).join(' | ') : parts[0] || '';
      blocks.push({ ...newBlock('example'), title, text });
      continue;
    }

    if (/^img:\s*/i.test(trimmed)) {
      flushText();
      const body = trimmed.replace(/^img:\s*/i, '').trim();
      const parts = body
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean);
      const url = parts[0] || '';
      const caption = parts[1] || '';
      blocks.push({ ...newBlock('image'), url, caption });
      continue;
    }

    buffer.push(line);
  }

  flushText();
  return blocks;
}

function compileBlocksToHtml(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (!b || !b.kind) continue;
    if (b.kind === 'divider') {
      out.push(
        '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.14); margin: 18px 0;" />',
      );
      continue;
    }
    if (b.kind === 'heading') {
      const lvl = b.level === 'h3' ? 'h3' : 'h2';
      out.push(`<${lvl}>${escapeHtml(b.text || '')}</${lvl}>`);
      continue;
    }
    if (b.kind === 'text') {
      out.push(
        `<p>${escapeHtml(b.text || '').replaceAll('\n', '<br>')}</p>`,
      );
      continue;
    }
    if (b.kind === 'image') {
      const url = String(b.url || '').trim();
      if (!url) continue;
      const caption = String(b.caption || '').trim();
      out.push(
        `<figure style="margin:12px 0;"><img src="${escapeHtml(
          url,
        )}" alt="" style="max-width:100%; border-radius:16px; border:1px solid rgba(255,255,255,0.14);" />${
          caption
            ? `<figcaption style="font-size:12px; opacity:.8; margin-top:6px;">${escapeHtml(
                caption,
              )}</figcaption>`
            : ''
        }</figure>`,
      );
      continue;
    }
    if (b.kind === 'tip' || b.kind === 'example') {
      const label = escapeHtml(b.title || (b.kind === 'tip' ? 'Consejo' : 'Ejemplo'));
      const text = escapeHtml(b.text || '').replaceAll('\n', '<br>');
      out.push(
        `<div class="card" style="padding:12px;"><b>${label}:</b> ${text}</div>`,
      );
      continue;
    }
  }
  return out.join('\n');
}

function applyOutline(mode = 'replace') {
  const raw = String(lessonOutline?.value || '').trim();
  if (!raw) {
    setStatus(wizOutlineStatus, 'Brak tresci do importu.', true);
    return;
  }
  const blocks = parseOutlineToBlocks(raw);
  if (!blocks.length) {
    setStatus(wizOutlineStatus, 'Nie wykryto blokow.', true);
    return;
  }
  if (mode === 'append') {
    BLOCKS = [...BLOCKS, ...blocks];
  } else {
    BLOCKS = blocks;
  }
  renderBlocks();
  setStatus(wizOutlineStatus, `Dodano blokow: ${blocks.length}`);
}

async function loadLessonMeta() {
  if (!currentCourseId || !currentCourseLevel) return;
  try {
    const metaRef = doc(
      db,
      'course_meta',
      `${currentCourseLevel}__${currentCourseId}`,
    );
    const snap = await getDoc(metaRef);
    if (!snap.exists()) {
      lessonExists = false;
      loadedLesson = null;
      if (lessonPublish) lessonPublish.checked = false;
      if (lessonDuration) lessonDuration.value = '';
      if (lessonHtml) lessonHtml.value = '';
      if (lessonOutline) lessonOutline.value = '';
      return;
    }
    const data = snap.data() || {};
    lessonExists = true;
    loadedLesson = data;
    if (lessonPublish) lessonPublish.checked = data.published === true;
    if (lessonDuration)
      lessonDuration.value =
        data.durationMin != null ? String(data.durationMin) : '';
    if (lessonHtml) lessonHtml.value = String(data.html || '').trim();
    if (lessonOutline) lessonOutline.value = '';
    if (Array.isArray(data.blocks) && data.blocks.length) {
      BLOCKS = data.blocks;
    } else {
      BLOCKS = [];
    }
    renderBlocks();
  } catch (e) {
    console.error(e);
  }
}

async function saveLesson() {
  if (!currentCourseId || !currentCourseLevel) {
    setStatus(lessonStatus, 'Najpierw zapisz kurs.', true);
    return false;
  }

  const outline = String(lessonOutline?.value || '').trim();
  const htmlInput = String(lessonHtml?.value || '').trim();

  let blocks = BLOCKS;
  if (!blocks.length && outline) {
    blocks = parseOutlineToBlocks(outline);
    BLOCKS = blocks;
    renderBlocks();
  }

  if (!blocks.length && !outline && !htmlInput && Array.isArray(loadedLesson?.blocks)) {
    blocks = loadedLesson.blocks;
  }

  let html = '';
  if (blocks.length) {
    html = compileBlocksToHtml(blocks);
  } else if (htmlInput) {
    html = htmlInput;
  } else if (loadedLesson) {
    html = String(loadedLesson.html || '').trim();
  }

  if (!html) {
    setStatus(lessonStatus, 'Brak tresci do zapisu.', true);
    return false;
  }

  const published = lessonPublish?.checked === true;
  const durationMin = Number(lessonDuration?.value || 0);
  const title = String(courseTitle?.value || currentCourseTitle || '').trim();
  const desc = String(courseDesc?.value || '').trim();
  const type = String(courseType?.value || '').trim();

  const payload = {
    title,
    desc,
    type,
    durationMin: durationMin > 0 ? durationMin : 0,
    published,
    html,
    level: currentCourseLevel,
    topicSlug: currentCourseSlug || currentCourseId,
    updatedAt: serverTimestamp(),
  };
  if (blocks.length) payload.blocks = blocks;

  try {
    setStatus(lessonStatus, 'Zapisywanie...');
    if (!lessonExists) payload.createdAt = serverTimestamp();
    await setDoc(
      doc(db, 'course_meta', `${currentCourseLevel}__${currentCourseId}`),
      payload,
      { merge: true },
    );
    lessonExists = true;
    loadedLesson = { ...loadedLesson, ...payload };
    setStatus(lessonStatus, 'Zapisano OK');
    setStep(3);
    updateSummary();
    return true;
  } catch (e) {
    console.error(e);
    setStatus(lessonStatus, 'Blad zapisu lekcji.', true);
    return false;
  }
}

function splitBulkColumns(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes(',')) return line.split(',');
  return [line];
}

function normalizeHeaderKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function parseOptionsCell(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return [];
  let parts = [];
  if (txt.includes('||')) parts = txt.split('||');
  else if (txt.includes('|')) parts = txt.split('|');
  else if (txt.includes(';')) parts = txt.split(';');
  else parts = [txt];
  return parts.map((x) => x.trim()).filter(Boolean);
}

const TYPE_CANON = {
  'Opcion multiple': 'Opci\u00F3n m\u00FAltiple',
  'Opcion unica': 'Opci\u00F3n \u00FAnica',
  'Relacionar palabra con traduccion': 'Relacionar palabra con traducci\u00F3n',
  'Completar con preposicion o terminacion':
    'Completar con preposici\u00F3n o terminaci\u00F3n',
  'Repetir despues del narrador': 'Repetir despu\u00E9s del narrador',
  'Mini-monologo': 'Mini-mon\u00F3logo',
  'Dialogo semiabierto': 'Di\u00E1logo semiabierto',
  'Dialogo interactivo': 'Di\u00E1logo interactivo',
  'Mision del dia': 'Misi\u00F3n del d\u00EDa',
  'Simulacion de entrevista de trabajo':
    'Simulaci\u00F3n de entrevista de trabajo',
  'Retroalimentacion por voz': 'Retroalimentaci\u00F3n por voz',
};

function canonicalType(raw) {
  const key = String(raw || '').trim();
  if (!key) return '';
  return TYPE_CANON[key] || key;
}

function parseBulkRows(raw, mapping = null) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { items: [], errors: 0 };

  const headerAliases = {
    type: 'type',
    prompt: 'prompt',
    question: 'prompt',
    pytanie: 'prompt',
    answer: 'answer',
    odpowiedz: 'answer',
    options: 'options',
    opcje: 'options',
    category: 'category',
    kategoria: 'category',
    tags: 'tags',
    tagi: 'tags',
    notes: 'notes',
    notatki: 'notes',
    imageurl: 'imageUrl',
    image: 'imageUrl',
    obraz: 'imageUrl',
    order: 'order',
    kolejnosc: 'order',
  };

  const headerMap = {};
  let start = 0;

  if (mapping && mapping.use) {
    Object.keys(mapping.map || {}).forEach((k) => {
      const idx = mapping.map[k];
      if (typeof idx === 'number' && idx >= 0) headerMap[k] = idx;
    });
    start = 0;
  } else {
    const first = splitBulkColumns(lines[0]).map((x) => x.trim());
    const headerKeys = first.map(normalizeHeaderKey);
    const hasHeader = headerKeys.some((k) => headerAliases[k]);
    if (hasHeader) {
      headerKeys.forEach((k, idx) => {
        const key = headerAliases[k];
        if (key) headerMap[key] = idx;
      });
      start = 1;
    } else {
      headerMap.prompt = 0;
      headerMap.answer = 1;
      headerMap.options = 2;
      headerMap.category = 3;
      headerMap.tags = 4;
      headerMap.notes = 5;
      headerMap.imageUrl = 6;
      headerMap.order = 7;
      start = 0;
    }
  }

  const items = [];
  let errors = 0;

  for (let i = start; i < lines.length; i++) {
    const cols = splitBulkColumns(lines[i]).map((x) => x.trim());
    const pick = (key) => {
      const idx = headerMap[key];
      if (idx == null) return '';
      return cols[idx] || '';
    };

    const prompt = pick('prompt');
    const answer = pick('answer');
    if (!prompt || !answer) {
      errors += 1;
      continue;
    }

    items.push({
      type: canonicalType(pick('type')),
      prompt,
      answer,
      options: parseOptionsCell(pick('options')),
      category: pick('category'),
      tags: pick('tags'),
      notes: pick('notes'),
      imageUrl: pick('imageUrl'),
      order: pick('order'),
    });
  }

  return { items, errors };
}

function buildMapOptionsFromSample() {
  const raw = String(wizBulkArea?.value || '').trim();
  if (!raw) return [];
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim()) || '';
  const cols = splitBulkColumns(firstLine).map((x) => x.trim());
  if (!cols.length) return [];
  return cols.map((c, idx) => ({
    idx,
    label: `${idx + 1}: ${c.slice(0, 18)}${c.length > 18 ? '...' : ''}`,
  }));
}

function getColumnLabel(idx) {
  const options = buildMapOptionsFromSample();
  const found = options.find((o) => o.idx === idx);
  return found ? found.label : `Kolumna ${idx + 1}`;
}

function fillMapSelect(selectEl, label) {
  if (!selectEl) return;
  const options = buildMapOptionsFromSample();
  selectEl.innerHTML = '';
  selectEl.appendChild(new Option(`${label} - auto`, ''));
  selectEl.appendChild(new Option(`${label} - brak`, '-1'));
  options.forEach((o) => {
    selectEl.appendChild(new Option(o.label, String(o.idx + 1)));
  });
}

function mapSelectValue(selectEl) {
  const v = String(selectEl?.value || '');
  if (!v) return null;
  if (v === '-1') return -1;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n - 1;
}

function updateMapLabelsFromSelects() {
  const map = {
    type: mapSelectValue(bulkMapType),
    prompt: mapSelectValue(bulkMapPrompt),
    answer: mapSelectValue(bulkMapAnswer),
    options: mapSelectValue(bulkMapOptions),
    category: mapSelectValue(bulkMapCategory),
    tags: mapSelectValue(bulkMapTags),
    notes: mapSelectValue(bulkMapNotes),
    imageUrl: mapSelectValue(bulkMapImage),
    order: mapSelectValue(bulkMapOrder),
  };
  Object.keys(mapValEls).forEach((key) => {
    const el = mapValEls[key];
    if (!el) return;
    const idx = map[key];
    if (idx == null || idx < 0) {
      el.textContent = '-';
    } else {
      el.textContent = getColumnLabel(idx);
    }
  });
}

function renderMapChips() {
  if (!bulkMapChips) return;
  const options = buildMapOptionsFromSample();
  bulkMapChips.innerHTML = '';
  if (!options.length) {
    bulkMapChips.innerHTML = '<span class="smallNote">Brak danych do mapowania.</span>';
    return;
  }
  options.forEach((o) => {
    const chip = document.createElement('div');
    chip.className = 'mapChip';
    chip.textContent = o.label;
    chip.draggable = true;
    chip.dataset.col = String(o.idx);
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(o.idx));
      e.dataTransfer.effectAllowed = 'copy';
    });
    bulkMapChips.appendChild(chip);
  });
}

function refreshBulkMapOptions() {
  fillMapSelect(bulkMapType, 'type');
  fillMapSelect(bulkMapPrompt, 'prompt');
  fillMapSelect(bulkMapAnswer, 'answer');
  fillMapSelect(bulkMapOptions, 'options');
  fillMapSelect(bulkMapCategory, 'category');
  fillMapSelect(bulkMapTags, 'tags');
  fillMapSelect(bulkMapNotes, 'notes');
  fillMapSelect(bulkMapImage, 'imageUrl');
  fillMapSelect(bulkMapOrder, 'order');
  renderMapChips();
  updateMapLabelsFromSelects();
}

function selectForMapKey(key) {
  if (key === 'type') return bulkMapType;
  if (key === 'prompt') return bulkMapPrompt;
  if (key === 'answer') return bulkMapAnswer;
  if (key === 'options') return bulkMapOptions;
  if (key === 'category') return bulkMapCategory;
  if (key === 'tags') return bulkMapTags;
  if (key === 'notes') return bulkMapNotes;
  if (key === 'imageUrl') return bulkMapImage;
  if (key === 'order') return bulkMapOrder;
  return null;
}

function bindMapTargets() {
  const targets = document.querySelectorAll('.mapTarget[data-map]');
  targets.forEach((t) => {
    t.addEventListener('dragover', (e) => {
      e.preventDefault();
      t.classList.add('dragOver');
    });
    t.addEventListener('dragleave', () => {
      t.classList.remove('dragOver');
    });
    t.addEventListener('drop', (e) => {
      e.preventDefault();
      t.classList.remove('dragOver');
      const idx = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isFinite(idx)) return;
      const key = t.getAttribute('data-map');
      const sel = selectForMapKey(key);
      if (!sel) return;
      sel.value = String(idx + 1);
      if (bulkMapUse) bulkMapUse.checked = true;
      updateMapLabelsFromSelects();
    });
  });

  [
    bulkMapType,
    bulkMapPrompt,
    bulkMapAnswer,
    bulkMapOptions,
    bulkMapCategory,
    bulkMapTags,
    bulkMapNotes,
    bulkMapImage,
    bulkMapOrder,
  ].forEach((sel) => sel?.addEventListener('change', updateMapLabelsFromSelects));
}

function getBulkMapping() {
  if (!bulkMapUse?.checked) return null;
  return {
    use: true,
    map: {
      type: mapSelectValue(bulkMapType),
      prompt: mapSelectValue(bulkMapPrompt),
      answer: mapSelectValue(bulkMapAnswer),
      options: mapSelectValue(bulkMapOptions),
      category: mapSelectValue(bulkMapCategory),
      tags: mapSelectValue(bulkMapTags),
      notes: mapSelectValue(bulkMapNotes),
      imageUrl: mapSelectValue(bulkMapImage),
      order: mapSelectValue(bulkMapOrder),
    },
  };
}

function parseFlashcardLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return '';
  if (/\bPL\s*:/i.test(raw) && /\bES\s*:/i.test(raw)) return raw;

  let parts = raw
    .split('\t')
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2)
    parts = raw
      .split(' - ')
      .map((x) => x.trim())
      .filter(Boolean);
  if (parts.length < 2)
    parts = raw
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean);
  if (parts.length < 2) return '';

  const pl = parts[0];
  const es = parts[1];
  const exRaw = parts[2] || '';
  const ex = exRaw.replace(/^EX\s*:\s*/i, '').trim();

  return ex
    ? `PL: ${pl} | ES: ${es} | EX: ${ex}`
    : `PL: ${pl} | ES: ${es}`;
}

function toTagsArray(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/,|;|\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function getNextExerciseOrder() {
  if (!currentCourseId) return 1;
  try {
    let max = 0;
    const snap = await getDocs(
      query(collection(db, 'exercises'), where('topicId', '==', currentCourseId)),
    );
    snap.forEach((d) => {
      const val = Number(d.data()?.order || 0);
      if (val > max) max = val;
    });

    if (currentCourseSlug) {
      const snap2 = await getDocs(
        query(
          collection(db, 'exercises'),
          where('topicSlug', '==', currentCourseSlug),
        ),
      );
      snap2.forEach((d) => {
        const val = Number(d.data()?.order || 0);
        if (val > max) max = val;
      });
    }
    return max + 1;
  } catch (e) {
    console.warn('[wizard] getNextExerciseOrder failed', e);
    return 1;
  }
}

async function getNextExerciseOrderForTopic(topicId, topicSlug) {
  if (!topicId) return 1;
  try {
    let max = 0;
    const snap = await getDocs(
      query(collection(db, 'exercises'), where('topicId', '==', topicId)),
    );
    snap.forEach((d) => {
      const val = Number(d.data()?.order || 0);
      if (val > max) max = val;
    });

    if (topicSlug) {
      const snap2 = await getDocs(
        query(collection(db, 'exercises'), where('topicSlug', '==', topicSlug)),
      );
      snap2.forEach((d) => {
        const val = Number(d.data()?.order || 0);
        if (val > max) max = val;
      });
    }
    return max + 1;
  } catch (e) {
    console.warn('[wizard] getNextExerciseOrderForTopic failed', e);
    return 1;
  }
}

async function topicHasExercises(topicId) {
  if (!topicId) return false;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'exercises'),
        where('topicId', '==', topicId),
        limit(1),
      ),
    );
    return snap.size > 0;
  } catch (e) {
    console.warn('[wizard] topicHasExercises failed', e);
    return false;
  }
}

async function insertLibrarySetForTopic(topic, set) {
  const topicId = String(topic?.id || '').trim();
  if (!topicId) return { saved: 0 };
  const topicSlug = String(topic?.slug || topicId).trim();
  const topicLevel = String(topic?.level || currentCourseLevel || 'A1').toUpperCase();

  let order = await getNextExerciseOrderForTopic(topicId, topicSlug);
  const batchLimit = 400;
  let batch = writeBatch(db);
  let pending = 0;
  let saved = 0;

  for (const item of set.items || []) {
    const ref = doc(collection(db, 'exercises'));
    const options = Array.isArray(item.options) ? item.options : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];
    batch.set(ref, {
      level: topicLevel,
      topicId,
      topicSlug,
      type: canonicalType(item.type || 'Rellenar los espacios'),
      prompt: String(item.prompt || '').trim(),
      answer: String(item.answer || '').trim(),
      options,
      notes: String(item.notes || '').trim(),
      category: String(item.category || 'grammar'),
      tags,
      imageUrl: String(item.imageUrl || '').trim(),
      order: order++,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    pending += 1;
    saved += 1;
    if (pending >= batchLimit) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();
  return { saved };
}

async function importBulkExercises() {
  if (!currentCourseId || !currentCourseLevel) {
    setStatus(wizBulkStatus, 'Najpierw zapisz kurs.', true);
    return;
  }

  const raw = String(wizBulkArea?.value || '').trim();
  if (!raw) {
    setStatus(wizBulkStatus, 'Brak danych.', true);
    return;
  }

  const mapping = getBulkMapping();
  const { items, errors } = parseBulkRows(raw, mapping);
  if (!items.length) {
    setStatus(wizBulkStatus, 'Brak poprawnych wierszy.', true);
    return;
  }

  setStatus(wizBulkStatus, 'Importuje...');
  try {
    let order = await getNextExerciseOrder();
    let saved = 0;
    const batchLimit = 400;
    let batch = writeBatch(db);
    let pending = 0;

    for (const item of items) {
      const prompt = String(item.prompt || '').trim();
      const answer = String(item.answer || '').trim();
      if (!prompt || !answer) continue;

      const opts = Array.isArray(item.options) ? item.options : [];
      const ref = doc(collection(db, 'exercises'));
      const itemOrder =
        Number(item.order || 0) > 0 ? Number(item.order) : order++;
      batch.set(ref, {
        level: currentCourseLevel,
        topicId: currentCourseId,
        topicSlug: currentCourseSlug || currentCourseId,
        type: canonicalType(item.type || 'Rellenar los espacios'),
        prompt,
        answer,
        options: opts,
        category: String(item.category || 'grammar'),
        tags: Array.isArray(item.tags) ? item.tags : toTagsArray(item.tags),
        notes: String(item.notes || ''),
        imageUrl: String(item.imageUrl || '').trim(),
        order: itemOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pending += 1;
      saved += 1;

      if (pending >= batchLimit) {
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
      }
    }

    if (pending > 0) await batch.commit();
    setStatus(wizBulkStatus, `Zaimportowano: ${saved} (bledy: ${errors})`);
    if (wizBulkArea) wizBulkArea.value = '';
  } catch (e) {
    console.error(e);
    setStatus(wizBulkStatus, 'Blad importu.', true);
  }
}

async function importFlashcards() {
  if (!currentCourseId || !currentCourseLevel) {
    setStatus(wizFlashStatus, 'Najpierw zapisz kurs.', true);
    return;
  }
  const raw = String(wizFlashArea?.value || '').trim();
  if (!raw) {
    setStatus(wizFlashStatus, 'Brak danych.', true);
    return;
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseFlashcardLine)
    .filter(Boolean);

  if (!lines.length) {
    setStatus(wizFlashStatus, 'Brak poprawnych linii.', true);
    return;
  }

  setStatus(wizFlashStatus, 'Dodawanie...');
  try {
    const order = await getNextExerciseOrder();
    const ref = doc(collection(db, 'exercises'));
    await setDoc(ref, {
      level: currentCourseLevel,
      topicId: currentCourseId,
      topicSlug: currentCourseSlug || currentCourseId,
      type: 'Tarjetas interactivas',
      prompt: 'Tarjetas (import)',
      answer: 'ok',
      options: lines,
      category: 'vocab',
      tags: ['fichas'],
      notes: '',
      imageUrl: '',
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setStatus(wizFlashStatus, `Dodano fiszki: ${lines.length}`);
    if (wizFlashArea) wizFlashArea.value = '';
  } catch (e) {
    console.error(e);
    setStatus(wizFlashStatus, 'Blad dodawania.', true);
  }
}

const EXERCISE_TYPES_ALL = [
  'Rellenar los espacios',
  'Relacionar palabra con imagen',
  'Relacionar palabra con traduccion',
  'Elegir la palabra correcta',
  'Tarjetas interactivas',
  'Agrupar palabras',
  'Verdadero o falso',
  'Completar la frase con una imagen',
  'Juego de memoria (pares)',
  'Opcion multiple',
  'Completar la forma correcta',
  'Elegir la forma correcta',
  'Transformaciones',
  'Relacionar pregunta con respuesta',
  'Ordenar palabras para formar una frase',
  'Corregir errores',
  'Unir dos partes de la frase',
  'Completar con preposicion o terminacion',
  'Opcion unica',
  'Escribir tu propia respuesta',
  'Repetir despues del narrador',
  'Completar la frase con tu voz',
  'Responder a una pregunta',
  'Describir una imagen',
  'Juego de roles',
  'Mini-monologo',
  'Dialogo semiabierto',
  'Decirlo de otra manera',
  'Escuchar y elegir la respuesta',
  'Escuchar y completar los espacios',
  'Escuchar y marcar verdadero o falso',
  'Escuchar y relacionar personas',
  'Escuchar y ordenar la secuencia',
  'Dictado con audio',
  'Escuchar y repetir',
  'Dialogo interactivo',
  'Mision del dia',
  'Quiz situacional',
  'Video con preguntas',
  'Test final del tema',
  'Debate grabado',
  'Contar una historia',
  'Simulacion de entrevista de trabajo',
  'Retroalimentacion por voz',
];

const EXERCISE_TYPES_VOCAB = [
  'Relacionar palabra con imagen',
  'Relacionar palabra con traduccion',
  'Tarjetas interactivas',
  'Agrupar palabras',
  'Verdadero o falso',
  'Completar la frase con una imagen',
  'Juego de memoria (pares)',
];

const EXERCISE_TYPES_GRAMMAR = [
  'Completar la forma correcta',
  'Elegir la forma correcta',
  'Transformaciones',
  'Relacionar pregunta con respuesta',
  'Ordenar palabras para formar una frase',
  'Corregir errores',
  'Unir dos partes de la frase',
  'Completar con preposicion o terminacion',
  'Opcion unica',
  'Escribir tu propia respuesta',
];

const EXERCISE_TYPES_SPEAKING = [
  'Repetir despues del narrador',
  'Completar la frase con tu voz',
  'Responder a una pregunta',
  'Describir una imagen',
  'Juego de roles',
  'Mini-monologo',
  'Dialogo semiabierto',
  'Dialogo interactivo',
  'Decirlo de otra manera',
  'Debate grabado',
  'Contar una historia',
  'Simulacion de entrevista de trabajo',
  'Retroalimentacion por voz',
];

const EXERCISE_TYPES_LISTENING = [
  'Escuchar y elegir la respuesta',
  'Escuchar y completar los espacios',
  'Escuchar y marcar verdadero o falso',
  'Escuchar y relacionar personas',
  'Escuchar y ordenar la secuencia',
  'Dictado con audio',
  'Escuchar y repetir',
];

const EXERCISE_TYPES_MIXED = [
  'Dialogo interactivo',
  'Mision del dia',
  'Quiz situacional',
  'Video con preguntas',
  'Test final del tema',
];

const EXERCISE_TYPES_PREMIUM = [
  'Debate grabado',
  'Contar una historia',
  'Simulacion de entrevista de trabajo',
  'Retroalimentacion por voz',
];

const TEMPLATE_GROUPS = {
  choice: new Set([
    'Opcion multiple',
    'Opcion unica',
    'Elegir la palabra correcta',
    'Elegir la forma correcta',
    'Escuchar y elegir la respuesta',
    'Video con preguntas',
    'Quiz situacional',
    'Test final del tema',
  ]),
  trueFalse: new Set([
    'Verdadero o falso',
    'Escuchar y marcar verdadero o falso',
  ]),
  fill: new Set([
    'Rellenar los espacios',
    'Completar la forma correcta',
    'Completar con preposicion o terminacion',
    'Escuchar y completar los espacios',
    'Dictado con audio',
  ]),
  matching: new Set([
    'Relacionar palabra con imagen',
    'Relacionar palabra con traduccion',
    'Relacionar pregunta con respuesta',
    'Escuchar y relacionar personas',
    'Unir dos partes de la frase',
  ]),
  ordering: new Set([
    'Ordenar palabras para formar una frase',
    'Escuchar y ordenar la secuencia',
  ]),
  memory: new Set(['Juego de memoria (pares)']),
  grouping: new Set(['Agrupar palabras']),
  cards: new Set(['Tarjetas interactivas']),
  imageSentence: new Set(['Completar la frase con una imagen']),
};

const VOCAB_TYPES = new Set(EXERCISE_TYPES_VOCAB);
const GRAMMAR_TYPES = new Set(EXERCISE_TYPES_GRAMMAR);
const SPEAKING_TYPES = new Set(EXERCISE_TYPES_SPEAKING);
const LISTENING_TYPES = new Set(EXERCISE_TYPES_LISTENING);
const PREMIUM_TYPES = new Set(EXERCISE_TYPES_PREMIUM);

const TEMPLATE_SETS = [
  {
    id: 'tpl_all',
    label: 'Szablony - wszystkie typy',
    types: EXERCISE_TYPES_ALL,
  },
  {
    id: 'tpl_vocab',
    label: 'Szablony - slownictwo',
    types: EXERCISE_TYPES_VOCAB,
  },
  {
    id: 'tpl_grammar',
    label: 'Szablony - gramatyka',
    types: EXERCISE_TYPES_GRAMMAR,
  },
  {
    id: 'tpl_speaking',
    label: 'Szablony - mowienie',
    types: EXERCISE_TYPES_SPEAKING,
  },
  {
    id: 'tpl_listening',
    label: 'Szablony - sluchanie',
    types: EXERCISE_TYPES_LISTENING,
  },
  {
    id: 'tpl_mixed',
    label: 'Szablony - mieszane',
    types: EXERCISE_TYPES_MIXED,
  },
  {
    id: 'tpl_premium',
    label: 'Szablony - premium',
    types: EXERCISE_TYPES_PREMIUM,
  },
];

function categoryForType(rawType) {
  if (VOCAB_TYPES.has(rawType)) return 'vocab';
  if (GRAMMAR_TYPES.has(rawType)) return 'grammar';
  return 'both';
}

function buildTemplateItem(rawType) {
  const type = canonicalType(rawType);
  const base = {
    type,
    prompt: `Actividad: ${type}`,
    answer: '',
    options: [],
    category: categoryForType(rawType),
    notes: '',
  };

  const opt = (...lines) => lines.filter(Boolean);
  const notes = [];
  const needsAudio =
    LISTENING_TYPES.has(rawType) || rawType === 'Repetir despues del narrador';
  const needsVideo = rawType === 'Video con preguntas';
  const needsImage =
    rawType === 'Completar la frase con una imagen' ||
    rawType === 'Describir una imagen';
  const needsVoice = SPEAKING_TYPES.has(rawType) || PREMIUM_TYPES.has(rawType);

  if (needsAudio) notes.push('AUDIO_URL: https://...');
  if (needsVideo) notes.push('VIDEO_URL: https://...');
  if (needsImage) notes.push('IMAGE_URL: https://...');
  if (needsVoice) notes.push('GRABACION: respuesta por voz');

  if (TEMPLATE_GROUPS.trueFalse.has(rawType)) {
    return {
      ...base,
      prompt: 'Lee/Escucha y marca: verdadero o falso.',
      options: opt('true', 'false'),
      answer: 'true',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.choice.has(rawType)) {
    return {
      ...base,
      prompt: 'Elige la respuesta correcta:',
      options: opt('A) ...', 'B) ...', 'C) ...', 'D) ...'),
      answer: 'A',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.fill.has(rawType)) {
    return {
      ...base,
      prompt: 'Completa: ___',
      answer: 'respuesta',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.matching.has(rawType)) {
    return {
      ...base,
      prompt: 'Relaciona los elementos:',
      options: opt('A) ... = 1) ...', 'B) ... = 2) ...', 'C) ... = 3) ...'),
      answer: 'A-1, B-2, C-3',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.ordering.has(rawType)) {
    return {
      ...base,
      prompt: 'Ordena la secuencia:',
      options: opt('1) ...', '2) ...', '3) ...', '4) ...'),
      answer: '1-2-3-4',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.memory.has(rawType)) {
    return {
      ...base,
      prompt: 'Encuentra los pares:',
      options: opt(
        'A) palabra = traduccion',
        'B) palabra = traduccion',
        'C) palabra = traduccion',
      ),
      answer: 'pares correctos',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.grouping.has(rawType)) {
    return {
      ...base,
      prompt: 'Agrupa palabras por categoria:',
      options: opt('Categoria 1: ...', 'Categoria 2: ...'),
      answer: '',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.cards.has(rawType)) {
    return {
      ...base,
      prompt: 'Tarjetas: (PL | ES | EX)',
      options: opt(
        'PL: ... | ES: ... | EX: ...',
        'PL: ... | ES: ... | EX: ...',
      ),
      answer: '',
      notes: notes.join(' | '),
    };
  }

  if (TEMPLATE_GROUPS.imageSentence.has(rawType)) {
    return {
      ...base,
      prompt: 'Completa la frase con la imagen:',
      answer: 'respuesta',
      notes: notes.join(' | '),
    };
  }

  return {
    ...base,
    notes: notes.join(' | '),
  };
}

function buildTemplateSet(level, tpl) {
  return {
    id: `${level.toLowerCase()}_${tpl.id}`,
    label: `${level} - ${tpl.label}`,
    items: (tpl.types || []).map((t) => buildTemplateItem(t)),
  };
}

function buildTemplateSetsForLevel(level) {
  return TEMPLATE_SETS.map((tpl) => buildTemplateSet(level, tpl));
}

const EXERCISE_LIBRARY = {
  A1: [
    ...buildTemplateSetsForLevel('A1'),
    {
      id: 'a1_saludos',
      label: 'A1 - Saludos y presentaciones',
      items: [
        {
          type: 'Opcion multiple',
          prompt: 'Elige la respuesta correcta: "Buenos dias" significa...',
          options: ['A) Buenas noches', 'B) Buenas tardes', 'C) Buenos dias'],
          answer: 'C',
          category: 'vocab',
        },
        {
          type: 'Rellenar los espacios',
          prompt: 'Yo ___ Marta.',
          answer: 'soy',
          category: 'grammar',
        },
        {
          type: 'Verdadero o falso',
          prompt: '"Adios" es un saludo de despedida.',
          options: ['true', 'false'],
          answer: 'true',
          category: 'vocab',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Como te llamas? - ____.',
          options: ['A) Me llamo Ana', 'B) Soy en casa', 'C) Estoy 20 anos'],
          answer: 'A',
          category: 'grammar',
        },
      ],
    },
    {
      id: 'a1_numeros_tiempo',
      label: 'A1 - Numeros y tiempo',
      items: [
        {
          type: 'Opcion multiple',
          prompt: 'Como se dice "15"?',
          options: ['A) quince', 'B) cincuenta', 'C) dieciseis'],
          answer: 'A',
          category: 'vocab',
        },
        {
          type: 'Rellenar los espacios',
          prompt: 'Son las ___ (3:30).',
          answer: 'tres y media',
          category: 'grammar',
        },
        {
          type: 'Verdadero o falso',
          prompt: '"Hoy es lunes" habla del dia de la semana.',
          options: ['true', 'false'],
          answer: 'true',
          category: 'vocab',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Madrid ___ en Espana.',
          options: ['A) es', 'B) esta', 'C) eres'],
          answer: 'A',
          category: 'grammar',
        },
      ],
    },
    {
      id: 'a1_casa',
      label: 'A1 - Casa y objetos',
      items: [
        {
          type: 'Opcion multiple',
          prompt: 'La "mesa" es un...',
          options: ['A) mueble', 'B) ciudad', 'C) bebida'],
          answer: 'A',
          category: 'vocab',
        },
        {
          type: 'Rellenar los espacios',
          prompt: 'En la cocina hay un ___.',
          answer: 'horno',
          category: 'vocab',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Elige el articulo correcto: ___ cama.',
          options: ['A) El', 'B) La', 'C) Los'],
          answer: 'B',
          category: 'grammar',
        },
      ],
    },
  ],
  A2: [
    ...buildTemplateSetsForLevel('A2'),
    {
      id: 'a2_pasado',
      label: 'A2 - Pasado simple',
      items: [
        {
          type: 'Rellenar los espacios',
          prompt: 'Ayer ___ (ir) al medico.',
          answer: 'fui',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'El preterito de "tener" (yo) es...',
          options: ['A) tuve', 'B) tenia', 'C) tengo'],
          answer: 'A',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Nosotros ___ (comer) paella ayer.',
          options: ['A) comimos', 'B) comemos', 'C) comiamos'],
          answer: 'A',
          category: 'grammar',
        },
      ],
    },
    {
      id: 'a2_futuro',
      label: 'A2 - Futuro cercano',
      items: [
        {
          type: 'Rellenar los espacios',
          prompt: 'Manana voy a ___ (estudiar).',
          answer: 'estudiar',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Vamos ___ al cine.',
          options: ['A) a ir', 'B) a voy', 'C) ir a'],
          answer: 'A',
          category: 'grammar',
        },
      ],
    },
  ],
  B1: [
    ...buildTemplateSetsForLevel('B1'),
    {
      id: 'b1_subjuntivo',
      label: 'B1 - Subjuntivo basico',
      items: [
        {
          type: 'Opcion multiple',
          prompt: 'Espero que tu ___ bien.',
          options: ['A) estas', 'B) estes', 'C) eres'],
          answer: 'B',
          category: 'grammar',
        },
        {
          type: 'Rellenar los espacios',
          prompt: 'Es posible que ___ (llover) manana.',
          answer: 'llueva',
          category: 'grammar',
        },
      ],
    },
    {
      id: 'b1_condicional',
      label: 'B1 - Condicional',
      items: [
        {
          type: 'Rellenar los espacios',
          prompt: 'Yo ___ (viajar) mas si tuviera tiempo.',
          answer: 'viajaria',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'Si tuviera dinero, ___ una casa.',
          options: ['A) compraria', 'B) compro', 'C) comprare'],
          answer: 'A',
          category: 'grammar',
        },
      ],
    },
  ],
  B2: [
    ...buildTemplateSetsForLevel('B2'),
    {
      id: 'b2_debate',
      label: 'B2 - Opiniones y debate',
      items: [
        {
          type: 'Rellenar los espacios',
          prompt: 'Si yo ___ (saber) la verdad, te la diria.',
          answer: 'supiera',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'La expresion "a pesar de" introduce...',
          options: ['A) causa', 'B) contraste', 'C) consecuencia'],
          answer: 'B',
          category: 'grammar',
        },
      ],
    },
    {
      id: 'b2_conectores',
      label: 'B2 - Conectores',
      items: [
        {
          type: 'Rellenar los espacios',
          prompt: 'No vino a clase, ___ estaba enfermo.',
          answer: 'porque',
          category: 'grammar',
        },
        {
          type: 'Opcion multiple',
          prompt: 'El conector "sin embargo" expresa...',
          options: ['A) causa', 'B) contraste', 'C) ejemplo'],
          answer: 'B',
          category: 'grammar',
        },
      ],
    },
  ],
};

function renderLibrarySets() {
  if (!wizLibLevel || !wizLibSet) return;
  const lvl = String(wizLibLevel.value || 'A1').toUpperCase();
  const sets = EXERCISE_LIBRARY[lvl] || [];
  wizLibSet.innerHTML = '';
  if (!sets.length) {
    wizLibSet.appendChild(new Option('Brak zestawow', ''));
    return;
  }
  sets.forEach((s) => wizLibSet.appendChild(new Option(s.label, s.id)));
  renderLibraryPreview();
}

function renderLibraryPreview() {
  if (!wizLibPreview || !wizLibLevel || !wizLibSet) return;
  const lvl = String(wizLibLevel.value || 'A1').toUpperCase();
  const set = (EXERCISE_LIBRARY[lvl] || []).find(
    (s) => s.id === wizLibSet.value,
  );
  if (!set) {
    wizLibPreview.innerHTML =
      '<div class="hintSmall">Wybierz zestaw, aby zobaczyc podglad cwiczen.</div>';
    return;
  }
  const items = Array.isArray(set.items) ? set.items : [];
  const preview = items.slice(0, 6);
  wizLibPreview.innerHTML = `
    <div class="sectionTitle" style="margin-top:0; font-size:16px;">${set.label}</div>
    <div class="muted" style="margin-top:4px;">Cwiczen: ${items.length}</div>
    <div style="margin-top:8px; display:grid; gap:6px;">
      ${preview
        .map(
          (it, idx) =>
            `<div class="muted" style="font-size:13px;">
              ${idx + 1}. <b>${escapeHtml(
                canonicalType(it.type || 'Cwiczenie'),
              )}</b> - ${escapeHtml(String(it.prompt || '').slice(0, 120))}
            </div>`,
        )
        .join('')}
      ${
        items.length > preview.length
          ? `<div class="hintSmall">+ ${items.length - preview.length} wiecej...</div>`
          : ''
      }
    </div>
  `;
}

async function insertLibrarySet() {
  if (!currentCourseId || !currentCourseLevel) {
    setStatus(wizLibStatus, 'Najpierw zapisz kurs.', true);
    return;
  }
  if (!wizLibLevel || !wizLibSet) return;

  const lvl = String(wizLibLevel.value || 'A1').toUpperCase();
  const set = (EXERCISE_LIBRARY[lvl] || []).find(
    (s) => s.id === wizLibSet.value,
  );
  if (!set) {
    setStatus(wizLibStatus, 'Wybierz zestaw.', true);
    return;
  }

  setStatus(wizLibStatus, 'Dodawanie...');
  try {
    const res = await insertLibrarySetForTopic(
      {
        id: currentCourseId,
        slug: currentCourseSlug || currentCourseId,
        level: currentCourseLevel,
      },
      set,
    );
    setStatus(wizLibStatus, `Dodano: ${res.saved}`);
  } catch (e) {
    console.error(e);
    setStatus(wizLibStatus, 'Blad dodawania.', true);
  }
}

async function insertLibrarySetForAllTopics() {
  if (!wizLibLevel || !wizLibSet) return;
  const lvl = String(wizLibLevel.value || 'A1').toUpperCase();
  const set = (EXERCISE_LIBRARY[lvl] || []).find(
    (s) => s.id === wizLibSet.value,
  );
  if (!set) {
    setStatus(wizLibAllStatus, 'Wybierz zestaw.', true);
    return;
  }

  const onlyEmpty = !!wizLibEmptyOnly?.checked;
  const confirmMsg = onlyEmpty
    ? `Dodac zestaw do WSZYSTKICH tematow poziomu ${lvl} (tylko puste)?`
    : `Dodac zestaw do WSZYSTKICH tematow poziomu ${lvl}?`;
  if (!window.confirm(confirmMsg)) return;

  setStatus(wizLibAllStatus, 'Wczytywanie tematow...');
  try {
    const snap = await getDocs(
      query(
        collection(db, 'courses'),
        where('level', '==', lvl),
        orderBy('order', 'asc'),
      ),
    );
    const topics = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (!topics.length) {
      setStatus(wizLibAllStatus, 'Brak tematow na tym poziomie.', true);
      return;
    }

    let savedTotal = 0;
    let skipped = 0;

    for (const topic of topics) {
      if (onlyEmpty) {
        const has = await topicHasExercises(topic.id);
        if (has) {
          skipped += 1;
          continue;
        }
      }
      const res = await insertLibrarySetForTopic(
        {
          id: topic.id,
          slug: topic.slug || topic.id,
          level: topic.level || lvl,
        },
        set,
      );
      savedTotal += res.saved || 0;
    }

    const suffix = onlyEmpty ? `, pominiete: ${skipped}` : '';
    setStatus(
      wizLibAllStatus,
      `Dodano cwiczen: ${savedTotal} (tematy: ${topics.length}${suffix})`,
    );
  } catch (e) {
    console.error(e);
    setStatus(wizLibAllStatus, 'Blad dodawania.', true);
  }
}

function getLessonAdminUrl() {
  const level = currentCourseLevel || String(courseLevel?.value || '');
  if (!currentCourseId || !level) return '';
  return `lessonadmin.html?level=${encodeURIComponent(
    level,
  )}&id=${encodeURIComponent(currentCourseId)}`;
}

function getExerciseAdminUrl() {
  const level = currentCourseLevel || String(courseLevel?.value || '');
  if (!currentCourseId || !level) return '';
  const slug = currentCourseSlug || currentCourseId;
  return `ejercicioadmin.html?level=${encodeURIComponent(
    level,
  )}&id=${encodeURIComponent(currentCourseId)}&slug=${encodeURIComponent(slug)}`;
}

function updateSummary() {
  if (!summaryBox) return;
  const level = currentCourseLevel || String(courseLevel?.value || '');
  const title = String(courseTitle?.value || currentCourseTitle || '').trim();
  const slug = String(courseSlug?.value || currentCourseSlug || '').trim();
  const published = lessonPublish?.checked ? 'tak' : 'nie';
  summaryBox.innerHTML = `
    <div><b>Poziom:</b> ${level || '-'}</div>
    <div><b>Temat:</b> ${title || '-'}</div>
    <div><b>Slug:</b> ${slug || '-'}</div>
    <div><b>Course ID:</b> ${currentCourseId || '-'}</div>
    <div><b>Lekcja opublikowana:</b> ${published}</div>
  `;

  if (summarySidebar) summarySidebar.innerHTML = summaryBox.innerHTML;

  const lessonUrl = getLessonAdminUrl();
  const exerciseUrl = getExerciseAdminUrl();

  if (summaryLesson && lessonUrl) summaryLesson.href = lessonUrl;
  if (summaryExercises && exerciseUrl) summaryExercises.href = exerciseUrl;
}

function lessonHasContent() {
  const outline = String(lessonOutline?.value || '').trim();
  const htmlInput = String(lessonHtml?.value || '').trim();
  if (BLOCKS.length) return true;
  if (outline) return true;
  if (htmlInput) return true;
  if (loadedLesson && (loadedLesson.html || (Array.isArray(loadedLesson.blocks) && loadedLesson.blocks.length))) {
    return true;
  }
  return false;
}

async function saveAll() {
  setStatus(saveAllStatus, 'Zapisywanie...');
  const okCourse = await saveCourse();
  if (!okCourse) {
    setStatus(saveAllStatus, 'Nie zapisano kursu.', true);
    return;
  }
  if (!lessonHasContent()) {
    setStatus(saveAllStatus, 'Kurs zapisany. Lekcja pusta - pominieta.');
    updateSummary();
    return;
  }
  const okLesson = await saveLesson();
  if (okLesson) {
    setStatus(saveAllStatus, 'Zapisano kurs i lekcje.');
  } else {
    setStatus(saveAllStatus, 'Kurs zapisany, blad lekcji.', true);
  }
}

function bindEvents() {
  modeNew?.addEventListener('change', () => {
    if (modeNew.checked) {
      setMode('new');
      resetCourseForm();
      setStep(1);
      updateSummary();
    }
  });
  modeEdit?.addEventListener('change', () => {
    if (modeEdit.checked) {
      setMode('edit');
      resetCourseForm();
      setStep(1);
      updateSummary();
    }
  });

  btnLoadEditTopics?.addEventListener('click', loadEditTopics);
  editLevel?.addEventListener('change', loadEditTopics);
  editTopic?.addEventListener('change', loadSelectedTopic);

  btnSaveCourse?.addEventListener('click', saveCourse);
  btnSaveLesson?.addEventListener('click', saveLesson);
  btnPublishLesson?.addEventListener('click', async () => {
    if (lessonPublish) lessonPublish.checked = true;
    await saveLesson();
  });
  btnSkipLesson?.addEventListener('click', () => setStep(3));

  btnWizParse?.addEventListener('click', importBulkExercises);
  btnWizFlash?.addEventListener('click', importFlashcards);
  btnWizLib?.addEventListener('click', insertLibrarySet);
  btnWizLibAll?.addEventListener('click', insertLibrarySetForAllTopics);

  const goToExerciseAdmin = (statusEl) => {
    if (!currentCourseId || !currentCourseLevel) {
      setStatus(statusEl, 'Najpierw zapisz kurs.', true);
      return;
    }
    const level = currentCourseLevel;
    const id = currentCourseId;
    const slug = currentCourseSlug || currentCourseId;
    const url = `ejercicioadmin.html?level=${encodeURIComponent(
      level,
    )}&id=${encodeURIComponent(id)}&slug=${encodeURIComponent(slug)}`;
    window.location.href = url;
  };

  btnGoExerciseAdmin?.addEventListener('click', () =>
    goToExerciseAdmin(wizSingleStatus),
  );
  btnGoExerciseAdminHeader?.addEventListener('click', () =>
    goToExerciseAdmin(wizSingleStatusTop),
  );
  btnGoExerciseAdminStep2?.addEventListener('click', () =>
    goToExerciseAdmin(wizSingleStatusStep2),
  );
  btnSaveAll?.addEventListener('click', saveAll);
  btnOpenLessonAdmin?.addEventListener('click', () => {
    const url = getLessonAdminUrl();
    if (!url) {
      setStatus(saveAllStatus, 'Najpierw zapisz kurs.', true);
      return;
    }
    window.location.href = url;
  });
  btnOpenExerciseAdmin?.addEventListener('click', () => {
    const url = getExerciseAdminUrl();
    if (!url) {
      setStatus(saveAllStatus, 'Najpierw zapisz kurs.', true);
      return;
    }
    window.location.href = url;
  });
  wizLibLevel?.addEventListener('change', renderLibrarySets);
  wizLibSet?.addEventListener('change', renderLibraryPreview);
  wizBulkArea?.addEventListener('blur', refreshBulkMapOptions);
  wizBulkArea?.addEventListener('input', () => {
    if (bulkMapUse?.checked) refreshBulkMapOptions();
  });
  btnLoadBulkFile?.addEventListener('click', async () => {
    const file = bulkImportFile?.files?.[0];
    if (!file) {
      setStatus(wizBulkStatus, 'Wybierz plik.', true);
      return;
    }
    try {
      const text = await file.text();
      if (wizBulkArea) wizBulkArea.value = text;
      setStatus(wizBulkStatus, 'Plik wczytany OK');
      refreshBulkMapOptions();
    } catch (e) {
      console.error(e);
      setStatus(wizBulkStatus, 'Blad wczytywania.', true);
    }
  });
  btnBulkClear?.addEventListener('click', () => {
    if (wizBulkArea) wizBulkArea.value = '';
    setStatus(wizBulkStatus, '');
    refreshBulkMapOptions();
  });

  btnStep3Next?.addEventListener('click', () => {
    setStep(4);
    updateSummary();
  });

  stepNav?.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = Number(btn.getAttribute('data-step') || 1);
      setStep(step);
      updateSummary();
    });
  });

  if (courseTitle) {
    courseTitle.addEventListener('input', () => {
      if (!courseSlug?.value)
        courseSlug.value = slugify(courseTitle.value || '');
    });
  }

  btnWizAddHeading?.addEventListener('click', () => addBlock('heading'));
  btnWizAddText?.addEventListener('click', () => addBlock('text'));
  btnWizAddImage?.addEventListener('click', () => addBlock('image'));
  btnWizAddTip?.addEventListener('click', () => addBlock('tip'));
  btnWizAddExample?.addEventListener('click', () => addBlock('example'));
  btnWizAddDivider?.addEventListener('click', () => addBlock('divider'));
  btnWizClearBlocks?.addEventListener('click', () => {
    BLOCKS = [];
    renderBlocks();
  });
  btnWizTplGrammar?.addEventListener('click', () => setTemplate('grammar'));
  btnWizTplVocab?.addEventListener('click', () => setTemplate('vocab'));
  btnWizTplPremium?.addEventListener('click', () => setTemplate('premium'));
  btnWizTplRepaso?.addEventListener('click', () => setTemplate('repaso'));
  btnWizOutlineReplace?.addEventListener('click', () => applyOutline('replace'));
  btnWizOutlineAppend?.addEventListener('click', () => applyOutline('append'));
}

function init() {
  setMode('new');
  setStep(1);
  renderLibrarySets();
  renderBlocks();
  refreshBulkMapOptions();
  bindMapTargets();
  updateSummary();
  bindEvents();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  CURRENT_USER = user;
  IS_ADMIN = await ensureAdmin(user);
  if (!IS_ADMIN) {
    window.location.href = 'espanel.html';
    return;
  }
  init();
});
