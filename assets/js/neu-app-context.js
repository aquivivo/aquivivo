const NEU_DEFAULT_PORTAL = 'feed';
const NEU_ALLOWED_PORTALS = new Set(['feed', 'reels', 'stories', 'network', 'pulse']);

export const neuAppContext = {
  authUser: null,
  profileUser: null,
  portal: NEU_DEFAULT_PORTAL,
};

export function neuNormalizePortal(value) {
  const portal = String(value || '')
    .trim()
    .toLowerCase();
  return NEU_ALLOWED_PORTALS.has(portal) ? portal : NEU_DEFAULT_PORTAL;
}

export function neuSetAuthUser(user) {
  neuAppContext.authUser = user || null;
}

export function neuSetProfileUser(profileUser) {
  neuAppContext.profileUser = profileUser || null;
}

export function neuSetPortal(portal) {
  neuAppContext.portal = neuNormalizePortal(portal);
}
