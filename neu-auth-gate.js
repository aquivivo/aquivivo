import { auth } from './neu-firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

const NEU_LOGIN_PATH = 'neu-login.html';
const NEU_DEFAULT_NEXT = 'neu-social-app.html';
const NEU_DEFAULT_REASON = 'auth';
const NEU_AUTH_TIMEOUT_MS = 4500;

function sanitizeNextTarget(raw, fallback = NEU_DEFAULT_NEXT) {
  const value = String(raw || '').trim();
  if (!value) return fallback;
  if (value.startsWith('http://') || value.startsWith('https://')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('..')) return fallback;
  return value.startsWith('/') ? value.slice(1) : value;
}

function sanitizeReason(raw, fallback = NEU_DEFAULT_REASON) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return fallback;
  if (!/^[a-z0-9_-]{2,24}$/.test(value)) return fallback;
  return value;
}

export function getNeuCurrentNext() {
  const file = String(location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop();
  const page = file || NEU_DEFAULT_NEXT;
  return sanitizeNextTarget(`${page}${location.search || ''}${location.hash || ''}`);
}

export function buildNeuLoginUrl(
  next = getNeuCurrentNext(),
  loginPath = NEU_LOGIN_PATH,
  { reason = NEU_DEFAULT_REASON } = {},
) {
  const safeNext = sanitizeNextTarget(next);
  const safeLoginPath = sanitizeNextTarget(loginPath, NEU_LOGIN_PATH);
  const safeReason = sanitizeReason(reason);
  const qs = new URLSearchParams();
  qs.set('next', safeNext);
  qs.set('reason', safeReason);
  return `${safeLoginPath}?${qs.toString()}`;
}

export function redirectNeuToLogin(
  next = getNeuCurrentNext(),
  loginPath = NEU_LOGIN_PATH,
  options = {},
) {
  location.replace(buildNeuLoginUrl(next, loginPath, options));
}

export function requireNeuAuth({ loginPath = NEU_LOGIN_PATH } = {}) {
  document.documentElement.classList.add('neu-auth-checking');

  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    let timeoutId = null;

    const finish = () => {
      document.documentElement.classList.remove('neu-auth-checking');
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      finish();
      console.warn('[neu-auth-gate] auth check timeout');
      redirectNeuToLogin(getNeuCurrentNext(), loginPath, { reason: 'auth_timeout' });
      reject(new Error('auth-timeout'));
    }, NEU_AUTH_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (settled) return;
        settled = true;
        unsubscribe();

        if (!user) {
          finish();
          redirectNeuToLogin(getNeuCurrentNext(), loginPath, { reason: NEU_DEFAULT_REASON });
          return;
        }

        finish();
        resolve(user);
      },
      (error) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        finish();
        console.error('[neu-auth-gate] auth check failed', error);
        redirectNeuToLogin(getNeuCurrentNext(), loginPath, { reason: NEU_DEFAULT_REASON });
        reject(error);
      },
    );
  });
}
