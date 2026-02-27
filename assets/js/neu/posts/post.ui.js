let postUiInitialized = false;

export function createPostUi() {
  return {
    init() {
      if (postUiInitialized) return;
      postUiInitialized = true;
      // Post UI is rendered by the existing feed templates and legacy runtime listeners.
    },
  };
}

export function init() {
  const ui = createPostUi();
  ui.init();
  return ui;
}
