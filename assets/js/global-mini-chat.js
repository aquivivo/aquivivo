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
let conversations = [];
const openThreads = new Map();
const minimizedThreads = new Map();
let threadZIndex = 60;
let activeConversationId = '';
let convUnsub = null;
let msgUnsub = null;

let outsideClickWired = false;
let quickOpenWired = false;
let syncWired = false;
let threadLayoutWired = false;

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maybeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(value) {
  const d = maybeDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function initials(value) {
  const text = String(value || '').trim();
  if (!text) return 'AV';
  const parts = text.split(/\s+/).slice(0, 2);
  const joined = parts.map((part) => part[0] || '').join('');
  return (joined || text.slice(0, 2)).toUpperCase();
}

function conversationLastMs(conversation) {
  const d =
    maybeDate(conversation?.lastAt) ||
    maybeDate(conversation?.updatedAt) ||
    maybeDate(conversation?.createdAt);
  return d ? d.getTime() : 0;
}

function getConversationTitle(conversation) {
  if (!conversation) return 'Conversacion';

  const explicit = String(conversation.title || '').trim();
  if (explicit) return explicit;

  if (conversation.type === 'group') return 'Grupo';
  if (conversation.type === 'support') return 'Soporte';

  const participantNames = Array.isArray(conversation.participantNames)
    ? conversation.participantNames
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    : [];

  if (participantNames.length) {
    const otherName = participantNames.find(
      (name) => norm(name) !== norm(currentName),
    );
    if (otherName) return otherName;
    return participantNames[0];
  }

  const lastSender = String(conversation.lastMessage?.senderName || '').trim();
  if (lastSender && norm(lastSender) !== norm(currentName)) return lastSender;

  return 'Conversacion';
}

function getConversationPreview(conversation) {
  const raw = String(conversation?.lastMessage?.text || '').trim();
  if (raw) return raw;
  return 'Sin mensajes';
}

function isUnread(conversation) {
  if (!conversation || !currentUid) return false;
  if (conversation.lastMessage?.senderId === currentUid) return false;

  const lastAt = maybeDate(conversation.lastAt);
  if (!lastAt) return false;

  const readAt = maybeDate(conversation.reads?.[currentUid]);
  if (!readAt) return true;

  return lastAt.getTime() > readAt.getTime();
}

function stopMessageStream() {
  if (typeof msgUnsub === 'function') msgUnsub();
  msgUnsub = null;
}

function stopConversationStream() {
  if (typeof convUnsub === 'function') convUnsub();
  convUnsub = null;
}

function stopAllStreams() {
  stopMessageStream();
  stopConversationStream();
}

function setUnreadBadge(count) {
  const badge = qs('#miniChatBadge');
  if (!badge) return;

  const n = Number(count || 0);
  if (!n) {
    badge.style.display = 'none';
    badge.textContent = '0';
    return;
  }

  badge.style.display = 'inline-flex';
  badge.textContent = n > 99 ? '99+' : String(n);
}

function setOpenLinks(conversationId) {
  const href = conversationId
    ? `mensajes.html?conv=${encodeURIComponent(conversationId)}`
    : 'mensajes.html';

  const full = qs('#miniChatOpenFull');
  const info = qs('#miniChatOpenThread');
  if (full) full.href = href;
  if (info) info.href = href;
}

function markConversationRead(conversationId) {
  if (!conversationId || !currentUid) return;

  updateDoc(doc(db, 'conversations', conversationId), {
    [`reads.${currentUid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => null);
}

function setDockOpen(open) {
  const dock = qs('#miniChatDock');
  const panel = qs('#miniChatPanel');
  if (!dock || !panel) return;

  if (open) {
    dock.classList.add('is-open');
    dock.classList.remove('is-minimized');
    panel.hidden = false;
    window.dispatchEvent(
      new CustomEvent('av:quickchat-open', { detail: { open: true } }),
    );
    return;
  }

  dock.classList.remove('is-open');
  panel.hidden = true;
}

function setDockMinimized() {
  const dock = qs('#miniChatDock');
  const panel = qs('#miniChatPanel');
  if (!dock || !panel) return;

  dock.classList.add('is-minimized');
  dock.classList.remove('is-open');
  panel.hidden = true;
}

function setView(view) {
  const listView = qs('#miniChatListView');
  const threadView = qs('#miniChatThreadView');

  if (listView) listView.hidden = view !== 'list';
  if (threadView) threadView.hidden = view !== 'thread';
}

function resizeInput() {
  const input = qs('#miniChatInput');
  if (!input) return;

  input.style.height = '0px';
  const h = Math.max(38, Math.min(98, input.scrollHeight));
  input.style.height = `${h}px`;
}

function filterConversationList() {
  const queryText = norm(qs('#miniChatSearch')?.value || '');
  const list = qs('#miniChatList');
  if (!list) return;

  list.querySelectorAll('.mini-chat-v4-row').forEach((row) => {
    const haystack = String(row.dataset.search || '');
    row.style.display =
      !queryText || haystack.includes(queryText) ? '' : 'none';
  });
}

function renderConversationList() {
  const list = qs('#miniChatList');
  if (!list) return;

  const sorted = [...conversations].sort(
    (a, b) => conversationLastMs(b) - conversationLastMs(a),
  );
  setUnreadBadge(sorted.filter(isUnread).length);

  if (!sorted.length) {
    list.innerHTML =
      '<div class="mini-chat-v4-empty">Sin conversaciones.</div>';
    return;
  }

  list.innerHTML = sorted
    .slice(0, 40)
    .map((conversation) => {
      const titleRaw = getConversationTitle(conversation);
      const previewRaw = getConversationPreview(conversation);
      const activeClass =
        conversation.id === activeConversationId ? ' is-active' : '';
      const unreadDot = isUnread(conversation)
        ? '<span class="mini-chat-v4-row-unread"></span>'
        : '';
      const search = esc(`${titleRaw} ${previewRaw}`.toLowerCase());

      return `
        <button class="mini-chat-v4-row${activeClass}" type="button" data-open-conv="${esc(conversation.id)}" data-search="${search}">
          <span class="mini-chat-v4-row-avatar">${esc(initials(titleRaw))}</span>
          <span class="mini-chat-v4-row-main">
            <span class="mini-chat-v4-row-top">
              <span class="mini-chat-v4-row-title">${esc(titleRaw)}</span>
              <span class="mini-chat-v4-row-time">${esc(fmtTime(conversation.lastAt))}</span>
            </span>
            <span class="mini-chat-v4-row-preview">${esc(previewRaw)}</span>
          </span>
          ${unreadDot}
        </button>
      `;
    })
    .join('');

  list.querySelectorAll('[data-open-conv]').forEach((row) => {
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      const conversationId = String(
        row.getAttribute('data-open-conv') || '',
      ).trim();
      if (!conversationId) return;
      openConversation(conversationId);
    });
  });

  filterConversationList();
}

function renderThreadMeta(conversationId) {
  const conversation =
    conversations.find((item) => item.id === conversationId) || null;
  const title = getConversationTitle(conversation);
  const status =
    conversation?.type === 'group'
      ? 'Grupo'
      : conversation?.type === 'support'
        ? 'Soporte'
        : 'Activo ahora';

  const titleEl = qs('#miniChatThreadTitle');
  const statusEl = qs('#miniChatThreadStatus');
  const avatarEl = qs('#miniChatThreadAvatar');

  if (titleEl) titleEl.textContent = title;
  if (statusEl) statusEl.textContent = status;
  if (avatarEl) avatarEl.textContent = initials(title);

  setOpenLinks(conversationId);
}

function renderMessages(rows) {
  const body = qs('#miniChatMessages');
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<div class="mini-chat-v4-empty">Sin mensajes.</div>';
    return;
  }

  body.innerHTML = rows
    .map((message) => {
      const mine = message.senderId === currentUid;
      const cls = mine
        ? 'mini-chat-v4-bubble mini-chat-v4-bubble--me'
        : 'mini-chat-v4-bubble mini-chat-v4-bubble--other';

      return `
        <article class="${cls}">
          <div class="mini-chat-v4-bubble-text">${esc(String(message.text || '[Adjunto]'))}</div>
          <div class="mini-chat-v4-bubble-meta">${esc(fmtTime(message.createdAt))}</div>
        </article>
      `;
    })
    .join('');

  body.scrollTop = body.scrollHeight;
}

function renderThreadWindowMessages(container, rows) {
  if (!(container instanceof HTMLElement)) return;
  const body = qs('.mini-chat-v4-thread-messages', container);
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '<div class="mini-chat-v4-empty">Sin mensajes.</div>';
    return;
  }

  body.innerHTML = rows
    .map((message) => {
      const mine = message.senderId === currentUid;
      const cls = mine
        ? 'mini-chat-v4-bubble mini-chat-v4-bubble--me'
        : 'mini-chat-v4-bubble mini-chat-v4-bubble--other';

      return `
        <article class="${cls}">
          <div class="mini-chat-v4-bubble-text">${esc(String(message.text || '[Adjunto]'))}</div>
          <div class="mini-chat-v4-bubble-meta">${esc(fmtTime(message.createdAt))}</div>
        </article>
      `;
    })
    .join('');

  body.scrollTop = body.scrollHeight;
}

function setThreadWindowMeta(conversationId, container) {
  if (!(container instanceof HTMLElement)) return;
  const conversation =
    conversations.find((item) => item.id === conversationId) || null;
  const title = getConversationTitle(conversation);
  const titleEl = qs('.mini-chat-v4-thread-title', container);
  if (titleEl) titleEl.textContent = title;
}

function attachMessageStream(conversationId) {
  stopMessageStream();
  if (!conversationId) return;

  const messagesQuery = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(120),
  );

  msgUnsub = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const rows = (snapshot.docs || []).map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));

      renderMessages(rows);
      markConversationRead(conversationId);
    },
    () => {
      renderMessages([]);
    },
  );
}

function attachMessageStreamForWindow(conversationId, container) {
  const convId = String(conversationId || '').trim();
  if (!convId || !(container instanceof HTMLElement)) return null;

  const messagesQuery = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(120),
  );

  const unsub = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const rows = (snapshot.docs || []).map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));

      renderThreadWindowMessages(container, rows);
      markConversationRead(convId);
    },
    () => {
      renderThreadWindowMessages(container, []);
    },
  );

  return unsub;
}

function setActiveConversation(conversationId) {
  activeConversationId = String(conversationId || '').trim();

  if (!activeConversationId) {
    stopMessageStream();
    setView('list');
    setOpenLinks('');
    return;
  }

  renderConversationList();
  renderThreadMeta(activeConversationId);
  setView('thread');
  attachMessageStream(activeConversationId);
  markConversationRead(activeConversationId);
}

async function sendMessageToConversation(conversationId, text) {
  const convId = String(conversationId || '').trim();
  const safeText = String(text || '').trim();
  if (!convId || !safeText || !currentUid) return;

  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    senderId: currentUid,
    senderName: currentName,
    text: safeText,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: {
      text: safeText.slice(0, 180),
      senderId: currentUid,
      senderName: currentName,
    },
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    [`reads.${currentUid}`]: serverTimestamp(),
  });
}

async function sendMessage() {
  if (!activeConversationId || !currentUid) return;

  const input = qs('#miniChatInput');
  const text = String(input?.value || '').trim();
  if (!text) return;

  if (input) {
    input.value = '';
    resizeInput();
  }

  try {
    await sendMessageToConversation(activeConversationId, text);
  } catch (error) {
    console.warn('[mini-chat-v4] send failed', error);
  }
}

function resizeThreadInput(input) {
  if (!(input instanceof HTMLTextAreaElement)) return;
  input.style.height = '0px';
  const h = Math.max(38, Math.min(98, input.scrollHeight));
  input.style.height = `${h}px`;
}

function createThreadWindow(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  if (openThreads.has(convId)) {
    if (minimizedThreads.has(convId)) {
      restoreThread(convId);
      return;
    }
    bringThreadToFront(convId);
    return;
  }

  const container = document.createElement('div');
  container.className = 'mini-chat-v4-thread-window';
  container.dataset.threadId = convId;
  container.style.zIndex = String(threadZIndex++);

  container.innerHTML = `
    <div class="mini-chat-v4-thread-container">
      <div class="mini-chat-v4-thread-header">
        <span class="mini-chat-v4-thread-title">Loading...</span>
        <div class="mini-chat-v4-thread-actions">
          <button class="mini-chat-v4-thread-min" type="button" aria-label="Minimizar">&minus;</button>
          <button class="mini-chat-v4-thread-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
      </div>
      <div class="mini-chat-v4-thread-messages"></div>
      <div class="mini-chat-v4-thread-compose">
        <textarea placeholder="Escribe un mensaje..." rows="1"></textarea>
        <button class="mini-chat-v4-thread-send" type="button" aria-label="Enviar">&#10148;</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const unsub = attachMessageStreamForWindow(convId, container);

  openThreads.set(convId, {
    element: container,
    unsub,
  });

  setThreadWindowMeta(convId, container);

  const closeBtn = qs('.mini-chat-v4-thread-close', container);
  closeBtn?.addEventListener('click', () => closeThread(convId));
  const minBtn = qs('.mini-chat-v4-thread-min', container);
  minBtn?.addEventListener('click', () => minimizeThread(convId));

  const input = qs('.mini-chat-v4-thread-compose textarea', container);
  const sendBtn = qs('.mini-chat-v4-thread-send', container);
  const submit = async () => {
    const text = String(input?.value || '').trim();
    if (!text) return;
    if (input) {
      input.value = '';
      resizeThreadInput(input);
    }
    try {
      await sendMessageToConversation(convId, text);
    } catch (error) {
      console.warn('[mini-chat-v4] send thread failed', error);
    }
  };

  input?.addEventListener('input', () => resizeThreadInput(input));
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  sendBtn?.addEventListener('click', () => submit());

  container.addEventListener('mousedown', () => bringThreadToFront(convId));
  resizeThreadInput(input);

  activeConversationId = convId;
  renderConversationList();
  positionThreads();
}

function minimizeThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;

  if (thread.element instanceof HTMLElement) {
    thread.element.style.display = 'none';
  }
  minimizedThreads.set(convId, thread);

  if (activeConversationId === convId) {
    const visibleOpenId = Array.from(openThreads.entries()).find(
      ([id, item]) => {
        if (id === convId) return false;
        return (
          item?.element instanceof HTMLElement &&
          item.element.style.display !== 'none'
        );
      },
    )?.[0];
    activeConversationId = visibleOpenId || '';
    renderConversationList();
  }

  positionThreads();
  renderTray();
}

function restoreThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = minimizedThreads.get(convId);
  if (!thread) return;

  if (thread.element instanceof HTMLElement) {
    thread.element.style.display = 'flex';
  }
  minimizedThreads.delete(convId);
  bringThreadToFront(convId);
  positionThreads();
  renderTray();
}

function renderTray() {
  let tray = document.getElementById('miniChatTray');

  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'miniChatTray';
    tray.className = 'mini-chat-v4-tray';
    document.body.appendChild(tray);
  }

  tray.innerHTML = '';

  minimizedThreads.forEach((thread, id) => {
    const bubble = document.createElement('button');
    bubble.className = 'mini-chat-v4-tray-bubble';
    bubble.type = 'button';
    bubble.textContent =
      thread.element?.querySelector('.mini-chat-v4-thread-title')
        ?.textContent || 'Chat';
    bubble.addEventListener('click', () => restoreThread(id));
    tray.appendChild(bubble);
  });
}

function closeThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;

  if (typeof thread.unsub === 'function') {
    try {
      thread.unsub();
    } catch {
      // ignore unsubscribe failures
    }
  }

  thread.element?.remove();
  openThreads.delete(convId);
  minimizedThreads.delete(convId);

  if (activeConversationId === convId) {
    activeConversationId = Array.from(openThreads.keys()).pop() || '';
  }

  renderConversationList();
  positionThreads();
  renderTray();
}

