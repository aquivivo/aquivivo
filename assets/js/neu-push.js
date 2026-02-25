import { app, auth, db } from './neu-firebase-init.js?v=20260222c';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging.js';

const NEU_PUSH_SETTINGS_COLLECTION = 'neuUserSettings';
const NEU_PUSH_TOKENS_COLLECTION = 'neuPushTokens';
const NEU_PUSH_SW_PATH = 'firebase-messaging-sw.js';
// Assumption: VAPID key is exposed as window.NEU_FCM_VAPID_KEY (fallback: window.FCM_VAPID_KEY).
const NEU_PUSH_VAPID_KEY = String(window.NEU_FCM_VAPID_KEY || window.FCM_VAPID_KEY || '').trim();

const NEU_PUSH_MODAL_ID = 'neuPushPermissionModal';
const NEU_PUSH_TOGGLE_ID = 'neuPushToggle';
const NEU_PUSH_HINT_ID = 'neuPushHint';
const NEU_PUSH_ASK_BTN_ID = 'neuPushPermissionBtn';

const state = {
  uid: '',
  pushEnabled: true,
  supported: false,
  messaging: null,
  swReg: null,
  token: '',
  onMessageUnsub: null,
  uiWired: false,
  autoPromptShown: false,
};

function neuPushNode(id) {
  const node = document.getElementById(id);
  return node instanceof HTMLElement ? node : null;
}

function neuPushToggleNode() {
  const node = document.getElementById(NEU_PUSH_TOGGLE_ID);
  return node instanceof HTMLInputElement ? node : null;
}

function neuPushHint(text, bad = false) {
  const node = neuPushNode(NEU_PUSH_HINT_ID);
  if (!(node instanceof HTMLElement)) return;
  node.textContent = String(text || '').trim();
  node.style.color = bad ? '#ffb2bf' : 'rgba(230,236,255,0.92)';
}

function neuPushSyncModalLock() {
  const hasOpenModal = Array.from(document.querySelectorAll('.composer-modal')).some(
    (node) => node instanceof HTMLElement && !node.hidden,
  );
  document.body.classList.toggle('modal-open', hasOpenModal);
}

function neuPushSetModalOpen(open) {
  const modal = neuPushNode(NEU_PUSH_MODAL_ID);
  if (!(modal instanceof HTMLElement)) return;
  modal.hidden = open !== true;
  neuPushSyncModalLock();
}

function neuPushChatHash(chatId = '') {
  const value = String(chatId || '').trim();
  return value ? `#chat=${encodeURIComponent(value)}` : '';
}

