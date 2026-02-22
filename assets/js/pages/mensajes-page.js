import { app, auth, db, storage } from '../firebase-init.js';
import '../logger.js';
import {
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
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
  ref,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging.js';

const qs = (sel, root = document) => root.querySelector(sel);

const messagesPage = qs('.messages-page');
const messagesWorkspace = qs('.messages-workspace');
const chatList = qs('#chatList');
const groupList = qs('#groupList');
const supportList = qs('#supportList');
const messagesSearch = qs('#messagesSearch');
const messagesFilters = qs('#messagesFilters');
const filterAllChats = qs('#filterAllChats');
const filterUnreadChats = qs('#filterUnreadChats');
const filterGroupsChats = qs('#filterGroupsChats');
const messagesTotalCount = qs('#messagesTotalCount');
const messagesUnreadCount = qs('#messagesUnreadCount');
const messagesListTitle = qs('#messagesListTitle');
const messagesListCount = qs('#messagesListCount');
const messagesEmpty = qs('#messagesEmpty');
const messagesThread = qs('#messagesThread');
const threadMessages = qs('#threadMessages');
const threadName = qs('#threadName');
const threadMeta = qs('#threadMeta');
const threadAvatar = qs('#threadAvatar');
const threadStatus = qs('#threadStatus');
const threadTyping = qs('#threadTyping');
const btnBackToInbox = qs('#btnBackToInbox');
const btnThreadSearch = qs('#btnThreadSearch');
const threadSearch = qs('#threadSearch');
const threadSearchAttachments = qs('#threadSearchAttachments');
const threadFilterInfo = qs('#threadFilterInfo');
const threadTools = qs('#threadTools');
const btnJoinGroup = qs('#btnJoinGroup');
const btnLeaveGroup = qs('#btnLeaveGroup');
const btnToggleInfo = qs('#btnToggleInfo');
const btnCloseInfoDrawer = qs('#btnCloseInfoDrawer');
const messageInput = qs('#messageInput');
const btnSend = qs('#btnSend');
const fileInput = qs('#fileInput');
const attachmentsPreview = qs('#attachmentsPreview');
const composerEdit = qs('#composerEdit');
const composerEditText = qs('#composerEditText');
const btnCancelEdit = qs('#btnCancelEdit');
const composerReply = qs('#composerReply');
const composerReplyText = qs('#composerReplyText');
const btnCancelReply = qs('#btnCancelReply');
const btnRecord = qs('#btnRecord');
const recordHint = qs('#recordHint');
const messagesInfo = qs('#messagesInfo');
const infoBody = qs('#infoBody');
const infoActions = qs('#infoActions');
const pinnedBox = qs('#pinnedBox');
const participantsBox = qs('#participantsBox');
const requestsBox = qs('#requestsBox');

const btnNewChat = qs('#btnNewChat');
const btnNewGroup = qs('#btnNewGroup');
const btnOpenSupport = qs('#btnOpenSupport');
const modalNewChat = qs('#modalNewChat');
const closeNewChat = qs('#closeNewChat');
const newChatInput = qs('#newChatInput');
const btnSearchUser = qs('#btnSearchUser');
const newChatHint = qs('#newChatHint');
const newChatResults = qs('#newChatResults');

const modalNewGroup = qs('#modalNewGroup');
const closeNewGroup = qs('#closeNewGroup');
const groupName = qs('#groupName');
const groupDesc = qs('#groupDesc');
const groupPublic = qs('#groupPublic');
const groupJoinMode = qs('#groupJoinMode');
const btnCreateGroup = qs('#btnCreateGroup');
const newGroupHint = qs('#newGroupHint');

const tabSupport = qs('#tabSupport');
const supportAdminBox = qs('#supportAdminBox');
const supportAgentInput = qs('#supportAgentInput');
const btnAddSupportAgent = qs('#btnAddSupportAgent');
const supportAgentList = qs('#supportAgentList');
const reportsList = qs('#reportsList');
const messagesAdminWrap = qs('#messagesAdminWrap');

const toggleArchived = qs('#toggleArchived');
const togglePush = qs('#togglePush');
const messagesInboxList = qs('#messagesInboxList');

const modalReport = qs('#modalReport');
const closeReport = qs('#closeReport');
const reportReason = qs('#reportReason');
const reportDetails = qs('#reportDetails');
const btnSubmitReport = qs('#btnSubmitReport');
const reportHint = qs('#reportHint');

let CURRENT_USER = null;
let CURRENT_PROFILE = null;
let IS_ADMIN = false;
let IS_SUPPORT = false;
let PENDING_SHARE = '';

let convoUnsub = null;
let supportUnsub = null;
let groupsUnsub = null;
let messagesUnsub = null;
let conversationDocUnsub = null;

let activeConversation = null;
let activeConversationId = null;
let currentMessages = [];
let latestConversations = [];
let mobileShowInbox = false;
let activeTab = 'chats';

let pendingFiles = [];
let recorder = null;
let recording = false;
let recordChunks = [];
let typingTimer = null;
let lastTypingAt = 0;
let searchTimer = null;
let searchToken = 0;
let searchMode = false;
let searchResults = [];
let activeReply = null;
let activeEditId = null;
let activeEditSnapshot = null;
let showArchived = false;
let showUnreadOnly = false;
let infoPanelVisible = false;
let settingsUnsub = null;
let convSettings = new Map();
let statusUnsub = null;
let presenceTimer = null;
let reportsUnsub = null;
let broadcastUnsub = null;
let reportTarget = null;
let sendTimestamps = [];
let USER_SETTINGS = {};

const profileCache = new Map();
const lastNotified = new Map();
const FCM_VAPID_KEY = '';
const MAX_GROUP_MEMBERS = 200;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE_LEN = 2000;
const SEND_WINDOW_MS = 10000;
const SEND_LIMIT = 5;
const REACTIONS = [
  { key: 'like', label: '' },
  { key: 'love', label: '' },
  { key: 'laugh', label: '' },
  { key: 'wow', label: '' },
  { key: 'sad', label: '' },
];

function toDateMaybe(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTime(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function lastAtMs(item) {
  const last = toDateMaybe(item?.lastAt) || toDateMaybe(item?.createdAt);
  return last ? last.getTime() : 0;
}

function sortByLastAt(list) {
  return list.sort((a, b) => lastAtMs(b) - lastAtMs(a));
}

function formatDateTime(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function renderBroadcastList(items) {
  if (!messagesInboxList) return;
  if (!Array.isArray(items) || !items.length) {
    messagesInboxList.innerHTML = '<div class="muted">Sin novedades.</div>';
    return;
  }

  messagesInboxList.innerHTML = items
    .map((b) => {
      const title = String(b.title || 'Mensaje del equipo').trim();
      const body = String(b.body || b.message || '').trim();
      const date = formatDateTime(b.createdAt);
      const rawHref = String(b.link || 'mensajes.html').trim();
      const href = rawHref.includes('notificaciones.html')
        ? 'mensajes.html'
        : rawHref;
      return `
        <a class="inboxItem" href="${href}">
          <div class="inboxTitle">${title}</div>
          <div class="inboxBody">${body}</div>
          <div class="inboxDate">${date || ''}</div>
        </a>
      `;
    })
    .join('');
}

function listenBroadcastInbox() {
  if (!messagesInboxList) return;
  if (broadcastUnsub) broadcastUnsub();
  messagesInboxList.innerHTML = '<div class="muted">Cargando...</div>';

  const q = query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(12));
  broadcastUnsub = onSnapshot(
    q,
    (snap) => {
      const items = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderBroadcastList(items);
    },
    (e) => {
      console.warn('[messages] broadcasts load failed', e);
      messagesInboxList.innerHTML = '<div class="muted">No se pudo cargar.</div>';
    },
  );
}

function extractTokens(text) {
  const raw = String(text || '').toLowerCase();
  const matches = raw.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const unique = [];
  for (const token of matches) {
    if (token.length > 32) continue;
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 24) break;
  }
  return unique;
}

function buildMessageIndex(text, attachments, extraText = '') {
  const attachmentNames = (attachments || [])
    .map((a) => String(a?.name || '').toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const textLower = String(text || '').toLowerCase().trim();
  const extraLower = String(extraText || '').toLowerCase().trim();
  const tokens = extractTokens(`${textLower} ${extraLower} ${attachmentNames.join(' ')}`);
  return {
    textLower,
    tokens,
    hasAttachments: Array.isArray(attachments) && attachments.length > 0,
    attachmentNames,
  };
}

function normText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUserSearchFields(item) {
  const display = normText(item?.displayNameLower || item?.displayName || item?.name || '');
  const handle = normText(item?.handleLower || item?.handle || '');
  const email = normText(item?.emailLower || item?.email || '');
  return { display, handle, email };
}

function matchesUserSearch(item, q) {
  const needle = normText(q);
  if (!needle) return false;
  const { display, handle, email } = getUserSearchFields(item);
  return display.includes(needle) || handle.includes(needle) || email.includes(needle);
}

function userSearchRank(item, q) {
  const needle = normText(q);
  const { display, handle } = getUserSearchFields(item);
  if (handle.startsWith(needle)) return 0;
  if (display.startsWith(needle)) return 1;
  if (handle.includes(needle)) return 2;
  if (display.includes(needle)) return 3;
  return 4;
}

async function getPublicProfile(uid) {
  if (!uid) return null;
  if (profileCache.has(uid)) return profileCache.get(uid);
  const snap = await getDoc(doc(db, 'public_users', uid));
  const data = snap.exists() ? snap.data() : {};
  profileCache.set(uid, data);
  return data;
}

function userDisplay(profile, fallback = 'Usuario') {
  return (
    profile?.displayName ||
    profile?.name ||
    profile?.handle ||
    fallback
  );
}

function buildAvatarText(name) {
  const text = String(name || '').trim();
  if (!text) return 'AV';
  return text.slice(0, 2).toUpperCase();
}

function convoBadge(convo) {
  if (!convo) return '';
  if (convo.type === 'group') return 'Grupo';
  if (convo.type === 'support') return 'Soporte';
  return '';
}

function convoUnread(convo) {
  if (!convo || !CURRENT_USER) return false;
  const lastAt = toDateMaybe(convo.lastAt);
  if (!lastAt) return false;
  if (convo.lastMessage?.senderId === CURRENT_USER.uid) return false;
  const readRaw = convo.reads ? convo.reads[CURRENT_USER.uid] : null;
  const readAt = toDateMaybe(readRaw);
  if (!readAt) return true;
  return lastAt.getTime() > readAt.getTime();
}

function getConversationSetting(convId) {
  return convSettings.get(convId) || {};
}

function isConversationMuted(convId) {
  return getConversationSetting(convId).muted === true;
}

function isConversationArchived(convId) {
  return getConversationSetting(convId).archived === true;
}

async function setConversationSetting(convId, patch) {
  if (!CURRENT_USER || !convId) return;
  const ref = doc(db, 'users', CURRENT_USER.uid, 'conversations', convId);
  await setDoc(
    ref,
    {
      ...patch,
      updatedAt: serverTimestamp(),
      convId,
    },
    { merge: true },
  );
}

function listenConversationSettings() {
  if (!CURRENT_USER) return;
  if (settingsUnsub) settingsUnsub();
  const ref = collection(db, 'users', CURRENT_USER.uid, 'conversations');
  settingsUnsub = onSnapshot(ref, (snap) => {
    const map = new Map();
    snap.docs.forEach((d) => {
      map.set(d.id, d.data() || {});
    });
    convSettings = map;
    applySearchFilter();
    if (chatList && chatList.children.length) {
      const list = Array.from(chatList.querySelectorAll('.message-item'));
      list.forEach((item) => {
        if (!item.dataset.id) return;
        const muted = isConversationMuted(item.dataset.id);
        item.classList.toggle('is-muted', muted);
      });
    }
  });
}

function readStatusForMessage(msg) {
  if (!activeConversation || !CURRENT_USER) return '';
  if (msg.senderId !== CURRENT_USER.uid) return '';
  const msgAt = toDateMaybe(msg.createdAt);
  if (!msgAt) return '';
  const others = (activeConversation.participants || []).filter(
    (uid) => uid && uid !== CURRENT_USER.uid,
  );
  if (!others.length) return '';
  let seen = 0;
  others.forEach((uid) => {
    const readAt = toDateMaybe(activeConversation.reads?.[uid]);
    if (readAt && readAt.getTime() >= msgAt.getTime()) seen += 1;
  });
  if (!seen) return 'Enviado';
  if (seen === others.length) return 'Visto';
  return `Visto por ${seen}`;
}

async function markRead(convId) {
  if (!CURRENT_USER || !convId) return;
  try {
    const field = `reads.${CURRENT_USER.uid}`;
    await updateDoc(doc(db, 'conversations', convId), {
      [field]: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[messages] mark read failed', e);
  }
}

async function bumpTyping() {
  if (!CURRENT_USER || !activeConversationId) return;
  const now = Date.now();
  if (now - lastTypingAt < 1500) {
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(clearTyping, 4000);
    return;
  }
  lastTypingAt = now;
  try {
    const field = `typing.${CURRENT_USER.uid}`;
    await updateDoc(doc(db, 'conversations', activeConversationId), {
      [field]: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[typing] update failed', e);
  }
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 4000);
}

async function clearTyping() {
  if (!CURRENT_USER || !activeConversationId) return;
  try {
    const field = `typing.${CURRENT_USER.uid}`;
    await updateDoc(doc(db, 'conversations', activeConversationId), {
      [field]: null,
    });
  } catch (e) {
    console.warn('[typing] clear failed', e);
  }
}

async function setPresence(state) {
  if (!CURRENT_USER) return;
  const ref = doc(db, 'user_status', CURRENT_USER.uid);
  const payload =
    state === 'online'
      ? { state: 'online', lastActiveAt: serverTimestamp() }
      : { state: 'offline', lastSeenAt: serverTimestamp() };
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.warn('[presence] update failed', e);
  }
}

function startPresence() {
  if (!CURRENT_USER) return;
  if (presenceTimer) clearInterval(presenceTimer);
  setPresence('online');
  presenceTimer = setInterval(() => setPresence('online'), 30000);
  window.addEventListener('beforeunload', () => setPresence('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPresence('offline');
    else setPresence('online');
  });
}

function listenUserStatus(uid) {
  if (!uid || !threadStatus) return;
  if (statusUnsub) statusUnsub();
  statusUnsub = onSnapshot(doc(db, 'user_status', uid), (snap) => {
    if (!snap.exists()) {
      threadStatus.textContent = '';
      return;
    }
    const data = snap.data() || {};
    const state = data.state || 'offline';
    if (state === 'online') {
      threadStatus.textContent = 'En linea';
      return;
    }
    const lastSeen = data.lastSeenAt || data.lastActiveAt;
    const label = lastSeen ? `Visto ${formatDateTime(lastSeen)}` : 'Desconectado';
    threadStatus.textContent = label;
  });
}

async function updateTypingIndicator(convo) {
  if (!threadTyping) return;
  const typing = convo?.typing || {};
  const now = Date.now();
  const entries = Object.entries(typing)
    .map(([uid, ts]) => ({ uid, ts: toDateMaybe(ts) }))
    .filter(
      (item) =>
        item.uid &&
        item.uid !== CURRENT_USER?.uid &&
        item.ts &&
        now - item.ts.getTime() < 6000,
    );
  if (!entries.length) {
    threadTyping.textContent = '';
    return;
  }
  const names = await Promise.all(
    entries.slice(0, 2).map(async (item) => {
      const profile = await getPublicProfile(item.uid);
      return userDisplay(profile, 'Usuario');
    }),
  );
  const label =
    names.length === 1
      ? `${names[0]} está escribiendo...`
      : `${names[0]} y ${names[1]} están escribiendo...`;
  threadTyping.textContent = label;
}

function updateUnreadFilterUI() {
  filterAllChats?.classList.toggle('is-active', activeTab === 'chats' && !showUnreadOnly);
  filterUnreadChats?.classList.toggle('is-active', activeTab === 'chats' && showUnreadOnly);
  filterGroupsChats?.classList.toggle('is-active', activeTab === 'groups');
  tabSupport?.classList.toggle('is-active', activeTab === 'support');
}

function getActiveTabName() {
  return activeTab || 'chats';
}

function getActiveListElement() {
  const tab = getActiveTabName();
  if (tab === 'groups') return groupList;
  if (tab === 'support') return supportList;
  return chatList;
}

function updateSidebarStats() {
  if (messagesTotalCount) {
    messagesTotalCount.textContent = String(Array.isArray(latestConversations) ? latestConversations.length : 0);
  }
  if (messagesUnreadCount) {
    const unread = Array.isArray(latestConversations)
      ? latestConversations.filter((convo) => convoUnread(convo)).length
      : 0;
    messagesUnreadCount.textContent = String(unread);
  }
}

function updateListHeaderMeta() {
  if (messagesListTitle) {
    const tab = getActiveTabName();
    messagesListTitle.textContent =
      tab === 'groups' ? 'Grupos' : tab === 'support' ? 'Support' : 'Chats';
  }
  if (messagesListCount) {
    const listEl = getActiveListElement();
    const visible = listEl
      ? Array.from(listEl.querySelectorAll('.message-item')).filter((item) => item.style.display !== 'none').length
      : 0;
    messagesListCount.textContent = String(visible);
  }
}

function isMobileMessagesLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function updateThreadViewMode() {
  if (!messagesPage) return;
  if (!isMobileMessagesLayout()) {
    messagesPage.classList.remove('is-thread-open');
    return;
  }
  const shouldOpen = !!activeConversationId && !mobileShowInbox;
  messagesPage.classList.toggle('is-thread-open', shouldOpen);
}

function updateInfoPanelVisibility() {
  if (!messagesInfo) return;
  const hasConversation = !!activeConversationId;
  if (!hasConversation) infoPanelVisible = false;
  const visible = infoPanelVisible && hasConversation;
  messagesInfo.hidden = !visible;
  messagesWorkspace?.classList.toggle('is-info-open', visible);
  messagesPage?.classList.toggle('is-drawer-open', visible);
  window.dispatchEvent(new CustomEvent('av:messages-drawer', { detail: { open: visible } }));
  btnToggleInfo?.setAttribute('aria-pressed', visible ? 'true' : 'false');
}

function setActiveTab(tab) {
  activeTab = tab || 'chats';
  chatList.classList.toggle('is-hidden', activeTab !== 'chats');
  groupList.classList.toggle('is-hidden', activeTab !== 'groups');
  supportList.classList.toggle('is-hidden', activeTab !== 'support');
  if (activeTab === 'groups' && showUnreadOnly) {
    showUnreadOnly = false;
  }
  if (activeTab === 'support' && showUnreadOnly) showUnreadOnly = false;
  updateUnreadFilterUI();
  if (isMobileMessagesLayout()) {
    mobileShowInbox = true;
    updateThreadViewMode();
  }
  updateListHeaderMeta();
}

function ensureNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

async function setupPush(user) {
  if (!user || !FCM_VAPID_KEY) return;
  if (!('serviceWorker' in navigator)) return;
  if (!(await isSupported())) return;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (token) {
      await setDoc(doc(db, 'user_push_tokens', user.uid, 'tokens', token), {
        token,
        createdAt: serverTimestamp(),
        userAgent: navigator.userAgent,
      });
    }
    onMessage(messaging, (payload) => {
      const title = payload?.notification?.title || 'Nuevo mensaje';
      const body = payload?.notification?.body || 'Tienes un nuevo mensaje.';
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    });
  } catch (e) {
    console.warn('[push] setup failed', e);
  }
}

async function clearPushTokens() {
  if (!CURRENT_USER) return;
  try {
    const snap = await getDocs(
      collection(db, 'user_push_tokens', CURRENT_USER.uid, 'tokens'),
    );
    const deletions = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletions);
  } catch (e) {
    console.warn('[push] clear tokens failed', e);
  }
}

async function loadUserSettings() {
  if (!CURRENT_USER) return;
  try {
    const snap = await getDoc(doc(db, 'user_settings', CURRENT_USER.uid));
    USER_SETTINGS = snap.exists() ? snap.data() || {} : {};
    if (togglePush) {
      togglePush.checked = USER_SETTINGS.pushEnabled !== false;
      togglePush.disabled = !FCM_VAPID_KEY;
    }
  } catch (e) {
    console.warn('[settings] load failed', e);
  }
}

function setModalOpen(el, open) {
  if (!el) return;
  el.classList.toggle('open', open);
  el.style.display = open ? 'flex' : 'none';
}

function resetComposer() {
  pendingFiles = [];
  renderAttachmentsPreview();
  if (messageInput) messageInput.value = '';
  if (recordHint) recordHint.textContent = '';
  clearReplyMessage();
  clearEditMessage();
}

function applyPendingShare() {
  const value = String(PENDING_SHARE || '').trim();
  if (!value) return false;
  if (!messageInput || messageInput.disabled) return false;
  if (String(messageInput.value || '').trim()) return false;
  messageInput.value = value;
  messageInput.focus();
  PENDING_SHARE = '';
  try {
    sessionStorage.removeItem('av_pending_share');
  } catch {}
  return true;
}

function renderAttachmentsPreview() {
  if (!attachmentsPreview) return;
  attachmentsPreview.innerHTML = '';
  pendingFiles.forEach((file, idx) => {
    const chip = document.createElement('div');
    chip.className = 'composer-chip';
    chip.textContent = file.name || `archivo-${idx + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-white-outline';
    btn.style.padding = '2px 8px';
    btn.textContent = 'Quitar';
    btn.addEventListener('click', () => {
      pendingFiles.splice(idx, 1);
      renderAttachmentsPreview();
    });
    chip.appendChild(btn);
    attachmentsPreview.appendChild(chip);
  });
}

function renderMessageBubble(msg) {
  const wrap = document.createElement('div');
  const isMine = msg.senderId === CURRENT_USER?.uid;
  wrap.className = `msg-bubble ${isMine ? 'msg-bubble--me' : 'msg-bubble--them'}`;
  if (msg.id) wrap.dataset.id = msg.id;

  if (msg.senderName && !isMine) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = msg.senderName;
    wrap.appendChild(sender);
  }

  if (msg.replyTo) {
    const reply = document.createElement('div');
    reply.className = 'msg-reply';
    const replyName = msg.replyTo.senderName || 'Usuario';
    const replyText = String(msg.replyTo.text || '').slice(0, 120);
    reply.textContent = `${replyName}: ${replyText}`;
    wrap.appendChild(reply);
  }

  if (msg.deleted) {
    const body = document.createElement('div');
    body.className = 'muted';
    body.textContent = 'Mensaje eliminado.';
    wrap.appendChild(body);
  } else {
    if (msg.text) {
      const body = document.createElement('div');
      body.textContent = msg.text;
      wrap.appendChild(body);
    }

    if (Array.isArray(msg.attachments)) {
      msg.attachments.forEach((att) => {
        const box = document.createElement('div');
        box.className = 'msg-attachment';
        if (att.contentType && att.contentType.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = att.url;
          img.alt = att.name || 'imagen';
          box.appendChild(img);
        } else if (att.contentType && att.contentType.startsWith('video/')) {
          const video = document.createElement('video');
          video.controls = true;
          video.src = att.url;
          video.style.maxWidth = '100%';
          box.appendChild(video);
        } else if (att.contentType && att.contentType.startsWith('audio/')) {
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = att.url;
          box.appendChild(audio);
        } else {
          const link = document.createElement('a');
          link.href = att.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = att.name || 'Archivo';
          box.appendChild(link);
        }
        wrap.appendChild(box);
      });
    }
  }

  const reactions = msg.reactions || {};
  const reactionRow = document.createElement('div');
  reactionRow.className = 'msg-reactions';
  let hasReactions = false;
  REACTIONS.forEach((r) => {
    const list = Array.isArray(reactions[r.key]) ? reactions[r.key] : [];
    if (!list.length) return;
    hasReactions = true;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'msg-reaction';
    if (list.includes(CURRENT_USER?.uid)) chip.classList.add('is-active');
    chip.textContent = `${r.label} ${list.length}`;
    chip.addEventListener('click', () => toggleReaction(msg, r.key));
    reactionRow.appendChild(chip);
  });
  if (hasReactions) wrap.appendChild(reactionRow);

  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  const replyBtn = document.createElement('button');
  replyBtn.type = 'button';
  replyBtn.className = 'msg-action-btn';
  replyBtn.textContent = 'Responder';
  replyBtn.addEventListener('click', () => setReplyMessage(msg));
  actions.appendChild(replyBtn);

  REACTIONS.forEach((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msg-action-btn';
    btn.textContent = r.label;
    btn.addEventListener('click', () => toggleReaction(msg, r.key));
    actions.appendChild(btn);
  });

  if (canEditMessage(msg)) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'msg-action-btn';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => setEditMessage(msg));
    actions.appendChild(editBtn);
  }

  if (canDeleteMessage(msg)) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'msg-action-btn';
    delBtn.textContent = 'Borrar';
    delBtn.addEventListener('click', () => deleteMessage(msg));
    actions.appendChild(delBtn);
  }

  if (canPinMessage()) {
    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'msg-action-btn';
    pinBtn.textContent = 'Fijar';
    pinBtn.addEventListener('click', () => togglePinMessage(msg));
    actions.appendChild(pinBtn);
  }

  const reportBtn = document.createElement('button');
  reportBtn.type = 'button';
  reportBtn.className = 'msg-action-btn';
  reportBtn.textContent = 'Reportar';
  reportBtn.addEventListener('click', () => openReportModal(msg));
  actions.appendChild(reportBtn);

  wrap.appendChild(actions);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const readStatus = readStatusForMessage(msg);
  const edited = msg.editedAt ? 'Editado' : '';
  meta.textContent = [formatTime(msg.createdAt), edited, readStatus].filter(Boolean).join(' · ');
  wrap.appendChild(meta);

  return wrap;
}

function renderMessages(list) {
  if (!threadMessages) return;
  threadMessages.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = searchMode ? 'Sin resultados.' : 'No hay mensajes todavia.';
    threadMessages.appendChild(empty);
    return;
  }
  list.forEach((msg) => {
    threadMessages.appendChild(renderMessageBubble(msg));
  });
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

function updateThreadSearchInfo(count) {
  if (!threadFilterInfo) return;
  threadFilterInfo.textContent = count ? `${count} resultados` : '';
}

async function applyThreadSearch() {
  if (!activeConversationId) return;
  const term = String(threadSearch?.value || '').trim();
  const onlyAttachments = !!threadSearchAttachments?.checked;
  if (!term && !onlyAttachments) {
    searchMode = false;
    updateThreadSearchInfo(0);
    renderMessages(currentMessages);
    return;
  }
  const token = ++searchToken;
  searchMode = true;
  if (threadFilterInfo) threadFilterInfo.textContent = 'Buscando...';
  const results = await searchMessages(activeConversationId, term, onlyAttachments);
  if (token !== searchToken) return;
  searchResults = results;
  updateThreadSearchInfo(results.length);
  renderMessages(results);
}

function scheduleThreadSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(applyThreadSearch, 350);
}

async function toggleReaction(msg, key) {
  if (!activeConversationId || !CURRENT_USER || !msg?.id) return;
  const list = Array.isArray(msg.reactions?.[key]) ? msg.reactions[key] : [];
  const has = list.includes(CURRENT_USER.uid);
  const ref = doc(db, 'conversations', activeConversationId, 'messages', msg.id);
  try {
    await updateDoc(ref, {
      [`reactions.${key}`]: has ? arrayRemove(CURRENT_USER.uid) : arrayUnion(CURRENT_USER.uid),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[reactions] update failed', e);
  }
}

async function logAudit(action, msg, extra = {}) {
  if (!activeConversationId || !CURRENT_USER) return;
  try {
    await addDoc(collection(db, 'conversations', activeConversationId, 'audit'), {
      action,
      messageId: msg?.id || '',
      actorId: CURRENT_USER.uid,
      actorName: userDisplay(CURRENT_PROFILE, 'Usuario'),
      before: msg ? { text: msg.text || '', attachments: msg.attachments || [] } : {},
      after: extra.after || {},
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[audit] log failed', e);
  }
}

async function deleteMessage(msg) {
  if (!activeConversationId || !msg?.id) return;
  if (!confirm('¿Borrar este mensaje?')) return;
  const ref = doc(db, 'conversations', activeConversationId, 'messages', msg.id);
  try {
    await updateDoc(ref, {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: CURRENT_USER.uid,
      text: '',
      textLower: '',
      tokens: [],
      attachments: [],
      attachmentNames: [],
      hasAttachments: false,
    });
    await logAudit('delete', msg, { after: { deleted: true } });
    if (activeConversation?.lastMessageId === msg.id) {
      await updateDoc(doc(db, 'conversations', activeConversationId), {
        lastMessage: { text: 'Mensaje eliminado', senderId: msg.senderId || '' },
        lastAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[messages] delete failed', e);
  }
}

async function togglePinMessage(msg) {
  if (!activeConversationId || !msg?.id || !canPinMessage()) return;
  const pinned = Array.isArray(activeConversation?.pinned)
    ? activeConversation.pinned
    : [];
  const exists = pinned.includes(msg.id);
  const maxPins = 5;
  const next = exists
    ? pinned.filter((id) => id !== msg.id)
    : [...pinned, msg.id].slice(0, maxPins);
  try {
    await updateDoc(doc(db, 'conversations', activeConversationId), {
      pinned: next,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[pin] update failed', e);
  }
}

function openReportModal(msg) {
  reportTarget = msg?.id || null;
  if (reportHint) reportHint.textContent = '';
  if (reportDetails) reportDetails.value = '';
  setModalOpen(modalReport, true);
}

async function submitReport() {
  if (!CURRENT_USER || !activeConversationId) return;
  const payload = {
    convId: activeConversationId,
    messageId: reportTarget || '',
    reason: reportReason?.value || 'other',
    details: String(reportDetails?.value || '').trim(),
    reportedBy: CURRENT_USER.uid,
    reportedName: userDisplay(CURRENT_PROFILE, 'Usuario'),
    createdAt: serverTimestamp(),
    status: 'open',
  };
  try {
    await addDoc(collection(db, 'reports'), payload);
    if (reportHint) reportHint.textContent = 'Reporte enviado.';
    reportTarget = null;
    setTimeout(() => setModalOpen(modalReport, false), 600);
  } catch (e) {
    console.warn('[reports] send failed', e);
    if (reportHint) reportHint.textContent = 'No se pudo enviar.';
  }
}

async function exportConversation() {
  if (!activeConversationId) return;
  const data = {
    conversation: activeConversationId,
    exportedAt: new Date().toISOString(),
    messages: currentMessages,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation_${activeConversationId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function deleteMyMessages() {
  if (!activeConversationId || !CURRENT_USER) return;
  if (!confirm('¿Borrar tus mensajes en esta conversación?')) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'conversations', activeConversationId, 'messages'),
        where('senderId', '==', CURRENT_USER.uid),
        limit(200),
      ),
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: CURRENT_USER.uid,
        text: '',
        textLower: '',
        tokens: [],
        attachments: [],
        attachmentNames: [],
        hasAttachments: false,
      });
    });
    await batch.commit();
  } catch (e) {
    console.warn('[messages] bulk delete failed', e);
  }
}

function scrollToMessage(msgId) {
  if (!msgId || !threadMessages) return;
  const el = threadMessages.querySelector(`[data-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-highlight');
    setTimeout(() => el.classList.remove('is-highlight'), 1200);
  }
}

function maybeNotify(convId, list) {
  if (!list.length) return;
  const last = list[list.length - 1];
  if (!last || last.senderId === CURRENT_USER?.uid) return;
  if (USER_SETTINGS.pushEnabled === false) return;
  if (isConversationMuted(convId)) return;
  if (document.hasFocus() && activeConversationId === convId) return;
  if (lastNotified.get(convId) === last.id) return;
  lastNotified.set(convId, last.id);
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const title = threadName?.textContent || 'Nuevo mensaje';
  const body = last.text || 'Adjunto';
  try {
    new Notification(title, { body });
  } catch (e) {
    console.warn('[notify] failed', e);
  }
}

async function resolveConversationTitle(convo) {
  if (!convo) return 'Conversación';
  if (convo.type === 'group' || convo.type === 'support') {
    return convo.title || (convo.type === 'support' ? 'Soporte' : 'Grupo');
  }
  const otherUid = (convo.participants || []).find((id) => id !== CURRENT_USER?.uid);
  const profile = await getPublicProfile(otherUid);
  return userDisplay(profile, 'Usuario');
}

function renderConversationItem(convo, target) {
  const item = document.createElement('div');
  item.className = 'message-item';
  item.dataset.id = convo.id;
  item.addEventListener('click', () => openConversation(convo.id, convo));
  if (isConversationMuted(convo.id)) item.classList.add('is-muted');

  const row = document.createElement('div');
  row.className = 'message-item-row';

  const avatar = document.createElement('div');
  avatar.className = 'message-item-avatar';
  avatar.textContent = 'AV';

  const content = document.createElement('div');
  content.className = 'message-item-content';

  const titleRow = document.createElement('div');
  titleRow.className = 'message-item-title-row';

  const title = document.createElement('div');
  title.className = 'message-item-title';
  title.textContent = '...';

  const badgeLabel = convoBadge(convo);
  if (badgeLabel) {
    const badge = document.createElement('span');
    badge.className = 'message-item-badge';
    badge.textContent = badgeLabel;
    titleRow.appendChild(badge);
  }
  if (isConversationMuted(convo.id)) {
    const muted = document.createElement('span');
    muted.className = 'message-item-badge';
    muted.textContent = 'Silenciado';
    titleRow.appendChild(muted);
  }
  if (isConversationArchived(convo.id)) {
    const archived = document.createElement('span');
    archived.className = 'message-item-badge';
    archived.textContent = 'Archivado';
    titleRow.appendChild(archived);
  }

  titleRow.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'message-item-meta';
  const lastText = convo?.lastMessage?.text || '';
  meta.textContent = lastText ? lastText.slice(0, 80) : 'Sin mensajes.';

  content.appendChild(titleRow);
  content.appendChild(meta);

  const right = document.createElement('div');
  right.className = 'message-item-right';
  const time = document.createElement('div');
  time.textContent = formatTime(convo.lastAt);
  right.appendChild(time);
  const unread = convoUnread(convo);
  item.dataset.unread = unread ? '1' : '0';
  if (unread) {
    const dot = document.createElement('div');
    dot.className = 'message-item-unread';
    right.appendChild(dot);
  }

  row.appendChild(avatar);
  row.appendChild(content);
  row.appendChild(right);
  item.appendChild(row);

  target.appendChild(item);

  resolveConversationTitle(convo).then((name) => {
    title.textContent = name;
    item.dataset.name = normText(name);
    avatar.textContent =
      convo.type === 'support' ? ''
        : convo.type === 'group'
          ? buildAvatarText(convo.title || name)
          : buildAvatarText(name);
  });

  if (activeConversationId === convo.id) item.classList.add('is-active');
}

function renderConversationList(list, target) {
  if (!target) return;
  target.innerHTML = '';
  const filtered = list.filter(
    (c) => showArchived || !isConversationArchived(c.id),
  );
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Sin conversaciones.';
    target.appendChild(empty);
    return;
  }
  filtered.forEach((c) => renderConversationItem(c, target));
}

async function renderPublicGroups(list) {
  if (!groupList) return;
  groupList.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No hay grupos publicos.';
    groupList.appendChild(empty);
    return;
  }
  list.forEach((group) => {
    const item = document.createElement('div');
    item.className = 'message-item';
    item.dataset.id = group.id;
    item.dataset.name = normText(group.title);
    item.dataset.unread = '0';

    const row = document.createElement('div');
    row.className = 'message-item-row';

    const avatar = document.createElement('div');
    avatar.className = 'message-item-avatar';
    avatar.textContent = buildAvatarText(group.title || 'Grupo');

    const content = document.createElement('div');
    content.className = 'message-item-content';

    const titleRow = document.createElement('div');
    titleRow.className = 'message-item-title-row';

    const badge = document.createElement('span');
    badge.className = 'message-item-badge';
    badge.textContent = 'Grupo';

    const title = document.createElement('div');
    title.className = 'message-item-title';
    title.textContent = group.title || 'Grupo';

    titleRow.appendChild(badge);
    titleRow.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'message-item-meta';
    const count = group.memberCount || (group.participants || []).length || 0;
    meta.textContent = `${count} miembros`;

    content.appendChild(titleRow);
    content.appendChild(meta);

    row.appendChild(avatar);
    row.appendChild(content);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn-white-outline';
    const isMember = (group.participants || []).includes(CURRENT_USER?.uid);
    const isFull = count >= MAX_GROUP_MEMBERS;
    action.textContent = isFull
      ? 'Lleno'
      : isMember
        ? 'Entrar'
        : group.joinMode === 'approval'
          ? 'Solicitar'
          : 'Unirme';
    action.disabled = isFull;

    action.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isMember) {
        openConversation(group.id, group);
        return;
      }
      await handleJoinGroup(group);
    });

    item.appendChild(row);
    item.appendChild(action);
    item.addEventListener('click', () => openConversation(group.id, group));
    groupList.appendChild(item);
  });
}