function bringThreadToFront(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;
  if (thread.element) thread.element.style.zIndex = String(threadZIndex++);
  activeConversationId = convId;
  renderConversationList();
}

function positionThreads() {
  let index = 0;
  openThreads.forEach((thread, id) => {
    if (!(thread?.element instanceof HTMLElement)) return;
    if (minimizedThreads.has(String(id || '').trim())) return;
    thread.element.style.right = `${20 + index * 380}px`;
    thread.element.style.bottom = '20px';
    index += 1;
  });
}

function closeAllThreadWindows() {
  Array.from(openThreads.keys()).forEach((conversationId) =>
    closeThread(conversationId),
  );
  minimizedThreads.clear();
  threadZIndex = 60;
  renderTray();
}

function buildDockMarkup() {
  return `
    <button class="mini-chat-v4-launcher" id="miniChatLauncher" type="button" aria-label="Mensajes">
      <span class="mini-chat-v4-launcher-icon" aria-hidden="true">&#128172;</span>
      <span class="mini-chat-v4-badge" id="miniChatBadge" style="display:none;">0</span>
    </button>

    <section class="mini-chat-v4-panel" id="miniChatPanel" hidden>
      <div class="mini-chat-v4-list-view" id="miniChatListView">
        <header class="mini-chat-v4-head">
          <div class="mini-chat-v4-head-left">
            <div class="mini-chat-v4-head-title">Mensajes</div>
          </div>
          <div class="mini-chat-v4-head-actions">
            <button class="mini-chat-v4-icon" id="miniChatMinimize" type="button" aria-label="Minimizar">&#8722;</button>
            <button class="mini-chat-v4-icon" id="miniChatClose" type="button" aria-label="Cerrar">&times;</button>
          </div>
        </header>

        <div class="mini-chat-v4-search-wrap">
          <input id="miniChatSearch" type="text" placeholder="Buscar" autocomplete="off" />
        </div>

        <div class="mini-chat-v4-list" id="miniChatList"></div>

        <a class="mini-chat-v4-open-full" id="miniChatOpenFull" href="mensajes.html">Abrir vista completa</a>
      </div>

      <div class="mini-chat-v4-thread-view" id="miniChatThreadView" hidden>
        <header class="mini-chat-v4-thread-head">
          <button class="mini-chat-v4-icon" id="miniChatBack" type="button" aria-label="Volver">&#8592;</button>

          <div class="mini-chat-v4-thread-user">
            <div class="mini-chat-v4-thread-avatar" id="miniChatThreadAvatar">AV</div>
            <div class="mini-chat-v4-thread-meta">
              <div class="mini-chat-v4-thread-title" id="miniChatThreadTitle">Conversacion</div>
              <div class="mini-chat-v4-thread-status" id="miniChatThreadStatus">Activo ahora</div>
            </div>
          </div>

          <a class="mini-chat-v4-open-thread" id="miniChatOpenThread" href="mensajes.html" aria-label="Abrir detalles">&#8505;</a>
        </header>

        <div class="mini-chat-v4-messages" id="miniChatMessages"></div>

        <footer class="mini-chat-v4-compose">
          <button class="mini-chat-v4-attach" type="button" aria-label="Adjuntar">&#128206;</button>
          <textarea id="miniChatInput" rows="1" placeholder="Escribe un mensaje..."></textarea>
          <button class="mini-chat-v4-send" id="miniChatSend" type="button" aria-label="Enviar">&#10148;</button>
        </footer>
      </div>
    </section>
  `;
}

