let profileUiInitialized = false;

export function createProfileUi() {
  return {
    init() {
      if (profileUiInitialized) return;
      profileUiInitialized = true;
    },
  };
}

export function init(deps) {
  const ui = createProfileUi(deps);
  ui.init();
  return ui;
}
