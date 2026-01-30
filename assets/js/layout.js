// assets/js/layout.js
// Injects unified header + provides logout + protects private pages:
// - redirects to login if not authenticated
// - blocks access if email not verified

import { auth } from "./firebase-init.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

(function () {
  const PUBLIC_PAGES = new Set(["login", "index"]);

  function buildHeader(level) {
    const host = document.getElementById("appHeader");
    if (!host) return;

    const page = document.body?.dataset?.page || "";
    const qs = new URLSearchParams(location.search);
    const lvl = (level || qs.get("level") || "A1").toUpperCase();

    const showNav = page !== "login";
    const showLogout = page !== "login" && page !== "index";

    const hrefInicio = "index.html";
    const hrefPanel = "espanel.html";
    const hrefCourse = `course.html?level=${encodeURIComponent(lvl)}`;

    host.innerHTML = `
      <div class="nav-glass">
        <div class="nav-line"></div>
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>
          <div class="nav-actions">
            ${showNav ? `<a class="btn-white-outline" href="${hrefCourse}">📚 Curso</a>` : ``}
            ${showNav ? `<a class="btn-white-outline" href="${hrefPanel}">🏠 Panel</a>` : ``}
            <a class="btn-white-outline" href="${hrefInicio}">✨ Inicio</a>
            ${showNav ? `<button class="btn-white-outline" id="btnAtras" type="button">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>` : ``}
          </div>
        </div>
      </div>
    `;

    const backBtn = document.getElementById("btnAtras");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        const before = location.href;
        history.back();
        setTimeout(() => {
          if (location.href === before) location.href = hrefPanel;
        }, 300);
      });
    }

    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
        } catch (e) {
          console.error(e);
        }
        window.location.href = "login.html";
      });
    }
  }

  function protectPage(user) {
    const page = document.body?.dataset?.page || "";
    if (PUBLIC_PAGES.has(page)) return;

    // not logged in
    if (!user) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      window.location.href = `login.html?next=${next}`;
      return;
    }

    // not verified
    if (user.email && user.emailVerified === false) {
      signOut(auth).catch(() => {});
      window.location.href = "login.html";
      return;
    }
  }

  function init() {
    // header immediately (level from URL)
    buildHeader();

    // auth guard
    onAuthStateChanged(auth, (user) => {
      protectPage(user);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
