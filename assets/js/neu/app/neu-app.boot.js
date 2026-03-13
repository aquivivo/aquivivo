import { requireAuth } from '../core/auth.js';
import { cleanupRegistryStats, registerCleanup, runCleanup } from '../core/cleanup.js';
import { runWithNeuErrorBoundary } from '../core/error.js';
import { syncContextFromUrl, wirePopstate } from '../core/routing.js';
import { neuAppContext, setAuthUser, setPortal, setProfileUser } from '../context/neu-app-context.js';
import { createChatDock } from '../chat/chat.dock.js';
import { createChatReactions } from '../chat/chat.reactions.js';
import { createChatService } from '../chat/chat.service.js?v=20260313chatfix5';
import { createChatTyping } from '../chat/chat.typing.js';
import { createChatUi } from '../chat/chat.ui.js';
import { createOnboardingService } from '../onboarding/onboarding.service.js';
import { createOnboardingUi } from '../onboarding/onboarding.ui.js';
import { createPostService } from '../posts/post.service.js';
import { createPostUi } from '../posts/post.ui.js';
import { createProfileService } from '../profile/profile.service.js';
import { createProfileUi } from '../profile/profile.ui.js';
import { postState, resetPostState } from '../state/post.state.js';
import { profileState, resetProfileState } from '../state/profile.state.js';
import { chatState, resetChatState } from '../state/chat.state.js';
import { storyState, resetStoryState } from '../state/story.state.js';
import { createStoryService } from '../stories/story.service.js';
import { createStoryUi } from '../stories/story.ui.js';
import { initLegacyRuntimeEnvironment, neuLegacyRuntime } from './neu-app.legacy.js?v=20260313chatfix5';

const onboardingState = {
  initialized: false,
  mode: 'app',
};

const postRepository = {
  initQuickPost: () => neuLegacyRuntime.posts.initQuickPost(),
  initCrud: () => neuLegacyRuntime.posts.initCrud(),
  isCrudEnabled: () => neuLegacyRuntime.safe.enableCrudPosts() && !neuLegacyRuntime.safe.isDisabled('crud_posts'),
  bootGuarded: (name, fn) => neuLegacyRuntime.internal.bootModule(name, fn),
};

const storyRepository = {
  initCrud: () => neuLegacyRuntime.stories.initCrud(),
  isCrudEnabled: () => neuLegacyRuntime.safe.enableCrudStories() && !neuLegacyRuntime.safe.isDisabled('crud_stories'),
  bootGuarded: (name, fn) => neuLegacyRuntime.internal.bootModule(name, fn),
};

const chatRepository = {
  initMvp: async () => {},
};

const onboardingRepository = {
  runLegacyStart: ({ authUser = null } = {}) =>
    neuLegacyRuntime.internal.start({ preAuthUser: authUser }),
};

const profileService = createProfileService({ context: neuAppContext, state: profileState });
const postService = createPostService({ state: postState, repository: postRepository });
const storyService = createStoryService({ state: storyState });
const chatService = createChatService({ context: neuAppContext, state: chatState, repository: chatRepository });
const onboardingService = createOnboardingService({ state: onboardingState, repository: onboardingRepository });

const profileUi = createProfileUi();
const postUi = createPostUi();
const storyUi = createStoryUi({ repository: storyRepository });
const chatUi = createChatUi();
const chatDock = createChatDock();
const chatTyping = createChatTyping();
const chatReactions = createChatReactions();
const onboardingUi = createOnboardingUi();

let bootPromise = null;
let popstateWired = false;
let stateCleanupWired = false;

const diagnostics = {
  bootCalls: 0,
  bootResolved: 0,
  bootRejected: 0,
  authChecks: 0,
  popstateEvents: 0,
  cleanupRuns: 0,
  domainInitCalls: {
    profile: 0,
    posts: 0,
    stories: 0,
    chat: 0,
    onboarding: 0,
  },
  lastContextSnapshot: null,
};

