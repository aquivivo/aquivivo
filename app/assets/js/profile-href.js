function normalizeHandle(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function buildProfileHref(handle, uid) {
  const cleanHandle = normalizeHandle(handle);
  if (cleanHandle) {
    return `perfil.html?u=${encodeURIComponent(cleanHandle)}`;
  }

  const cleanUid = String(uid || '').trim();
  if (cleanUid) {
    return `perfil.html?uid=${encodeURIComponent(cleanUid)}`;
  }

  return 'perfil.html';
}

