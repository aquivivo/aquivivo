const NEU_DEFAULT_PORTAL = 'feed';
const NEU_ALLOWED_PORTALS = new Set(['feed', 'reels', 'stories', 'network', 'pulse']);

export function normalizePortal(value) {
  const portal = String(value || '')
    .trim()
    .toLowerCase();
  return NEU_ALLOWED_PORTALS.has(portal) ? portal : NEU_DEFAULT_PORTAL;
}

export function createNeuAppContext(seed = {}) {
  return {
    authUser: seed.authUser || null,
    profileUser: seed.profileUser || null,
    portal: normalizePortal(seed.portal),
  };
}

export const neuAppContext = createNeuAppContext();

export function setAuthUser(context, user) {
  context.authUser = user || null;
}

export function setProfileUser(context, profileUser) {
  context.profileUser = profileUser || null;
}

export function setPortal(context, portal) {
  context.portal = normalizePortal(portal);
}

export function init(seed = {}) {
  const next = createNeuAppContext(seed);
  neuAppContext.authUser = next.authUser;
  neuAppContext.profileUser = next.profileUser;
  neuAppContext.portal = next.portal;
  return neuAppContext;
}