function neuPushOpenChatHash(chatId = '') {
  const hash = neuPushChatHash(chatId);
  if (!hash) return;
  const nextHref = `${location.pathname}${location.search}${hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
  window.dispatchEvent(new Event('hashchange'));
}

function neuPushPayloadChatId(payload = null) {
  return String(payload?.data?.chatId || payload?.data?.convId || '').trim();
}

function neuPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return String(Notification.permission || 'default');
}

function neuPushEnsureSettingsUi() {
  if (neuPushNode('neuPushSettingsRow')) return;
  const profileEditor = document.querySelector('#neuProfileModal .neu-profile-editor');
  if (!(profileEditor instanceof HTMLElement)) return;

  const row = document.createElement('div');
  row.id = 'neuPushSettingsRow';
  row.className = 'neu-profile-push-settings';
  row.style.padding = '10px 0';
  row.innerHTML = `
    <p class="hintSmall"><strong>Notificaciones push</strong></p>
    <label class="btn-white-outline" for="${NEU_PUSH_TOGGLE_ID}" style="display:inline-flex;align-items:center;gap:8px;">
      <input id="${NEU_PUSH_TOGGLE_ID}" type="checkbox" />
      Activar notificaciones
    </label>
    <button class="btn-white-outline" id="${NEU_PUSH_ASK_BTN_ID}" type="button">Permitir notificaciones</button>
    <p class="hintSmall" id="${NEU_PUSH_HINT_ID}"></p>
  `;

  const actions = profileEditor.querySelector('.composer-actions');
  if (actions instanceof HTMLElement) profileEditor.insertBefore(row, actions);
  else profileEditor.append(row);
}

function neuPushEnsurePermissionModal() {
  if (neuPushNode(NEU_PUSH_MODAL_ID)) return;
  const modal = document.createElement('div');
  modal.className = 'composer-modal';
  modal.id = NEU_PUSH_MODAL_ID;
  modal.hidden = true;
  modal.innerHTML = `
    <div class="composer-modal-backdrop" data-neu-push-close="1"></div>
    <div class="composer-modal-card" role="dialog" aria-modal="true" aria-label="Permiso de notificaciones">
      <div class="composer-head">
        <h2>Notificaciones</h2>
        <button class="btn-white-outline" type="button" data-neu-push-close="1">Cerrar</button>
      </div>
      <div class="composer-body">
        <p class="hintSmall">Activa notificaciones para recibir nuevos mensajes en tiempo real.</p>
        <div class="composer-actions">
          <button class="btn-yellow" type="button" id="neuPushAllowBtn">Permitir</button>
          <button class="btn-white-outline" type="button" data-neu-push-close="1">Ahora no</button>
        </div>
      </div>
    </div>
  `;
  document.body.append(modal);
}

function neuPushUpdateUi() {
  const toggle = neuPushToggleNode();
  const askBtn = neuPushNode(NEU_PUSH_ASK_BTN_ID);
  const permission = neuPushPermission();
  if (toggle instanceof HTMLInputElement) {
    toggle.checked = state.pushEnabled === true;
    toggle.disabled = !state.supported;
  }
  if (askBtn instanceof HTMLButtonElement) {
    askBtn.disabled = !state.supported || permission === 'granted';
  }

  if (!state.supported) {
    neuPushHint('Este navegador no soporta Web Push.', true);
    return;
  }
  if (!NEU_PUSH_VAPID_KEY) {
    neuPushHint('Falta configurar NEU_FCM_VAPID_KEY.', true);
    return;
  }
  if (permission === 'granted') {
    neuPushHint('Notificaciones activas.');
    return;
  }
  if (permission === 'denied') {
    neuPushHint('Notificaciones bloqueadas en el navegador.', true);
    return;
  }
  if (state.pushEnabled) {
    neuPushHint('Pulsa "Permitir notificaciones" para activar push.');
    return;
  }
  neuPushHint('Notificaciones desactivadas.');
}

async function neuPushSaveSetting(uid, enabled) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  await setDoc(
    doc(db, NEU_PUSH_SETTINGS_COLLECTION, cleanUid),
    {
      pushEnabled: enabled === true,
      notificationsEnabled: enabled === true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function neuPushLoadSetting(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return true;
  try {
    const snap = await getDoc(doc(db, NEU_PUSH_SETTINGS_COLLECTION, cleanUid));
    if (!snap.exists()) return true;
    const data = snap.data() || {};
    if (data.pushEnabled === false) return false;
    if (data.notificationsEnabled === false) return false;
    return true;
  } catch {
    return true;
  }
}

async function neuPushEnsureMessagingReady() {
  if (!state.supported) return false;
  if (!state.messaging) state.messaging = getMessaging(app);
  if (!state.swReg && 'serviceWorker' in navigator) {
    state.swReg = await navigator.serviceWorker.register(NEU_PUSH_SW_PATH);
  }
  return !!state.messaging && !!state.swReg;
}

async function neuPushSyncToken(uid) {
  if (!NEU_PUSH_VAPID_KEY) return '';
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return '';
  const ready = await neuPushEnsureMessagingReady();
  if (!ready || !state.messaging || !state.swReg) return '';

  const token = await getToken(state.messaging, {
    vapidKey: NEU_PUSH_VAPID_KEY,
    serviceWorkerRegistration: state.swReg,
  });
  if (!token) return '';

  state.token = token;
  await setDoc(
    doc(db, NEU_PUSH_TOKENS_COLLECTION, cleanUid, 'tokens', token),
    {
      token,
      userAgent: String(navigator.userAgent || '').slice(0, 400),
      permission: neuPushPermission(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return token;
}

async function neuPushClearTokens(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  if (state.messaging && state.token) {
    try {
      await deleteToken(state.messaging);
    } catch {
      // noop
    }
  }
  state.token = '';
  try {
    const snap = await getDocs(collection(db, NEU_PUSH_TOKENS_COLLECTION, cleanUid, 'tokens'));
    await Promise.all(
      snap.docs.map((row) => {
        return deleteDoc(row.ref).catch(() => null);
      }),
    );
  } catch {
    // noop
  }
}

async function neuPushEnableFromPermission(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  state.pushEnabled = true;
  await neuPushSaveSetting(cleanUid, true);
  await neuPushSyncToken(cleanUid);
  neuPushUpdateUi();
}

async function neuPushRequestPermission(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid || !state.supported) return;
  if (!('Notification' in window)) return;

  const current = neuPushPermission();
  if (current === 'granted') {
    await neuPushEnableFromPermission(cleanUid);
    return;
  }
  if (current === 'denied') {
    state.pushEnabled = false;
    await neuPushSaveSetting(cleanUid, false);
    await neuPushClearTokens(cleanUid);
    neuPushUpdateUi();
    return;
  }

  let result = 'default';
  try {
    result = await Notification.requestPermission();
  } catch {
    result = 'denied';
  }

  if (result === 'granted') {
    await neuPushEnableFromPermission(cleanUid);
    neuPushSetModalOpen(false);
    return;
  }

  state.pushEnabled = false;
  await neuPushSaveSetting(cleanUid, false);
  await neuPushClearTokens(cleanUid);
  neuPushSetModalOpen(false);
  neuPushUpdateUi();
}

function neuPushWireUi(uid) {
  if (state.uiWired) return;
  state.uiWired = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closeBtn = target.closest('[data-neu-push-close]');
    if (closeBtn) {
      event.preventDefault();
      neuPushSetModalOpen(false);
      return;
    }
    if (target.closest(`#${NEU_PUSH_ASK_BTN_ID}`)) {
      event.preventDefault();
      if (state.supported) neuPushSetModalOpen(true);
      return;
    }
    if (target.closest('#neuPushAllowBtn')) {
      event.preventDefault();
      neuPushRequestPermission(uid).catch(() => null);
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!(target instanceof HTMLInputElement) || target.id !== NEU_PUSH_TOGGLE_ID) return;
    const enabled = target.checked === true;
    const currentUid = String(state.uid || uid || auth.currentUser?.uid || '').trim();
    if (!currentUid) return;

    state.pushEnabled = enabled;
    if (!enabled) {
      neuPushSaveSetting(currentUid, false)
        .then(() => neuPushClearTokens(currentUid))
        .finally(() => {
          neuPushUpdateUi();
        });
      return;
    }

    neuPushSaveSetting(currentUid, true)
      .then(async () => {
        if (neuPushPermission() === 'granted') {
          await neuPushSyncToken(currentUid);
          neuPushUpdateUi();
          return;
        }
        neuPushSetModalOpen(true);
        neuPushUpdateUi();
      })
      .catch(() => {
        state.pushEnabled = false;
        neuPushUpdateUi();
      });
  });
}

