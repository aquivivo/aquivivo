// assets/js/profile-href.js
// Shared profile URL builder used across layout/pages to avoid drift.

export function usePrettyProfile() {
  const host = location.hostname || '';
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('github.io')) return false;
  return true;
}

export function buildProfileHref(handle, uid) {
  const safeHandle = String(handle || '').trim();
  const safeUid = String(uid || '').trim();

  if (safeHandle) {
    const encodedHandle = encodeURIComponent(safeHandle);
    if (usePrettyProfile()) {
      return safeUid
        ? `/perfil/${encodedHandle}?uid=${encodeURIComponent(safeUid)}`
        : `/perfil/${encodedHandle}`;
    }
    return safeUid
      ? `perfil.html?u=${encodedHandle}&uid=${encodeURIComponent(safeUid)}`
      : `perfil.html?u=${encodedHandle}`;
  }

  return safeUid ? `perfil.html?uid=${encodeURIComponent(safeUid)}` : 'perfil.html';
}
