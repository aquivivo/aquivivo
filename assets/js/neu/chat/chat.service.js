import { destroyGlobalMiniChat, initGlobalMiniChat } from '../../global-mini-chat.js?v=20260308sendfix';

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

      const uid = String(context.authUser?.uid || '').trim();
      if (!uid) {
        destroyGlobalMiniChat();
        return;
      }

      initGlobalMiniChat({
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
