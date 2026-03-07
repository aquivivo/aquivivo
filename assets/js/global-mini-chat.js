import { db, storage } from './firebase-init.js';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  buildConversationListHtml,
  buildDockMarkup,
  buildInboxThreadMarkup,
  buildMessagesHtml,
  buildThreadWindowMarkup,
  fmtTime,
  getConversationTitle,
  initials,
  maybeDate,
} from './chat-dom.js';
import { createMiniChatFirestoreController } from './chat-firestore.js';
import { getNeuSocialAppPath, withNeuQuery } from './neu-paths.js';
import { createMiniChatReactionController } from './chat-reactions.js';
import { createMiniChatTypingController } from './chat-typing.js';
import { createMiniChatUploadController } from './chat-upload.js';

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
let hostMode = 'dock';
let routeChatIntentKey = '';
const profileCache = new Map();
const profileLoading = new Map();

function isNeuSocialPage() {
  return document.body?.classList?.contains('neu-social-app') === true;
}

function isPageMode() {
  return hostMode === 'page';
}

function shouldDisableOnNeuSocialPage(mode = hostMode) {
  return isNeuSocialPage() && mode !== 'page';
}

let outsideClickWired = false;
let quickOpenWired = false;
let syncWired = false;
let threadLayoutWired = false;
const THREAD_WINDOW_ANIM_MS = 180;
const THREAD_WINDOW_MINIMIZED_TRANSFORM = 'translateY(12px) scale(0.96)';
const panelUploadState = {
  uploading: false,
  progress: 0,
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

function profileFallback(uid = '') {
  const cleanUid = String(uid || '').trim();
  return {
    uid: cleanUid,
    displayName: cleanUid ? `Usuario ${cleanUid.slice(0, 6)}` : 'Usuario',
    handle: cleanUid ? `@${cleanUid.slice(0, 8)}` : '@usuario',
    avatarUrl: '',
  };
}

function normalizeProfile(uid, raw = {}) {
  const fallback = profileFallback(uid);
  const displayName = String(raw.displayName || raw.name || fallback.displayName).trim() || fallback.displayName;
  const handleRaw = String(raw.handle || raw.username || '').replace(/^@+/, '').trim();
  const safeHandle = handleRaw
    ? `@${handleRaw}`
    : fallback.handle;
  const avatarUrl = String(raw.avatarUrl || raw.avatarURL || raw.photoURL || raw.photoUrl || '').trim();
  return {
    uid: String(uid || '').trim(),
    displayName,
    handle: safeHandle,
    avatarUrl,
  };
}

function getCachedProfile(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return profileFallback('');
  return profileCache.get(cleanUid) || profileFallback(cleanUid);
}

async function ensureProfile(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return profileFallback('');
  if (profileCache.has(cleanUid)) return profileCache.get(cleanUid);
  if (profileLoading.has(cleanUid)) return profileLoading.get(cleanUid);

  const loading = (async () => {
    try {
      const snap = await getDoc(doc(db, 'neuUsers', cleanUid));
      const profile = snap.exists()
        ? normalizeProfile(cleanUid, snap.data() || {})
        : profileFallback(cleanUid);
      profileCache.set(cleanUid, profile);
      return profile;
    } catch {
      const profile = profileFallback(cleanUid);
      profileCache.set(cleanUid, profile);
      return profile;
    }
  })();

  profileLoading.set(cleanUid, loading);
  try {
    return await loading;
  } finally {
    profileLoading.delete(cleanUid);
  }
}

function mapUserChatRow(docSnap, uid) {
  const data = docSnap.data() || {};
  const conversationId = String(docSnap.id || '').trim();
  const members = Array.isArray(data.members)
    ? data.members.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  let otherUid = String(data.otherUid || '').trim();
  if (!otherUid && members.length === 2) {
    otherUid = members.find((candidate) => candidate !== uid) || '';
  }
  const profile = getCachedProfile(otherUid);
  const title = String(profile.displayName || '').trim() || String(data.otherName || '').trim() || 'Conversacion';

  return {
    id: conversationId,
    type: members.length > 2 ? 'group' : 'direct',
    participants: members,
    participantNames: members.map((memberUid) => {
      if (memberUid === uid) return currentName;
      if (memberUid === otherUid) return title;
      return memberUid.slice(0, 8) || 'Usuario';
    }),
    title,
    otherUid,
    otherName: title,
    lastMessage: {
      text: String(data.lastMessageText || '').trim(),
      senderId: String(data.lastMessageSenderId || data.lastSenderUid || '').trim(),
      senderName: '',
    },
    lastMessageText: String(data.lastMessageText || '').trim(),
    lastAt: data.lastMessageAt || data.updatedAt || null,
    updatedAt: data.updatedAt || data.lastMessageAt || null,
    unreadCount: Number(data.unreadCount || 0) || 0,
    reads: {
      [uid]: data.lastReadAt || null,
    },
  };
}

function refreshConversationProfiles() {
  conversations = conversations.map((conversation) => {
    const otherUid = String(conversation?.otherUid || '').trim();
    if (!otherUid) return conversation;
    const profile = getCachedProfile(otherUid);
    const title = String(profile.displayName || '').trim() || conversation.title || conversation.otherName || 'Conversacion';
    const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
    return {
      ...conversation,
      title,
      otherName: title,
      participantNames: participants.map((memberUid) => {
        if (memberUid === currentUid) return currentName;
        if (memberUid === otherUid) return title;
        return memberUid.slice(0, 8) || 'Usuario';
      }),
    };
  });
}

function warmConversationProfiles() {
  const targets = conversations
    .map((conversation) => String(conversation?.otherUid || '').trim())
    .filter(Boolean);

  targets.forEach((uid) => {
    ensureProfile(uid)
      .then(() => {
        refreshConversationProfiles();
        renderConversationList();
        if (activeConversationId) renderThreadMeta(activeConversationId);
      })
      .catch(() => null);
  });
}

function pageShell() {
  return {
    empty: qs('#neuInboxEmpty'),
    host: qs('#neuInboxChatHost'),
    list: qs('#neuInboxList'),
    search: qs('#neuInboxSearch'),
  };
}

function conversationListRoot() {
  return isPageMode() ? pageShell().list : qs('#miniChatList');
}

function conversationSearchInput() {
  return isPageMode() ? pageShell().search : qs('#miniChatSearch');
}

function buildFullViewHref(chat = '', chatKind = '') {
  return withNeuQuery(getNeuSocialAppPath(), {
    portal: 'pulse',
    chat,
    chatKind,
  });
}

function syncNeuUnreadBadge(count) {
  if (!isNeuSocialPage()) return;
  const button = document.querySelector(
    '.bottom-nav-btn[data-bottom-target="pulse"], .bottom-nav-btn[data-portal-target="pulse"]',
  );
  if (!(button instanceof HTMLElement)) return;

  let badge = button.querySelector('.neu-bottom-unread-badge');
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement('span');
    badge.className = 'neu-unread-badge neu-bottom-unread-badge';
    button.appendChild(badge);
  }

  const total = Number(count || 0);
  if (!total) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }

  badge.hidden = false;
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.setAttribute('aria-label', `Chats sin leer: ${total}`);
}