function ensureDock() {
  let dock = qs('#miniChatDock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'miniChatDock';
  dock.className = 'mini-chat-dock mini-chat-v4';
  dock.innerHTML = buildDockMarkup();
  document.body.appendChild(dock);

  const launcher = qs('#miniChatLauncher', dock);
  const closeBtn = qs('#miniChatClose', dock);
  const minBtn = qs('#miniChatMinimize', dock);
  const backBtn = qs('#miniChatBack', dock);
  const sendBtn = qs('#miniChatSend', dock);
  const searchInput = qs('#miniChatSearch', dock);
  const textInput = qs('#miniChatInput', dock);

  launcher?.addEventListener('click', () => {
    const panel = qs('#miniChatPanel');
    setDockOpen(!!panel?.hidden);
  });

  closeBtn?.addEventListener('click', () => setDockOpen(false));
  minBtn?.addEventListener('click', () => setDockMinimized());
  backBtn?.addEventListener('click', () => setActiveConversation(''));
  sendBtn?.addEventListener('click', () => sendMessage());

  searchInput?.addEventListener('input', () => filterConversationList());

  textInput?.addEventListener('input', () => resizeInput());
  textInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  resizeInput();

  if (!outsideClickWired) {
    outsideClickWired = true;
    document.addEventListener('click', (event) => {
      const currentDock = qs('#miniChatDock');
      const panel = qs('#miniChatPanel');
      if (!currentDock || !panel || panel.hidden) return;

      // if click was in launcher or dock, do not close
      if (currentDock.contains(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('.mini-chat-v4-thread-window')
      )
        return;

      setDockOpen(false);
    });
  }

  if (!syncWired) {
    syncWired = true;
    window.addEventListener('av:messages-drawer', (event) => {
      if (!event?.detail?.open) return;
      setDockOpen(false);
    });
  }

  if (!threadLayoutWired) {
    threadLayoutWired = true;
    window.addEventListener('resize', () => positionThreads(), {
      passive: true,
    });
  }

  return dock;
}

function openConversation(conversationId) {
  ensureDock();
  setDockOpen(true);
  createThreadWindow(conversationId);
}

async function ensureConversationWith(targetUid, targetName) {
  const peerUid = String(targetUid || '').trim();
  if (!currentUid || !peerUid || currentUid === peerUid) return;

  const existing = conversations.find((conv) => {
    if (!Array.isArray(conv?.participants)) return false;
    return (
      conv.participants.length === 2 &&
      conv.participants.includes(currentUid) &&
      conv.participants.includes(peerUid)
    );
  });

  if (existing?.id) {
    openConversation(existing.id);
    return;
  }

  const docRef = await addDoc(collection(db, 'conversations'), {
    type: 'direct',
    participants: [currentUid, peerUid],
    participantNames: [
      currentName,
      String(targetName || 'Usuario').trim() || 'Usuario',
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastAt: serverTimestamp(),
    reads: {
      [currentUid]: serverTimestamp(),
    },
  });

  openConversation(docRef.id);
}

function wireQuickOpen() {
  if (quickOpenWired) return;
  quickOpenWired = true;

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open-chat]');
    if (!trigger) return;

    const targetUid = String(
      trigger.getAttribute('data-open-chat') || '',
    ).trim();
    const targetName = String(
      trigger.getAttribute('data-open-chat-name') || '',
    ).trim();
    if (!targetUid) return;

    event.preventDefault();
    ensureConversationWith(targetUid, targetName).catch((error) => {
      console.warn('[mini-chat-v4] ensure conversation failed', error);
    });
  });
}

