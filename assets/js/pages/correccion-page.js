import { auth, db, storage } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const OWNER_UID = String(qs.get('uid') || '').trim();
const POST_ID = String(qs.get('post') || '').trim();

const subtitleEl = $('corrSubtitle');
const postHost = $('corrPost');
const profileLink = $('corrProfileLink');
const resolveBtn = $('corrResolveBtn');
const postMsg = $('corrPostMsg');

const commentsHint = $('corrCommentsHint');
const commentsList = $('corrCommentsList');

const commentText = $('corrCommentText');
const btnSend = $('corrCommentSend');
const commentMsg = $('corrCommentMsg');

const btnRecord = $('corrCommentRecord');
const btnClearAudio = $('corrCommentClearAudio');
const audioPreview = $('corrCommentAudioPreview');

let CURRENT_USER = null;
let CURRENT_POST = null;
let commentsUnsub = null;

let recorder = null;
let recording = false;
let stream = null;
let chunks = [];
let audioFile = null;
let audioObjectUrl = '';

function esc(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toDateMaybe(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return null;
}

function formatDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function setPostMsg(text, bad = false) {
  if (!postMsg) return;
  postMsg.textContent = text || '';
  postMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function setCommentMsg(text, bad = false) {
  if (!commentMsg) return;
  commentMsg.textContent = text || '';
  commentMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function clearAudio({ stopRecording = true } = {}) {
  if (stopRecording && recording) {
    try {
      recorder?.stop();
    } catch {}
    recording = false;
  }

  try {
    stream?.getTracks?.()?.forEach((t) => t.stop());
  } catch {}

  stream = null;
  recorder = null;
  chunks = [];
  audioFile = null;

  if (audioObjectUrl) {
    try {
      URL.revokeObjectURL(audioObjectUrl);
    } catch {}
  }
  audioObjectUrl = '';

  if (audioPreview) {
    try {
      audioPreview.pause?.();
    } catch {}
    audioPreview.removeAttribute('src');
    audioPreview.style.display = 'none';
  }

  if (btnClearAudio) btnClearAudio.style.display = 'none';
  if (btnRecord) btnRecord.textContent = 'Grabar voz';
}

function canRecord() {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
}

async function toggleRecording() {
  if (!btnRecord) return;
  if (!canRecord()) {
    setCommentMsg('Tu navegador no soporta grabación.', true);
    return;
  }

  if (recording) {
    try {
      recorder?.stop();
    } catch {}
    recording = false;
    btnRecord.textContent = 'Grabar voz';
    return;
  }

  try {
    clearAudio({ stopRecording: false });
    setCommentMsg('');

    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream = s;
    recorder = new MediaRecorder(s);
    chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
      audioFile = new File([blob], `comment_${Date.now()}.webm`, { type: blob.type });

      if (audioObjectUrl) {
        try {
          URL.revokeObjectURL(audioObjectUrl);
        } catch {}
      }
      audioObjectUrl = URL.createObjectURL(blob);
      if (audioPreview) {
        audioPreview.src = audioObjectUrl;
        audioPreview.style.display = 'block';
      }
      if (btnClearAudio) btnClearAudio.style.display = '';

      try {
        stream?.getTracks?.()?.forEach((t) => t.stop());
      } catch {}
      stream = null;
      recorder = null;
      chunks = [];
    };

    recorder.start();
    recording = true;
    btnRecord.textContent = 'Detener';
  } catch (e) {
    console.warn('[correccion] record failed', e);
    clearAudio();
    setCommentMsg('No se pudo grabar.', true);
  }
}

async function getDisplayName(uid, email) {
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

function renderPost(post, ownerUid) {
  if (!postHost) return;
  const author = String(post.authorName || 'Usuario');
  const dateText = formatDate(post.createdAt);
  const body = esc(String(post.text || '')).replace(/\n/g, '<br />');
  const level = String(post.level || '').trim();
  const topicTitle = String(post.topicTitle || '').trim();
  const resolved = post.resolved === true;
  const voiceUrl = String(post.voiceUrl || '').trim();

  const meta = [
    level ? `Nivel ${level}` : '',
    topicTitle ? `Tema: ${topicTitle}` : '',
    resolved ? 'Resuelto' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  postHost.innerHTML = `
    <div class="post-card post-card--correction">
      <div class="post-head">
        <div class="post-title">${esc(author)}</div>
        <div class="post-time">${esc(dateText)}</div>
      </div>
      <div class="post-body">${body}</div>
      ${
        voiceUrl
          ? `<div style="margin-top:12px"><audio controls style="width:100%" src="${esc(voiceUrl)}"></audio></div>`
          : ''
      }
      ${meta ? `<div class="post-meta" style="margin-top:10px"><span>${esc(meta)}</span></div>` : ''}
    </div>
  `;

  if (subtitleEl) {
    subtitleEl.textContent = `${level ? `Nivel ${level}` : 'Comunidad'}${topicTitle ? ` · ${topicTitle}` : ''}`;
  }

  if (profileLink) {
    profileLink.href = `perfil.html?uid=${encodeURIComponent(ownerUid)}`;
  }
}

function renderComments(list) {
  if (!commentsList) return;
  commentsList.innerHTML = '';

  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    if (commentsHint) commentsHint.textContent = 'Aún no hay respuestas.';
    return;
  }

  if (commentsHint) commentsHint.textContent = '';

  items.forEach((c) => {
    const wrap = document.createElement('div');
    wrap.className = 'comment-item';
    const dateText = formatDate(c.createdAt);
    const voiceUrl = String(c.voiceUrl || '').trim();
    const body = esc(String(c.text || '')).replace(/\n/g, '<br />');

    wrap.innerHTML = `
      <div class="comment-meta">
        <span>${esc(c.authorName || 'Usuario')}</span>
        <span>${esc(dateText)}</span>
      </div>
      ${body ? `<div class="comment-text">${body}</div>` : ''}
      ${voiceUrl ? `<audio controls style="width:100%; margin-top:10px" src="${esc(voiceUrl)}"></audio>` : ''}
    `;
    commentsList.appendChild(wrap);
  });
}

async function loadPostAndComments() {
  if (!OWNER_UID || !POST_ID) {
    if (subtitleEl) subtitleEl.textContent = 'Enlace incompleto.';
    if (postHost) postHost.innerHTML = '<div class="muted">Falta uid o post.</div>';
    if (btnSend) btnSend.disabled = true;
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'user_feed', OWNER_UID, 'posts', POST_ID));
    if (!snap.exists()) {
      if (subtitleEl) subtitleEl.textContent = 'No encontrado.';
      if (postHost) postHost.innerHTML = '<div class="muted">Esta solicitud ya no existe.</div>';
      if (btnSend) btnSend.disabled = true;
      return;
    }

    const post = { id: snap.id, ...(snap.data() || {}) };
    if (String(post.type || '') !== 'correction') {
      if (subtitleEl) subtitleEl.textContent = 'No es una corrección.';
      if (postHost) postHost.innerHTML = '<div class="muted">Este post no es una solicitud de corrección.</div>';
      if (btnSend) btnSend.disabled = true;
      return;
    }

    CURRENT_POST = post;
    renderPost(post, OWNER_UID);

    const isOwner = CURRENT_USER?.uid && CURRENT_USER.uid === OWNER_UID;
    if (resolveBtn) {
      resolveBtn.style.display = isOwner ? '' : 'none';
      resolveBtn.textContent = post.resolved ? 'Reabrir' : 'Marcar resuelto';
      resolveBtn.onclick = async () => {
        if (!isOwner) return;
        try {
          resolveBtn.disabled = true;
          setPostMsg('Guardando...');
          const next = post.resolved !== true;
          await updateDoc(doc(db, 'user_feed', OWNER_UID, 'posts', POST_ID), {
            resolved: next,
            resolvedAt: next ? serverTimestamp() : null,
            updatedAt: serverTimestamp(),
          });
          post.resolved = next;
          resolveBtn.textContent = next ? 'Reabrir' : 'Marcar resuelto';
          setPostMsg('Listo.');
          setTimeout(() => setPostMsg(''), 1200);
        } catch (e) {
          console.warn('[correccion] resolve failed', e);
          setPostMsg('No se pudo actualizar.', true);
        } finally {
          resolveBtn.disabled = false;
        }
      };
    }
  } catch (e) {
    console.warn('[correccion] load post failed', e);
    if (subtitleEl) subtitleEl.textContent = 'Error al cargar.';
    if (postHost) postHost.innerHTML = '<div class="muted">No se pudo cargar.</div>';
    if (btnSend) btnSend.disabled = true;
    return;
  }

  if (commentsUnsub) commentsUnsub();
  const q = query(
    collection(db, 'user_feed', OWNER_UID, 'posts', POST_ID, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(200),
  );
  commentsUnsub = onSnapshot(
    q,
    (snap) => {
      const list = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderComments(list);
    },
    (err) => {
      console.warn('[correccion] comments snapshot failed', err);
      if (commentsHint) commentsHint.textContent = 'No se pudieron cargar respuestas.';
    },
  );
}

async function sendComment() {
  if (!CURRENT_USER || !OWNER_UID || !POST_ID) return;
  if (btnSend?.disabled) return;
  if (recording) {
    setCommentMsg('Detén la grabación primero.', true);
    return;
  }

  const text = String(commentText?.value || '').trim();
  const voice = audioFile;
  if (!text && !voice) {
    setCommentMsg('Escribe algo o graba voz.', true);
    return;
  }
  if (text.length > 2200) {
    setCommentMsg('Texto demasiado largo (máx. 2200 caracteres).', true);
    return;
  }

  try {
    if (btnSend) btnSend.disabled = true;
    setCommentMsg('Enviando...');

    const authorName = await getDisplayName(CURRENT_USER.uid, CURRENT_USER.email);

    let voiceUrl = '';
    let voicePath = '';
    if (voice) {
      const MAX_VOICE_BYTES = 10 * 1024 * 1024;
      if (voice.size > MAX_VOICE_BYTES) {
        setCommentMsg('Audio demasiado grande (máx. 10MB).', true);
        return;
      }
      const safeName = String(voice.name || 'voice').replace(/[^\w.\-]+/g, '_');
      const path = `audio/corrections/${CURRENT_USER.uid}/${Date.now()}_${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, voice);
      voiceUrl = await getDownloadURL(fileRef);
      voicePath = path;
    }

    await addDoc(collection(db, 'user_feed', OWNER_UID, 'posts', POST_ID, 'comments'), {
      authorUid: CURRENT_USER.uid,
      authorName: authorName || 'Usuario',
      text: text || '',
      voiceUrl: voiceUrl || null,
      voicePath: voicePath || null,
      voiceContentType: voice?.type || null,
      voiceSize: voice ? Number(voice.size || 0) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (commentText) commentText.value = '';
    clearAudio();
    setCommentMsg('Listo.');
    setTimeout(() => setCommentMsg(''), 1200);
  } catch (e) {
    console.warn('[correccion] send failed', e);
    setCommentMsg('No se pudo enviar.', true);
  } finally {
    if (btnSend) btnSend.disabled = false;
  }
}

if (btnRecord && !btnRecord.dataset.wired) {
  btnRecord.dataset.wired = '1';
  btnRecord.addEventListener('click', toggleRecording);
}
if (btnClearAudio && !btnClearAudio.dataset.wired) {
  btnClearAudio.dataset.wired = '1';
  btnClearAudio.addEventListener('click', () => clearAudio());
}
if (btnSend && !btnSend.dataset.wired) {
  btnSend.dataset.wired = '1';
  btnSend.addEventListener('click', sendComment);
}

onAuthStateChanged(auth, async (user) => {
  CURRENT_USER = user || null;
  if (!CURRENT_USER) {
    window.location.href = 'login.html';
    return;
  }
  if (btnRecord) btnRecord.disabled = !canRecord();
  await loadPostAndComments();
});

