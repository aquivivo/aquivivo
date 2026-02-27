let chatTypingInitialized = false;

export function createChatTyping() {
  return {
    init() {
      if (chatTypingInitialized) return;
      chatTypingInitialized = true;
      // Typing indicators are preserved by legacy runtime internals.
    },
  };
}

export function init() {
  const typing = createChatTyping();
  typing.init();
  return typing;
}
