import { db, storage } from './firebase-init.js';
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

let currentUid = '';
let currentName = 'Usuario';
let conversations = [];
const openThreads = new Map();
const minimizedThreads = new Map();
const threadUnread = new Map();
const PANEL_BASE_Z_INDEX = 3000;
const THREAD_BASE_Z_INDEX = 4000;
let topZIndex = THREAD_BASE_Z_INDEX;
let activeConversationId = '';
let convUnsub = null;
let msgUnsub = null;

let outsideClickWired = false;
let quickOpenWired = false;
let syncWired = false;
let threadLayoutWired = false;
let reactionOutsideClickWired = false;
let typingRefreshTimer = 0;
const THREAD_WINDOW_ANIM_MS = 180;
const THREAD_WINDOW_MINIMIZED_TRANSFORM = 'translateY(12px) scale(0.96)';
const MINI_CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];
let uploadInFlight = false;
const TYPING_DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 2000;
const TYPING_THROTTLE_MS = 1500;
const TYPING_STALE_MS = 5000;

const panelUploadState = {
  uploading: false,
  progress: 0,
};

const typingState = {
  debounceTimers: new Map(),
  idleTimers: new Map(),
  lastSentAt: new Map(),
  activeConversations: new Set(),
};

const panelReactionState = {
  conversationId: '',
  rows: [],
  reactionUnsubs: new Map(),
  reactionData: new Map(),
  renderQueued: false,
};

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

function runSafeUnsubscribe(unsub) {
  if (typeof unsub !== 'function') return;
  try {
    unsub();
  } catch {
    // ignore unsubscribe failures
  }
}

function clearReactionListeners(unsubMap, dataMap) {
  if (unsubMap instanceof Map) {
    unsubMap.forEach((unsub) => runSafeUnsubscribe(unsub));
    unsubMap.clear();
  }
  if (dataMap instanceof Map) dataMap.clear();
}

function summarizeReactions(snapshot) {
  const counts = new Map();
  let myEmoji = '';

  (snapshot?.docs || []).forEach((docSnap) => {
    const data = docSnap.data() || {};
    const emoji = String(data.emoji || '').trim();
    const uid = String(data.uid || docSnap.id || '').trim();
    if (!emoji || !uid) return;
    counts.set(emoji, Number(counts.get(emoji) || 0) + 1);
    if (uid === currentUid) myEmoji = emoji;
  });

  const pills = [];
  MINI_CHAT_REACTION_EMOJIS.forEach((emoji) => {
    const count = Number(counts.get(emoji) || 0);
    if (count > 0) pills.push({ emoji, count });
    counts.delete(emoji);
  });
  counts.forEach((count, emoji) => {
    if (count > 0) pills.push({ emoji, count });
  });

  return { myEmoji, pills };
}

function reactionPillsHtml(summary) {
  const pills = Array.isArray(summary?.pills) ? summary.pills : [];
  if (!pills.length) return '';
  const myEmoji = String(summary?.myEmoji || '').trim();
  return pills
    .map((item) => {
      const emoji = String(item?.emoji || '').trim();
      const count = Number(item?.count || 0);
      if (!emoji || count <= 0) return '';
      const active = myEmoji && myEmoji === emoji ? ' active-reaction' : '';
      return `<button class="mini-chat-v4-reaction-pill${active}" type="button" data-reaction-emoji="${esc(emoji)}">${esc(emoji)} ${esc(count)}</button>`;
    })
    .join('');
}

function reactionPickerHtml(summary) {
  const myEmoji = String(summary?.myEmoji || '').trim();
  return MINI_CHAT_REACTION_EMOJIS.map((emoji) => {
    const active = myEmoji && myEmoji === emoji ? ' active-reaction' : '';
    return `<button class="mini-chat-v4-reaction-option${active}" type="button" data-reaction-pick="${esc(emoji)}" aria-label="Reaccionar ${esc(emoji)}">${esc(emoji)}</button>`;
  }).join('');
}

function messageHtml(message, conversationId, reactionData = new Map()) {
  const mine = String(message?.senderId || '').trim() === currentUid;
  const bubbleClass = mine
    ? 'mini-chat-v4-bubble mini-chat-v4-bubble--me'
    : 'mini-chat-v4-bubble mini-chat-v4-bubble--other';
  const rowClass = mine
    ? 'mini-chat-v4-message-row is-me'
    : 'mini-chat-v4-message-row is-other';
  const msgId = String(message?.id || '').trim();
  const convId = String(conversationId || '').trim();
  const summary = reactionData instanceof Map ? reactionData.get(msgId) : null;
  const reactionsHtml = reactionPillsHtml(summary);
  const pickerHtml = reactionPickerHtml(summary);
  const contentHtml = messageContentHtml(message);

  return `
    <div class="${rowClass}" data-conv-id="${esc(convId)}" data-msg-id="${esc(msgId)}">
      <article class="${bubbleClass}">
        ${contentHtml}
        <div class="mini-chat-v4-bubble-meta">${esc(fmtTime(message?.createdAt))}</div>
      </article>
      <div class="mini-chat-v4-reactions">${reactionsHtml}</div>
      <div class="mini-chat-v4-reaction-picker">${pickerHtml}</div>
    </div>
  `;
}

