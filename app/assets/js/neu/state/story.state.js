function resetObject(target, createFn) {
  const next = createFn();
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.assign(target, next);
}

export function createStoryState() {
  return {
    initialized: false,
    stories: [],
    activeStoryId: null,
  };
}

export function createNeuStoryCrudState() {
  return {
    wired: false,
    stories: [],
    byKey: new Map(),
    byMedia: new Map(),
    nameSet: new Set(),
    loadingPromise: null,
    refreshTimer: null,
    refreshInFlight: false,
    refreshQueued: false,
    refreshLastAt: 0,
    lastLoadedAt: 0,
    gridObserver: null,
    stripObserver: null,
    modalObserver: null,
    pendingDeleteKey: '',
    deleting: false,
  };
}

export const storyState = createStoryState();
export const neuStoryCrudState = createNeuStoryCrudState();

export function resetStoryState() {
  resetObject(storyState, createStoryState);
  resetObject(neuStoryCrudState, createNeuStoryCrudState);
}

export function init() {
  return {
    storyState,
    neuStoryCrudState,
    resetStoryState,
  };
}
