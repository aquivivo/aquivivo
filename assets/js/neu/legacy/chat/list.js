export function createLegacyChatListModule(deps) {
  const {
    NEU_CHAT_SEARCH_DEBOUNCE_MS,
    NEU_DOCK_INBOX_WINDOW_ID,
    collection,
    db,
    esc,
    isDisabled,
    limit,
    neuAvatarLetter,
    neuChatFilteredRows,
    neuChatHandlePermissionDenied,
    neuChatHighlightName,
    neuChatProfileCached,
    neuChatShareModalNode,
    neuChatShareSearchInputNode,
    neuChatState,
    neuCurrentUid,
    neuDockInboxSearchNode,
    neuDockThreadWindowsState,
    neuEnsureChatProfile,
    neuEnsureHandle,
    neuFormatAgoShort,
    neuInboxListNode,
    neuIsChatRootOpen,
    neuMapUserChatRow,
    neuRenderChatMessages,
    neuRenderDockBubbleTray,
    neuRenderDockInboxList,
    neuRenderSharePostChatList,
    neuSocialAppHref,
    neuSortChatRows,
    neuStopChatListListener,
    neuSyncChatHostSurface,
    neuSyncUnreadUi,
    neuUnreadBadgeLabel,
    neuUnreadValue,
    neuQueueShareChatSearch,
    onSnapshot,
    orderBy,
    query,
  } = deps;

  function neuApplyChatSearchQuery(rawValue) {
    if (neuChatState.chatSearchDebounceTimer) {
      window.clearTimeout(neuChatState.chatSearchDebounceTimer);
      neuChatState.chatSearchDebounceTimer = 0;
    }
    const next = String(rawValue || '').trim();
    if (next === neuChatState.chatSearchQuery) return;
    neuChatState.chatSearchQuery = next;
    neuSyncChatSearchInputs();
    neuRenderChatList();
  }

  function neuQueueChatSearch(rawValue) {
    if (neuChatState.chatSearchDebounceTimer) {
      window.clearTimeout(neuChatState.chatSearchDebounceTimer);
      neuChatState.chatSearchDebounceTimer = 0;
    }
    const next = String(rawValue || '');
    neuChatState.chatSearchDebounceTimer = window.setTimeout(() => {
      neuChatState.chatSearchDebounceTimer = 0;
      neuApplyChatSearchQuery(next);
    }, NEU_CHAT_SEARCH_DEBOUNCE_MS);
  }

  function neuChatSearchInputNodes() {
    const nodes = [neuDockInboxSearchNode(), document.getElementById('neuInboxSearch'), document.getElementById('pulseChatSearchInput')];
    const uniq = [];
    nodes.forEach((node) => {
      if (!(node instanceof HTMLInputElement)) return;
      if (uniq.includes(node)) return;
      uniq.push(node);
    });
    return uniq;
  }

  function neuSyncChatSearchInputs() {
    const value = String(neuChatState.chatSearchQuery || '');
    neuChatSearchInputNodes().forEach((input) => {
      if (input.value !== value) input.value = value;
    });
  }

  function neuWireChatSearchInput() {
    const inputs = neuChatSearchInputNodes();
    if (!inputs.length) return;
    inputs.forEach((input) => {
      if (input.dataset.neuChatSearchWired === '1') return;
      input.dataset.neuChatSearchWired = '1';
      input.addEventListener('input', () => {
        neuQueueChatSearch(input.value);
      });
    });
    neuChatState.chatSearchWired = true;
    neuSyncChatSearchInputs();
  }

  function neuWireShareChatSearchInput() {
    if (neuChatState.shareSearchWired) return;
    const input = neuChatShareSearchInputNode();
    if (!(input instanceof HTMLInputElement)) return;
    neuChatState.shareSearchWired = true;
    input.addEventListener('input', () => {
      neuQueueShareChatSearch(input.value);
    });
  }

  function neuRenderChatList() {
    neuSyncChatHostSurface();
    const root = neuInboxListNode();
    if (!(root instanceof HTMLElement)) {
      const dockInboxState = neuDockThreadWindowsState.windows.get(NEU_DOCK_INBOX_WINDOW_ID);
      if (dockInboxState) neuRenderDockInboxList(dockInboxState);
      neuRenderDockBubbleTray();
      return;
    }

    const allRows = neuSortChatRows(Array.isArray(neuChatState.listRows) ? neuChatState.listRows : []);
    const searchQuery = String(neuChatState.chatSearchQuery || '').trim();
    const rows = neuChatFilteredRows(allRows, searchQuery);
    if (!rows.length) {
      const isSearching = !!searchQuery;
      const title = isSearching ? 'Sin resultados.' : 'Sin conversaciones.';
      const sub = isSearching
        ? 'Prueba otro texto o borra el filtro.'
        : 'Abre un perfil y pulsa "Mensaje" para iniciar chat.';
      root.dataset.neuChatRendering = '1';
      root.innerHTML = `
        <div class="empty-state neu-chat-empty-state" data-neu-chat-root="1">
          <p class="neu-chat-empty-title">${esc(title)}</p>
          <p class="neu-chat-empty-sub">${esc(sub)}</p>
          <a class="btn-white-outline neu-chat-empty-cta" href="${neuSocialAppHref({ portal: 'feed' })}">Ir al feed</a>
        </div>
      `;
      delete root.dataset.neuChatRendering;
      const dockInboxState = neuDockThreadWindowsState.windows.get(NEU_DOCK_INBOX_WINDOW_ID);
      if (dockInboxState) neuRenderDockInboxList(dockInboxState);
      neuRenderDockBubbleTray();
      return;
    }

    const html = rows
      .map((row) => {
        const profile = neuChatProfileCached(row.otherUid);
        const displayName = String(profile.displayName || '').trim() || 'Usuario';
        const handle = neuEnsureHandle(profile.handle, displayName, row.otherUid);
        const titleHtml = neuChatHighlightName(displayName, searchQuery);
        const avatarUrl = String(profile.avatarUrl || '').trim();
        const lastText = row.lastMessagePreview || row.lastMessageText || 'Sin mensajes todavia';
        const lastSenderId = String(row.lastMessageSenderId || row.lastSenderUid || '').trim();
        let lastSenderLabel = '';
        if (lastSenderId) {
          if (lastSenderId === neuCurrentUid()) lastSenderLabel = 'Tu';
          else if (lastSenderId === String(row.otherUid || '').trim()) lastSenderLabel = displayName;
          else lastSenderLabel = lastSenderId.slice(0, 8);
        }
        const previewLine = lastSenderLabel ? `${lastSenderLabel}: ${lastText}` : lastText;
        const timeLabel = row.lastMessageAt ? neuFormatAgoShort(row.lastMessageAt) : '';
        const online = profile?.isOnline === true || profile?.online === true;
        const unread = neuUnreadValue(row.unreadCount);
        const unreadLabel = neuUnreadBadgeLabel(unread);
        const unreadBadge = unreadLabel
          ? `<span class="neu-unread-badge neu-chat-unread-badge" aria-label="${esc(`Sin leer: ${unread}`)}">${esc(unreadLabel)}</span>`
          : '';
        const avatarHtml = avatarUrl
          ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
          : `<span>${esc(neuAvatarLetter(displayName))}</span>`;
        const pinned = row.pinned === true;
        const activeConversationId = String(neuChatState.currentConversationId || neuChatState.activeChatId || '').trim();
        const isActive = activeConversationId && activeConversationId === String(row.conversationId || '').trim();

        return `
          <div class="neuInboxItemWrap neu-chat-item-wrap${pinned ? ' is-pinned' : ''}">
            <button
              class="neuInboxItem neu-chat-item${unread > 0 ? ' is-unread' : ''}${isActive ? ' is-active' : ''}"
              type="button"
              data-neu-chat-open="${esc(row.conversationId)}"
              data-neu-chat-other="${esc(row.otherUid)}"
            >
              <span class="avatar-frame neu-chat-avatar">${avatarHtml}<span class="neuInboxOnlineDot${online ? ' is-online' : ''}"></span></span>
              <span class="neuInboxCopy neu-chat-copy">
                <span class="neuInboxTop">
                  <span class="neuInboxName neu-chat-title">${titleHtml} <small>${esc(handle)}</small></span>
                  <span class="neuInboxTime neu-chat-time">${esc(timeLabel)}</span>
                </span>
                <span class="neuInboxPreview neu-chat-last">${esc(previewLine)}</span>
              </span>
            </button>
            ${
              pinned
                ? `<button
                    class="btn-white-outline neu-chat-pin-btn is-pinned"
                    type="button"
                    data-neu-chat-pin="${esc(row.conversationId)}"
                    aria-label="Quitar pin"
                    title="Quitar pin"
                  >??</button>`
                : ''
            }
            ${unreadBadge ? `<span class="neuInboxUnread">${unreadBadge}</span>` : ''}
          </div>
        `;
      })
      .join('');

    root.dataset.neuChatRendering = '1';
    root.innerHTML = `<div class="neu-chat-list" data-neu-chat-root="1">${html}</div>`;
    delete root.dataset.neuChatRendering;

    rows.forEach((row) => {
      if (row.otherUid) neuEnsureChatProfile(row.otherUid).catch(() => null);
    });

    const dockInboxState = neuDockThreadWindowsState.windows.get(NEU_DOCK_INBOX_WINDOW_ID);
    if (dockInboxState) neuRenderDockInboxList(dockInboxState);
    neuRenderDockBubbleTray();
  }

  function neuWireChatListGuard() {
    if (isDisabled('observers')) return;
    if (neuChatState.listObserver instanceof MutationObserver) return;
    const root = neuInboxListNode();
    if (!(root instanceof HTMLElement)) return;

    neuChatState.listObserver = new MutationObserver(() => {
      if (root.dataset.neuChatRendering === '1') return;
      if (root.querySelector('[data-neu-chat-root="1"]')) return;
      window.setTimeout(() => {
        neuRenderChatList();
      }, 0);
    });

    neuChatState.listObserver.observe(root, { childList: true });
  }

  function neuStartChatListListener(meUid) {
    const uid = String(meUid || '').trim();
    if (!uid) return;
    if (neuChatState.listUid === uid && typeof neuChatState.listUnsub === 'function') return;
    neuStopChatListListener();

    const q = query(collection(db, 'neuUserChats', uid, 'chats'), orderBy('lastMessageAt', 'desc'), limit(80));
    neuChatState.listUnsub = onSnapshot(
      q,
      (snap) => {
        neuChatState.listRows = neuSortChatRows(snap.docs.map((row) => neuMapUserChatRow(row, uid)));
        const activeConvId = String(neuChatState.currentConversationId || '').trim();
        if (activeConvId) {
          const activeRow = neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === activeConvId) || null;
          neuChatState.myLastReadAt = activeRow?.lastReadAt || null;
          neuChatState.myLastReadMessageId = String(activeRow?.lastReadMessageId || '').trim();
          neuChatState.peerLastReadAt = activeRow?.peerLastReadAt || null;
          neuChatState.peerLastReadMessageId = String(activeRow?.peerLastReadMessageId || '').trim();
          const inboxActive = String(neuChatState.hostMode || '').trim() === 'inbox';
          const dockActive = String(neuChatState.hostMode || '').trim() === 'dock';
          if (neuIsChatRootOpen() || inboxActive || dockActive) {
            neuRenderChatMessages();
          }
        }
        neuSyncUnreadUi();
        neuRenderChatList();
        const shareModal = neuChatShareModalNode();
        if (shareModal instanceof HTMLElement && !shareModal.hidden) {
          neuRenderSharePostChatList();
        }
      },
      (error) => {
        if (neuChatHandlePermissionDenied(error, 'inbox_list', uid, 'Sin permisos para cargar el inbox.')) {
          neuStopChatListListener();
          neuChatState.listRows = [];
          neuSyncUnreadUi();
          neuRenderChatList();
          return;
        }
        console.error('[neu-chat] list subscription failed', error);
        neuChatState.listRows = [];
        neuSyncUnreadUi();
        neuRenderChatList();
      },
    );
    neuChatState.listUid = uid;
  }

  return {
    neuWireChatSearchInput,
    neuWireShareChatSearchInput,
    neuRenderChatList,
    neuWireChatListGuard,
    neuStartChatListListener,
  };
}
