document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('uiMotion');
});

import { auth, db, storage } from '../firebase-init.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  addDoc,
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
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get('level') || 'A1').toUpperCase();
const TOPIC_ID = String(params.get('id') || '').trim();
const SLUG = String(params.get('slug') || '').trim();
const TRACK = String(params.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(params.get('view') || '').trim().toLowerCase();

const PRACTICE_COMPLETE_PCT = 80;
const TEST_PASS_PCT = 80;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

function navParams() {
  const parts = [];
  if (TRACK) parts.push(`track=${encodeURIComponent(TRACK)}`);
  if (COURSE_VIEW) parts.push(`view=${encodeURIComponent(COURSE_VIEW)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

function coursePageName() {
  if (COURSE_VIEW === 'latam') return 'curso-latam.html';
  if (COURSE_VIEW === 'pro') return 'kurs-pl.html';
  return 'course.html';
}

function courseHref(level = LEVEL) {
  const page = coursePageName();
  const lvl = String(level || LEVEL).toUpperCase();
  let href = `${page}?level=${encodeURIComponent(lvl)}`;
  if (TRACK) href += `&track=${encodeURIComponent(TRACK)}`;
  return href;
}

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

const correctionModal = document.getElementById('correctionModal');
const btnFinishCorrection = document.getElementById('btnFinishCorrection');
const btnCorrectionClose = document.getElementById('btnCorrectionClose');
const btnCorrectionCancel = document.getElementById('btnCorrectionCancel');
const btnCorrectionPublish = document.getElementById('btnCorrectionPublish');
const correctionText = document.getElementById('correctionText');
const correctionMeta = document.getElementById('correctionMeta');
const correctionMsg = document.getElementById('correctionMsg');
const btnCorrectionRecord = document.getElementById('btnCorrectionRecord');
const btnCorrectionClearAudio = document.getElementById('btnCorrectionClearAudio');
const correctionRecordHint = document.getElementById('correctionRecordHint');
const correctionAudioPreview = document.getElementById('correctionAudioPreview');

let corrRecorder = null;
let corrRecording = false;
let corrStream = null;
let corrChunks = [];
let corrAudioFile = null;
let corrAudioObjectUrl = '';

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

function setCorrectionMsg(text, bad = false) {
  if (!correctionMsg) return;
  correctionMsg.textContent = text || '';
  correctionMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function setCorrectionRecordHint(text, bad = false) {
  if (!correctionRecordHint) return;
  correctionRecordHint.textContent = text || '';
  correctionRecordHint.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function clearCorrectionAudio({ stopRecording = true } = {}) {
  if (stopRecording && corrRecording) {
    try {
      corrRecorder?.stop();
    } catch {}
    corrRecording = false;
  }

  try {
    corrStream?.getTracks?.()?.forEach((t) => t.stop());
  } catch {}

  corrStream = null;
  corrRecorder = null;
  corrChunks = [];

  corrAudioFile = null;
  if (corrAudioObjectUrl) {
    try {
      URL.revokeObjectURL(corrAudioObjectUrl);
    } catch {}
  }
  corrAudioObjectUrl = '';

  if (correctionAudioPreview) {
    try {
      correctionAudioPreview.pause?.();
    } catch {}
    correctionAudioPreview.removeAttribute('src');
    correctionAudioPreview.style.display = 'none';
  }
  if (btnCorrectionClearAudio) btnCorrectionClearAudio.style.display = 'none';
  if (btnCorrectionRecord) btnCorrectionRecord.textContent = 'Grabar voz';
  setCorrectionRecordHint('');
}

function canRecordVoice() {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function ttsTextForExercise(ex) {
  const direct = extractTtsText(ex);
  if (direct) return direct;

  const prompt = String(ex?.prompt || '').trim();
  const answers = parseAnswerList(ex?.answer || '');

  if (prompt.includes('___') && answers.length) {
    let i = 0;
    return prompt.replaceAll('___', () => answers[i++] ?? answers[0]);
  }

  if (answers.length) return answers.join(' ');
  return prompt;
}

function speakPolish(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;

  try {
    const utter = new SpeechSynthesisUtterance(t);
    utter.lang = 'pl-PL';
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const plVoice = voices.find((v) =>
      String(v.lang || '').toLowerCase().startsWith('pl'),
    );
    if (plVoice) utter.voice = plVoice;

    window.speechSynthesis?.cancel?.();
    window.speechSynthesis?.speak?.(utter);
  } catch {}
}

function playAudioUrl(url) {
  const u = String(url || '').trim();
  if (!u) return;
  try {
    const audio = new Audio(u);
    audio.play().catch(() => {});
  } catch {}
}

function playExerciseAudio(ex) {
  const audioUrl = extractAudioUrl(ex);
  if (audioUrl) {
    playAudioUrl(audioUrl);
    return;
  }
  speakPolish(ttsTextForExercise(ex));
}

const SPEAKER_ICON = '🔊';

function makeSpeakerBtn(text, { title = 'Odsłuchaj (PL)', tiny = true } = {}) {
  const t = String(text || '').trim();
  if (!t) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = tiny ? 'ttsIconBtn ttsIconBtn--tiny' : 'ttsIconBtn';
  btn.textContent = SPEAKER_ICON;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    speakPolish(t);
  });
  return btn;
}

function wireInlineSpeaker(spanEl, text) {
  if (!spanEl) return;
  const t = String(text || '').trim();
  if (!t) return;
  const onClick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    speakPolish(t);
  };
  spanEl.addEventListener('click', onClick);
  spanEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    onClick(ev);
  });
}

async function toggleCorrectionRecording() {
  if (!btnCorrectionRecord) return;

  if (!canRecordVoice()) {
    setCorrectionRecordHint('Tu navegador no soporta grabación.', true);
    return;
  }

  if (corrRecording) {
    try {
      corrRecorder?.stop();
    } catch {}
    corrRecording = false;
    btnCorrectionRecord.textContent = 'Grabar voz';
    setCorrectionRecordHint('');
    return;
  }

  try {
    clearCorrectionAudio({ stopRecording: false });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    corrStream = stream;
    corrRecorder = new MediaRecorder(stream);
    corrChunks = [];

    corrRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) corrChunks.push(e.data);
    };

    corrRecorder.onstop = () => {
      const blob = new Blob(corrChunks, { type: corrRecorder?.mimeType || 'audio/webm' });
      const file = new File([blob], `correction_${Date.now()}.webm`, { type: blob.type });
      corrAudioFile = file;

      if (corrAudioObjectUrl) {
        try {
          URL.revokeObjectURL(corrAudioObjectUrl);
        } catch {}
      }
      corrAudioObjectUrl = URL.createObjectURL(blob);

      if (correctionAudioPreview) {
        correctionAudioPreview.src = corrAudioObjectUrl;
        correctionAudioPreview.style.display = 'block';
      }
      if (btnCorrectionClearAudio) btnCorrectionClearAudio.style.display = '';

      try {
        corrStream?.getTracks?.()?.forEach((t) => t.stop());
      } catch {}
      corrStream = null;
      corrRecorder = null;
      corrChunks = [];

      setCorrectionRecordHint('Voz lista.');
    };

    corrRecorder.start();
    corrRecording = true;
    btnCorrectionRecord.textContent = 'Detener';
    setCorrectionRecordHint('Grabando...');
  } catch (e) {
    console.warn('[correction] record failed', e);
    clearCorrectionAudio();
    setCorrectionRecordHint('No se pudo grabar.', true);
  }
}

function openCorrectionModal() {
  if (!correctionModal) return;
  const title = String(currentTopic?.title || currentTopic?.name || currentTopic?.slug || '').trim();
  const meta = `Nivel ${LEVEL}${title ? ` · Tema: ${title}` : ''}`;
  if (correctionMeta) correctionMeta.textContent = meta;
  setCorrectionMsg('');
  setCorrectionRecordHint('');
  if (btnCorrectionRecord) btnCorrectionRecord.disabled = !canRecordVoice();
  correctionModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  if (correctionText) correctionText.focus();
}

function closeCorrectionModal() {
  if (!correctionModal) return;
  clearCorrectionAudio();
  correctionModal.style.display = 'none';
  document.body.classList.remove('modal-open');
  setCorrectionMsg('');
}

async function getMyDisplayName(uid, email) {
  const fallback = String(email || '').trim() || 'Usuario';
  const short = fallback.includes('@') ? fallback.split('@')[0] : fallback;
  const fromAuth = String(auth.currentUser?.displayName || '').trim();
  if (fromAuth) return fromAuth;
  try {
    const snap = await getDoc(doc(db, 'public_users', uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      const name = String(d.displayName || d.name || '').trim();
      const handle = String(d.handle || '').trim();
      if (name) return name;
      if (handle) return `@${handle}`;
    }
  } catch {}
  return short || 'Usuario';
}

async function publishCorrectionRequest() {
  if (!CURRENT_UID) return;
  if (!currentTopic?.id) return;
  const raw = String(correctionText?.value || '').trim();
  if (raw.length < 6) {
    setCorrectionMsg('Escribe al menos una frase.', true);
    return;
  }
  if (raw.length > 2200) {
    setCorrectionMsg('El texto es demasiado largo (m\u00e1x. 2200 caracteres).', true);
    return;
  }
  if (corrRecording) {
    setCorrectionMsg('Det\u00e9n la grabaci\u00f3n primero.', true);
    return;
  }

  try {
    if (btnCorrectionPublish) btnCorrectionPublish.disabled = true;
    setCorrectionMsg('Publicando...');

    const topicTitle = String(currentTopic?.title || currentTopic?.name || '').trim();
    const authorName = await getMyDisplayName(CURRENT_UID, auth.currentUser?.email);

    const tags = [
      'Correcci\u00f3n',
      `Nivel ${LEVEL}`,
      topicTitle ? `Tema: ${topicTitle}` : '',
    ].filter(Boolean);

    const header = `Correcci\u00f3n (Nivel ${LEVEL}${topicTitle ? ` \u00b7 ${topicTitle}` : ''})`;
    const text = `${header}\n\n${raw}`;

    const voice = corrAudioFile;
    let voiceUrl = '';
    let voicePath = '';
    if (voice) {
      const MAX_VOICE_BYTES = 10 * 1024 * 1024;
      if (voice.size > MAX_VOICE_BYTES) {
        setCorrectionMsg('Audio demasiado grande (m\u00e1x. 10MB).', true);
        return;
      }
      setCorrectionMsg('Subiendo voz...');
      const safeName = String(voice.name || 'voice').replace(/[^\w.\-]+/g, '_');
      const path = `audio/corrections/${CURRENT_UID}/${Date.now()}_${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, voice);
      voiceUrl = await getDownloadURL(fileRef);
      voicePath = path;
    }

    const ref = await addDoc(collection(db, 'user_feed', CURRENT_UID, 'posts'), {
      type: 'correction',
      text,
      tags,
      level: LEVEL,
      topicId: String(currentTopic.id),
      topicTitle: topicTitle || null,
      voiceUrl: voiceUrl || null,
      voicePath: voicePath || null,
      voiceContentType: voice?.type || null,
      voiceSize: voice ? Number(voice.size || 0) : null,
      createdAt: serverTimestamp(),
      authorUid: CURRENT_UID,
      authorName: authorName || 'Usuario',
      resolved: false,
      updatedAt: serverTimestamp(),
    });

    closeCorrectionModal();
    showToast('Publicado en la comunidad.', 'ok', 1800);
    setTimeout(() => {
      window.location.href = `correccion.html?uid=${encodeURIComponent(CURRENT_UID)}&post=${encodeURIComponent(ref.id)}`;
    }, 400);
  } catch (e) {
    console.warn('[correction] publish failed', e);
    setCorrectionMsg('No se pudo publicar.', true);
  } finally {
    if (btnCorrectionPublish) btnCorrectionPublish.disabled = false;
  }
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

function exerciseTagList(ex) {
  return normalizeTags(ex?.tags)
    .map((t) => normalizeTag(t).toLowerCase())
    .filter(Boolean);
}

function shouldSpeakChoiceOptions(ex, options = []) {
  const tags = exerciseTagList(ex);
  if (tags.includes('type:listen_choice') || tags.includes('type:listen_fill')) return false;
  const prompt = normalizeText(ex?.prompt || '');
  if (prompt.includes('traduccion en espanol') || prompt.includes('en espanol')) return false;
  if (tags.includes('type:choice')) return true;
  if (prompt.includes('en polaco') || prompt.includes('po polsku')) return true;

  const hasPolishHint =
    Array.isArray(options) &&
    options.some((opt) => {
      const lead = stripLeadLabel(opt);
      if (/^pl\s*:/i.test(lead)) return true;
      if (/^(?:es|en)\s*:/i.test(lead)) return false;
      const text = String(lead || '')
        .replace(/^(?:pl|tts_pl|tts)\s*:\s*/i, '')
        .trim();
      return /[ąćęłńśżź]/i.test(text) || /(?:rz|cz|sz|dż|dź)/i.test(text);
    });

  return !!hasPolishHint;
}

function sanitizeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  return u.replace(/[)\],.]+$/g, '');
}

