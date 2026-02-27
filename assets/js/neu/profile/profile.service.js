import { setProfileUser } from '../context/neu-app-context.js';

export function createProfileService({ context, state, repository }) {
  return {
    async init() {
      if (state.initialized) return;
      state.initialized = true;
      repository.wireLegacyProfileBridge();
      if (!context.profileUser && context.authUser?.uid) {
        setProfileUser(context, { uid: String(context.authUser.uid) });
      }
    },
  };
}

export async function init(deps) {
  const service = createProfileService(deps);
  await service.init();
  return service;
}
