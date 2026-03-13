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

function isRecoverableE2eeSendError(error) {
  const name = String(error?.name || '').trim().toLowerCase();
  const message = String(error?.message || '').trim().toLowerCase();
  const raw = String(error || '').trim().toLowerCase();

  // WebCrypto DOMException cases should not block sending in MVP mode.
  if (
    name === 'operationerror' ||
    name === 'dataerror' ||
    name === 'invalidaccesserror' ||
    name === 'invalidstateerror' ||
    name === 'notsupportederror' ||
    name === 'notallowederror'
  ) {
    return true;
  }
  if (
    message.includes('operationerror') ||
    message.includes('dataerror') ||
    raw.includes('operationerror') ||
    raw.includes('dataerror')
  ) {
    return true;
  }

  // Missing or not-wired encryptor should degrade to plaintext.
  if (message === 'missing-e2ee-message-encryptor') return true;
  if (
    name === 'typeerror' &&
    (message.includes('encrypttextmessageforconversation') || raw.includes('encrypttextmessageforconversation')) &&
    raw.includes('not a function')
  ) {
    return true;
  }

  const hint = message || raw;
  return (
    hint.startsWith('missing-public-key:') ||
    hint === 'conversation-key-missing' ||
    hint === 'conversation-key-missing-for-user' ||
    hint === 'e2ee-unavailable'
  );
}

function createPlainTextMessagePayload(text) {
  const safeText = String(text || '').trim();
  return {
    messageFields: {
      type: 'text',
      encrypted: false,
      text: safeText,
      content: '',
    },
    previewText: safeText,
    mode: 'plaintext',
  };
}

const E2EE_FALLBACK_EVENT = 'neu-chat:e2ee-fallback';
const e2eeFallbackLogAt = new Map();

function e2eeFallbackReason(error) {
  const name = String(error?.name || '').trim();
  const message = String(error?.message || error || '').trim();
  if (name && message) return `${name}: ${message}`.slice(0, 240);
  return (name || message || 'unknown-e2ee-error').slice(0, 240);
}

function reportE2eeFallback(windowRef, detail = {}) {
  const payload = {
    reason: String(detail?.reason || 'unknown-e2ee-error').trim().slice(0, 240),
    stage: String(detail?.stage || 'send').trim().slice(0, 80) || 'send',
    conversationId: String(detail?.conversationId || '').trim().slice(0, 160),
    at: Date.now(),
  };
  const key = `${payload.stage}|${payload.reason}`;
  const now = payload.at;
  const lastAt = Number(e2eeFallbackLogAt.get(key) || 0);
  if (!lastAt || now - lastAt >= 30_000) {
    e2eeFallbackLogAt.set(key, now);
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[mini-chat-v4] E2EE fallback used', payload);
    }
  }

  const target = windowRef && typeof windowRef.dispatchEvent === 'function' ? windowRef : null;
  if (!target || typeof CustomEvent !== 'function') return;
  try {
    target.dispatchEvent(new CustomEvent(E2EE_FALLBACK_EVENT, { detail: payload }));
  } catch {
    // ignore unsupported environments
  }
}

function rowsFromSnapshot(snapshot, { descending = false } = {}) {
  const rows = (snapshot?.docs || []).map((docSnap) => normalizeMessage(docSnap));
  if (descending) rows.reverse();
  return rows;
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
    deleted: data.deleted === true,
    deletedAt: data.deletedAt || null,
    deletedBy: normalizeUid(data.deletedBy),
    editedAt: data.editedAt || null,
    replyToMessageId: String(data.replyToMessageId || '').trim(),
    replyToSenderId: normalizeUid(data.replyToSenderId),
    replyToSenderName: String(data.replyToSenderName || '').trim(),
    replyToText: String(data.replyToText || '').trim(),
    replyToType: String(data.replyToType || '').trim().toLowerCase(),
    createdAt: data.createdAt || null,
  };
}