function applySearchFilter() {
  const q = normText(messagesSearch?.value || '');
  const currentTab = getActiveTabName();
  const listEl = currentTab === 'groups' ? groupList : (currentTab === 'support' ? supportList : chatList);
  if (!listEl) return;
  listEl.querySelectorAll('.message-item').forEach((item) => {
    const name = item.dataset.name || '';
    const isUnread = item.dataset.unread === '1';
    const archived = currentTab === 'chats' && isConversationArchived(item.dataset.id);
    const shouldHide =
      (!showArchived && archived) ||
      (q && !name.includes(q)) ||
      (currentTab === 'chats' && showUnreadOnly && !isUnread);
    item.style.display = shouldHide ? 'none' : '';
    item.classList.toggle('is-muted', isConversationMuted(item.dataset.id));
  });
  updateListHeaderMeta();
}

function setComposerEnabled(enabled, placeholder = 'Escribe un mensaje...') {
  if (messageInput) {
    messageInput.disabled = !enabled;
    messageInput.placeholder = enabled ? 'Escribe un mensaje...' : placeholder;
  }
  if (btnSend) btnSend.disabled = !enabled;
  if (fileInput) fileInput.disabled = !enabled;
  if (btnRecord) btnRecord.disabled = !enabled;
}

function canEditMessage(msg) {
  return msg && CURRENT_USER && msg.senderId === CURRENT_USER.uid && !msg.deleted;
}

