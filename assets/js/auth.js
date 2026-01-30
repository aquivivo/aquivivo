// assets/js/auth.js
import { auth } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

function setMsg(text, type) {
  const el = $("message");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg" + (type ? " " + type : "");
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
      await signInWithEmailAndPassword(auth, email, pass);
      setMsg("✅ Sesión iniciada.", "ok");

      const qs = new URLSearchParams(window.location.search);
      const nextUrl = qs.get("next") || "espanel.html";
      window.location.href = nextUrl;
    } catch (err) {
      setMsg("Error: " + (err?.message || err), "error");
    }
  }

  async function doRegister() {
    const email = (emailInput?.value || "").trim();
    const pass = (passwordInput?.value || "").trim();
    if (!email || !pass) return setMsg("Completa email y contraseña.", "error");
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      setMsg("🎉 Cuenta creada.", "ok");

      const qs = new URLSearchParams(window.location.search);
      const nextUrl = qs.get("next") || "espanel.html";
      window.location.href = nextUrl;
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

  loginBtn?.addEventListener("click", (e) => { e.preventDefault(); doLogin(); });
  registerBtn?.addEventListener("click", (e) => { e.preventDefault(); doRegister(); });
  resetBtn?.addEventListener("click", (e) => { e.preventDefault(); doReset(); });

  // Enter to login
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
});
