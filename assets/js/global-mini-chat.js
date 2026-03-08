import { db, storage } from './firebase-init.js';
import {
  arrayUnion,
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
  runTransaction,
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
import { createMiniChatFirestoreController, normalizeMessage } from './chat-firestore.js';
import { getNeuSocialAppPath, withNeuQuery } from './neu-paths.js';
import { createMiniChatReactionController } from './chat-reactions.js';
import { createMiniChatTypingController } from './chat-typing.js';
import { createMiniChatUploadController } from './chat-upload.js';

const ORIGINAL_TITLE = document.title;
const ENCRYPTED_MESSAGE_PREVIEW = '[Encrypted message]';
const E2EE_DB_NAME = 'neu-chat-e2ee';
const E2EE_STORE_NAME = 'keypairs';
const E2EE_RSA_ALGORITHM = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const E2EE_AES_ALGORITHM = {
  name: 'AES-GCM',
  length: 256,
};
const CALL_ICE_SERVERS = [
  {
    urls: ['stun:stun.l.google.com:19302'],
  },
];

let currentUid = '';
let currentName = 'Usuario';
let conversations = [];
const messageCache = new Map();
const preloadedMessageCacheKeys = new Set();
const messagePreloadPending = new Map();
const pendingReadWrites = new Map();
const decryptedMessageCache = new Map();
const conversationKeyCache = new Map();
const conversationKeyLoading = new Map();
const userIdentityLoading = new Map();
const userPublicKeyCache = new Map();
const openThreads = new Map();
const minimizedThreads = new Map();
const threadUnread = new Map();
const PANEL_BASE_Z_INDEX = 3000;
const THREAD_BASE_Z_INDEX = 4000;
let topZIndex = THREAD_BASE_Z_INDEX;
let activeConversationId = '';
let activeConversationSource = 'page';
let convUnsub = null;
let hostMode = 'dock';
let preferredHostMode = 'dock';
const profileCache = new Map();
const profileLoading = new Map();
const presenceWatchers = new Map();
let fallbackHydrationPromise = null;
let fallbackHydratedUid = '';
let chatStateSubscriptionsWired = false;
let chatPopstateWired = false;
let presenceLifecycleWired = false;
let voiceRecordingLifecycleWired = false;
let speechRecognitionLifecycleWired = false;
let callLifecycleWired = false;
let e2eeDbPromise = null;
let panelPresenceConversationId = '';
let panelPresenceUid = '';
let panelPresenceRelease = null;
const activeDockThreadStreamState = {
  conversationId: '',
  thread: null,
};
const activeReadReceiptState = {
  conversationId: '',
  otherUid: '',
  lastReadMessageId: '',
  lastReadAt: null,
  unsub: null,
};
const activeDeliveryState = {
  conversationId: '',
  otherUid: '',
  lastDeliveredMessageId: '',
  unsub: null,
};
const activeCallListenerState = {
  conversationId: '',
  otherUid: '',
  unsub: null,
};
const callSessionState = {
  conversationId: '',
  otherUid: '',
  localRole: '',
  pc: null,
  localStream: null,
  remoteStream: null,
  remoteAudioEl: null,
  status: 'idle',
  lastOfferSdp: '',
  lastAnswerSdp: '',
  processedRemoteCandidates: new Set(),
  pendingRemoteCandidates: [],
};
const deliveredWriteCache = new Map();
const dropZoneMeta = new WeakMap();
const voiceRecorderState = {
  mediaRecorder: null,
  stream: null,
  chunks: [],
  conversationId: '',
  scope: '',
  thread: null,
  mimeType: 'audio/webm',
  stopping: false,
  discardOnStop: false,
  stopPromise: null,
  stopResolve: null,
};
const speechRecognitionState = {
  recognition: null,
  listening: false,
  conversationId: '',
  scope: '',
  thread: null,
  baseValue: '',
};

const ChatController = (() => {
  const subscribers = new Set();

  function getState() {
    return {
      currentUid,
      conversations: [...conversations],
      activeConversationId,
      activeConversationSource,
    };
  }

  function notify() {
    const state = getState();
    subscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.warn('[mini-chat-v4] state subscriber failed', error);
      }
    });
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }
    subscribers.add(callback);
    callback(getState());
    return () => {
      subscribers.delete(callback);
    };
  }

  function unsubscribe(callback) {
    subscribers.delete(callback);
  }

  function setCurrentUid(uid, { notify: shouldNotify = true } = {}) {
    const nextUid = String(uid || '').trim();
    if (currentUid === nextUid) return;
    currentUid = nextUid;
    if (shouldNotify) notify();
  }

  function setConversations(list, { notify: shouldNotify = true } = {}) {
    conversations = Array.isArray(list) ? list : [];
    if (shouldNotify) notify();
  }

  function setActiveConversation(
    conversationId,
    { notify: shouldNotify = true, source = 'page' } = {},
  ) {
    const nextConversationId = String(conversationId || '').trim();
    const nextSource = String(source || 'page').trim() || 'page';
    if (
      activeConversationId === nextConversationId &&
      activeConversationSource === nextSource
    ) {
      return;
    }
    activeConversationId = nextConversationId;
    activeConversationSource = nextSource;
    if (shouldNotify) notify();
  }

  function getActiveConversation() {
    return activeConversationId;
  }

  function getActiveConversationSource() {
    return activeConversationSource;
  }

  function getConversation(conversationId) {
    const convId = String(conversationId || '').trim();
    return conversations.find((item) => String(item?.id || '').trim() === convId) || null;
  }

  return {
    notify,
    subscribe,
    unsubscribe,
    setCurrentUid,
    setConversations,
    setActiveConversation,
    getActiveConversation,
    getActiveConversationSource,
    getConversation,
    getState,
  };
})();

function getChatState() {
  return ChatController.getState();
}

function updateMessageCache(conversationId, rows = [], { preloaded = false } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  const nextRows = Array.isArray(rows) ? rows.slice(-20) : [];
  if (messageCache.has(convId)) {
    messageCache.delete(convId);
  }
  messageCache.set(convId, nextRows);
  if (preloaded) {
    preloadedMessageCacheKeys.add(convId);
  } else {
    preloadedMessageCacheKeys.delete(convId);
  }

  while (messageCache.size > 10) {
    const oldestKey = messageCache.keys().next().value;
    if (!oldestKey) break;
    messageCache.delete(oldestKey);
    preloadedMessageCacheKeys.delete(oldestKey);
  }
}

function getCachedMessages(conversationId, { consumePreloaded = false } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !messageCache.has(convId)) return [];
  const rows = Array.isArray(messageCache.get(convId))
    ? [...messageCache.get(convId)]
    : [];
  if (consumePreloaded && preloadedMessageCacheKeys.has(convId)) {
    messageCache.delete(convId);
    preloadedMessageCacheKeys.delete(convId);
  }
  return rows;
}

function clearMessagePreload(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || !messagePreloadPending.has(convId)) return;
  const release = messagePreloadPending.get(convId);
  messagePreloadPending.delete(convId);
  if (typeof release === 'function') {
    try {
      release();
    } catch {
      // ignore preload cleanup failures
    }
  }
}

function clearAllMessagePreloads() {
  Array.from(messagePreloadPending.keys()).forEach((conversationId) => {
    clearMessagePreload(conversationId);
  });
}

function supportsE2ee() {
  return !!(
    typeof window !== 'undefined' &&
    window.crypto?.subtle &&
    typeof window.indexedDB !== 'undefined'
  );
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Uint8Array();
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function arrayBufferToBase64(value) {
  return bytesToBase64(new Uint8Array(value || new ArrayBuffer(0)));
}

function keyStoreKey(uid) {
  return `rsa-keypair:${String(uid || '').trim()}`;
}

function normalizeMembersForE2ee(value = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function messageDecryptCacheKey(conversationId, message) {
  const convId = String(conversationId || '').trim();
  const msgId = String(message?.id || '').trim();
  return convId && msgId ? `${convId}:${msgId}` : '';
}

function primeDecryptedMessageCache(cacheKey, signature, text) {
  if (!cacheKey) return;
  if (decryptedMessageCache.has(cacheKey)) {
    decryptedMessageCache.delete(cacheKey);
  }
  decryptedMessageCache.set(cacheKey, {
    signature,
    text,
  });
  while (decryptedMessageCache.size > 400) {
    const oldestKey = decryptedMessageCache.keys().next().value;
    if (!oldestKey) break;
    decryptedMessageCache.delete(oldestKey);
  }
}

function openE2eeDb() {
  if (e2eeDbPromise) return e2eeDbPromise;
  if (!supportsE2ee()) {
    return Promise.reject(new Error('e2ee-unavailable'));
  }

  e2eeDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(E2EE_DB_NAME, 1);
    request.onerror = () => reject(request.error || new Error('e2ee-db-open-failed'));
    request.onupgradeneeded = () => {
      const dbRef = request.result;
      if (!dbRef.objectStoreNames.contains(E2EE_STORE_NAME)) {
        dbRef.createObjectStore(E2EE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  }).catch((error) => {
    e2eeDbPromise = null;
    throw error;
  });

  return e2eeDbPromise;
}

async function e2eeStoreGet(key) {
  const dbRef = await openE2eeDb();
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(E2EE_STORE_NAME, 'readonly');
    const store = tx.objectStore(E2EE_STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error || new Error('e2ee-db-read-failed'));
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function e2eeStoreSet(key, value) {
  const dbRef = await openE2eeDb();
  return new Promise((resolve, reject) => {
    const tx = dbRef.transaction(E2EE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(E2EE_STORE_NAME);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error || new Error('e2ee-db-write-failed'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('e2ee-db-write-failed'));
    request.onsuccess = () => {};
  });
}

async function importUserPublicKey(publicJwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    publicJwk,
    E2EE_RSA_ALGORITHM,
    true,
    ['encrypt'],
  );
}

async function importUserPrivateKey(privateJwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    privateJwk,
    E2EE_RSA_ALGORITHM,
    true,
    ['decrypt'],
  );
}

async function importConversationAesKey(rawKey) {
  return window.crypto.subtle.importKey(
    'raw',
    rawKey,
    E2EE_AES_ALGORITHM,
    false,
    ['encrypt', 'decrypt'],
  );
}

async function ensureUserEncryptionIdentity(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('missing-user-id');
  if (!supportsE2ee()) throw new Error('e2ee-unavailable');
  if (userIdentityLoading.has(cleanUid)) return userIdentityLoading.get(cleanUid);

  const loading = (async () => {
    const stored = await e2eeStoreGet(keyStoreKey(cleanUid));
    let publicJwk = stored?.publicJwk || null;
    let privateJwk = stored?.privateJwk || null;

    if (!publicJwk || !privateJwk) {
      const keyPair = await window.crypto.subtle.generateKey(
        E2EE_RSA_ALGORITHM,
        true,
        ['encrypt', 'decrypt'],
      );
      publicJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
      privateJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
      await e2eeStoreSet(keyStoreKey(cleanUid), {
        publicJwk,
        privateJwk,
      });
    }

    userPublicKeyCache.set(cleanUid, publicJwk);
    await setDoc(
      doc(db, 'neuUsers', cleanUid),
      {
        publicKey: publicJwk,
      },
      { merge: true },
    );

    return {
      publicJwk,
      publicKey: await importUserPublicKey(publicJwk),
      privateKey: await importUserPrivateKey(privateJwk),
    };
  })();

  userIdentityLoading.set(cleanUid, loading);
  try {
    return await loading;
  } finally {
    userIdentityLoading.delete(cleanUid);
  }
}

async function fetchUserPublicKeyJwk(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('missing-user-id');
  if (userPublicKeyCache.has(cleanUid)) {
    return userPublicKeyCache.get(cleanUid);
  }

  const snap = await getDoc(doc(db, 'neuUsers', cleanUid));
  const data = snap.exists() ? (snap.data() || {}) : {};
  const publicJwk = data?.publicKey && typeof data.publicKey === 'object'
    ? data.publicKey
    : null;
  if (!publicJwk) throw new Error(`missing-public-key:${cleanUid}`);
  userPublicKeyCache.set(cleanUid, publicJwk);
  return publicJwk;
}

async function resolveConversationMembersForE2ee(conversationId, members = []) {
  const normalizedMembers = normalizeMembersForE2ee(members);
  if (normalizedMembers.length) return normalizedMembers;

  const cachedConversation = ChatController.getConversation(conversationId);
  const cachedMembers = normalizeMembersForE2ee(
    cachedConversation?.participants ||
    cachedConversation?.members,
  );
  if (cachedMembers.length) return cachedMembers;

  const snap = await getDoc(doc(db, 'neuConversations', String(conversationId || '').trim()));
  const data = snap.exists() ? (snap.data() || {}) : {};
  return normalizeMembersForE2ee(data.members);
}

async function ensureConversationEncryption(conversationId, members = [], { createIfMissing = true } = {}) {
  const convId = String(conversationId || '').trim();
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (!convId || !currentUserId) throw new Error('missing-conversation-context');
  if (!supportsE2ee()) throw new Error('e2ee-unavailable');
  if (conversationKeyCache.has(convId)) return conversationKeyCache.get(convId);
  if (conversationKeyLoading.has(convId)) return conversationKeyLoading.get(convId);

  const loading = (async () => {
    const identity = await ensureUserEncryptionIdentity(currentUserId);
    const participantIds = await resolveConversationMembersForE2ee(convId, members);
    if (!participantIds.includes(currentUserId)) {
      throw new Error('conversation-encryption-access-denied');
    }

    const conversationRef = doc(db, 'neuConversations', convId);
    const publicKeysByUid = {};
    await Promise.all(
      participantIds.map(async (uid) => {
        publicKeysByUid[uid] = uid === currentUserId
          ? identity.publicJwk
          : await fetchUserPublicKeyJwk(uid);
      }),
    );

    const generatedAesKey = await window.crypto.subtle.generateKey(
      E2EE_AES_ALGORITHM,
      true,
      ['encrypt', 'decrypt'],
    );
    const generatedRawKey = await window.crypto.subtle.exportKey('raw', generatedAesKey);
    const generatedEncryptedKeys = {};

    await Promise.all(
      participantIds.map(async (uid) => {
        const publicKey = await importUserPublicKey(publicKeysByUid[uid]);
        const wrapped = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          publicKey,
          generatedRawKey,
        );
        generatedEncryptedKeys[uid] = arrayBufferToBase64(wrapped);
      }),
    );

    const transactionResult = await runTransaction(db, async (transaction) => {
      const conversationSnap = await transaction.get(conversationRef);
      if (!conversationSnap.exists()) {
        throw new Error('conversation-missing');
      }
      const data = conversationSnap.data() || {};
      const encryptedKeys = data?.encryptedKeys && typeof data.encryptedKeys === 'object'
        ? data.encryptedKeys
        : {};
      const currentWrappedKey = String(encryptedKeys[currentUserId] || '').trim();
      if (currentWrappedKey) {
        return {
          wrappedKey: currentWrappedKey,
          created: false,
        };
      }
      if (Object.keys(encryptedKeys).length > 0) {
        throw new Error('conversation-key-missing-for-user');
      }
      if (!createIfMissing) {
        throw new Error('conversation-key-missing');
      }

      transaction.set(
        conversationRef,
        {
          encryptedKeys: {
            ...encryptedKeys,
            ...generatedEncryptedKeys,
          },
          encryptionVersion: 1,
        },
        { merge: true },
      );

      return {
        wrappedKey: String(generatedEncryptedKeys[currentUserId] || '').trim(),
        created: true,
      };
    });

    let aesKey = null;
    if (transactionResult?.created) {
      aesKey = generatedAesKey;
    } else {
      const wrappedKeyBytes = base64ToBytes(transactionResult?.wrappedKey || '');
      const rawKey = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        identity.privateKey,
        wrappedKeyBytes,
      );
      aesKey = await importConversationAesKey(rawKey);
    }

    conversationKeyCache.set(convId, aesKey);
    return aesKey;
  })();

  conversationKeyLoading.set(convId, loading);
  try {
    return await loading;
  } finally {
    conversationKeyLoading.delete(convId);
  }
}

async function encryptTextMessageForConversation(conversationId, text, members = []) {
  const convId = String(conversationId || '').trim();
  const safeText = String(text || '');
  if (!convId || !safeText.trim()) {
    throw new Error('missing-message-text');
  }

  const aesKey = await ensureConversationEncryption(convId, members);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(safeText);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    encodedText,
  );

  return {
    messageFields: {
      type: 'text',
      encrypted: true,
      encryptionVersion: 1,
      iv: bytesToBase64(iv),
      content: arrayBufferToBase64(ciphertext),
      text: '',
    },
    previewText: ENCRYPTED_MESSAGE_PREVIEW,
  };
}

