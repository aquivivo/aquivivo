import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const hintEl = $('notifHint');
const listEl = $('notifList');
const btnMarkRead = $('btnNotifMarkRead');
const btnMore = $('btnNotifMore');

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

  docs.forEach((snap) => {
    const item = snap.data() || {};
    const title = String(item.title || 'NotificaciÃ³n');
    const body = String(item.body || '');
    const dateText = formatDate(item.createdAt);
    const href = String(item.link || '').trim();
    const isUnread = item.read !== true;

    const row = document.createElement(href ? 'a' : 'div');
    row.className = `inboxItem ${isUnread ? 'is-unread' : ''}`;
    row.dataset.id = snap.id;
    if (href) row.setAttribute('href', href);

    row.innerHTML = `
      <div class="inboxTitle">${esc(title)}</div>
      ${body ? `<div class="inboxBody">${esc(body)}</div>` : ''}
      ${dateText ? `<div class="inboxDate">${esc(dateText)}</div>` : ''}
    `;

    listEl.appendChild(row);
  });
}

async function markSnapshotsRead(snaps) {
  if (!currentUid) return;
  const unread = (snaps || []).filter((s) => (s.data() || {}).read !== true);
  if (!unread.length) return;

  const batch = writeBatch(db);
  unread.forEach((s) => {
    batch.update(s.ref, {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  // Update UI immediately
  if (listEl) {
    unread.forEach((s) => {
      const el = listEl.querySelector(`[data-id="${s.id}"]`);
      if (el) el.classList.remove('is-unread');
    });
  }
}

async function loadPage({ reset = false } = {}) {
  if (!currentUid || loading) return;
  loading = true;
  try {
    if (hintEl) hintEl.textContent = reset ? 'Cargando...' : '';
    if (btnMore) btnMore.disabled = true;
    if (reset) lastSnap = null;

    const parts = [
      collection(db, 'user_notifications', currentUid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (lastSnap) parts.push(startAfter(lastSnap));

    const snap = await getDocs(query(...parts));
    const docs = snap.docs || [];

    if (!docs.length && !lastSnap) {
      if (hintEl) hintEl.textContent = 'Aun no hay notificaciones.';
      if (btnMore) btnMore.hidden = true;
      return;
    }

    if (hintEl) hintEl.textContent = '';
    renderItems(docs, { append: !reset && !!lastSnap });

    lastSnap = docs.length ? docs[docs.length - 1] : lastSnap;
    if (btnMore) btnMore.hidden = docs.length < PAGE_SIZE;

    // Mark the loaded page as read (so the badge clears)
    await markSnapshotsRead(docs);
  } catch (e) {
    console.warn('[notificaciones] load failed', e);
    if (hintEl) hintEl.textContent = 'No se pudieron cargar las notificaciones.';
  } finally {
    loading = false;
    if (btnMore) btnMore.disabled = false;
  }
}

async function markRecentRead() {
  if (!currentUid) return;
  if (btnMarkRead) btnMarkRead.disabled = true;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'user_notifications', currentUid, 'items'),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
    );
    await markSnapshotsRead(snap.docs || []);
  } catch (e) {
    console.warn('[notificaciones] mark read failed', e);
  } finally {
    if (btnMarkRead) btnMarkRead.disabled = false;
  }
}

if (btnMore && !btnMore.dataset.wired) {
  btnMore.dataset.wired = '1';
  btnMore.addEventListener('click', () => loadPage({ reset: false }));
}

if (btnMarkRead && !btnMarkRead.dataset.wired) {
  btnMarkRead.dataset.wired = '1';
  btnMarkRead.addEventListener('click', markRecentRead);
}

if (listEl && !listEl.dataset.wired) {
  listEl.dataset.wired = '1';
  listEl.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    const id = row?.dataset?.id;
    if (!id || !currentUid) return;
    try {
      await updateDoc(doc(db, 'user_notifications', currentUid, 'items', id), {
        read: true,
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      row.classList.remove('is-unread');
    } catch {}
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid || null;
  if (!currentUid) {
    if (hintEl) hintEl.textContent = 'Inicia sesiÃ³n para ver tus notificaciones.';
    if (btnMore) btnMore.hidden = true;
    if (btnMarkRead) btnMarkRead.hidden = true;
    if (listEl) listEl.innerHTML = '';
    return;
  }

  if (btnMarkRead) btnMarkRead.hidden = false;
  await loadPage({ reset: true });
});

