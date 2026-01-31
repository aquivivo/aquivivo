// assets/js/pages/services-page.js
// Servicios (catálogo) — Firestore driven + CTA (Payhip / Link / Contact)
// HTML = vista, JS = lógica (sin inline JS)

import { auth, db } from "../firebase-init.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// Contact endpoints (from your provided data)
const CONTACT_EMAIL = "aquivivo.pl@gmail.com";
const CONTACT_WHATSAPP_E164 = "+48669697151"; // display format
const CONTACT_WHATSAPP_DIGITS = "48669697151"; // wa.me requires digits only

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(el, items) {
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = '<div class="hintSmall">—</div>';
    return;
  }

  el.innerHTML = items
    .map((it) => {
      const badge = it.badge
        ? `<span class="pill pill-yellow">${esc(it.badge)}</span>`
        : "";
      const price = it.price ? `<div class="pill">💰 ${esc(it.price)}</div>` : "";

      const ctaLabel =
        it.ctaLabel ||
        (it.ctaType === "payhip"
          ? "Comprar"
          : it.ctaType === "link"
          ? "Reservar"
          : "Contactar");

      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${esc(it.title)}</div>
              <div class="hintSmall">${esc(it.desc)}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${price}
              ${badge}
              <button class="btn-white-outline" type="button"
                data-action="cta"
                data-cta-type="${esc(it.ctaType || "info")}"
                data-cta-url="${esc(it.ctaUrl || "")}"
                data-sku="${esc(it.sku || "")}"
                data-title="${esc(it.title || "")}">
                ${esc(ctaLabel)}
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadServices() {
  // Avoid composite index: fetch all ordered, filter active in JS
  const q1 = query(collection(db, "services"), orderBy("order", "asc"), limit(500));
  const snap = await getDocs(q1);

  const plans = [];
  const consults = [];
  const extras = [];

  snap.forEach((d) => {
    const s = d.data() || {};
    if (s.active === false) return; // default true if missing
    const item = {
      id: d.id,
      sku: String(s.sku || d.id),
      category: String(s.category || "extras"),
      title: String(s.title || ""),
      desc: String(s.desc || ""),
      price: String(s.price || ""),
      badge: String(s.badge || ""),
      order: Number(s.order || 0),
      ctaType: String(s.ctaType || "info"),
      ctaUrl: String(s.ctaUrl || ""),
      ctaLabel: String(s.ctaLabel || ""),
    };

    if (item.category === "plans") plans.push(item);
    else if (item.category === "consults") consults.push(item);
    else extras.push(item);
  });

  renderList($("plansList"), plans);
  renderList($("consultsList"), consults);
  renderList($("extrasList"), extras);

  return { plans, consults, extras };
}

function setContactStatus(text) {
  const el = $("contactStatus");
  if (!el) return;
  el.textContent = text || "";
}

function openUrl(url) {
  // Prefer window.open, fallback to location in case of popup blocker
  try {
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
  } catch (_) {
    window.location.href = url;
  }
}

function openWhatsApp(message) {
  const text = encodeURIComponent(message || "Hola 👋");
  const url = `https://wa.me/${CONTACT_WHATSAPP_DIGITS}?text=${text}`;
  openUrl(url);
}

function openEmail(subject, body) {
  const s = encodeURIComponent(subject || "AquiVivo");
  const b = encodeURIComponent(body || "");
  const url = `mailto:${CONTACT_EMAIL}?subject=${s}&body=${b}`;
  window.location.href = url;
}

function contactNow(serviceTitle) {
  const title = serviceTitle ? `“${serviceTitle}”` : "un servicio";
  const msg = `Hola! Me interesa ${title}. ¿Podemos hablar?`;
  // WhatsApp first, email fallback if something goes wrong
  try {
    openWhatsApp(msg);
    setContactStatus(`Abriendo WhatsApp (${CONTACT_WHATSAPP_E164})…`);
  } catch (e) {
    console.error(e);
    openEmail("Consulta AquiVivo", msg);
    setContactStatus("Abriendo email…");
  }
}

function handleCtaClick({ ctaType, ctaUrl, sku, title }) {
  if (ctaType === "payhip" && ctaUrl) {
    let url = ctaUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://payhip.com/b/${url}`;
    if (!/^https?:\/\//i.test(url)) {
      alert("Enlace inválido.");
      return;
    }
    openUrl(url);
    return;
  }

  if (ctaType === "link" && ctaUrl) {
    const url = ctaUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      alert("Enlace inválido.");
      return;
    }
    openUrl(url);
    return;
  }

  // info / default => contact
  contactNow(title || sku);
}

function initActions() {
  // Bottom "Contactar" button
  const btnContact = $("btnContact");
  btnContact?.addEventListener("click", () => contactNow("un servicio"));

  const btnEmail = $("btnEmail");
  btnEmail?.addEventListener("click", () => {
    openEmail("Consulta AquiVivo", "Hola! Me gustaría recibir más información.");
  });

  const btnWhatsApp = $("btnWhatsApp");
  btnWhatsApp?.addEventListener("click", () => contactNow("un servicio"));

  const btnInstagram = $("btnInstagram");
  btnInstagram?.addEventListener("click", () => openUrl("https://instagram.com/sacariooo"));

  const btnTikTok = $("btnTikTok");
  btnTikTok?.addEventListener("click", () => openUrl("https://www.tiktok.com/@latip0l"));

  // Delegation for item CTA buttons
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action='cta']");
    if (!btn) return;

    handleCtaClick({
      ctaType: btn.getAttribute("data-cta-type") || "info",
      ctaUrl: btn.getAttribute("data-cta-url") || "",
      sku: btn.getAttribute("data-sku") || "",
      title: btn.getAttribute("data-title") || "",
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // layout.js handles redirect
    try {
      await loadServices();
    } catch (e) {
      console.error(e);
      const msg =
        "Error cargando servicios. (Comprueba Firestore Rules: services read)";
      $("plansList").innerHTML = `<div class="hintSmall">${esc(msg)}</div>`;
      $("consultsList").innerHTML = '<div class="hintSmall">—</div>';
      $("extrasList").innerHTML = '<div class="hintSmall">—</div>';
    }
  });

  initActions();
});
