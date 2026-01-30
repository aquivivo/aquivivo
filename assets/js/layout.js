// assets/js/layout.js
// Injects unified top navigation (logo + buttons) and optional coffee.
// Works on all pages that include: <div id="appHeader"></div>

(function () {
  const $ = (sel) => document.querySelector(sel);

  function buildHeader() {
    const host = document.getElementById("appHeader");
    if (!host) return;

    const page = (document.body && document.body.dataset && document.body.dataset.page) ? document.body.dataset.page : "";
    const qs = new URLSearchParams(location.search);
    const level = (qs.get("level") || "A1").toUpperCase();
    const slug = qs.get("slug") || qs.get("id") || "";

    // Decide which buttons to show (simple + safe defaults)
    const showPanel = page !== "login";
    const showCourse = page !== "login";
    const showBack = page !== "index";
    const showLogout = page !== "login" && page !== "index";

    // Links
    const hrefInicio = "index.html";
    const hrefPanel = "espanel.html";
    const hrefCourse = `course.html?level=${encodeURIComponent(level)}`;

    // Build HTML
    host.innerHTML = `
      <div class="nav-glass">
        <div class="nav-line" aria-hidden="true"></div>
        <div class="nav-inner">
          <a class="brand" href="${hrefInicio}" aria-label="AquiVivo — inicio">
            <img src="assets/img/logo.png" alt="AquiVivo" />
          </a>

          <div class="nav-actions">
            ${showCourse ? `<a class="btn-white-outline" id="btnLeccion" href="${hrefCourse}">📚 Curso</a>` : ``}
            ${showPanel ? `<a class="btn-white-outline" id="btnPanel" href="${hrefPanel}">🏠 Panel</a>` : ``}
            <a class="btn-white-outline" id="btnInicio" href="${hrefInicio}">✨ Inicio</a>
            ${showBack ? `<button class="btn" id="btnAtras" type="button">⬅️ Atrás</button>` : ``}
            ${showLogout ? `<button class="btn-red" id="btnLogout" type="button">Cerrar sesión</button>` : ``}
          </div>
        </div>
      </div>
    `;

    // Back button behavior
    const backBtn = document.getElementById("btnAtras");
    if (backBtn) {
      backBtn.addEventListener("click", () => history.length > 1 ? history.back() : (location.href = hrefPanel));
    }

    // Optional coffee (enabled per-page)
    // Enable on any page by adding: <body data-coffee="1">
    if ((document.body.dataset.coffee || "") === "1") {
      if (!document.getElementById("coffeeFloat")) {
        const coffee = document.createElement("div");
        coffee.id = "coffeeFloat";
        coffee.setAttribute("aria-hidden", "true");
        coffee.innerHTML = `<img src="assets/img/coffeeFloat.svg" alt="">`;
        document.body.appendChild(coffee);
      }
    }
  }

  if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", buildHeader);
} else {
  buildHeader();
}
})();