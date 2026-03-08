function normalizeUid(value) {
  return String(value || '').trim();
}

function normalizeMembers(value = []) {
  return Array.isArray(value)
    ? value.map((item) => normalizeUid(item)).filter(Boolean)
    : [];
}

function memberKeyFor(uidA, uidB) {
  const members = [normalizeUid(uidA), normalizeUid(uidB)].filter(Boolean).sort();
  return members.length === 2 ? `${members[0]}_${members[1]}` : '';
}

export function normalizeMessage(docSnap) {
  const data = docSnap.data() || {};
  const imageUrl = String(data.imageUrl || '').trim();
  const fileUrl = String(data.fileUrl || imageUrl).trim();
  const explicitType = String(data.type || '').trim().toLowerCase();
  const type = explicitType || (imageUrl ? 'image' : fileUrl ? 'file' : 'text');
  const encrypted = data.encrypted === true;
  const rawContent = String(data.content || '').trim();

  return {
    id: String(docSnap.id || '').trim(),
    senderId: normalizeUid(data.senderId || data.senderUid),
    senderName: String(data.senderName || '').trim(),
    text: encrypted ? '' : String(data.text || rawContent).trim(),
    content: rawContent,
    encrypted,
    encryptionVersion: Number(data.encryptionVersion || 0) || 0,
    iv: String(data.iv || '').trim(),
    type,
    imageUrl,
    fileUrl,
    fileName: String(data.fileName || (imageUrl ? 'imagen' : '')).trim(),
    fileSize: Number(data.fileSize || 0) || 0,
    mimeType: String(data.mimeType || '').trim(),
    createdAt: data.createdAt || null,
  };
}

