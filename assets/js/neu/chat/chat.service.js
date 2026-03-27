// Compatibility bridge for neu-app.boot.js.
// The actual chat runtime lives in ../../global-mini-chat.js and the hyphenated chat modules.
const GLOBAL_MINI_CHAT_MODULE = '../../global-mini-chat.js?v=20260327b1';

async function loadGlobalMiniChat() {
  try {
    const mod = await import(GLOBAL_MINI_CHAT_MODULE);
    return {
      initGlobalMiniChat: typeof mod?.initGlobalMiniChat === 'function' ? mod.initGlobalMiniChat : null,
      destroyGlobalMiniChat: typeof mod?.destroyGlobalMiniChat === 'function' ? mod.destroyGlobalMiniChat : null,
    };
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[neu-chat] global-mini-chat.js failed to load', error);
    }
    return { initGlobalMiniChat: null, destroyGlobalMiniChat: null };
  }
}

function authDisplayName(authUser) {
  const displayName = String(authUser?.displayName || '').trim();
  const emailName = String(authUser?.email || '').split('@')[0]?.trim() || '';
  return displayName || emailName || 'Usuario';
}

export function createChatService({ context, state, repository }) {
  return {
    async init({ eager = false } = {}) {
      if (state.initialized) return;
      state.initialized = true;

      if (!eager) return;

      const { initGlobalMiniChat, destroyGlobalMiniChat } = await loadGlobalMiniChat();

      const uid = String(context.authUser?.uid || '').trim();
      if (!uid) {
        destroyGlobalMiniChat?.();
        return;
      }

      initGlobalMiniChat?.({
        uid,
        displayName: authDisplayName(context.authUser),
        mode: document.body?.classList?.contains('neu-social-app') ? 'page' : 'dock',
      });

      if (repository && typeof repository.initMvp === 'function') {
        await repository.initMvp(context.authUser);
      }
    },
  };
}

export async function init(deps, options) {
  const service = createChatService(deps);
  await service.init(options);
  return service;
}