async function decryptMessageForConversation(message, conversationId) {
  const convId = String(conversationId || '').trim();
  if (!message?.encrypted || String(message?.type || '').trim().toLowerCase() !== 'text') {
    return message;
  }

  const cacheKey = messageDecryptCacheKey(convId, message);
  const signature = `${String(message?.iv || '').trim()}:${String(message?.content || '').trim()}`;
  const cached = cacheKey ? decryptedMessageCache.get(cacheKey) : null;
  if (cached?.signature === signature) {
    return {
      ...message,
      text: cached.text,
    };
  }

  try {
    const aesKey = await ensureConversationEncryption(convId, [], { createIfMissing: false });
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(message.iv || ''),
      },
      aesKey,
      base64ToBytes(message.content || ''),
    );
    const text = new TextDecoder().decode(plaintext);
    primeDecryptedMessageCache(cacheKey, signature, text);
    return {
      ...message,
      text,
    };
  } catch {
    primeDecryptedMessageCache(cacheKey, signature, ENCRYPTED_MESSAGE_PREVIEW);
    return {
      ...message,
      text: ENCRYPTED_MESSAGE_PREVIEW,
      decryptionFailed: true,
    };
  }
}

async function resolveMessageRows(rows = [], conversationId = '') {
  const convId = String(conversationId || '').trim();
  if (!convId || !Array.isArray(rows) || !rows.length) return Array.isArray(rows) ? rows : [];
  const hasEncryptedRows = rows.some(
    (row) => row?.encrypted === true && String(row?.type || '').trim().toLowerCase() === 'text',
  );
  if (!hasEncryptedRows) return rows;
  return Promise.all(rows.map((row) => decryptMessageForConversation(row, convId)));
}

function clearPendingReadWrites() {
  pendingReadWrites.forEach((entry) => {
    if (entry?.timerId) {
      window.clearTimeout(entry.timerId);
    }
  });
  pendingReadWrites.clear();
}

function preloadConversationMessages(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || messageCache.has(convId) || messagePreloadPending.has(convId)) return;

  const messagesQuery = query(
    collection(db, 'neuConversations', convId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(15),
  );

  let stop = () => {};
  messagePreloadPending.set(convId, () => stop());

  stop = onSnapshot(
    messagesQuery,
    async (snapshot) => {
      const rows = (snapshot.docs || [])
        .map((docSnap) => normalizeMessage(docSnap))
        .reverse();
      const resolvedRows = await resolveMessageRows(rows, convId).catch(() => rows);
      updateMessageCache(convId, resolvedRows, { preloaded: true });
      clearMessagePreload(convId);
    },
    () => {
      clearMessagePreload(convId);
    },
  );
}

function preloadTopConversationMessages(rows = []) {
  const topConversationIds = (Array.isArray(rows) ? rows : [])
    .slice(0, 3)
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);

  topConversationIds.forEach((conversationId) => {
    preloadConversationMessages(conversationId);
  });
}

function supportsVoiceRecording() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function supportsSpeechRecognition() {
  return typeof navigator !== 'undefined' && !!getSpeechRecognitionCtor();
}

function isVoiceRecordingActive() {
  return !!(
    voiceRecorderState.mediaRecorder &&
    typeof voiceRecorderState.mediaRecorder.state === 'string' &&
    voiceRecorderState.mediaRecorder.state !== 'inactive'
  );
}

function stopVoiceStream(stream = voiceRecorderState.stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore track stop failures
    }
  });
}

function setRecordButtonState(button, recording = false) {
  if (!(button instanceof HTMLButtonElement)) return;
  button.classList.toggle('is-recording', recording);
  button.setAttribute('aria-pressed', recording ? 'true' : 'false');
  button.setAttribute('aria-label', recording ? 'Detener grabacion' : 'Grabar voz');
  button.title = recording ? 'Detener grabacion' : 'Grabar voz';
  button.textContent = recording ? '■' : '🎙';
}

function panelRecordButtons() {
  const buttons = [];
  const { host } = pageShell();
  if (host instanceof HTMLElement) {
    const hostRecord = qRole('record', host);
    if (hostRecord instanceof HTMLButtonElement) buttons.push(hostRecord);
  }

  const { dock } = dockShell();
  if (dock instanceof HTMLElement) {
    const dockRecord = qRole('record', dock);
    if (dockRecord instanceof HTMLButtonElement) buttons.push(dockRecord);
  }

  return buttons;
}

function setSpeechButtonState(button, listening = false) {
  if (!(button instanceof HTMLButtonElement)) return;
  const supported = supportsSpeechRecognition();
  button.hidden = !supported;
  if (!supported) return;
  button.classList.toggle('is-recording', listening);
  button.setAttribute('aria-pressed', listening ? 'true' : 'false');
  button.setAttribute('aria-label', listening ? 'Detener voz a texto' : 'Dictar mensaje');
  button.title = listening ? 'Detener voz a texto' : 'Dictar mensaje';
  button.innerHTML = listening ? '&#9632;' : '&#127908;';
}

function panelSpeechButtons() {
  const buttons = [];
  const { host } = pageShell();
  if (host instanceof HTMLElement) {
    const hostSpeech = qRole('speech', host);
    if (hostSpeech instanceof HTMLButtonElement) buttons.push(hostSpeech);
  }

  const { dock } = dockShell();
  if (dock instanceof HTMLElement) {
    const dockSpeech = qRole('speech', dock);
    if (dockSpeech instanceof HTMLButtonElement) buttons.push(dockSpeech);
  }

  return buttons;
}

function syncVoiceRecordingUi() {
  const recording = isVoiceRecordingActive() || voiceRecorderState.stopping;
  panelRecordButtons().forEach((button) => {
    setRecordButtonState(
      button,
      recording && voiceRecorderState.scope === 'panel',
    );
  });
  openThreads.forEach((thread) => {
    setRecordButtonState(
      thread?.recordBtn,
      recording && voiceRecorderState.scope === 'thread' && thread === voiceRecorderState.thread,
    );
  });
}

function syncSpeechRecognitionUi() {
  const listening = speechRecognitionState.listening === true;
  panelSpeechButtons().forEach((button) => {
    setSpeechButtonState(
      button,
      listening && speechRecognitionState.scope === 'panel',
    );
  });
  openThreads.forEach((thread) => {
    setSpeechButtonState(
      thread?.speechBtn,
      listening && speechRecognitionState.scope === 'thread' && thread === speechRecognitionState.thread,
    );
  });
}

function clearVoiceRecordingState() {
  stopVoiceStream();
  voiceRecorderState.mediaRecorder = null;
  voiceRecorderState.stream = null;
  voiceRecorderState.chunks = [];
  voiceRecorderState.conversationId = '';
  voiceRecorderState.scope = '';
  voiceRecorderState.thread = null;
  voiceRecorderState.mimeType = 'audio/webm';
  voiceRecorderState.stopping = false;
  voiceRecorderState.discardOnStop = false;
  voiceRecorderState.stopPromise = null;
  voiceRecorderState.stopResolve = null;
  syncVoiceRecordingUi();
}

function getSpeechInputTarget({ scope = 'panel', thread = null } = {}) {
  if (scope === 'thread' && thread && typeof thread === 'object') {
    return {
      input: thread.inputEl instanceof HTMLTextAreaElement ? thread.inputEl : null,
      button: thread.speechBtn instanceof HTMLButtonElement ? thread.speechBtn : null,
    };
  }

  const panelScope = activePanelScope();
  return {
    input: qRole('input', panelScope),
    button: qRole('speech', panelScope),
  };
}

function clearSpeechRecognitionState() {
  const recognition = speechRecognitionState.recognition;
  if (recognition) {
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
  }
  speechRecognitionState.recognition = null;
  speechRecognitionState.listening = false;
  speechRecognitionState.conversationId = '';
  speechRecognitionState.scope = '';
  speechRecognitionState.thread = null;
  speechRecognitionState.baseValue = '';
  syncSpeechRecognitionUi();
}

function stopSpeechRecognition() {
  const recognition = speechRecognitionState.recognition;
  clearSpeechRecognitionState();
  if (!recognition) return;
  try {
    recognition.stop();
  } catch {
    // ignore stop failures
  }
}

function stopSpeechRecognitionForConversation(conversationId, { scope = '' } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || speechRecognitionState.listening !== true) return;
  if (String(speechRecognitionState.conversationId || '').trim() !== convId) return;
  if (scope && String(speechRecognitionState.scope || '').trim() !== String(scope || '').trim()) return;
  stopSpeechRecognition();
}

function applySpeechTranscript(transcript) {
  const target = getSpeechInputTarget({
    scope: speechRecognitionState.scope,
    thread: speechRecognitionState.thread,
  });
  const input = target.input;
  if (!(input instanceof HTMLTextAreaElement)) return;

  const baseValue = String(speechRecognitionState.baseValue || '');
  const nextTranscript = String(transcript || '').trim();
  const nextValue = nextTranscript
    ? `${baseValue}${baseValue && !/\s$/.test(baseValue) ? ' ' : ''}${nextTranscript}`
    : baseValue;

  input.value = nextValue;
  if (speechRecognitionState.scope === 'thread') {
    resizeThreadInput(input);
  } else {
    resizeInput();
  }
}

async function startSpeechRecognition(conversationId, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!convId || !SpeechRecognitionCtor) {
    console.warn('[mini-chat-v4] speech recognition unavailable', {
      conversationId: convId,
      supported: !!SpeechRecognitionCtor,
    });
    syncSpeechRecognitionUi();
    return;
  }

  const target = getSpeechInputTarget({ scope, thread });
  if (!(target.input instanceof HTMLTextAreaElement)) {
    console.warn('[mini-chat-v4] speech recognition missing input target', {
      conversationId: convId,
      scope,
    });
    return;
  }

  if (isVoiceRecordingActive()) {
    console.warn('[mini-chat-v4] speech recognition blocked by active voice recording');
    await stopVoiceRecording({ discard: true });
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = String(navigator.language || 'es-ES').trim() || 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  speechRecognitionState.recognition = recognition;
  speechRecognitionState.listening = true;
  speechRecognitionState.conversationId = convId;
  speechRecognitionState.scope = scope === 'thread' ? 'thread' : 'panel';
  speechRecognitionState.thread = scope === 'thread' ? thread : null;
  speechRecognitionState.baseValue = String(target.input.value || '');

  recognition.onstart = () => {
    console.info('[mini-chat-v4] speech recognition started', {
      conversationId: convId,
      scope: speechRecognitionState.scope,
      lang: recognition.lang,
    });
  };

  recognition.onresult = (event) => {
    let transcript = '';
    const results = Array.from(event.results || []).slice(event.resultIndex || 0);
    results.forEach((result) => {
      transcript += String(result?.[0]?.transcript || '');
    });
    applySpeechTranscript(transcript);
  };

  recognition.onend = () => {
    console.info('[mini-chat-v4] speech recognition ended', {
      conversationId: convId,
      scope: speechRecognitionState.scope,
    });
    clearSpeechRecognitionState();
  };

  recognition.onerror = (event) => {
    console.warn('[mini-chat-v4] speech recognition error', {
      conversationId: convId,
      scope: speechRecognitionState.scope,
      error: String(event?.error || ''),
      message: String(event?.message || ''),
    });
    stopSpeechRecognition();
  };

  syncSpeechRecognitionUi();

  try {
    console.info('[mini-chat-v4] speech recognition start clicked', {
      conversationId: convId,
      scope: speechRecognitionState.scope,
    });
    recognition.start();
  } catch (error) {
    console.warn('[mini-chat-v4] speech recognition failed to start', error);
    clearSpeechRecognitionState();
  }
}

async function toggleSpeechRecognition(conversationId, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  const currentConversationId = String(speechRecognitionState.conversationId || '').trim();
  const currentScope = String(speechRecognitionState.scope || '').trim();
  const nextScope = scope === 'thread' ? 'thread' : 'panel';
  const sameTarget =
    speechRecognitionState.listening === true &&
    currentConversationId === convId &&
    currentScope === nextScope &&
    (nextScope !== 'thread' || speechRecognitionState.thread === thread);

  if (sameTarget) {
    stopSpeechRecognition();
    return;
  }

  if (speechRecognitionState.listening === true) {
    stopSpeechRecognition();
  }

  await startSpeechRecognition(convId, { scope: nextScope, thread });
}

async function sendRecordedAudio(conversationId, file, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !(file instanceof File)) return;

  if (!acquireUploadLock()) {
    console.warn('[mini-chat-v4] audio upload blocked: another upload is in progress');
    return;
  }

  const threadTarget = scope === 'thread' ? thread : null;
  if (threadTarget) {
    setThreadUploading(threadTarget, true, 0);
  } else {
    setPanelUploading(true, 0);
  }

  try {
    await firestoreController.sendAttachmentToConversation(convId, file, (progress) => {
      if (threadTarget) {
        setThreadUploading(threadTarget, true, progress);
      } else {
        setPanelUploading(true, progress);
      }
    });
  } catch (error) {
    console.warn('[mini-chat-v4] audio upload failed', error);
  } finally {
    if (threadTarget) {
      setThreadUploading(threadTarget, false, 0);
    } else {
      setPanelUploading(false, 0);
    }
    releaseUploadLock();
  }
}

async function uploadDroppedFiles(conversationId, files, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  const safeFiles = Array.from(files || []).filter((file) => file instanceof File);
  if (!convId || !safeFiles.length) return;

  const threadTarget = scope === 'thread' ? thread : null;
  for (const file of safeFiles) {
    if (!acquireUploadLock()) {
      console.warn('[mini-chat-v4] drop upload blocked: another upload is in progress');
      return;
    }

    if (threadTarget) {
      setThreadUploading(threadTarget, true, 0);
    } else {
      setPanelUploading(true, 0);
    }

    try {
      await firestoreController.sendAttachmentToConversation(convId, file, (progress) => {
        if (threadTarget) {
          setThreadUploading(threadTarget, true, progress);
        } else {
          setPanelUploading(true, progress);
        }
      });
    } catch (error) {
      console.warn('[mini-chat-v4] dropped attachment upload failed', error);
    } finally {
      if (threadTarget) {
        setThreadUploading(threadTarget, false, 0);
      } else {
        setPanelUploading(false, 0);
      }
      releaseUploadLock();
    }
  }
}

function dragHasFiles(event) {
  const types = event?.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function ensureDropZoneOverlay(container) {
  if (!(container instanceof HTMLElement)) return null;
  let overlay = container.querySelector('.mini-chat-drop-zone');
  if (overlay instanceof HTMLElement) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'mini-chat-drop-zone';
  overlay.hidden = true;
  overlay.textContent = 'Drop files to send';
  container.appendChild(overlay);
  return overlay;
}

function setDropZoneVisible(container, visible = false) {
  if (!(container instanceof HTMLElement)) return;
  const overlay = ensureDropZoneOverlay(container);
  if (!(overlay instanceof HTMLElement)) return;
  const active = visible === true;
  overlay.hidden = !active;
  container.classList.toggle('is-dragging', active);
}

function wireConversationDropZone(container, { getConversationId, scope = 'panel', thread = null } = {}) {
  if (!(container instanceof HTMLElement) || typeof getConversationId !== 'function') {
    return () => {};
  }

  const existing = dropZoneMeta.get(container);
  if (existing?.cleanup instanceof Function) {
    return existing.cleanup;
  }

  ensureDropZoneOverlay(container);
  let dragDepth = 0;

  const onDragEnter = (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth += 1;
    setDropZoneVisible(container, true);
  };

  const onDragOver = (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setDropZoneVisible(container, true);
  };

  const onDragLeave = (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setDropZoneVisible(container, false);
    }
  };

  const onDrop = (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0;
    setDropZoneVisible(container, false);

    const conversationId = String(getConversationId() || '').trim();
    if (!conversationId) return;

    uploadDroppedFiles(conversationId, event.dataTransfer?.files, { scope, thread }).catch((error) => {
      console.warn('[mini-chat-v4] dropped files failed', error);
    });
  };

  container.addEventListener('dragenter', onDragEnter);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragleave', onDragLeave);
  container.addEventListener('drop', onDrop);

  const cleanup = () => {
    container.removeEventListener('dragenter', onDragEnter);
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('dragleave', onDragLeave);
    container.removeEventListener('drop', onDrop);
    setDropZoneVisible(container, false);
    dropZoneMeta.delete(container);
  };

  dropZoneMeta.set(container, { cleanup });
  return cleanup;
}

