function resetObject(target, createFn) {
  const next = createFn();
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.assign(target, next);
}

export function createProfileState() {
  return {
    initialized: false,
    authProfile: null,
    viewedProfile: null,
    followers: [],
    following: [],
  };
}

export function createNeuProfileState() {
  return {
    wired: false,
    loading: false,
    saving: false,
    readOnly: false,
    profile: null,
    pendingAvatarFile: null,
    pendingAvatarPreviewUrl: '',
    pendingAvatarUrlDraft: '',
    removeAvatar: false,
  };
}

export function createNeuProfileSyncState() {
  return {
    wired: false,
    applying: false,
    tick: 0,
  };
}

export function createNeuPublicProfileState() {
  return {
    wired: false,
    feedWired: false,
    initializing: false,
    meUid: '',
    targetUid: '',
    viewedProfile: null,
    profileMode: false,
    isOwn: true,
    isFollowing: false,
    followLoading: false,
    followersCount: 0,
    followingCount: 0,
    posts: [],
    postsLoadedFor: '',
    postsLoading: false,
  };
}

export function createNeuOnboardingState() {
  return {
    active: false,
    wired: false,
    step: 1,
    uid: '',
    saving: false,
    touched: false,
    form: {},
    errors: {},
  };
}

export function createNeuPostOnboardingState() {
  return {
    active: false,
    wired: false,
    uid: '',
    profile: null,
    finishing: false,
  };
}

export function createNeuSuggestedState() {
  return {
    wired: false,
    loading: false,
    uid: '',
    rows: [],
    followingSet: new Set(),
    focusPulseCard: false,
  };
}

export function createNeuLegacyLinkRewriteState() {
  return {
    observer: null,
    tick: null,
  };
}

export const profileState = createProfileState();
export const neuProfileState = createNeuProfileState();
export const neuProfileSyncState = createNeuProfileSyncState();
export const neuPublicProfileState = createNeuPublicProfileState();
export const neuOnboardingState = createNeuOnboardingState();
export const neuPostOnboardingState = createNeuPostOnboardingState();
export const neuSuggestedState = createNeuSuggestedState();
export const neuLegacyLinkRewriteState = createNeuLegacyLinkRewriteState();

export function resetProfileState() {
  resetObject(profileState, createProfileState);
  resetObject(neuProfileState, createNeuProfileState);
  resetObject(neuProfileSyncState, createNeuProfileSyncState);
  resetObject(neuPublicProfileState, createNeuPublicProfileState);
  resetObject(neuOnboardingState, createNeuOnboardingState);
  resetObject(neuPostOnboardingState, createNeuPostOnboardingState);
  resetObject(neuSuggestedState, createNeuSuggestedState);
  resetObject(neuLegacyLinkRewriteState, createNeuLegacyLinkRewriteState);
}

export function init() {
  return {
    profileState,
    neuProfileState,
    neuProfileSyncState,
    neuPublicProfileState,
    neuOnboardingState,
    neuPostOnboardingState,
    neuSuggestedState,
    neuLegacyLinkRewriteState,
    resetProfileState,
  };
}