function canDeleteMessage(msg) {
  return msg && CURRENT_USER && msg.senderId === CURRENT_USER.uid && !msg.deleted;
}

function canPinMessage() {
  if (!activeConversation || !CURRENT_USER) return false;
  return (
    activeConversation.ownerId === CURRENT_USER.uid ||
    (activeConversation.admins || []).includes(CURRENT_USER.uid)
  );
}

function getDmPeerUid(convo, myUid) {
  if (!convo || convo.type !== 'dm') return '';
  const participants = Array.isArray(convo.participants) ? convo.participants : [];
  const peer = participants.find((uid) => uid && uid !== myUid);
  return String(peer || '').trim();
}

function setReplyMessage(msg) {
  if (!msg || !composerReply || !composerReplyText) return;
  if (activeEditId) clearEditMessage();
  activeReply = {
    id: msg.id,
    text: String(msg.text || '').slice(0, 120),
    senderName: msg.senderName || 'Usuario',
    senderId: msg.senderId || '',
  };
  composerReplyText.textContent = `Respondiendo a ${activeReply.senderName}: ${activeReply.text}`;
  composerReply.hidden = false;
}

function clearReplyMessage() {
  activeReply = null;
  if (composerReply) composerReply.hidden = true;
  if (composerReplyText) composerReplyText.textContent = '';
}

