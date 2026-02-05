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

const chatList = qs('#chatList');
const groupList = qs('#groupList');
const supportList = qs('#supportList');
const messagesSearch = qs('#messagesSearch');
const messagesEmpty = qs('#messagesEmpty');
const messagesThread = qs('#messagesThread');
const threadMessages = qs('#threadMessages');
const threadName = qs('#threadName');
const threadMeta = qs('#threadMeta');
const threadAvatar = qs('#threadAvatar');
const threadTyping = qs('#threadTyping');
const btnJoinGroup = qs('#btnJoinGroup');
const btnLeaveGroup = qs('#btnLeaveGroup');
const messageInput = qs('#messageInput');
const btnSend = qs('#btnSend');
const fileInput = qs('#fileInput');
const attachmentsPreview = qs('#attachmentsPreview');
const btnRecord = qs('#btnRecord');
const recordHint = qs('#recordHint');
const messagesInfo = qs('#messagesInfo');
const infoBody = qs('#infoBody');
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

let CURRENT_USER = null;
let CURRENT_PROFILE = null;
let IS_ADMIN = false;
let IS_SUPPORT = false;

let convoUnsub = null;
let supportUnsub = null;
let groupsUnsub = null;
let messagesUnsub = null;
let conversationDocUnsub = null;

let activeConversation = null;
let activeConversationId = null;
let currentMessages = [];

let pendingFiles = [];
let recorder = null;
let recording = false;
let recordChunks = [];
let typingTimer = null;
let lastTypingAt = 0;

const profileCache = new Map();
const lastNotified = new Map();
const FCM_VAPID_KEY = '';
const MAX_GROUP_MEMBERS = 200;

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

function normText(text) {
  return String(text || '').trim().toLowerCase();
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

function setActiveTab(tab) {
  document.querySelectorAll('.messages-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  chatList.classList.toggle('is-hidden', tab !== 'chats');
  groupList.classList.toggle('is-hidden', tab !== 'groups');
  supportList.classList.toggle('is-hidden', tab !== 'support');
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

function setModalOpen(el, open) {
  if (!el) return;
  el.classList.toggle('open', open);
  el.style.display = open ? 'flex' : 'none';
}

function resetComposer() {
  pendingFiles = [];
  renderAttachmentsPreview();
  if (messageInput) messageInput.value = '';
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

  if (msg.senderName && !isMine) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = msg.senderName;
    wrap.appendChild(sender);
  }

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

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const readStatus = readStatusForMessage(msg);
  meta.textContent = [formatTime(msg.createdAt), readStatus].filter(Boolean).join(' · ');
  wrap.appendChild(meta);

  return wrap;
}

function renderMessages(list) {
  if (!threadMessages) return;
  threadMessages.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No hay mensajes todavia.';
    threadMessages.appendChild(empty);
    return;
  }
  list.forEach((msg) => {
    threadMessages.appendChild(renderMessageBubble(msg));
  });
  threadMessages.scrollTop = threadMessages.scrollHeight;
}

function maybeNotify(convId, list) {
  if (!list.length) return;
  const last = list[list.length - 1];
  if (!last || last.senderId === CURRENT_USER?.uid) return;
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
  if (!convo) return 'Conversacion';
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
  if (convoUnread(convo)) {
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
      convo.type === 'support'
        ? '🆘'
        : convo.type === 'group'
          ? buildAvatarText(convo.title || name)
          : buildAvatarText(name);
  });

  if (activeConversationId === convo.id) item.classList.add('is-active');
}

function renderConversationList(list, target) {
  if (!target) return;
  target.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Sin conversaciones.';
    target.appendChild(empty);
    return;
  }
  list.forEach((c) => renderConversationItem(c, target));
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
  const currentTab = document.querySelector('.messages-tab.is-active')?.dataset?.tab || 'chats';
  const listEl = currentTab === 'groups' ? groupList : (currentTab === 'support' ? supportList : chatList);
  if (!listEl) return;
  listEl.querySelectorAll('.message-item').forEach((item) => {
    const name = item.dataset.name || '';
    item.style.display = !q || name.includes(q) ? '' : 'none';
  });
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

async function applyConversationState(convo) {
  if (!convo) return;
  const name = await resolveConversationTitle(convo);
  threadName.textContent = name;
  threadAvatar.textContent =
    convo.type === 'support'
      ? '🆘'
      : convo.type === 'group'
        ? buildAvatarText(convo.title || name)
        : buildAvatarText(name);
  const count = convo.memberCount || (convo.participants || []).length || 0;
  const meta = convo.type === 'group'
    ? `${count} miembros`
    : (convo.type === 'support' ? 'Soporte' : 'Directo');
  threadMeta.textContent = meta;
  await updateTypingIndicator(convo);

  btnJoinGroup.hidden = true;
  btnLeaveGroup.hidden = true;
  if (convo.type === 'group') {
    const isMember = (convo.participants || []).includes(CURRENT_USER?.uid);
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
        btnJoinGroup.textContent = 'Solicitar';
        btnJoinGroup.disabled = false;
      }
    } else {
      btnJoinGroup.textContent = 'Unirme';
      btnJoinGroup.disabled = false;
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
      renderMessages(currentMessages);
    }
  });
}