export function createMiniChatFirestoreController({
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  uploadAttachmentToStorage,
  where,
  writeBatch,
  getCurrentUid,
  getCurrentName,
  getActiveConversationId,
  setActiveConversationId,
  getConversationMeta,
  getCachedMessages = () => [],
  resolveMessageRows = async (rows) => rows,
  encryptTextMessageForConversation = null,
  ensureConversationEncryption = async () => {},
  panelReactionState,
  renderMessages,
  renderThreadWindowMessages,
  renderConversationList,
  renderThreadMeta,
  setView,
  setOpenLinks,
  markConversationRead,
  markConversationDelivered = () => {},
  clearReactionListeners,
  syncReactionListeners,
  runSafeUnsubscribe,
  clearTypingPresence,
  updateTypingIndicatorsFromConversations,
  getThreadUnread,
  setThreadUnread,
  isThreadMinimized,
  renderTray,
  updateMessageCache = () => {},
  windowRef = window,
}) {
  let msgUnsub = null;

  function stopMessageStream() {
    runSafeUnsubscribe(msgUnsub);
    msgUnsub = null;
    clearReactionListeners(panelReactionState.reactionUnsubs, panelReactionState.reactionData);
    panelReactionState.rows = [];
    panelReactionState.conversationId = '';
    panelReactionState.renderQueued = false;
    panelReactionState.streamToken = null;
  }

  function messageIdFromRows(rows = []) {
    if (!Array.isArray(rows) || !rows.length) return '';
    return String(rows[rows.length - 1]?.id || '').trim();
  }

  function queuePanelReactionRender() {
    if (panelReactionState.renderQueued) return;
    panelReactionState.renderQueued = true;
    const run = () => {
      panelReactionState.renderQueued = false;
      renderMessages(
        panelReactionState.rows,
        panelReactionState.conversationId,
        panelReactionState.reactionData,
      );
    };
    if (typeof windowRef.requestAnimationFrame === 'function') {
      windowRef.requestAnimationFrame(run);
    } else {
      windowRef.setTimeout(run, 16);
    }
  }

  function attachMessageStream(conversationId) {
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    if (String(panelReactionState.conversationId || '').trim() === convId) return;

    stopMessageStream();

    panelReactionState.conversationId = convId;
    panelReactionState.rows = [];
    panelReactionState.renderQueued = false;
    const streamToken = Symbol(`panel:${convId}`);
    panelReactionState.streamToken = streamToken;

    const messagesQuery = query(
      collection(db, 'neuConversations', convId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(120),
    );

    msgUnsub = onSnapshot(
      messagesQuery,
      async (snapshot) => {
        const rawRows = (snapshot.docs || []).map((docSnap) => normalizeMessage(docSnap));
        const rows = await resolveMessageRows(rawRows, convId).catch(() => rawRows);
        if (
          panelReactionState.streamToken !== streamToken ||
          String(panelReactionState.conversationId || '').trim() !== convId
        ) {
          return;
        }

        updateMessageCache(convId, rows);
        panelReactionState.rows = rows;
        syncReactionListeners({
          conversationId: convId,
          rows,
          reactionUnsubs: panelReactionState.reactionUnsubs,
          reactionData: panelReactionState.reactionData,
          onChange: queuePanelReactionRender,
        });
        renderMessages(rows, convId, panelReactionState.reactionData);
        markConversationRead(convId, messageIdFromRows(rows));
        markConversationDelivered(convId, messageIdFromRows(rows));
      },
      () => {
        clearReactionListeners(panelReactionState.reactionUnsubs, panelReactionState.reactionData);
        panelReactionState.rows = [];
        renderMessages([]);
      },
    );
  }

  function attachMessageStreamForWindow(conversationId, container, threadState = null) {
    const convId = String(conversationId || '').trim();
    if (!convId || !(container instanceof HTMLElement)) return null;
    if (
      threadState &&
      typeof threadState === 'object' &&
      typeof threadState.unsub === 'function' &&
      String(threadState.liveConversationId || '').trim() === convId
    ) {
      return threadState.unsub;
    }
    let initialSnapshotHandled = false;
    const streamToken = Symbol(`thread:${convId}`);
    if (threadState && typeof threadState === 'object') {
      threadState.streamToken = streamToken;
    }

    const messagesQuery = query(
      collection(db, 'neuConversations', convId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(120),
    );

    return onSnapshot(
      messagesQuery,
      async (snapshot) => {
        if (initialSnapshotHandled) {
          const addedForUnread = snapshot.docChanges().reduce((sum, change) => {
            if (change.type !== 'added') return sum;
            const senderId = normalizeUid(change.doc.data()?.senderId || change.doc.data()?.senderUid);
            if (!senderId || senderId === normalizeUid(getCurrentUid())) return sum;
            if (!isThreadMinimized(convId)) return sum;
            return sum + 1;
          }, 0);

          if (addedForUnread > 0) {
            const prev = Number(getThreadUnread(convId) || 0);
            setThreadUnread(convId, Math.max(0, prev) + addedForUnread);
            renderTray();
          }
        } else {
          initialSnapshotHandled = true;
        }

        const rawRows = (snapshot.docs || []).map((docSnap) => normalizeMessage(docSnap));
        const rows = await resolveMessageRows(rawRows, convId).catch(() => rawRows);
        if (
          threadState &&
          typeof threadState === 'object' &&
          threadState.streamToken !== streamToken
        ) {
          return;
        }
        updateMessageCache(convId, rows);

        if (threadState && typeof threadState === 'object') {
          threadState.liveConversationId = convId;
          threadState.rows = rows;
          syncReactionListeners({
            conversationId: convId,
            rows,
            reactionUnsubs: threadState.reactionUnsubs,
            reactionData: threadState.reactionData,
            onChange: () => {
              if (threadState.renderQueued) return;
              threadState.renderQueued = true;
              const run = () => {
                threadState.renderQueued = false;
                renderThreadWindowMessages(
                  container,
                  Array.isArray(threadState.rows) ? threadState.rows : [],
                  convId,
                  threadState.reactionData,
                );
              };
              if (typeof windowRef.requestAnimationFrame === 'function') {
                windowRef.requestAnimationFrame(run);
              } else {
                windowRef.setTimeout(run, 16);
              }
            },
          });
        }

        renderThreadWindowMessages(
          container,
          rows,
          convId,
          threadState?.reactionData instanceof Map ? threadState.reactionData : new Map(),
        );
        markConversationRead(convId, messageIdFromRows(rows));
        markConversationDelivered(convId, messageIdFromRows(rows));
      },
      () => {
        if (threadState && typeof threadState === 'object') {
          threadState.liveConversationId = '';
          threadState.streamToken = null;
          clearReactionListeners(threadState.reactionUnsubs, threadState.reactionData);
          threadState.rows = [];
        }
        renderThreadWindowMessages(container, []);
      },
    );
  }

  function setActiveConversation(conversationId) {
    const previousConversationId = String(panelReactionState.conversationId || '').trim();
    const nextConversationId = String(conversationId || '').trim();

    const switchedConversation =
      previousConversationId && previousConversationId !== nextConversationId;
    if (switchedConversation) {
      clearTypingPresence(previousConversationId, { force: true }).catch(() => null);
    }

    if (!nextConversationId) {
      stopMessageStream();
      renderConversationList();
      setView('list');
      setOpenLinks('');
      updateTypingIndicatorsFromConversations();
      return;
    }

    if (previousConversationId === nextConversationId) {
      renderConversationList();
      renderThreadMeta(nextConversationId);
      setView('thread');
      updateTypingIndicatorsFromConversations();
      return;
    }

    renderConversationList();
    renderThreadMeta(nextConversationId);
    setView('thread');
    const cachedRows = getCachedMessages(nextConversationId, { consumePreloaded: true });
    if (Array.isArray(cachedRows) && cachedRows.length) {
      panelReactionState.rows = cachedRows;
      renderMessages(cachedRows, nextConversationId, panelReactionState.reactionData);
    }
    attachMessageStream(nextConversationId);
    markConversationRead(nextConversationId);
    updateTypingIndicatorsFromConversations();
  }

  async function resolveConversationMembers(conversationId) {
    const convId = String(conversationId || '').trim();
    if (!convId) return [];
    const cached = typeof getConversationMeta === 'function' ? getConversationMeta(convId) : null;
    const fromCache = normalizeMembers(cached?.participants || cached?.members);
    if (fromCache.length) return fromCache;

    try {
      const snap = await getDoc(doc(db, 'neuConversations', convId));
      if (!snap.exists()) return [];
      return normalizeMembers(snap.data()?.members);
    } catch {
      return [];
    }
  }

  async function updateUserChatRows({
    conversationId,
    members,
    memberKey,
    lastMessageText,
    senderUid,
    messageId = '',
  }) {
    const convId = String(conversationId || '').trim();
    const normalizedMembers = normalizeMembers(members);
    const currentUid = normalizeUid(senderUid);
    if (!convId || !normalizedMembers.length || !currentUid) return;

    const now = serverTimestamp();
    const batch = writeBatch(db);
    normalizedMembers.forEach((uid) => {
      const otherUid = normalizedMembers.find((candidate) => candidate !== uid) || '';
      const payload = {
        otherUid,
        members: normalizedMembers,
        memberKey,
        lastMessageText,
        lastMessageAt: now,
        lastMessageSenderId: currentUid,
        updatedAt: now,
      };

      if (uid === currentUid) {
        payload.unreadCount = 0;
        payload.lastReadAt = now;
        if (messageId) payload.lastReadMessageId = messageId;
      } else {
        payload.unreadCount = increment(1);
      }

      batch.set(doc(db, 'neuUserChats', uid, 'chats', convId), payload, { merge: true });
    });

    await batch.commit();
  }

  async function sendMessageToConversation(conversationId, text) {
    const convId = String(conversationId || '').trim();
    const safeText = String(text || '').trim().slice(0, 1000);
    const currentUid = normalizeUid(getCurrentUid());
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !safeText || !currentUid) return;

    const members = await resolveConversationMembers(convId);
    if (!members.includes(currentUid)) return;

    const messageRef = doc(collection(db, 'neuConversations', convId, 'messages'));
    const memberKey = memberKeyFor(members[0], members[1]) || convId;
    const now = serverTimestamp();
    const batch = writeBatch(db);
    if (typeof encryptTextMessageForConversation !== 'function') {
      throw new Error('missing-e2ee-message-encryptor');
    }
    const encryptedPayload = await encryptTextMessageForConversation(convId, safeText, members);
    const messageFields = encryptedPayload?.messageFields || null;
    const previewText = String(encryptedPayload?.previewText || '').trim() || '[Encrypted message]';
    if (!messageFields || typeof messageFields !== 'object') {
      throw new Error('invalid-e2ee-message-payload');
    }

    batch.set(messageRef, {
      messageId: messageRef.id,
      senderUid: currentUid,
      senderName: currentName,
      ...messageFields,
      createdAt: now,
    });

    batch.set(
      doc(db, 'neuConversations', convId),
      {
        members,
        memberKey,
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: currentUid,
        lastSenderUid: currentUid,
        updatedAt: now,
      },
      { merge: true },
    );

    await batch.commit();
    await updateUserChatRows({
      conversationId: convId,
      members,
      memberKey,
      lastMessageText: previewText,
      senderUid: currentUid,
      messageId: messageRef.id,
    });
    clearTypingPresence(convId, { force: true }).catch(() => null);
  }

  async function sendAttachmentToConversation(conversationId, file, onProgress = () => {}) {
    const convId = String(conversationId || '').trim();
    const currentUid = normalizeUid(getCurrentUid());
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !(file instanceof File) || !currentUid) return;

    const members = await resolveConversationMembers(convId);
    if (!members.includes(currentUid)) return;

    const uploaded = await uploadAttachmentToStorage(convId, file, onProgress);
    const memberKey = memberKeyFor(members[0], members[1]) || convId;
    const now = serverTimestamp();
    const messageRef = doc(collection(db, 'neuConversations', convId, 'messages'));
    const batch = writeBatch(db);
    const payload = {
      messageId: messageRef.id,
      senderUid: currentUid,
      senderName: currentName,
      type: uploaded.type,
      text: '',
      content: '',
      createdAt: now,
    };

    if (uploaded.type === 'image') {
      payload.imageUrl = uploaded.fileUrl;
      payload.fileUrl = uploaded.fileUrl;
      payload.fileName = uploaded.fileName;
      payload.fileSize = uploaded.fileSize;
    } else {
      payload.fileUrl = uploaded.fileUrl;
      payload.fileName = uploaded.fileName;
      payload.fileSize = uploaded.fileSize;
      if (uploaded.mimeType) payload.mimeType = uploaded.mimeType;
    }

    batch.set(messageRef, payload);

    const previewPrefix = uploaded.type === 'image'
      ? '[Imagen]'
      : uploaded.type === 'audio'
        ? '[Audio]'
        : '[Archivo]';
    const previewText = `${previewPrefix} ${uploaded.fileName}`.trim().slice(0, 180);
    batch.set(
      doc(db, 'neuConversations', convId),
      {
        members,
        memberKey,
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: currentUid,
        lastSenderUid: currentUid,
        updatedAt: now,
      },
      { merge: true },
    );

    await batch.commit();
    await updateUserChatRows({
      conversationId: convId,
      members,
      memberKey,
      lastMessageText: previewText,
      senderUid: currentUid,
      messageId: messageRef.id,
    });
    clearTypingPresence(convId, { force: true }).catch(() => null);
  }

  async function ensureDirectConversationWithUser(targetUid) {
    const currentUid = normalizeUid(getCurrentUid());
    const otherUid = normalizeUid(targetUid);
    if (!currentUid || !otherUid || currentUid === otherUid) return '';

    const key = memberKeyFor(currentUid, otherUid);
    if (!key) return '';

    try {
      const existing = await getDocs(
        query(collection(db, 'neuConversations'), where('memberKey', '==', key), limit(1)),
      );
      if (!existing.empty) return String(existing.docs[0]?.id || '').trim();
    } catch {
      // fall through to deterministic id
    }

    const conversationId = key;
    const now = serverTimestamp();
    const members = [currentUid, otherUid].sort();
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'neuConversations', conversationId),
      {
        members,
        memberKey: key,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      },
      { merge: true },
    );

    members.forEach((uid) => {
      const other = members.find((candidate) => candidate !== uid) || '';
      batch.set(
        doc(db, 'neuUserChats', uid, 'chats', conversationId),
        {
          otherUid: other,
          members,
          memberKey: key,
          unreadCount: 0,
          lastReadAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
    });

    await batch.commit();
    await ensureConversationEncryption(conversationId, members).catch(() => null);
    return conversationId;
  }

  return {
    attachMessageStreamForWindow,
    ensureDirectConversationWithUser,
    sendAttachmentToConversation,
    sendMessageToConversation,
    setActiveConversation,
    stopMessageStream,
  };
}
