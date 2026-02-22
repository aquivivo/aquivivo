import { auth } from './neu-firebase-init.js';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

const DEFAULT_NEXT = 'neu-social-app.html';
const state = { mode: 'login', busy: false, passwordVisible: false };

const ui = {
  form: document.getElementById('neuAuthForm'),
  title: document.getElementById('neuAuthTitle'),
  subtitle: document.getElementById('neuAuthSubtitle'),
  email: document.getElementById('neuEmail'),
  password: document.getElementById('neuPassword'),
  submit: document.getElementById('neuSubmitBtn'),
  googleBtn: document.getElementById('neuGoogleBtn'),
  toggleLink: document.getElementById('neuToggleMode'),
  resetBtn: document.getElementById('neuResetBtn'),
  modeLoginBtn: document.getElementById('neuModeLogin'),
  modeRegisterBtn: document.getElementById('neuModeRegister'),
  togglePasswordBtn: document.getElementById('neuTogglePassword'),
  msg: document.getElementById('neuAuthMessage'),
  submitLabel: null,
  googleLabel: null,
};

function sanitizeNextTarget(raw) {
  const value = String(raw || '').trim();
  if (!value) return DEFAULT_NEXT;
  if (value.startsWith('http://') || value.startsWith('https://')) return DEFAULT_NEXT;
  if (value.startsWith('//')) return DEFAULT_NEXT;
  if (value.includes('..')) return DEFAULT_NEXT;
  return value.startsWith('/') ? value.slice(1) : value;
}

function getNextTarget() {
  try {
    const qs = new URLSearchParams(location.search);
    return sanitizeNextTarget(qs.get('next'));
  } catch {
    return DEFAULT_NEXT;
  }
}

