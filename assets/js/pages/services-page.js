
function handleBuyClick(e) {
  const btn = e.target && e.target.closest && e.target.closest("[data-buy-plan]");
  if (!btn) return;
  const planId = btn.getAttribute("data-buy-plan");
  if (!planId) return;

  btn.disabled = true;
  btn.textContent = "Redirigiendo…";
  startCheckout(planId).catch((err) => {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Comprar";
    alert("No se pudo iniciar el pago. Verifica configuración de Stripe.");
  });
}

// assets/js/pages/services-page.js
// Services/Plans listing for AquiVivo
// - Reads Firestore collection: services
// - Renders by category: plans / consults / extras
// - CTA types: info | link | payhip
// - For admins only: quick-apply plan to own account (testing)
import { startCheckout } from "../stripe-checkout.js";


import { auth, db } from "../firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================
   PLAN mapping (same as admin)
   ========================= */
const PLAN_MAP = {
  free:        { levels: ["A1"], days: 7 },

  a1:          { levels: ["A1"], days: 30 },
  a2:          { levels: ["A2"], days: 30 },
  b1:          { levels: ["B1"], days: 30 },
  b2:          { levels: ["B2"], days: 30 },

  premium_a1:  { levels: ["A1", "A2"], days: 30 },
  premium_b1:  { levels: ["A1", "A2", "B1"], days: 30 },
  premium_b2:  { levels: ["A1", "A2", "B1", "B2"], days: 30 },
};

function normalizePlanId(planId) {
  return String(planId || "free").trim();
}

function computeLevelsForPlan(planId) {
  const p = normalizePlanId(planId);
  return PLAN_MAP[p]?.levels ? [...PLAN_MAP[p].levels] : [];
}

function computeUntilForPlan(planId) {
  const p = normalizePlanId(planId);
  const days = PLAN_MAP[p]?.days;
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d;
}


async function resolveUserId(uidOrEmailRaw) {
  const v = String(uidOrEmailRaw || "").trim();
  if (!v) return null;

  // If it's likely an email, search users by emailLower
  if (v.includes("@")) {
    const emailLower = v.toLowerCase();
    const qs = await getDocs(query(collection(db, "users"), where("emailLower", "==", emailLower)));
    let found = null;
    qs.forEach((d) => { if (!found) found = d.id; });
    return found;
  }

  // Otherwise treat as UID
  return v;
}

function setAssignStatus(msg) {
  const el = $("assignStatus");
  if (el) el.textContent = msg || "";
}

async function getRole(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const d = snap.exists() ? snap.data() : {};
    return String(d?.role || "user");
  } catch {
    return "user";
  }
}

