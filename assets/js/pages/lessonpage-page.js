import { auth, db } from "../firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const ADMIN_EMAILS = ["aquivivo.pl@gmail.com"];
const isAdminEmail = (email) =>
  ADMIN_EMAILS.some((a) => (a || "").toLowerCase() === (email || "").toLowerCase());

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "18px";
  el.style.transform = "translateX(-50%)";
  el.style.padding = "10px 14px";
  el.style.borderRadius = "999px";
  el.style.background = "rgba(0,0,0,.55)";
  el.style.border = "1px solid rgba(255,255,255,.18)";
  el.style.backdropFilter = "blur(10px)";
  el.style.zIndex = "9999";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.style.display = "none";
  }, 2200);
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

function lessonDocId(level, topic) {
  // topic can be slug or id; keep it stable and URL-friendly
  return `${level}__${topic}`;
}

function renderLesson(meta, topicInfo, level, topicKey, userEmail) {
  const title = safeText(meta.title) || safeText(topicInfo.title) || "Lección";
  const desc = safeText(meta.desc) || safeText(topicInfo.desc) || "";

  $("lessonTitle").textContent = title || "Lección";
  $("lessonDesc").textContent = desc || "";

  $("pillLevel").textContent = `Nivel: ${level}`;
  $("pillTopic").textContent = `Tema: ${safeText(topicInfo.title) || topicKey}`;

  // Optional pills
  const pillType = $("pillType");
  const pillDuration = $("pillDuration");
  const pillPub = $("pillPub");
  const studentHint = $("studentHint");

  const type = safeText(meta.type);
  if (type) {
    pillType.style.display = "inline-flex";
    pillType.textContent = `📌 ${type}`;
  } else {
    pillType.style.display = "none";
  }

  const dur = Number(meta.durationMin || 0);
  if (dur > 0) {
    pillDuration.style.display = "inline-flex";
    pillDuration.textContent = `⏱ ${dur} min`;
  } else {
    pillDuration.style.display = "none";
  }

  const published = !!meta.published;
  pillPub.style.display = "inline-flex";
  pillPub.textContent = published ? "✅ Publicado" : "🟡 Borrador";

  if (!published) {
    studentHint.style.display = "block";
    studentHint.textContent =
      "Esta lección aún no está publicada. Si eres estudiante, puede que no veas el contenido final.";
  } else {
    studentHint.style.display = "none";
  }

  // Admin link
  const pillAdminLink = $("pillAdminLink");
  if (userEmail && isAdminEmail(userEmail)) {
    pillAdminLink.style.display = "inline-flex";
    pillAdminLink.href = `lessonadmin.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(topicKey)}`;
  } else {
    pillAdminLink.style.display = "none";
    pillAdminLink.href = "#";
  }

  // Content
  const html = safeText(meta.html);
  const content = $("lessonContent");
  const empty = $("lessonEmpty");

  if (html) {
    empty.style.display = "none";
    content.style.display = "block";
    content.innerHTML = html;
  } else {
    content.style.display = "none";
    empty.style.display = "block";
    empty.textContent = "No existe esta lección todavía.";
  }

  // TOC
  buildTOC();

  // Reading progress (optional)
  enableReadingProgress();
  // Exercise links
  renderExerciseLinks(level, topicInfo, topicKey);
}

function buildTOC() {
  const content = $("lessonContent");
  const tocWrap = $("tocWrap");
  const tocList = $("tocList");
  if (!content || !tocWrap || !tocList) return;

  const headings = Array.from(content.querySelectorAll("h2, h3")).slice(0, 40);
  if (!headings.length) {
    tocWrap.style.display = "none";
    tocList.innerHTML = "";
    return;
  }

  tocWrap.style.display = "block";
  tocList.innerHTML = "";

  headings.forEach((h, idx) => {
    if (!h.id) h.id = `sec_${idx}_${Math.random().toString(16).slice(2)}`;
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent?.trim() || `Sección ${idx + 1}`;
    a.style.display = "block";
    a.style.padding = "8px 8px";
    a.style.borderRadius = "12px";
    a.style.textDecoration = "none";
    a.style.border = "1px solid rgba(255,255,255,.10)";
    a.style.margin = "6px 0";
    a.style.background = "rgba(255,255,255,.06)";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    tocList.appendChild(a);
  });
}