function setEditMessage(msg) {
  if (!msg || !composerEdit || !composerEditText || !messageInput) return;
  if (activeReply) clearReplyMessage();
  activeEditId = msg.id;
  activeEditSnapshot = { ...msg };
  composerEditText.textContent = `Editando: ${String(msg.text || '').slice(0, 120)}`;
  composerEdit.hidden = false;
  messageInput.value = String(msg.text || '');
  messageInput.focus();
  if (btnSend) btnSend.textContent = 'Guardar';
}

function clearEditMessage() {
  activeEditId = null;
  activeEditSnapshot = null;
  if (composerEdit) composerEdit.hidden = true;
  if (composerEditText) composerEditText.textContent = '';
  if (btnSend) btnSend.textContent = 'Enviar';
}

function messageMatchesSearch(msg, term, onlyAttachments) {
  const q = normText(term);
  if (onlyAttachments && !(msg?.attachments || []).length) return false;
  if (!q) return true;
  const text = String(msg?.textLower || msg?.text || '').toLowerCase();
  if (text.includes(q)) return true;
  const replyText = String(msg?.replyTo?.text || '').toLowerCase();
  if (replyText && replyText.includes(q)) return true;
  const names = Array.isArray(msg?.attachmentNames)
    ? msg.attachmentNames
    : (msg?.attachments || []).map((a) => String(a?.name || '').toLowerCase());
  return names.some((n) => n.includes(q));
}

