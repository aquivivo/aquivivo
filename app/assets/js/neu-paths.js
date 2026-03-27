const NEU_APP_DIR = 'app';

function normalizePathname(pathname = '') {
  const raw = String(pathname || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function isNeuMountedUnderApp(pathname = location.pathname) {
  const normalized = normalizePathname(pathname);
  return normalized === `/${NEU_APP_DIR}` || normalized.startsWith(`/${NEU_APP_DIR}/`);
}

export function getNeuPath(fileName, pathname = location.pathname) {
  const cleanFile = String(fileName || '').trim().replace(/^\/+/, '');
  if (!cleanFile) return '';
  return isNeuMountedUnderApp(pathname) ? `${NEU_APP_DIR}/${cleanFile}` : cleanFile;
}

export function getNeuLoginPath(pathname = location.pathname) {
  return getNeuPath('neu-login.html', pathname);
}

export function getNeuSocialAppPath(pathname = location.pathname) {
  return getNeuPath('neu-social-app.html', pathname);
}

export function withNeuQuery(path, params = {}) {
  const safePath = String(path || '').trim();
  if (!safePath) return '';

  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!key) return;
    if (value === undefined || value === null || value === '' || value === false) return;
    qs.set(key, value === true ? '1' : String(value));
  });

  const query = qs.toString();
  return query ? `${safePath}?${query}` : safePath;
}
