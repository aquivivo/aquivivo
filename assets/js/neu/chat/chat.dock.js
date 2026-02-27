let chatDockInitialized = false;

export function createChatDock() {
  return {
    init() {
      if (chatDockInitialized) return;
      chatDockInitialized = true;
      // Dock behavior remains in the legacy runtime; this adapter is the integration seam.
    },
  };
}

export function init() {
  const dock = createChatDock();
  dock.init();
  return dock;
}