function closeAllReactionPickers(exceptRow = null) {
  document
    .querySelectorAll('.mini-chat-v4-message-row.is-picker-open')
    .forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (exceptRow instanceof HTMLElement && node === exceptRow) return;
      node.classList.remove('is-picker-open');
    });
}

function wireReactionOutsideClick() {
  if (reactionOutsideClickWired) return;
  reactionOutsideClickWired = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      closeAllReactionPickers();
      return;
    }
    if (
      target.closest('.mini-chat-v4-reaction-picker') ||
      target.closest('.mini-chat-v4-bubble') ||
      target.closest('.mini-chat-v4-reaction-pill')
    ) {
      return;
    }
    closeAllReactionPickers();
  });
}

function wireReactionInteractions(container) {
  if (!(container instanceof HTMLElement)) return;
  if (container.dataset.reactionWired === '1') return;
  container.dataset.reactionWired = '1';

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.mini-chat-v4-file')) return;

    const pickerBtn = target.closest('[data-reaction-pick]');
    if (pickerBtn instanceof HTMLElement) {
      const row = pickerBtn.closest('.mini-chat-v4-message-row');
      if (!(row instanceof HTMLElement) || !container.contains(row)) return;
      const convId = String(row.dataset.convId || '').trim();
      const msgId = String(row.dataset.msgId || '').trim();
      const emoji = String(pickerBtn.getAttribute('data-reaction-pick') || '').trim();
      if (!convId || !msgId || !emoji) return;
      event.preventDefault();
      event.stopPropagation();
      toggleReaction(convId, msgId, emoji).catch((error) => {
        console.warn('[mini-chat-v4] toggle reaction failed', error);
      });
      row.classList.remove('is-picker-open');
      return;
    }

    const reactionPill = target.closest('.mini-chat-v4-reaction-pill[data-reaction-emoji]');
    if (reactionPill instanceof HTMLElement) {
      const row = reactionPill.closest('.mini-chat-v4-message-row');
      if (!(row instanceof HTMLElement) || !container.contains(row)) return;
      const convId = String(row.dataset.convId || '').trim();
      const msgId = String(row.dataset.msgId || '').trim();
      const emoji = String(reactionPill.getAttribute('data-reaction-emoji') || '').trim();
      if (!convId || !msgId || !emoji) return;
      event.preventDefault();
      event.stopPropagation();
      toggleReaction(convId, msgId, emoji).catch((error) => {
        console.warn('[mini-chat-v4] toggle reaction failed', error);
      });
      return;
    }

    const bubble = target.closest('.mini-chat-v4-bubble');
    if (!(bubble instanceof HTMLElement)) return;
    const row = bubble.closest('.mini-chat-v4-message-row');
    if (!(row instanceof HTMLElement) || !container.contains(row)) return;
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !row.classList.contains('is-picker-open');
    closeAllReactionPickers();
    if (willOpen) row.classList.add('is-picker-open');
  });
}

function schedulePanelReactionRender() {
  if (panelReactionState.renderQueued) return;
  panelReactionState.renderQueued = true;
  const run = () => {
    panelReactionState.renderQueued = false;
    renderMessages(
      panelReactionState.rows,
      panelReactionState.conversationId,
      panelReactionState.reactionData,
    );
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
    return;
  }
  window.setTimeout(run, 16);
}

function syncReactionListeners({
  conversationId,
  rows = [],
  reactionUnsubs = new Map(),
  reactionData = new Map(),
  onChange = () => {},
} = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    clearReactionListeners(reactionUnsubs, reactionData);
    return;
  }

  const messageIds = new Set(
    rows
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean),
  );

  reactionUnsubs.forEach((unsub, msgId) => {
    if (messageIds.has(msgId)) return;
    runSafeUnsubscribe(unsub);
    reactionUnsubs.delete(msgId);
    reactionData.delete(msgId);
  });

  messageIds.forEach((msgId) => {
    if (reactionUnsubs.has(msgId)) return;
    const reactionsCol = collection(
      db,
      'conversations',
      convId,
      'messages',
      msgId,
      'reactions',
    );
    const unsub = onSnapshot(
      reactionsCol,
      (snapshot) => {
        reactionData.set(msgId, summarizeReactions(snapshot));
        onChange();
      },
      () => {
        reactionData.delete(msgId);
        onChange();
      },
    );
    reactionUnsubs.set(msgId, unsub);
  });
}

function acquireUploadLock() {
  if (uploadInFlight) return false;
  uploadInFlight = true;
  return true;
}

function releaseUploadLock() {
  uploadInFlight = false;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'archivo').replace(/[^\w.\-]+/g, '_');
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function messageAttachmentType(message = {}) {
  const rawType = String(message?.type || '').trim().toLowerCase();
  if (rawType === 'image' || rawType === 'file' || rawType === 'text') return rawType;
  const fileUrl = String(message?.fileUrl || '').trim();
  if (fileUrl) return 'file';
  return 'text';
}

