export function createStoryService({ state }) {
  return {
    async init() {
      if (state.initialized) return;
      state.initialized = true;
    },
  };
}

export async function init(deps) {
  const service = createStoryService(deps);
  await service.init();
  return service;
}