async function openConversation(id, convo) {
  if (!id) return;
  if (activeConversationId && activeConversationId !== id) {
    await clearTyping();
  }
  activeConversationId = id;
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
  if (!activeConversation) return;
  activeConversation.id = id;
  currentMessages = [];

  document.querySelectorAll('.message-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.id === id);
  });

  messagesEmpty.hidden = true;
  messagesThread.hidden = false;
  messagesInfo.hidden = false;

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
  const typeLabel = convo.type === 'group' ? 'Grupo' : (convo.type === 'support' ? 'Soporte' : 'Directo');
  const isPublic = convo.public ? 'Publico' : 'Privado';
  infoBody.innerHTML = `
    <div><strong>Tipo:</strong> ${typeLabel}</div>
    ${convo.type === 'group' ? `<div><strong>Visibilidad:</strong> ${isPublic}</div>` : ''}
    ${convo.type === 'group' ? `<div><strong>Ingreso:</strong> ${convo.joinMode === 'approval' ? 'Con aprobacion' : 'Abierto'}</div>` : ''}
    <div><strong>Miembros:</strong> ${convo.memberCount || (convo.participants || []).length || 0}</div>
  `;

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
    renderMessages(list);
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
  const text = String(messageInput?.value || '').trim();
  if (!text && pendingFiles.length === 0) return;

  btnSend.disabled = true;
  try {
    const attachments = [];
    if (pendingFiles.length) {
      for (const file of pendingFiles) {
        attachments.push(await uploadAttachment(activeConversationId, file));
      }
    }

    const msgPayload = {
      senderId: CURRENT_USER.uid,
      senderName: userDisplay(CURRENT_PROFILE, 'Usuario'),
      text,
      attachments,
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, 'conversations', activeConversationId, 'messages'), msgPayload);

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
    });

    await markRead(activeConversationId);
    await clearTyping();

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
  await updateDoc(refConv, {
    participants: arrayUnion(CURRENT_USER.uid),
    memberCount: increment(1),
    [`reads.${CURRENT_USER.uid}`]: serverTimestamp(),
  });
  if (activeConversationId === convo.id) {
    btnJoinGroup.hidden = true;
    btnLeaveGroup.hidden = false;
  }
  openConversation(convo.id, convo);
}

async function handleLeaveGroup() {
  if (!activeConversationId || !CURRENT_USER) return;
  await updateDoc(doc(db, 'conversations', activeConversationId), {
    participants: arrayRemove(CURRENT_USER.uid),
    memberCount: increment(-1),
  });
  messagesThread.hidden = true;
  messagesEmpty.hidden = false;
  messagesInfo.hidden = true;
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
  const q = normText(term);
  if (!q) return [];
  if (q.includes('@')) {
    const byEmail = await searchByEmail(q);
    if (byEmail.length) return byEmail;
  }
  const list = [];
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
  const [h, n] = await Promise.all([getDocs(byHandle), getDocs(byName)]);
  [...h.docs, ...n.docs].forEach((d) => {
    if (!list.find((i) => i.uid === d.id)) list.push({ uid: d.id, ...(d.data() || {}) });
  });
  return list;
}

async function openDmWith(uid) {
  if (!uid || !CURRENT_USER) return;
  const dmKey = [CURRENT_USER.uid, uid].sort().join('__');
  const q = query(collection(db, 'conversations'), where('dmKey', '==', dmKey), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    openConversation(docSnap.id, { id: docSnap.id, ...(docSnap.data() || {}) });
    return;
  }
  const payload = {
    type: 'dm',
    dmKey,
    createdAt: serverTimestamp(),
    createdBy: CURRENT_USER.uid,
    participants: [CURRENT_USER.uid, uid],
    memberCount: 2,
    lastAt: serverTimestamp(),
    reads: { [CURRENT_USER.uid]: serverTimestamp() },
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
      btnRecord.textContent = '🎙';
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
      btnRecord.textContent = '⏹';
      recordHint.textContent = 'Grabando...';
    } catch (e) {
      console.warn('[record] failed', e);
      recordHint.textContent = 'No se pudo grabar.';
    }
  });
}

function wireUI() {
  document.querySelectorAll('.messages-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tab);
      applySearchFilter();
    });
  });

  if (messagesSearch) {
    messagesSearch.addEventListener('input', applySearchFilter);
  }

  btnNewChat?.addEventListener('click', () => setModalOpen(modalNewChat, true));
  closeNewChat?.addEventListener('click', () => setModalOpen(modalNewChat, false));
  btnNewGroup?.addEventListener('click', () => setModalOpen(modalNewGroup, true));
  closeNewGroup?.addEventListener('click', () => setModalOpen(modalNewGroup, false));

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

  supportAgentList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn || !IS_ADMIN) return;
    const uid = btn.getAttribute('data-remove');
    await deleteDoc(doc(db, 'support_agents', uid));
    await loadSupportAgents();
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
}

function listenConversations() {
  if (convoUnsub) convoUnsub();
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', CURRENT_USER.uid),
    orderBy('lastAt', 'desc'),
    limit(60),
  );
  convoUnsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    renderConversationList(list, chatList);
    applySearchFilter();
  });
}

function listenPublicGroups() {
  if (groupsUnsub) groupsUnsub();
  const q = query(
    collection(db, 'conversations'),
    where('type', '==', 'group'),
    where('public', '==', true),
    orderBy('lastAt', 'desc'),
    limit(60),
  );
  groupsUnsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
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
    orderBy('lastAt', 'desc'),
    limit(60),
  );
  supportUnsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    renderConversationList(list, supportList);
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

  if (IS_ADMIN) supportAdminBox.hidden = false;
  if (IS_SUPPORT || IS_ADMIN) tabSupport.hidden = false;

  wireUI();
  ensureNotificationPermission();
  await setupPush(user);
  listenConversations();
  listenPublicGroups();
  listenSupportInbox();
  if (IS_ADMIN) loadSupportAgents();

  const params = new URLSearchParams(window.location.search);
  const chatUid = params.get('chat');
  if (chatUid) openDmWith(chatUid);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=mensajes.html';
    return;
  }
  await initFromAuth(user);
});