function dedupeMessages(list) {
  const map = new Map();
  list.forEach((msg) => {
    if (msg?.id) map.set(msg.id, msg);
  });
  return Array.from(map.values());
}

async function searchMessages(convId, term, onlyAttachments) {
  if (!convId) return [];
  const token = extractTokens(term)[0];
  let remote = [];
  if (token) {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'conversations', convId, 'messages'),
          where('tokens', 'array-contains', token),
          limit(200),
        ),
      );
      remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    } catch (e) {
      console.warn('[search] remote failed', e);
    }
  }
  const local = currentMessages.filter((msg) => messageMatchesSearch(msg, term, onlyAttachments));
  const merged = dedupeMessages([...local, ...remote]).filter((msg) =>
    messageMatchesSearch(msg, term, onlyAttachments),
  );
  return merged.sort((a, b) => {
    const aTime = toDateMaybe(a.createdAt)?.getTime() || 0;
    const bTime = toDateMaybe(b.createdAt)?.getTime() || 0;
    return aTime - bTime;
  });
}

async function applyConversationState(convo) {
  if (!convo) return;
  const name = await resolveConversationTitle(convo);
  threadName.textContent = name;
  threadAvatar.textContent =
    convo.type === 'support' ? ''
      : convo.type === 'group'
        ? buildAvatarText(convo.title || name)
        : buildAvatarText(name);
  const count = convo.memberCount || (convo.participants || []).length || 0;
  const meta = convo.type === 'group'
    ? `${count} miembros`
    : (convo.type === 'support' ? 'Soporte' : 'Directo');
  threadMeta.textContent = meta;
  if (convo.type === 'dm') {
    const otherUid = (convo.participants || []).find((id) => id !== CURRENT_USER?.uid);
    listenUserStatus(otherUid);
  } else if (threadStatus) {
    threadStatus.textContent = '';
    if (statusUnsub) {
      statusUnsub();
      statusUnsub = null;
    }
  }
  await updateTypingIndicator(convo);

  btnJoinGroup.hidden = true;
  btnLeaveGroup.hidden = true;
  if (convo.type === 'group') {
    const isMember = (convo.participants || []).includes(CURRENT_USER?.uid);
    const isFull = count >= MAX_GROUP_MEMBERS;
    setComposerEnabled(isMember, 'Unete al grupo para escribir.');
    btnJoinGroup.hidden = isMember;
    btnLeaveGroup.hidden = !isMember;
    if (convo.joinMode === 'approval' && !isMember) {
      const reqSnap = await getDoc(
        doc(db, 'conversations', convo.id, 'requests', CURRENT_USER.uid),
      );
      if (reqSnap.exists()) {
        btnJoinGroup.textContent = 'Solicitud enviada';
        btnJoinGroup.disabled = true;
      } else {
        btnJoinGroup.textContent = isFull ? 'Lleno' : 'Solicitar';
        btnJoinGroup.disabled = isFull;
      }
    } else {
      btnJoinGroup.textContent = isFull ? 'Lleno' : 'Unirme';
      btnJoinGroup.disabled = isFull;
    }
  } else {
    setComposerEnabled(true);
  }
}

function listenConversationDoc(id) {
  if (conversationDocUnsub) conversationDocUnsub();
  conversationDocUnsub = onSnapshot(doc(db, 'conversations', id), async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() || {};
    activeConversation = { id, ...data };
    await applyConversationState(activeConversation);
    await renderInfoPanel(activeConversation);
    if (currentMessages.length) {
      if (searchMode) applyThreadSearch();
      else renderMessages(currentMessages);
    }
  });
}

async function openConversation(id, convo) {
  if (!id) return;
  if (activeConversationId && activeConversationId !== id) {
    await clearTyping();
  }
  activeConversationId = id;
  mobileShowInbox = false;
  updateThreadViewMode();
  if (!convo) {
    try {
      const snap = await getDoc(doc(db, 'conversations', id));
      activeConversation = snap.exists() ? snap.data() : null;
    } catch (e) {
      console.warn('[conversation] load failed', e);
      return;
    }
  } else {
    activeConversation = convo;
  }
  if (!activeConversation) {
    activeConversationId = null;
    mobileShowInbox = true;
    updateThreadViewMode();
    return;
  }
  activeConversation.id = id;
  currentMessages = [];
  resetComposer();
  if (threadSearch) threadSearch.value = '';
  if (threadSearchAttachments) threadSearchAttachments.checked = false;
  if (threadTools) threadTools.hidden = true;
  searchMode = false;
  updateThreadSearchInfo(0);
  if (isConversationArchived(id)) {
    setConversationSetting(id, { archived: false });
  }

  document.querySelectorAll('.message-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.id === id);
  });

  messagesEmpty.hidden = true;
  messagesThread.hidden = false;
  updateThreadViewMode();
  updateInfoPanelVisibility();

  if (activeConversation.type === 'support' && IS_SUPPORT) {
    const isMember = (activeConversation.participants || []).includes(CURRENT_USER?.uid);
    if (!isMember) {
      await updateDoc(doc(db, 'conversations', id), {
        participants: arrayUnion(CURRENT_USER.uid),
        memberCount: increment(1),
      });
    }
  }

  if ((activeConversation.participants || []).includes(CURRENT_USER?.uid)) {
    await markRead(id);
  }
  await applyConversationState(activeConversation);
  applyPendingShare();
  listenConversationDoc(id);
  const isMember = (activeConversation.participants || []).includes(CURRENT_USER?.uid);
  if (activeConversation.type === 'group' && !isMember) {
    if (messagesUnsub) messagesUnsub();
    if (threadMessages) {
      threadMessages.innerHTML = '<div class="muted">Unete al grupo para ver mensajes.</div>';
    }
  } else {
    listenMessages(id);
  }
}

async function renderInfoPanel(convo) {
  if (!infoBody || !requestsBox || !participantsBox) return;
  infoBody.innerHTML = '';
  requestsBox.innerHTML = '';
  participantsBox.innerHTML = '';
  if (infoActions) infoActions.innerHTML = '';
  if (pinnedBox) pinnedBox.innerHTML = '';
  const typeLabel = convo.type === 'group' ? 'Grupo' : (convo.type === 'support' ? 'Soporte' : 'Directo');
  const isPublic = convo.public ? 'Publico' : 'Privado';
  infoBody.innerHTML = `
    <div><strong>Tipo:</strong> ${typeLabel}</div>
    ${convo.type === 'group' ? `<div><strong>Visibilidad:</strong> ${isPublic}</div>` : ''}
    ${convo.type === 'group' ? `<div><strong>Ingreso:</strong> ${convo.joinMode === 'approval' ? 'Con aprobacion' : 'Abierto'}</div>` : ''}
    <div><strong>Miembros:</strong> ${convo.memberCount || (convo.participants || []).length || 0}</div>
  `;

  if (infoActions) {
    const muted = isConversationMuted(convo.id);
    const archived = isConversationArchived(convo.id);
    infoActions.innerHTML = `
      <button class="btn-white-outline" id="btnToggleMute" type="button">
        ${muted ? 'Activar notificaciones' : 'Silenciar'}
      </button>
      <button class="btn-white-outline" id="btnToggleArchive" type="button">
        ${archived ? 'Desarchivar' : 'Archivar'}
      </button>
      <button class="btn-white-outline" id="btnExport" type="button">Exportar</button>
      <button class="btn-white-outline" id="btnReport" type="button">Reportar</button>
      <button class="btn-white-outline" id="btnDeleteMine" type="button">Borrar mis mensajes</button>
    `;
  }

  if (pinnedBox) {
    const pinned = Array.isArray(convo.pinned) ? convo.pinned : [];
    if (!pinned.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Sin mensajes fijados.';
      pinnedBox.appendChild(empty);
    } else {
      pinned.forEach((id) => {
        const msg = currentMessages.find((m) => m.id === id);
        const text = msg?.text || msg?.replyTo?.text || 'Mensaje';
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.innerHTML = `
          <span>${String(text || '').slice(0, 80)}</span>
          <div class="metaRow" style="gap: 6px">
            <button class="btn-white-outline" data-jump="${id}">Ver</button>
            ${canPinMessage() ? `<button class="btn-white-outline" data-unpin="${id}">Quitar</button>` : ''}
          </div>
        `;
        pinnedBox.appendChild(item);
      });
    }
  }

  if (convo.type === 'group') {
    const isAdmin = convo.ownerId === CURRENT_USER?.uid || (convo.admins || []).includes(CURRENT_USER?.uid);
    const participants = convo.participants || [];
    if (participants.length) {
      const shown = participants.slice(0, 20);
      for (const uid of shown) {
        const profile = await getPublicProfile(uid);
        const name = userDisplay(profile, uid);
        const item = document.createElement('div');
        item.className = 'participant-item';
        item.innerHTML = `<span>${name}</span>`;
        if (isAdmin && uid !== CURRENT_USER?.uid) {
          const actions = document.createElement('div');
          actions.className = 'metaRow';
          actions.style.gap = '6px';
          const btnRemove = document.createElement('button');
          btnRemove.className = 'btn-white-outline';
          btnRemove.textContent = 'Quitar';
          btnRemove.setAttribute('data-remove', uid);
          const btnBan = document.createElement('button');
          btnBan.className = 'btn-white-outline';
          btnBan.textContent = 'Bloquear';
          btnBan.setAttribute('data-ban', uid);
          actions.appendChild(btnRemove);
          actions.appendChild(btnBan);
          item.appendChild(actions);
        }
        participantsBox.appendChild(item);
      }
      if (participants.length > 20) {
        const more = document.createElement('div');
        more.className = 'muted';
        more.textContent = `+${participants.length - 20} miembros más`;
        participantsBox.appendChild(more);
      }
    }

    if (isAdmin) {
      const snap = await getDocs(
        query(collection(db, 'conversations', convo.id, 'requests'), where('status', '==', 'pending')),
      );
      if (!snap.empty) {
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const reqItem = document.createElement('div');
          reqItem.className = 'request-item';
          reqItem.innerHTML = `
            <span>${data.name || data.handle || data.uid}</span>
            <div class="metaRow" style="gap: 6px">
              <button class="btn-white-outline" data-approve="${docSnap.id}">Aceptar</button>
              <button class="btn-white-outline" data-deny="${docSnap.id}">Rechazar</button>
            </div>
          `;
          requestsBox.appendChild(reqItem);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'Sin solicitudes pendientes.';
        requestsBox.appendChild(empty);
      }
    }
  }
}