function messageContentHtml(message = {}) {
  const type = messageAttachmentType(message);
  const textRaw = String(message?.text || '').trim();
  const safeText = esc(textRaw).replace(/\n/g, '<br />');
  const fileUrl = String(message?.fileUrl || '').trim();
  const fileName = String(message?.fileName || '').trim() || 'archivo';
  const fileSize = formatFileSize(message?.fileSize);
  const fileLabel = fileSize ? `${fileName} (${fileSize})` : fileName;
  const out = [];

  if (type === 'image' && fileUrl) {
    out.push(`<img class="mini-chat-v4-image" src="${esc(fileUrl)}" alt="${esc(fileName)}" loading="lazy" />`);
  } else if (type === 'file' && fileUrl) {
    out.push(
      `<a class="mini-chat-v4-file" href="${esc(fileUrl)}" download="${esc(fileName)}" target="_blank" rel="noopener">📎 ${esc(fileLabel)}</a>`,
    );
  }

  if (safeText) out.push(`<div class="mini-chat-v4-bubble-text">${safeText}</div>`);
  if (!out.length) out.push('<div class="mini-chat-v4-bubble-text">[Adjunto]</div>');
  return out.join('');
}

function panelUploadUi() {
  return {
    wrap: qs('#miniChatUploadProgressWrap'),
    bar: qs('#miniChatUploadProgress'),
    attachBtn: qs('#miniChatAttach'),
    sendBtn: qs('#miniChatSend'),
    input: qs('#miniChatInput'),
    fileInput: qs('#miniChatFileInput'),
  };
}

function setUploadUi({ wrap, bar, attachBtn, sendBtn, input, fileInput }, uploading = false, progress = 0) {
  const percent = Math.max(0, Math.min(100, Number(progress || 0)));
  if (wrap instanceof HTMLElement) wrap.hidden = !uploading;
  if (bar instanceof HTMLElement) bar.style.width = `${percent}%`;
  if (attachBtn instanceof HTMLButtonElement) attachBtn.disabled = uploading;
  if (sendBtn instanceof HTMLButtonElement) sendBtn.disabled = uploading;
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.disabled = uploading;
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = uploading;
}

function setPanelUploading(uploading = false, progress = 0) {
  panelUploadState.uploading = uploading === true;
  panelUploadState.progress = panelUploadState.uploading
    ? Math.max(0, Math.min(100, Number(progress || 0)))
    : 0;
  setUploadUi(panelUploadUi(), panelUploadState.uploading, panelUploadState.progress);
}

function setThreadUploading(thread, uploading = false, progress = 0) {
  if (!thread || typeof thread !== 'object') return;
  thread.uploading = uploading === true;
  thread.uploadProgress = thread.uploading
    ? Math.max(0, Math.min(100, Number(progress || 0)))
    : 0;
  setUploadUi(
    {
      wrap: thread.progressWrap,
      bar: thread.progressBar,
      attachBtn: thread.attachBtn,
      sendBtn: thread.sendBtn,
      input: thread.inputEl,
      fileInput: thread.fileInput,
    },
    thread.uploading,
    thread.uploadProgress,
  );
}

function uploadAttachmentToStorage(convId, file, onProgress = () => {}) {
  const safeConvId = String(convId || '').trim();
  if (!safeConvId || !(file instanceof File)) {
    return Promise.reject(new Error('invalid-upload-input'));
  }

  const safeName = sanitizeFileName(file.name);
  const path = `chat/${safeConvId}/${Date.now()}_${safeName}`;
  const refObj = storageRef(storage, path);
  const task = uploadBytesResumable(refObj, file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        const total = Number(snapshot?.totalBytes || 0);
        const transferred = Number(snapshot?.bytesTransferred || 0);
        const progress = total > 0 ? (transferred / total) * 100 : 0;
        onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        try {
          const fileUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            fileUrl,
            fileName: file.name || safeName || 'archivo',
            fileSize: file.size || 0,
            type: String(file.type || '').toLowerCase().startsWith('image/')
              ? 'image'
              : 'file',
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

function clearTypingTimer(timerMap, conversationId) {
  if (!(timerMap instanceof Map)) return;
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const timer = timerMap.get(convId);
  if (!timer) return;
  window.clearTimeout(timer);
  timerMap.delete(convId);
}

function clearLocalTypingTimers(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  clearTypingTimer(typingState.debounceTimers, convId);
  clearTypingTimer(typingState.idleTimers, convId);
}

async function sendTypingHeartbeat(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || !currentUid) return;
  const now = Date.now();
  const lastSentAt = Number(typingState.lastSentAt.get(convId) || 0);
  if (now - lastSentAt < TYPING_THROTTLE_MS) return;
  typingState.lastSentAt.set(convId, now);

  try {
    await updateDoc(doc(db, 'conversations', convId), {
      [`typing.${currentUid}`]: serverTimestamp(),
    });
    typingState.activeConversations.add(convId);
  } catch (error) {
    console.warn('[mini-chat-v4] typing heartbeat failed', error);
  }
}

async function clearTypingPresence(conversationId, { force = false } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !currentUid) return;
  clearLocalTypingTimers(convId);
  if (!force && !typingState.activeConversations.has(convId)) return;

  try {
    await updateDoc(doc(db, 'conversations', convId), {
      [`typing.${currentUid}`]: deleteField(),
    });
  } catch (error) {
    console.warn('[mini-chat-v4] typing clear failed', error);
  } finally {
    typingState.activeConversations.delete(convId);
    typingState.lastSentAt.delete(convId);
  }
}

function clearAllTypingPresenceBestEffort() {
  const conversationIds = Array.from(typingState.activeConversations);
  conversationIds.forEach((convId) => {
    clearTypingPresence(convId, { force: true }).catch(() => null);
  });
  typingState.debounceTimers.forEach((timer) => window.clearTimeout(timer));
  typingState.idleTimers.forEach((timer) => window.clearTimeout(timer));
  typingState.debounceTimers.clear();
  typingState.idleTimers.clear();
  typingState.lastSentAt.clear();
  typingState.activeConversations.clear();
}

function scheduleTypingHeartbeat(conversationId, rawValue = '') {
  const convId = String(conversationId || '').trim();
  if (!convId || !currentUid) return;
  const text = String(rawValue || '').trim();

  if (!text) {
    clearTypingPresence(convId).catch(() => null);
    return;
  }

  clearTypingTimer(typingState.debounceTimers, convId);
  typingState.debounceTimers.set(
    convId,
    window.setTimeout(() => {
      typingState.debounceTimers.delete(convId);
      sendTypingHeartbeat(convId).catch(() => null);
    }, TYPING_DEBOUNCE_MS),
  );

  clearTypingTimer(typingState.idleTimers, convId);
  typingState.idleTimers.set(
    convId,
    window.setTimeout(() => {
      typingState.idleTimers.delete(convId);
      clearTypingPresence(convId, { force: true }).catch(() => null);
    }, TYPING_IDLE_MS),
  );
}

function typingUidsForConversation(conversation, nowMs = Date.now()) {
  const typingMap = conversation?.typing;
  if (!typingMap || typeof typingMap !== 'object') return [];

  const out = [];
  Object.entries(typingMap).forEach(([uid, value]) => {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid || cleanUid === currentUid) return;
    const dt = maybeDate(value);
    if (!dt) return;
    const age = nowMs - dt.getTime();
    if (age >= 0 && age <= TYPING_STALE_MS) out.push(cleanUid);
  });
  return out;
}

