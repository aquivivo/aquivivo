// assets/js/logger.js
// Simple client error logger -> Firestore collection: app_logs

import { auth, db } from './firebase-init.js';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const MAX_PER_SESSION = 20;
const DEDUPE_WINDOW_MS = 60 * 1000;
const lastLog = new Map();
let logCount = 0;

function toSafeString(v, max = 2000) {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (!s) return '';
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return String(v || '');
  }
}

function makeKey(type, msg, stack, page) {
  return `${type}|${msg || ''}|${(stack || '').slice(0, 120)}|${page || ''}`;
}

async function logToFirestore(payload) {
  try {
    await addDoc(collection(db, 'app_logs'), payload);
  } catch (e) {
    // silent: avoid infinite loops if logging fails
    console.warn('[logger] write failed', e?.code || e);
  }
}

function buildBase() {
  const user = auth.currentUser;
  return {
    page: location.pathname + location.search,
    uid: user?.uid || null,
    email: user?.email || null,
    userAgent: navigator.userAgent,
    lang: navigator.language || '',
    sessionId: SESSION_ID,
    createdAt: serverTimestamp(),
  };
}

function shouldSkip(type, msg, stack, page) {
  if (logCount >= MAX_PER_SESSION) return true;
  const key = makeKey(type, msg, stack, page);
  const now = Date.now();
  const last = lastLog.get(key) || 0;
  if (now - last < DEDUPE_WINDOW_MS) return true;
  lastLog.set(key, now);
  logCount += 1;
  return false;
}

export function logAppError(type, message, stack, extra = {}) {
  const page = location.pathname + location.search;
  if (shouldSkip(type, message, stack, page)) return;

  const payload = {
    ...buildBase(),
    type: String(type || 'error'),
    message: toSafeString(message, 2000),
    stack: toSafeString(stack, 3000),
    extra,
  };

  logToFirestore(payload);
}

// Global handlers
window.addEventListener('error', (event) => {
  try {
    if (event?.error && event.error.message) {
      logAppError(
        'error',
        event.error.message,
        event.error.stack || '',
        {
          file: event.filename || '',
          line: event.lineno || 0,
          col: event.colno || 0,
        },
      );
      return;
    }

    // Resource loading error (img/script)
    const target = event?.target;
    if (target && target.tagName) {
      logAppError('resource', `${target.tagName} failed to load`, '', {
        src: target.src || target.href || '',
      });
      return;
    }

    if (event?.message) {
      logAppError('error', event.message, '', {
        file: event.filename || '',
        line: event.lineno || 0,
        col: event.colno || 0,
      });
    }
  } catch {}
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event?.reason;
    const message =
      reason?.message || (typeof reason === 'string' ? reason : 'Unhandled rejection');
    const stack = reason?.stack || '';
    logAppError('rejection', message, stack, { reason: toSafeString(reason, 1200) });
  } catch {}
});