async function startVoiceRecording(conversationId, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !supportsVoiceRecording()) {
    console.warn('[mini-chat-v4] voice recording is not supported in this browser');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.warn('[mini-chat-v4] microphone permission denied', error);
    return;
  }

  let recorder;
  const preferredMimeType =
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

  try {
    recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
  } catch {
    recorder = new MediaRecorder(stream);
  }

  voiceRecorderState.mediaRecorder = recorder;
  voiceRecorderState.stream = stream;
  voiceRecorderState.chunks = [];
  voiceRecorderState.conversationId = convId;
  voiceRecorderState.scope = scope === 'thread' ? 'thread' : 'panel';
  voiceRecorderState.thread = scope === 'thread' ? thread : null;
  voiceRecorderState.mimeType = recorder.mimeType || 'audio/webm';
  voiceRecorderState.stopping = false;
  voiceRecorderState.discardOnStop = false;
  voiceRecorderState.stopPromise = null;
  voiceRecorderState.stopResolve = null;

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      voiceRecorderState.chunks.push(event.data);
    }
  });

  recorder.addEventListener('stop', () => {
    const chunks = Array.isArray(voiceRecorderState.chunks)
      ? [...voiceRecorderState.chunks]
      : [];
    const discard = voiceRecorderState.discardOnStop === true;
    const targetConversationId = voiceRecorderState.conversationId;
    const targetScope = voiceRecorderState.scope;
    const targetThread = voiceRecorderState.thread;
    const mimeType = voiceRecorderState.mimeType || 'audio/webm';
    const stopResolve = voiceRecorderState.stopResolve;

    clearVoiceRecordingState();
    if (typeof stopResolve === 'function') {
      stopResolve();
    }

    if (discard || !targetConversationId || !chunks.length) {
      return;
    }

    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
    if (!blob.size) return;

    const file = new File(
      [blob],
      `voice-message-${Date.now()}.webm`,
      { type: 'audio/webm' },
    );
    sendRecordedAudio(targetConversationId, file, {
      scope: targetScope,
      thread: targetThread,
    }).catch((error) => {
      console.warn('[mini-chat-v4] voice message failed', error);
    });
  });

  recorder.start();
  syncVoiceRecordingUi();
}

function stopVoiceRecording({ discard = false } = {}) {
  if (!isVoiceRecordingActive()) {
    clearVoiceRecordingState();
    return Promise.resolve();
  }

  voiceRecorderState.discardOnStop = voiceRecorderState.discardOnStop || discard;
  if (voiceRecorderState.stopping) {
    return voiceRecorderState.stopPromise || Promise.resolve();
  }

  voiceRecorderState.stopping = true;
  syncVoiceRecordingUi();
  voiceRecorderState.stopPromise = new Promise((resolve) => {
    voiceRecorderState.stopResolve = resolve;
    try {
      voiceRecorderState.mediaRecorder.stop();
    } catch {
      clearVoiceRecordingState();
      resolve();
    }
  });
  return voiceRecorderState.stopPromise;
}

function stopVoiceRecordingForConversation(conversationId, { discard = true, scope = '' } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId || !isVoiceRecordingActive()) return;
  if (String(voiceRecorderState.conversationId || '').trim() !== convId) return;
  if (scope && String(voiceRecorderState.scope || '').trim() !== String(scope || '').trim()) return;
  stopVoiceRecording({ discard }).catch(() => null);
}

async function toggleVoiceRecording(conversationId, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  const currentConversationId = String(voiceRecorderState.conversationId || '').trim();
  const currentScope = String(voiceRecorderState.scope || '').trim();
  const nextScope = scope === 'thread' ? 'thread' : 'panel';
  const sameTarget =
    isVoiceRecordingActive() &&
    currentConversationId === convId &&
    currentScope === nextScope &&
    (nextScope !== 'thread' || voiceRecorderState.thread === thread);

  if (sameTarget) {
    await stopVoiceRecording({ discard: false });
    return;
  }

  if (speechRecognitionState.listening === true) {
    stopSpeechRecognition();
  }

  if (isVoiceRecordingActive()) {
    await stopVoiceRecording({ discard: true });
  }

  await startVoiceRecording(convId, { scope: nextScope, thread });
}

function wireVoiceRecordingLifecycle() {
  if (voiceRecordingLifecycleWired) return;
  voiceRecordingLifecycleWired = true;

  window.addEventListener('beforeunload', () => {
    stopVoiceRecording({ discard: true }).catch(() => null);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopVoiceRecording({ discard: true }).catch(() => null);
    }
  });
}

function wireSpeechRecognitionLifecycle() {
  if (speechRecognitionLifecycleWired) return;
  speechRecognitionLifecycleWired = true;

  window.addEventListener('beforeunload', () => {
    stopSpeechRecognition();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSpeechRecognition();
    }
  });
}

function supportsVoiceCalls() {
  return (
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function callDocRef(conversationId) {
  return doc(db, 'neuCalls', String(conversationId || '').trim());
}

function getConversationCallPeerUid(conversation) {
  if (!conversation || conversation?.type === 'group' || conversation?.type === 'support') {
    return '';
  }
  return getConversationPresenceUid(conversation);
}

function ensureCallRemoteAudioElement() {
  if (
    callSessionState.remoteAudioEl instanceof HTMLAudioElement &&
    document.body.contains(callSessionState.remoteAudioEl)
  ) {
    return callSessionState.remoteAudioEl;
  }

  const audio = document.createElement('audio');
  audio.hidden = true;
  audio.autoplay = true;
  audio.playsInline = true;
  document.body.appendChild(audio);
  callSessionState.remoteAudioEl = audio;
  return audio;
}

function resetCallSessionState() {
  const pc = callSessionState.pc;
  const localStream = callSessionState.localStream;
  const remoteStream = callSessionState.remoteStream;
  const remoteAudioEl = callSessionState.remoteAudioEl;

  callSessionState.conversationId = '';
  callSessionState.otherUid = '';
  callSessionState.localRole = '';
  callSessionState.pc = null;
  callSessionState.localStream = null;
  callSessionState.remoteStream = null;
  callSessionState.remoteAudioEl = null;
  callSessionState.status = 'idle';
  callSessionState.lastOfferSdp = '';
  callSessionState.lastAnswerSdp = '';
  callSessionState.processedRemoteCandidates.clear();
  callSessionState.pendingRemoteCandidates = [];

  if (pc instanceof RTCPeerConnection) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    try {
      pc.close();
    } catch {
      // ignore close failures
    }
  }

  if (localStream && typeof localStream.getTracks === 'function') {
    localStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore track stop failures
      }
    });
  }

  if (remoteStream && typeof remoteStream.getTracks === 'function') {
    remoteStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore track stop failures
      }
    });
  }

  if (remoteAudioEl instanceof HTMLAudioElement) {
    try {
      remoteAudioEl.pause();
      remoteAudioEl.srcObject = null;
    } catch {
      // ignore audio cleanup failures
    }
    remoteAudioEl.remove();
  }

  syncCallUi();
}

function stopActiveCallListener() {
  const unsub = activeCallListenerState.unsub;
  activeCallListenerState.conversationId = '';
  activeCallListenerState.otherUid = '';
  activeCallListenerState.unsub = null;
  if (typeof unsub !== 'function') return;
  try {
    unsub();
  } catch {
    // ignore unsubscribe failures
  }
}

function setCallControlState(callBtn, hangupBtn, { visible = false, active = false } = {}) {
  const supported = supportsVoiceCalls();
  if (callBtn instanceof HTMLElement) {
    callBtn.hidden = !supported || !visible || active;
    callBtn.classList.toggle('is-active', active);
    if (callBtn instanceof HTMLButtonElement) {
      callBtn.disabled = !supported || !visible;
    }
  }
  if (hangupBtn instanceof HTMLElement) {
    hangupBtn.hidden = !supported || !active;
    if (hangupBtn instanceof HTMLButtonElement) {
      hangupBtn.disabled = !supported || !active;
    }
  }
}

function syncCallUi() {
  const panelConversationId = String(ChatController.getActiveConversation() || '').trim();
  const panelConversation = panelConversationId
    ? ChatController.getConversation(panelConversationId)
    : null;
  const panelPeerUid = getConversationCallPeerUid(panelConversation);
  const panelInCall = callSessionState.conversationId === panelConversationId;

  const { host } = pageShell();
  const { dock } = dockShell();
  [host, dock].forEach((scope) => {
    if (!(scope instanceof HTMLElement)) return;
    setCallControlState(qRole('call', scope), qRole('hangup', scope), {
      visible: !!panelConversationId && !!panelPeerUid,
      active: panelInCall,
    });
  });

  openThreads.forEach((thread, conversationId) => {
    const convId = String(conversationId || '').trim();
    const conversation = ChatController.getConversation(convId);
    const peerUid = getConversationCallPeerUid(conversation);
    setCallControlState(thread?.callBtn, thread?.hangupBtn, {
      visible: !!convId && !!peerUid,
      active: callSessionState.conversationId === convId,
    });
  });
}

function callCandidateSignature(candidate) {
  try {
    return JSON.stringify(candidate || {});
  } catch {
    return '';
  }
}

