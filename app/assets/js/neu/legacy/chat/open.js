export function createLegacyChatOpenModule(deps) {
  const {
    NEU_CHAT_MARK_READ_DEBOUNCE_MS,
    db,
    doc,
    getDoc,
    neuAfterNextPaint,
    neuBindChatScrollSurface,
    neuCanUseDockHost,
    neuChatAutoGrow,
    neuChatAutoResizeInput,
    neuChatInputNode,
    neuChatMemberKey,
    neuChatScrollBottomAfterPaint,
    neuChatSetHint,
    neuChatState,
    neuChatStopTypingAndTimers,
    neuClearChatAttachment,
    neuClearChatReplyDraft,
    neuClearChatReplyLongPressTimer,
    neuCurrentUid,
    neuEnsureChatProfile,
    neuEnsureChatShellDom,
    neuMarkConversationRead,
    neuMountChatCardForMode,
    neuOpenOrFocusDockThreadWindow,
    neuPositionDockNearFlag,
    neuQaAssertState,
    neuQaTrace,
    neuRenderChatHeader,
    neuRenderChatList,
    neuRenderChatMessages,
    neuResolveChatHostMode,
    neuSetChatDockOpen,
    neuSetChatLongPressMenuOpen,
    neuSetChatModalOpen,
    neuSetInboxPanelOpen,
    neuSetNewMessagesChipVisible,
    neuSetTypingRowVisible,
    neuStartChatMessagesListener,
    neuStartTypingListener,
    neuStopChatMessageListener,
    neuStopReactionListeners,
    neuStopTypingListener,
    neuSyncChatComposerState,
    neuSyncOwnActiveThreadState,
    neuUpdateChatComposerOffsetVar,
  } = deps;

  async function neuOpenConversation(conversationId, seed = {}) {
    const convId = String(conversationId || '').trim();
    const meUid = neuCurrentUid();
    const preferredMode = neuResolveChatHostMode(seed?.mode);
    neuQaTrace('open_conversation_start', {
      convId,
      meUid,
      seedOtherUid: String(seed?.otherUid || '').trim(),
      seedMode: String(seed?.mode || '').trim(),
    });
    if (!convId || !meUid) return;

    if (preferredMode === 'dock' && neuCanUseDockHost()) {
      await neuOpenOrFocusDockThreadWindow(convId, {
        otherUid: String(seed?.otherUid || '').trim(),
        memberKey: String(seed?.memberKey || '').trim(),
        mode: preferredMode,
      });
      return;
    }

    if (!document.getElementById('neuChatModalRoot')) {
      neuEnsureChatShellDom();
    }

    const convRef = doc(db, 'neuConversations', convId);
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      neuQaTrace('open_conversation_missing_doc', { convId });
      neuChatSetHint('Conversacion no encontrada.', true);
      return;
    }

    const data = snap.data() || {};
    const members = Array.isArray(data.members)
      ? data.members.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (!members.includes(meUid)) {
      neuQaTrace('open_conversation_access_denied', { convId, meUid, members });
      neuChatSetHint('Sin acceso a esta conversacion.', true);
      return;
    }

    let resolvedMode = preferredMode;
    if (!neuMountChatCardForMode(preferredMode)) {
      neuMountChatCardForMode('modal');
      resolvedMode = 'modal';
    }
    neuBindChatScrollSurface(true);
    const openSeq = Number(neuChatState.openSeq || 0) + 1;
    neuChatState.openSeq = openSeq;

    if (String(neuChatState.currentConversationId || '').trim() && String(neuChatState.currentConversationId || '').trim() !== convId) {
      neuChatStopTypingAndTimers({ bestEffort: true });
    }
    neuStopChatMessageListener();
    neuStopTypingListener();
    neuStopReactionListeners();
    neuClearChatReplyLongPressTimer();
    neuSetChatLongPressMenuOpen('');
    neuClearChatAttachment();
    neuClearChatReplyDraft();

    const peerUid = String(seed.otherUid || members.find((uid) => uid !== meUid) || '').trim();
    const memberKey = String(data.memberKey || seed.memberKey || neuChatMemberKey(members[0], members[1])).trim();
    const peerReadFromConversation =
      (peerUid && data?.lastReadAtBy && typeof data.lastReadAtBy === 'object' ? data.lastReadAtBy[peerUid] : null) ||
      data?.peerLastReadAt ||
      data?.lastReadAtPeer ||
      null;
    const peerReadMessageFromConversation =
      (peerUid && data?.lastReadMessageIdBy && typeof data.lastReadMessageIdBy === 'object'
        ? data.lastReadMessageIdBy[peerUid]
        : null) ||
      data?.peerLastReadMessageId ||
      data?.lastReadMessageIdPeer ||
      null;
    const myReadFromList = Array.isArray(neuChatState.listRows)
      ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.lastReadAt || null
      : null;
    const peerReadMessageFromList = Array.isArray(neuChatState.listRows)
      ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.peerLastReadMessageId || ''
      : '';

    neuChatState.lastConversationId = convId;
    neuChatState.lastPeerUid = peerUid;
    neuChatState.activeChatId = convId;
    neuChatState.hostMode = resolvedMode;
    neuChatState.currentConversationId = convId;
    neuChatState.activeConversationId = convId;
    neuChatState.currentMembers = members;
    neuChatState.currentMemberKey = memberKey;
    neuChatState.currentConversationMeta = data;
    neuChatState.peerUid = peerUid;
    neuChatState.messages = [];
    neuChatState.openingConversationId = convId;
    neuChatState.forceScrollOnFirstSnapshotConversationId = convId;
    neuChatState.newMessageChipVisible = false;
    neuChatState.peerTyping = false;
    neuChatState.myLastReadAt = myReadFromList;
    neuChatState.myLastReadMessageId = String(
      Array.isArray(neuChatState.listRows)
        ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.lastReadMessageId || ''
        : '',
    ).trim();
    neuChatState.peerLastReadAt = peerReadFromConversation || null;
    neuChatState.peerLastReadMessageId = String(peerReadMessageFromList || peerReadMessageFromConversation || '').trim();
    neuChatState.nearBottom = true;
    neuChatState.lastRenderedMsgId = '';
    neuChatState.typingConversationId = convId;
    neuChatState.typingActive = false;
    neuQaAssertState('conversation_open');
    neuQaTrace('open_conversation_ready', {
      convId,
      hostMode: resolvedMode,
      peerUid,
      memberKey,
    });
    neuSyncOwnActiveThreadState(convId);
    neuChatSetHint('');
    neuRenderChatHeader();
    neuRenderChatMessages();
    neuSetNewMessagesChipVisible(false);
    neuSetTypingRowVisible(false);
    neuSetInboxPanelOpen(resolvedMode === 'inbox');
    neuSetChatDockOpen(resolvedMode === 'dock');
    neuSetChatModalOpen(resolvedMode === 'modal');
    if (resolvedMode === 'dock') neuPositionDockNearFlag();
    neuRenderChatList();
    if (peerUid) await neuEnsureChatProfile(peerUid);
    neuRenderChatHeader();
    const nowMs = Date.now();
    const isFreshSameOpen =
      neuChatState.openReadConversationId === convId &&
      nowMs - Number(neuChatState.openReadAt || 0) < NEU_CHAT_MARK_READ_DEBOUNCE_MS;
    if (!isFreshSameOpen) {
      neuChatState.openReadConversationId = convId;
      neuChatState.openReadAt = nowMs;
    }
    neuMarkConversationRead(convId, {
      members,
      peerUid,
      force: !isFreshSameOpen,
    }).catch(() => null);
    neuStartChatMessagesListener(convId, members, { openSeq });
    neuStartTypingListener(convId, members);
    neuAfterNextPaint(() => {
      if (String(neuChatState.currentConversationId || '').trim() !== convId) return;
      if (Number(neuChatState.openSeq || 0) !== openSeq) return;
      neuChatScrollBottomAfterPaint('auto', { conversationId: convId, openSeq, force: true });
      neuSyncChatComposerState();
      neuChatAutoResizeInput();
      const input = neuChatInputNode();
      if (input instanceof HTMLTextAreaElement) {
        neuChatAutoGrow(input);
        input.focus({ preventScroll: true });
      } else if (input instanceof HTMLInputElement) {
        input.focus({ preventScroll: true });
      }
      neuUpdateChatComposerOffsetVar();
    });
  }

  return {
    neuOpenConversation,
  };
}