function setPageHostVisible(open) {
  const { empty, host } = pageShell();
  const active = open === true;
  if (empty instanceof HTMLElement) empty.hidden = active;
  if (host instanceof HTMLElement) {
    host.hidden = !active;
    host.classList.toggle('hidden', !active);
  }
}

function readRouteChatIntent() {
  const params = new URLSearchParams(location.search);
  const chat = String(params.get('chat') || '').trim();
  const chatKind = String(params.get('chatKind') || '').trim().toLowerCase();
  if (!chat) return null;
  if (currentUid && chat === currentUid) return null;
  return {
    chat,
    chatKind,
    key: `${chatKind || 'auto'}:${chat}`,
  };
}

function clearRouteChatIntent() {
  const url = new URL(location.href);
  if (!url.searchParams.has('chat') && !url.searchParams.has('chatKind')) return;
  url.searchParams.delete('chat');
  url.searchParams.delete('chatKind');
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) {
    history.replaceState(null, '', nextHref);
  }
}

const {
  acquireUploadLock,
  messageContentHtml,
  releaseUploadLock,
  uploadAttachmentToStorage,
} = createMiniChatUploadController({
  storage,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  esc,
});

const {
  clearReactionListeners,
  messageHtml,
  runSafeUnsubscribe,
  syncReactionListeners,
  toggleReaction,
  wireReactionInteractions,
  wireReactionOutsideClick,
} = createMiniChatReactionController({
  db,
  collection,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  getCurrentUid: () => currentUid,
  esc,
  fmtTime,
  messageContentHtml,
});