export function destroyGlobalMiniChat() {
  stopAllStreams();
  closeAllThreadWindows();

  conversations = [];
  activeConversationId = '';
  currentUid = '';
  currentName = 'Usuario';

  const dock = qs('#miniChatDock');
  if (dock) dock.remove();
  const tray = document.getElementById('miniChatTray');
  if (tray) tray.remove();

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
    renderConversationList();
    return;
  }

  destroyGlobalMiniChat();

  currentUid = uid;
  ensureDock();
  wireQuickOpen();

  window.__avMiniChatApi = {
    openConversation,
  };

  const conversationQuery = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid),
    limit(250),
  );

  convUnsub = onSnapshot(
    conversationQuery,
    (snapshot) => {
      conversations = (snapshot.docs || []).map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));

      renderConversationList();
      const existingIds = new Set(conversations.map((item) => item.id));
      Array.from(openThreads.entries()).forEach(([conversationId, thread]) => {
        if (!existingIds.has(conversationId)) {
          closeThread(conversationId);
          return;
        }
        if (thread?.element instanceof HTMLElement) {
          setThreadWindowMeta(conversationId, thread.element);
        }
      });
      renderTray();

      if (activeConversationId) {
        const stillExists = conversations.some(
          (item) => item.id === activeConversationId,
        );
        if (!stillExists) {
          setActiveConversation('');
        } else {
          renderThreadMeta(activeConversationId);
        }
      }
    },
    () => {
      conversations = [];
      activeConversationId = '';
      closeAllThreadWindows();
      renderConversationList();
      setActiveConversation('');
    },
  );
}
