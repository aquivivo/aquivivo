let profileUiInitialized = false;

export function createProfileUi({ repository }) {
  return {
    init() {
      if (profileUiInitialized) return;
      profileUiInitialized = true;
      repository.rewriteLegacyLinks(document);
      window.setTimeout(() => repository.rewriteLegacyLinks(document), 700);
      window.setTimeout(() => repository.rewriteLegacyLinks(document), 1800);
    },
  };
}

export function init(deps) {
  const ui = createProfileUi(deps);
  ui.init();
  return ui;
}