function renderRow(sku, s, opts) {
  const { isAdmin } = opts;
  const active = s.active === false ? false : true;
  if (!active) return "";

  const title = esc(s.title || sku);
  const desc = esc(s.desc || "");
  const price = s.price ? `<div class="pill pill-yellow" style="font-weight:900;">${esc(s.price)}</div>` : "";
  const badge = s.badge ? `<div class="pill">${esc(s.badge)}</div>` : "";
  const ctaLabel = esc(s.ctaLabel || (s.category === "plans" ? "Comprar" : "Reservar"));

  let cta = "";
  const ctaType = String(s.ctaType || "info");
  const ctaUrl = String(s.ctaUrl || "").trim();

  if (ctaType === "link" && ctaUrl) {
    cta = `<a class="btn-yellow" target="_blank" rel="noopener" href="${esc(ctaUrl)}">${ctaLabel}</a>`;
  } else if (ctaType === "payhip" && ctaUrl) {
    // admin uses "Payhip code" (e.g. qIPXv). We convert to a buy link.
    const payhipLink = /^https?:\/\//i.test(ctaUrl) ? ctaUrl : `https://payhip.com/b/${ctaUrl}`;
    cta = `<a class="btn-yellow" target="_blank" rel="noopener" href="${esc(payhipLink)}">${ctaLabel}</a>`;
  } else {
    cta = `<button class="btn-yellow" type="button" data-cta="info" data-sku="${esc(sku)}">${ctaLabel}</button>`;
  }

  const adminApply =
    isAdmin && s.category === "plans"
      ? `<button class="btn-white-outline" type="button" data-cta="apply" data-sku="${esc(sku)}">🧪 Asignar a mi cuenta</button>`
      : "";

  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:12px; flex-wrap:wrap;">
        <div style="min-width:240px; flex:1;">
          <div style="font-weight:900;">${title}</div>
          ${desc ? `<div class="hintSmall" style="margin-top:6px;">${desc}</div>` : ""}
          <div class="hintSmall" style="margin-top:8px;">SKU: <b>${esc(sku)}</b></div>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${badge}${price}
          ${cta}
          ${adminApply}
        </div>
      </div>
    </div>
  `;
}

async function loadServices() {
  const plans = $("plansList");
  const consults = $("consultsList");
  const extras = $("extrasList");
  if (!plans || !consults || !extras) return;

  plans.innerHTML = consults.innerHTML = extras.innerHTML = '<div class="hintSmall">Cargando…</div>';

  const snap = await getDocs(query(collection(db, "services"), orderBy("order", "asc")));
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, data: d.data() || {} }));

  return rows;
}

function setContactHint(msg) {
  const st = $("contactStatus");
  if (st) st.textContent = msg || "";
}

function scrollToContact() {
  const el = $("contactCard");
  el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}


async function applyPlanToUser(targetUid, planId, overrideDays) {
  const plan = normalizePlanId(planId);
  const levels = computeLevelsForPlan(plan);
  if (!levels.length) {
    throw new Error("Unknown plan SKU: " + plan);
  }

  // duration: overrideDays (number) or default from PLAN_MAP
  const days = overrideDays ? Number(overrideDays) : (PLAN_MAP[plan]?.days || 30);
  const until = new Date();
  until.setDate(until.getDate() + Number(days));

  await setDoc(
    doc(db, "users", targetUid),
    {
      plan,
      levels,
      accessUntil: until,
      blocked: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { plan, levels, until };
}

async function applyPlanToOwnAccount(uid, planId) {
  const plan = normalizePlanId(planId);
  const levels = computeLevelsForPlan(plan);
  if (!levels.length) {
    setContactHint("⚠️ SKU no reconocido como plan (revisa PLAN_MAP).");
    return;
  }
  const until = computeUntilForPlan(plan);
  setContactHint("Aplicando plan…");

  await setDoc(
    doc(db, "users", uid),
    {
      plan,
      levels,
      accessUntil: until,
      blocked: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  setContactHint(`✅ Plan aplicado: ${plan} · levels=${levels.join(", ")} · hasta ${until?.toLocaleDateString?.() || ""}`);
}

function bindCTAHandlers(opts) {
  const { uid, isAdmin } = opts;

  // List click delegation
  const host = document.querySelector("main");
  host?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-cta]");
    if (!btn) return;

    const act = btn.getAttribute("data-cta");
    const sku = btn.getAttribute("data-sku") || "";

    if (act === "info") {
      localStorage.setItem("lastServiceSku", sku);
      setContactHint(`📌 Para comprar/reservar: escríbeme y menciona el SKU: ${sku}`);
      scrollToContact();
      return;
    }

    if (act === "apply") {
      if (!isAdmin) return;
      if (!uid) return;
      if (!confirm(`Aplicar plan ${sku} a TU cuenta (solo тест)?`)) return;
      try {
        await applyPlanToOwnAccount(uid, sku);
      } catch (err) {
        console.error(err);
        setContactHint("❌ No se pudo aplicar (rules/permissions).");
      }
    }
  });

  $("btnContact")?.addEventListener("click", () => {
    const sku = localStorage.getItem("lastServiceSku") || "";
    setContactHint(sku ? `📌 Escríbeme y menciona el SKU: ${sku}` : "📌 Escríbeme para comprar/reservar.");
    scrollToContact();
  });

  $("btnEmail")?.addEventListener("click", () => {
    const sku = localStorage.getItem("lastServiceSku") || "";
    const subject = encodeURIComponent("AquiVivo — compra / reserva");
    const body = encodeURIComponent(sku ? `Hola! Quiero comprar/reservar: ${sku}` : "Hola! Quiero comprar/reservar un servicio.");
    window.location.href = `mailto:aquivivo.pl@gmail.com?subject=${subject}&body=${body}`;
  });

  $("btnWhatsApp")?.addEventListener("click", () => {
    const sku = localStorage.getItem("lastServiceSku") || "";
    const txt = encodeURIComponent(sku ? `Hola! Quiero comprar/reservar: ${sku}` : "Hola! Quiero comprar/reservar un servicio.");
    window.open(`https://wa.me/48669697151?text=${txt}`, "_blank", "noopener");
  });

  $("btnInstagram")?.addEventListener("click", () => window.open("https://instagram.com/sacariooo", "_blank", "noopener"));
  $("btnTikTok")?.addEventListener("click", () => window.open("https://tiktok.com/@latip0l", "_blank", "noopener"));

  // Admin assign panel (UID/email)
  const adminCard = $("adminAssignCard");
  if (adminCard) adminCard.style.display = (isAdmin ? "block" : "none");

  $("btnAssignUser")?.addEventListener("click", async () => {
    if (!isAdmin) return;
    const who = $("assignUser")?.value || "";
    const planSku = $("assignPlan")?.value || "";
    const days = $("assignDays")?.value || "";

    setAssignStatus("Asignando…");
    try {
      const targetUid = await resolveUserId(who);
      if (!targetUid) { setAssignStatus("⚠️ Falta UID/email."); return; }

      const res = await applyPlanToUser(targetUid, planSku, days);
      setAssignStatus(`✅ OK: ${targetUid} · ${res.plan} · ${res.levels.join(", ")} · hasta ${res.until.toLocaleDateString()}`);
    } catch (e) {
      console.error(e);
      setAssignStatus("❌ No se pudo asignar (SKU/rules).");
    }
  });

  $("btnAssignUserClear")?.addEventListener("click", () => {
    if ($("assignUser")) $("assignUser").value = "";
    if ($("assignPlan")) $("assignPlan").value = "";
    if ($("assignDays")) $("assignDays").value = "";
    setAssignStatus("");
  });

}

