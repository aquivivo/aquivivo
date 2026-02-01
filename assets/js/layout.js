// assets/js/layout.js
// Shared header for ALL pages except index.html (index uses layout-index.js)
// ✅ Safe injection (doesn't replace body -> footers remain)
// ✅ Uses firebase-init.js (matches your project)
// ✅ Shows Login when signed out, Logout when signed in

import { auth } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

(function () {
  const path = (location.pathname || "").toLowerCase();
  const isIndex =
    path === "/" ||
    path.endsWith("/index") ||
    path.endsWith("/index.html") ||
    path.endsWith("index.html");
  if (isIndex) return; // index uses layout-index.js

  function ensureMount() {
    let mount = document.getElementById("appHeader");
    if (mount) return mount;

    mount = document.createElement("div");
    mount.id = "appHeader";
    document.body.insertAdjacentElement("afterbegin", mount);
    return mount;
  }

  function buildHeader(user) {
    const logged = !!user;

    // Keep it simple and stable on app pages
    return `
      <header class="topbar nav-glass">
        <div class="nav-inner container">
          <a class="brand" href="index.html" aria-label="AquiVivo">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions" aria-label="Navegación">
            <a class="btn-white-outline" href="services.html">✨ Servicios</a>
            <a class="btn-white-outline" href="course.html">📚 Curso</a>
            <a class="btn-yellow" href="espanel.html">🏠 Panel</a>
            <button class="btn-white-outline" id="btnBack" type="button">⬅️ Atrás</button>
            ${
              logged
                ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>`
                : `<a class="btn-white-outline" href="login.html">🔐 Iniciar sesión</a>`
            }
          </div>
        </div>

        <div class="nav-line nav-line-below"></div>
      </header>
    `;
  }

  function wireHeader() {
    const backBtn = document.getElementById("btnBack");
    if (backBtn && !backBtn.dataset.wired) {
      backBtn.dataset.wired = "1";
      backBtn.addEventListener("click", () => {
        if (history.length > 1) history.back();
        else location.href = "index.html";
      });
    }

    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn && !logoutBtn.dataset.wired) {
      logoutBtn.dataset.wired = "1";
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
        } catch (e) {
          console.error("Logout error", e);
        }
        location.href = "index.html";
      });
    }
  }

  const mount = ensureMount();

  // Render immediately + re-render on auth changes
  onAuthStateChanged(auth, (user) => {
    mount.innerHTML = buildHeader(user);
    wireHeader();
  });
})();
