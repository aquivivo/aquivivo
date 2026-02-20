import { db } from './firebase-init.js';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

let currentUid = '';
let currentName = 'Usuario';
let convUnsub = null;
const msgUnsubs = new Map();
const openWindows = new Map();
let conversations = [];
let dockOutsideWired = false;
let headerQuickOpenWired = false;

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function toDateMaybe(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(v) {
  const d = toDateMaybe(v);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function convLastMs(item) {
  const d = toDateMaybe(item?.lastAt) || toDateMaybe(item?.createdAt);
  return d ? d.getTime() : 0;
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function conversationTitle(item) {
  if (!item) return 'Conversación';
  if (item.type === 'group') return String(item.title || 'Grupo').trim();
  if (item.type === 'support') return String(item.title || 'Soporte').trim();
  const lastName = String(item.lastMessage?.senderName || '').trim();
  return lastName || 'Chat privado';
}

function isUnread(item) {
  if (!item || !currentUid) return false;
  const lastAt = toDateMaybe(item.lastAt);
  if (!lastAt) return false;
  if (item.lastMessage?.senderId === currentUid) return false;
  const readAt = toDateMaybe(item.reads?.[currentUid]);
  if (!readAt) return true;
  return lastAt.getTime() > readAt.getTime();
}

function ensureDock() {
  let dock = qs('#miniChatDock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'miniChatDock';
  dock.className = 'mini-chat-dock';
  dock.innerHTML = `
    <button class="mini-chat-launcher" id="miniChatLauncher" type="button" aria-label="Mensajes">
      <span aria-hidden="true">&#128172;</span>
      <span class="mini-badge" id="miniChatBadge" style="display:none;">0</span>
    </button>
    <section class="mini-chat-hub" id="miniChatHub" aria-label="Lista de conversaciones">
      <header class="mini-chat-hub-head">
        <span>Mensajes</span>
        <button class="mini-chat-btn" id="miniChatHubClose" type="button">&times;</button>
      </header>
      <div class="mini-chat-hub-list" id="miniChatHubList"></div>
    </section>
    <div class="mini-chat-windows" id="miniChatWindows"></div>
  `;

  document.body.appendChild(dock);

  const launcher = qs('#miniChatLauncher', dock);
  const hub = qs('#miniChatHub', dock);
  const close = qs('#miniChatHubClose', dock);

  launcher?.addEventListener('click', () => {
    hub?.classList.toggle('is-open');
  });
  close?.addEventListener('click', () => {
    hub?.classList.remove('is-open');
  });

  if (!dockOutsideWired) {
    dockOutsideWired = true;
    document.addEventListener('click', (e) => {
      const currentDock = qs('#miniChatDock');
      const currentHub = qs('#miniChatHub');
      if (!currentDock || !currentHub) return;
      if (!currentDock.contains(e.target)) currentHub.classList.remove('is-open');
    });
  }

  return dock;
}

function setBadge(count) {
  const badge = qs('#miniChatBadge');
  if (!badge) return;
  const num = Number(count || 0);
  if (!num) {
    badge.style.display = 'none';
    badge.textContent = '0';
    return;
  }
  badge.style.display = 'inline-flex';
  badge.textContent = num > 99 ? '99+' : String(num);
}

function markConversationRead(convId) {
  if (!convId || !currentUid) return;
  updateDoc(doc(db, 'conversations', convId), {
    [`reads.${currentUid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => null);
}

function renderHub() {
  const list = qs('#miniChatHubList');
  if (!list) return;

  const sorted = [...conversations].sort((a, b) => convLastMs(b) - convLastMs(a));
  const unread = sorted.filter(isUnread).length;
  setBadge(unread);

  if (!sorted.length) {
    list.innerHTML = '<div class="mini-chat-empty">Sin conversaciones.</div>';
    return;
  }

  list.innerHTML = sorted
    .slice(0, 24)
    .map((item) => {
      const title = esc(conversationTitle(item));
      const text = esc(String(item?.lastMessage?.text || ''));
      const dot = isUnread(item) ? '<span class="mini-chat-hub-item-dot"></span>' : '';
      return `
        <article class="mini-chat-hub-item" data-open-conv="${esc(item.id)}">
          <div class="mini-chat-hub-item-title">
            <span>${title}</span>
            ${dot}
          </div>
          <div class="mini-chat-hub-item-text">${text || 'Sin mensajes'}</div>
        </article>
      `;
    })
    .join('');

  list.querySelectorAll('[data-open-conv]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-open-conv') || '';
      if (!id) return;
      openConversationWindow(id);
      qs('#miniChatHub')?.classList.remove('is-open');
    });
  });
}

function renderWindowMessages(convId, rows) {
  const win = openWindows.get(convId);
  if (!win) return;
  const body = qs('.mini-chat-window-body', win);
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<div class="mini-chat-empty">Sin mensajes.</div>';
    return;
  }

  body.innerHTML = rows
    .map((msg) => {
      const mine = msg.senderId === currentUid;
      const cls = mine ? 'mini-chat-msg me' : 'mini-chat-msg';
      const sender = esc(String(msg.senderName || (mine ? currentName : 'Usuario')));
      const text = esc(String(msg.text || ''));
      const time = esc(fmtTime(msg.createdAt));
      return `
        <div class="${cls}">
          <div>${text || '[Adjunto]'}</div>
          <div class="mini-chat-meta">${sender} - ${time}</div>
        </div>
      `;
    })
    .join('');

  body.scrollTop = body.scrollHeight;
}

function attachWindowStream(convId) {
  if (!convId) return;
  const prev = msgUnsubs.get(convId);
  if (typeof prev === 'function') prev();

  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(60),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const rows = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderWindowMessages(convId, rows);
      markConversationRead(convId);
    },
    () => {
      renderWindowMessages(convId, []);
    },
  );

  msgUnsubs.set(convId, unsub);
}

async function sendWindowMessage(convId) {
  const win = openWindows.get(convId);
  if (!win || !currentUid) return;
  const textarea = qs('textarea', win);
  const text = String(textarea?.value || '').trim();
  if (!text) return;

  if (textarea) textarea.value = '';

  try {
    await addDoc(collection(db, 'conversations', convId, 'messages'), {
      senderId: currentUid,
      senderName: currentName,
      text,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'conversations', convId), {
      lastMessage: { text: text.slice(0, 120), senderId: currentUid, senderName: currentName },
      lastAt: serverTimestamp(),
      [`reads.${currentUid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[mini-chat] send failed', e);
  }
}

function closeConversationWindow(convId) {
  const win = openWindows.get(convId);
  if (win) win.remove();
  openWindows.delete(convId);

  const unsub = msgUnsubs.get(convId);
  if (typeof unsub === 'function') unsub();
  msgUnsubs.delete(convId);
}

function openConversationWindow(convId) {
  if (!convId) return;
  ensureDock();

  const existing = openWindows.get(convId);
  if (existing) {
    existing.classList.remove('minimized');
    attachWindowStream(convId);
    return;
  }

  const item = conversations.find((c) => c.id === convId);
  const title = esc(conversationTitle(item));
  const windows = qs('#miniChatWindows');
  if (!windows) return;

  if (openWindows.size >= 3) {
    const oldestId = openWindows.keys().next().value;
    if (oldestId) closeConversationWindow(oldestId);
  }

  const win = document.createElement('section');
  win.className = 'mini-chat-window';
  win.dataset.conv = convId;
  win.innerHTML = `
    <header class="mini-chat-window-head">
      <div class="mini-chat-window-title">${title}</div>
      <div class="mini-chat-window-actions">
        <button class="mini-chat-btn" data-mini-min="1" type="button">_</button>
        <button class="mini-chat-btn" data-mini-close="1" type="button">&times;</button>
      </div>
    </header>
    <div class="mini-chat-window-body"><div class="mini-chat-empty">Cargando...</div></div>
    <div class="mini-chat-window-compose">
      <textarea rows="2" placeholder="Escribe un mensaje..."></textarea>
      <button class="mini-chat-send" type="button">&#10148;</button>
    </div>
  `;

  windows.prepend(win);
  openWindows.set(convId, win);

  qs('[data-mini-close="1"]', win)?.addEventListener('click', () => closeConversationWindow(convId));
  qs('[data-mini-min="1"]', win)?.addEventListener('click', () => {
    win.classList.toggle('minimized');
  });
  qs('.mini-chat-send', win)?.addEventListener('click', () => sendWindowMessage(convId));
  qs('textarea', win)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendWindowMessage(convId);
    }
  });

  attachWindowStream(convId);
  markConversationRead(convId);
}

function wireHeaderQuickOpen() {
  if (headerQuickOpenWired) return;
  headerQuickOpenWired = true;
  document.addEventListener('click', (e) => {
    const item = e.target.closest('#navMsgList [data-conv]');
    if (!item) return;
    if (window.location.pathname.toLowerCase().includes('mensajes')) return;
    const convId = item.getAttribute('data-conv') || '';
    if (!convId) return;
    e.preventDefault();
    openConversationWindow(convId);
    qs('#miniChatHub')?.classList.remove('is-open');
    markConversationRead(convId);
  });

  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-open-chat]');
    if (!card) return;
    const convId = String(card.getAttribute('data-open-chat') || '').trim();
    if (!convId) return;
    e.preventDefault();
    openConversationWindow(convId);
    markConversationRead(convId);
  });
}

function stopAllStreams() {
  if (typeof convUnsub === 'function') convUnsub();
  convUnsub = null;

  msgUnsubs.forEach((fn) => {
    if (typeof fn === 'function') fn();
  });
  msgUnsubs.clear();
}

export function destroyGlobalMiniChat() {
  stopAllStreams();
  openWindows.forEach((win) => win.remove());
  openWindows.clear();
  conversations = [];
  currentUid = '';
  currentName = 'Usuario';

  const dock = qs('#miniChatDock');
  if (dock) dock.remove();

  if (window.__avMiniChatApi) {
    delete window.__avMiniChatApi;
  }
}

export function initGlobalMiniChat({ uid, displayName } = {}) {
  if (!uid) {
    destroyGlobalMiniChat();
    return;
  }

  currentName = String(displayName || 'Usuario').trim() || 'Usuario';

  if (currentUid === uid && qs('#miniChatDock')) {
    renderHub();
    return;
  }

  destroyGlobalMiniChat();
  currentUid = uid;
  ensureDock();
  wireHeaderQuickOpen();

  window.__avMiniChatApi = {
    openConversation: openConversationWindow,
  };

  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid),
    limit(120),
  );

  convUnsub = onSnapshot(
    q,
    (snap) => {
      conversations = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderHub();
    },
    (e) => {
      console.warn('[mini-chat] conversations load failed', e);
      conversations = [];
      renderHub();
    },
  );
}