function enableReadingProgress() {
  const tools = $("readTools");
  const fill = $("readProgressFill");
  const text = $("readProgressText");
  if (!tools || !fill || !text) return;

  tools.style.display = "block";

  const calc = () => {
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const max = Math.max(1, docH - winH);
    const pct = Math.min(100, Math.max(0, Math.round((y / max) * 100)));
    fill.style.width = `${pct}%`;
    text.textContent = `📖 Progreso de lectura: ${pct}%`;
  };

  calc();
  window.addEventListener("scroll", calc, { passive: true });
}

function renderExerciseLinks(level, topicInfo, topicKey) {
  const wrap = $("exerciseLinksWrap");
  const tools = $("readTools");
  if (!wrap || !tools) return;

  const slug = safeText(topicInfo.slug) || safeText(topicKey);

  wrap.innerHTML = "";
  const a = document.createElement("a");
  a.className = "btn btn-white-outline";
  a.href = `ejercicio.html?level=${encodeURIComponent(level)}&slug=${encodeURIComponent(slug)}`;
  a.textContent = "🧩 Ir a ejercicios";
  wrap.appendChild(a);
}

async function loadTopicInfo(level, topicKey) {
  const fallback = { title: "", desc: "", slug: topicKey };

  if (!level || !topicKey) return fallback;

  // 1) by document id
  try {
    const byId = await getDoc(doc(db, "courses", topicKey));
    if (byId.exists()) {
      const d = byId.data() || {};
      return {
        title: safeText(d.title || d.name || d.topic),
        desc: safeText(d.desc || d.description),
        slug: safeText(d.slug || d.topicSlug || topicKey)
      };
    }
  } catch (_) {}

  // 2) by slug/topicSlug
  try {
    const qy = query(
      collection(db, "courses"),
      where("level", "==", level),
      where("slug", "==", topicKey)
    );
    const snap = await getDocs(qy);
    if (!snap.empty) {
      const d = snap.docs[0].data() || {};
      return {
        title: safeText(d.title || d.name || d.topic),
        desc: safeText(d.desc || d.description),
        slug: safeText(d.slug || d.topicSlug || topicKey)
      };
    }
  } catch (_) {}

  try {
    const qy2 = query(
      collection(db, "courses"),
      where("level", "==", level),
      where("topicSlug", "==", topicKey)
    );
    const snap2 = await getDocs(qy2);
    if (!snap2.empty) {
      const d = snap2.docs[0].data() || {};
      return {
        title: safeText(d.title || d.name || d.topic),
        desc: safeText(d.desc || d.description),
        slug: safeText(d.slug || d.topicSlug || topicKey)
      };
    }
  } catch (_) {}

  return fallback;
}

async function loadLesson(level, topicKey, userEmail) {
  const titleEl = $("lessonTitle");
  const descEl = $("lessonDesc");
  const empty = $("lessonEmpty");
  const content = $("lessonContent");

  if (!level || !topicKey) {
    titleEl.textContent = "Faltan parámetros";
    descEl.textContent = "Faltan parámetros en la URL (level, id).";
    empty.style.display = "block";
    empty.textContent = "Abre por ejemplo: lessonpage.html?level=A1&id=tuTopicId";
    return;
  }

  const topicInfo = await loadTopicInfo(level, topicKey);

  // Lesson doc id: prefer slug to keep stable across copies, fallback to topicKey
  const keyForDoc = safeText(topicInfo.slug) || safeText(topicKey);
  const ref = doc(db, "course_meta", lessonDocId(level, keyForDoc));

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      renderLesson({ published: false, html: "" }, topicInfo, level, topicKey, userEmail);
      return;
    }
    renderLesson(snap.data() || {}, topicInfo, level, topicKey, userEmail);
  } catch (e) {
    console.error(e);
    content.style.display = "none";
    empty.style.display = "block";
    empty.textContent = "No se pudo cargar la lección. Revisa la consola y tu conexión a Firestore.";
    showToast("Error al cargar la lección");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const LEVEL = safeText(params.get("level")).toUpperCase();
  const TOPIC_ID = safeText(params.get("id"));

  // Default placeholders
  $("pillLevel").textContent = "Nivel: —";
  $("pillTopic").textContent = "Tema: —";

  // Load after auth state is known (for admin link)
  onAuthStateChanged(auth, (user) => {
    const email = user?.email || "";
    loadLesson(LEVEL, TOPIC_ID, email);
  });
});
