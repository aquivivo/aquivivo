// assets/js/pages/esadmin-page.js
// AquiVivo Admin (RESTORE): Dashboard + Usuarios + Códigos + Referral + Servicios
// Architecture: no inline JS. Page logic lives here.

import { auth, db } from "../firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
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

function setStatus(el, msg, bad = false) {
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = bad ? "var(--red, #ff6b6b)" : "";
}

async function safeCount(colName, cap = 500) {
  // lightweight count (MVP) – avoids extra Firestore APIs
  const snap = await getDocs(query(collection(db, colName), limit(cap)));
  return snap.size;
}

/* =========================
   DASHBOARD
   ========================= */
async function loadDashboard() {
  const st = $("dashStatus");
  try {
    setStatus(st, "Cargando…");
    const [u, c, s, p] = await Promise.all([
      safeCount("users"),
      safeCount("courses"),
      safeCount("services"),
      safeCount("promo_codes"),
    ]);

    if ($("dashUsers")) $("dashUsers").textContent = String(u);
    if ($("dashCourses")) $("dashCourses").textContent = String(c);
    if ($("dashServices")) $("dashServices").textContent = String(s);
    if ($("dashPromoCodes")) $("dashPromoCodes").textContent = String(p);

    setStatus(st, "Listo ✅");
  } catch (e) {
    console.error("[dashboard]", e);
    setStatus(st, "Error: sprawdź rules / Console.", true);
  }
}

/* =========================
   REFERRAL SETTINGS
   promo_codes/_REFERRAL_SETTINGS
   ========================= */
async function loadReferralSettings() {
  const p = $("refOwnerPercent");
  const s = $("refRewardScope");
  const st = $("refSettingsStatus");
  if (!p || !s) return;

  try {
    const snap = await getDoc(doc(db, "promo_codes", "_REFERRAL_SETTINGS"));
    const data = snap.exists() ? snap.data() : {};
    p.value = data?.percent ?? "";
    s.value = data?.scope ?? "";
  } catch (e) {
    console.error("[referral load]", e);
    setStatus(st, "Error cargando.", true);
  }
}

