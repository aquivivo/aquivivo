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

      // block unverified accounts
      if (cred.user && !cred.user.emailVerified) {
        await sendEmailVerification(cred.user).catch(() => {});
        await signOut(auth).catch(() => {});
        setMsg(
          "⚠️ Confirma tu correo. Te reenvié el email de verificación. Luego inicia sesión otra vez.",
          "error"
        );
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
      await sendEmailVerification(cred.user);

      // sign out and force verification before using app
      await signOut(auth).catch(() => {});

      setMsg(
        "🎉 Cuenta creada. 📩 Revisa tu correo y confirma tu email. Después, inicia sesión.",
        "ok"
      );
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
