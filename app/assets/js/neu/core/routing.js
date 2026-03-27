import { normalizePortal, setPortal, setProfileUser } from '../context/neu-app-context.js';

const NEU_PROFILE_PARAM = 'profile';
const NEU_PROFILE_ME = 'me';

function normalizeUid(raw) {
  const uid = String(raw || '').trim();
  return uid || '';
}

export function syncContextFromUrl(context) {
  const params = new URLSearchParams(location.search);
  const portal = normalizePortal(params.get('portal'));
  const profileUid = normalizeUid(params.get(NEU_PROFILE_PARAM));

  setPortal(context, portal);
  if (profileUid) {
    setProfileUser(context, { uid: profileUid === NEU_PROFILE_ME ? String(context.authUser?.uid || '') : profileUid });
  } else {
    setProfileUser(context, null);
  }

  return {
    portal: context.portal,
    profileUid: String(context.profileUser?.uid || ''),
  };
}

export function updateUrl(params = {}, { replace = true } = {}) {
  const next = new URL(location.href);

  if (params.portal == null || params.portal === '') next.searchParams.delete('portal');
  else next.searchParams.set('portal', normalizePortal(params.portal));

  if (params.profileUid == null || params.profileUid === '') next.searchParams.delete(NEU_PROFILE_PARAM);
  else next.searchParams.set(NEU_PROFILE_PARAM, String(params.profileUid));

  const nextHref = `${next.pathname}${next.search}${next.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref === currentHref) return false;

  if (replace) history.replaceState(null, '', nextHref);
  else history.pushState(null, '', nextHref);
  return true;
}

export function wirePopstate(handler) {
  if (typeof handler !== 'function') return () => {};
  const onPop = () => handler();
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

export function init(context) {
  return syncContextFromUrl(context);
}
