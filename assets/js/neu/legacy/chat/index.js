import { createLegacyChatHostModule } from './host.js';
import { createLegacyChatLauncherModule } from './launcher.js';
import { createLegacyChatListModule } from './list.js';
import { createLegacyChatOpenModule } from './open.js';

export function createLegacyChatModule(deps) {
  const {
    auth,
    db,
    doc,
    getDoc,
    getDownloadURL,
    neuChatAutoResizeInput,
    neuChatModalNode,
    neuChatSearchInputNode,
    neuChatSetAttachmentsDisabled,
    neuChatSetHint,
    neuChatState,
    neuCurrentUid,
    neuDisableLegacyMiniChatUi,
    neuDockClearAllPersistedState,
    neuEnsureChatEditPreviewNode,
    neuEnsureChatFloatFlagDom,
    neuEnsureDirectConversation,
    neuLayoutDockThreadWindows,
    neuPublicProfileState,
    neuQaTrace,
    neuRenderChatAttachmentPreview,
    neuRenderChatEditPreview,
    neuRenderChatReplyPreview,
    neuResolveChatHostMode,
    neuSetChatSending,
    neuSocialAppHref,
    neuSyncUnreadUi,
    neuUpdateChatComposerOffsetVar,
    neuWireChatEvents,
    uploadBytes,
  } = deps;

  const hostModule = createLegacyChatHostModule(deps);
  const listModule = createLegacyChatListModule({
    ...deps,
    neuSyncChatHostSurface: hostModule.neuSyncChatHostSurface,
  });
  const openModule = createLegacyChatOpenModule({
    ...deps,
    neuRenderChatList: listModule.neuRenderChatList,
    neuSetChatModalOpen: hostModule.neuSetChatModalOpen,
  });
  const launcherModule = createLegacyChatLauncherModule({
    ...deps,
    neuOpenConversation: openModule.neuOpenConversation,
    neuRenderChatList: listModule.neuRenderChatList,
    openPulsePortal: () => {
      location.href = neuSocialAppHref({ portal: 'pulse' });
    },
  });

  const {
    neuSyncChatHostSurface,
    neuRestorePersistedDockWindows,
    neuChatRecomputeModalLock,
    neuSetChatModalOpen,
  } = hostModule;
  const {
    neuWireChatSearchInput,
    neuWireShareChatSearchInput,
    neuRenderChatList,
    neuWireChatListGuard,
    neuStartChatListListener,
  } = listModule;
  const { neuOpenConversation } = openModule;
  const {
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
  } = launcherModule;

  let neuChatOnDemandInitPromise = null;

  async function waitForMiniChatApi(timeoutMs = 1200) {
    const deadline = Date.now() + Math.max(120, Number(timeoutMs || 0));
    while (Date.now() < deadline) {
      const api = typeof window !== 'undefined' ? window.__avMiniChatApi : null;
      if (api && typeof api === 'object') return api;
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    return null;
  }

  async function neuOpenOrStartDirectChat(otherUid, options = {}) {
    const meUid = neuCurrentUid();
    const targetUid = String(otherUid || '').trim();
    neuQaTrace('open_or_start_direct_start', { meUid, targetUid, mode: String(options?.mode || '') });
    if (!meUid || !targetUid || targetUid === meUid) return;
    const ensured = await neuEnsureDirectConversation(meUid, targetUid);
    if (!ensured?.conversationId) {
      neuQaTrace('open_or_start_direct_no_conversation', { meUid, targetUid });
      return;
    }
    const mode = neuResolveChatHostMode(options?.mode);
    neuQaTrace('open_or_start_direct_opening', { conversationId: ensured.conversationId, targetUid, mode });
    await neuOpenConversation(ensured.conversationId, {
      otherUid: targetUid,
      memberKey: ensured.memberKey,
      mode,
    });
  }

  async function neuOpenChatWithUser(otherUid, options = {}) {
    const meUid = neuCurrentUid();
    const targetUid = String(otherUid || '').trim();
    if (!meUid) return;
    if (!targetUid || targetUid === meUid) {
      neuChatSetHint('Nie mozna otworzyc czatu z tym profilem.', true);
      return;
    }
    const mode = neuResolveChatHostMode(options?.mode);
    await neuOpenOrStartDirectChat(targetUid, { mode });
    const modal = neuChatModalNode();
    if (mode === 'modal' && modal instanceof HTMLElement && modal.hidden) {
      neuSetChatModalOpen(true);
    }
  }

  async function neuEnsureChatReadyOnDemand() {
    const user = auth.currentUser;
    const meUid = String(user?.uid || neuCurrentUid() || '').trim();
    if (!meUid) return false;

    const alreadyReady =
      String(neuChatState.meUid || '').trim() === meUid &&
      (neuChatState.wired === true || typeof neuChatState.listUnsub === 'function');
    if (alreadyReady) return true;

    if (!neuChatOnDemandInitPromise) {
      neuChatOnDemandInitPromise = neuInitChatMvp(user).finally(() => {
        neuChatOnDemandInitPromise = null;
      });
    }

    await neuChatOnDemandInitPromise;
    return true;
  }

  async function neuOpenProfileMessage(chatUid) {
    const targetUid = String(chatUid || '').trim();
    const meUid = neuCurrentUid();
    neuQaTrace('open_profile_message_start', { targetUid, meUid });
    if (!targetUid || !meUid || targetUid === meUid) {
      neuQaTrace('open_profile_message_guard_block', { targetUid, meUid });
      return;
    }

    const targetName = String(
      neuPublicProfileState.viewedProfile?.displayName ||
        document.getElementById('leftName')?.textContent ||
        '',
    ).trim();
    const routeHref = neuSocialAppHref({
      portal: 'pulse',
      chat: targetUid,
      chatKind: 'user',
    });

    try {
      const params = new URLSearchParams(location.search);
      const activePortal = String(params.get('portal') || 'feed').trim().toLowerCase();
      const api =
        (typeof window !== 'undefined' ? window.__avMiniChatApi : null) ||
        (await waitForMiniChatApi());
      if (
        api &&
        (
          (activePortal === 'pulse' && typeof api.openDirectConversationPage === 'function') ||
          (activePortal !== 'pulse' && typeof api.openDirectConversationDock === 'function')
        )
      ) {
        neuQaTrace('open_profile_message_ready', {
          targetUid,
          meUid,
          mode: activePortal === 'pulse' ? 'mini-chat-api-page' : 'mini-chat-api-dock',
        });
        if (activePortal === 'pulse') {
          await api.openDirectConversationPage(targetUid, targetName);
        } else {
          await api.openDirectConversationDock(targetUid, targetName);
        }
        neuQaTrace('open_profile_message_done', {
          targetUid,
          routeHref,
          mode: activePortal === 'pulse' ? 'mini-chat-api-page' : 'mini-chat-api-dock',
        });
        return;
      }

      if (activePortal !== 'pulse') {
        neuQaTrace('open_profile_message_api_missing', {
          targetUid,
          activePortal,
        });
        neuChatSetHint('Chat jeszcze sie laduje. Sprobuj ponownie za chwile.', true);
        return;
      }

      neuQaTrace('open_profile_message_done', {
        targetUid,
        routeHref,
        mode: 'pulse-route',
      });
      location.href = routeHref;
    } catch (error) {
      console.error('[neu-chat] open from profile failed', error);
      neuQaTrace('open_profile_message_error', { targetUid, message: String(error?.message || '') });
      neuChatSetHint('No se pudo iniciar el chat.', true);
    }
  }

  async function neuInitChatMvp(user) {
    neuDisableLegacyMiniChatUi();
    const prevUid = String(neuChatState.meUid || '').trim();
    const meUid = String(user?.uid || auth.currentUser?.uid || '').trim();
    if (!meUid) {
      if (prevUid) neuDockClearAllPersistedState();
      return;
    }
    if (prevUid && prevUid !== meUid) {
      neuDockClearAllPersistedState();
    }

    neuChatState.meUid = meUid;
    neuSyncChatHostSurface();
    neuEnsureChatModalLayoutClass();
    neuEnsureChatFloatFlagDom();
    neuInitChatFloatFlag();
    neuInitChatDockLauncher();
    neuSyncUnreadUi();
    neuWireChatEvents();
    neuWireChatSearchInput();
    neuWireShareChatSearchInput();
    const chatSearchInput = neuChatSearchInputNode();
    neuChatState.chatSearchQuery = String(chatSearchInput?.value || '').trim();
    neuStartChatListListener(meUid);
    neuWireChatListGuard();
    neuRenderChatList();
    neuEnsureChatEditPreviewNode();
    neuRenderChatAttachmentPreview();
    neuRenderChatReplyPreview();
    neuRenderChatEditPreview();
    if (typeof uploadBytes !== 'function' || typeof getDownloadURL !== 'function') {
      neuChatSetAttachmentsDisabled(true, 'unavailable');
    }
    neuChatAutoResizeInput();
    neuUpdateChatComposerOffsetVar();
    neuSetChatSending(false);
    neuLayoutDockThreadWindows();
    window.setTimeout(() => {
      neuRestorePersistedDockWindows();
    }, 0);
  }

  function getRouteChatUid() {
    const raw = String(new URLSearchParams(location.search).get('chat') || '').trim();
    const meUid = String(neuCurrentUid() || '').trim();
    if (!raw || (meUid && raw === meUid)) return '';
    return raw;
  }

  function clearRouteChatUid() {
    const url = new URL(location.href);
    if (!url.searchParams.has('chat')) return;
    url.searchParams.delete('chat');
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const currentHref = `${location.pathname}${location.search}${location.hash}`;
    if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
  }

  async function neuRunRouteChatIntent() {
    const routeChat = getRouteChatUid();
    if (!routeChat) return;
    clearRouteChatUid();
    const desiredMode = neuResolveChatHostMode('dock');

    const fromList = Array.isArray(neuChatState.listRows)
      ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === routeChat) || null
      : null;
    if (fromList) {
      await neuOpenConversation(routeChat, { otherUid: String(fromList.otherUid || '').trim(), mode: desiredMode });
      return;
    }

    try {
      const convSnap = await getDoc(doc(db, 'neuConversations', routeChat));
      if (convSnap.exists()) {
        const convData = convSnap.data() || {};
        const members = Array.isArray(convData.members) ? convData.members.map((uid) => String(uid || '').trim()) : [];
        const meUid = neuCurrentUid();
        if (meUid && members.includes(meUid)) {
          const otherUid = members.find((uid) => uid && uid !== meUid) || '';
          await neuOpenConversation(routeChat, { otherUid, mode: desiredMode });
          return;
        }
      }
    } catch {
      // fallback to uid-style route chat
    }

    await neuOpenChatWithUser(routeChat, { mode: desiredMode });
  }

  return {
    ...hostModule,
    ...listModule,
    ...openModule,
    ...launcherModule,
    neuOpenOrStartDirectChat,
    neuOpenChatWithUser,
    neuEnsureChatReadyOnDemand,
    neuOpenProfileMessage,
    neuInitChatMvp,
    neuRunRouteChatIntent,
  };
}
