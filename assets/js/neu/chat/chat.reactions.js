// Compatibility adapter kept for neu-app.boot.js.
// Live reaction logic is implemented in ../../chat-reactions.js and orchestrated by global-mini-chat.js.
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