async function renderAll(rows, opts) {
  const plans = $("plansList");
  const consults = $("consultsList");
  const extras = $("extrasList");
  if (!plans || !consults || !extras) return;

  const byCat = { plans: [], consults: [], extras: [] };

  for (const r of rows) {
    const cat = String(r.data.category || "extras");
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(renderRow(r.id, r.data, opts));
  }

  plans.innerHTML = byCat.plans.filter(Boolean).join("") || '<div class="hintSmall">—</div>';
  consults.innerHTML = byCat.consults.filter(Boolean).join("") || '<div class="hintSmall">—</div>';
  extras.innerHTML = byCat.extras.filter(Boolean).join("") || '<div class="hintSmall">—</div>';
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    const uid = user?.uid || null;
    const role = uid ? await getRole(uid) : "user";
    const isAdmin = role === "admin";

    try {
      const rows = await loadServices();
      await renderAll(rows || [], { uid, isAdmin });
      bindCTAHandlers({ uid, isAdmin });
    } catch (e) {
      console.error("[services-page]", e);
      setContactHint("❌ Error cargando servicios.");
      const plans = $("plansList");
      const consults = $("consultsList");
      const extras = $("extrasList");
      if (plans) plans.innerHTML = '<div class="hintSmall">Error.</div>';
      if (consults) consults.innerHTML = '<div class="hintSmall">Error.</div>';
      if (extras) extras.innerHTML = '<div class="hintSmall">Error.</div>';
    }
  });
});


document.addEventListener("click", handleBuyClick);
