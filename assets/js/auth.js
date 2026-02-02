// assets/js/auth.js
// Login / Register / Reset (modular)
// ✅ Creates users/{uid} on register (with 7-day A1 trial)
// ✅ Blocks access until email is verified
// ✅ Adds emailLower for admin assignment/search

import { auth, db } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

function setMsg(text, type) {
  const el = $('message');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg' + (type ? ' ' + type : '');
}

function getQueryParam(name) {
  try {
    const qs = new URLSearchParams(location.search);
    return qs.get(name) || '';
  } catch {
    return '';
  }
}

function initFromUrl() {
  const reason = getQueryParam('reason');
  if (reason === 'verify') {
    setMsg(
      '📩 Tu cuenta requiere verificación de correo para acceder al panel y a los cursos. Inicia sesión y confirma tu email.',
      'error',
    );
    ensureVerifyBox();
    setVerifyHint(
      'Después de iniciar sesión, revisa tu correo y pulsa “Ya verifiqué”.',
    );
  }
}

// --- Email verification UI (login only) ---
function ensureVerifyBox() {
  const host = document.querySelector('.form-card') || document.body;
  if (!host) return;

  let box = document.getElementById('verifyBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'verifyBox';
    box.className = 'card';
    box.style.marginTop = '14px';
    box.style.padding = '14px';
    box.innerHTML = `
      <div class="sectionTitle" style="font-size:18px; margin:0 0 6px;">📩 Verifica tu correo</div>
      <div class="subtitle" style="margin:0 0 12px;">
        Para acceder al panel y a los cursos, primero confirma tu email.
      </div>
      <div class="metaRow" style="flex-wrap:wrap; gap:10px;">
        <button id="btnResendVerify" class="btn-white-outline" type="button">Reenviar email</button>
        <button id="btnIVerified" class="btn-yellow" type="button">Ya verifiqué</button>
      </div>
      <div class="hintSmall" id="verifyHint" style="margin-top:10px; display:none;"></div>
    `;

    const msgEl = document.getElementById('message');
    if (msgEl && msgEl.parentElement) {
      msgEl.parentElement.insertBefore(box, msgEl.nextSibling);
    } else {
      host.appendChild(box);
    }
  }

  const btnResend = document.getElementById('btnResendVerify');
  const btnDone = document.getElementById('btnIVerified');
  if (btnResend && !btnResend.dataset.wired) {
    btnResend.dataset.wired = '1';
    btnResend.addEventListener('click', resendVerification);
  }
  if (btnDone && !btnDone.dataset.wired) {
    btnDone.dataset.wired = '1';
    btnDone.addEventListener('click', checkVerification);
  }
}

function setVerifyHint(text) {
  const el = document.getElementById('verifyHint');
  if (!el) return;
  if (!text) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = text;
}

// --- Logout box (for switching accounts on shared devices) ---
function ensureLogoutBox() {
  const host = document.querySelector('.form-card') || document.body;
  if (!host) return null;

  let box = document.getElementById('logoutBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'logoutBox';
    box.className = 'card';
    box.style.marginTop = '14px';
    box.style.padding = '14px';
    box.innerHTML = `
      <div class="sectionTitle" style="font-size:18px; margin:0 0 6px;">👤 Cuenta activa</div>
      <div class="subtitle" id="logoutSubtitle" style="margin:0 0 12px;"></div>
      <div class="metaRow" style="flex-wrap:wrap; gap:10px;">
        <button id="btnLogoutHere" class="btn-red" type="button">Cerrar sesión</button>
      </div>
    `;

    const msgEl = document.getElementById('message');
    if (msgEl && msgEl.parentElement) {
      msgEl.parentElement.insertBefore(box, msgEl.nextSibling);
    } else {
      host.appendChild(box);
    }
  }

  const btnLogout = document.getElementById('btnLogoutHere');
  if (btnLogout && !btnLogout.dataset.wired) {
    btnLogout.dataset.wired = '1';
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        setMsg('Sesión cerrada. Ahora puedes iniciar con otra cuenta.', 'ok');
      } catch (e) {
        console.error(e);
        setMsg('Error al cerrar sesión. Intenta de nuevo.', 'error');
      }
    });
  }

  return box;
}

let __resendCooldownUntil = 0;

