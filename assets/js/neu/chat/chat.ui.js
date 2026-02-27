let chatUiInitialized = false;

export function createChatUi() {
  return {
    init() {
      if (chatUiInitialized) return;
      chatUiInitialized = true;
      // Chat UI listeners are mounted lazily by the legacy runtime when chat is opened.
    },
  };
}

export function init() {
  const ui = createChatUi();
  ui.init();
  return ui;
}