function getReason() {
  try {
    const qs = new URLSearchParams(location.search);
    return String(qs.get('reason') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function setMessage(text, type = '') {
  if (!ui.msg) return;
  ui.msg.textContent = text || '';
  ui.msg.className = 'neu-auth-message' + (type ? ` ${type}` : '');
}

function mapAuthError(error, mode) {
  const code = String(error?.code || '');
  const map = {
    'auth/invalid-credential': 'Email o contrase\u00f1a incorrectos.',
    'auth/wrong-password': 'Email o contrase\u00f1a incorrectos.',
    'auth/user-not-found': 'Email o contrase\u00f1a incorrectos.',
    'auth/invalid-email': 'Introduce un email v\u00e1lido.',
    'auth/user-disabled': 'Esta cuenta est\u00e1 desactivada.',
    'auth/email-already-in-use': 'Este email ya est\u00e1 registrado.',
    'auth/weak-password': 'La contrase\u00f1a es demasiado d\u00e9bil.',
    'auth/too-many-requests': 'Demasiados intentos. Int\u00e9ntalo m\u00e1s tarde.',
    'auth/network-request-failed': 'Sin conexi\u00f3n. Revisa internet.',
    'auth/popup-closed-by-user': 'Has cerrado la ventana de Google.',
    'auth/cancelled-popup-request': 'Solicitud cancelada.',
    'auth/popup-blocked': 'El navegador bloque\u00f3 la ventana de Google.',
  };
  if (map[code]) return map[code];
  if (mode === 'register') return 'No se pudo crear la cuenta.';
  if (mode === 'google') return 'No se pudo iniciar sesi\u00f3n con Google.';
  if (mode === 'reset') return 'No se pudo enviar el correo de recuperaci\u00f3n.';
  return 'No se pudo iniciar sesi\u00f3n.';
}

function getSubmitIdleLabel() {
  return state.mode === 'register' ? 'Crear cuenta' : 'Inicia sesi\u00f3n';
}

function getSubmitBusyLabel() {
  return state.mode === 'register' ? 'Creando cuenta...' : 'Iniciando sesi\u00f3n...';
}

function ensureButtonStructure(button, role) {
  if (!button) return null;
  const existing = button.querySelector('.neu-auth-btn-label');
  if (existing) return existing;

  const initialText = String(button.textContent || '').trim();
  button.textContent = '';

  const label = document.createElement('span');
  label.className = 'neu-auth-btn-label';
  label.textContent = initialText || (role === 'google' ? 'Continuar con Google' : 'Inicia sesi\u00f3n');

  const spinner = document.createElement('span');
  spinner.className = 'neu-auth-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  button.append(label, spinner);
  return label;
}

function setMode(nextMode) {
  state.mode = nextMode === 'register' ? 'register' : 'login';
  const isRegister = state.mode === 'register';

  if (ui.title) ui.title.textContent = isRegister ? 'Crear cuenta neu' : 'Inicia sesi\u00f3n en neu';
  if (ui.subtitle) {
    ui.subtitle.textContent = isRegister
      ? 'Crea tu cuenta para entrar a la app neu.'
      : 'Accede para continuar en la aplicaci\u00f3n neu.';
  }

  if (ui.submitLabel && !state.busy) ui.submitLabel.textContent = getSubmitIdleLabel();
  if (ui.toggleLink) {
    ui.toggleLink.textContent = isRegister
      ? '\u00bfYa tienes cuenta? Inicia sesi\u00f3n'
      : '\u00bfNo tienes cuenta? Crear cuenta';
  }
  if (ui.modeLoginBtn) ui.modeLoginBtn.textContent = 'Inicia sesi\u00f3n';
  if (ui.modeRegisterBtn) ui.modeRegisterBtn.textContent = 'Crear cuenta';
  if (ui.password) ui.password.autocomplete = isRegister ? 'new-password' : 'current-password';

  ui.modeLoginBtn?.classList.toggle('is-active', !isRegister);
  ui.modeRegisterBtn?.classList.toggle('is-active', isRegister);
  setMessage('');
}

function setPasswordVisibility(visible) {
  state.passwordVisible = !!visible;
  if (ui.password) ui.password.type = state.passwordVisible ? 'text' : 'password';
  if (ui.togglePasswordBtn) {
    ui.togglePasswordBtn.textContent = state.passwordVisible
      ? '\u{1F648} Ocultar'
      : '\u{1F441} Mostrar';
    ui.togglePasswordBtn.setAttribute('aria-pressed', state.passwordVisible ? 'true' : 'false');
  }
}

function setBusy(busy, source = 'submit') {
  state.busy = !!busy;
  const disable = state.busy;

  if (ui.submit) {
    ui.submit.disabled = disable;
    ui.submit.classList.toggle('is-loading', disable && source === 'submit');
    ui.submit.setAttribute('aria-busy', disable && source === 'submit' ? 'true' : 'false');
  }
  if (ui.googleBtn) {
    ui.googleBtn.disabled = disable;
    ui.googleBtn.classList.toggle('is-loading', disable && source === 'google');
    ui.googleBtn.setAttribute('aria-busy', disable && source === 'google' ? 'true' : 'false');
  }
  if (ui.submitLabel) {
    ui.submitLabel.textContent = disable
      ? source === 'submit'
        ? getSubmitBusyLabel()
        : 'Procesando...'
      : getSubmitIdleLabel();
  }
  if (ui.googleLabel) {
    ui.googleLabel.textContent = disable && source === 'google'
      ? 'Conectando...'
      : 'Continuar con Google';
  }

  if (ui.email) ui.email.disabled = disable;
  if (ui.password) ui.password.disabled = disable;
  if (ui.resetBtn) ui.resetBtn.disabled = disable;
  if (ui.toggleLink) ui.toggleLink.disabled = disable;
  if (ui.modeLoginBtn) ui.modeLoginBtn.disabled = disable;
  if (ui.modeRegisterBtn) ui.modeRegisterBtn.disabled = disable;
  if (ui.togglePasswordBtn) ui.togglePasswordBtn.disabled = disable;
}

async function submitAuth(event) {
  event?.preventDefault?.();
  if (state.busy) return;

  const email = String(ui.email?.value || '').trim();
  const password = String(ui.password?.value || '');
  if (!email || !password) {
    setMessage('Completa email y contrase\u00f1a.', 'error');
    return;
  }

  setBusy(true, 'submit');
  setMessage('');
  try {
    if (state.mode === 'register') {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    location.href = getNextTarget();
  } catch (error) {
    console.error('[neu-auth] submit failed', error);
    setMessage(mapAuthError(error, state.mode), 'error');
  } finally {
    setBusy(false, 'submit');
  }
}

async function loginWithGoogle() {
  if (state.busy) return;
  setBusy(true, 'google');
  setMessage('');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
    location.href = getNextTarget();
  } catch (error) {
    console.error('[neu-auth] google login failed', error);
    setMessage(mapAuthError(error, 'google'), 'error');
  } finally {
    setBusy(false, 'google');
  }
}

async function resetPassword() {
  if (state.busy) return;
  const email = String(ui.email?.value || '').trim();
  if (!email) {
    setMessage('Escribe tu email para recuperar la contrase\u00f1a.', 'error');
    ui.email?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage('Te enviamos un correo para restablecer tu contrase\u00f1a.', 'ok');
  } catch (error) {
    console.error('[neu-auth] reset failed', error);
    setMessage(mapAuthError(error, 'reset'), 'error');
  }
}

function bindUI() {
  ui.form?.addEventListener('submit', submitAuth);
  ui.password?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    ui.form?.requestSubmit?.();
  });

  ui.toggleLink?.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.busy) return;
    setMode(state.mode === 'register' ? 'login' : 'register');
  });
  ui.modeLoginBtn?.addEventListener('click', () => {
    if (state.busy) return;
    setMode('login');
  });
  ui.modeRegisterBtn?.addEventListener('click', () => {
    if (state.busy) return;
    setMode('register');
  });
  ui.resetBtn?.addEventListener('click', resetPassword);
  ui.googleBtn?.addEventListener('click', loginWithGoogle);
  ui.togglePasswordBtn?.addEventListener('click', () => {
    if (state.busy) return;
    setPasswordVisibility(!state.passwordVisible);
  });
}

function init() {
  ui.submitLabel = ensureButtonStructure(ui.submit, 'submit');
  ui.googleLabel = ensureButtonStructure(ui.googleBtn, 'google');
  setPasswordVisibility(false);
  bindUI();
  setMode('login');

  onAuthStateChanged(auth, (user) => {
    if (user) {
      location.replace(getNextTarget());
      return;
    }
    if (getReason() === 'auth') {
      setMessage('Inicia sesi\u00f3n para continuar.', 'info');
    }
    document.body.classList.add('neu-auth-ready');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

