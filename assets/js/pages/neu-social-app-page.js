import {
  getNeuAppContext,
  getNeuRuntimeDiagnostics,
  hardResetNeuApp,
  initNeuApp,
  logNeuRuntimeDiagnostics,
} from '../neu/app/neu-app.boot.js?v=20260313chatfix5';
import { normalizePortal } from '../neu/context/neu-app-context.js';
import { chatState } from '../neu/state/chat.state.js';
import { postState } from '../neu/state/post.state.js';
import { profileState } from '../neu/state/profile.state.js';
import { storyState } from '../neu/state/story.state.js';

let booted = false;
let globalsExposed = false;
let hashFocusWired = false;

function exposeRuntimeGlobals() {
  if (globalsExposed) return;
  globalsExposed = true;
  window.neuBoot = () => initNeuApp();
  window.neuBootForce = () => initNeuApp({ forceReinit: true });
  window.neuAppContext = getNeuAppContext();
  window.chatState = chatState;
  window.profileState = profileState;
  window.postState = postState;
  window.storyState = storyState;
  window.neuDiagnostics = {
    get: getNeuRuntimeDiagnostics,
    log: logNeuRuntimeDiagnostics,
    reset: hardResetNeuApp,
    bootIntegrity() {
      const context = getNeuAppContext();
      const params = new URLSearchParams(location.search);
      const expectedPortal = normalizePortal(params.get('portal'));
      const rawProfile = String(params.get('profile') || '').trim();
      const expectedProfileUid = rawProfile
        ? rawProfile === 'me'
          ? String(context.authUser?.uid || '')
          : rawProfile
        : '';
      const actualProfileUid = String(context.profileUser?.uid || '');
      return {
        authUserSet: Boolean(context.authUser?.uid),
        portalMatchesUrl: String(context.portal || '') === expectedPortal,
        profileMatchesUrl: actualProfileUid === expectedProfileUid,
        context,
        diagnostics: getNeuRuntimeDiagnostics(),
      };
    },
  };
}

function focusHashTarget({ smooth = true } = {}) {
  const targetId = String(location.hash || '').trim().replace(/^#/, '');
  if (!targetId) return;

  const target = document.getElementById(targetId);
  if (!(target instanceof HTMLElement)) return;

  window.setTimeout(() => {
    target.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'start',
    });
  }, 180);
}

function wireHashFocus() {
  if (hashFocusWired) return;
  hashFocusWired = true;

  window.addEventListener('hashchange', () => {
    focusHashTarget();
  });
}

async function boot() {
  exposeRuntimeGlobals();
  if (booted) return;
  booted = true;
  await initNeuApp();
  wireHashFocus();
  focusHashTarget({ smooth: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error('[neu-page] boot failed', error);
    });
  }, { once: true });
} else {
  boot().catch((error) => {
    console.error('[neu-page] boot failed', error);
  });
}
