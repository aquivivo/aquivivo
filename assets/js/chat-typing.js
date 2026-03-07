function defaultNorm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function createMiniChatTypingController({
  db,
  doc,
  updateDoc,
  deleteField,
  serverTimestamp,
  getCurrentUid,
  getCurrentName,
  getConversations,
  getActiveConversationId,
  getOpenThreads,
  getConversationTitle,
  maybeDate,
  norm = defaultNorm,
  qs,
  windowRef = window,
}) {
  const TYPING_DEBOUNCE_MS = 400;
  const TYPING_IDLE_MS = 2000;
  const TYPING_THROTTLE_MS = 1500;
  const TYPING_STALE_MS = 5000;

  let typingRefreshTimer = 0;
  const typingState = {
    debounceTimers: new Map(),
    idleTimers: new Map(),
    lastSentAt: new Map(),
    activeConversations: new Set(),
  };

  function clearTypingTimer(timerMap, conversationId) {
    if (!(timerMap instanceof Map)) return;
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    const timer = timerMap.get(convId);
    if (!timer) return;
    windowRef.clearTimeout(timer);
    timerMap.delete(convId);
  }

  function clearLocalTypingTimers(conversationId) {
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    clearTypingTimer(typingState.debounceTimers, convId);
    clearTypingTimer(typingState.idleTimers, convId);
  }

  async function sendTypingHeartbeat(conversationId) {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    if (!convId || !currentUid) return;
    const now = Date.now();
    const lastSentAt = Number(typingState.lastSentAt.get(convId) || 0);
    if (now - lastSentAt < TYPING_THROTTLE_MS) return;
    typingState.lastSentAt.set(convId, now);

    try {
      await updateDoc(doc(db, 'conversations', convId), {
        [`typing.${currentUid}`]: serverTimestamp(),
      });
      typingState.activeConversations.add(convId);
    } catch (error) {
      console.warn('[mini-chat-v4] typing heartbeat failed', error);
    }
  }

  async function clearTypingPresence(conversationId, { force = false } = {}) {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    if (!convId || !currentUid) return;
    clearLocalTypingTimers(convId);
    if (!force && !typingState.activeConversations.has(convId)) return;

    try {
      await updateDoc(doc(db, 'conversations', convId), {
        [`typing.${currentUid}`]: deleteField(),
      });
    } catch (error) {
      console.warn('[mini-chat-v4] typing clear failed', error);
    } finally {
      typingState.activeConversations.delete(convId);
      typingState.lastSentAt.delete(convId);
    }
  }

  function clearAllTypingPresenceBestEffort() {
    const conversationIds = Array.from(typingState.activeConversations);
    conversationIds.forEach((convId) => {
      clearTypingPresence(convId, { force: true }).catch(() => null);
    });
    typingState.debounceTimers.forEach((timer) => windowRef.clearTimeout(timer));
    typingState.idleTimers.forEach((timer) => windowRef.clearTimeout(timer));
    typingState.debounceTimers.clear();
    typingState.idleTimers.clear();
    typingState.lastSentAt.clear();
    typingState.activeConversations.clear();
  }

  function scheduleTypingHeartbeat(conversationId, rawValue = '') {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    if (!convId || !currentUid) return;
    const text = String(rawValue || '').trim();

    if (!text) {
      clearTypingPresence(convId).catch(() => null);
      return;
    }

    clearTypingTimer(typingState.debounceTimers, convId);
    typingState.debounceTimers.set(
      convId,
      windowRef.setTimeout(() => {
        typingState.debounceTimers.delete(convId);
        sendTypingHeartbeat(convId).catch(() => null);
      }, TYPING_DEBOUNCE_MS),
    );

    clearTypingTimer(typingState.idleTimers, convId);
    typingState.idleTimers.set(
      convId,
      windowRef.setTimeout(() => {
        typingState.idleTimers.delete(convId);
        clearTypingPresence(convId, { force: true }).catch(() => null);
      }, TYPING_IDLE_MS),
    );
  }

  function typingUidsForConversation(conversation, nowMs = Date.now()) {
    const typingMap = conversation?.typing;
    if (!typingMap || typeof typingMap !== 'object') return [];

    const currentUid = String(getCurrentUid() || '').trim();
    const out = [];
    Object.entries(typingMap).forEach(([uid, value]) => {
      const cleanUid = String(uid || '').trim();
      if (!cleanUid || cleanUid === currentUid) return;
      const date = maybeDate(value);
      if (!date) return;
      const age = nowMs - date.getTime();
      if (age >= 0 && age <= TYPING_STALE_MS) out.push(cleanUid);
    });
    return out;
  }

  function typingNameForConversation(conversation, uid) {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return 'Usuario';
    const participants = Array.isArray(conversation?.participants)
      ? conversation.participants.map((item) => String(item || '').trim())
      : [];
    const participantNames = Array.isArray(conversation?.participantNames)
      ? conversation.participantNames.map((item) => String(item || '').trim())
      : [];

    const index = participants.findIndex((item) => item === cleanUid);
    if (index >= 0 && participantNames[index]) {
      return participantNames[index];
    }

    if (String(conversation?.type || '').trim() === 'direct') {
      const currentName = String(getCurrentName() || '').trim();
      const title = String(getConversationTitle(conversation, currentName, norm) || '').trim();
      if (title && norm(title) !== norm(currentName) && norm(title) !== 'conversacion') {
        return title;
      }
    }

    return 'Usuario';
  }

  function typingLabelForConversation(conversation) {
    const uids = typingUidsForConversation(conversation);
    if (!uids.length) return '';
    if (uids.length > 1) return 'Varios estan escribiendo...';
    const name = typingNameForConversation(conversation, uids[0]);
    return `${name} esta escribiendo...`;
  }

  function setTypingNode(node, text = '') {
    if (!(node instanceof HTMLElement)) return;
    const label = String(text || '').trim();
    node.textContent = label;
    node.hidden = !label;
  }

  function updateTypingIndicatorsFromConversations() {
    const activeConvId = String(getActiveConversationId() || '').trim();
    const conversations = Array.isArray(getConversations()) ? getConversations() : [];
    const panelConversation = activeConvId
      ? conversations.find((item) => String(item?.id || '').trim() === activeConvId) || null
      : null;
    setTypingNode(qs('#miniChatTyping'), typingLabelForConversation(panelConversation));

    const openThreads = getOpenThreads();
    if (!(openThreads instanceof Map)) return;
    openThreads.forEach((thread, id) => {
      if (!(thread?.typingEl instanceof HTMLElement)) return;
      const convId = String(id || '').trim();
      const conversation =
        conversations.find((item) => String(item?.id || '').trim() === convId) || null;
      setTypingNode(thread.typingEl, typingLabelForConversation(conversation));
    });
  }

  function ensureTypingRefreshTimer() {
    if (typingRefreshTimer) return;
    typingRefreshTimer = windowRef.setInterval(() => {
      updateTypingIndicatorsFromConversations();
    }, 1000);
  }

  function stopTypingRefreshTimer() {
    if (!typingRefreshTimer) return;
    windowRef.clearInterval(typingRefreshTimer);
    typingRefreshTimer = 0;
  }

  return {
    clearAllTypingPresenceBestEffort,
    clearTypingPresence,
    ensureTypingRefreshTimer,
    scheduleTypingHeartbeat,
    stopTypingRefreshTimer,
    updateTypingIndicatorsFromConversations,
  };
}