async function neuPushWireForegroundMessages() {
  if (!state.messaging || typeof state.onMessageUnsub === 'function') return;
  state.onMessageUnsub = onMessage(state.messaging, (payload) => {
    const chatId = neuPushPayloadChatId(payload);
    const senderUid = String(payload?.data?.senderUid || '').trim();
    const title = String(payload?.notification?.title || 'Nuevo mensaje').trim();
    const body = String(payload?.notification?.body || 'Tienes un nuevo mensaje.').trim();

    window.dispatchEvent(
      new CustomEvent('neu-push-message', {
        detail: { chatId, senderUid, payload },
      }),
    );

    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notice = new Notification(title, {
        body,
        tag: chatId ? `neu-chat-${chatId}` : 'neu-chat',
        data: { chatId, senderUid },
      });
      notice.onclick = () => {
        try {
          window.focus();
        } catch {
          // noop
        }
        neuPushOpenChatHash(chatId);
        notice.close();
      };
    } catch {
      // noop
    }
  });
}

export async function neuInitPush({ user } = {}) {
  const uid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return { enabled: false, supported: false };
  state.uid = uid;

  neuPushEnsureSettingsUi();
  neuPushEnsurePermissionModal();

  state.supported =
    'serviceWorker' in navigator &&
    'Notification' in window &&
    (await isSupported().catch(() => false));

  state.pushEnabled = await neuPushLoadSetting(uid);
  neuPushWireUi(uid);
  neuPushUpdateUi();

  if (!state.supported || !state.pushEnabled) {
    if (!state.pushEnabled) await neuPushClearTokens(uid);
    return {
      enabled: state.pushEnabled,
      supported: state.supported,
      permission: neuPushPermission(),
    };
  }

  await neuPushEnsureMessagingReady();
  await neuPushWireForegroundMessages();

  const permission = neuPushPermission();
  if (permission === 'granted') {
    await neuPushSyncToken(uid);
  } else if (permission === 'default' && !state.autoPromptShown) {
    state.autoPromptShown = true;
    neuPushSetModalOpen(true);
  } else if (permission === 'denied') {
    state.pushEnabled = false;
    await neuPushSaveSetting(uid, false);
    await neuPushClearTokens(uid);
  }

  neuPushUpdateUi();
  return {
    enabled: state.pushEnabled,
    supported: state.supported,
    permission: neuPushPermission(),
  };
}