function typingNameForConversation(conversation, uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return 'Usuario';
  const participants = Array.isArray(conversation?.participants)
    ? conversation.participants.map((item) => String(item || '').trim())
    : [];
  const participantNames = Array.isArray(conversation?.participantNames)
    ? conversation.participantNames.map((item) => String(item || '').trim())
    : [];

  const index = participants.findIndex((item) => item === cleanUid);
  if (index >= 0 && participantNames[index]) {
    return participantNames[index];
  }

  if (String(conversation?.type || '').trim() === 'direct') {
    const title = String(getConversationTitle(conversation) || '').trim();
    if (title && norm(title) !== norm(currentName) && norm(title) !== 'conversacion') {
      return title;
    }
  }

  return 'Usuario';
}

function typingLabelForConversation(conversation) {
  const uids = typingUidsForConversation(conversation);
  if (!uids.length) return '';
  if (uids.length > 1) return 'Varios estan escribiendo...';
  const name = typingNameForConversation(conversation, uids[0]);
  return `${name} esta escribiendo...`;
}

function setTypingNode(node, text = '') {
  if (!(node instanceof HTMLElement)) return;
  const label = String(text || '').trim();
  node.textContent = label;
  node.hidden = !label;
}

function updateTypingIndicatorsFromConversations() {
  const activeConvId = String(activeConversationId || '').trim();
  const panelConversation = activeConvId
    ? conversations.find((item) => String(item?.id || '').trim() === activeConvId) || null
    : null;
  setTypingNode(qs('#miniChatTyping'), typingLabelForConversation(panelConversation));

  openThreads.forEach((thread, id) => {
    if (!(thread?.typingEl instanceof HTMLElement)) return;
    const convId = String(id || '').trim();
    const conversation =
      conversations.find((item) => String(item?.id || '').trim() === convId) || null;
    setTypingNode(thread.typingEl, typingLabelForConversation(conversation));
  });
}

function ensureTypingRefreshTimer() {
  if (typingRefreshTimer) return;
  typingRefreshTimer = window.setInterval(() => {
    updateTypingIndicatorsFromConversations();
  }, 1000);
}

function stopTypingRefreshTimer() {
  if (!typingRefreshTimer) return;
  window.clearInterval(typingRefreshTimer);
  typingRefreshTimer = 0;
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
  runSafeUnsubscribe(msgUnsub);
  msgUnsub = null;
  clearReactionListeners(panelReactionState.reactionUnsubs, panelReactionState.reactionData);
  panelReactionState.rows = [];
  panelReactionState.conversationId = '';
  panelReactionState.renderQueued = false;
}