function snapshotContext() {
  return {
    authUid: String(neuAppContext.authUser?.uid || ''),
    profileUid: String(neuAppContext.profileUser?.uid || ''),
    portal: String(neuAppContext.portal || ''),
    at: Date.now(),
  };
}

function markContext(reason) {
  diagnostics.lastContextSnapshot = {
    reason: String(reason || ''),
    ...snapshotContext(),
  };
}

function resetInitStates() {
  resetProfileState();
  resetPostState();
  resetStoryState();
  resetChatState();
  onboardingState.initialized = false;
  onboardingState.mode = 'app';
  popstateWired = false;
}

function cleanupAllStates() {
  resetInitStates();
}

async function initProfile() {
  diagnostics.domainInitCalls.profile += 1;
  await profileService.init();
  profileUi.init();
}

async function initPosts() {
  diagnostics.domainInitCalls.posts += 1;
  await postService.init();
  postUi.init();
}

async function initStories() {
  diagnostics.domainInitCalls.stories += 1;
  await storyService.init();
  await storyUi.init();
}

async function initChat({ eager = true } = {}) {
  diagnostics.domainInitCalls.chat += 1;
  await chatService.init({ eager });
  chatUi.init();
  chatDock.init();
  chatTyping.init();
  chatReactions.init();
}

async function initOnboarding() {
  diagnostics.domainInitCalls.onboarding += 1;
  onboardingUi.init();
  return onboardingService.init({ authUser: neuAppContext.authUser });
}

export function getNeuRuntimeDiagnostics() {
  return {
    ...diagnostics,
    domainInitCalls: { ...diagnostics.domainInitCalls },
    cleanupRegistry: cleanupRegistryStats(),
    context: snapshotContext(),
  };
}

export function logNeuRuntimeDiagnostics(label = 'NEU DIAG') {
  const value = getNeuRuntimeDiagnostics();
  console.log(`[${label}]`, value);
  return value;
}

export function hardResetNeuApp({ keepContext = false } = {}) {
  const executed = runCleanup();
  diagnostics.cleanupRuns += executed;
  bootPromise = null;
  cleanupAllStates();

  if (!keepContext) {
    setAuthUser(neuAppContext, null);
    setProfileUser(neuAppContext, null);
    setPortal(neuAppContext, 'feed');
  }

  markContext('hard-reset');
  return {
    cleanupHandlersExecuted: executed,
    cleanupRegistry: cleanupRegistryStats(),
  };
}

export async function initNeuApp({ forceReinit = false } = {}) {
  diagnostics.bootCalls += 1;
  if (forceReinit) hardResetNeuApp({ keepContext: true });
  if (bootPromise) return bootPromise;

  bootPromise = runWithNeuErrorBoundary(
    async () => {
      initLegacyRuntimeEnvironment();

      if (!stateCleanupWired) {
        stateCleanupWired = true;
        registerCleanup(
          () => {
            cleanupAllStates();
            stateCleanupWired = false;
          },
          { tag: 'state' },
        );
      }

      diagnostics.authChecks += 1;
      await requireAuth(neuAppContext);
      syncContextFromUrl(neuAppContext);
      markContext('after-auth-and-route');

      if (!popstateWired) {
        popstateWired = true;
        const unregisterPopstate = wirePopstate(() => {
          diagnostics.popstateEvents += 1;
          syncContextFromUrl(neuAppContext);
          markContext('popstate');
        });
        registerCleanup(
          () => {
            unregisterPopstate();
            popstateWired = false;
          },
          { tag: 'routing' },
        );
      }

      await initProfile();
      await initPosts();
      await initStories();
      await initChat({ eager: true });
      const mode = await initOnboarding();
      diagnostics.bootResolved += 1;
      markContext('boot-complete');

      return {
        mode,
        context: neuAppContext,
        diagnostics: getNeuRuntimeDiagnostics(),
      };
    },
    { scope: 'neu-app.boot' },
  ).catch((error) => {
    diagnostics.bootRejected += 1;
    bootPromise = null;
    throw error;
  });

  return bootPromise;
}

export function getNeuAppContext() {
  return neuAppContext;
}

export async function init() {
  return initNeuApp();
}
