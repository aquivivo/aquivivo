// assets/js/pages/course-page.js
// Course topics list (requires auth + verified email + access for level)

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

// UI refs (must exist in course.html)
const levelTitle = $("levelTitle");
const levelSubtitle = $("levelSubtitle");
const topicsGrid = $("topicsGrid");
const searchInput = $("searchInput");
const typeFilter = $("typeFilter");
const taskFilter = $("taskFilter");
const btnClearFilters = $("btnClearFilters");

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
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
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hasActiveAccess(userData, level) {
  const iso = userData?.access?.[level]?.freeUntil;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d > new Date();
}

async function loadCourseMeta() {
  try {
    const snap = await getDoc(doc(db, "course_meta", LEVEL));
    const data = snap.exists() ? snap.data() : {};
    if (levelTitle) levelTitle.textContent = data?.title || `Nivel ${LEVEL}`;
    if (levelSubtitle) levelSubtitle.textContent = data?.subtitle || "";
  } catch (e) {
    console.error(e);
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

function renderFiltered() {
  const q = (searchInput?.value || "").toLowerCase().trim();
  const t = (typeFilter?.value || "").toLowerCase().trim();
  const task = (taskFilter?.value || "").toLowerCase().trim();

  let list = allTopics.slice();

  if (q) {
    list = list.filter((x) => {
      const s = `${x.title || ""} ${x.desc || ""}`.toLowerCase();
      return s.includes(q);
    });
  }
  if (t) list = list.filter((x) => (x.type || "").toLowerCase() === t);
  if (task) {
    list = list.filter((x) =>
      Array.isArray(x.tasks)
        ? x.tasks.map((z) => String(z).toLowerCase()).includes(task)
        : String(x.task || "").toLowerCase() === task
    );
  }

  const visited = getVisitedSet();
  if (topicsGrid) {
    topicsGrid.innerHTML = "";
    list.forEach((x, idx) => {
      const isVisited = visited.has(x.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "topicCard card";
      card.innerHTML = `
        <div class="metaRow" style="justify-content:space-between;">
          <span class="pill pill-blue">${escapeHtml(x.typeLabel || x.type || "Tema")}</span>
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
      topicsGrid.appendChild(card);
    });
  }

  // stats
  $("statTotal") && ($("statTotal").textContent = String(allTopics.length));
  $("statShowing") && ($("statShowing").textContent = String(list.length));

  // progress
  const visitedCount = Array.from(visited).filter((id) => allTopics.some((t) => t.id === id)).length;
  const total = allTopics.length;
  const pct = total ? Math.round((visitedCount / total) * 100) : 0;
  $("progressText") && ($("progressText").textContent = `${pct}%`);
  $("progressCount") && ($("progressCount").textContent = `${visitedCount}/${total}`);
  $("progressFill") && ($("progressFill").style.width = `${pct}%`);

  // continue
  const last = localStorage.getItem(LS_LAST_KEY);
  const btn = $("btnContinue");
  if (btn && last && allTopics.some((t) => t.id === last)) {
    btn.style.display = "inline-flex";
    btn.onclick = () => openLesson(last);
  } else if (btn) {
    btn.style.display = "none";
  }
}

async function loadTopics() {
  // courses where level == LEVEL orderBy order
  const q = query(
    collection(db, "courses"),
    where("level", "==", LEVEL),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  allTopics = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      title: data.title || data.name || "",
      desc: data.desc || data.description || "",
      type: data.type || data.category || "gramatica",
      typeLabel: data.typeLabel || (String(data.type || "Gramática").slice(0, 1).toUpperCase() + String(data.type || "gramática").slice(1)),
      tasks: data.tasks || [],
      order: data.order ?? 0,
    };
  });

  // fill filters
  if (typeFilter) {
    const types = Array.from(new Set(allTopics.map((t) => (t.type || "").toLowerCase()).filter(Boolean)));
    typeFilter.innerHTML = `<option value="">Todos</option>` + types.map((x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  }
  renderFiltered();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return; // layout.js will redirect

  // access control via users/{uid}
  try {
    const uSnap = await getDoc(doc(db, "users", user.uid));
    const uData = uSnap.exists() ? uSnap.data() : null;

    if (!uData || !hasActiveAccess(uData, LEVEL)) {
      // no access → send to panel
      toast("🔒 No tienes acceso a este nivel.");
      setTimeout(() => (window.location.href = "espanel.html"), 600);
      return;
    }
  } catch (e) {
    console.error(e);
    toast("No se pudo verificar el acceso. Revisa consola.");
    return;
  }

  await loadCourseMeta();
  await loadTopics();
});

// UI events
searchInput?.addEventListener("input", renderFiltered);
typeFilter?.addEventListener("change", renderFiltered);
taskFilter?.addEventListener("change", renderFiltered);
btnClearFilters?.addEventListener("click", () => {
  if (searchInput) searchInput.value = "";
  if (typeFilter) typeFilter.value = "";
  if (taskFilter) taskFilter.value = "";
  renderFiltered();
  toast("🧼 Filtros limpiados");
});