function stopConversationStream() {
  runSafeUnsubscribe(convUnsub);
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

function renderMessages(
  rows,
  conversationId = activeConversationId,
  reactionData = panelReactionState.reactionData,
) {
  const body = qs('#miniChatMessages');
  if (!body) return;
  wireReactionInteractions(body);

  if (!rows.length) {
    body.innerHTML = '<div class="mini-chat-v4-empty">Sin mensajes.</div>';
    return;
  }

  body.innerHTML = rows
    .map((message) => messageHtml(message, conversationId, reactionData))
    .join('');

  body.scrollTop = body.scrollHeight;
}

function renderThreadWindowMessages(
  container,
  rows,
  conversationId = '',
  reactionData = new Map(),
) {
  if (!(container instanceof HTMLElement)) return;
  const body = qs('.mini-chat-v4-thread-messages', container);
  if (!body) return;
  wireReactionInteractions(body);

  if (!rows.length) {
    body.innerHTML = '<div class="mini-chat-v4-empty">Sin mensajes.</div>';
    return;
  }

  body.innerHTML = rows
    .map((message) => messageHtml(message, conversationId, reactionData))
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
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  panelReactionState.conversationId = convId;
  panelReactionState.rows = [];
  panelReactionState.renderQueued = false;

  const messagesQuery = query(
    collection(db, 'conversations', convId, 'messages'),
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

      panelReactionState.rows = rows;
      syncReactionListeners({
        conversationId: convId,
        rows,
        reactionUnsubs: panelReactionState.reactionUnsubs,
        reactionData: panelReactionState.reactionData,
        onChange: schedulePanelReactionRender,
      });
      renderMessages(rows, convId, panelReactionState.reactionData);
      markConversationRead(convId);
    },
    () => {
      clearReactionListeners(panelReactionState.reactionUnsubs, panelReactionState.reactionData);
      panelReactionState.rows = [];
      renderMessages([]);
    },
  );
}

function attachMessageStreamForWindow(conversationId, container, threadState = null) {
  const convId = String(conversationId || '').trim();
  if (!convId || !(container instanceof HTMLElement)) return null;
  let initialSnapshotHandled = false;

  const messagesQuery = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(120),
  );

  const unsub = onSnapshot(
    messagesQuery,
    (snapshot) => {
      if (initialSnapshotHandled) {
        const addedForUnread = snapshot.docChanges().reduce((sum, change) => {
          if (change.type !== 'added') return sum;
          const senderId = String(change.doc.data()?.senderId || '').trim();
          if (!senderId || senderId === currentUid) return sum;
          if (!minimizedThreads.has(convId)) return sum;
          return sum + 1;
        }, 0);

        if (addedForUnread > 0) {
          const prev = Number(threadUnread.get(convId) || 0);
          const next = Math.max(0, prev) + addedForUnread;
          threadUnread.set(convId, next);
          renderTray();
        }
      } else {
        initialSnapshotHandled = true;
      }

      const rows = (snapshot.docs || []).map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));

      if (threadState && typeof threadState === 'object') {
        threadState.rows = rows;
        syncReactionListeners({
          conversationId: convId,
          rows,
          reactionUnsubs: threadState.reactionUnsubs,
          reactionData: threadState.reactionData,
          onChange: () => {
            if (threadState.renderQueued) return;
            threadState.renderQueued = true;
            const run = () => {
              threadState.renderQueued = false;
              renderThreadWindowMessages(
                container,
                Array.isArray(threadState.rows) ? threadState.rows : [],
                convId,
                threadState.reactionData,
              );
            };
            if (typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(run);
            } else {
              window.setTimeout(run, 16);
            }
          },
        });
      }

      renderThreadWindowMessages(
        container,
        rows,
        convId,
        threadState?.reactionData instanceof Map ? threadState.reactionData : new Map(),
      );
      markConversationRead(convId);
    },
    () => {
      if (threadState && typeof threadState === 'object') {
        clearReactionListeners(threadState.reactionUnsubs, threadState.reactionData);
        threadState.rows = [];
      }
      renderThreadWindowMessages(container, []);
    },
  );

  return unsub;
}

function setActiveConversation(conversationId) {
  const previousConversationId = String(activeConversationId || '').trim();
  activeConversationId = String(conversationId || '').trim();
  const switchedConversation =
    previousConversationId && previousConversationId !== activeConversationId;
  if (switchedConversation) {
    clearTypingPresence(previousConversationId, { force: true }).catch(() => null);
  }

  if (!activeConversationId) {
    stopMessageStream();
    setView('list');
    setOpenLinks('');
    updateTypingIndicatorsFromConversations();
    return;
  }

  renderConversationList();
  renderThreadMeta(activeConversationId);
  setView('thread');
  attachMessageStream(activeConversationId);
  markConversationRead(activeConversationId);
  updateTypingIndicatorsFromConversations();
}

async function sendMessageToConversation(conversationId, text) {
  const convId = String(conversationId || '').trim();
  const safeText = String(text || '').trim();
  if (!convId || !safeText || !currentUid) return;

  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    senderId: currentUid,
    senderName: currentName,
    type: 'text',
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
  clearTypingPresence(convId, { force: true }).catch(() => null);
}

async function sendAttachmentToConversation(conversationId, file, onProgress = () => {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !(file instanceof File) || !currentUid) return;

  const uploaded = await uploadAttachmentToStorage(convId, file, onProgress);
  const payload = {
    senderId: currentUid,
    senderName: currentName,
    type: uploaded.type,
    fileUrl: uploaded.fileUrl,
    fileName: uploaded.fileName,
    fileSize: uploaded.fileSize,
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, 'conversations', convId, 'messages'), payload);
  const previewPrefix = uploaded.type === 'image' ? '[Imagen]' : '[Archivo]';
  const preview = `${previewPrefix} ${uploaded.fileName}`.trim().slice(0, 180);
  await updateDoc(doc(db, 'conversations', convId), {
    lastMessage: {
      text: preview,
      senderId: currentUid,
      senderName: currentName,
    },
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    [`reads.${currentUid}`]: serverTimestamp(),
  });
  clearTypingPresence(convId, { force: true }).catch(() => null);
}