async function publishCallCandidate(conversationId, localRole, candidate) {
  const convId = String(conversationId || '').trim();
  const role = String(localRole || '').trim();
  if (!convId || !role || !candidate) return;

  try {
    await updateDoc(callDocRef(convId), {
      [`candidates.${role}`]: arrayUnion(candidate),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('[mini-chat-v4] call candidate publish failed', error);
  }
}

async function addRemoteCallCandidate(candidate) {
  const signature = callCandidateSignature(candidate);
  if (!signature || !(callSessionState.pc instanceof RTCPeerConnection)) return;
  if (callSessionState.processedRemoteCandidates.has(signature)) return;

  if (!callSessionState.pc.remoteDescription?.type) {
    const alreadyPending = callSessionState.pendingRemoteCandidates.some(
      (item) => callCandidateSignature(item) === signature,
    );
    if (!alreadyPending) {
      callSessionState.pendingRemoteCandidates.push(candidate);
    }
    return;
  }

  try {
    await callSessionState.pc.addIceCandidate(candidate);
    callSessionState.processedRemoteCandidates.add(signature);
  } catch (error) {
    console.warn('[mini-chat-v4] call candidate apply failed', error);
  }
}

async function flushPendingCallCandidates() {
  if (!callSessionState.pendingRemoteCandidates.length) return;
  const pending = [...callSessionState.pendingRemoteCandidates];
  callSessionState.pendingRemoteCandidates = [];
  for (const candidate of pending) {
    await addRemoteCallCandidate(candidate);
  }
}

async function syncRemoteCallCandidates(data, remoteRole) {
  const candidates = Array.isArray(data?.candidates?.[remoteRole])
    ? data.candidates[remoteRole]
    : [];
  for (const candidate of candidates) {
    await addRemoteCallCandidate(candidate);
  }
}

async function ensureCallPeerConnection(conversationId, otherUid, localRole, localStream = null) {
  const convId = String(conversationId || '').trim();
  const peerUid = String(otherUid || '').trim();
  const role = String(localRole || '').trim();
  if (!convId || !peerUid || !role || !supportsVoiceCalls()) return null;

  if (
    callSessionState.pc instanceof RTCPeerConnection &&
    callSessionState.conversationId === convId &&
    callSessionState.localRole === role
  ) {
    return callSessionState.pc;
  }

  if (callSessionState.pc instanceof RTCPeerConnection) {
    resetCallSessionState();
  }

  let stream = localStream;
  if (!(stream instanceof MediaStream)) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  callSessionState.conversationId = convId;
  callSessionState.otherUid = peerUid;
  callSessionState.localRole = role;
  callSessionState.pc = pc;
  callSessionState.localStream = stream;
  callSessionState.remoteStream = null;
  callSessionState.status = 'calling';
  callSessionState.lastOfferSdp = '';
  callSessionState.lastAnswerSdp = '';
  callSessionState.processedRemoteCandidates.clear();
  callSessionState.pendingRemoteCandidates = [];

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    publishCallCandidate(convId, role, event.candidate.toJSON());
  };

  pc.ontrack = (event) => {
    const remoteStream = event.streams?.[0] instanceof MediaStream
      ? event.streams[0]
      : null;
    if (remoteStream) {
      callSessionState.remoteStream = remoteStream;
    } else {
      if (!(callSessionState.remoteStream instanceof MediaStream)) {
        callSessionState.remoteStream = new MediaStream();
      }
      callSessionState.remoteStream.addTrack(event.track);
    }

    const audio = ensureCallRemoteAudioElement();
    audio.srcObject = callSessionState.remoteStream;
    audio.play().catch(() => null);
  };

  pc.onconnectionstatechange = () => {
    if (callSessionState.pc !== pc || callSessionState.conversationId !== convId) return;
    const nextState = String(pc.connectionState || '').trim().toLowerCase();
    if (nextState === 'connected') {
      callSessionState.status = 'connected';
      syncCallUi();
      updateDoc(callDocRef(convId), {
        status: 'connected',
        updatedAt: serverTimestamp(),
      }).catch(() => null);
      return;
    }

    if (nextState === 'failed' || nextState === 'disconnected' || nextState === 'closed') {
      endActiveCall({ updateSignal: true }).catch(() => null);
    }
  };

  syncCallUi();
  return pc;
}

async function answerIncomingCall(conversationId, conversation, data) {
  const convId = String(conversationId || '').trim();
  const offer = data?.offer || null;
  const offerSdp = String(offer?.sdp || '').trim();
  const peerUid = getConversationCallPeerUid(conversation);
  if (!convId || !peerUid || !offerSdp) return;

  if (
    callSessionState.pc instanceof RTCPeerConnection &&
    callSessionState.conversationId === convId &&
    callSessionState.localRole === 'callee' &&
    callSessionState.lastOfferSdp === offerSdp
  ) {
    await syncRemoteCallCandidates(data, 'caller');
    return;
  }

  let pc;
  try {
    pc = await ensureCallPeerConnection(convId, peerUid, 'callee');
  } catch (error) {
    console.warn('[mini-chat-v4] incoming call stream failed', error);
    updateDoc(callDocRef(convId), {
      status: 'ended',
      updatedAt: serverTimestamp(),
    }).catch(() => null);
    return;
  }

  if (!(pc instanceof RTCPeerConnection)) return;

  try {
    await pc.setRemoteDescription(offer);
    callSessionState.lastOfferSdp = offerSdp;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    callSessionState.status = 'connected';
    syncCallUi();

    await setDoc(
      callDocRef(convId),
      {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
        status: 'connected',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await syncRemoteCallCandidates(data, 'caller');
    await flushPendingCallCandidates();
  } catch (error) {
    console.warn('[mini-chat-v4] incoming call answer failed', error);
    endActiveCall({ updateSignal: true }).catch(() => null);
  }
}

async function handleCallSnapshot(snapshot, conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || activeCallListenerState.conversationId !== convId) return;

  const conversation = ChatController.getConversation(convId);
  const peerUid = getConversationCallPeerUid(conversation);
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (!peerUid || !currentUserId) {
    if (callSessionState.conversationId === convId) {
      resetCallSessionState();
    }
    return;
  }

  const data = snapshot.exists() ? snapshot.data() || {} : null;
  if (!data) {
    if (callSessionState.conversationId === convId) {
      resetCallSessionState();
    }
    return;
  }

  const callerUid = String(data.caller || '').trim();
  const calleeUid = String(data.callee || '').trim();
  if (currentUserId !== callerUid && currentUserId !== calleeUid) return;

  const localRole = currentUserId === callerUid ? 'caller' : 'callee';
  const remoteRole = localRole === 'caller' ? 'callee' : 'caller';
  const status = String(data.status || '').trim() || (data.answer ? 'connected' : 'calling');

  if (status === 'ended') {
    if (callSessionState.conversationId === convId) {
      resetCallSessionState();
    }
    syncCallUi();
    return;
  }

  if (localRole === 'callee' && data.offer && !data.answer) {
    await answerIncomingCall(convId, conversation, data);
  }

  if (
    localRole === 'caller' &&
    data.answer &&
    callSessionState.pc instanceof RTCPeerConnection &&
    callSessionState.conversationId === convId
  ) {
    const answerSdp = String(data.answer.sdp || '').trim();
    if (answerSdp && callSessionState.lastAnswerSdp !== answerSdp) {
      try {
        await callSessionState.pc.setRemoteDescription(data.answer);
        callSessionState.lastAnswerSdp = answerSdp;
        await flushPendingCallCandidates();
      } catch (error) {
        console.warn('[mini-chat-v4] call answer apply failed', error);
      }
    }
  }

  if (
    callSessionState.pc instanceof RTCPeerConnection &&
    callSessionState.conversationId === convId &&
    callSessionState.localRole === localRole
  ) {
    callSessionState.status = status;
    syncCallUi();
    await syncRemoteCallCandidates(data, remoteRole);
  }
}

function syncActiveCallListener(conversationId, conversation = null) {
  const convId = String(conversationId || '').trim();
  const row = conversation || ChatController.getConversation(convId);
  const peerUid = getConversationCallPeerUid(row);
  if (!supportsVoiceCalls() || !convId || !peerUid) {
    stopActiveCallListener();
    syncCallUi();
    return;
  }

  if (
    activeCallListenerState.conversationId === convId &&
    activeCallListenerState.otherUid === peerUid &&
    typeof activeCallListenerState.unsub === 'function'
  ) {
    return;
  }

  stopActiveCallListener();
  activeCallListenerState.conversationId = convId;
  activeCallListenerState.otherUid = peerUid;
  activeCallListenerState.unsub = onSnapshot(
    callDocRef(convId),
    (snapshot) => {
      handleCallSnapshot(snapshot, convId).catch((error) => {
        console.warn('[mini-chat-v4] call snapshot failed', error);
      });
    },
    (error) => {
      console.warn('[mini-chat-v4] call listener failed', error);
    },
  );
  syncCallUi();
}

async function startVoiceCall(conversationId) {
  const convId = String(conversationId || '').trim();
  const currentUserId = String(getChatState().currentUid || '').trim();
  const conversation = ChatController.getConversation(convId);
  const peerUid = getConversationCallPeerUid(conversation);
  if (!supportsVoiceCalls() || !convId || !currentUserId || !peerUid) return;

  if (
    callSessionState.pc instanceof RTCPeerConnection &&
    callSessionState.conversationId === convId
  ) {
    syncCallUi();
    return;
  }

  if (callSessionState.pc instanceof RTCPeerConnection) {
    await endActiveCall({ updateSignal: true });
  }

  syncActiveCallListener(convId, conversation);

  let pc;
  try {
    pc = await ensureCallPeerConnection(convId, peerUid, 'caller');
  } catch (error) {
    console.warn('[mini-chat-v4] call start failed', error);
    resetCallSessionState();
    return;
  }

  if (!(pc instanceof RTCPeerConnection)) return;

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    callSessionState.lastOfferSdp = String(offer.sdp || '').trim();
    callSessionState.status = 'calling';
    syncCallUi();

    await setDoc(callDocRef(convId), {
      caller: currentUserId,
      callee: peerUid,
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      answer: null,
      candidates: {
        caller: [],
        callee: [],
      },
      status: 'calling',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('[mini-chat-v4] call offer failed', error);
    endActiveCall({ updateSignal: true }).catch(() => null);
  }
}

async function endActiveCall({ updateSignal = true } = {}) {
  const convId = String(callSessionState.conversationId || '').trim();
  resetCallSessionState();

  if (!updateSignal || !convId) return;
  updateDoc(callDocRef(convId), {
    status: 'ended',
    updatedAt: serverTimestamp(),
  }).catch(() => null);
}

function wireVoiceCallLifecycle() {
  if (callLifecycleWired) return;
  callLifecycleWired = true;

  window.addEventListener('beforeunload', () => {
    endActiveCall({ updateSignal: true }).catch(() => null);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endActiveCall({ updateSignal: true }).catch(() => null);
    }
  });
}

function stopActiveReadReceiptListener() {
  const unsub = activeReadReceiptState.unsub;
  activeReadReceiptState.conversationId = '';
  activeReadReceiptState.otherUid = '';
  activeReadReceiptState.lastReadMessageId = '';
  activeReadReceiptState.lastReadAt = null;
  activeReadReceiptState.unsub = null;

  if (typeof unsub !== 'function') return;
  try {
    unsub();
  } catch {
    // ignore unsubscribe failures
  }
}

function stopActiveDeliveryListener() {
  const unsub = activeDeliveryState.unsub;
  activeDeliveryState.conversationId = '';
  activeDeliveryState.otherUid = '';
  activeDeliveryState.lastDeliveredMessageId = '';
  activeDeliveryState.unsub = null;

  if (typeof unsub !== 'function') return;
  try {
    unsub();
  } catch {
    // ignore unsubscribe failures
  }
}

function getLastOutgoingMessageId(rows = []) {
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (
    !currentUserId ||
    !Array.isArray(rows) ||
    !rows.length
  ) {
    return '';
  }

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (String(row?.senderId || '').trim() !== currentUserId) continue;
    return String(row?.id || '').trim();
  }

  return '';
}

function getDeliveryStatus(rows = [], conversationId = '') {
  const convId = String(conversationId || '').trim();
  const messageId = getLastOutgoingMessageId(rows);
  if (!convId || !messageId) {
    return {
      messageId: '',
      labelHtml: '',
      className: '',
    };
  }

  if (
    activeReadReceiptState.conversationId === convId &&
    String(activeReadReceiptState.lastReadMessageId || '').trim() === messageId
  ) {
    return {
      messageId,
      labelHtml: 'Seen',
      className: 'is-seen',
    };
  }

  if (
    activeDeliveryState.conversationId === convId &&
    String(activeDeliveryState.lastDeliveredMessageId || '').trim() === messageId
  ) {
    return {
      messageId,
      labelHtml: '&#10004;&#10004; Delivered',
      className: 'is-delivered',
    };
  }

  return {
    messageId,
    labelHtml: '&#10004; Sent',
    className: 'is-sent',
  };
}

function rerenderReceiptConversation(conversationId = '') {
  const convId = String(
    conversationId ||
    activeReadReceiptState.conversationId ||
    activeDeliveryState.conversationId ||
    '',
  ).trim();
  if (!convId) return;

  if (String(panelReactionState.conversationId || '').trim() === convId) {
    renderMessages(
      panelReactionState.rows,
      convId,
      panelReactionState.reactionData,
    );
  }

  const thread = openThreads.get(convId);
  if (thread?.element instanceof HTMLElement) {
    renderThreadWindowMessages(
      thread.element,
      Array.isArray(thread.rows) ? thread.rows : [],
      convId,
      thread.reactionData instanceof Map ? thread.reactionData : new Map(),
    );
  }
}

function syncActiveReadReceiptListener(conversationId, conversation = null) {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    stopActiveReadReceiptListener();
    return;
  }

  const row = conversation || ChatController.getConversation(convId);
  const otherUid = getConversationPresenceUid(row);
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (
    !otherUid ||
    !currentUserId ||
    otherUid === currentUserId ||
    row?.type === 'group' ||
    row?.type === 'support'
  ) {
    stopActiveReadReceiptListener();
    rerenderReceiptConversation(convId);
    return;
  }

  if (
    activeReadReceiptState.conversationId === convId &&
    activeReadReceiptState.otherUid === otherUid &&
    typeof activeReadReceiptState.unsub === 'function'
  ) {
    return;
  }

  stopActiveReadReceiptListener();
  activeReadReceiptState.conversationId = convId;
  activeReadReceiptState.otherUid = otherUid;
  activeReadReceiptState.unsub = onSnapshot(
    doc(db, 'neuUserChats', otherUid, 'chats', convId),
    (snapshot) => {
      if (
        activeReadReceiptState.conversationId !== convId ||
        activeReadReceiptState.otherUid !== otherUid
      ) {
        return;
      }

      const data = snapshot.exists() ? (snapshot.data() || {}) : {};
      activeReadReceiptState.lastReadMessageId = String(data.lastReadMessageId || '').trim();
      activeReadReceiptState.lastReadAt = data.lastReadAt || null;
      rerenderReceiptConversation(convId);
    },
    () => {
      if (
        activeReadReceiptState.conversationId !== convId ||
        activeReadReceiptState.otherUid !== otherUid
      ) {
        return;
      }

      activeReadReceiptState.lastReadMessageId = '';
      activeReadReceiptState.lastReadAt = null;
      rerenderReceiptConversation(convId);
    },
  );
}

function syncActiveDeliveryListener(conversationId, conversation = null) {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    stopActiveDeliveryListener();
    return;
  }

  const row = conversation || ChatController.getConversation(convId);
  const otherUid = getConversationPresenceUid(row);
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (
    !otherUid ||
    !currentUserId ||
    otherUid === currentUserId ||
    row?.type === 'group' ||
    row?.type === 'support'
  ) {
    stopActiveDeliveryListener();
    rerenderReceiptConversation(convId);
    return;
  }

  if (
    activeDeliveryState.conversationId === convId &&
    activeDeliveryState.otherUid === otherUid &&
    typeof activeDeliveryState.unsub === 'function'
  ) {
    return;
  }

  stopActiveDeliveryListener();
  activeDeliveryState.conversationId = convId;
  activeDeliveryState.otherUid = otherUid;
  activeDeliveryState.unsub = onSnapshot(
    doc(db, 'neuConversations', convId),
    (snapshot) => {
      if (
        activeDeliveryState.conversationId !== convId ||
        activeDeliveryState.otherUid !== otherUid
      ) {
        return;
      }

      const data = snapshot.exists() ? (snapshot.data() || {}) : {};
      const deliveredTo = data?.deliveredTo && typeof data.deliveredTo === 'object'
        ? data.deliveredTo
        : {};
      activeDeliveryState.lastDeliveredMessageId = String(deliveredTo?.[otherUid] || '').trim();
      rerenderReceiptConversation(convId);
    },
    () => {
      if (
        activeDeliveryState.conversationId !== convId ||
        activeDeliveryState.otherUid !== otherUid
      ) {
        return;
      }

      activeDeliveryState.lastDeliveredMessageId = '';
      rerenderReceiptConversation(convId);
    },
  );
}

function presenceDocRef(uid) {
  const cleanUid = String(uid || '').trim();
  return cleanUid ? doc(db, 'neuPresence', cleanUid) : null;
}

function formatLastSeen(timestamp) {
  const date = maybeDate(timestamp);
  if (!date) return '';

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

function conversationStatusFallback(conversation) {
  if (conversation?.type === 'group') return 'Group';
  if (conversation?.type === 'support') return 'Support';
  return 'Offline';
}

function buildPresenceStatusHtml({
  online = false,
  lastActiveAt = null,
  fallback = '',
} = {}) {
  if (online === true) {
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#34c759;vertical-align:middle;margin-right:6px;"></span>Active now';
  }

  if (fallback && fallback !== 'Offline') {
    return esc(fallback);
  }

  const lastSeen = formatLastSeen(lastActiveAt);
  if (lastSeen) {
    return `Last seen ${esc(lastSeen)}`;
  }

  return esc(fallback || 'Offline');
}

function applyPresenceStatus(element, {
  online = false,
  lastActiveAt = null,
  fallback = '',
} = {}) {
  if (!(element instanceof HTMLElement)) return;
  element.innerHTML = buildPresenceStatusHtml({ online, lastActiveAt, fallback });
}

function subscribePresence(uid, callback) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid || typeof callback !== 'function') {
    return () => {};
  }

  let watcher = presenceWatchers.get(cleanUid);
  if (!watcher) {
    watcher = {
      uid: cleanUid,
      callbacks: new Set(),
      data: {},
      hasSnapshot: false,
      unsub: null,
    };
    watcher.unsub = onSnapshot(
      presenceDocRef(cleanUid),
      (snapshot) => {
        watcher.data = snapshot.exists() ? (snapshot.data() || {}) : {};
        watcher.hasSnapshot = true;
        watcher.callbacks.forEach((fn) => {
          try {
            fn(watcher.data);
          } catch (error) {
            console.warn('[mini-chat-v4] presence subscriber failed', error);
          }
        });
      },
      () => {
        watcher.data = {};
        watcher.hasSnapshot = true;
        watcher.callbacks.forEach((fn) => {
          try {
            fn(watcher.data);
          } catch (error) {
            console.warn('[mini-chat-v4] presence subscriber failed', error);
          }
        });
      },
    );
    presenceWatchers.set(cleanUid, watcher);
  }

  watcher.callbacks.add(callback);
  if (watcher.hasSnapshot) {
    callback(watcher.data);
  }

  return () => {
    watcher.callbacks.delete(callback);
    if (watcher.callbacks.size) return;
    if (typeof watcher.unsub === 'function') watcher.unsub();
    presenceWatchers.delete(cleanUid);
  };
}

function getPresenceSnapshot(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return null;
  const watcher = presenceWatchers.get(cleanUid);
  if (!watcher?.hasSnapshot) return null;
  return watcher.data || {};
}

function clearPresenceWatchers() {
  presenceWatchers.forEach((watcher) => {
    if (typeof watcher?.unsub === 'function') watcher.unsub();
  });
  presenceWatchers.clear();
}

function getConversationPresenceUid(conversation) {
  const directOtherUid = String(conversation?.otherUid || '').trim();
  if (directOtherUid) return directOtherUid;

  const { currentUid: uid } = getChatState();
  const members = Array.isArray(conversation?.participants)
    ? conversation.participants.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!members.length) return '';
  return members.find((candidate) => candidate !== uid) || members[0] || '';
}

function panelStatusTargets() {
  const targets = [];
  const { host } = pageShell();
  const { dock } = dockShell();
  const activeThread = openThreads.get(String(ChatController.getActiveConversation() || '').trim());

  if (host instanceof HTMLElement) {
    const status = qRole('thread-status', host);
    if (status instanceof HTMLElement) targets.push(status);
  }

  if (dock instanceof HTMLElement) {
    const status = qRole('thread-status', dock);
    if (status instanceof HTMLElement) targets.push(status);
  }

  if (activeThread?.element instanceof HTMLElement) {
    const { statusEl } = ensureThreadWindowMetaNodes(activeThread.element);
    if (statusEl instanceof HTMLElement) targets.push(statusEl);
  }

  return targets;
}

function applyPanelPresenceStatus(payload = {}) {
  panelStatusTargets().forEach((target) => applyPresenceStatus(target, payload));
}

function stopPanelPresence() {
  runSafeUnsubscribe(panelPresenceRelease);
  panelPresenceConversationId = '';
  panelPresenceUid = '';
  panelPresenceRelease = null;
}

function syncPanelPresence(conversationId, conversation = null) {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    stopPanelPresence();
    return;
  }

  const row = conversation || ChatController.getConversation(convId);
  const fallback = conversationStatusFallback(row);
  const otherUid = getConversationPresenceUid(row);

  if (!otherUid || row?.type === 'group' || row?.type === 'support') {
    if (panelPresenceConversationId !== convId || panelPresenceUid) {
      stopPanelPresence();
    }
    panelPresenceConversationId = convId;
    applyPanelPresenceStatus({ fallback });
    return;
  }

  const cached = getPresenceSnapshot(otherUid);
  if (panelPresenceConversationId === convId && panelPresenceUid === otherUid) {
    applyPanelPresenceStatus({
      online: cached?.online === true,
      lastActiveAt: cached?.lastActiveAt || null,
      fallback,
    });
    return;
  }

  stopPanelPresence();
  panelPresenceConversationId = convId;
  panelPresenceUid = otherUid;
  applyPanelPresenceStatus({
    online: cached?.online === true,
    lastActiveAt: cached?.lastActiveAt || null,
    fallback,
  });
  panelPresenceRelease = subscribePresence(otherUid, (data = {}) => {
    if (panelPresenceConversationId !== convId || panelPresenceUid !== otherUid) {
      return;
    }
    applyPanelPresenceStatus({
      online: data?.online === true,
      lastActiveAt: data?.lastActiveAt || null,
      fallback,
    });
  });
}