async function resendVerification() {
  try {
    const u = auth.currentUser;
    if (!u) {
      setVerifyHint('Primero inicia sesión.');
      return;
    }
    const now = Date.now();
    if (now < __resendCooldownUntil) {
      const sec = Math.ceil((__resendCooldownUntil - now) / 1000);
      setVerifyHint(`Espera ${sec}s y vuelve a intentar.`);
      return;
    }
    await sendEmailVerification(u);
    __resendCooldownUntil = Date.now() + 30_000;
    setVerifyHint('✅ Email reenviado. Revisa tu bandeja de entrada y Spam.');
  } catch (e) {
    console.error(e);
    setVerifyHint('❌ No se pudo reenviar. Intenta de nuevo en un momento.');
  }
}

async function checkVerification() {
  try {
    const u = auth.currentUser;
    if (!u) {
      setVerifyHint('Primero inicia sesión.');
      return;
    }
    await u.reload();
    if (u.emailVerified) {
      setVerifyHint('✅ Verificado. Entrando…');
      window.location.href = getNextUrl();
    } else {
      setVerifyHint(
        'Aún no está verificado. Abre el enlace del email y vuelve aquí.',
      );
    }
  } catch (e) {
    console.error(e);
    setVerifyHint('❌ Error al comprobar. Intenta de nuevo.');
  }
}

// read ?next=... (optional)
function getNextUrl() {
  try {
    const qs = new URLSearchParams(location.search);
    const next = qs.get('next');
    if (!next) return 'espanel.html';
    // basic safety: allow only same-origin relative paths
    if (next.startsWith('http://') || next.startsWith('https://'))
      return 'espanel.html';
    if (next.includes('..')) return 'espanel.html';
    return next;
  } catch {
    return 'espanel.html';
  }
}

function computeTrialAccessUntil(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return Timestamp.fromDate(d);
}