async function toggleReaction(conversationId, messageId, emoji) {
  const convId = String(conversationId || '').trim();
  const msgId = String(messageId || '').trim();
  const safeEmoji = String(emoji || '').trim();
  if (!convId || !msgId || !safeEmoji || !currentUid) return;

  const reactionRef = doc(
    db,
    'conversations',
    convId,
    'messages',
    msgId,
    'reactions',
    currentUid,
  );

  const snapshot = await getDoc(reactionRef);
  const existingEmoji = String(snapshot.data()?.emoji || '').trim();
  if (snapshot.exists() && existingEmoji === safeEmoji) {
    await deleteDoc(reactionRef);
    return;
  }

  await setDoc(reactionRef, {
    uid: currentUid,
    emoji: safeEmoji,
    createdAt: serverTimestamp(),
  });
}

async function handlePanelAttachmentUpload(fileInput) {
  if (!(fileInput instanceof HTMLInputElement)) return;
  const convId = String(activeConversationId || '').trim();
  const file = fileInput.files?.[0] || null;
  fileInput.value = '';
  if (!file || !convId || !currentUid) return;

  if (!acquireUploadLock()) {
    console.warn('[mini-chat-v4] upload blocked: another upload is in progress');
    return;
  }

  setPanelUploading(true, 0);
  try {
    await sendAttachmentToConversation(convId, file, (progress) => {
      setPanelUploading(true, progress);
    });
  } catch (error) {
    console.warn('[mini-chat-v4] attachment upload failed', error);
  } finally {
    setPanelUploading(false, 0);
    releaseUploadLock();
  }
}

async function handleThreadAttachmentUpload(conversationId, thread, fileInput) {
  const convId = String(conversationId || '').trim();
  if (!convId || !thread || !(fileInput instanceof HTMLInputElement)) return;
  const file = fileInput.files?.[0] || null;
  fileInput.value = '';
  if (!file || !currentUid) return;

  if (!acquireUploadLock()) {
    console.warn('[mini-chat-v4] upload blocked: another upload is in progress');
    return;
  }

  setThreadUploading(thread, true, 0);
  try {
    await sendAttachmentToConversation(convId, file, (progress) => {
      setThreadUploading(thread, true, progress);
    });
  } catch (error) {
    console.warn('[mini-chat-v4] attachment upload failed', error);
  } finally {
    setThreadUploading(thread, false, 0);
    releaseUploadLock();
  }
}

