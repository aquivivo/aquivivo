let storyUiInitialized = false;

export function createStoryUi() {
  return {
    init() {
      if (storyUiInitialized) return;
      storyUiInitialized = true;
      // Story tiles/modals remain driven by the existing template markup and runtime listeners.
    },
  };
}

export function init() {
  const ui = createStoryUi();
  ui.init();
  return ui;
}
