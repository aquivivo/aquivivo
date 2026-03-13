function defaultNorm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function createMiniChatTypingController({
  db,
  collection,
  onSnapshot,
  doc,
  setDoc,
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
  getPanelTypingNodes,
  typingCollection = 'neuChatTyping',
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

  const remoteTypingByConversation = new Map();
  const remoteTypingUnsubs = new Map();
  const remoteTypingBlocked = new Set();

  function runSafeUnsubscribe(unsub) {
    if (typeof unsub !== 'function') return;
    try {
      unsub();
    } catch {
      // ignore unsubscribe failures
    }
  }

  function stopRemoteTypingListeners() {
    remoteTypingUnsubs.forEach((unsub) => runSafeUnsubscribe(unsub));
    remoteTypingUnsubs.clear();
    remoteTypingByConversation.clear();
    remoteTypingBlocked.clear();
  }

  function stopRemoteTypingListener(conversationId, { clearBlocked = false } = {}) {
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    const unsub = remoteTypingUnsubs.get(convId);
    if (typeof unsub === 'function') {
      runSafeUnsubscribe(unsub);
    }
    remoteTypingUnsubs.delete(convId);
    remoteTypingByConversation.delete(convId);
    if (clearBlocked) remoteTypingBlocked.delete(convId);
  }

  function ensureRemoteTypingListener(conversationId) {
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    if (remoteTypingUnsubs.has(convId)) return;
    if (remoteTypingBlocked.has(convId)) return;
    if (typeof collection !== 'function' || typeof onSnapshot !== 'function') return;

    const usersCol = collection(db, typingCollection, convId, 'users');
    const unsub = onSnapshot(
      usersCol,
      (snapshot) => {
        const next = new Map();
        const nowMs = Date.now();
        (snapshot?.docs || []).forEach((docSnap) => {
          const data = docSnap.data() || {};
          const uid = String(data.uid || docSnap.id || '').trim();
          if (!uid) return;
          if (data.typing !== true) return;
          const updatedAt = maybeDate(data.updatedAt);
          if (!updatedAt) return;
          const age = nowMs - updatedAt.getTime();
          if (age < 0 || age > TYPING_STALE_MS) return;
          next.set(uid, {
            updatedAt: data.updatedAt || null,
            name: String(data.name || '').trim(),
          });
        });
        remoteTypingByConversation.set(convId, next);
        remoteTypingBlocked.delete(convId);
        updateTypingIndicatorsFromConversations();
      },
      () => {
        // Most common reason: Firestore rules deny listing users typing docs.
        // Keep legacy/fallback typing path alive instead of forcing an empty remote map.
        stopRemoteTypingListener(convId);
        remoteTypingBlocked.add(convId);
        updateTypingIndicatorsFromConversations();
      },
    );
    remoteTypingUnsubs.set(convId, unsub);
  }

  function syncRemoteTypingListeners() {
    const desired = new Set();
    const activeConvId = String(getActiveConversationId() || '').trim();
    if (activeConvId) desired.add(activeConvId);

    const openThreads = getOpenThreads();
    if (openThreads instanceof Map) {
      openThreads.forEach((_thread, id) => {
        const convId = String(id || '').trim();
        if (convId) desired.add(convId);
      });
    }

    desired.forEach((convId) => ensureRemoteTypingListener(convId));
    remoteTypingUnsubs.forEach((_unsub, convId) => {
      if (desired.has(convId)) return;
      stopRemoteTypingListener(convId, { clearBlocked: true });
    });
  }

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

  function typingStateRef(conversationId, uid) {
    const convId = String(conversationId || '').trim();
    const userId = String(uid || '').trim();
    if (!convId || !userId) return null;
    return doc(db, typingCollection, convId, 'users', userId);
  }

  async function sendTypingHeartbeat(conversationId) {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !currentUid) return;
    const now = Date.now();
    const lastSentAt = Number(typingState.lastSentAt.get(convId) || 0);
    if (now - lastSentAt < TYPING_THROTTLE_MS) return;
    typingState.lastSentAt.set(convId, now);

    try {
      const ref = typingStateRef(convId, currentUid);
      if (!ref) return;
      await setDoc(
        ref,
        {
          uid: currentUid,
          name: currentName,
          typing: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      typingState.activeConversations.add(convId);
    } catch (error) {
      console.warn('[mini-chat-v4] typing heartbeat failed', error);
    }
  }

  async function clearTypingPresence(conversationId, { force = false } = {}) {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !currentUid) return;
    clearLocalTypingTimers(convId);
    if (!force && !typingState.activeConversations.has(convId)) return;

    try {
      const ref = typingStateRef(convId, currentUid);
      if (!ref) return;
      await setDoc(
        ref,
        {
          uid: currentUid,
          name: currentName,
          typing: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
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

    stopRemoteTypingListeners();
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
    const convId = String(conversation?.id || '').trim();
    const remoteTyping = convId ? remoteTypingByConversation.get(convId) : null;
    const currentUid = String(getCurrentUid() || '').trim();

    if (remoteTyping instanceof Map) {
      const out = [];
      remoteTyping.forEach((entry, uid) => {
        const cleanUid = String(uid || '').trim();
        if (!cleanUid || cleanUid === currentUid) return;
        const date = maybeDate(entry?.updatedAt);
        if (!date) return;
        const age = nowMs - date.getTime();
        if (age >= 0 && age <= TYPING_STALE_MS) out.push(cleanUid);
      });
      return out;
    }

    const typingMap = conversation?.typing;
    if (!typingMap || typeof typingMap !== 'object') return [];

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

    const convId = String(conversation?.id || '').trim();
    const remote = convId ? remoteTypingByConversation.get(convId) : null;
    const remoteName =
      remote instanceof Map ? String(remote.get(cleanUid)?.name || '').trim() : '';
    if (remoteName) return remoteName;
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
    if (uids.length > 1) return 'Varios están escribiendo…';
    const name = typingNameForConversation(conversation, uids[0]);
    return `${name} está escribiendo…`;
  }

  function resolvePanelTypingNodes() {
    if (typeof getPanelTypingNodes === 'function') {
      const nodes = getPanelTypingNodes();
      if (Array.isArray(nodes)) {
        return nodes.filter((node) => node instanceof HTMLElement);
      }
      if (nodes instanceof HTMLElement) return [nodes];
    }

    const node = typeof qs === 'function' ? qs('[data-mini-chat-role="typing"]') : null;
    return node instanceof HTMLElement ? [node] : [];
  }

  function setTypingNode(node, text = '') {
    if (!(node instanceof HTMLElement)) return;
    const label = String(text || '').trim();
    node.textContent = label;
    node.hidden = !label;
  }

  function updateTypingIndicatorsFromConversations() {
    syncRemoteTypingListeners();

    const activeConvId = String(getActiveConversationId() || '').trim();
    const conversations = Array.isArray(getConversations()) ? getConversations() : [];
    const panelConversation = activeConvId
      ? conversations.find((item) => String(item?.id || '').trim() === activeConvId) || { id: activeConvId }
      : null;
    const panelLabel = typingLabelForConversation(panelConversation);
    resolvePanelTypingNodes().forEach((node) => setTypingNode(node, panelLabel));

    const openThreads = getOpenThreads();
    if (!(openThreads instanceof Map)) return;
    openThreads.forEach((thread, id) => {
      if (!(thread?.typingEl instanceof HTMLElement)) return;
      const convId = String(id || '').trim();
      const conversation =
        conversations.find((item) => String(item?.id || '').trim() === convId) || (convId ? { id: convId } : null);
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
    if (typingRefreshTimer) {
      windowRef.clearInterval(typingRefreshTimer);
      typingRefreshTimer = 0;
    }

    stopRemoteTypingListeners();
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
