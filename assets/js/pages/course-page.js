// assets/js/pages/course-page.js
// Lista de temas del curso (requires auth + verified email; optional access gating)

import { auth, db } from "../firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const LEVEL = (params.get("level") || "A1").toUpperCase();

const LS_VISITED_KEY = `aquivivo_visited_${LEVEL}`;
const LS_LAST_KEY = `aquivivo_lastLesson_${LEVEL}`;

// UI (some are optional; code guards against missing nodes)
const elLevelTitle = $("levelTitle");
const elLevelSubtitle = $("levelSubtitle");
const elTopicsGrid = $("topicsGrid");
const elSearchInput = $("searchInput");
const elTypeFilter = $("typeFilter");
const elClearFilters = $("clearFilters"); // in HTML
const elToast = $("toast");

function toast(msg) {
  if (!elToast) return;
  elToast.textContent = msg;
  elToast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => elToast.classList.remove("show"), 2200);
}

function getVisitedSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_VISITED_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function setVisitedSet(set) {
  try {
    localStorage.setItem(LS_VISITED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Optional gating: if users/{uid}.access[LEVEL].freeUntil exists, it must be in the future
function hasActiveAccessForLevel(userData, level) {
  const iso = userData?.access?.[level]?.freeUntil;
  if (!iso) return true; // no config -> allow
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d > new Date();
}

async function loadCourseMeta() {
  try {
    const snap = await getDoc(doc(db, "course_meta", LEVEL));
    const data = snap.exists() ? snap.data() : {};
    if (elLevelTitle) elLevelTitle.textContent = data?.title || `Nivel ${LEVEL}`;
    if (elLevelSubtitle) elLevelSubtitle.textContent = data?.subtitle || "";
  } catch (e) {
    console.error("course-page: meta error", e);
  }
}

function openLesson(topicId) {
  try {
    localStorage.setItem(LS_LAST_KEY, topicId);
  } catch {}
  const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(topicId)}`;
  window.location.href = url;
}

let allTopics = [];

function setStats(total, showing) {
  const totalEl = $("totalCount") || $("statTotal");
  const showEl = $("showCount") || $("statShowing");
  if (totalEl) totalEl.textContent = String(total);
  if (showEl) showEl.textContent = String(showing);
}

function setProgress(visitedCount, total) {
  const fill = $("progressFill");
  const text = $("progressText");
  const pct = total ? Math.round((visitedCount / total) * 100) : 0;

  if (fill) fill.style.width = `${pct}%`;

  // Keep original copy from your HTML
  if (text) text.textContent = `${pct}% · ${visitedCount}/${total} temas visitados`;
}

function renderFiltered() {
  const q = (elSearchInput?.value || "").toLowerCase().trim();
  const t = (elTypeFilter?.value || "").toLowerCase().trim();

  let list = allTopics.slice();

  if (q) {
    list = list.filter((x) => {
      const s = `${x.title || ""} ${x.desc || ""}`.toLowerCase();
      return s.includes(q);
    });
  }
  if (t) list = list.filter((x) => (x.type || "").toLowerCase() === t);

  const visited = getVisitedSet();

  if (elTopicsGrid) {
    elTopicsGrid.innerHTML = "";
    list.forEach((x, idx) => {
      const isVisited = visited.has(x.id);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "topicCard card";

      const typeLabel = x.type === "gramatica" ? "Gramática" : x.type === "vocabulario" ? "Vocabulario" : (x.type || "Tema");
      card.innerHTML = `
        <div class="metaRow" style="justify-content:space-between;">
          <span class="pill pill-blue">${escapeHtml(typeLabel)}</span>
          <span class="pill pill-yellow">#${escapeHtml(String(x.order ?? idx + 1))}</span>
        </div>
        <div class="sectionTitle" style="margin:10px 0 6px; text-align:left;">
          ${escapeHtml(x.title || "")}
        </div>
        <div class="subtitle" style="text-align:left;">
          ${escapeHtml(x.desc || "")}
        </div>
        ${isVisited ? `<div class="pill" style="margin-top:10px;">✅ Visitado</div>` : ``}
      `;

      card.addEventListener("click", () => {
        const set = getVisitedSet();
        set.add(x.id);
        setVisitedSet(set);
        openLesson(x.id);
      });

      elTopicsGrid.appendChild(card);
    });
  }

  setStats(allTopics.length, list.length);

  const visitedCount = Array.from(visited).filter((id) => allTopics.some((t) => t.id === id)).length;
  setProgress(visitedCount, allTopics.length);
}

async function loadTopics() {
  try {
    const qy = query(
      collection(db, "courses"),
      where("level", "==", LEVEL),
      orderBy("order", "asc")
    );
    const snap = await getDocs(qy);

    allTopics = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        title: data.title || "",
        desc: data.desc || data.subtitle || "",
        type: data.type || "",
        order: data.order,
      };
    });

    renderFiltered();
  } catch (e) {
    console.error("course-page: load topics error", e);
    toast("❌ Error cargando temas.");
  }
}

function bindUI() {
  if (elSearchInput) elSearchInput.addEventListener("input", renderFiltered);
  if (elTypeFilter) elTypeFilter.addEventListener("change", renderFiltered);

  if (elClearFilters) {
    elClearFilters.addEventListener("click", () => {
      if (elSearchInput) elSearchInput.value = "";
      if (elTypeFilter) elTypeFilter.value = "";
      renderFiltered();
    });
  }
}

function boot() {
  bindUI();

  onAuthStateChanged(auth, async (user) => {
    // layout.js already guards auth + emailVerified, but we keep a safe fallback
    if (!user) return;

    try {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      const uData = uSnap.exists() ? uSnap.data() : null;

      if (!hasActiveAccessForLevel(uData, LEVEL)) {
        toast("🔒 No tienes acceso a este nivel.");
        setTimeout(() => (window.location.href = "espanel.html"), 700);
        return;
      }
    } catch (e) {
      console.error("course-page: user doc error", e);
    }

    await loadCourseMeta();
    await loadTopics();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
