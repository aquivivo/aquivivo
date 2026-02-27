let chatReactionsInitialized = false;

export function createChatReactions() {
  return {
    init() {
      if (chatReactionsInitialized) return;
      chatReactionsInitialized = true;
      // Message reaction listeners remain managed by existing chat rendering logic.
    },
  };
}

export function init() {
  const reactions = createChatReactions();
  reactions.init();
  return reactions;
}