function ensureThreadWindowMetaNodes(container) {
  if (!(container instanceof HTMLElement)) {
    return { titleEl: null, statusEl: null };
  }

  const header = qs('.mini-chat-v4-thread-header', container);
  const actions = qs('.mini-chat-v4-thread-actions', container);
  let titleEl = qs('.mini-chat-v4-thread-title', container);
  if (!(header instanceof HTMLElement) || !(titleEl instanceof HTMLElement)) {
    return { titleEl: null, statusEl: null };
  }

  let metaEl = qs('.mini-chat-v4-thread-meta', container);
  if (!(metaEl instanceof HTMLElement)) {
    metaEl = document.createElement('div');
    metaEl.className = 'mini-chat-v4-thread-meta';
    header.insertBefore(metaEl, actions instanceof HTMLElement ? actions : null);
  }

  if (titleEl.parentElement !== metaEl) {
    metaEl.appendChild(titleEl);
  }

  let statusEl = qs('.mini-chat-v4-thread-status', metaEl);
  if (!(statusEl instanceof HTMLElement)) {
    statusEl = document.createElement('div');
    statusEl.className = 'mini-chat-v4-thread-status';
    metaEl.appendChild(statusEl);
  }

  return { titleEl, statusEl };
}

function releaseThreadPresence(thread) {
  if (!thread) return;
  runSafeUnsubscribe(thread.presenceRelease);
  thread.presenceRelease = null;
  thread.presenceUid = '';
}

function syncThreadPresence(conversationId, thread, conversation = null) {
  if (!thread?.element) return;

  const { statusEl } = ensureThreadWindowMetaNodes(thread.element);
  if (!(statusEl instanceof HTMLElement)) return;

  const row = conversation || ChatController.getConversation(conversationId);
  const fallback = conversationStatusFallback(row);
  const otherUid = getConversationPresenceUid(row);

  if (!otherUid || row?.type === 'group' || row?.type === 'support') {
    releaseThreadPresence(thread);
    applyPresenceStatus(statusEl, { fallback });
    return;
  }

  const cached = getPresenceSnapshot(otherUid);
  if (thread.presenceUid === otherUid && typeof thread.presenceRelease === 'function') {
    applyPresenceStatus(statusEl, {
      online: cached?.online === true,
      lastActiveAt: cached?.lastActiveAt || null,
      fallback,
    });
    return;
  }

  releaseThreadPresence(thread);
  thread.presenceUid = otherUid;
  applyPresenceStatus(statusEl, {
    online: cached?.online === true,
    lastActiveAt: cached?.lastActiveAt || null,
    fallback,
  });
  thread.presenceRelease = subscribePresence(otherUid, (data = {}) => {
    if (thread.presenceUid !== otherUid || !(thread.element instanceof HTMLElement)) return;
    applyPresenceStatus(statusEl, {
      online: data?.online === true,
      lastActiveAt: data?.lastActiveAt || null,
      fallback,
    });
  });
}

function stopThreadMessageStream(thread, { clearRows = false } = {}) {
  if (!thread || typeof thread !== 'object') return;
  runSafeUnsubscribe(thread.unsub);
  thread.unsub = null;
  thread.liveConversationId = '';
  thread.streamToken = null;
  clearReactionListeners(thread.reactionUnsubs, thread.reactionData);
  thread.renderQueued = false;
  if (clearRows) {
    thread.rows = [];
    if (thread.element instanceof HTMLElement) {
      renderThreadWindowMessages(thread.element, [], '', new Map());
    }
  }
}

function stopActiveDockThreadStream({ clearRows = false } = {}) {
  const thread = activeDockThreadStreamState.thread;
  if (thread) {
    stopThreadMessageStream(thread, { clearRows });
  }
  activeDockThreadStreamState.conversationId = '';
  activeDockThreadStreamState.thread = null;
}

function syncActiveDockThreadStream(state) {
  const activeSource = String(state?.activeConversationSource || 'page').trim() || 'page';
  const convId = String(state?.activeConversationId || '').trim();

  if (activeSource !== 'dock' || !convId) {
    stopActiveDockThreadStream();
    return;
  }

  const thread = openThreads.get(convId);
  if (!thread || !(thread.element instanceof HTMLElement) || minimizedThreads.has(convId)) {
    stopActiveDockThreadStream();
    return;
  }

  if (
    activeDockThreadStreamState.conversationId === convId &&
    activeDockThreadStreamState.thread === thread &&
    typeof thread.unsub === 'function'
  ) {
    return;
  }

  stopActiveDockThreadStream();
  const cachedRows = getCachedMessages(convId, { consumePreloaded: true });
  if (!Array.isArray(thread.rows) || !thread.rows.length) {
    if (cachedRows.length) {
      thread.rows = cachedRows;
      renderThreadWindowMessages(
        thread.element,
        cachedRows,
        convId,
        thread.reactionData instanceof Map ? thread.reactionData : new Map(),
      );
    }
  }

  thread.unsub = firestoreController.attachMessageStreamForWindow(
    convId,
    thread.element,
    thread,
  );
  activeDockThreadStreamState.conversationId = convId;
  activeDockThreadStreamState.thread = thread;
}

function writeSelfPresence(online, { preferUpdate = true } = {}) {
  const uid = String(getChatState().currentUid || '').trim();
  if (!uid) return Promise.resolve();

  const ref = presenceDocRef(uid);
  if (!ref) return Promise.resolve();

  const payload = {
    uid,
    online: online === true,
    lastActiveAt: serverTimestamp(),
  };

  if (!preferUpdate) {
    return setDoc(ref, payload, { merge: true });
  }

  return updateDoc(ref, payload).catch(() => setDoc(ref, payload, { merge: true }));
}

function wirePresenceLifecycle() {
  if (presenceLifecycleWired) return;
  presenceLifecycleWired = true;

  window.addEventListener('beforeunload', () => {
    writeSelfPresence(false, { preferUpdate: true }).catch(() => null);
  });

  document.addEventListener('visibilitychange', () => {
    writeSelfPresence(!document.hidden, { preferUpdate: true }).catch(() => null);
  });
}

const ChatRouter = (function createChatRouter() {
  function read() {
    const params = new URLSearchParams(location.search);
    return {
      portal: params.get('portal') || '',
      chat: params.get('chat') || '',
      chatKind: params.get('chatKind') || '',
    };
  }

  function write({ portal, chat, chatKind }) {
    const url = new URL(location.href);

    if (portal) url.searchParams.set('portal', portal);
    else url.searchParams.delete('portal');

    if (chat) url.searchParams.set('chat', chat);
    else url.searchParams.delete('chat');

    if (chatKind) url.searchParams.set('chatKind', chatKind);
    else url.searchParams.delete('chatKind');

    history.pushState({}, '', url);
  }

  function replace({ portal, chat, chatKind }) {
    const url = new URL(location.href);

    if (portal) url.searchParams.set('portal', portal);
    else url.searchParams.delete('portal');

    if (chat) url.searchParams.set('chat', chat);
    else url.searchParams.delete('chat');

    if (chatKind) url.searchParams.set('chatKind', chatKind);
    else url.searchParams.delete('chatKind');

    history.replaceState({}, '', url);
  }

  return { read, write, replace };
})();

function isNeuSocialPage() {
  return document.body?.classList?.contains('neu-social-app') === true;
}

function isMobile() {
  return window.innerWidth < 768;
}

function isPageMode() {
  return hostMode === 'page';
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

function createAiSuggestionState() {
  return {
    conversationId: '',
    lastSuggestedMessageId: '',
    hiddenMessageId: '',
    suggestions: [],
  };
}

const panelReactionState = {
  conversationId: '',
  rows: [],
  reactionUnsubs: new Map(),
  reactionData: new Map(),
  renderQueued: false,
  streamToken: null,
};
const panelSuggestionState = createAiSuggestionState();

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qRole(role, root = document) {
  return qs(`[data-mini-chat-role="${String(role || '').trim()}"]`, root);
}

function generateSuggestions(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return [];

  if (lower.includes('hola') || lower.includes('hi')) {
    return ['Hola 😊', '¡Hola! ¿Qué tal?', '¡Hey!'];
  }

  if (lower.includes('?')) {
    return ['Sí 👍', 'No 🙃', 'Ahora te digo'];
  }

  if (lower.includes('gracias')) {
    return ['De nada 😊', '¡Siempre!', 'Con gusto'];
  }

  return ['Ok 👍', 'Perfecto', 'Genial 🔥'];
}

function resetAiSuggestionState(state, conversationId = '') {
  if (!state || typeof state !== 'object') return;
  state.conversationId = String(conversationId || '').trim();
  state.lastSuggestedMessageId = '';
  state.hiddenMessageId = '';
  state.suggestions = [];
}

function getLastIncomingMessage(rows = []) {
  const currentUserId = String(getChatState().currentUid || '').trim();
  if (!currentUserId || !Array.isArray(rows) || !rows.length) return null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (String(row?.senderId || '').trim() === currentUserId) continue;
    const text = String(row?.text || '').trim();
    if (!text || text === ENCRYPTED_MESSAGE_PREVIEW) continue;
    return row;
  }

  return null;
}

function syncAiSuggestionState(state, rows = [], conversationId = '') {
  if (!state || typeof state !== 'object') {
    return { messageId: '', suggestions: [], hidden: true };
  }

  const convId = String(conversationId || '').trim();
  if (state.conversationId !== convId) {
    resetAiSuggestionState(state, convId);
  }

  const incoming = getLastIncomingMessage(rows);
  if (!incoming) {
    state.lastSuggestedMessageId = '';
    state.hiddenMessageId = '';
    state.suggestions = [];
    return { messageId: '', suggestions: [], hidden: true };
  }

  const messageId = String(incoming.id || '').trim();
  if (!messageId) {
    state.suggestions = [];
    return { messageId: '', suggestions: [], hidden: true };
  }

  if (state.lastSuggestedMessageId !== messageId) {
    state.lastSuggestedMessageId = messageId;
    state.hiddenMessageId = '';
    state.suggestions = generateSuggestions(incoming.text);
  }

  const suggestions = Array.isArray(state.suggestions) ? state.suggestions.filter(Boolean) : [];
  return {
    messageId,
    suggestions,
    hidden: state.hiddenMessageId === messageId || !suggestions.length,
  };
}

async function sendSuggestionMessage(conversationId, text, { scope = 'panel', thread = null } = {}) {
  const convId = String(conversationId || '').trim();
  const safeText = String(text || '').trim();
  if (!convId || !safeText) return false;

  try {
    if (scope === 'thread' && thread?.inputEl instanceof HTMLTextAreaElement) {
      thread.inputEl.value = safeText;
      resizeThreadInput(thread.inputEl);
      await firestoreController.sendMessageToConversation(convId, safeText);
      thread.inputEl.value = '';
      resizeThreadInput(thread.inputEl);
      return true;
    }

    const scopeRoot = activePanelScope();
    const input = qRole('input', scopeRoot);
    if (input instanceof HTMLTextAreaElement) {
      input.value = safeText;
      resizeInput();
    }
    await firestoreController.sendMessageToConversation(convId, safeText);
    if (input instanceof HTMLTextAreaElement) {
      input.value = '';
      resizeInput();
    }
    return true;
  } catch (error) {
    console.warn('[mini-chat-v4] suggestion send failed', error);
    return false;
  }
}

function renderAiSuggestionButtons(container, suggestions, onSelect) {
  if (!(container instanceof HTMLElement)) return;
  container.innerHTML = '';
  suggestions.forEach((text) => {
    const button = document.createElement('button');
    button.className = 'mini-chat-ai-chip';
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    button.addEventListener('touchstart', (event) => {
      event.stopPropagation();
    }, { passive: true });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(text);
    });
    container.appendChild(button);
  });
}

function renderPanelAiSuggestions(rows = [], conversationId = '') {
  const scope = activePanelScope();
  const container = qRole('ai-suggestions', scope);
  if (!(container instanceof HTMLElement)) return;

  const convId = String(conversationId || ChatController.getActiveConversation() || '').trim();
  const suggestionState = syncAiSuggestionState(panelSuggestionState, rows, convId);
  if (!convId || suggestionState.hidden) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  renderAiSuggestionButtons(container, suggestionState.suggestions, async (text) => {
    panelSuggestionState.hiddenMessageId = suggestionState.messageId;
    renderPanelAiSuggestions(rows, convId);
    const sent = await sendSuggestionMessage(convId, text, { scope: 'panel' });
    if (!sent) {
      panelSuggestionState.hiddenMessageId = '';
      renderPanelAiSuggestions(rows, convId);
    }
  });
  container.hidden = false;
}

function renderThreadAiSuggestions(container, rows = [], conversationId = '', threadState = null) {
  if (!(container instanceof HTMLElement)) return;
  const suggestionRoot = qRole('ai-suggestions', container);
  if (!(suggestionRoot instanceof HTMLElement)) return;

  const convId = String(conversationId || '').trim();
  const state = threadState?.aiSuggestionState;
  if (!state || typeof state !== 'object') {
    suggestionRoot.hidden = true;
    suggestionRoot.innerHTML = '';
    return;
  }

  const suggestionState = syncAiSuggestionState(state, rows, convId);
  if (!convId || suggestionState.hidden) {
    suggestionRoot.hidden = true;
    suggestionRoot.innerHTML = '';
    return;
  }

  renderAiSuggestionButtons(suggestionRoot, suggestionState.suggestions, async (text) => {
    state.hiddenMessageId = suggestionState.messageId;
    renderThreadAiSuggestions(container, rows, convId, threadState);
    const sent = await sendSuggestionMessage(convId, text, {
      scope: 'thread',
      thread: threadState,
    });
    if (!sent) {
      state.hiddenMessageId = '';
      renderThreadAiSuggestions(container, rows, convId, threadState);
    }
  });
  suggestionRoot.hidden = false;
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

function sortConversationRows(rows = []) {
  return [...rows].sort((a, b) => {
    const aMs = maybeDate(a?.lastAt || a?.updatedAt)?.getTime() || 0;
    const bMs = maybeDate(b?.lastAt || b?.updatedAt)?.getTime() || 0;
    if (aMs !== bMs) return bMs - aMs;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function mapConversationDoc(docSnap, uid) {
  const data = docSnap.data() || {};
  const conversationId = String(docSnap.id || '').trim();
  const members = Array.isArray(data.members)
    ? data.members.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const otherUid = members.find((candidate) => candidate !== uid) || '';
  const profile = getCachedProfile(otherUid);
  const title = String(profile.displayName || '').trim() || 'Conversacion';

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
    unreadCount: 0,
    reads: {
      [uid]: null,
    },
  };
}

function conversationMirrorPayload(row, uid) {
  const convId = String(row?.id || '').trim();
  const members = Array.isArray(row?.participants)
    ? row.participants.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!convId || !uid || !members.includes(uid)) return null;

  const otherUid = String(row?.otherUid || members.find((candidate) => candidate !== uid) || '').trim();
  const payload = {
    otherUid,
    members,
    memberKey: members.length === 2 ? members.slice().sort().join('_') : convId,
    updatedAt: row?.updatedAt || row?.lastAt || serverTimestamp(),
    unreadCount: Number(row?.unreadCount || 0) || 0,
  };

  const lastMessageText = String(row?.lastMessageText || row?.lastMessage?.text || '').trim();
  if (lastMessageText) payload.lastMessageText = lastMessageText;
  if (row?.lastAt) payload.lastMessageAt = row.lastAt;
  const lastMessageSenderId = String(row?.lastMessage?.senderId || '').trim();
  if (lastMessageSenderId) {
    payload.lastMessageSenderId = lastMessageSenderId;
    payload.lastSenderUid = lastMessageSenderId;
  }
  const readAt = row?.reads?.[uid] || null;
  if (readAt) payload.lastReadAt = readAt;
  return payload;
}

async function hydrateConversationFallback(uid) {
  const userId = String(uid || '').trim();
  if (!userId) return [];
  if (fallbackHydratedUid === userId) return getChatState().conversations;
  if (fallbackHydrationPromise) return fallbackHydrationPromise;

  fallbackHydrationPromise = (async () => {
    const snapshot = await getDocs(
      query(
        collection(db, 'neuConversations'),
        where('members', 'array-contains', userId),
        limit(120),
      ),
    );

    const rows = sortConversationRows(
      (snapshot.docs || []).map((docSnap) => mapConversationDoc(docSnap, userId)),
    );

    if (!rows.length) {
      fallbackHydratedUid = userId;
      return [];
    }

    ChatController.setConversations(rows);
    preloadTopConversationMessages(rows);
    warmConversationProfiles();

    await Promise.allSettled(
      rows.map((row) => {
        const payload = conversationMirrorPayload(row, userId);
        if (!payload) return Promise.resolve();
        return setDoc(doc(db, 'neuUserChats', userId, 'chats', row.id), payload, { merge: true });
      }),
    );

    fallbackHydratedUid = userId;
    return rows;
  })().finally(() => {
    fallbackHydrationPromise = null;
  });

  return fallbackHydrationPromise;
}

function refreshConversationProfiles() {
  const { conversations: rows, currentUid: uid } = getChatState();
  const nextRows = rows.map((conversation) => {
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
        if (memberUid === uid) return currentName;
        if (memberUid === otherUid) return title;
        return memberUid.slice(0, 8) || 'Usuario';
      }),
    };
  });
  ChatController.setConversations(nextRows);
}

