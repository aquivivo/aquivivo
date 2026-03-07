export function createMiniChatFirestoreController({
  db,
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  uploadAttachmentToStorage,
  getCurrentUid,
  getCurrentName,
  getActiveConversationId,
  setActiveConversationId,
  panelReactionState,
  renderMessages,
  renderThreadWindowMessages,
  renderConversationList,
  renderThreadMeta,
  setView,
  setOpenLinks,
  markConversationRead,
  clearReactionListeners,
  syncReactionListeners,
  runSafeUnsubscribe,
  clearTypingPresence,
  updateTypingIndicatorsFromConversations,
  getThreadUnread,
  setThreadUnread,
  isThreadMinimized,
  renderTray,
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
  }

  function attachMessageStream(conversationId) {
    stopMessageStream();
    const convId = String(conversationId || '').trim();
    if (!convId) return;

    panelReactionState.conversationId = convId;
    panelReactionState.rows = [];
    panelReactionState.renderQueued = false;

    const messagesQuery = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(120),
    );

    msgUnsub = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const rows = (snapshot.docs || []).map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() || {}),
        }));

        panelReactionState.rows = rows;
        syncReactionListeners({
          conversationId: convId,
          rows,
          reactionUnsubs: panelReactionState.reactionUnsubs,
          reactionData: panelReactionState.reactionData,
          onChange: () => {
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
          },
        });
        renderMessages(rows, convId, panelReactionState.reactionData);
        markConversationRead(convId);
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
    let initialSnapshotHandled = false;

    const messagesQuery = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(120),
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        if (initialSnapshotHandled) {
          const addedForUnread = snapshot.docChanges().reduce((sum, change) => {
            if (change.type !== 'added') return sum;
            const senderId = String(change.doc.data()?.senderId || '').trim();
            if (!senderId || senderId === String(getCurrentUid() || '').trim()) return sum;
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

        const rows = (snapshot.docs || []).map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() || {}),
        }));

        if (threadState && typeof threadState === 'object') {
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
        markConversationRead(convId);
      },
      () => {
        if (threadState && typeof threadState === 'object') {
          clearReactionListeners(threadState.reactionUnsubs, threadState.reactionData);
          threadState.rows = [];
        }
        renderThreadWindowMessages(container, []);
      },
    );
  }

  function setActiveConversation(conversationId) {
    const previousConversationId = String(getActiveConversationId() || '').trim();
    const nextConversationId = String(conversationId || '').trim();
    setActiveConversationId(nextConversationId);

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

    renderConversationList();
    renderThreadMeta(nextConversationId);
    setView('thread');
    attachMessageStream(nextConversationId);
    markConversationRead(nextConversationId);
    updateTypingIndicatorsFromConversations();
  }

  async function sendMessageToConversation(conversationId, text) {
    const convId = String(conversationId || '').trim();
    const safeText = String(text || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !safeText || !currentUid) return;

    await addDoc(collection(db, 'conversations', convId, 'messages'), {
      senderId: currentUid,
      senderName: currentName,
      type: 'text',
      text: safeText,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'conversations', convId), {
      lastMessage: {
        text: safeText.slice(0, 180),
        senderId: currentUid,
        senderName: currentName,
      },
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`reads.${currentUid}`]: serverTimestamp(),
    });
    clearTypingPresence(convId, { force: true }).catch(() => null);
  }

  async function sendAttachmentToConversation(conversationId, file, onProgress = () => {}) {
    const convId = String(conversationId || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    const currentName = String(getCurrentName() || 'Usuario').trim() || 'Usuario';
    if (!convId || !(file instanceof File) || !currentUid) return;

    const uploaded = await uploadAttachmentToStorage(convId, file, onProgress);
    const payload = {
      senderId: currentUid,
      senderName: currentName,
      type: uploaded.type,
      fileUrl: uploaded.fileUrl,
      fileName: uploaded.fileName,
      fileSize: uploaded.fileSize,
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'conversations', convId, 'messages'), payload);
    const previewPrefix = uploaded.type === 'image' ? '[Imagen]' : '[Archivo]';
    const preview = `${previewPrefix} ${uploaded.fileName}`.trim().slice(0, 180);
    await updateDoc(doc(db, 'conversations', convId), {
      lastMessage: {
        text: preview,
        senderId: currentUid,
        senderName: currentName,
      },
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`reads.${currentUid}`]: serverTimestamp(),
    });
    clearTypingPresence(convId, { force: true }).catch(() => null);
  }

  return {
    attachMessageStreamForWindow,
    sendAttachmentToConversation,
    sendMessageToConversation,
    setActiveConversation,
    stopMessageStream,
  };
}