async function sendMessage() {
  if (!activeConversationId || !currentUid) return;
  if (panelUploadState.uploading) return;

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

function nextThreadZIndex() {
  topZIndex += 1;
  if (topZIndex > THREAD_BASE_Z_INDEX + 1000) {
    topZIndex = THREAD_BASE_Z_INDEX;
  }
  return topZIndex;
}

function ensureThreadRoot() {
  let root = document.getElementById('miniChatThreadRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'miniChatThreadRoot';
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '4000';
  document.body.appendChild(root);

  return root;
}

function syncThreadActiveWindowClass(activeId = '') {
  const activeConvId = String(activeId || '').trim();
  openThreads.forEach((thread, id) => {
    if (!(thread?.element instanceof HTMLElement)) return;
    const convId = String(id || '').trim();
    const isActive =
      !!activeConvId &&
      convId === activeConvId &&
      !minimizedThreads.has(convId);
    thread.element.classList.toggle('is-active', isActive);
  });
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
  container.style.zIndex = String(nextThreadZIndex());
  container.style.pointerEvents = 'auto';

  container.innerHTML = `
    <div class="mini-chat-v4-thread-container">
      <div class="mini-chat-v4-thread-header">
        <span class="mini-chat-v4-thread-title">Loading...</span>
        <div class="mini-chat-v4-thread-actions">
          <button class="mini-chat-v4-thread-min" type="button" aria-label="Minimizar">&minus;</button>
          <button class="mini-chat-v4-thread-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
      </div>
      <div class="mini-chat-v4-typing" hidden></div>
      <div class="mini-chat-v4-thread-messages"></div>
      <div class="mini-chat-v4-upload-progress-wrap" hidden>
        <div class="mini-chat-v4-upload-progress"></div>
      </div>
      <div class="mini-chat-v4-thread-compose">
        <button class="mini-chat-v4-thread-attach" type="button" aria-label="Adjuntar">&#128206;</button>
        <textarea placeholder="Escribe un mensaje..." rows="1"></textarea>
        <button class="mini-chat-v4-thread-send" type="button" aria-label="Enviar">&#10148;</button>
        <input class="mini-chat-v4-thread-file-input" type="file" hidden />
      </div>
    </div>
  `;

  ensureThreadRoot().appendChild(container);
  wireReactionOutsideClick();

  const progressWrap = qs('.mini-chat-v4-upload-progress-wrap', container);
  const progressBar = qs('.mini-chat-v4-upload-progress', container);
  const typingEl = qs('.mini-chat-v4-typing', container);
  const input = qs('.mini-chat-v4-thread-compose textarea', container);
  const sendBtn = qs('.mini-chat-v4-thread-send', container);
  const attachBtn = qs('.mini-chat-v4-thread-attach', container);
  const fileInput = qs('.mini-chat-v4-thread-file-input', container);

  const threadState = {
    element: container,
    unsub: null,
    minimizeTimer: 0,
    reactionUnsubs: new Map(),
    reactionData: new Map(),
    rows: [],
    renderQueued: false,
    uploading: false,
    uploadProgress: 0,
    progressWrap: progressWrap instanceof HTMLElement ? progressWrap : null,
    progressBar: progressBar instanceof HTMLElement ? progressBar : null,
    typingEl: typingEl instanceof HTMLElement ? typingEl : null,
    inputEl: input instanceof HTMLTextAreaElement ? input : null,
    sendBtn: sendBtn instanceof HTMLButtonElement ? sendBtn : null,
    attachBtn: attachBtn instanceof HTMLButtonElement ? attachBtn : null,
    fileInput: fileInput instanceof HTMLInputElement ? fileInput : null,
  };
  threadState.unsub = attachMessageStreamForWindow(convId, container, threadState);

  openThreads.set(convId, threadState);
  threadUnread.set(convId, 0);
  setThreadUploading(threadState, false, 0);

  setThreadWindowMeta(convId, container);

  const closeBtn = qs('.mini-chat-v4-thread-close', container);
  closeBtn?.addEventListener('click', () => closeThread(convId));
  const minBtn = qs('.mini-chat-v4-thread-min', container);
  minBtn?.addEventListener('click', () => minimizeThread(convId));

  const submit = async () => {
    if (threadState.uploading) return;
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

  input?.addEventListener('input', () => {
    resizeThreadInput(input);
    scheduleTypingHeartbeat(convId, input?.value || '');
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  input?.addEventListener('blur', () => {
    clearTypingPresence(convId, { force: true }).catch(() => null);
  });
  sendBtn?.addEventListener('click', () => submit());
  attachBtn?.addEventListener('click', () => {
    if (threadState.uploading || !(fileInput instanceof HTMLInputElement)) return;
    fileInput.click();
  });
  fileInput?.addEventListener('change', () => {
    handleThreadAttachmentUpload(convId, threadState, fileInput).catch((error) => {
      console.warn('[mini-chat-v4] thread attachment failed', error);
    });
  });

  container.addEventListener('mousedown', () => bringThreadToFront(convId));
  resizeThreadInput(input);

  activeConversationId = convId;
  syncThreadActiveWindowClass(convId);
  renderConversationList();
  positionThreads();
  updateTypingIndicatorsFromConversations();
}

function minimizeThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;
  if (minimizedThreads.has(convId)) return;
  clearTypingPresence(convId, { force: true }).catch(() => null);

  if (thread.element instanceof HTMLElement) {
    if (thread.minimizeTimer) {
      window.clearTimeout(thread.minimizeTimer);
      thread.minimizeTimer = 0;
    }
    thread.element.classList.add('is-minimizing');
  }
  minimizedThreads.set(convId, thread);

  if (thread.element instanceof HTMLElement) {
    thread.minimizeTimer = window.setTimeout(() => {
      thread.minimizeTimer = 0;
      if (!(thread.element instanceof HTMLElement)) return;
      if (!minimizedThreads.has(convId)) {
        thread.element.classList.remove('is-minimizing');
        return;
      }
      thread.element.style.display = 'none';
      thread.element.classList.remove('is-minimizing');
    }, THREAD_WINDOW_ANIM_MS);
  }

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
  syncThreadActiveWindowClass(activeConversationId);

  positionThreads();
  renderTray();
}

function restoreThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = minimizedThreads.get(convId);
  if (!thread) return;
  threadUnread.set(convId, 0);

  if (thread.element instanceof HTMLElement) {
    if (thread.minimizeTimer) {
      window.clearTimeout(thread.minimizeTimer);
      thread.minimizeTimer = 0;
    }
    thread.element.style.display = 'flex';
    thread.element.classList.remove('is-minimizing');
    thread.element.style.opacity = '0';
    thread.element.style.transform = THREAD_WINDOW_MINIMIZED_TRANSFORM;
    const playRestore = () => {
      if (!(thread.element instanceof HTMLElement)) return;
      thread.element.style.opacity = '';
      thread.element.style.transform = '';
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(playRestore);
    } else {
      window.setTimeout(playRestore, 16);
    }
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
    const convId = String(id || '').trim();
    const conversation =
      conversations.find((item) => String(item?.id || '').trim() === convId) ||
      null;
    const title = getConversationTitle(conversation);
    const bubble = document.createElement('button');
    bubble.className = 'mini-chat-v4-tray-bubble';
    bubble.type = 'button';
    const unreadCount = Math.max(0, Number(threadUnread.get(id) || 0));
    const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);
    bubble.innerHTML = `
      <span class="mini-chat-v4-tray-avatar">${esc(initials(title))}</span>
      ${
        unreadCount > 0
          ? `<span class="mini-chat-v4-tray-badge">${esc(badgeText)}</span>`
          : ''
      }
    `;
    bubble.title = title;
    bubble.setAttribute(
      'aria-label',
      unreadCount > 0 ? `${title} (${unreadCount} sin leer)` : title,
    );
    if (unreadCount > 0) {
      bubble.classList.add('has-unread');
    }
    bubble.addEventListener('click', () => restoreThread(id));
    tray.appendChild(bubble);
  });
}

function closeThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;
  clearTypingPresence(convId, { force: true }).catch(() => null);

  if (thread.minimizeTimer) {
    window.clearTimeout(thread.minimizeTimer);
    thread.minimizeTimer = 0;
  }

  runSafeUnsubscribe(thread.unsub);
  clearReactionListeners(thread.reactionUnsubs, thread.reactionData);
  thread.rows = [];
  thread.renderQueued = false;

  thread.element?.remove();
  openThreads.delete(convId);
  minimizedThreads.delete(convId);
  threadUnread.delete(convId);

  if (activeConversationId === convId) {
    activeConversationId = Array.from(openThreads.keys()).pop() || '';
  }
  syncThreadActiveWindowClass(activeConversationId);

  renderConversationList();
  positionThreads();
  renderTray();
  updateTypingIndicatorsFromConversations();
}