async function saveReferralSettings() {
  const p = $("refOwnerPercent");
  const s = $("refRewardScope");
  const st = $("refSettingsStatus");
  if (!p || !s) return;

  const percent = Number(p.value || 0);
  const scope = String(s.value || "").trim();

  setStatus(st, "Guardando…");
  try {
    await setDoc(
      doc(db, "promo_codes", "_REFERRAL_SETTINGS"),
      { type: "REFERRAL_SETTINGS", percent, scope, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setStatus(st, "Guardado ✅");
    await loadDashboard();
  } catch (e) {
    console.error("[referral save]", e);
    setStatus(st, "Error (permissions?).", true);
  }
}

/* =========================
   PROMO CODES (promo_codes)
   ========================= */
function renderPromoRow(id, p) {
  const active = p.active === false ? "⛔" : "✅";
  const pct = p.percent != null ? `${p.percent}%` : "—";
  const note = p.note ? esc(p.note) : "";
  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${esc(id)} ${active}</div>
          <div class="hintSmall">${esc(pct)}${note ? " · " + note : ""}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-white-outline" type="button" data-pc="toggle" data-id="${esc(id)}">
            ${p.active === false ? "Activate" : "Hide"}
          </button>
          <button class="btn-red" type="button" data-pc="del" data-id="${esc(id)}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

async function loadPromoList() {
  const list = $("promoList");
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Cargando…</div>';

  try {
    // no orderBy required (reduces index issues)
    const snap = await getDocs(query(collection(db, "promo_codes"), limit(200)));
    const rows = [];
    snap.forEach((d) => {
      if (d.id === "_REFERRAL_SETTINGS") return;
      rows.push(renderPromoRow(d.id, d.data() || {}));
    });
    list.innerHTML = rows.length ? rows.join("") : '<div class="hintSmall">—</div>';
  } catch (e) {
    console.error("[promo list]", e);
    list.innerHTML = '<div class="hintSmall">Error cargando promo_codes.</div>';
  }
}

async function savePromoCode() {
  const code = String($("pcCode")?.value || "").trim();
  const st = $("pcStatus");
  if (!code) {
    setStatus(st, "Falta el código.", true);
    return;
  }
  const percent = Number($("pcPercent")?.value || 0);
  const note = String($("pcNote")?.value || "").trim();
  const active = String($("pcActive")?.value || "true") === "true";

  setStatus(st, "Guardando…");
  try {
    await setDoc(
      doc(db, "promo_codes", code),
      { code, percent, note, active, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setStatus(st, "Guardado ✅");
    if ($("pcCode")) $("pcCode").value = "";
    if ($("pcPercent")) $("pcPercent").value = "";
    if ($("pcNote")) $("pcNote").value = "";
    if ($("pcActive")) $("pcActive").value = "true";
    await loadPromoList();
    await loadDashboard();
  } catch (e) {
    console.error("[promo save]", e);
    setStatus(st, "Error (permissions?).", true);
  }
}

async function togglePromo(id) {
  const ref = doc(db, "promo_codes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const p = snap.data() || {};
  const next = p.active === false ? true : false;
  await setDoc(ref, { active: next, updatedAt: serverTimestamp() }, { merge: true });
  await loadPromoList();
  await loadDashboard();
}

async function deletePromo(id) {
  if (!confirm("¿Eliminar código?")) return;
  await deleteDoc(doc(db, "promo_codes", id));
  await loadPromoList();
  await loadDashboard();
}

/* =========================
   SERVICES (services) CRUD
   ========================= */
function fillServiceForm(id, s) {
  if ($("svcSku")) $("svcSku").value = id || "";
  if ($("svcCategory")) $("svcCategory").value = s.category || "extras";
  if ($("svcTitle")) $("svcTitle").value = s.title || "";
  if ($("svcDesc")) $("svcDesc").value = s.desc || "";
  if ($("svcPrice")) $("svcPrice").value = s.price || "";
  if ($("svcBadge")) $("svcBadge").value = s.badge || "";
  if ($("svcOrder")) $("svcOrder").value = String(Number(s.order || 0));
  if ($("svcCtaType")) $("svcCtaType").value = s.ctaType || "info";
  if ($("svcCtaUrl")) $("svcCtaUrl").value = s.ctaUrl || "";
  if ($("svcCtaLabel")) $("svcCtaLabel").value = s.ctaLabel || "";
  if ($("svcActive")) $("svcActive").value = s.active === false ? "false" : "true";
}

function renderServiceRow(id, s) {
  const active = s.active === false ? "⛔ hidden" : "✅ active";
  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${esc(s.title || id)}</div>
          <div class="hintSmall">SKU: ${esc(id)} · cat: ${esc(s.category || "extras")} · ${active}</div>
          <div class="hintSmall">${s.price ? "💰 " + esc(s.price) : ""}${s.badge ? " · ⭐ " + esc(s.badge) : ""}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-white-outline" type="button" data-svc="edit" data-id="${esc(id)}">Edit</button>
          <button class="btn-white-outline" type="button" data-svc="toggle" data-id="${esc(id)}">
            ${s.active === false ? "Activate" : "Hide"}
          </button>
          <button class="btn-red" type="button" data-svc="del" data-id="${esc(id)}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

async function loadServicesList() {
  const list = $("servicesAdminList");
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Cargando…</div>';

  try {
    const snap = await getDocs(query(collection(db, "services"), orderBy("order", "asc"), limit(500)));
    const rows = [];
    snap.forEach((d) => rows.push(renderServiceRow(d.id, d.data() || {})));
    list.innerHTML = rows.length ? rows.join("") : '<div class="hintSmall">—</div>';
  } catch (e) {
    console.error("[services list]", e);
    list.innerHTML = '<div class="hintSmall">Error cargando services.</div>';
  }
}

async function saveService() {
  const st = $("svcStatus");
  const sku = String($("svcSku")?.value || "").trim();
  if (!sku) return setStatus(st, "Falta SKU.", true);

  const payload = {
    sku,
    category: String($("svcCategory")?.value || "extras"),
    title: String($("svcTitle")?.value || "").trim(),
    desc: String($("svcDesc")?.value || "").trim(),
    price: String($("svcPrice")?.value || "").trim(),
    badge: String($("svcBadge")?.value || "").trim(),
    order: Number($("svcOrder")?.value || 0),
    ctaType: String($("svcCtaType")?.value || "info"),
    ctaUrl: String($("svcCtaUrl")?.value || "").trim(),
    ctaLabel: String($("svcCtaLabel")?.value || "").trim(),
    active: String($("svcActive")?.value || "true") === "true",
    updatedAt: serverTimestamp(),
  };

  if (payload.ctaType === "link" && payload.ctaUrl && !/^https?:\/\//i.test(payload.ctaUrl)) {
    return setStatus(st, "CTA url debe empezar con http(s)://", true);
  }

  setStatus(st, "Guardando…");
  try {
    await setDoc(doc(db, "services", sku), payload, { merge: true });
    setStatus(st, "Guardado ✅");
    await loadServicesList();
    await loadDashboard();
  } catch (e) {
    console.error("[services save]", e);
    setStatus(st, "Error (permissions?).", true);
  }
}

async function editService(id) {
  const snap = await getDoc(doc(db, "services", id));
  if (!snap.exists()) return;
  fillServiceForm(id, snap.data() || {});
  setStatus($("svcStatus"), "Editando ✏️");
}

async function toggleService(id) {
  const ref = doc(db, "services", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const s = snap.data() || {};
  const next = s.active === false ? true : false;
  await setDoc(ref, { active: next, updatedAt: serverTimestamp() }, { merge: true });
  await loadServicesList();
  await loadDashboard();
}

async function deleteService(id) {
  if (!confirm("¿Eliminar servicio?")) return;
  await deleteDoc(doc(db, "services", id));
  await loadServicesList();
  await loadDashboard();
}

function clearServiceForm() {
  fillServiceForm("", { category: "extras", ctaType: "info", active: true, order: 0 });
  setStatus($("svcStatus"), "");
}

/* =========================
   USERS (Usuarios) – basic list + modal save
   Requires HTML ids: usersList, btnLoadUsers, userModal, etc.
   ========================= */
let usersLast = null;
let usersCache = new Map();

function isoDate(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function parseDateInput(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function renderUserRow(uid, u) {
  const email = esc(u.email || u.emailLower || "(no email)");
  const role = esc(u.role || "user");
  const plan = esc(u.plan || "");
  const until = isoDate(u.accessUntil);
  const blocked = u.blocked === true ? "⛔" : "";
  const access = u.access === false ? "🔒" : "✅";
  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${email} ${blocked}</div>
          <div class="hintSmall">uid: ${esc(uid)} · role: ${role} · access: ${access}${plan ? " · plan: " + plan : ""}${until ? " · until: " + esc(until) : ""}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-white-outline" type="button" data-user="open" data-uid="${esc(uid)}">Edit</button>
        </div>
      </div>
    </div>
  `;
}

async function loadUsers(reset = false) {
  const list = $("usersList");
  if (!list) return;

  if (reset) {
    usersLast = null;
    usersCache = new Map();
    list.innerHTML = "";
  }

  list.innerHTML = list.innerHTML || '<div class="hintSmall">Cargando…</div>';

  try {
    const parts = [collection(db, "users"), orderBy("__name__"), limit(50)];
    if (usersLast) parts.splice(2, 0, startAfter(usersLast));
    const q1 = query.apply(null, parts);

    const snap = await getDocs(q1);
    snap.forEach((d) => {
      usersLast = d;
      usersCache.set(d.id, d.data() || {});
    });

    const searchTerm = String($("userSearch")?.value || "").trim().toLowerCase();
    const roleFilter = String($("roleFilter")?.value || "all");

    const rows = [];
    for (const [uid, u] of usersCache.entries()) {
      const r = String(u.role || "user");
      if (roleFilter !== "all" && r !== roleFilter) continue;
      if (searchTerm) {
        const em = String(u.email || u.emailLower || "").toLowerCase();
        if (!em.includes(searchTerm) && !uid.includes(searchTerm)) continue;
      }
      rows.push(renderUserRow(uid, u));
    }

    list.innerHTML = rows.length ? rows.join("") : '<div class="hintSmall">—</div>';
  } catch (e) {
    console.error("[users]", e);
    list.innerHTML = '<div class="hintSmall">Error cargando users.</div>';
  }
}

function openUserModal(uid) {
  const modal = $("userModal");
  if (!modal) return;
  const u = usersCache.get(uid);
  if (!u) return;

  if ($("um_email")) $("um_email").textContent = u.email || u.emailLower || "";
  if ($("um_uid")) $("um_uid").textContent = uid;

  if ($("um_admin")) $("um_admin").checked = u.role === "admin";
  if ($("um_access")) $("um_access").checked = u.access !== false;
  if ($("um_blocked")) $("um_blocked").checked = u.blocked === true;

  if ($("um_plan")) $("um_plan").value = u.plan || "";
  if ($("um_until")) $("um_until").value = isoDate(u.accessUntil);
  if ($("um_note")) $("um_note").value = u.note || "";

  if ($("um_status")) $("um_status").textContent = "";

  modal.style.display = "block";
  modal.classList.add("open");
}

function closeUserModal() {
  const modal = $("userModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.style.display = "none";
}

async function saveUserModal() {
  const uid = String($("um_uid")?.textContent || "").trim();
  if (!uid) return;

  const st = $("um_status");
  setStatus(st, "Guardando…");

  const role = $("um_admin")?.checked ? "admin" : "user";
  const access = $("um_access")?.checked ? true : false;
  const blocked = $("um_blocked")?.checked ? true : false;
  const plan = String($("um_plan")?.value || "").trim();
  const note = String($("um_note")?.value || "").trim();

  const untilDate = parseDateInput($("um_until")?.value || "");
  const accessUntil = untilDate ? untilDate : null;

  try {
    await setDoc(
      doc(db, "users", uid),
      { role, access, blocked, plan, note, accessUntil, updatedAt: serverTimestamp() },
      { merge: true }
    );

    // refresh cache
    const old = usersCache.get(uid) || {};
    usersCache.set(uid, { ...old, role, access, blocked, plan, note, accessUntil });
    setStatus(st, "Guardado ✅");
    closeUserModal();
    await loadUsers(true);
    await loadDashboard();
  } catch (e) {
    console.error("[user save]", e);
    setStatus(st, "Error (permissions?).", true);
  }
}

/* =========================
   BIND EVENTS
   ========================= */
function bindEvents() {
  // referral
  $("btnSaveReferralSettings")?.addEventListener("click", saveReferralSettings);

  // promo
  $("btnSavePromo")?.addEventListener("click", savePromoCode);
  $("btnReloadPromo")?.addEventListener("click", loadPromoList);
  $("promoList")?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-pc]");
    if (!btn) return;
    const act = btn.getAttribute("data-pc");
    const id = btn.getAttribute("data-id");
    if (!id) return;
    if (act === "toggle") await togglePromo(id);
    if (act === "del") await deletePromo(id);
  });

  // services
  $("btnReloadServicesAdmin")?.addEventListener("click", loadServicesList);
  $("btnSaveService")?.addEventListener("click", saveService);
  $("btnClearService")?.addEventListener("click", clearServiceForm);
  $("servicesAdminList")?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-svc]");
    if (!btn) return;
    const act = btn.getAttribute("data-svc");
    const id = btn.getAttribute("data-id");
    if (!id) return;
    if (act === "edit") await editService(id);
    if (act === "toggle") await toggleService(id);
    if (act === "del") await deleteService(id);
  });

  // users (only if section exists)
  $("btnLoadUsers")?.addEventListener("click", () => loadUsers(true));
  $("btnLoadMore")?.addEventListener("click", () => loadUsers(false));
  $("btnSearch")?.addEventListener("click", () => loadUsers(true));
  $("btnClear")?.addEventListener("click", () => {
    if ($("userSearch")) $("userSearch").value = "";
    if ($("roleFilter")) $("roleFilter").value = "all";
    loadUsers(true);
  });
  $("usersList")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-user]");
    if (!btn) return;
    const uid = btn.getAttribute("data-uid");
    if (uid) openUserModal(uid);
  });

  $("userModalClose")?.addEventListener("click", closeUserModal);
  $("um_cancel")?.addEventListener("click", closeUserModal);
  $("um_save")?.addEventListener("click", saveUserModal);
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // layout.js should redirect anyway
    // Load sections independently so one failure doesn't break others
    await loadDashboard();
    await loadReferralSettings();
    await loadPromoList();
    await loadServicesList();
  });
});
