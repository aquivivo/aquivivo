import { auth } from './neu-firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

const MINI_CHAT_MODULE_PATH = './global-mini-chat.js?v=20260326h1';
const MINI_CHAT_STYLE_HREF = 'assets/css/mini-chat-v4.css?v=20260326h1';
const MINI_CHAT_GLOBAL_STYLE_HREF = 'assets/css/mini-chat-global.css?v=20260326h1';
const MINI_CHAT_BOOTSTRAP_FLAG = '__AV_MINI_CHAT_BOOTSTRAP_WIRED__';

let miniChatModulePromise = null;

function ensureStyleLink(href) {
  const safeHref = String(href || '').trim();
  if (!safeHref) return;

  const existing = document.querySelector(`link[rel="stylesheet"][href*="${safeHref.split('?')[0]}"]`);
  if (existing instanceof HTMLLinkElement) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = safeHref;
  document.head.appendChild(link);
}

function ensureMiniChatStyles() {
  ensureStyleLink(MINI_CHAT_STYLE_HREF);
  ensureStyleLink(MINI_CHAT_GLOBAL_STYLE_HREF);
}

function resolveDisplayName(user) {
  const direct = String(user?.displayName || '').trim();
  if (direct) return direct;
  const email = String(user?.email || '').trim();
  if (email && email.includes('@')) return email.split('@')[0];
  return 'Usuario';
}

function resolveMode() {
  return document.body?.classList?.contains('neu-social-app') ? 'page' : 'dock';
}

async function loadMiniChatModule() {
  if (!miniChatModulePromise) {
    miniChatModulePromise = import(MINI_CHAT_MODULE_PATH)
      .then((mod) => ({
        initGlobalMiniChat: typeof mod?.initGlobalMiniChat === 'function' ? mod.initGlobalMiniChat : null,
        destroyGlobalMiniChat: typeof mod?.destroyGlobalMiniChat === 'function' ? mod.destroyGlobalMiniChat : null,
      }))
      .catch((error) => {
        console.warn('[mini-chat-bootstrap] mini chat module load failed', error);
        return { initGlobalMiniChat: null, destroyGlobalMiniChat: null };
      });
  }

  return miniChatModulePromise;
}

async function syncMiniChatWithAuth(user) {
  const { initGlobalMiniChat, destroyGlobalMiniChat } = await loadMiniChatModule();
  const uid = String(user?.uid || '').trim();

  if (!uid) {
    destroyGlobalMiniChat?.();
    return;
  }

  ensureMiniChatStyles();
  initGlobalMiniChat?.({
    uid,
    displayName: resolveDisplayName(user),
    mode: resolveMode(),
  });
}

function startMiniChatBootstrap() {
  if (window[MINI_CHAT_BOOTSTRAP_FLAG] === true) return;
  window[MINI_CHAT_BOOTSTRAP_FLAG] = true;

  onAuthStateChanged(auth, (user) => {
    void syncMiniChatWithAuth(user || null);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMiniChatBootstrap, { once: true });
} else {
  startMiniChatBootstrap();
}
