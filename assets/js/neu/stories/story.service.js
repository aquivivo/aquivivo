export function createStoryService({ state, repository }) {
  return {
    async init() {
      if (state.initialized) return;
      state.initialized = true;
      if (!repository.isCrudEnabled()) return;
      await repository.bootGuarded('crud_stories', () => repository.initCrud());
    },
  };
}

export async function init(deps) {
  const service = createStoryService(deps);
  await service.init();
  return service;
}