function bringThreadToFront(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;
  if (thread.element) thread.element.style.zIndex = String(nextThreadZIndex());
  activeConversationId = convId;
  syncThreadActiveWindowClass(convId);
  renderConversationList();
  updateTypingIndicatorsFromConversations();
}

function positionThreads() {
  const panel = document.getElementById('miniChatPanel');
  const panelWidth = panel?.offsetWidth || 0;
  let index = 0;
  openThreads.forEach((thread, id) => {
    if (!(thread?.element instanceof HTMLElement)) return;
    if (minimizedThreads.has(String(id || '').trim())) return;
    thread.element.style.right = `${panelWidth + 40 + index * 380}px`;
    thread.element.style.bottom = '20px';
    index += 1;
  });
}

function closeAllThreadWindows() {
  Array.from(openThreads.keys()).forEach((conversationId) =>
    closeThread(conversationId),
  );
  minimizedThreads.clear();
  threadUnread.clear();
  topZIndex = THREAD_BASE_Z_INDEX;
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

        <div class="mini-chat-v4-typing" id="miniChatTyping" hidden></div>
        <div class="mini-chat-v4-messages" id="miniChatMessages"></div>

        <div class="mini-chat-v4-upload-progress-wrap" id="miniChatUploadProgressWrap" hidden>
          <div class="mini-chat-v4-upload-progress" id="miniChatUploadProgress"></div>
        </div>

        <footer class="mini-chat-v4-compose">
          <button class="mini-chat-v4-attach" id="miniChatAttach" type="button" aria-label="Adjuntar">&#128206;</button>
          <textarea id="miniChatInput" rows="1" placeholder="Escribe un mensaje..."></textarea>
          <button class="mini-chat-v4-send" id="miniChatSend" type="button" aria-label="Enviar">&#10148;</button>
          <input id="miniChatFileInput" type="file" hidden />
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
  const panel = qs('#miniChatPanel', dock);
  if (panel) panel.style.zIndex = String(PANEL_BASE_Z_INDEX);

  const launcher = qs('#miniChatLauncher', dock);
  const closeBtn = qs('#miniChatClose', dock);
  const minBtn = qs('#miniChatMinimize', dock);
  const backBtn = qs('#miniChatBack', dock);
  const attachBtn = qs('#miniChatAttach', dock);
  const fileInput = qs('#miniChatFileInput', dock);
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
  attachBtn?.addEventListener('click', () => {
    if (panelUploadState.uploading || !(fileInput instanceof HTMLInputElement)) return;
    fileInput.click();
  });
  fileInput?.addEventListener('change', () => {
    handlePanelAttachmentUpload(fileInput).catch((error) => {
      console.warn('[mini-chat-v4] panel attachment failed', error);
    });
  });

  searchInput?.addEventListener('input', () => filterConversationList());

  textInput?.addEventListener('input', () => {
    resizeInput();
    scheduleTypingHeartbeat(activeConversationId, textInput?.value || '');
  });
  textInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  textInput?.addEventListener('blur', () => {
    clearTypingPresence(activeConversationId, { force: true }).catch(() => null);
  });

  resizeInput();
  setPanelUploading(false, 0);
  wireReactionOutsideClick();
  ensureTypingRefreshTimer();
  updateTypingIndicatorsFromConversations();

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
  clearAllTypingPresenceBestEffort();
  stopTypingRefreshTimer();
  stopAllStreams();
  closeAllThreadWindows();
  releaseUploadLock();
  setPanelUploading(false, 0);

  conversations = [];
  activeConversationId = '';
  currentUid = '';
  currentName = 'Usuario';

  const dock = qs('#miniChatDock');
  if (dock) dock.remove();
  const tray = document.getElementById('miniChatTray');
  if (tray) tray.remove();
  const threadRoot = document.getElementById('miniChatThreadRoot');
  if (threadRoot) threadRoot.remove();

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
      updateTypingIndicatorsFromConversations();

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
      updateTypingIndicatorsFromConversations();
    },
  );
}
