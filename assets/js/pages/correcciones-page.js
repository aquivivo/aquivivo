import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const hintEl = $('corrListHint');
const listEl = $('corrList');
const btnMore = $('btnCorrMore');

const PAGE_SIZE = 20;

let currentUid = null;
let lastSnap = null;
let loading = false;

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

function renderItems(docs, { append = false } = {}) {
  if (!listEl) return;
  if (!append) listEl.innerHTML = '';

  if (!listEl.classList.contains('inboxList')) listEl.classList.add('inboxList');

  (docs || []).forEach((snap) => {
    const item = snap.data() || {};
    const ownerUid = String(item.ownerUid || '').trim();
    const ownerName = String(item.ownerName || 'Usuario').trim();
    const level = String(item.level || '').trim();
    const topicTitle = String(item.topicTitle || '').trim();
    const snippet = String(item.snippet || item.text || '').trim();
    const dateText = formatDate(item.createdAt);
    const resolved = item.resolved === true;
    const hasVoice = item.hasVoice === true;

    const title = `${ownerName}${level ? ` · ${level}` : ''}${topicTitle ? ` · ${topicTitle}` : ''}`;
    const body = snippet ? (snippet.length > 160 ? `${snippet.slice(0, 160)}…` : snippet) : '';
    const meta = [
      resolved ? 'Resuelto' : '',
      hasVoice ? 'Voz' : '',
      dateText ? dateText : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const href = `correccion.html?uid=${encodeURIComponent(ownerUid)}&post=${encodeURIComponent(snap.id)}`;

    const row = document.createElement('a');
    row.className = 'inboxItem';
    row.setAttribute('href', href);
    row.innerHTML = `
      <div class="inboxTitle">${esc(title)}</div>
      ${body ? `<div class="inboxBody">${esc(body)}</div>` : ''}
      ${meta ? `<div class="inboxDate">${esc(meta)}</div>` : ''}
    `;

    listEl.appendChild(row);
  });
}

async function loadPage({ reset = false } = {}) {
  if (loading) return;
  loading = true;
  try {
    if (hintEl) hintEl.textContent = reset ? 'Cargando...' : '';
    if (btnMore) btnMore.disabled = true;
    if (reset) lastSnap = null;

    const parts = [
      collection(db, 'community_corrections'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (lastSnap) parts.push(startAfter(lastSnap));

    const snap = await getDocs(query(...parts));
    const docs = snap.docs || [];

    if (!docs.length && !lastSnap) {
      if (hintEl) hintEl.textContent = 'Aún no hay solicitudes.';
      if (btnMore) btnMore.hidden = true;
      return;
    }

    if (hintEl) hintEl.textContent = '';
    renderItems(docs, { append: !reset && !!lastSnap });

    lastSnap = docs.length ? docs[docs.length - 1] : lastSnap;
    if (btnMore) btnMore.hidden = docs.length < PAGE_SIZE;
  } catch (e) {
    console.warn('[correcciones] load failed', e);
    if (hintEl) hintEl.textContent = 'No se pudieron cargar correcciones.';
  } finally {
    loading = false;
    if (btnMore) btnMore.disabled = false;
  }
}

if (btnMore && !btnMore.dataset.wired) {
  btnMore.dataset.wired = '1';
  btnMore.addEventListener('click', () => loadPage({ reset: false }));
}

onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid || null;
  if (!currentUid) {
    if (hintEl) hintEl.textContent = 'Inicia sesión para ver la comunidad.';
    if (btnMore) btnMore.hidden = true;
    if (listEl) listEl.innerHTML = '';
    return;
  }

  await loadPage({ reset: true });
});

