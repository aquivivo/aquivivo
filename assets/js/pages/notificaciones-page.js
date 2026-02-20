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
const btnFilterUnread = $('btnNotifFilterUnread');
const btnFilterAll = $('btnNotifFilterAll');

const PAGE_SIZE = 20;

let currentUid = null;
let lastSnap = null;
let loading = false;
let showUnreadOnly = true;
let loadedItems = [];

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
    return new Intl.DateTimeFormat('es-ES', {
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

function setFilterUI() {
  btnFilterUnread?.classList.toggle('is-active', showUnreadOnly);
  btnFilterAll?.classList.toggle('is-active', !showUnreadOnly);
}

function getVisibleItems() {
  const base = loadedItems
    .filter((entry) => String(entry?.data?.type || '').toLowerCase() !== 'broadcast')
    .sort((a, b) => {
      const aTime = toDateMaybe(a?.data?.createdAt)?.getTime() || 0;
      const bTime = toDateMaybe(b?.data?.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });

  if (!showUnreadOnly) return base;
  return base.filter((entry) => entry?.data?.read !== true);
}

function updateHintForList(visibleItems) {
  if (!hintEl) return;
  if (!loadedItems.length) {
    hintEl.textContent = 'Aun no hay notificaciones.';
    return;
  }
  if (!visibleItems.length && showUnreadOnly) {
    hintEl.textContent = 'No tienes notificaciones no leídas.';
    return;
  }
  hintEl.textContent = '';
}

function renderList() {
  if (!listEl) return;
  const visibleItems = getVisibleItems();
  listEl.innerHTML = '';

  updateHintForList(visibleItems);
  if (!visibleItems.length) return;

  visibleItems.forEach((entry) => {
    const item = entry.data || {};
    const title = String(item.title || 'Notificacion');
    const body = String(item.body || '');
    const dateText = formatDate(item.createdAt);
    const href = String(item.link || '').trim();
    const isUnread = item.read !== true;

    const row = document.createElement(href ? 'a' : 'div');
    row.className = `inboxItem ${isUnread ? 'is-unread' : ''}`;
    row.dataset.id = entry.id;
    if (href) row.setAttribute('href', href);

    row.innerHTML = `
      <div class="inboxTitle">${esc(title)}</div>
      ${body ? `<div class="inboxBody">${esc(body)}</div>` : ''}
      ${dateText ? `<div class="inboxDate">${esc(dateText)}</div>` : ''}
    `;

    listEl.appendChild(row);
  });
}

function mergeLoadedItems(items) {
  const map = new Map(loadedItems.map((entry) => [entry.id, entry]));
  (items || []).forEach((entry) => {
    map.set(entry.id, entry);
  });
  loadedItems = Array.from(map.values());
}

function updateLoadedReadState(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const idSet = new Set(ids);
  loadedItems = loadedItems.map((entry) => {
    if (!idSet.has(entry.id)) return entry;
    return {
      ...entry,
      data: {
        ...(entry.data || {}),
        read: true,
      },
    };
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

  updateLoadedReadState(unread.map((s) => s.id));
  renderList();
}

async function loadPage({ reset = false } = {}) {
  if (!currentUid || loading) return;
  loading = true;
  try {
    if (hintEl) hintEl.textContent = reset ? 'Cargando...' : '';
    if (btnMore) btnMore.disabled = true;
    if (reset) {
      lastSnap = null;
      loadedItems = [];
    }

    const parts = [
      collection(db, 'user_notifications', currentUid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (lastSnap) parts.push(startAfter(lastSnap));

    const snap = await getDocs(query(...parts));
    const docs = snap.docs || [];
    const rows = docs
      .filter((d) => String((d.data() || {}).type || '').toLowerCase() !== 'broadcast')
      .map((d) => ({ id: d.id, data: d.data() || {} }));

    mergeLoadedItems(rows);
    renderList();

    lastSnap = docs.length ? docs[docs.length - 1] : lastSnap;
    if (btnMore) btnMore.hidden = docs.length < PAGE_SIZE;
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

if (btnFilterUnread && !btnFilterUnread.dataset.wired) {
  btnFilterUnread.dataset.wired = '1';
  btnFilterUnread.addEventListener('click', () => {
    showUnreadOnly = true;
    setFilterUI();
    renderList();
  });
}

if (btnFilterAll && !btnFilterAll.dataset.wired) {
  btnFilterAll.dataset.wired = '1';
  btnFilterAll.addEventListener('click', () => {
    showUnreadOnly = false;
    setFilterUI();
    renderList();
  });
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
      updateLoadedReadState([id]);
      renderList();
    } catch {}
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid || null;
  setFilterUI();
  if (!currentUid) {
    if (hintEl) hintEl.textContent = 'Inicia sesión para ver tus notificaciones.';
    if (btnMore) btnMore.hidden = true;
    if (btnMarkRead) btnMarkRead.hidden = true;
    loadedItems = [];
    if (listEl) listEl.innerHTML = '';
    return;
  }

  if (btnMarkRead) btnMarkRead.hidden = false;
  await loadPage({ reset: true });
});
