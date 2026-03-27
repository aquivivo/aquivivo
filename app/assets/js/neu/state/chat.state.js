function resetObject(target, createFn) {
  const next = createFn();
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.assign(target, next);
}

export function createChatState() {
  return {
    initialized: false,
    conversations: new Map(),
    openThreads: new Map(),
    minimizedThreads: new Map(),
    unread: new Map(),
    typing: new Map(),
    activeConversationId: null,
    focusedConversationId: '',
    wired: false,
    meUid: '',
    listRows: [],
    listUnsub: null,
    listUid: '',
    messageUnsub: null,
    messageListenerToken: 0,
    openSeq: 0,
    messageListenerConversationId: '',
    typingUnsub: null,
    currentConversationId: '',
    currentMembers: [],
    currentMemberKey: '',
    peerUid: '',
    activeChatId: '',
    openingConversationId: '',
    forceScrollOnFirstSnapshotConversationId: '',
    hostMode: 'modal',
    dockOpen: false,
    chatRootOpen: false,
    messages: [],
    sending: false,
    uploading: false,
    profileCache: new Map(),
    profileLoading: new Map(),
    listObserver: null,
    totalUnread: 0,
    lastConversationId: '',
    lastPeerUid: '',
    floatWired: false,
    dockLauncherWired: false,
    newMessageChipVisible: false,
    peerTyping: false,
    myLastReadAt: null,
    myLastReadMessageId: '',
    peerLastReadAt: null,
    peerLastReadMessageId: '',
    bodyScrollWired: false,
    bodyScrollRaf: 0,
    nearBottom: true,
    lastRenderedMsgId: '',
    messagesContainerEl: null,
    lastMessageEl: null,
    typingDebounceTimer: 0,
    typingIdleTimer: 0,
    typingActive: false,
    typingConversationId: '',
    reactionUnsubs: new Map(),
    reactionCounts: new Map(),
    reactionMine: new Map(),
    reactionChatId: '',
    reactionPickerMsgId: '',
    reactionHideTimers: new Map(),
    reactionLongPressTimer: 0,
    reactionLongPressMsgId: '',
    pendingImageFile: null,
    pendingImagePreviewUrl: '',
    pageSize: 50,
    isLoadingMore: false,
    hasMore: true,
    oldestDoc: null,
    lastQueryCursor: null,
    loadedCount: 0,
    liveMessages: [],
    olderMessages: [],
    _endHintT: 0,
    replyDraft: null,
    editDraft: null,
    menuMessageId: '',
    menuMessageMeta: null,
    replyHighlightTimer: 0,
    longPressReplyTimer: 0,
    longPressReplyMsgId: '',
    longPressReplyX: 0,
    longPressReplyY: 0,
    longPressMenuMessageId: '',
    uploadRetryContext: null,
    chatSearchWired: false,
    chatSearchQuery: '',
    chatSearchDebounceTimer: 0,
    sharePostDraft: null,
    shareSearchWired: false,
    shareSearchQuery: '',
    shareSearchDebounceTimer: 0,
    shareSending: false,
    markReadInFlight: new Set(),
    markReadBlockedConversations: new Set(),
    markReadAtByConversation: new Map(),
    openReadConversationId: '',
    openReadAt: 0,
    activePresenceConversationId: '',
    activePresenceBlockedConversations: new Set(),
    toastTimer: 0,
    toastLastText: '',
    toastLastAt: 0,
    permissionBlockedActions: new Set(),
    permissionBlockedToasted: new Set(),
    hiddenMessagesByConversation: null,
    attachmentsDisabled: false,
    attachmentsDisableReason: '',
    attachmentsDisabledToasted: false,
    currentConversationMeta: null,
    localMutedConversations: new Set(),
    featureToastShown: new Set(),
    featureDebugLogged: new Set(),
  };
}

export function createNeuChatFloatState() {
  return {
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    suppressClickUntil: 0,
  };
}

export function createNeuDockThreadWindowsState() {
  return {
    order: [],
    minimizedOrder: [],
    windows: new Map(),
  };
}

export function createNeuQaScrollProbeState() {
  return {
    scrollEl: null,
    handler: null,
    lastLogAt: 0,
  };
}

export const chatState = createChatState();
export const neuChatState = chatState;
export const neuChatFloatState = createNeuChatFloatState();
export const neuDockThreadWindowsState = createNeuDockThreadWindowsState();
export const neuQaScrollProbeState = createNeuQaScrollProbeState();

export function resetChatState() {
  resetObject(chatState, createChatState);
  resetObject(neuChatFloatState, createNeuChatFloatState);
  resetObject(neuDockThreadWindowsState, createNeuDockThreadWindowsState);
  resetObject(neuQaScrollProbeState, createNeuQaScrollProbeState);
}

export function init() {
  return {
    chatState,
    neuChatState,
    neuChatFloatState,
    neuDockThreadWindowsState,
    neuQaScrollProbeState,
    resetChatState,
  };
}