const {
  clearAllTypingPresenceBestEffort,
  clearTypingPresence,
  ensureTypingRefreshTimer,
  scheduleTypingHeartbeat,
  stopTypingRefreshTimer,
  updateTypingIndicatorsFromConversations,
} = createMiniChatTypingController({
  db,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  getCurrentUid: () => currentUid,
  getCurrentName: () => currentName,
  getConversations: () => conversations,
  getActiveConversationId: () => activeConversationId,
  getOpenThreads: () => openThreads,
  getConversationTitle,
  maybeDate,
  norm,
  qs,
});

const firestoreController = createMiniChatFirestoreController({
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  uploadAttachmentToStorage,
  where,
  writeBatch,
  getCurrentUid: () => currentUid,
  getCurrentName: () => currentName,
  getActiveConversationId: () => activeConversationId,
  setActiveConversationId: (value) => {
    activeConversationId = String(value || '').trim();
  },
  getConversationMeta: (conversationId) =>
    conversations.find((item) => String(item?.id || '').trim() === String(conversationId || '').trim()) || null,
  panelReactionState,
  renderMessages,
  renderThreadWindowMessages,
  renderConversationList,
  renderThreadMeta,
  setView,
  setOpenLinks,
  markConversationRead,
  clearReactionListeners,
  syncReactionListeners,
  runSafeUnsubscribe,
  clearTypingPresence,
  updateTypingIndicatorsFromConversations,
  getThreadUnread: (conversationId) => threadUnread.get(String(conversationId || '').trim()) || 0,
  setThreadUnread: (conversationId, count) => {
    threadUnread.set(String(conversationId || '').trim(), Math.max(0, Number(count || 0)));
  },
  isThreadMinimized: (conversationId) => minimizedThreads.has(String(conversationId || '').trim()),
  renderTray,
});

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

function wirePageHostControls(host) {
  if (!(host instanceof HTMLElement)) return;
  if (host.dataset.miniChatWired === '1') return;
  host.dataset.miniChatWired = '1';

  const backBtn = qs('#miniChatBack', host);
  const attachBtn = qs('#miniChatAttach', host);
  const fileInput = qs('#miniChatFileInput', host);
  const sendBtn = qs('#miniChatSend', host);
  const textInput = qs('#miniChatInput', host);
  const searchInput = conversationSearchInput();

  backBtn?.addEventListener('click', () => {
    firestoreController.setActiveConversation('');
  });

  sendBtn?.addEventListener('click', () => sendMessage());
  attachBtn?.addEventListener('click', () => {
    if (panelUploadState.uploading || !(fileInput instanceof HTMLInputElement)) return;
    fileInput.click();
  });
  fileInput?.addEventListener('change', () => {
    handlePanelAttachmentUpload(fileInput).catch((error) => {
      console.warn('[mini-chat-v4] page attachment failed', error);
    });
  });

  if (searchInput instanceof HTMLInputElement && searchInput.dataset.miniChatWired !== '1') {
    searchInput.dataset.miniChatWired = '1';
    searchInput.addEventListener('input', () => filterConversationList());
  }

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
}