function listenMessages(convId) {
  if (messagesUnsub) messagesUnsub();
  const msgRef = collection(db, 'conversations', convId, 'messages');
  const q = query(msgRef, orderBy('createdAt', 'asc'), limit(200));
  messagesUnsub = onSnapshot(q, (snap) => {
    const list = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));
    currentMessages = list;
    if (searchMode) applyThreadSearch();
    else renderMessages(list);
    if (activeConversation?.pinned?.length) renderInfoPanel(activeConversation);
    maybeNotify(convId, list);
    if (document.hasFocus() && activeConversationId === convId) {
      const last = list[list.length - 1];
      if (last && last.senderId !== CURRENT_USER?.uid) {
        markRead(convId);
      }
    }
  });
}

async function uploadAttachment(convId, file) {
  const safeName = String(file.name || 'archivo').replace(/[^\w.\-]+/g, '_');
  const path = `chat/${convId}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return {
    url,
    name: file.name || 'archivo',
    size: file.size || 0,
    contentType: file.type || '',
    path,
  };
}

async function sendMessage() {
  if (!activeConversationId || !CURRENT_USER) return;
  if (messageInput?.disabled) return;
  let text = String(messageInput?.value || '').trim();
  if (text.length > MAX_MESSAGE_LEN) {
    if (recordHint) recordHint.textContent = `Maximo ${MAX_MESSAGE_LEN} caracteres.`;
    return;
  }
  if (!text && pendingFiles.length === 0 && !activeEditId) return;

  const now = Date.now();
  sendTimestamps = sendTimestamps.filter((t) => now - t < SEND_WINDOW_MS);
  if (!activeEditId && sendTimestamps.length >= SEND_LIMIT) {
    if (recordHint) recordHint.textContent = 'Demasiados mensajes. Espera un momento.';
    return;
  }

  btnSend.disabled = true;
  try {
    if (activeEditId) {
      if (!text) {
        if (recordHint) recordHint.textContent = 'Escribe texto para editar.';
        return;
      }
      const ref = doc(db, 'conversations', activeConversationId, 'messages', activeEditId);
      const index = buildMessageIndex(
        text,
        activeEditSnapshot?.attachments || [],
        activeEditSnapshot?.replyTo?.text || '',
      );
      await updateDoc(ref, {
        text,
        ...index,
        editedAt: serverTimestamp(),
        editedBy: CURRENT_USER.uid,
      });
      await logAudit('edit', activeEditSnapshot, { after: { text } });
      if (activeConversation?.lastMessageId === activeEditId) {
        await updateDoc(doc(db, 'conversations', activeConversationId), {
          lastMessage: {
            text: text.slice(0, 120),
            senderId: CURRENT_USER.uid,
            senderName: userDisplay(CURRENT_PROFILE, 'Usuario'),
          },
          lastAt: serverTimestamp(),
        });
      }
      clearEditMessage();
      clearReplyMessage();
      if (messageInput) messageInput.value = '';
      return;
    }

    const attachments = [];
    if (pendingFiles.length) {
      const validFiles = pendingFiles.filter((file) => file.size <= MAX_UPLOAD_BYTES);
      if (validFiles.length !== pendingFiles.length && recordHint) {
        recordHint.textContent = `Algunos archivos superan ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB y se omitieron.`;
      }
      pendingFiles = validFiles;
      renderAttachmentsPreview();
      for (const file of pendingFiles) {
        if (file.size > MAX_UPLOAD_BYTES) {
          if (recordHint) {
            recordHint.textContent = `Archivo demasiado grande (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).`;
          }
          continue;
        }
        attachments.push(await uploadAttachment(activeConversationId, file));
      }
    }

    const replyTo = activeReply
      ? {
          id: activeReply.id,
          text: activeReply.text,
          senderName: activeReply.senderName,
          senderId: activeReply.senderId,
        }
      : null;
    const index = buildMessageIndex(text, attachments, activeReply?.text || '');
    const msgPayload = {
      senderId: CURRENT_USER.uid,
      senderName: userDisplay(CURRENT_PROFILE, 'Usuario'),
      text,
      attachments,
      replyTo,
      ...index,
      createdAt: serverTimestamp(),
    };
    const msgRef = await addDoc(collection(db, 'conversations', activeConversationId, 'messages'), msgPayload);

    const preview = text
      ? text.slice(0, 120)
      : (attachments.length ? `[Archivo] ${attachments[0].name || ''}` : 'Nuevo mensaje');
    await updateDoc(doc(db, 'conversations', activeConversationId), {
      lastMessage: {
        text: preview,
        senderId: CURRENT_USER.uid,
        senderName: userDisplay(CURRENT_PROFILE, 'Usuario'),
      },
      lastAt: serverTimestamp(),
      lastMessageId: msgRef.id,
    });

    const peerUid = getDmPeerUid(activeConversation, CURRENT_USER.uid);
    if (peerUid) {
      await Promise.allSettled([
        addDoc(collection(db, 'user_inbox', CURRENT_USER.uid, 'messages'), {
          fromUid: CURRENT_USER.uid,
          toUid: peerUid,
          peerUid,
          text: preview,
          createdAt: serverTimestamp(),
          read: true,
        }),
        addDoc(collection(db, 'user_inbox', peerUid, 'messages'), {
          fromUid: CURRENT_USER.uid,
          toUid: peerUid,
          peerUid: CURRENT_USER.uid,
          text: preview,
          createdAt: serverTimestamp(),
          read: false,
        }),
      ]);
    }

    await markRead(activeConversationId);
    await clearTyping();
    sendTimestamps.push(now);

    resetComposer();
  } catch (e) {
    console.warn('[messages] send failed', e);
  } finally {
    btnSend.disabled = false;
  }
}

async function handleJoinGroup(convo) {
  if (!convo || !CURRENT_USER) return;
  const refConv = doc(db, 'conversations', convo.id);
  const count = convo.memberCount || (convo.participants || []).length || 0;
  if (count >= MAX_GROUP_MEMBERS) {
    threadMeta.textContent = 'Grupo lleno.';
    return;
  }
  let banned = false;
  try {
    const banSnap = await getDoc(
      doc(db, 'conversations', convo.id, 'bans', CURRENT_USER.uid),
    );
    banned = banSnap.exists();
  } catch {
    banned = false;
  }
  if (banned) {
    threadMeta.textContent = 'No puedes unirte a este grupo.';
    return;
  }
  if (convo.joinMode === 'approval') {
    const reqRef = doc(db, 'conversations', convo.id, 'requests', CURRENT_USER.uid);
    await setDoc(reqRef, {
      uid: CURRENT_USER.uid,
      name: userDisplay(CURRENT_PROFILE, 'Usuario'),
      handle: CURRENT_PROFILE?.handle || '',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    if (activeConversationId === convo.id) {
      btnJoinGroup.textContent = 'Solicitud enviada';
      btnJoinGroup.disabled = true;
    }
    return;
  }
  try {
    await updateDoc(refConv, {
      participants: arrayUnion(CURRENT_USER.uid),
      memberCount: increment(1),
      [`reads.${CURRENT_USER.uid}`]: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[group] join failed', e);
    if (threadMeta) threadMeta.textContent = 'No se pudo unir al grupo.';
    return;
  }
  if (activeConversationId === convo.id) {
    btnJoinGroup.hidden = true;
    btnLeaveGroup.hidden = false;
  }
  openConversation(convo.id, convo);
}

async function handleLeaveGroup() {
  if (!activeConversationId || !CURRENT_USER) return;
  try {
    await updateDoc(doc(db, 'conversations', activeConversationId), {
      participants: arrayRemove(CURRENT_USER.uid),
      memberCount: increment(-1),
    });
  } catch (e) {
    console.warn('[group] leave failed', e);
  }
  activeConversationId = null;
  mobileShowInbox = true;
  messagesThread.hidden = true;
  messagesEmpty.hidden = false;
  updateThreadViewMode();
  updateInfoPanelVisibility();
}

async function createGroup() {
  const name = String(groupName?.value || '').trim();
  if (!name) {
    newGroupHint.textContent = 'Escribe un nombre.';
    return;
  }
  newGroupHint.textContent = 'Creando...';
  try {
    const isPublic = groupPublic?.value === 'public';
    const joinMode = groupJoinMode?.value === 'approval' ? 'approval' : 'open';
    const payload = {
      type: 'group',
      title: name,
      description: String(groupDesc?.value || '').trim(),
      public: isPublic,
      joinMode,
      createdAt: serverTimestamp(),
      createdBy: CURRENT_USER.uid,
      ownerId: CURRENT_USER.uid,
      admins: [CURRENT_USER.uid],
      participants: [CURRENT_USER.uid],
      memberCount: 1,
      lastAt: serverTimestamp(),
      reads: { [CURRENT_USER.uid]: serverTimestamp() },
    };
    const docRef = await addDoc(collection(db, 'conversations'), payload);
    setModalOpen(modalNewGroup, false);
    groupName.value = '';
    groupDesc.value = '';
    newGroupHint.textContent = '';
    openConversation(docRef.id, { id: docRef.id, ...payload });
  } catch (e) {
    console.warn('[group] create failed', e);
    newGroupHint.textContent = 'No se pudo crear.';
  }
}

async function openOrCreateSupport() {
  if (!CURRENT_USER) return;
  const supportKey = `support__${CURRENT_USER.uid}`;
  const q = query(
    collection(db, 'conversations'),
    where('supportKey', '==', supportKey),
    limit(1),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    openConversation(docSnap.id, { id: docSnap.id, ...(docSnap.data() || {}) });
    return;
  }
  const payload = {
    type: 'support',
    title: 'Soporte',
    supportKey,
    createdAt: serverTimestamp(),
    createdBy: CURRENT_USER.uid,
    ownerId: CURRENT_USER.uid,
    participants: [CURRENT_USER.uid],
    memberCount: 1,
    lastAt: serverTimestamp(),
    reads: { [CURRENT_USER.uid]: serverTimestamp() },
  };
  const docRef = await addDoc(collection(db, 'conversations'), payload);
  openConversation(docRef.id, { id: docRef.id, ...payload });
}

async function searchByEmail(term) {
  const email = String(term || '').trim().toLowerCase();
  if (!email.includes('@')) return [];
  try {
    const snap = await getDoc(doc(db, 'email_index', email));
    if (!snap.exists()) {
      if (!IS_ADMIN) return [];
      const adminSnap = await getDocs(
        query(collection(db, 'users'), where('emailLower', '==', email), limit(1)),
      );
      if (adminSnap.empty) return [];
      const userDoc = adminSnap.docs[0];
      const uid = userDoc.id;
      const profileSnap = await getDoc(doc(db, 'public_users', uid));
      const profile = profileSnap.exists() ? profileSnap.data() : {};
      return [{ uid, ...(profile || {}) }];
    }
    const data = snap.data() || {};
    const uid = data.uid;
    if (!uid) return [];
    const profileSnap = await getDoc(doc(db, 'public_users', uid));
    const profile = profileSnap.exists() ? profileSnap.data() : data;
    return [{ uid, ...(profile || data || {}) }];
  } catch (e) {
    console.warn('[search] email lookup failed', e);
    return [];
  }
}

async function searchUsers(term) {
  const raw = normText(term);
  const q = raw.startsWith('@') ? raw.slice(1).trim() : raw;
  if (!q) return [];
  if (!raw.startsWith('@') && q.includes('@')) {
    const byEmail = await searchByEmail(q);
    if (byEmail.length) return byEmail;
  }
  const merged = new Map();
  const byHandle = query(
    collection(db, 'public_users'),
    orderBy('handleLower'),
    where('handleLower', '>=', q),
    where('handleLower', '<=', `${q}\uf8ff`),
    limit(10),
  );
  const byName = query(
    collection(db, 'public_users'),
    orderBy('displayNameLower'),
    where('displayNameLower', '>=', q),
    where('displayNameLower', '<=', `${q}\uf8ff`),
    limit(10),
  );
  let prefixFailed = false;
  const [h, n] = await Promise.all([
    getDocs(byHandle).catch((e) => {
      prefixFailed = true;
      console.warn('[mensajes] handle prefix search failed', e);
      return null;
    }),
    getDocs(byName).catch((e) => {
      prefixFailed = true;
      console.warn('[mensajes] displayName prefix search failed', e);
      return null;
    }),
  ]);
  [...(h?.docs || []), ...(n?.docs || [])].forEach((d) => {
    if (!d?.id) return;
    merged.set(d.id, { uid: d.id, ...(d.data() || {}) });
  });

  if (!merged.size || prefixFailed) {
    try {
      const fallbackSnap = await getDocs(query(collection(db, 'public_users'), limit(150)));
      fallbackSnap.forEach((docSnap) => {
        const row = { uid: docSnap.id, ...(docSnap.data() || {}) };
        if (matchesUserSearch(row, q)) merged.set(row.uid, row);
      });
    } catch (e) {
      console.warn('[mensajes] fallback user search failed', e);
    }
  }

  return Array.from(merged.values())
    .filter((row) => row.uid && row.uid !== CURRENT_USER?.uid)
    .filter((row) => row.publicProfile !== false)
    .sort((a, b) => userSearchRank(a, q) - userSearchRank(b, q))
    .slice(0, 12);
}

async function openDmWith(uid) {
  if (!uid || !CURRENT_USER) return;
  const a = String(CURRENT_USER.uid || '').trim();
  const b = String(uid || '').trim();
  const dmKey = [a, b].sort().join('__');
  // Rules-safe query: include current user in participants.
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', a),
    limit(200),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const valid = (snap.docs || [])
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((row) => {
        const participants = Array.isArray(row.participants) ? row.participants : [];
        return row.type === 'dm' && row.dmKey === dmKey && participants.includes(a) && participants.includes(b);
      })
      .sort((x, y) => {
        const xt = toDateMaybe(x.lastAt)?.getTime() || toDateMaybe(x.createdAt)?.getTime() || 0;
        const yt = toDateMaybe(y.lastAt)?.getTime() || toDateMaybe(y.createdAt)?.getTime() || 0;
        return yt - xt;
      });
    if (valid.length) {
      const row = valid[0];
      openConversation(row.id, row);
      return;
    }
  }
  const payload = {
    type: 'dm',
    dmKey,
    createdAt: serverTimestamp(),
    createdBy: a,
    ownerId: a,
    admins: [a],
    participants: [a, b],
    memberCount: 2,
    lastAt: serverTimestamp(),
    reads: { [a]: serverTimestamp() },
  };
  const docRef = await addDoc(collection(db, 'conversations'), payload);
  openConversation(docRef.id, { id: docRef.id, ...payload });
}

async function loadSupportAgents() {
  if (!IS_ADMIN) return;
  const snap = await getDocs(collection(db, 'support_agents'));
  const list = snap.docs.map((d) => ({ uid: d.id, ...(d.data() || {}) }));
  supportAgentList.innerHTML = '';
  list.forEach((agent) => {
    const item = document.createElement('div');
    item.className = 'support-agent-item';
    item.innerHTML = `
      <span>${agent.displayName || agent.handle || agent.uid}</span>
      <button class="btn-white-outline" data-remove="${agent.uid}" type="button">Quitar</button>
    `;
    supportAgentList.appendChild(item);
  });
}

function renderReports(list) {
  if (!reportsList) return;
  reportsList.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Sin reportes.';
    reportsList.appendChild(empty);
    return;
  }
  list.forEach((rep) => {
    const item = document.createElement('div');
    item.className = 'report-item';
    item.innerHTML = `
      <div><strong>${rep.reason || 'reporte'}</strong> · ${rep.status || 'open'}</div>
      <div>${rep.reportedName || 'Usuario'}</div>
      <div>${rep.details || ''}</div>
      <div class="metaRow" style="gap: 6px">
        <button class="btn-white-outline" data-open="${rep.convId}">Abrir chat</button>
        <button class="btn-white-outline" data-resolve="${rep.id}">Resolver</button>
      </div>
    `;
    reportsList.appendChild(item);
  });
}

function listenReports() {
  if (!IS_ADMIN && !IS_SUPPORT) return;
  if (reportsUnsub) reportsUnsub();
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(20));
  reportsUnsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    renderReports(list);
  });
}

async function addSupportAgent(term) {
  if (!IS_ADMIN) return;
  const value = String(term || '').trim();
  if (!value) return;
  let uid = value;
  let profile = null;
  if (value.startsWith('@')) {
    const handle = value.slice(1).toLowerCase();
    const snap = await getDocs(
      query(collection(db, 'public_users'), where('handleLower', '==', handle), limit(1)),
    );
    if (!snap.empty) {
      uid = snap.docs[0].id;
      profile = snap.docs[0].data();
    }
  } else {
    const snap = await getDoc(doc(db, 'public_users', uid));
    if (snap.exists()) profile = snap.data();
  }
  if (!uid) return;
  await setDoc(doc(db, 'support_agents', uid), {
    uid,
    displayName: profile?.displayName || '',
    handle: profile?.handle || '',
    createdAt: serverTimestamp(),
    addedBy: CURRENT_USER.uid,
  });
  supportAgentInput.value = '';
  await loadSupportAgents();
}

function setupRecording() {
  if (!btnRecord) return;
  btnRecord.addEventListener('click', async () => {
    if (recording) {
      recorder?.stop();
      recording = false;
      btnRecord.textContent = 'Voz';
      recordHint.textContent = '';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recordChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) recordChunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordChunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: blob.type });
        pendingFiles.push(file);
        renderAttachmentsPreview();
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recording = true;
      btnRecord.textContent = 'Detener';
      recordHint.textContent = 'Grabando...';
    } catch (e) {
      console.warn('[record] failed', e);
      recordHint.textContent = 'No se pudo grabar.';
    }
  });
}

function wireUI() {
  filterAllChats?.addEventListener('click', () => {
    showUnreadOnly = false;
    setActiveTab('chats');
    applySearchFilter();
  });

  filterUnreadChats?.addEventListener('click', () => {
    showUnreadOnly = true;
    setActiveTab('chats');
    applySearchFilter();
  });

  filterGroupsChats?.addEventListener('click', () => {
    showUnreadOnly = false;
    setActiveTab('groups');
    applySearchFilter();
  });

  tabSupport?.addEventListener('click', () => {
    showUnreadOnly = false;
    setActiveTab('support');
    applySearchFilter();
  });

  btnBackToInbox?.addEventListener('click', () => {
    mobileShowInbox = true;
    infoPanelVisible = false;
    updateInfoPanelVisibility();
    updateThreadViewMode();
  });

  btnThreadSearch?.addEventListener('click', () => {
    const opened = !(threadTools?.hidden ?? true);
    if (threadTools) threadTools.hidden = opened;
    if (!opened) threadSearch?.focus();
  });

  if (messagesSearch) {
    messagesSearch.addEventListener('input', applySearchFilter);
  }

  threadSearch?.addEventListener('input', scheduleThreadSearch);
  threadSearchAttachments?.addEventListener('change', scheduleThreadSearch);

  btnCancelEdit?.addEventListener('click', clearEditMessage);
  btnCancelReply?.addEventListener('click', clearReplyMessage);

  toggleArchived?.addEventListener('change', () => {
    showArchived = !!toggleArchived.checked;
    if (chatList && latestConversations.length) {
      renderConversationList(latestConversations, chatList);
    }
    applySearchFilter();
  });

  togglePush?.addEventListener('change', async () => {
    if (!CURRENT_USER) return;
    const enabled = !!togglePush.checked;
    USER_SETTINGS = { ...USER_SETTINGS, pushEnabled: enabled };
    await setDoc(doc(db, 'user_settings', CURRENT_USER.uid), USER_SETTINGS, { merge: true });
    if (enabled) await setupPush(CURRENT_USER);
    else await clearPushTokens();
  });

  btnNewChat?.addEventListener('click', () => setModalOpen(modalNewChat, true));
  closeNewChat?.addEventListener('click', () => setModalOpen(modalNewChat, false));
  btnNewGroup?.addEventListener('click', () => setModalOpen(modalNewGroup, true));
  closeNewGroup?.addEventListener('click', () => setModalOpen(modalNewGroup, false));
  closeReport?.addEventListener('click', () => setModalOpen(modalReport, false));
  btnSubmitReport?.addEventListener('click', submitReport);

  btnSearchUser?.addEventListener('click', async () => {
    const term = newChatInput?.value || '';
    newChatHint.textContent = 'Buscando...';
    const results = await searchUsers(term);
    newChatResults.innerHTML = '';
    if (!results.length) {
      newChatHint.textContent = 'Sin resultados.';
      return;
    }
    newChatHint.textContent = '';
    results.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'message-item';
      const secondary =
        user.handle
          ? `@${user.handle}`
          : user.email || user.emailLower || '';
      item.innerHTML = `
        <div class="message-item-title">${userDisplay(user, 'Usuario')}</div>
        <div class="message-item-meta">${secondary || 'usuario'}</div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn-yellow';
      btn.type = 'button';
      btn.textContent = 'Abrir chat';
      btn.addEventListener('click', async () => {
        await openDmWith(user.uid);
        setModalOpen(modalNewChat, false);
      });
      item.appendChild(btn);
      newChatResults.appendChild(item);
    });
  });

  btnCreateGroup?.addEventListener('click', createGroup);

  btnSend?.addEventListener('click', sendMessage);
  messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  messageInput?.addEventListener('input', () => {
    bumpTyping();
  });

  fileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      pendingFiles.push(...files);
      renderAttachmentsPreview();
    }
    fileInput.value = '';
  });

  btnJoinGroup?.addEventListener('click', () => {
    if (activeConversation) handleJoinGroup(activeConversation);
  });
  btnLeaveGroup?.addEventListener('click', handleLeaveGroup);
  btnToggleInfo?.addEventListener('click', () => {
    infoPanelVisible = !infoPanelVisible;
    updateInfoPanelVisibility();
  });
  btnCloseInfoDrawer?.addEventListener('click', () => {
    infoPanelVisible = false;
    updateInfoPanelVisibility();
  });
  btnOpenSupport?.addEventListener('click', openOrCreateSupport);

  requestsBox?.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-approve]');
    const deny = e.target.closest('[data-deny]');
    if (!activeConversationId) return;
    if (approve) {
      const uid = approve.getAttribute('data-approve');
      await updateDoc(doc(db, 'conversations', activeConversationId), {
        participants: arrayUnion(uid),
        memberCount: increment(1),
        [`reads.${uid}`]: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'conversations', activeConversationId, 'requests', uid));
      if (activeConversation) {
        const currentCount = activeConversation.memberCount || 0;
        activeConversation.memberCount = currentCount + 1;
      }
      renderInfoPanel(activeConversation);
    }
    if (deny) {
      const uid = deny.getAttribute('data-deny');
      await deleteDoc(doc(db, 'conversations', activeConversationId, 'requests', uid));
      renderInfoPanel(activeConversation);
    }
  });

  participantsBox?.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    const banBtn = e.target.closest('[data-ban]');
    if (!activeConversationId) return;
    if (removeBtn) {
      const uid = removeBtn.getAttribute('data-remove');
      await updateDoc(doc(db, 'conversations', activeConversationId), {
        participants: arrayRemove(uid),
        memberCount: increment(-1),
      });
      return;
    }
    if (banBtn) {
      const uid = banBtn.getAttribute('data-ban');
      await setDoc(doc(db, 'conversations', activeConversationId, 'bans', uid), {
        uid,
        createdAt: serverTimestamp(),
        createdBy: CURRENT_USER.uid,
      });
      await updateDoc(doc(db, 'conversations', activeConversationId), {
        participants: arrayRemove(uid),
        memberCount: increment(-1),
      });
    }
  });

  infoActions?.addEventListener('click', async (e) => {
    if (!activeConversationId) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'btnToggleMute') {
      const muted = isConversationMuted(activeConversationId);
      await setConversationSetting(activeConversationId, { muted: !muted });
      await renderInfoPanel(activeConversation);
      return;
    }
    if (target.id === 'btnToggleArchive') {
      const archived = isConversationArchived(activeConversationId);
      await setConversationSetting(activeConversationId, { archived: !archived });
      await renderInfoPanel(activeConversation);
      applySearchFilter();
      return;
    }
    if (target.id === 'btnExport') {
      await exportConversation();
      return;
    }
    if (target.id === 'btnReport') {
      openReportModal();
      return;
    }
    if (target.id === 'btnDeleteMine') {
      await deleteMyMessages();
      return;
    }
  });

  pinnedBox?.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    const unpin = e.target.closest('[data-unpin]');
    if (jump) {
      const msgId = jump.getAttribute('data-jump');
      scrollToMessage(msgId);
    }
    if (unpin) {
      const msgId = unpin.getAttribute('data-unpin');
      const msg = currentMessages.find((m) => m.id === msgId);
      if (msg) togglePinMessage(msg);
    }
  });

  supportAgentList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn || !IS_ADMIN) return;
    const uid = btn.getAttribute('data-remove');
    await deleteDoc(doc(db, 'support_agents', uid));
    await loadSupportAgents();
  });

  reportsList?.addEventListener('click', async (e) => {
    const resolve = e.target.closest('[data-resolve]');
    const open = e.target.closest('[data-open]');
    if (resolve) {
      const id = resolve.getAttribute('data-resolve');
      await updateDoc(doc(db, 'reports', id), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: CURRENT_USER.uid,
      });
    }
    if (open) {
      const convId = open.getAttribute('data-open');
      if (convId) openConversation(convId);
    }
  });

  btnAddSupportAgent?.addEventListener('click', () => {
    addSupportAgent(supportAgentInput?.value || '');
  });

  setupRecording();

  window.addEventListener('focus', () => {
    if (activeConversationId) markRead(activeConversationId);
  });
  window.addEventListener('blur', () => {
    clearTyping();
  });
  window.addEventListener('resize', updateThreadViewMode);
  window.addEventListener('av:quickchat-open', () => {
    if (!infoPanelVisible) return;
    infoPanelVisible = false;
    updateInfoPanelVisibility();
  });

  updateUnreadFilterUI();
  updateSidebarStats();
  updateListHeaderMeta();
  updateInfoPanelVisibility();
  updateThreadViewMode();
}

