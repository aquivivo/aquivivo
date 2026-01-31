// assets/js/auth.js
// Login / Register / Reset (modular). Adds:
// - email verification on register
// - blocks login if email not verified
// - creates users/{uid} doc on register so it appears in admin immediately

import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function setMsg(text, type) {
  const el = $("message");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg" + (type ? " " + type : "");
}


function getQueryParam(name) {
  try {
    const qs = new URLSearchParams(location.search);
    return qs.get(name) || "";
  } catch {
    return "";
  }
}

function initFromUrl() {
  const reason = getQueryParam("reason");
  if (reason === "verify") {
    setMsg(
      "📩 Tu cuenta requiere verificación de correo para acceder al panel y a los cursos. Inicia sesión y confirma tu email.",
      "error"
    );
    ensureVerifyBox();
    setVerifyHint("Después de iniciar sesión, revisa tu correo y pulsa “Ya verifiqué”.");
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
      setVerifyHint('Aún no está verificado. Abre el enlace del email y vuelve aquí.');
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
    const next = qs.get("next");
    if (!next) return "espanel.html";
    // basic safety: allow only same-origin relative paths
    if (next.startsWith("http://") || next.startsWith("https://")) return "espanel.html";
    if (next.includes("..")) return "espanel.html";
    return next;
  } catch {
    return "espanel.html";
  }
}

async function ensureUserDoc(uid, email, isAdmin) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const now = new Date();
  const trialEnd = new Date(now.getTime());

  if (isAdmin) {
    trialEnd.setFullYear(2099);
  } else {
    trialEnd.setDate(now.getDate() + 7); // 7-day trial
  }

  await setDoc(ref, {
    email: email || null,
    createdAt: serverTimestamp(),
    access: isAdmin
      ? {
          A1: { freeUntil: trialEnd.toISOString() },
          A2: { freeUntil: trialEnd.toISOString() },
          B1: { freeUntil: trialEnd.toISOString() },
          B2: { freeUntil: trialEnd.toISOString() },
        }
      : {
          A1: { freeUntil: trialEnd.toISOString() },
          A2: null,
          B1: null,
          B2: null,
        },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initFromUrl();
  try {
    const qs = new URLSearchParams(location.search);
    const reason = qs.get('reason');
    if (reason === 'verify') {
      ensureVerifyBox();
      setMsg("⚠️ Antes de continuar, confirma tu email.", 'warn');
    }
  } catch {}

  // If user is already signed in but unverified, keep them here with verify tools
  setTimeout(() => {
    const u = auth.currentUser;
    if (u && !u.emailVerified) {
      ensureVerifyBox();
    }
  }, 300);

  const emailInput = $("email");
  const passwordInput = $("password");
  const loginBtn = $("loginBtn");
  const registerBtn = $("registerBtn");
  const resetBtn = $("resetPasswordBtn");
  const togglePassword = $("togglePassword");

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      passwordInput.type = passwordInput.type === "password" ? "text" : "password";
    });
  }

  async function doLogin() {
    const email = (emailInput?.value || "").trim();
    const pass = (passwordInput?.value || "").trim();
    if (!email || !pass) return setMsg("Completa email y contraseña.", "error");

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      // unverified: keep session, show verify tools, block app via layout.js
      if (cred.user && !cred.user.emailVerified) {
        await sendEmailVerification(cred.user).catch(() => {});
        setMsg(
          "⚠️ Confirma tu correo para acceder. Te reenvié el email de verificación.",
          "error"
        );
        ensureVerifyBox();
        setVerifyHint('Abre el correo, confirma y luego pulsa “Ya verifiqué”.');
        return;
      }

      setMsg("✅ Sesión iniciada.", "ok");
      window.location.href = getNextUrl();
    } catch (err) {
      setMsg("Error: " + (err?.message || err), "error");
    }
  }

  async function doRegister() {
    const email = (emailInput?.value || "").trim();
    const pass = (passwordInput?.value || "").trim();
    if (!email || !pass) return setMsg("Completa email y contraseña.", "error");

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      // create users/{uid} doc so admin can see immediately
      // admin is determined later in panel; here always false
      await ensureUserDoc(cred.user.uid, cred.user.email, false);

      // send verification email
      await sendEmailVerification(cred.user).catch(() => {});

      setMsg(
        "🎉 Cuenta creada. 📩 Revisa tu correo y confirma tu email. Luego pulsa “Ya verifiqué”.",
        "ok"
      );
      ensureVerifyBox();
      setVerifyHint('Si no ves el correo, revisa Spam y usa “Reenviar email”.');
    } catch (err) {
      setMsg("Error: " + (err?.message || err), "error");
    }
  }

  async function doReset() {
    const email = (emailInput?.value || "").trim();
    if (!email) return setMsg("Ingresa tu correo para restablecer tu contraseña.", "error");
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("📩 Se envió un correo para restablecer tu contraseña.", "ok");
    } catch (err) {
      setMsg("Error: " + (err?.message || err), "error");
    }
  }

  loginBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    doLogin();
  });
  registerBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    doRegister();
  });
  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    doReset();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
});