function ensurePageHost() {
  if (!isPageMode()) return null;
  const { host } = pageShell();
  if (!(host instanceof HTMLElement)) return null;

  if (host.dataset.miniChatMounted !== '1') {
    host.innerHTML = buildInboxThreadMarkup();
    host.dataset.miniChatMounted = '1';
  }

  wirePageHostControls(host);
  setPageHostVisible(Boolean(activeConversationId));
  return host;
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
    await firestoreController.sendAttachmentToConversation(convId, file, (progress) => {
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
    await firestoreController.sendAttachmentToConversation(convId, file, (progress) => {
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
    await firestoreController.sendMessageToConversation(activeConversationId, text);
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
  if (isPageMode()) {
    const existingRoot = document.getElementById('miniChatThreadRoot');
    if (existingRoot) existingRoot.remove();
    return null;
  }

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
  if (isPageMode()) {
    return;
  }

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
  container.innerHTML = buildThreadWindowMarkup();

  const threadRoot = ensureThreadRoot();
  if (!(threadRoot instanceof HTMLElement)) return;
  threadRoot.appendChild(container);
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
  threadState.unsub = firestoreController.attachMessageStreamForWindow(
    convId,
    container,
    threadState,
  );

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
      await firestoreController.sendMessageToConversation(convId, text);
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

function stopAllStreams() {
  firestoreController.stopMessageStream();
  runSafeUnsubscribe(convUnsub);
  convUnsub = null;
}

async function runRouteChatIntent() {
  if (!isPageMode() || !currentUid) return;
  const intent = readRouteChatIntent();
  if (!intent) return;
  if (routeChatIntentKey === intent.key) return;

  routeChatIntentKey = intent.key;
  clearRouteChatIntent();

  const conversationId =
    intent.chatKind === 'conversation'
      ? intent.chat
      : conversations.find((item) => String(item?.id || '').trim() === intent.chat)?.id || '';

  if (conversationId) {
    openConversation(conversationId);
    return;
  }

  await ensureConversationWith(intent.chat, '');
}

function setUnreadBadge(count) {
  const badge = qs('#miniChatBadge');
  const total = Number(count || 0);
  if (badge instanceof HTMLElement) {
    if (!total) {
      badge.style.display = 'none';
      badge.textContent = '0';
    } else {
      badge.style.display = 'inline-flex';
      badge.textContent = total > 99 ? '99+' : String(total);
    }
  }
  syncNeuUnreadBadge(total);
}

function setOpenLinks(conversationId) {
  const href = conversationId
    ? buildFullViewHref(conversationId, 'conversation')
    : buildFullViewHref('', '');

  const full = qs('#miniChatOpenFull');
  const info = qs('#miniChatOpenThread');
  if (full) full.href = href;
  if (info) info.href = href;
}

function markConversationRead(conversationId, lastMessageId = '') {
  if (!conversationId || !currentUid) return;

  const payload = {
    unreadCount: 0,
    lastReadAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const safeMessageId = String(lastMessageId || '').trim();
  if (safeMessageId) payload.lastReadMessageId = safeMessageId;

  setDoc(doc(db, 'neuUserChats', currentUid, 'chats', conversationId), payload, {
    merge: true,
  }).catch(() => null);
}

function setDockOpen(open) {
  if (isPageMode()) return;
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
  if (isPageMode()) return;
  const dock = qs('#miniChatDock');
  const panel = qs('#miniChatPanel');
  if (!dock || !panel) return;

  dock.classList.add('is-minimized');
  dock.classList.remove('is-open');
  panel.hidden = true;
}

function setView(view) {
  if (isPageMode()) {
    ensurePageHost();
    const threadView = qs('#miniChatThreadView');
    if (threadView) threadView.hidden = view !== 'thread';
    setPageHostVisible(view === 'thread' && Boolean(activeConversationId));
    return;
  }

  const listView = qs('#miniChatListView');
  const threadView = qs('#miniChatThreadView');

  if (listView) listView.hidden = view !== 'list';
  if (threadView) threadView.hidden = view !== 'thread';
}

function resizeInput() {
  const input = qs('#miniChatInput');
  if (!input) return;

  input.style.height = '0px';
  const height = Math.max(38, Math.min(98, input.scrollHeight));
  input.style.height = `${height}px`;
}

function filterConversationList() {
  const queryText = norm(conversationSearchInput()?.value || '');
  const list = conversationListRoot();
  if (!list) return;

  list.querySelectorAll('.mini-chat-v4-row').forEach((row) => {
    const haystack = String(row.dataset.search || '');
    row.style.display = !queryText || haystack.includes(queryText) ? '' : 'none';
  });
}

function renderConversationList() {
  const list = conversationListRoot();
  if (!list) return;

  const { html, unreadCount } = buildConversationListHtml({
    conversations,
    activeConversationId,
    currentUid,
    currentName,
    esc,
    norm,
  });

  setUnreadBadge(unreadCount);
  list.innerHTML = html;

  list.querySelectorAll('[data-open-conv]').forEach((row) => {
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      const conversationId = String(row.getAttribute('data-open-conv') || '').trim();
      if (!conversationId) return;
      openConversation(conversationId);
    });
  });

  filterConversationList();
}

function renderThreadMeta(conversationId) {
  const conversation =
    conversations.find((item) => item.id === conversationId) || null;
  const title = getConversationTitle(conversation, currentName, norm);
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

  body.innerHTML = buildMessagesHtml({
    rows,
    conversationId,
    reactionData,
    messageHtml,
  });
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

  body.innerHTML = buildMessagesHtml({
    rows,
    conversationId,
    reactionData,
    messageHtml,
  });
  body.scrollTop = body.scrollHeight;
}

function setThreadWindowMeta(conversationId, container) {
  if (!(container instanceof HTMLElement)) return;
  const conversation =
    conversations.find((item) => item.id === conversationId) || null;
  const title = getConversationTitle(conversation, currentName, norm);
  const titleEl = qs('.mini-chat-v4-thread-title', container);
  if (titleEl) titleEl.textContent = title;
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
  if (isPageMode()) {
    const existingTray = document.getElementById('miniChatTray');
    if (existingTray) existingTray.remove();
    return;
  }

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

function ensureDock() {
  if (isPageMode()) {
    const existingDock = qs('#miniChatDock');
    if (existingDock) existingDock.remove();
    return null;
  }

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
  backBtn?.addEventListener('click', () => firestoreController.setActiveConversation(''));
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
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  if (isPageMode()) {
    ensurePageHost();
    firestoreController.setActiveConversation(convId);
    return;
  }

  ensureDock();
  setDockOpen(true);
  firestoreController.setActiveConversation(convId);
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

  const conversationId = await firestoreController.ensureDirectConversationWithUser(peerUid, targetName);
  if (conversationId) openConversation(conversationId);
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
  hostMode = 'dock';
  routeChatIntentKey = '';
  profileCache.clear();
  profileLoading.clear();

  const dock = qs('#miniChatDock');
  if (dock) dock.remove();
  const tray = document.getElementById('miniChatTray');
  if (tray) tray.remove();
  const threadRoot = document.getElementById('miniChatThreadRoot');
  if (threadRoot) threadRoot.remove();
  const { empty, host, list, search } = pageShell();
  if (list instanceof HTMLElement) list.innerHTML = '';
  if (search instanceof HTMLInputElement) search.value = '';
  if (host instanceof HTMLElement) {
    host.innerHTML = '';
    host.hidden = true;
    host.classList.add('hidden');
    delete host.dataset.miniChatMounted;
    delete host.dataset.miniChatWired;
  }
  if (empty instanceof HTMLElement) empty.hidden = false;
  syncNeuUnreadBadge(0);

  if (window.__avMiniChatApi) {
    delete window.__avMiniChatApi;
  }
}

export function initGlobalMiniChat({ uid, displayName, mode = 'dock' } = {}) {
  const resolvedMode = isNeuSocialPage() ? 'page' : String(mode || 'dock').trim().toLowerCase();
  if (shouldDisableOnNeuSocialPage(resolvedMode)) {
    destroyGlobalMiniChat();
    return;
  }

  if (!uid) {
    destroyGlobalMiniChat();
    return;
  }

  currentName = String(displayName || 'Usuario').trim() || 'Usuario';
  const shellReady =
    resolvedMode === 'page'
      ? pageShell().host instanceof HTMLElement
      : qs('#miniChatDock') instanceof HTMLElement;

  if (currentUid === uid && hostMode === resolvedMode && shellReady) {
    if (resolvedMode === 'page') ensurePageHost();
    renderConversationList();
    runRouteChatIntent().catch((error) => {
      console.warn('[mini-chat-v4] route intent failed', error);
    });
    return;
  }

  destroyGlobalMiniChat();

  hostMode = resolvedMode === 'page' ? 'page' : 'dock';
  routeChatIntentKey = '';
  currentUid = uid;
  if (isPageMode()) ensurePageHost();
  else ensureDock();
  wireQuickOpen();

  window.__avMiniChatApi = {
    openConversation,
    openDirectConversation: ensureConversationWith,
    fullViewHref: buildFullViewHref,
  };

  const conversationQuery = query(
    collection(db, 'neuUserChats', uid, 'chats'),
    orderBy('lastMessageAt', 'desc'),
    limit(250),
  );

  convUnsub = onSnapshot(
    conversationQuery,
    (snapshot) => {
      conversations = (snapshot.docs || []).map((docSnap) => mapUserChatRow(docSnap, uid));

      renderConversationList();
      warmConversationProfiles();
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
          firestoreController.setActiveConversation('');
        } else {
          renderThreadMeta(activeConversationId);
        }
      }

      runRouteChatIntent().catch((error) => {
        console.warn('[mini-chat-v4] route intent failed', error);
      });
    },
    () => {
      conversations = [];
      activeConversationId = '';
      closeAllThreadWindows();
      renderConversationList();
      firestoreController.setActiveConversation('');
      updateTypingIndicatorsFromConversations();
    },
  );
}