function warmConversationProfiles() {
  const targets = getChatState().conversations
    .map((conversation) => String(conversation?.otherUid || '').trim())
    .filter(Boolean);

  targets.forEach((uid) => {
    ensureProfile(uid)
      .then(() => {
        refreshConversationProfiles();
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

function setMiniChatManagedNodes(enabled = true) {
  const managed = enabled === true;
  const { empty, host, list, search } = pageShell();
  [empty, host, list, search].forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (managed) {
      node.dataset.miniChatManaged = '1';
      return;
    }
    delete node.dataset.miniChatManaged;
  });

  if (document.body instanceof HTMLBodyElement) {
    if (managed) {
      document.body.dataset.miniChatRuntime = '1';
      return;
    }
    delete document.body.dataset.miniChatRuntime;
  }
}

function getChatDiagnostics() {
  const state = getChatState();
  const route = readChatRoute();
  const { list, host, search } = pageShell();
  return {
    hostMode,
    route,
    state,
    fallbackHydratedUid,
    fallbackHydrating: Boolean(fallbackHydrationPromise),
    pageListManaged: list instanceof HTMLElement && list.dataset.miniChatManaged === '1',
    pageHostManaged: host instanceof HTMLElement && host.dataset.miniChatManaged === '1',
    pageSearchManaged: search instanceof HTMLInputElement && search.dataset.miniChatManaged === '1',
    pageListChildren: list instanceof HTMLElement ? list.childElementCount : 0,
    pageHostMounted: host instanceof HTMLElement && host.dataset.miniChatMounted === '1',
    dockPresent: qs('#miniChatDock') instanceof HTMLElement,
    trayPresent: document.getElementById('miniChatTray') instanceof HTMLElement,
    threadRootPresent: document.getElementById('miniChatThreadRoot') instanceof HTMLElement,
    messageStreamConversationId: String(panelReactionState.conversationId || '').trim(),
    dockStreamConversationId: String(activeDockThreadStreamState.conversationId || '').trim(),
    pendingReadWrites: pendingReadWrites.size,
  };
}

function dockShell() {
  const dock = qs('#miniChatDock');
  const dockRoot = dock instanceof HTMLElement ? dock : document;
  return {
    dock,
    launcher: qs('#miniChatLauncher', dockRoot),
    panel: qs('#miniChatPanel', dockRoot),
    listView: qs('#miniChatListView', dockRoot),
    threadView: qRole('thread-view', dockRoot),
    list: qs('#miniChatList', dockRoot),
    search: qs('#miniChatSearch', dockRoot),
    back: qRole('back', dockRoot),
    attach: qRole('attach', dockRoot),
    record: qRole('record', dockRoot),
    send: qRole('send', dockRoot),
    input: qRole('input', dockRoot),
    fileInput: qRole('file-input', dockRoot),
    title: qRole('thread-title', dockRoot),
    status: qRole('thread-status', dockRoot),
    avatar: qRole('thread-avatar', dockRoot),
    openFull: qs('#miniChatOpenFull', dockRoot),
    openThread: qRole('open-thread', dockRoot),
    typing: qRole('typing', dockRoot),
    messages: qRole('messages', dockRoot),
    uploadWrap: qRole('upload-wrap', dockRoot),
    uploadBar: qRole('upload-bar', dockRoot),
  };
}

function activePanelScope() {
  if (isPageMode()) {
    const { host } = pageShell();
    if (host instanceof HTMLElement) {
      return host;
    }
  }
  const { dock } = dockShell();
  return dock instanceof HTMLElement ? dock : document;
}

function conversationListRoots() {
  const roots = [];
  const pageList = pageShell().list;
  const dockList = isMobile() ? null : qs('#miniChatList');
  if (pageList instanceof HTMLElement) roots.push({ root: pageList, source: 'page' });
  if (dockList instanceof HTMLElement) roots.push({ root: dockList, source: 'dock' });
  return roots;
}

function conversationSearchBindings() {
  const bindings = [];
  const page = pageShell();
  if (page.search instanceof HTMLInputElement && page.list instanceof HTMLElement) {
    bindings.push({ input: page.search, root: page.list, source: 'page' });
  }
  const dockSearch = isMobile() ? null : qs('#miniChatSearch');
  const dockList = isMobile() ? null : qs('#miniChatList');
  if (dockSearch instanceof HTMLInputElement && dockList instanceof HTMLElement) {
    bindings.push({ input: dockSearch, root: dockList, source: 'dock' });
  }
  return bindings;
}

function removeFloatingDockUi({ removeThreadRoot = false } = {}) {
  const dock = document.getElementById('miniChatDock');
  if (dock) dock.remove();
  const tray = document.getElementById('miniChatTray');
  if (tray) tray.remove();
  if (removeThreadRoot) {
    const threadRoot = document.getElementById('miniChatThreadRoot');
    if (threadRoot) threadRoot.remove();
  }
}

function buildFullViewHref(chat = '', chatKind = '') {
  return withNeuQuery(getNeuSocialAppPath(), {
    portal: 'pulse',
    chat,
    chatKind,
  });
}

function syncNeuUnreadBadge(count) {
  const total = Number(count || 0);
  window.__neuHeaderBadges?.setMessages?.(total);

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

function readChatRoute() {
  const route = ChatRouter.read();
  return {
    portal: String(route.portal || '').trim(),
    chat: String(route.chat || '').trim(),
    chatKind: String(route.chatKind || '').trim().toLowerCase(),
  };
}

function syncChatStateFromRoute() {
  const { currentUid: uid } = getChatState();
  const route = readChatRoute();
  const nextConversationId =
    route.portal !== 'pulse'
      ? ''
      : route.chatKind && route.chatKind !== 'conversation'
      ? ''
      : String(route.chat || '').trim();
  if (uid && nextConversationId === uid) {
    return;
  }

  if (
    nextConversationId === ChatController.getActiveConversation() &&
    ChatController.getActiveConversationSource() === 'page'
  ) {
    return;
  }

  ChatController.setActiveConversation(nextConversationId, { source: 'page' });
}

function navigateToConversation(conversationId, { replace = false } = {}) {
  const nextConversationId = String(conversationId || '').trim();
  const method = replace ? ChatRouter.replace : ChatRouter.write;
  method({
    portal: 'pulse',
    chat: nextConversationId,
    chatKind: nextConversationId ? 'conversation' : '',
  });
  syncChatStateFromRoute();
}

function syncChatRouteWithState(state) {
  if (String(state?.activeConversationSource || 'page') === 'dock') {
    return;
  }

  const route = readChatRoute();
  if (route.portal !== 'pulse') {
    if (!route.chat && !route.chatKind) {
      return;
    }
    ChatRouter.replace({
      portal: route.portal,
      chat: '',
      chatKind: '',
    });
    return;
  }

  const nextConversationId = String(state?.activeConversationId || '').trim();
  const nextPortal = 'pulse';
  const nextChatKind = nextConversationId ? 'conversation' : '';

  if (
    route.portal === nextPortal &&
    route.chat === nextConversationId &&
    route.chatKind === nextChatKind
  ) {
    return;
  }

  ChatRouter.replace({
    portal: nextPortal,
    chat: nextConversationId,
    chatKind: nextChatKind,
  });
}

function syncOpenThreadsWithState(state) {
  const nextActiveConversationId = String(state?.activeConversationId || '').trim();
  const activeSource = String(state?.activeConversationSource || 'page').trim() || 'page';
  const conversationMap = new Map(
    (Array.isArray(state?.conversations) ? state.conversations : [])
      .map((item) => [String(item?.id || '').trim(), item]),
  );
  const conversationIds = new Set(
    Array.from(conversationMap.keys()).filter(Boolean),
  );

  Array.from(openThreads.entries()).forEach(([conversationId, thread]) => {
    if (!conversationIds.has(conversationId)) {
      closeThread(conversationId);
      return;
    }
    const conversation = conversationMap.get(conversationId) || null;
    const unreadCount = Math.max(0, Number(conversation?.unreadCount || 0));
    if (activeSource !== 'dock' || conversationId !== nextActiveConversationId) {
      threadUnread.set(conversationId, unreadCount);
    }
    if (thread?.element instanceof HTMLElement) {
      setThreadWindowMeta(conversationId, thread.element);
    }
  });

  if (!nextActiveConversationId || !openThreads.has(nextActiveConversationId)) {
    syncThreadActiveWindowClass(nextActiveConversationId);
    return;
  }

  if (minimizedThreads.has(nextActiveConversationId)) {
    restoreThread(nextActiveConversationId);
    return;
  }

  const thread = openThreads.get(nextActiveConversationId);
  if (thread?.element instanceof HTMLElement) {
    thread.element.style.zIndex = String(nextThreadZIndex());
  }
  syncThreadActiveWindowClass(nextActiveConversationId);
}

function updateDocumentTitle(unreadCount) {
  const count = Number(unreadCount || 0);

  if (count > 0) {
    document.title = `(${count}) ${ORIGINAL_TITLE}`;
    return;
  }

  document.title = ORIGINAL_TITLE;
}

function handleChatStateChange(state) {
  ensureDock();
  if (isPageMode()) {
    ensurePageHost();
  }

  const activeSource = String(state?.activeConversationSource || 'page');
  const activeConversation = Array.isArray(state?.conversations)
    ? state.conversations.find(
      (item) => String(item?.id || '').trim() === String(state?.activeConversationId || '').trim(),
    ) || null
    : null;

  renderConversationList(
    state?.conversations || [],
    state?.activeConversationId || '',
    state?.currentUid || '',
  );
  if (
    String(voiceRecorderState.scope || '').trim() === 'panel' &&
    String(voiceRecorderState.conversationId || '').trim() &&
    String(state?.activeConversationId || '').trim() !== String(voiceRecorderState.conversationId || '').trim()
  ) {
    stopVoiceRecording({ discard: true }).catch(() => null);
  }
  if (
    String(speechRecognitionState.conversationId || '').trim() &&
    String(state?.activeConversationId || '').trim() !== String(speechRecognitionState.conversationId || '').trim()
  ) {
    stopSpeechRecognition();
  }
  if (
    String(callSessionState.conversationId || '').trim() &&
    String(state?.activeConversationId || '').trim() !== String(callSessionState.conversationId || '').trim()
  ) {
    endActiveCall({ updateSignal: true }).catch(() => null);
  }
  if (state?.activeConversationId) {
    syncActiveCallListener(state.activeConversationId, activeConversation);
    syncActiveReadReceiptListener(state.activeConversationId, activeConversation);
    syncActiveDeliveryListener(state.activeConversationId, activeConversation);
    if (activeSource === 'dock') {
      syncPanelPresence(state.activeConversationId, activeConversation);
    }
  } else {
    stopActiveCallListener();
    stopActiveReadReceiptListener();
    stopActiveDeliveryListener();
    stopPanelPresence();
  }
  if (state?.activeConversationId && activeSource !== 'dock') {
    renderThreadMeta(state.activeConversationId, state.conversations || []);
  } else if (!state?.activeConversationId && activeSource !== 'dock') {
    stopPanelPresence();
    setOpenLinks('');
    resetAiSuggestionState(panelSuggestionState);
    renderPanelAiSuggestions([], '');
  }

  syncOpenThreadsWithState(state);
  renderTray();
  updateTypingIndicatorsFromConversations();
  syncCallUi();
}

function syncRealtimeSubscriptions(state) {
  const activeSource = String(state?.activeConversationSource || 'page').trim() || 'page';
  const convId = String(state?.activeConversationId || '').trim();

  if (!convId) {
    stopActiveDockThreadStream();
    firestoreController.stopMessageStream();
    return;
  }

  if (activeSource === 'dock') {
    firestoreController.stopMessageStream();
    syncActiveDockThreadStream(state);
    return;
  }

  stopActiveDockThreadStream();
  firestoreController.setActiveConversation(convId);
}

function wireChatStateSubscriptions() {
  if (!chatStateSubscriptionsWired) {
    chatStateSubscriptionsWired = true;
    ChatController.subscribe((state) => {
      const unreadCount = (Array.isArray(state?.conversations) ? state.conversations : [])
        .filter((conv) => Number(conv?.unreadCount || 0) > 0)
        .length;

      updateDocumentTitle(unreadCount);
      handleChatStateChange(state);
      syncChatRouteWithState(state);
      syncRealtimeSubscriptions(state);
    });
  }

  if (!chatPopstateWired) {
    chatPopstateWired = true;
    window.addEventListener('popstate', () => {
      syncChatStateFromRoute();
    });
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
  messageHtml: baseMessageHtml,
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
  getCurrentUid: () => getChatState().currentUid,
  esc,
  fmtTime,
  messageContentHtml,
});

function messageHtml(message, conversationId, reactionData = new Map(), deliveryStatus = null) {
  const html = baseMessageHtml(message, conversationId, reactionData);
  const msgId = String(message?.id || '').trim();
  const senderId = String(message?.senderId || '').trim();
  const currentUserId = String(getChatState().currentUid || '').trim();
  const statusMessageId = String(deliveryStatus?.messageId || '').trim();
  const statusLabelHtml = String(deliveryStatus?.labelHtml || '').trim();
  const statusClassName = String(deliveryStatus?.className || '').trim();
  if (
    !statusMessageId ||
    !statusLabelHtml ||
    !msgId ||
    msgId !== statusMessageId ||
    !currentUserId ||
    senderId !== currentUserId
  ) {
    return html;
  }

  return html.replace(
    '</article>',
    `</article><div class="mini-chat-v4-delivery-status${statusClassName ? ` ${statusClassName}` : ''}">${statusLabelHtml}</div>`,
  );
}

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
  getCurrentUid: () => getChatState().currentUid,
  getCurrentName: () => currentName,
  getConversations: () => getChatState().conversations,
  getActiveConversationId: () => getChatState().activeConversationId,
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
  getCurrentUid: () => getChatState().currentUid,
  getCurrentName: () => currentName,
  getActiveConversationId: () => getChatState().activeConversationId,
  setActiveConversationId: () => {},
  getConversationMeta: (conversationId) => ChatController.getConversation(conversationId),
  getCachedMessages,
  resolveMessageRows,
  encryptTextMessageForConversation,
  ensureConversationEncryption,
  panelReactionState,
  renderMessages,
  renderThreadWindowMessages,
  renderConversationList,
  renderThreadMeta,
  setView,
  setOpenLinks,
  markConversationRead,
  markConversationDelivered,
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
  updateMessageCache,
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
  const scope = activePanelScope();
  return {
    wrap: qRole('upload-wrap', scope),
    bar: qRole('upload-bar', scope),
    attachBtn: qRole('attach', scope),
    recordBtn: qRole('record', scope),
    speechBtn: qRole('speech', scope),
    sendBtn: qRole('send', scope),
    input: qRole('input', scope),
    fileInput: qRole('file-input', scope),
  };
}

function setUploadUi({ wrap, bar, attachBtn, recordBtn, speechBtn, sendBtn, input, fileInput }, uploading = false, progress = 0) {
  const percent = Math.max(0, Math.min(100, Number(progress || 0)));
  if (wrap instanceof HTMLElement) wrap.hidden = !uploading;
  if (bar instanceof HTMLElement) bar.style.width = `${percent}%`;
  if (attachBtn instanceof HTMLButtonElement) attachBtn.disabled = uploading;
  if (recordBtn instanceof HTMLButtonElement) recordBtn.disabled = uploading;
  if (speechBtn instanceof HTMLButtonElement) speechBtn.disabled = uploading;
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
      recordBtn: thread.recordBtn,
      speechBtn: thread.speechBtn,
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

  const backBtn = qRole('back', host);
  const callBtn = qRole('call', host);
  const hangupBtn = qRole('hangup', host);
  const attachBtn = qRole('attach', host);
  const recordBtn = qRole('record', host);
  const speechBtn = qRole('speech', host);
  const fileInput = qRole('file-input', host);
  const sendBtn = qRole('send', host);
  const textInput = qRole('input', host);
  const { search: searchInput, list: searchRoot } = pageShell();

  backBtn?.addEventListener('click', () => {
    navigateToConversation('');
  });

  callBtn?.addEventListener('click', () => {
    startVoiceCall(ChatController.getActiveConversation()).catch((error) => {
      console.warn('[mini-chat-v4] call start failed', error);
    });
  });
  hangupBtn?.addEventListener('click', () => {
    endActiveCall({ updateSignal: true }).catch((error) => {
      console.warn('[mini-chat-v4] call hangup failed', error);
    });
  });
  sendBtn?.addEventListener('click', () => sendMessage());
  attachBtn?.addEventListener('click', () => {
    if (panelUploadState.uploading || !(fileInput instanceof HTMLInputElement)) return;
    fileInput.click();
  });
  recordBtn?.addEventListener('click', () => {
    toggleVoiceRecording(ChatController.getActiveConversation(), { scope: 'panel' }).catch((error) => {
      console.warn('[mini-chat-v4] voice record failed', error);
    });
  });
  speechBtn?.addEventListener('click', () => {
    toggleSpeechRecognition(ChatController.getActiveConversation(), { scope: 'panel' }).catch((error) => {
      console.warn('[mini-chat-v4] speech to text failed', error);
    });
  });
  fileInput?.addEventListener('change', () => {
    handlePanelAttachmentUpload(fileInput).catch((error) => {
      console.warn('[mini-chat-v4] page attachment failed', error);
    });
  });

  if (
    searchInput instanceof HTMLInputElement &&
    searchRoot instanceof HTMLElement &&
    searchInput.dataset.miniChatWired !== '1'
  ) {
    searchInput.dataset.miniChatWired = '1';
    searchInput.addEventListener('input', () =>
      filterConversationList({ input: searchInput, root: searchRoot, source: 'page' }),
    );
  }

  textInput?.addEventListener('input', () => {
    resizeInput();
    scheduleTypingHeartbeat(ChatController.getActiveConversation(), textInput?.value || '');
  });
  textInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  textInput?.addEventListener('blur', () => {
    clearTypingPresence(ChatController.getActiveConversation(), { force: true }).catch(() => null);
  });

  const threadView = qRole('thread-view', host);
  wireConversationDropZone(
    threadView instanceof HTMLElement ? threadView : host,
    {
      getConversationId: () => ChatController.getActiveConversation(),
      scope: 'panel',
    },
  );

  resizeInput();
  setPanelUploading(false, 0);
  syncVoiceRecordingUi();
  syncSpeechRecognitionUi();
  syncCallUi();
  wireReactionOutsideClick();
  ensureTypingRefreshTimer();
  updateTypingIndicatorsFromConversations();
}

function ensurePageHost() {
  if (!isPageMode()) return null;
  const { host } = pageShell();
  if (!(host instanceof HTMLElement)) return null;
  setMiniChatManagedNodes(true);

  if (host.dataset.miniChatMounted !== '1') {
    host.innerHTML = buildInboxThreadMarkup();
    host.dataset.miniChatMounted = '1';
  }

  wirePageHostControls(host);
  setPageHostVisible(Boolean(ChatController.getActiveConversation()));
  syncCallUi();
  return host;
}

async function handlePanelAttachmentUpload(fileInput) {
  if (!(fileInput instanceof HTMLInputElement)) return;
  const { activeConversationId: activeId, currentUid: uid } = getChatState();
  const convId = String(activeId || '').trim();
  const file = fileInput.files?.[0] || null;
  fileInput.value = '';
  if (!file || !convId || !uid) return;

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
  const { currentUid: uid } = getChatState();
  if (!convId || !thread || !(fileInput instanceof HTMLInputElement)) return;
  const file = fileInput.files?.[0] || null;
  fileInput.value = '';
  if (!file || !uid) return;

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
  const { activeConversationId: activeId, currentUid: uid } = getChatState();
  if (!activeId || !uid) return;
  if (panelUploadState.uploading) return;

  const input = qRole('input', activePanelScope());
  const text = String(input?.value || '').trim();
  if (!text) return;

  if (input) {
    input.value = '';
    resizeInput();
  }

  try {
    await firestoreController.sendMessageToConversation(activeId, text);
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
  if (isMobile()) {
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
  if (isMobile()) {
    return null;
  }

  const convId = String(conversationId || '').trim();
  if (!convId) return;

  if (openThreads.has(convId)) {
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
  const recordBtn = qs('.mini-chat-v4-thread-record', container);
  const speechBtn = qRole('speech', container);
  const callBtn = qRole('call', container);
  const hangupBtn = qRole('hangup', container);
  const fileInput = qs('.mini-chat-v4-thread-file-input', container);

  const threadState = {
    element: container,
    unsub: null,
    liveConversationId: '',
    streamToken: null,
    dropCleanup: null,
    presenceRelease: null,
    presenceUid: '',
    minimizeTimer: 0,
    aiSuggestionState: createAiSuggestionState(),
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
    recordBtn: recordBtn instanceof HTMLButtonElement ? recordBtn : null,
    speechBtn: speechBtn instanceof HTMLButtonElement ? speechBtn : null,
    callBtn: callBtn instanceof HTMLButtonElement ? callBtn : null,
    hangupBtn: hangupBtn instanceof HTMLButtonElement ? hangupBtn : null,
    fileInput: fileInput instanceof HTMLInputElement ? fileInput : null,
    submitMessage: null,
  };
  openThreads.set(convId, threadState);

  const cachedRows = getCachedMessages(convId, { consumePreloaded: true });
  if (cachedRows.length) {
    threadState.rows = cachedRows;
    renderThreadWindowMessages(
      container,
      cachedRows,
      convId,
      threadState.reactionData,
    );
  }

  threadUnread.set(convId, 0);
  setThreadUploading(threadState, false, 0);
  threadState.dropCleanup = wireConversationDropZone(container, {
    getConversationId: () => convId,
    scope: 'thread',
    thread: threadState,
  });

  setThreadWindowMeta(convId, container);

  const closeBtn = qs('.mini-chat-v4-thread-close', container);
  closeBtn?.addEventListener('click', () => closeThread(convId));
  const minBtn = qs('.mini-chat-v4-thread-min', container);
  minBtn?.addEventListener('click', () => minimizeThread(convId));
  callBtn?.addEventListener('click', () => {
    startVoiceCall(convId).catch((error) => {
      console.warn('[mini-chat-v4] thread call start failed', error);
    });
  });
  hangupBtn?.addEventListener('click', () => {
    endActiveCall({ updateSignal: true }).catch((error) => {
      console.warn('[mini-chat-v4] thread call hangup failed', error);
    });
  });

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
  threadState.submitMessage = submit;

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
  recordBtn?.addEventListener('click', () => {
    toggleVoiceRecording(convId, { scope: 'thread', thread: threadState }).catch((error) => {
      console.warn('[mini-chat-v4] thread voice record failed', error);
    });
  });
  speechBtn?.addEventListener('click', () => {
    toggleSpeechRecognition(convId, { scope: 'thread', thread: threadState }).catch((error) => {
      console.warn('[mini-chat-v4] thread speech to text failed', error);
    });
  });
  fileInput?.addEventListener('change', () => {
    handleThreadAttachmentUpload(convId, threadState, fileInput).catch((error) => {
      console.warn('[mini-chat-v4] thread attachment failed', error);
    });
  });

  container.addEventListener('mousedown', () => bringThreadToFront(convId));
  resizeThreadInput(input);
  syncVoiceRecordingUi();
  syncSpeechRecognitionUi();
  syncCallUi();

  ChatController.setActiveConversation(convId, { source: 'dock' });
  syncThreadActiveWindowClass(convId);
  renderConversationList();
  positionThreads();
  updateTypingIndicatorsFromConversations();
}

function stopAllStreams() {
  endActiveCall({ updateSignal: true }).catch(() => null);
  stopActiveCallListener();
  stopVoiceRecording({ discard: true }).catch(() => null);
  stopSpeechRecognition();
  stopActiveDockThreadStream();
  firestoreController.stopMessageStream();
  runSafeUnsubscribe(convUnsub);
  convUnsub = null;
  stopActiveReadReceiptListener();
  stopActiveDeliveryListener();
}

function applyChatRouteState() {
  syncChatStateFromRoute();
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
  if (full) full.href = href;
  const { host } = pageShell();
  const { dock } = dockShell();
  [host, dock].forEach((scope) => {
    if (!(scope instanceof HTMLElement)) return;
    const info = qRole('open-thread', scope);
    if (info instanceof HTMLAnchorElement) info.href = href;
  });
}

function markConversationRead(conversationId, lastMessageId = '') {
  const { currentUid: uid } = getChatState();
  const convId = String(conversationId || '').trim();
  if (!convId || !uid) return;

  const safeMessageId = String(lastMessageId || '').trim();
  const cacheKey = `${uid}:${convId}`;
  const previous = pendingReadWrites.get(cacheKey) || null;
  const nextMessageId = safeMessageId || String(previous?.lastMessageId || '').trim();

  if (previous?.timerId) {
    window.clearTimeout(previous.timerId);
  }

  const timerId = window.setTimeout(() => {
    pendingReadWrites.delete(cacheKey);
    const payload = {
      unreadCount: 0,
      lastReadAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (nextMessageId) payload.lastReadMessageId = nextMessageId;

    setDoc(doc(db, 'neuUserChats', uid, 'chats', convId), payload, {
      merge: true,
    }).catch(() => null);
  }, 200);

  pendingReadWrites.set(cacheKey, {
    timerId,
    lastMessageId: nextMessageId,
  });
}

function markConversationDelivered(conversationId, lastMessageId = '') {
  const { currentUid: uid } = getChatState();
  const convId = String(conversationId || '').trim();
  const safeMessageId = String(lastMessageId || '').trim();
  if (!convId || !uid || !safeMessageId) return;

  const cacheKey = `${uid}:${convId}`;
  if (deliveredWriteCache.get(cacheKey) === safeMessageId) return;
  deliveredWriteCache.set(cacheKey, safeMessageId);

  updateDoc(doc(db, 'neuConversations', convId), {
    [`deliveredTo.${uid}`]: safeMessageId,
  }).catch(() => {
    if (deliveredWriteCache.get(cacheKey) === safeMessageId) {
      deliveredWriteCache.delete(cacheKey);
    }
  });
}

function setDockOpen(open) {
  const { dock, panel, listView, threadView } = dockShell();
  if (!(dock instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  if (open) {
    dock.classList.add('is-open');
    dock.classList.remove('is-minimized');
    panel.hidden = false;
    if (isPageMode()) {
      if (listView instanceof HTMLElement) listView.hidden = false;
      if (threadView instanceof HTMLElement) threadView.hidden = true;
    }
    window.dispatchEvent(
      new CustomEvent('av:quickchat-open', { detail: { open: true } }),
    );
    return;
  }

  dock.classList.remove('is-open');
  panel.hidden = true;
}

function setDockMinimized() {
  const { dock, panel } = dockShell();
  if (!(dock instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  dock.classList.add('is-minimized');
  dock.classList.remove('is-open');
  panel.hidden = true;
}

function setView(view) {
  const { host } = pageShell();
  const { listView, threadView } = dockShell();
  if (view !== 'thread') {
    stopVoiceRecordingForConversation(voiceRecorderState.conversationId, {
      discard: true,
      scope: 'panel',
    });
    stopSpeechRecognitionForConversation(speechRecognitionState.conversationId, {
      scope: 'panel',
    });
  }
  if (isPageMode()) {
    ensurePageHost();
    const pageThreadView = host instanceof HTMLElement ? qRole('thread-view', host) : null;
    if (pageThreadView instanceof HTMLElement) {
      pageThreadView.hidden = view !== 'thread';
    }
    setPageHostVisible(view === 'thread' && Boolean(ChatController.getActiveConversation()));
    if (listView instanceof HTMLElement) listView.hidden = false;
    if (threadView instanceof HTMLElement) threadView.hidden = true;
    return;
  }

  if (listView instanceof HTMLElement) listView.hidden = view !== 'list';
  if (threadView instanceof HTMLElement) threadView.hidden = view !== 'thread';
}

function resizeInput() {
  const input = qRole('input', activePanelScope());
  if (!(input instanceof HTMLTextAreaElement)) return;

  input.style.height = '0px';
  const height = Math.max(38, Math.min(98, input.scrollHeight));
  input.style.height = `${height}px`;
}

function filterConversationList(binding = null) {
  const bindings = binding ? [binding] : conversationSearchBindings();
  bindings.forEach(({ input, root }) => {
    if (!(root instanceof HTMLElement)) return;
    const queryText = norm(input?.value || '');
    root.querySelectorAll('.mini-chat-v4-row').forEach((row) => {
      const haystack = String(row.dataset.search || '');
      row.style.display = !queryText || haystack.includes(queryText) ? '' : 'none';
    });
  });
}

function renderConversationList(
  nextConversations = null,
  nextActiveConversationId = null,
  nextCurrentUid = null,
) {
  const state = getChatState();
  const conversationRows = Array.isArray(nextConversations) ? nextConversations : state.conversations;
  const activeId =
    typeof nextActiveConversationId === 'string'
      ? nextActiveConversationId
      : state.activeConversationId;
  const uid =
    typeof nextCurrentUid === 'string'
      ? nextCurrentUid
      : state.currentUid;
  const roots = conversationListRoots();

  const { html, unreadCount } = buildConversationListHtml({
    conversations: conversationRows,
    activeConversationId: activeId,
    currentUid: uid,
    currentName,
    esc,
    norm,
  });

  setUnreadBadge(unreadCount);
  roots.forEach(({ root, source }) => {
    root.innerHTML = html;
    root.querySelectorAll('[data-open-conv]').forEach((row) => {
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        const conversationId = String(row.getAttribute('data-open-conv') || '').trim();
        if (!conversationId) return;
        if (source === 'dock') {
          openConversationDock(conversationId);
          return;
        }
        openConversationPage(conversationId);
      });
    });
  });

  filterConversationList();
}

function renderThreadMeta(conversationId, nextConversations = null) {
  const conversationRows = Array.isArray(nextConversations)
    ? nextConversations
    : getChatState().conversations;
  const conversation =
    conversationRows.find((item) => item.id === conversationId) || null;
  const title = getConversationTitle(conversation, currentName, norm);
  const fallback = conversationStatusFallback(conversation);
  const scopes = [];
  const { host } = pageShell();
  const { dock } = dockShell();

  if (host instanceof HTMLElement) scopes.push(host);
  if (dock instanceof HTMLElement) scopes.push(dock);

  scopes.forEach((scope) => {
    const titleEl = qRole('thread-title', scope);
    const statusEl = qRole('thread-status', scope);
    const avatarEl = qRole('thread-avatar', scope);

    if (titleEl) titleEl.textContent = title;
    if (statusEl) applyPresenceStatus(statusEl, { fallback });
    if (avatarEl) avatarEl.textContent = initials(title);
  });

  setOpenLinks(conversationId);
  syncPanelPresence(conversationId, conversation);
  syncCallUi();
}

function renderMessages(
  rows,
  conversationId = ChatController.getActiveConversation(),
  reactionData = panelReactionState.reactionData,
) {
  const body = qRole('messages', activePanelScope());
  if (!(body instanceof HTMLElement)) return;
  wireReactionInteractions(body);
  const deliveryStatus = getDeliveryStatus(rows, conversationId);

  body.innerHTML = buildMessagesHtml({
    rows,
    conversationId,
    reactionData,
    messageHtml: (message, convId, reactions) =>
      messageHtml(message, convId, reactions, deliveryStatus),
  });
  renderPanelAiSuggestions(rows, conversationId);
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
  const deliveryStatus = getDeliveryStatus(rows, conversationId);

  body.innerHTML = buildMessagesHtml({
    rows,
    conversationId,
    reactionData,
    messageHtml: (message, convId, reactions) =>
      messageHtml(message, convId, reactions, deliveryStatus),
  });
  renderThreadAiSuggestions(
    container,
    rows,
    conversationId,
    openThreads.get(String(conversationId || '').trim()) || null,
  );
  body.scrollTop = body.scrollHeight;
}

function setThreadWindowMeta(conversationId, container) {
  if (!(container instanceof HTMLElement)) return;
  const conversation = ChatController.getConversation(conversationId);
  const title = getConversationTitle(conversation, currentName, norm);
  const { titleEl, statusEl } = ensureThreadWindowMetaNodes(container);
  if (titleEl) titleEl.textContent = title;
  if (statusEl) {
    applyPresenceStatus(statusEl, {
      fallback: conversationStatusFallback(conversation),
    });
  }
  syncCallUi();
}

function minimizeThread(conversationId) {
  const convId = String(conversationId || '').trim();
  const thread = openThreads.get(convId);
  if (!thread) return;
  if (minimizedThreads.has(convId)) return;
  stopVoiceRecordingForConversation(convId, { discard: true, scope: 'thread' });
  stopSpeechRecognitionForConversation(convId, { scope: 'thread' });
  clearTypingPresence(convId, { force: true }).catch(() => null);

  if (thread.element instanceof HTMLElement) {
    if (thread.minimizeTimer) {
      window.clearTimeout(thread.minimizeTimer);
      thread.minimizeTimer = 0;
    }
    thread.element.classList.add('is-minimizing');
  }
  minimizedThreads.set(convId, thread);
  if (activeDockThreadStreamState.conversationId === convId) {
    stopActiveDockThreadStream();
  }

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

  if (ChatController.getActiveConversation() === convId) {
    const visibleOpenId = Array.from(openThreads.entries()).find(
      ([id, item]) => {
        if (id === convId) return false;
        return (
          item?.element instanceof HTMLElement &&
          item.element.style.display !== 'none'
        );
      },
    )?.[0];
    ChatController.setActiveConversation(visibleOpenId || '', { source: 'dock' });
    renderConversationList();
  }
  syncThreadActiveWindowClass(ChatController.getActiveConversation());

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
  if (isMobile()) {
    const tray = document.getElementById('miniChatTray');
    if (tray) tray.remove();
    return;
  }

  let tray = document.getElementById('miniChatTray');

  if (!minimizedThreads.size) {
    if (tray) tray.remove();
    return;
  }

  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'miniChatTray';
    tray.className = 'mini-chat-v4-tray';
    document.body.appendChild(tray);
  }

  tray.innerHTML = '';

  minimizedThreads.forEach((thread, id) => {
    const convId = String(id || '').trim();
    const conversation = ChatController.getConversation(convId);
    const title = getConversationTitle(conversation);
    const bubble = document.createElement('button');
    bubble.className = 'mini-chat-v4-tray-bubble';
    bubble.type = 'button';
    const unreadCount = Math.max(
      0,
      Number(threadUnread.get(id) || 0),
      Number(conversation?.unreadCount || 0),
    );
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
  if (callSessionState.conversationId === convId) {
    endActiveCall({ updateSignal: true }).catch(() => null);
  }
  stopVoiceRecordingForConversation(convId, { discard: true, scope: 'thread' });
  stopSpeechRecognitionForConversation(convId, { scope: 'thread' });
  clearTypingPresence(convId, { force: true }).catch(() => null);

  if (thread.minimizeTimer) {
    window.clearTimeout(thread.minimizeTimer);
    thread.minimizeTimer = 0;
  }

  if (typeof thread.dropCleanup === 'function') {
    thread.dropCleanup();
    thread.dropCleanup = null;
  }

  if (activeDockThreadStreamState.conversationId === convId) {
    stopActiveDockThreadStream();
  } else {
    stopThreadMessageStream(thread);
  }
  if (activeReadReceiptState.conversationId === convId) {
    stopActiveReadReceiptListener();
  }
  if (activeDeliveryState.conversationId === convId) {
    stopActiveDeliveryListener();
  }
  if (panelPresenceConversationId === convId) {
    stopPanelPresence();
  }
  releaseThreadPresence(thread);
  clearReactionListeners(thread.reactionUnsubs, thread.reactionData);
  thread.rows = [];
  thread.renderQueued = false;
  resetAiSuggestionState(thread.aiSuggestionState);

  thread.element?.remove();
  openThreads.delete(convId);
  minimizedThreads.delete(convId);
  threadUnread.delete(convId);

  if (ChatController.getActiveConversation() === convId) {
    ChatController.setActiveConversation(Array.from(openThreads.keys()).pop() || '', {
      source: 'dock',
    });
  }
  syncThreadActiveWindowClass(ChatController.getActiveConversation());

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
  ChatController.setActiveConversation(convId, { source: 'dock' });
  syncThreadActiveWindowClass(convId);
  renderConversationList();
  updateTypingIndicatorsFromConversations();
}

function positionThreads() {
  if (isMobile()) return;

  let index = 0;
  openThreads.forEach((thread, id) => {
    if (!(thread?.element instanceof HTMLElement)) return;
    if (minimizedThreads.has(String(id || '').trim())) return;
    thread.element.style.right = `${40 + index * 380}px`;
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
  if (isMobile()) {
    removeFloatingDockUi();
    return null;
  }

  let dock = qs('#miniChatDock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'miniChatDock';
  dock.className = 'mini-chat-dock mini-chat-v4';
  dock.dataset.miniChatManaged = '1';
  dock.innerHTML = buildDockMarkup();
  document.body.appendChild(dock);
  const panel = qs('#miniChatPanel', dock);
  if (panel instanceof HTMLElement) panel.style.zIndex = String(PANEL_BASE_Z_INDEX);

  const launcher = qs('#miniChatLauncher', dock);
  const closeBtn = qs('#miniChatClose', dock);
  const minBtn = qs('#miniChatMinimize', dock);
  const backBtn = qRole('back', dock);
  const callBtn = qRole('call', dock);
  const hangupBtn = qRole('hangup', dock);
  const attachBtn = qRole('attach', dock);
  const recordBtn = qRole('record', dock);
  const speechBtn = qRole('speech', dock);
  const fileInput = qRole('file-input', dock);
  const sendBtn = qRole('send', dock);
  const searchInput = qs('#miniChatSearch', dock);
  const searchRoot = qs('#miniChatList', dock);
  const textInput = qRole('input', dock);

  launcher?.addEventListener('click', () => {
    const panel = qs('#miniChatPanel');
    setDockOpen(!!panel?.hidden);
  });

  closeBtn?.addEventListener('click', () => setDockOpen(false));
  minBtn?.addEventListener('click', () => setDockMinimized());
  backBtn?.addEventListener('click', () => navigateToConversation(''));
  callBtn?.addEventListener('click', () => {
    startVoiceCall(ChatController.getActiveConversation()).catch((error) => {
      console.warn('[mini-chat-v4] call start failed', error);
    });
  });
  hangupBtn?.addEventListener('click', () => {
    endActiveCall({ updateSignal: true }).catch((error) => {
      console.warn('[mini-chat-v4] call hangup failed', error);
    });
  });
  sendBtn?.addEventListener('click', () => sendMessage());
  attachBtn?.addEventListener('click', () => {
    if (panelUploadState.uploading || !(fileInput instanceof HTMLInputElement)) return;
    fileInput.click();
  });
  recordBtn?.addEventListener('click', () => {
    toggleVoiceRecording(ChatController.getActiveConversation(), { scope: 'panel' }).catch((error) => {
      console.warn('[mini-chat-v4] voice record failed', error);
    });
  });
  speechBtn?.addEventListener('click', () => {
    toggleSpeechRecognition(ChatController.getActiveConversation(), { scope: 'panel' }).catch((error) => {
      console.warn('[mini-chat-v4] speech to text failed', error);
    });
  });
  fileInput?.addEventListener('change', () => {
    handlePanelAttachmentUpload(fileInput).catch((error) => {
      console.warn('[mini-chat-v4] panel attachment failed', error);
    });
  });

  if (
    searchInput instanceof HTMLInputElement &&
    searchRoot instanceof HTMLElement &&
    searchInput.dataset.miniChatWired !== '1'
  ) {
    searchInput.dataset.miniChatWired = '1';
    searchInput.addEventListener('input', () =>
      filterConversationList({ input: searchInput, root: searchRoot, source: 'dock' }),
    );
  }

  textInput?.addEventListener('input', () => {
    resizeInput();
    scheduleTypingHeartbeat(ChatController.getActiveConversation(), textInput?.value || '');
  });
  textInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  textInput?.addEventListener('blur', () => {
    clearTypingPresence(ChatController.getActiveConversation(), { force: true }).catch(() => null);
  });

  resizeInput();
  setPanelUploading(false, 0);
  syncVoiceRecordingUi();
  syncSpeechRecognitionUi();
  syncCallUi();
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
    window.addEventListener('resize', () => {
      if (isMobile()) {
        hostMode = 'page';
        stopVoiceRecording({ discard: true }).catch(() => null);
        closeAllThreadWindows();
        removeFloatingDockUi({ removeThreadRoot: true });
        if (getChatState().currentUid) {
          ensurePageHost();
          ChatController.notify();
        }
        return;
      }

      const nextMode = preferredHostMode === 'page' ? 'page' : 'dock';
      const modeChanged = hostMode !== nextMode;
      hostMode = nextMode;
      if (modeChanged && getChatState().currentUid) {
        ensureDock();
        if (isPageMode()) ensurePageHost();
        ChatController.notify();
      }
      positionThreads();
    }, {
      passive: true,
    });
  }

  return dock;
}

function openConversationPage(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const href = buildFullViewHref(convId, 'conversation');

  if (isMobile() && (!isNeuSocialPage() || !(pageShell().host instanceof HTMLElement))) {
    window.location.href = href;
    return;
  }

  ChatRouter.write({
    portal: 'pulse',
    chat: convId,
    chatKind: 'conversation',
  });
  syncChatStateFromRoute();
}

function openConversationDock(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;

  if (isMobile()) {
    openConversationPage(convId);
    return;
  }

  ensureDock();
  setDockOpen(true);

  if (minimizedThreads.has(convId)) {
    restoreThread(convId);
    ChatController.setActiveConversation(convId, { source: 'dock' });
    return;
  }

  createThreadWindow(convId);
  ChatController.setActiveConversation(convId, { source: 'dock' });
}

function openConversation(conversationId, source = 'page') {
  if (source === 'dock') {
    openConversationDock(conversationId);
    return;
  }
  openConversationPage(conversationId);
}

async function ensureConversationWith(targetUid, targetName, { source = 'page' } = {}) {
  const peerUid = String(targetUid || '').trim();
  const { currentUid: uid, conversations: rows } = getChatState();
  if (!uid || !peerUid || uid === peerUid) return;
  const openConversationBySource = String(source || 'page').trim() === 'dock'
    ? openConversationDock
    : openConversationPage;

  const existing = rows.find((conv) => {
    if (!Array.isArray(conv?.participants)) return false;
    return (
      conv.participants.length === 2 &&
      conv.participants.includes(uid) &&
      conv.participants.includes(peerUid)
    );
  });

  if (existing?.id) {
    openConversationBySource(existing.id);
    return;
  }

  const conversationId = await firestoreController.ensureDirectConversationWithUser(peerUid, targetName);
  if (conversationId) openConversationBySource(conversationId);
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
  writeSelfPresence(false, { preferUpdate: true }).catch(() => null);
  clearAllMessagePreloads();
  clearPendingReadWrites();
  messageCache.clear();
  decryptedMessageCache.clear();
  conversationKeyCache.clear();
  conversationKeyLoading.clear();
  userIdentityLoading.clear();
  userPublicKeyCache.clear();
  preloadedMessageCacheKeys.clear();
  deliveredWriteCache.clear();
  stopAllStreams();
  updateDocumentTitle(0);
  stopPanelPresence();
  clearPresenceWatchers();
  ChatController.setActiveConversation('', { notify: false });
  closeAllThreadWindows();
  releaseUploadLock();
  setPanelUploading(false, 0);

  ChatController.setConversations([], { notify: false });
  ChatController.setCurrentUid('', { notify: false });
  currentName = 'Usuario';
  hostMode = 'dock';
  preferredHostMode = 'dock';
  fallbackHydrationPromise = null;
  fallbackHydratedUid = '';
  profileCache.clear();
  profileLoading.clear();
  setMiniChatManagedNodes(false);

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
  preferredHostMode = mode === 'page' ? 'page' : 'dock';
  const resolvedMode = isMobile() ? 'page' : preferredHostMode;

  if (!uid) {
    destroyGlobalMiniChat();
    return;
  }

  currentName = String(displayName || 'Usuario').trim() || 'Usuario';
  const pageReady = resolvedMode !== 'page' || pageShell().host instanceof HTMLElement;
  const dockReady = qs('#miniChatDock') instanceof HTMLElement;
  const shellReady =
    resolvedMode === 'page'
      ? pageReady
      : dockReady;

  if (getChatState().currentUid === uid && hostMode === resolvedMode && shellReady) {
    ensureUserEncryptionIdentity(uid).catch((error) => {
      console.warn('[mini-chat-v4] e2ee identity init failed', error);
    });
    wirePresenceLifecycle();
    wireVoiceRecordingLifecycle();
    wireSpeechRecognitionLifecycle();
    wireVoiceCallLifecycle();
    writeSelfPresence(true, { preferUpdate: false }).catch(() => null);
    if (isMobile()) {
      closeAllThreadWindows();
      removeFloatingDockUi({ removeThreadRoot: true });
    } else {
      ensureDock();
    }
    if (resolvedMode === 'page') ensurePageHost();
    wireChatStateSubscriptions();
    applyChatRouteState();
    ChatController.notify();
    return;
  }

  destroyGlobalMiniChat();

  hostMode = resolvedMode === 'page' ? 'page' : 'dock';
  ChatController.setCurrentUid(uid, { notify: false });
  ensureUserEncryptionIdentity(uid).catch((error) => {
    console.warn('[mini-chat-v4] e2ee identity init failed', error);
  });
  wirePresenceLifecycle();
  wireVoiceRecordingLifecycle();
  wireSpeechRecognitionLifecycle();
  wireVoiceCallLifecycle();
  writeSelfPresence(true, { preferUpdate: false }).catch(() => null);
  if (isMobile()) {
    closeAllThreadWindows();
    removeFloatingDockUi({ removeThreadRoot: true });
  } else {
    ensureDock();
  }
  if (isPageMode()) ensurePageHost();
  wireQuickOpen();
  wireChatStateSubscriptions();
  applyChatRouteState();
  ChatController.notify();

  window.__avMiniChatApi = {
    openConversation,
    openDirectConversation: (targetUid, targetName) =>
      ensureConversationWith(targetUid, targetName, { source: 'page' }),
    openDirectConversationPage: (targetUid, targetName) =>
      ensureConversationWith(targetUid, targetName, { source: 'page' }),
    openDirectConversationDock: (targetUid, targetName) =>
      ensureConversationWith(targetUid, targetName, { source: 'dock' }),
    fullViewHref: buildFullViewHref,
    getState: () => getChatState(),
    inspect: () => getChatDiagnostics(),
  };

  const conversationQuery = query(
    collection(db, 'neuUserChats', uid, 'chats'),
    orderBy('lastMessageAt', 'desc'),
    limit(250),
  );

  convUnsub = onSnapshot(
    conversationQuery,
    (snapshot) => {
      const nextRows = sortConversationRows(
        (snapshot.docs || []).map((docSnap) => mapUserChatRow(docSnap, uid)),
      );
      ChatController.setConversations(nextRows);
      preloadTopConversationMessages(nextRows);

      if (!nextRows.length) {
        hydrateConversationFallback(uid)
          .then((rows) => {
            if (!Array.isArray(rows) || !rows.length) {
              return;
            }
            applyChatRouteState();
          })
          .catch((error) => {
            console.warn('[mini-chat-v4] conversation fallback failed', error);
          });
      }

      warmConversationProfiles();
      const existingIds = new Set(nextRows.map((item) => item.id));
      Array.from(openThreads.entries()).forEach(([conversationId, thread]) => {
        if (!existingIds.has(conversationId)) {
          closeThread(conversationId);
          return;
        }
        if (thread?.element instanceof HTMLElement) {
          setThreadWindowMeta(conversationId, thread.element);
        }
      });
      applyChatRouteState();
    },
    () => {
      ChatController.setConversations([]);
      ChatController.setActiveConversation('');
      closeAllThreadWindows();
    },
  );
}


