export function createLegacyChatLauncherModule(deps) {
  const {
    NEU_CHAT_DOCK_OPEN_STORAGE_KEY,
    NEU_CHAT_FLOAT_STORAGE_KEY,
    NEU_CHAT_LAUNCHER_STORAGE_KEY,
    neuCanUseDockHost,
    neuChatFloatNode,
    neuChatFloatState,
    neuChatInputNode,
    neuChatModalCardNode,
    neuChatModalNode,
    neuChatRootNode,
    neuChatSetHint,
    neuChatState,
    neuDockInboxSearchNode,
    neuDockThreadWindowsState,
    neuFocusDockThreadWindow,
    neuInboxChatHostNode,
    neuInboxSearchNode,
    neuMountChatCardForMode,
    neuOpenConversation,
    neuOpenDockInboxWindow,
    neuPositionDockNearFlag,
    neuRenderChatList,
    neuRestoreDockThreadWindow,
    neuSetChatDockOpen,
    neuSetInboxPanelOpen,
    neuSetTypingRowVisible,
    neuUpdateChatComposerOffsetVar,
    openPulsePortal,
  } = deps;

  function neuEnsureChatModalLayoutClass() {
    const card = neuChatModalCardNode();
    if (card instanceof HTMLElement) card.classList.add('neuChatModalContent');
  }

  function neuChatReadFloatPosition() {
    try {
      let raw = localStorage.getItem(NEU_CHAT_LAUNCHER_STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(NEU_CHAT_FLOAT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const side = String(parsed?.side || '').trim().toLowerCase();
      const top = Number(parsed?.top ?? parsed?.y);
      if ((side !== 'left' && side !== 'right') || !Number.isFinite(top)) return null;
      return { side, top };
    } catch {
      return null;
    }
  }

  function neuChatSaveFloatPosition(side, top) {
    try {
      localStorage.setItem(
        NEU_CHAT_LAUNCHER_STORAGE_KEY,
        JSON.stringify({
          side: side === 'left' ? 'left' : 'right',
          top: Math.round(Number(top) || 0),
        }),
      );
    } catch {
      // ignore storage errors
    }
  }

  function neuChatReadDockOpenPreference() {
    try {
      const raw = localStorage.getItem(NEU_CHAT_DOCK_OPEN_STORAGE_KEY);
      if (raw === '1') return true;
      if (raw === '0') return false;
      return null;
    } catch {
      return null;
    }
  }

  function neuChatSaveDockOpenPreference(open) {
    try {
      localStorage.setItem(NEU_CHAT_DOCK_OPEN_STORAGE_KEY, open === true ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }

  function neuClampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function neuChatFloatMetrics(flag) {
    const margin = 16;
    const width = Math.max(56, Math.round(flag?.offsetWidth || 76));
    const height = Math.max(44, Math.round(flag?.offsetHeight || 56));
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);
    return { margin, width, height, maxX, maxY };
  }

  function neuApplyFloatRawPosition(x, y) {
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return;
    const metrics = neuChatFloatMetrics(flag);
    const nextX = neuClampNumber(x, metrics.margin, metrics.maxX);
    const nextY = neuClampNumber(y, metrics.margin, metrics.maxY);
    const side = nextX + metrics.width / 2 < window.innerWidth / 2 ? 'left' : 'right';

    flag.style.left = `${Math.round(nextX)}px`;
    flag.style.top = `${Math.round(nextY)}px`;
    flag.style.right = 'auto';
    flag.style.bottom = 'auto';
    flag.classList.toggle('is-left', side === 'left');
    neuPositionDockNearFlag();
  }

  function neuApplyFloatSnapped(side = 'right', y = 96, persist = false) {
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return;
    const metrics = neuChatFloatMetrics(flag);
    const resolvedSide = side === 'left' ? 'left' : 'right';
    const nextY = neuClampNumber(y, metrics.margin, metrics.maxY);
    const nextX = resolvedSide === 'left' ? metrics.margin : metrics.maxX;

    flag.style.left = `${Math.round(nextX)}px`;
    flag.style.top = `${Math.round(nextY)}px`;
    flag.style.right = 'auto';
    flag.style.bottom = 'auto';
    flag.classList.toggle('is-left', resolvedSide === 'left');

    if (persist) neuChatSaveFloatPosition(resolvedSide, nextY);
    neuPositionDockNearFlag();
  }

  function neuDefaultFloatY() {
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return 96;
    const metrics = neuChatFloatMetrics(flag);
    const fromBottom = window.innerHeight - metrics.height - 96;
    return neuClampNumber(fromBottom, metrics.margin, metrics.maxY);
  }

  function neuFloatStartDrag(clientX, clientY) {
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return;
    const rect = flag.getBoundingClientRect();
    neuChatFloatState.dragging = true;
    neuChatFloatState.moved = false;
    neuChatFloatState.startX = clientX;
    neuChatFloatState.startY = clientY;
    neuChatFloatState.originX = rect.left;
    neuChatFloatState.originY = rect.top;
    flag.classList.add('is-dragging');
  }

  function neuFloatMoveDrag(clientX, clientY) {
    if (!neuChatFloatState.dragging) return;
    const dx = clientX - neuChatFloatState.startX;
    const dy = clientY - neuChatFloatState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      neuChatFloatState.moved = true;
    }
    neuApplyFloatRawPosition(neuChatFloatState.originX + dx, neuChatFloatState.originY + dy);
  }

  function neuFloatEndDrag() {
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return;
    if (!neuChatFloatState.dragging) return;

    neuChatFloatState.dragging = false;
    flag.classList.remove('is-dragging');

    const rect = flag.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    neuApplyFloatSnapped(side, rect.top, true);
    if (neuChatFloatState.moved) {
      neuChatFloatState.suppressClickUntil = Date.now() + 260;
    }
  }

  async function neuOpenChatFromFloatFlag() {
    const openDockWindowId = [...neuDockThreadWindowsState.order]
      .reverse()
      .find((id) => {
        const state = neuDockThreadWindowsState.windows.get(id);
        return !!state?.windowEl;
      });
    if (openDockWindowId) {
      const state = neuDockThreadWindowsState.windows.get(openDockWindowId);
      if (state?.minimized) {
        neuRestoreDockThreadWindow(openDockWindowId, { focus: true });
        return;
      }
      neuFocusDockThreadWindow(state);
      if (state?.inputEl instanceof HTMLTextAreaElement) {
        state.inputEl.focus({ preventScroll: true });
      }
      return;
    }

    const root = neuChatRootNode();
    if (root instanceof HTMLElement && !root.classList.contains('hidden') && root.classList.contains('is-open')) {
      if (String(neuChatState.hostMode || '').trim() === 'dock') neuPositionDockNearFlag();
      const input = neuChatInputNode();
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.focus({ preventScroll: true });
      }
      return;
    }

    const mode = String(neuChatState.hostMode || '').trim();
    if (mode === 'inbox') {
      const host = neuInboxChatHostNode();
      if (host instanceof HTMLElement && !host.classList.contains('hidden')) {
        const input = neuChatInputNode();
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.focus({ preventScroll: true });
        }
        return;
      }
    }

    const modal = neuChatModalNode();
    if (modal instanceof HTMLElement && !modal.hidden) {
      const input = neuChatInputNode();
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.focus({ preventScroll: true });
      }
      return;
    }

    const lastConversationId = String(neuChatState.lastConversationId || neuChatState.currentConversationId || '').trim();
    const lastPeerUid = String(neuChatState.lastPeerUid || neuChatState.peerUid || '').trim();
    if (lastConversationId) {
      try {
        await neuOpenConversation(lastConversationId, { otherUid: lastPeerUid });
        return;
      } catch {
        // fallback to list
      }
    }

    const first = Array.isArray(neuChatState.listRows) ? neuChatState.listRows[0] : null;
    const firstConversationId = String(first?.conversationId || '').trim();
    if (firstConversationId) {
      await neuOpenConversation(firstConversationId, { otherUid: String(first?.otherUid || '').trim() });
      return;
    }

    openPulsePortal();
  }

  async function neuOpenLastChatOrList() {
    await neuOpenChatFromFloatFlag();
  }

  function neuFocusChatDockLauncherTarget() {
    const hasThread = !!String(neuChatState.currentConversationId || '').trim();
    if (hasThread) {
      const input = neuChatInputNode();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.focus({ preventScroll: true });
        return;
      }
    }
    const search = neuDockInboxSearchNode() || neuInboxSearchNode();
    if (search instanceof HTMLInputElement) {
      search.focus({ preventScroll: true });
      return;
    }
    const fallbackInput = neuChatInputNode();
    if (fallbackInput instanceof HTMLTextAreaElement || fallbackInput instanceof HTMLInputElement) {
      fallbackInput.focus({ preventScroll: true });
    }
  }

  async function neuToggleChatDockFromLauncher() {
    if (!neuCanUseDockHost()) {
      neuOpenDockInboxWindow();
      return;
    }

    if (!(neuChatModalCardNode() instanceof HTMLElement)) {
      neuOpenDockInboxWindow();
      return;
    }

    neuChatState.hostMode = 'dock';
    neuMountChatCardForMode('dock');
    neuSetInboxPanelOpen(false);

    const root = neuChatRootNode();
    const dockOpen = neuChatState.dockOpen === true && root instanceof HTMLElement && !root.classList.contains('hidden');
    if (dockOpen) {
      neuSetChatDockOpen(false);
      neuSetTypingRowVisible(false);
      return;
    }

    neuSetChatDockOpen(true);
    neuRenderChatList();
    neuOpenDockInboxWindow();
    window.setTimeout(() => {
      neuFocusChatDockLauncherTarget();
      neuUpdateChatComposerOffsetVar();
    }, 0);
  }

  function neuInitChatDockLauncher() {
    if (neuChatState.dockLauncherWired) return;
    neuChatState.dockLauncherWired = true;

    const savedOpen = neuChatReadDockOpenPreference();
    if (savedOpen === true || savedOpen === false) {
      neuChatState.dockOpen = savedOpen;
    }

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!neuCanUseDockHost() || !neuChatState.dockOpen) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const dock = neuChatRootNode();
        const flag = neuChatFloatNode();
        if (dock instanceof HTMLElement && dock.contains(target)) return;
        if (flag instanceof HTMLElement && (target === flag || flag.contains(target))) return;
        if (target.closest('.neuDockThreadWindow, .neuDockBubbleTray, .neuDockBubble, .neuDockBubbleBtn')) return;
        neuSetChatDockOpen(false);
        neuSetTypingRowVisible(false);
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Tab') return;
        if (!neuCanUseDockHost() || !neuChatState.dockOpen) return;
        const dock = neuChatRootNode();
        if (!(dock instanceof HTMLElement) || dock.classList.contains('hidden')) return;
        const focusables = Array.from(
          dock.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (node) =>
            node instanceof HTMLElement &&
            node.getAttribute('aria-hidden') !== 'true' &&
            !node.classList.contains('hidden') &&
            node.offsetParent !== null,
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeEl = document.activeElement;
        const inside = activeEl instanceof Node ? dock.contains(activeEl) : false;
        if (!inside) {
          event.preventDefault();
          first.focus({ preventScroll: true });
          return;
        }
        if (event.shiftKey) {
          if (activeEl === first) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          }
          return;
        }
        if (activeEl === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      },
      true,
    );

    if (!neuCanUseDockHost()) return;
    neuChatState.hostMode = 'dock';
    neuMountChatCardForMode('dock');
    neuSetInboxPanelOpen(false);
    neuSetChatDockOpen(neuChatState.dockOpen === true, { persist: false });
    if (neuChatState.dockOpen === true) {
      window.setTimeout(() => neuFocusChatDockLauncherTarget(), 0);
    }
  }

  function neuInitChatFloatFlag() {
    if (neuChatState.floatWired) return;
    const flag = neuChatFloatNode();
    if (!(flag instanceof HTMLButtonElement)) return;
    neuChatState.floatWired = true;
    flag.classList.remove('hidden');

    const saved = neuChatReadFloatPosition();
    if (saved) {
      neuApplyFloatSnapped(saved.side, saved.top, false);
    } else {
      neuApplyFloatSnapped('right', neuDefaultFloatY(), false);
    }

    let moved = false;

    const readPoint = (event) => {
      const touchPoint = event?.touches?.[0] || event?.changedTouches?.[0];
      const point = touchPoint || event;
      const x = Number(point?.clientX);
      const y = Number(point?.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    };

    const onStart = (event) => {
      const point = readPoint(event);
      if (!point) return;
      moved = false;
      neuFloatStartDrag(point.x, point.y);
      if (event.cancelable) event.preventDefault();
    };

    const onMove = (event) => {
      if (!neuChatFloatState.dragging) return;
      const point = readPoint(event);
      if (!point) return;

      const dx = point.x - neuChatFloatState.startX;
      const dy = point.y - neuChatFloatState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;

      neuFloatMoveDrag(point.x, point.y);
      if (event.cancelable) event.preventDefault();
    };

    const onEnd = () => {
      if (!neuChatFloatState.dragging) return;
      neuFloatEndDrag();
      if (moved) neuChatFloatState.suppressClickUntil = Date.now() + 220;
      window.setTimeout(() => {
        moved = false;
      }, 50);
    };

    flag.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      onStart(event);
    });
    flag.addEventListener('touchstart', onStart, { passive: false });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    window.addEventListener('blur', onEnd);

    flag.addEventListener('click', (event) => {
      if (moved || Date.now() < neuChatFloatState.suppressClickUntil) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      neuToggleChatDockFromLauncher().catch((error) => {
        console.error('[neu-chat] float dock toggle failed', error);
        neuChatSetHint('No se pudo abrir el dock del chat.', true);
      });
    });

    window.addEventListener(
      'resize',
      () => {
        const rect = flag.getBoundingClientRect();
        const side = flag.classList.contains('is-left') ? 'left' : 'right';
        neuApplyFloatSnapped(side, rect.top, true);
      },
      { passive: true },
    );
  }

  return {
    neuEnsureChatModalLayoutClass,
    neuChatReadFloatPosition,
    neuChatSaveFloatPosition,
    neuChatReadDockOpenPreference,
    neuChatSaveDockOpenPreference,
    neuClampNumber,
    neuChatFloatMetrics,
    neuApplyFloatRawPosition,
    neuApplyFloatSnapped,
    neuDefaultFloatY,
    neuFloatStartDrag,
    neuFloatMoveDrag,
    neuFloatEndDrag,
    neuOpenChatFromFloatFlag,
    neuOpenLastChatOrList,
    neuFocusChatDockLauncherTarget,
    neuToggleChatDockFromLauncher,
    neuInitChatDockLauncher,
    neuInitChatFloatFlag,
  };
}
