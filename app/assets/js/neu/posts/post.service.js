export function createPostService({ state, repository }) {
  return {
    async init() {
      if (state.initialized) return;
      state.initialized = true;
      repository.initQuickPost();
      if (!repository.isCrudEnabled()) return;
      await repository.bootGuarded('crud_posts', () => repository.initCrud());
    },
  };
}

export async function init(deps) {
  const service = createPostService(deps);
  await service.init();
  return service;
}
