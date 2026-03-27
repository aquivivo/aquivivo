export function createLegacyRoutingModule(deps) {
  const {
    NEU_BOTTOM_KEYS,
    NEU_PORTAL_ALLOWED,
    NEU_PROFILE_ME,
    SAFE_ENABLE_PORTAL_OBS,
    activateFeedSource,
    getBottomNavKey,
    getCurrentFeedSource,
    getPortalFromQuery,
    getProfileUidFromQuery,
    isDisabled,
    isProfileRouteActive,
    neuCurrentUid,
    neuLoadSuggestedUsers,
    neuOpenQuickPostModal,
    neuRenderChatList,
    neuStripQueryParams,
    neuSyncChatHostSurface,
    qaDebug,
    updateNeuRouteParams,
  } = deps;

  let neuBottomNavWired = false;
  let neuPortalProxyRoot = null;

  function applyPortalUiState(portalName) {
    const portal = String(portalName || '').trim().toLowerCase();
    const nextPortal = NEU_PORTAL_ALLOWED.has(portal) ? portal : 'feed';

    if (document.body) {
      document.body.dataset.portal = nextPortal;
    }

    document.querySelectorAll('[data-portal-screen]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const screen = String(node.getAttribute('data-portal-screen') || '').trim().toLowerCase();
      const match = screen === nextPortal;
      node.classList.toggle('is-active', match);
      node.hidden = !match;
    });

    document.querySelectorAll('.profile-tabs [data-portal-target]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const target = String(node.getAttribute('data-portal-target') || '').trim().toLowerCase();
      const match = target === nextPortal;
      node.classList.toggle('is-active', match);
      if (match) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
  }

  function syncRouteFromPortalState(portalName) {
    const portal = String(portalName || '').trim().toLowerCase();
    if (!NEU_PORTAL_ALLOWED.has(portal)) return;

    if (portal !== 'feed') {
      updateNeuRouteParams({ portal, profileMode: false });
      return;
    }

    if (isProfileRouteActive()) {
      const meUid = neuCurrentUid();
      const profileUid = getProfileUidFromQuery(meUid) || NEU_PROFILE_ME;
      updateNeuRouteParams({ portal, profileMode: true, profileUid });
      return;
    }

    const feedSource = getCurrentFeedSource();
    const keepProfile = isProfileRouteActive() && (!feedSource || feedSource === 'target');
    updateNeuRouteParams({ portal, profileMode: keepProfile ? true : false });
  }

  function ensurePortalProxyRoot() {
    if (neuPortalProxyRoot instanceof HTMLElement) return neuPortalProxyRoot;

    const root = document.createElement('div');
    root.id = 'neuPortalProxyRoot';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.append(root);
    neuPortalProxyRoot = root;
    return root;
  }

  function ensurePortalProxyButton(portal) {
    const normalized = String(portal || '').trim().toLowerCase();
    if (!NEU_PORTAL_ALLOWED.has(normalized)) return null;

    const root = ensurePortalProxyRoot();
    const selector = `[data-neu-proxy-portal="${normalized}"]`;
    const existing = root.querySelector(selector);
    if (existing instanceof HTMLButtonElement) return existing;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.portalTarget = normalized;
    button.dataset.neuProxyPortal = normalized;
    root.append(button);
    return button;
  }

  function activatePortal(portal) {
    applyPortalUiState(portal);
  }

  function openComposerModalFromBottom() {
    if (typeof neuOpenQuickPostModal === 'function') {
      neuOpenQuickPostModal();
      return;
    }

    const trigger = document.getElementById('btnOpenComposer') || document.querySelector('[data-open-composer]');
    if (trigger instanceof HTMLElement) {
      trigger.click();
      return;
    }

    const modal = document.getElementById('composerModal');
    if (modal instanceof HTMLElement) {
      modal.hidden = false;
      document.body.classList.add('modal-open');
    }
  }

  function openQuickPostModalFromIntent() {
    updateNeuRouteParams({ portal: 'feed', profileMode: false });
    activatePortal('feed');
    window.setTimeout(() => {
      neuOpenQuickPostModal();
    }, 220);
  }

  function neuConsumePostOnboardingIntents() {
    const params = new URLSearchParams(location.search);
    const openProfileEdit = params.get('openProfileEdit') === '1';
    const openComposer = params.get('openComposer') === '1';
    const openQuickPost = params.get('openQuickPost') === '1';
    const openSuggested = params.get('suggested') === '1' || sessionStorage.getItem('neu_open_suggested') === '1';
    if (!openProfileEdit && !openComposer && !openQuickPost && !openSuggested) return;

    sessionStorage.removeItem('neu_open_suggested');
    neuStripQueryParams(['openProfileEdit', 'openComposer', 'openQuickPost', 'suggested', 'postOnboarding']);

    if (openProfileEdit) {
      updateNeuRouteParams({ portal: 'feed', profileMode: true, profileUid: NEU_PROFILE_ME });
      activatePortal('feed');
      activateFeedSource('target');
      window.setTimeout(() => {
        document.getElementById('btnNeuEditProfile')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, 220);
    }

    if (openComposer && !openQuickPost) {
      updateNeuRouteParams({ portal: 'feed', profileMode: false });
      activatePortal('feed');
      window.setTimeout(() => {
        openComposerModalFromBottom();
      }, 220);
    }

    if (openQuickPost) {
      openQuickPostModalFromIntent();
    }

    if (openSuggested) {
      updateNeuRouteParams({ portal: 'pulse', profileMode: false });
      activatePortal('pulse');
      window.setTimeout(() => {
        neuLoadSuggestedUsers({ force: true, focus: true }).catch(() => null);
      }, 240);
    }
  }

  function resolveBottomNavActiveKey() {
    const activePortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
    if (activePortal === 'feed') {
      const feedSource = getCurrentFeedSource();
      if (isProfileRouteActive() && (!feedSource || feedSource === 'target')) return NEU_BOTTOM_KEYS.PROFILE;
      return NEU_BOTTOM_KEYS.FEED;
    }
    if (activePortal === 'reels') return NEU_BOTTOM_KEYS.REELS;
    if (activePortal === 'pulse') return NEU_BOTTOM_KEYS.PULSE;
    return '';
  }

  function syncBottomNavActiveState() {
    const activeKey = resolveBottomNavActiveKey();
    document.querySelectorAll('.fusion-bottom-nav .bottom-nav-btn').forEach((button) => {
      const key = getBottomNavKey(button);
      const isActive = !!key && key === activeKey;
      button.classList.toggle('is-active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    window.setTimeout(() => {
      neuSyncChatHostSurface();
      neuRenderChatList();
    }, 0);
  }

  function scrollTopSmooth() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function routeBottomNav(key) {
    qaDebug('bottom-nav click', {
      key,
      portalBefore: String(document.body?.dataset?.portal || '').toLowerCase(),
      profileRoute: isProfileRouteActive(),
    });

    if (key === NEU_BOTTOM_KEYS.FEED) {
      updateNeuRouteParams({ portal: 'feed', profileMode: false });
      activatePortal('feed');
      activateFeedSource('discover');
      scrollTopSmooth();
      syncBottomNavActiveState();
      return;
    }

    if (key === NEU_BOTTOM_KEYS.REELS) {
      updateNeuRouteParams({ portal: 'reels', profileMode: false });
      activatePortal('reels');
      scrollTopSmooth();
      syncBottomNavActiveState();
      return;
    }

    if (key === NEU_BOTTOM_KEYS.PULSE) {
      updateNeuRouteParams({ portal: 'pulse', profileMode: false });
      activatePortal('pulse');
      neuLoadSuggestedUsers({ force: false, focus: false }).catch(() => null);
      scrollTopSmooth();
      syncBottomNavActiveState();
      return;
    }

    if (key === NEU_BOTTOM_KEYS.PROFILE) {
      updateNeuRouteParams({ portal: 'feed', profileMode: true, profileUid: NEU_PROFILE_ME });
      activatePortal('feed');
      activateFeedSource('target');
      scrollTopSmooth();
      syncBottomNavActiveState();
      return;
    }

    if (key === NEU_BOTTOM_KEYS.CREATE) {
      updateNeuRouteParams({ portal: 'feed', profileMode: false });
      activatePortal('feed');
      openComposerModalFromBottom();
      syncBottomNavActiveState();
    }
  }

  function applyInitialBottomNavRoute() {
    const portalFromQuery = getPortalFromQuery();
    qaDebug('initial-route', {
      portalFromQuery: portalFromQuery || '(none)',
      profileRoute: isProfileRouteActive(),
    });

    if (portalFromQuery && portalFromQuery !== 'feed') {
      updateNeuRouteParams({ portal: portalFromQuery, profileMode: false });
      activatePortal(portalFromQuery);
    } else if (isProfileRouteActive()) {
      updateNeuRouteParams({ portal: 'feed', profileMode: true });
      activatePortal('feed');
      activateFeedSource('target');
    } else if (portalFromQuery) {
      updateNeuRouteParams({ portal: portalFromQuery, profileMode: false });
      activatePortal(portalFromQuery);
      if (portalFromQuery === 'feed' && (!getCurrentFeedSource() || getCurrentFeedSource() === 'target')) {
        activateFeedSource('discover');
      }
    } else {
      activatePortal('feed');
      if (!getCurrentFeedSource() || getCurrentFeedSource() === 'target') {
        activateFeedSource('discover');
      }
    }
    window.setTimeout(syncBottomNavActiveState, 0);
  }

  function wireNeuBottomNavRouter() {
    if (neuBottomNavWired) return;
    neuBottomNavWired = true;

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest('.fusion-bottom-nav .bottom-nav-btn');
        if (!(button instanceof HTMLElement)) return;

        const key = getBottomNavKey(button);
        if (!key) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        routeBottomNav(key);
      },
      true,
    );

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const portalTrigger = target.closest('[data-portal-target]');
      if (!(portalTrigger instanceof HTMLElement)) return;
      if (portalTrigger.closest('.fusion-bottom-nav')) return;

      const portal = String(portalTrigger.dataset.portalTarget || '').trim().toLowerCase();
      if (!NEU_PORTAL_ALLOWED.has(portal)) return;

      event.preventDefault();

      const fromProfileTabs = portalTrigger.closest('.profile-tabs') instanceof HTMLElement;
      if (portal === 'feed') {
        if (fromProfileTabs && isProfileRouteActive()) {
          const meUid = neuCurrentUid();
          const profileUid = getProfileUidFromQuery(meUid) || NEU_PROFILE_ME;
          updateNeuRouteParams({ portal: 'feed', profileMode: true, profileUid });
          activatePortal('feed');
          activateFeedSource('target');
        } else {
          updateNeuRouteParams({ portal: 'feed', profileMode: false });
          activatePortal('feed');
          if (!getCurrentFeedSource() || getCurrentFeedSource() === 'target') {
            activateFeedSource('discover');
          }
        }
      } else {
        updateNeuRouteParams({ portal, profileMode: false });
        activatePortal(portal);
        if (portal === 'pulse') {
          neuLoadSuggestedUsers({ force: false, focus: false }).catch(() => null);
        }
      }

      scrollTopSmooth();
      syncBottomNavActiveState();
    });

    if (SAFE_ENABLE_PORTAL_OBS && !isDisabled('portal_obs') && !isDisabled('observers')) {
      let lastPortal = '';
      const observer = new MutationObserver(() => {
        const activePortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
        if (!NEU_PORTAL_ALLOWED.has(activePortal)) {
          syncBottomNavActiveState();
          return;
        }

        if (activePortal !== lastPortal) {
          qaDebug('portal-change', { from: lastPortal || '(none)', to: activePortal });
          lastPortal = activePortal;
        }

        syncRouteFromPortalState(activePortal);
        syncBottomNavActiveState();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-portal'] });
    }

    window.addEventListener('popstate', () => {
      const portalFromQuery = getPortalFromQuery();
      qaDebug('popstate', {
        portalQuery: portalFromQuery || '(none)',
        profileRoute: isProfileRouteActive(),
      });

      if (portalFromQuery && portalFromQuery !== 'feed') {
        activatePortal(portalFromQuery);
      } else if (isProfileRouteActive()) {
        activatePortal('feed');
        activateFeedSource('target');
      } else {
        activatePortal(portalFromQuery || 'feed');
        if ((!portalFromQuery || portalFromQuery === 'feed') && (!getCurrentFeedSource() || getCurrentFeedSource() === 'target')) {
          activateFeedSource('discover');
        }
      }

      syncBottomNavActiveState();
    });

    applyInitialBottomNavRoute();
  }

  return {
    neuConsumePostOnboardingIntents,
    syncBottomNavActiveState,
    wireNeuBottomNavRouter,
  };
}
