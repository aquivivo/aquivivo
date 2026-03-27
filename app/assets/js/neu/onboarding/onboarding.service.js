export function createOnboardingService({ state, repository }) {
  return {
    async init({ authUser = null } = {}) {
      if (state.initialized) return state.mode || 'app';
      state.initialized = true;
      const mode = await repository.runLegacyStart({ authUser });
      state.mode = mode || 'app';
      return state.mode;
    },
  };
}

export async function init(deps) {
  const service = createOnboardingService(deps);
  await service.init();
  return service;
}