function splitNotesParts(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .flatMap((line) => line.split('|'))
    .map((p) => p.trim())
    .filter(Boolean);
}

function stripNoteLabel(part) {
  const idx = String(part || '').indexOf(':');
  if (idx < 0) return '';
  return String(part || '')
    .slice(idx + 1)
    .trim();
}

function extractAudioUrl(ex) {
  const direct = String(ex?.audioUrl || ex?.audio || '').trim();
  if (/^https?:\/\//i.test(direct)) return sanitizeUrl(direct);

  const notes = String(ex?.notes || '').trim();
  if (!notes) return '';

  const m =
    notes.match(/(?:^|\s)AUDIO_URL\s*:\s*(https?:\/\/\S+)/i) ||
    notes.match(/(?:^|\s)AUDIO\s*:\s*(https?:\/\/\S+)/i) ||
    notes.match(/(?:^|\s)URL\s*:\s*(https?:\/\/\S+)/i);
  if (m && m[1]) return sanitizeUrl(m[1]);

  const any = notes.match(/https?:\/\/\S+/i);
  return any ? sanitizeUrl(any[0]) : '';
}

function extractTtsText(ex) {
  const direct = String(ex?.ttsText || '').trim();
  if (direct) return direct;
  const notes = String(ex?.notes || '').trim();
  if (!notes) return '';
  const parts = splitNotesParts(notes);
  const pl = parts.find((p) => /^tts_pl\s*:/i.test(p));
  if (pl) return stripNoteLabel(pl);
  const any = parts.find((p) => /^tts\s*:/i.test(p));
  if (any) return stripNoteLabel(any);
  return '';
}

function isCardsExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('tarjeta');
}

function isSpeakingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('repetir') ||
    t.includes('voz') ||
    t.includes('grab') ||
    t.includes('monologo') ||
    t.includes('dialogo') ||
    t.includes('entrevista') ||
    t.includes('historia') ||
    t.includes('debate') ||
    t.includes('mision') ||
    t.includes('rol')
  );
}

function isChoiceExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('opcion') ||
    t.includes('elegir') ||
    t.includes('elige') ||
    t.includes('eleccion') ||
    t.includes('verdadero') ||
    t.includes('falso') ||
    t.includes('quiz') ||
    t.includes('marcar')
  );
}

function isFillExercise(ex) {
  const t = normalizeText(ex?.type || '');
  const prompt = String(ex?.prompt || '');
  return (
    t.includes('rellenar') ||
    t.includes('completar') ||
    t.includes('dictado') ||
    t.includes('espacios') ||
    t.includes('preposicion') ||
    t.includes('terminacion') ||
    prompt.includes('___')
  );
}

function isListenExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('escuchar') || t.includes('audio') || t.includes('dictado');
}

function isTestExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return t.includes('test final');
}

function isMatchingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('relacionar') ||
    t.includes('unir') ||
    t.includes('emparejar') ||
    t.includes('pares') ||
    t.includes('matching') ||
    t.includes('match')
  );
}

function isOrderingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('ordenar') ||
    t.includes('orden') ||
    t.includes('secuencia') ||
    t.includes('ordenar la secuencia')
  );
}

function isWritingExercise(ex) {
  const t = normalizeText(ex?.type || '');
  return (
    t.includes('escribir') ||
    t.includes('respuesta') ||
    t.includes('responder') ||
    t.includes('describir') ||
    t.includes('decirlo de otra') ||
    t.includes('otra manera')
  );
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

function shuffleArray(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stripLeadLabel(raw) {
  return String(raw || '').replace(/^\s*([A-Z]|\d+)\s*[)\.:-]\s*/i, '').trim();
}

function parseMatchAnswerMap(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  const pairs = txt
    .split(/[,\n;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!pairs.length) return null;
  const map = {};
  pairs.forEach((p) => {
    const m = p.match(/^\s*([A-Z])\s*[-=]\s*(\d+)\s*$/i);
    if (!m) return;
    map[String(m[1] || '').toUpperCase()] = String(m[2] || '');
  });
  return Object.keys(map).length ? map : null;
}

function parseMatchPairs(options, answerRaw) {
  const lines = Array.isArray(options)
    ? options.map((o) => String(o || '').trim()).filter(Boolean)
    : [];
  if (!lines.length) return null;

  const left = [];
  const right = [];
  const derivedMap = {}; // leftLabel -> rightLabel

  let autoLetter = 0;
  let autoNum = 1;

  lines.forEach((line) => {
    const parts = line.split(/\s*(?:=|->|→|â€”|—)\s*/);
    if (parts.length < 2) return;

    const leftRaw = parts[0];
    const rightRaw = parts.slice(1).join(' - ');

    const lm = String(leftRaw).match(/^\s*([A-Z])\s*[)\.:-]\s*(.+)$/i);
    const rm = String(rightRaw).match(/^\s*(\d+)\s*[)\.:-]\s*(.+)$/i);

    const leftLabel = lm
      ? String(lm[1] || '').toUpperCase()
      : String.fromCharCode(65 + (autoLetter++ % 26));
    const leftText = stripLeadLabel(lm ? lm[2] : leftRaw);

    const rightLabel = rm ? String(rm[1] || '') : String(autoNum++);
    const rightText = stripLeadLabel(rm ? rm[2] : rightRaw);

    left.push({ label: leftLabel, text: leftText });
    right.push({ label: rightLabel, text: rightText });
    derivedMap[leftLabel] = rightLabel;
  });

  if (!left.length || !right.length) return null;

  const fromAnswer = parseMatchAnswerMap(answerRaw);
  const correctMap = fromAnswer || derivedMap;

  return {
    left,
    right: shuffleArray(right),
    correctMap,
  };
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

function makeOptionRow({ name, value, label, checked, onChange, ttsText = '' }) {
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
  const tts = makeSpeakerBtn(ttsText, { tiny: true });
  if (tts) row.appendChild(tts);
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
    const exId = String(ex.id);
    const done = progressState.doneIds.has(exId);

    const markDone = async () => {
      progressState.doneIds.add(exId);
      await saveProgress();
      setProgressUI();
    };

    if (isCardsExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Este ejercicio crea fichas. Usa el modo Fichas para practicar.';
      card.appendChild(hint);

      const params = `level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(currentTopic?.id || TOPIC_ID)}`;
      const open = document.createElement('a');
      open.className = 'btn-white-outline';
      open.href = `flashcards.html?${params}`;
      open.textContent = 'Abrir fichas';
      actions.appendChild(open);

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-white-outline';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;
      btnDone.addEventListener('click', async () => {
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
      });

      actions.appendChild(btnDone);
      card.appendChild(actions);
      return card;
    }

    if (isSpeakingExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Lee en voz alta. Escucha y luego graba tu voz.';
      card.appendChild(hint);

      const canRec = canRecordVoice();
      let recording = false;
      let recorder = null;
      let stream = null;
      let chunks = [];
      let objectUrl = '';
      let hasAudio = false;

      const btnListen = document.createElement('button');
      btnListen.className = 'ttsIconBtn';
      btnListen.type = 'button';
      btnListen.textContent = SPEAKER_ICON;
      btnListen.title = 'Odsłuchaj (PL)';
      btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
      btnListen.addEventListener('click', () => playExerciseAudio(ex));

      const btnRec = document.createElement('button');
      btnRec.className = 'btn-white-outline';
      btnRec.type = 'button';
      btnRec.textContent = 'Grabar voz';
      btnRec.disabled = done || !canRec;

      const btnClear = document.createElement('button');
      btnClear.className = 'btn-white-outline';
      btnClear.type = 'button';
      btnClear.textContent = 'Quitar voz';
      btnClear.style.display = 'none';
      btnClear.disabled = done;

      const audio = document.createElement('audio');
      audio.controls = true;
      audio.className = 'exerciseAudioPreview';
      audio.style.display = 'none';

      const cleanup = () => {
        try {
          stream?.getTracks?.()?.forEach((t) => t.stop());
        } catch {}
        stream = null;
        recorder = null;
        chunks = [];
        recording = false;
      };

      const clearAudio = () => {
        hasAudio = false;
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
        }
        objectUrl = '';
        try {
          audio.pause?.();
        } catch {}
        audio.removeAttribute('src');
        audio.style.display = 'none';
        btnClear.style.display = 'none';
      };

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-yellow';
      btnDone.type = 'button';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;

      btnDone.addEventListener('click', async () => {
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
        btnRec.disabled = true;
        btnClear.disabled = true;
        cleanup();
      });

      btnClear.addEventListener('click', () => {
        if (done) return;
        clearAudio();
      });

      btnRec.addEventListener('click', async () => {
        if (done) return;
        if (!canRec) {
          showToast('Tu navegador no soporta grabación.', 'warn', 2200);
          return;
        }

        if (recording) {
          try {
            recorder?.stop();
          } catch {}
          return;
        }

        try {
          clearAudio();
          cleanup();

          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          recorder = new MediaRecorder(stream);
          chunks = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
          };

          recorder.onstop = () => {
            recording = false;
            btnRec.textContent = 'Grabar voz';

            const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
            objectUrl = URL.createObjectURL(blob);
            audio.src = objectUrl;
            audio.style.display = 'block';
            btnClear.style.display = '';
            hasAudio = true;
            btnDone.disabled = false;

            cleanup();
          };

          recorder.start();
          recording = true;
          btnRec.textContent = 'Detener';
        } catch (e) {
          console.warn('[speaking] record failed', e);
          cleanup();
          showToast('No se pudo grabar.', 'bad', 2400);
        }
      });

      if (!canRec) {
        const warn = document.createElement('div');
        warn.className = 'hintSmall';
        warn.style.marginTop = '8px';
        warn.textContent = 'Grabación no disponible en este navegador.';
        card.appendChild(warn);
        btnDone.disabled = done;
      }

      actions.appendChild(btnListen);
      actions.appendChild(btnRec);
      actions.appendChild(btnClear);
      actions.appendChild(btnDone);
      card.appendChild(actions);
      card.appendChild(audio);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isChoiceExercise(ex) && options.length && String(ex.answer || '').trim()) {
      let selectedValue = '';
      let selectedLabel = '';

      const optsWrap = document.createElement('div');
      optsWrap.className = 'exerciseOptions';
      const groupName = `pr_${ex.id}`;
      const speakOptions = shouldSpeakChoiceOptions(ex, options);

      options.forEach((opt, idx) => {
        const label = optionLabelFromIndex(idx);
        const cleaned = cleanOptionText(opt);
        const optionText = cleaned ? `${label}) ${cleaned}` : `${label}) ${opt}`;
        const ttsText = speakOptions ? (cleaned || stripLeadLabel(opt)) : '';
        const row = makeOptionRow({
          name: groupName,
          value: cleaned || opt,
          label: optionText,
          checked: false,
          onChange: (ev) => {
            selectedValue = ev.target.value;
            selectedLabel = label;
          },
          ttsText,
        });
        if (done) {
          const input = row.querySelector('input[type="radio"]');
          if (input) input.disabled = true;
        }
        optsWrap.appendChild(row);
      });
      card.appendChild(optsWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const userAnswer = String(selectedValue || '').trim();
        if (!userAnswer) {
          showToast('Elige una respuesta.', 'warn', 1800);
          return;
        }

        const answers = parseAnswerList(ex.answer || '');
        const answerNorms = answers.map((a) => normalizeText(a));
        const answerNormsClean = answers.map((a) => normalizeText(cleanOptionText(a)));
        const userNorm = normalizeText(userAnswer);
        const labelNorm = normalizeText(selectedLabel || '');

        let correct = false;
        if (answerNorms.includes(userNorm) || answerNormsClean.includes(userNorm)) correct = true;
        if (
          !correct &&
          labelNorm &&
          (answerNorms.includes(labelNorm) || answerNormsClean.includes(labelNorm))
        ) {
          correct = true;
        }

        setResultText(resultEl, correct, correct ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);

        if (!correct) return;

        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
        optsWrap.querySelectorAll('input[type="radio"]').forEach((i) => (i.disabled = true));
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isFillExercise(ex) && String(ex.answer || '').trim()) {
      const promptText = String(ex.prompt || '');
      const blankInputs = [];
      let inputBox = null;

      if (promptText.includes('___')) {
        prompt.textContent = '';
        const parts = promptText.split('___');
        parts.forEach((part, idx) => {
          prompt.appendChild(document.createTextNode(part));
          if (idx === parts.length - 1) return;

          const inp = document.createElement('input');
          inp.className = 'exerciseInlineInput';
          inp.type = 'text';
          inp.placeholder = '...';
          inp.autocomplete = 'off';
          inp.spellcheck = false;
          inp.disabled = done;
          blankInputs.push(inp);
          prompt.appendChild(inp);
        });
      } else {
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.placeholder = 'Escribe tu respuesta...';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.disabled = done;
        inputBox = inp;
        blankInputs.push(inp);
        answerWrap.appendChild(inp);
        card.appendChild(answerWrap);
      }

      const ttsPrompt = String(promptText || '').replaceAll('___', '...').trim();
      const promptSpeakBtn = makeSpeakerBtn(ttsPrompt, { title: 'Odsłuchaj zdanie (PL)', tiny: true });
      if (promptSpeakBtn) {
        promptSpeakBtn.style.marginLeft = '8px';
        prompt.appendChild(promptSpeakBtn);
      }

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnCheck = document.createElement('button');
      btnCheck.className = 'btn-yellow';
      btnCheck.type = 'button';
      btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
      btnCheck.disabled = done;

      const parseExpected = (rawAnswer, blanksCount) => {
        const raw = String(rawAnswer || '').trim().replaceAll('/', '|');
        if (!raw) return [];
        if (raw.includes('||')) {
          return raw
            .split('||')
            .map((p) => parseAnswerList(p));
        }
        const list = parseAnswerList(raw);
        if (blanksCount <= 1) return [list];
        if (list.length === blanksCount) return list.map((x) => parseAnswerList(x));
        return Array.from({ length: blanksCount }, () => list);
      };

      btnCheck.addEventListener('click', async () => {
        if (done) return;
        const blanksCount = blankInputs.length || 1;
        const expectedByBlank = parseExpected(ex.answer || '', blanksCount);
        const values = blankInputs.map((i) => String(i.value || '').trim());

        if (values.some((v) => !v)) {
          showToast('Completa los espacios.', 'warn', 1800);
          return;
        }

        let ok = true;
        for (let i = 0; i < values.length; i += 1) {
          const accepted = expectedByBlank[i] || expectedByBlank[0] || [];
          const u = normalizeText(values[i]);
          const acc = accepted.map((x) => normalizeText(x));
          if (!acc.includes(u)) {
            ok = false;
            break;
          }
        }

        setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
        card.appendChild(resultEl);

        if (!ok) return;

        blankInputs.forEach((i) => (i.disabled = true));
        await markDone();
        btnCheck.textContent = 'Hecho';
        btnCheck.disabled = true;
      });

      actions.appendChild(btnCheck);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    if (isMatchingExercise(ex) && options.length) {
      const parsed = parseMatchPairs(options, ex.answer || '');
      if (!parsed) {
        // If we can't parse it, fall back to the simple done button below.
      } else {
        const leftItems = parsed.left;
        const rightItems = parsed.right;
        const correctMap = parsed.correctMap || {};

        let selectedLeft = '';
        let locked = done;
        const userMap = {}; // leftLabel -> rightLabel
        const rightToLeft = {}; // rightLabel -> leftLabel

        const grid = document.createElement('div');
        grid.className = 'exerciseMatchGrid';

        const colLeft = document.createElement('div');
        colLeft.className = 'exerciseMatchCol';
        const colRight = document.createElement('div');
        colRight.className = 'exerciseMatchCol';

        const leftBtns = new Map();
        const rightBtns = new Map();

        const renderState = () => {
          leftBtns.forEach((btn, label) => {
            const paired = userMap[label] || '';
            const isSelected = selectedLeft === label;
            btn.classList.toggle('isSelected', isSelected);
            btn.classList.toggle('isPaired', !!paired);
            const badge = btn.querySelector('.exerciseMatchBadge');
            if (badge) badge.textContent = paired ? `→ ${paired}` : '';
          });
          rightBtns.forEach((btn, label) => {
            const usedBy = rightToLeft[label] || '';
            btn.classList.toggle('isPaired', !!usedBy);
          });
        };

        const assignPair = (leftLabel, rightLabel) => {
          if (!leftLabel || !rightLabel) return;

          const prevRight = userMap[leftLabel] || '';
          if (prevRight && rightToLeft[prevRight] === leftLabel) {
            delete rightToLeft[prevRight];
          }

          const prevLeft = rightToLeft[rightLabel] || '';
          if (prevLeft && userMap[prevLeft] === rightLabel) {
            delete userMap[prevLeft];
          }

          userMap[leftLabel] = rightLabel;
          rightToLeft[rightLabel] = leftLabel;
          renderState();
        };

        const resetPairs = () => {
          selectedLeft = '';
          Object.keys(userMap).forEach((k) => delete userMap[k]);
          Object.keys(rightToLeft).forEach((k) => delete rightToLeft[k]);
          renderState();
        };

        leftItems.forEach((it) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-white-outline exerciseMatchBtn';
          btn.disabled = false;
          btn.innerHTML = `
            <div class="exerciseMatchBtnTop">
              <span class="exerciseMatchLabel">${safeText(it.label)})</span>
              <span class="exerciseMatchTools">
                <span class="exerciseMatchBadge"></span>
                <span class="ttsInlineIcon" role="button" tabindex="0" title="Odsłuchaj (PL)" aria-label="Odsłuchaj (PL)">${SPEAKER_ICON}</span>
              </span>
            </div>
            <div class="exerciseMatchText">${safeText(it.text)}</div>
          `;
          wireInlineSpeaker(btn.querySelector('.ttsInlineIcon'), it.text);
          btn.addEventListener('click', () => {
            if (locked) return;
            selectedLeft = selectedLeft === it.label ? '' : it.label;
            renderState();
          });
          leftBtns.set(it.label, btn);
          colLeft.appendChild(btn);
        });

        rightItems.forEach((it) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-white-outline exerciseMatchBtn';
          btn.disabled = false;
          btn.innerHTML = `
            <div class="exerciseMatchBtnTop">
              <span class="exerciseMatchLabel">${safeText(it.label)})</span>
            </div>
            <div class="exerciseMatchText">${safeText(it.text)}</div>
          `;
          btn.addEventListener('click', () => {
            if (locked) return;
            if (!selectedLeft) {
              showToast('Elige un elemento de la izquierda.', 'warn', 1600);
              return;
            }
            assignPair(selectedLeft, it.label);
            selectedLeft = '';
            renderState();
          });
          rightBtns.set(it.label, btn);
          colRight.appendChild(btn);
        });

        grid.appendChild(colLeft);
        grid.appendChild(colRight);
        card.appendChild(grid);

        const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
        if (wantsListen) {
          const btnListen = document.createElement('button');
          btnListen.className = 'ttsIconBtn';
          btnListen.type = 'button';
          btnListen.textContent = SPEAKER_ICON;
          btnListen.title = 'Odsłuchaj (PL)';
          btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
          btnListen.addEventListener('click', () => playExerciseAudio(ex));
          actions.appendChild(btnListen);
        }

        const btnReset = document.createElement('button');
        btnReset.className = 'btn-white-outline';
        btnReset.type = 'button';
        btnReset.textContent = 'Reiniciar';
        btnReset.disabled = done;
        btnReset.addEventListener('click', resetPairs);
        actions.appendChild(btnReset);

        const btnCheck = document.createElement('button');
        btnCheck.className = 'btn-yellow';
        btnCheck.type = 'button';
        btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
        btnCheck.disabled = done;

        btnCheck.addEventListener('click', async () => {
          if (locked) return;
          const needs = leftItems.length;
          const picked = Object.keys(userMap).length;
          if (picked < needs) {
            showToast('Completa todas las parejas.', 'warn', 1800);
            return;
          }

          let ok = true;
          for (const it of leftItems) {
            const expected = String(correctMap[it.label] || '').trim();
            const got = String(userMap[it.label] || '').trim();
            if (!expected || expected !== got) {
              ok = false;
              break;
            }
          }

          setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
          card.appendChild(resultEl);
          if (!ok) return;

          locked = true;
          await markDone();
          btnCheck.textContent = 'Hecho';
          btnCheck.disabled = true;
          btnReset.disabled = true;
        });

        actions.appendChild(btnCheck);
        card.appendChild(actions);

        if (done) {
          setResultText(resultEl, true, 'Hecho.');
          card.appendChild(resultEl);
        } else {
          renderState();
        }

        return card;
      }
    }

    if (isOrderingExercise(ex) && options.length && String(ex.answer || '').trim()) {
      const rawTokens = options.map((o) => stripLeadLabel(o)).filter(Boolean);
      if (!rawTokens.length) {
        // fall back below
      } else {
        const tokens = shuffleArray(rawTokens.map((t, idx) => ({ id: String(idx), text: t })));
        const selected = [];
        const available = new Map(tokens.map((t) => [t.id, t]));

        const wrap = document.createElement('div');
        wrap.className = 'exerciseOrderWrap';

        const built = document.createElement('div');
        built.className = 'exerciseOrderBuilt';
        built.textContent = '';

        const bank = document.createElement('div');
        bank.className = 'exerciseOrderBank';

        const render = () => {
          const sentence = selected.map((t) => t.text).join(' ').replace(/\s+([?.!,;:])/g, '$1');
          built.innerHTML = '';
          const builtText = document.createElement('span');
          builtText.textContent = sentence || '—';
          built.appendChild(builtText);
          if (sentence) {
            const speakBtn = makeSpeakerBtn(sentence, { title: 'Odsłuchaj zdanie (PL)', tiny: true });
            if (speakBtn) {
              speakBtn.style.marginLeft = '8px';
              built.appendChild(speakBtn);
            }
          }

          bank.innerHTML = '';
          tokens.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-white-outline exerciseOrderToken';
            btn.innerHTML = '';
            const tokenText = document.createElement('span');
            tokenText.textContent = t.text;
            btn.appendChild(tokenText);
            const sp = document.createElement('span');
            sp.className = 'ttsInlineIcon';
            sp.setAttribute('role', 'button');
            sp.setAttribute('tabindex', '0');
            sp.title = 'Odsłuchaj (PL)';
            sp.setAttribute('aria-label', 'Odsłuchaj (PL)');
            sp.textContent = SPEAKER_ICON;
            wireInlineSpeaker(sp, t.text);
            btn.appendChild(sp);

            const isAvailable = available.has(t.id);
            btn.classList.toggle('isDisabled', done || !isAvailable);
            btn.addEventListener('click', () => {
              if (done) return;
              if (!available.has(t.id)) return;
              available.delete(t.id);
              selected.push(t);
              render();
            });
            bank.appendChild(btn);
          });
        };

        const reset = () => {
          if (done) return;
          selected.length = 0;
          available.clear();
          tokens.forEach((t) => available.set(t.id, t));
          render();
        };

        const undo = () => {
          if (done) return;
          const last = selected.pop();
          if (last) available.set(last.id, last);
          render();
        };

        const labelBuilt = document.createElement('div');
        labelBuilt.className = 'exerciseHint';
        labelBuilt.textContent = 'Construye la frase:';
        wrap.appendChild(labelBuilt);
        wrap.appendChild(built);

        const labelBank = document.createElement('div');
        labelBank.className = 'exerciseHint';
        labelBank.style.marginTop = '10px';
        labelBank.textContent = 'Palabras:';
        wrap.appendChild(labelBank);
        wrap.appendChild(bank);

        card.appendChild(wrap);

        const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
        if (wantsListen) {
          const btnListen = document.createElement('button');
          btnListen.className = 'ttsIconBtn';
          btnListen.type = 'button';
          btnListen.textContent = SPEAKER_ICON;
          btnListen.title = 'Odsłuchaj (PL)';
          btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
          btnListen.addEventListener('click', () => playExerciseAudio(ex));
          actions.appendChild(btnListen);
        }

        const btnUndo = document.createElement('button');
        btnUndo.className = 'btn-white-outline';
        btnUndo.type = 'button';
        btnUndo.textContent = 'Borrar \u00faltima';
        btnUndo.disabled = done;
        btnUndo.addEventListener('click', undo);
        actions.appendChild(btnUndo);

        const btnReset = document.createElement('button');
        btnReset.className = 'btn-white-outline';
        btnReset.type = 'button';
        btnReset.textContent = 'Reiniciar';
        btnReset.disabled = done;
        btnReset.addEventListener('click', reset);
        actions.appendChild(btnReset);

        const btnCheck = document.createElement('button');
        btnCheck.className = 'btn-yellow';
        btnCheck.type = 'button';
        btnCheck.textContent = done ? 'Hecho' : 'Comprobar';
        btnCheck.disabled = done;

        btnCheck.addEventListener('click', async () => {
          if (done) return;
          if (!selected.length) {
            showToast('Ordena la frase primero.', 'warn', 1800);
            return;
          }
          const sentence = selected.map((t) => t.text).join(' ').replace(/\s+([?.!,;:])/g, '$1');
          const accepted = parseAnswerList(ex.answer || '').map((x) => normalizeText(x));
          const got = normalizeText(sentence);
          const ok = accepted.length ? accepted.includes(got) : got === normalizeText(ex.answer || '');

          setResultText(resultEl, ok, ok ? 'Correcto.' : 'Intenta de nuevo.');
          card.appendChild(resultEl);
          if (!ok) return;

          await markDone();
          btnCheck.textContent = 'Hecho';
          btnCheck.disabled = true;
          btnUndo.disabled = true;
          btnReset.disabled = true;
          render();
        });

        actions.appendChild(btnCheck);
        card.appendChild(actions);

        if (done) {
          setResultText(resultEl, true, 'Hecho.');
          card.appendChild(resultEl);
        }

        render();
        return card;
      }
    }

    if (isWritingExercise(ex)) {
      const hint = document.createElement('div');
      hint.className = 'exerciseHint';
      hint.textContent = 'Escribe tu respuesta. Luego marca hecho.';
      card.appendChild(hint);

      const box = document.createElement('textarea');
      box.className = 'input';
      box.rows = 3;
      box.placeholder = 'Escribe aquí...';
      box.autocomplete = 'off';
      box.spellcheck = true;
      box.disabled = done;
      answerWrap.appendChild(box);
      card.appendChild(answerWrap);

      const wantsListen = isListenExercise(ex) || !!extractAudioUrl(ex);
      if (wantsListen) {
        const btnListen = document.createElement('button');
        btnListen.className = 'ttsIconBtn';
        btnListen.type = 'button';
        btnListen.textContent = SPEAKER_ICON;
        btnListen.title = 'Odsłuchaj (PL)';
        btnListen.setAttribute('aria-label', 'Odsłuchaj (PL)');
        btnListen.addEventListener('click', () => playExerciseAudio(ex));
        actions.appendChild(btnListen);
      }

      const btnDone = document.createElement('button');
      btnDone.className = 'btn-yellow';
      btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
      btnDone.disabled = done;

      btnDone.addEventListener('click', async () => {
        if (done) return;
        const val = String(box.value || '').trim();
        if (!val) {
          showToast('Escribe una respuesta primero.', 'warn', 1800);
          return;
        }
        box.disabled = true;
        await markDone();
        btnDone.textContent = 'Hecho';
        btnDone.disabled = true;
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      });

      actions.appendChild(btnDone);
      card.appendChild(actions);

      if (done) {
        setResultText(resultEl, true, 'Hecho.');
        card.appendChild(resultEl);
      }

      return card;
    }

    // fallback: simple done
    const btnDone = document.createElement('button');
    btnDone.className = 'btn-white-outline';
    btnDone.textContent = done ? 'Hecho' : 'Marcar hecho';
    btnDone.disabled = done;

    btnDone.addEventListener('click', async () => {
      await markDone();
      btnDone.textContent = 'Hecho';
      btnDone.disabled = true;
    });

    actions.appendChild(btnDone);
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
    btnLesson.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(currentTopic.id)}${navParams()}`;
  if (btnCourse)
    btnCourse.href = courseHref(LEVEL);
  if (btnPanel) btnPanel.href = 'espanel.html';

  const close = () => {
    modal.style.display = 'none';
  };

  if (btnFinishCorrection) {
    btnFinishCorrection.disabled = false;
    btnFinishCorrection.onclick = () => {
      close();
      openCorrectionModal();
    };
  }

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

  if (correctionModal && !correctionModal.dataset.wired) {
    correctionModal.dataset.wired = '1';
    btnCorrectionClose?.addEventListener('click', closeCorrectionModal);
    btnCorrectionCancel?.addEventListener('click', closeCorrectionModal);
    btnCorrectionPublish?.addEventListener('click', publishCorrectionRequest);
    btnCorrectionRecord?.addEventListener('click', toggleCorrectionRecording);
    btnCorrectionClearAudio?.addEventListener('click', () => clearCorrectionAudio());
    correctionModal.addEventListener('click', (e) => {
      if (e.target === correctionModal) closeCorrectionModal();
    });
  }

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
        const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
        pillLessonLink.href = url;
        if (btnBackLesson) btnBackLesson.href = url;
      }
      if (btnReview && topic.id) {
        btnReview.href = `review.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
      }
      if (btnFlashcards && topic.id) {
        btnFlashcards.href = `flashcards.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topic.id)}${navParams()}`;
      }
    if (btnBackCourse) {
      btnBackCourse.href = courseHref(LEVEL);
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
