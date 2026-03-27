function resetObject(target, createFn) {
  const next = createFn();
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.assign(target, next);
}

export function createPostState() {
  return {
    initialized: false,
    posts: [],
    isLoading: false,
    paginationCursor: null,
  };
}

export function createNeuQuickPostState() {
  return {
    wired: false,
    submitting: false,
  };
}

export function createNeuPostCrudState() {
  return {
    wired: false,
    editing: null,
    pendingDelete: null,
    feedObserver: null,
    modalObserver: null,
    publishDefaultLabel: '',
    composerDefaultTitle: '',
    deleting: false,
    saving: false,
    decorateTick: null,
  };
}

export const postState = createPostState();
export const neuQuickPostState = createNeuQuickPostState();
export const neuPostCrudState = createNeuPostCrudState();

export function resetPostState() {
  resetObject(postState, createPostState);
  resetObject(neuQuickPostState, createNeuQuickPostState);
  resetObject(neuPostCrudState, createNeuPostCrudState);
}

export function init() {
  return {
    postState,
    neuQuickPostState,
    neuPostCrudState,
    resetPostState,
  };
}
