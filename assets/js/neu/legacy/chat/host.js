export function createLegacyChatHostModule(deps) {
  const {
    NEU_DOCK_INBOX_WINDOW_ID,
    neuCanUseDockHost,
    neuCanUseInboxHost,
    neuChatModalNode,
    neuChatState,
    neuDockStoredConversationIds,
    neuDockThreadWindowsState,
    neuMountChatCardForMode,
    neuOpenDockInboxWindow,
    neuOpenOrFocusDockThreadWindow,
    neuSetChatDockOpen,
    neuSetChatRootOpen,
    neuSetInboxPanelOpen,
  } = deps;

  function neuSyncChatHostSurface() {
    if (neuCanUseDockHost()) {
      neuChatState.hostMode = 'dock';
      neuMountChatCardForMode('dock');
      neuSetInboxPanelOpen(false);
      neuSetChatDockOpen(neuChatState.dockOpen === true, { persist: false });
      return;
    }

    if (neuCanUseInboxHost()) {
      neuChatState.hostMode = 'inbox';
      neuMountChatCardForMode('inbox');
      neuSetInboxPanelOpen(!!String(neuChatState.currentConversationId || '').trim());
      neuSetChatDockOpen(false, { persist: false });
      return;
    }

    neuChatState.hostMode = 'modal';
    neuMountChatCardForMode('modal');
    neuSetInboxPanelOpen(false);
    neuSetChatDockOpen(false, { persist: false });
  }

  function neuRestorePersistedDockWindows() {
    if (!neuCanUseDockHost()) return;
    const conversationIds = neuDockStoredConversationIds();
    if (!conversationIds.length) return;
    conversationIds.forEach((conversationId) => {
      const convId = String(conversationId || '').trim();
      if (!convId) return;
      if (neuDockThreadWindowsState.windows.has(convId)) return;
      if (convId === NEU_DOCK_INBOX_WINDOW_ID) {
        neuOpenDockInboxWindow();
        return;
      }
      neuOpenOrFocusDockThreadWindow(convId).catch(() => null);
    });
  }

  function neuChatRecomputeModalLock() {
    const hasOpenModal = Array.from(document.querySelectorAll('.composer-modal')).some(
      (node) => node instanceof HTMLElement && !node.hidden,
    );
    document.body.classList.toggle('modal-open', hasOpenModal);
  }

  function neuSetChatModalOpen(open) {
    const modal = neuChatModalNode();
    if (modal instanceof HTMLElement) modal.hidden = true;
    const mode = String(neuChatState.hostMode || '').trim();
    if (mode === 'inbox' || mode === 'dock') {
      neuChatRecomputeModalLock();
      return;
    }
    neuSetChatRootOpen(open === true, 'modal');
    neuChatRecomputeModalLock();
  }

  return {
    neuSyncChatHostSurface,
    neuRestorePersistedDockWindows,
    neuChatRecomputeModalLock,
    neuSetChatModalOpen,
  };
}
