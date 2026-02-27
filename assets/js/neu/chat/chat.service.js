export function createChatService({ context, state, repository }) {
  return {
    async init({ eager = false } = {}) {
      if (state.initialized) return;
      state.initialized = true;
      if (!eager) return;
      if (!context.authUser) return;
      await repository.initMvp(context.authUser);
    },
  };
}

export async function init(deps, options) {
  const service = createChatService(deps);
  await service.init(options);
  return service;
}