function listenConversations() {
  if (convoUnsub) convoUnsub();
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', CURRENT_USER.uid),
    limit(200),
  );
  convoUnsub = onSnapshot(q, (snap) => {
    const list = sortByLastAt(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })),
    );
    latestConversations = list;
    renderConversationList(list, chatList);
    updateSidebarStats();
    applySearchFilter();
  });
}

function listenPublicGroups() {
  if (groupsUnsub) groupsUnsub();
  const q = query(
    collection(db, 'conversations'),
    where('public', '==', true),
    limit(200),
  );
  groupsUnsub = onSnapshot(q, (snap) => {
    const list = sortByLastAt(
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((item) => item.type === 'group'),
    );
    renderPublicGroups(list);
    applySearchFilter();
  });
}

function listenSupportInbox() {
  if (!IS_SUPPORT && !IS_ADMIN) return;
  if (supportUnsub) supportUnsub();
  tabSupport.hidden = false;
  const q = query(
    collection(db, 'conversations'),
    where('type', '==', 'support'),
    limit(200),
  );
  supportUnsub = onSnapshot(q, (snap) => {
    const list = sortByLastAt(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })),
    );
    renderConversationList(list, supportList);
    applySearchFilter();
  });
}

async function initFromAuth(user) {
  CURRENT_USER = user;
  const publicSnap = await getDoc(doc(db, 'public_users', user.uid));
  CURRENT_PROFILE = publicSnap.exists() ? publicSnap.data() : {};

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  IS_ADMIN = user.email === 'aquivivo.pl@gmail.com' || userData.admin === true || userData.role === 'admin';

  const supportSnap = await getDoc(doc(db, 'support_agents', user.uid));
  IS_SUPPORT = IS_ADMIN || supportSnap.exists();

  if (IS_ADMIN || IS_SUPPORT) {
    supportAdminBox.hidden = false;
    messagesAdminWrap?.removeAttribute('hidden');
  }
  if (!IS_ADMIN) {
    if (supportAgentInput) supportAgentInput.style.display = 'none';
    if (btnAddSupportAgent) btnAddSupportAgent.style.display = 'none';
    if (supportAgentList) supportAgentList.style.display = 'none';
  }
  if (IS_SUPPORT || IS_ADMIN) tabSupport.hidden = false;

  wireUI();
  await loadUserSettings();
  if (USER_SETTINGS.pushEnabled !== false) {
    ensureNotificationPermission();
    await setupPush(user);
  }
  listenConversationSettings();
  startPresence();
  listenConversations();
  listenPublicGroups();
  listenSupportInbox();
  listenBroadcastInbox();
  if (IS_ADMIN) loadSupportAgents();
  listenReports();

  const params = new URLSearchParams(window.location.search);
  const share = params.get('share') || params.get('text');
  if (share) {
    PENDING_SHARE = String(share || '').trim();
    if (PENDING_SHARE) {
      try {
        sessionStorage.setItem('av_pending_share', PENDING_SHARE);
      } catch {}
      if (messagesEmpty) {
        messagesEmpty.textContent = 'Tienes un mensaje listo para enviar. Selecciona un chat.';
      }
    }
    params.delete('share');
    params.delete('text');
    try {
      const clean = params.toString();
      history.replaceState({}, '', `${location.pathname}${clean ? `?${clean}` : ''}`);
    } catch {}
  } else {
    try {
      const stored = sessionStorage.getItem('av_pending_share');
      if (stored) {
        PENDING_SHARE = String(stored || '').trim();
        if (messagesEmpty) {
          messagesEmpty.textContent = 'Tienes un mensaje listo para enviar. Selecciona un chat.';
        }
      }
    } catch {}
  }
  const chatUid = params.get('chat');
  const convId = params.get('conv');
  if (convId) {
    await openConversation(convId);
    return;
  }
  if (chatUid) {
    await openDmWith(chatUid);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=mensajes.html';
    return;
  }
  await initFromAuth(user);
});



