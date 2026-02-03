import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const PROTECT_CLASS = 'content-protect';
const BLUR_CLASS = 'content-blur';
const WATERMARK_CLASS = 'content-watermark';

let protectionEnabled = false;
let listenersBound = false;
let watermarkEl = null;
let watermarkText = '';

function isInputTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return !!target.closest('input, textarea, select, option, [contenteditable="true"]');
}

function blockIfProtected(e) {
  if (!protectionEnabled) return;
  if (isInputTarget(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
}

function onKeydown(e) {
  if (!protectionEnabled) return;
  if (isInputTarget(e.target)) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = String(e.key || '').toLowerCase();
  if (['c', 'x', 's', 'p', 'u', 'a'].includes(key)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('copy', blockIfProtected);
  document.addEventListener('cut', blockIfProtected);
  document.addEventListener('paste', blockIfProtected);
  document.addEventListener('contextmenu', blockIfProtected);
  document.addEventListener('dragstart', blockIfProtected);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', () => {
    if (!protectionEnabled) return;
    if (document.hidden) setBlur(true);
    else setBlur(false);
  });
  window.addEventListener('blur', () => {
    if (!protectionEnabled) return;
    setBlur(true);
  });
  window.addEventListener('focus', () => {
    if (!protectionEnabled) return;
    setBlur(false);
  });
}

function setBlur(enabled) {
  const target = document.body;
  if (!target) return;
  if (enabled) target.classList.add(BLUR_CLASS);
  else target.classList.remove(BLUR_CLASS);
}

function buildWatermark(text) {
  if (!watermarkEl) {
    watermarkEl = document.createElement('div');
    watermarkEl.className = WATERMARK_CLASS;
    document.body.appendChild(watermarkEl);
  }

  if (watermarkEl.dataset.text === text) return;
  watermarkEl.dataset.text = text;
  watermarkEl.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'content-watermark-grid';

  const count = 30;
  for (let i = 0; i < count; i += 1) {
    const span = document.createElement('span');
    span.className = 'content-watermark-item';
    span.textContent = text;
    grid.appendChild(span);
  }

  watermarkEl.appendChild(grid);
}

function setWatermark(text) {
  const safeText = (text || 'AquiVivo').trim() || 'AquiVivo';
  watermarkText = safeText;
  if (!document.body) return;
  buildWatermark(watermarkText);
  watermarkEl.style.display = protectionEnabled ? 'block' : 'none';
}

function setProtection(enabled, text) {
  protectionEnabled = !!enabled;
  const target = document.querySelector('main.page') || document.body;
  if (!target) return;
  if (protectionEnabled) target.classList.add(PROTECT_CLASS);
  else target.classList.remove(PROTECT_CLASS);
  bindListeners();
  if (protectionEnabled) {
    setWatermark(text);
  } else {
    if (watermarkEl) watermarkEl.style.display = 'none';
    setBlur(false);
  }
}

async function isAdminUser(user) {
  if (!user?.uid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : {};
    return data.admin === true || String(data?.role || '').toLowerCase() === 'admin';
  } catch (e) {
    console.warn('[content-protect] admin check failed', e);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    const isAdmin = await isAdminUser(user);
    const email = user?.email || '';
    setProtection(!isAdmin, email);
  });
});