async function ensureUserDoc(uid, email, displayNameOptional, genderOptional) {
  // Ensures users/{uid} exists and contains minimum contract fields used by the app/admin.
  // On first creation: grants 7-day A1 trial.
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const emailLower = (email || '').toLowerCase() || null;
    await setDoc(
      ref,
      {
        email: email || null,
        emailLower,
        name: displayNameOptional || null,
        gender: genderOptional || null,

        // access model
        plan: 'free',
        levels: ['A1'],
        accessUntil: computeTrialAccessUntil(7),

        // flags
        admin: false,
        role: 'user',
        access: true,
        blocked: false,

        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  // If doc exists, only fill missing safe fields (never overwrite privileges/plans)
  const data = snap.data() || {};
  const patch = {};

  if (!data.email && email) patch.email = email;
  if (!data.emailLower && email) patch.emailLower = String(email).toLowerCase();
  if (!data.name && displayNameOptional) patch.name = displayNameOptional;
  if (!data.gender && genderOptional) patch.gender = genderOptional;

  if (typeof data.admin !== 'boolean') patch.admin = false;
  if (typeof data.blocked !== 'boolean') patch.blocked = false;
  if (typeof data.access !== 'boolean') patch.access = true;
  if (!data.createdAt) patch.createdAt = serverTimestamp();

  if (Object.keys(patch).length) {
    await setDoc(ref, patch, { merge: true });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initFromUrl();

  try {
    const qs = new URLSearchParams(location.search);
    const reason = qs.get('reason');
    if (reason === 'verify') {
      ensureVerifyBox();
      setMsg('⚠️ Antes de continuar, confirma tu email.', 'warn');
    }
  } catch {}

  // If user is already signed in but unverified, keep them here with verify tools
  setTimeout(() => {
    const u = auth.currentUser;
    if (u && !u.emailVerified) {
      ensureVerifyBox();
    }
  }, 300);

  // If user is already signed in, show logout box to switch accounts (mobile)
  setTimeout(() => {
    const u = auth.currentUser;
    if (!u) return;
    const box = ensureLogoutBox();
    const sub = document.getElementById('logoutSubtitle');
    if (box && sub) {
      sub.textContent = `Estás conectado como ${u.email || '—'}.`;
    }
  }, 350);

  const nameInput = $('name');
  const emailInput = $('email');
  const passwordInput = $('password');
  const loginBtn = $('loginBtn');
  const registerBtn = $('registerBtn');
  const resetBtn = $('resetPasswordBtn');
  const togglePassword = $('togglePassword');

  let registerBusy = false;
  const setRegisterBusy = (yes) => {
    registerBusy = !!yes;
    if (registerBtn) registerBtn.disabled = registerBusy;
  };

  const COOLDOWN_KEY = 'authCooldownUntil';
  const getCooldownRemaining = () => {
    const raw = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
    const diff = raw - Date.now();
    return diff > 0 ? diff : 0;
  };
  const setCooldownMs = (ms) => {
    const until = Date.now() + Number(ms || 0);
    localStorage.setItem(COOLDOWN_KEY, String(until));
  };
  const ensureCooldownMsg = () => {
    const remaining = getCooldownRemaining();
    if (remaining > 0) {
      const sec = Math.ceil(remaining / 1000);
      setMsg(`Demasiados intentos. Espera ${sec}s y prueba de nuevo.`, 'error');
      return true;
    }
    return false;
  };

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      passwordInput.type =
        passwordInput.type === 'password' ? 'text' : 'password';
    });
  }

  // ✅ prevent form submit reload (mobile/Enter key issues)
  const form =
    (loginBtn && loginBtn.closest('form')) ||
    (emailInput && emailInput.closest('form')) ||
    (passwordInput && passwordInput.closest('form'));

  if (form && !form.dataset.noSubmitReload) {
    form.dataset.noSubmitReload = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      doLogin();
    });
  }

  async function doLogin() {
    if (ensureCooldownMsg()) return;
    const email = (emailInput?.value || '').trim();
    const pass = (passwordInput?.value || '').trim();
    if (!email || !pass) return setMsg('Completa email y contraseña.', 'error');

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      // Ensure users/{uid} exists (for admin panel / guards)
      await ensureUserDoc(cred.user.uid, cred.user.email, null, null);

      // unverified: keep session, show verify tools
      if (cred.user && !cred.user.emailVerified) {
        await sendEmailVerification(cred.user).catch(() => {});
        setMsg(
          '⚠️ Confirma tu correo para acceder. Te reenvié el email de verificación.',
          'error',
        );
        ensureVerifyBox();
        setVerifyHint('Abre el correo, confirma y luego pulsa “Ya verifiqué”.');
        return;
      }

      setMsg('✅ Sesión iniciada.', 'ok');
      window.location.href = getNextUrl();
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') {
        setCooldownMs(120_000);
        ensureCooldownMsg();
        return;
      }
      setMsg('Error: ' + (err?.message || err), 'error');
    }
  }

  async function doRegister() {
    if (registerBusy) return;
    if (ensureCooldownMsg()) return;
    const name = (nameInput?.value || '').trim();
    const gender = (
      document.querySelector('input[name="gender"]:checked')?.value || ''
    ).trim();
    const email = (emailInput?.value || '').trim();
    const pass = (passwordInput?.value || '').trim();
    if (!email || !pass) return setMsg('Completa email y contraseña.', 'error');
    if (!gender) return setMsg('Elige Papi o Mami para registrarte.', 'error');

    try {
      setRegisterBusy(true);
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      // Create users/{uid} doc with 7-day A1 trial
      await ensureUserDoc(
        cred.user.uid,
        cred.user.email,
        name || null,
        gender || null,
      );

      // send verification email
      await sendEmailVerification(cred.user).catch(() => {});

      setMsg(
        '🎉 Cuenta creada. 📩 Revisa tu correo y confirma tu email. Luego pulsa “Ya verifiqué”.',
        'ok',
      );
      ensureVerifyBox();
      setVerifyHint('Si no ves el correo, revisa Spam y usa “Reenviar email”.');
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') {
        setCooldownMs(120_000);
        ensureCooldownMsg();
        return;
      }
      setMsg('Error: ' + (err?.message || err), 'error');
    } finally {
      setRegisterBusy(false);
    }
  }

  async function doReset() {
    if (ensureCooldownMsg()) return;
    const email = (emailInput?.value || '').trim();
    if (!email)
      return setMsg(
        'Ingresa tu correo para restablecer tu contraseña.',
        'error',
      );
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg('📩 Se envió un correo para restablecer tu contraseña.', 'ok');
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') {
        setCooldownMs(120_000);
        ensureCooldownMsg();
        return;
      }
      setMsg('Error: ' + (err?.message || err), 'error');
    }
  }

  loginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doLogin();
  });

  registerBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doRegister();
  });

  resetBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    doReset();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const isInput = t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON');
    if (isInput) e.preventDefault();
    doLogin();
  });
});