export function createMiniChatFirestoreController({
  db,
  collection,
  deleteDoc,
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
  resolveConversationRow = () => null,
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

  async function resolveTextMessagePayload(conversationId, text, members = []) {
    const safeText = String(text || '').trim();
    const plainPayload = createPlainTextMessagePayload(safeText);
    if (typeof encryptTextMessageForConversation !== 'function') {
      reportE2eeFallback(windowRef, {
        stage: 'encryptor-missing',
        reason: 'missing-e2ee-message-encryptor',
        conversationId,
      });
      return plainPayload;
    }

    try {
      const encryptedPayload = await encryptTextMessageForConversation(conversationId, safeText, members);
      const messageFields = encryptedPayload?.messageFields;
      if (!messageFields || typeof messageFields !== 'object') {
        reportE2eeFallback(windowRef, {
          stage: 'invalid-payload',
          reason: 'invalid-e2ee-message-payload',
          conversationId,
        });
        return plainPayload;
      }
      return {
        messageFields,
        previewText: String(encryptedPayload?.previewText || '').trim() || plainPayload.previewText,
        mode: String(encryptedPayload?.mode || '').trim() || 'encrypted',
      };
    } catch (error) {
      if (!isRecoverableE2eeSendError(error)) throw error;
      reportE2eeFallback(windowRef, {
        stage: 'recoverable-error',
        reason: e2eeFallbackReason(error),
        conversationId,
      });
      return plainPayload;
    }
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
      orderBy('createdAt', 'desc'),
      limit(120),
    );

    msgUnsub = onSnapshot(
      messagesQuery,
      async (snapshot) => {
        const rawRows = rowsFromSnapshot(snapshot, { descending: true });
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
      orderBy('createdAt', 'desc'),
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

        const rawRows = rowsFromSnapshot(snapshot, { descending: true });
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

  function previewTextFromMessage(message = {}) {
    if (message?.deleted === true) return '[Mensaje eliminado]';
    const type = String(message?.type || '').trim().toLowerCase();
    if (type === 'image') return '[Imagen]';
    if (type === 'audio') return '[Audio]';
    if (type === 'file') return '[Archivo]';
    const text = String(message?.text || '').trim();
    if (text) return text.slice(0, 180);
    return 'Sin mensajes';
  }

  async function syncConversationPreviewFromLatestMessage(conversationId, members = []) {
    const convId = String(conversationId || '').trim();
    if (!convId) return;
    const conversationMembers = normalizeMembers(
      Array.isArray(members) && members.length
        ? members
        : await resolveConversationMembers(convId),
    );
    if (!conversationMembers.length) return;

    const latestSnapshot = await getDocs(
      query(
        collection(db, 'neuConversations', convId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(1),
      ),
    );

    let latestMessage = null;
    if (!latestSnapshot.empty) {
      const rawRows = latestSnapshot.docs.map((docSnap) => normalizeMessage(docSnap));
      const resolvedRows = await resolveMessageRows(rawRows, convId).catch(() => rawRows);
      latestMessage = Array.isArray(resolvedRows) && resolvedRows.length ? resolvedRows[0] : null;
    }

    const previewText = latestMessage ? previewTextFromMessage(latestMessage) : '';
    const lastMessageAt = latestMessage?.createdAt || serverTimestamp();
    const lastMessageSenderId = normalizeUid(latestMessage?.senderId || '');
    const memberKey = memberKeyFor(conversationMembers[0], conversationMembers[1]) || convId;
    const basePayload = {
      updatedAt: serverTimestamp(),
      lastMessageAt,
      lastMessageText: previewText,
    };
    if (lastMessageSenderId) {
      basePayload.lastMessageSenderId = lastMessageSenderId;
      basePayload.lastSenderUid = lastMessageSenderId;
    } else {
      basePayload.lastMessageSenderId = '';
      basePayload.lastSenderUid = '';
    }

    await setDoc(doc(db, 'neuConversations', convId), {
      members: conversationMembers,
      memberKey,
      ...basePayload,
    }, { merge: true });

    const batch = writeBatch(db);
    conversationMembers.forEach((uid) => {
      batch.set(doc(db, 'neuUserChats', uid, 'chats', convId), {
        members: conversationMembers,
        otherUid: conversationMembers.find((candidate) => candidate !== uid) || '',
        memberKey,
        ...basePayload,
      }, { merge: true });
    });
    await batch.commit();
  }

  function shouldRetrySendWithoutReply(error) {
    const code = String(error?.code || '').trim().toLowerCase();
    if (code === 'permission-denied' || code === 'invalid-argument' || code === 'failed-precondition') {
      return true;
    }
    const message = String(error?.message || '').trim().toLowerCase();
    return message.includes('reply');
  }

  async function sendMessageToConversation(conversationId, text, options = {}) {
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
    const encryptedPayload = await resolveTextMessagePayload(convId, safeText, members);
    const messageFields = encryptedPayload?.messageFields || createPlainTextMessagePayload(safeText).messageFields;
    const previewText = String(encryptedPayload?.previewText || '').trim() || safeText;

    const replyPayload = options?.replyTo && typeof options.replyTo === 'object'
      ? {
          replyToMessageId: String(options.replyTo.id || '').trim(),
          replyToSenderId: normalizeUid(options.replyTo.senderId),
          replyToSenderName: String(options.replyTo.senderName || '').trim(),
          replyToText: String(options.replyTo.text || '').trim().slice(0, 220),
          replyToType: String(options.replyTo.type || 'text').trim().toLowerCase() || 'text',
        }
      : null;
    const hasReplyPayload = !!(
      replyPayload &&
      (
        replyPayload.replyToMessageId ||
        replyPayload.replyToSenderId ||
        replyPayload.replyToSenderName ||
        replyPayload.replyToText
      )
    );

    const commitMessage = async (includeReply = false) => {
      const batch = writeBatch(db);
      batch.set(messageRef, {
        messageId: messageRef.id,
        senderUid: currentUid,
        senderName: currentName,
        ...messageFields,
        ...(includeReply && replyPayload ? replyPayload : {}),
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
    };

    try {
      await commitMessage(hasReplyPayload);
    } catch (error) {
      if (!hasReplyPayload || !shouldRetrySendWithoutReply(error)) {
        throw error;
      }
      await commitMessage(false);
    }

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

  async function editMessage(conversationId, messageId, text) {
    const convId = String(conversationId || '').trim();
    const msgId = String(messageId || '').trim();
    const safeText = String(text || '').trim().slice(0, 1000);
    const currentUid = normalizeUid(getCurrentUid());
    if (!convId || !msgId || !safeText || !currentUid) return;

    const messageRef = doc(db, 'neuConversations', convId, 'messages', msgId);
    const messageSnap = await getDoc(messageRef);
    if (!messageSnap.exists()) return;

    const messageData = messageSnap.data() || {};
    const senderUid = normalizeUid(messageData.senderUid || messageData.senderId);
    if (senderUid !== currentUid) return;

    const members = await resolveConversationMembers(convId);
    const encryptedPayload = await resolveTextMessagePayload(convId, safeText, members);
    const messageFields = encryptedPayload?.messageFields || createPlainTextMessagePayload(safeText).messageFields;

    await updateDoc(messageRef, {
      ...messageFields,
      editedAt: serverTimestamp(),
      deleted: false,
      deletedAt: null,
      deletedBy: '',
    });
    await syncConversationPreviewFromLatestMessage(convId, members);
  }

  async function deleteMessage(conversationId, messageId) {
    const convId = String(conversationId || '').trim();
    const msgId = String(messageId || '').trim();
    const currentUid = normalizeUid(getCurrentUid());
    if (!convId || !msgId || !currentUid) return;

    const messageRef = doc(db, 'neuConversations', convId, 'messages', msgId);
    const messageSnap = await getDoc(messageRef);
    if (!messageSnap.exists()) return;

    const messageData = messageSnap.data() || {};
    const senderUid = normalizeUid(messageData.senderUid || messageData.senderId);
    if (senderUid !== currentUid) return;

    await updateDoc(messageRef, {
      type: 'text',
      encrypted: false,
      text: '',
      content: '',
      imageUrl: '',
      fileUrl: '',
      fileName: '',
      fileSize: 0,
      mimeType: '',
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: currentUid,
      editedAt: serverTimestamp(),
    });
    await syncConversationPreviewFromLatestMessage(convId);
  }

  async function setConversationArchived(conversationId, archived = true) {
    const convId = String(conversationId || '').trim();
    const currentUid = normalizeUid(getCurrentUid());
    if (!convId || !currentUid) return;
    await setDoc(doc(db, 'neuUserChats', currentUid, 'chats', convId), {
      archivedAt: archived ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function deleteConversationForCurrentUser(conversationId) {
    const convId = String(conversationId || '').trim();
    const currentUid = normalizeUid(getCurrentUid());
    if (!convId || !currentUid) return;
    await deleteDoc(doc(db, 'neuUserChats', currentUid, 'chats', convId));
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
    deleteConversationForCurrentUser,
    deleteMessage,
    editMessage,
    ensureDirectConversationWithUser,
    setConversationArchived,
    sendAttachmentToConversation,
    sendMessageToConversation,
    setActiveConversation,
    stopMessageStream,
  };
}
