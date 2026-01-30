import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
      import {
import { auth, db } from "../firebase-init.js";
        collection,
        query,
        where,
        getDocs,
        addDoc,
        deleteDoc,
        doc,
        getDoc,
        setDoc,
        orderBy,
        serverTimestamp,
        arrayUnion,
        updateDoc
      } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

      // ✅ Firebase config (Twoje)
      const ADMIN_EMAIL = "aquivivo.pl@gmail.com";

      // URL params
      const params = new URLSearchParams(window.location.search);
      const LEVEL = (params.get("level") || "A1").toUpperCase();
      const slugParam = params.get("slug") || "";
      const idParam = params.get("id") || "";

      // UI refs
      const toast = document.getElementById("toast");
      const sessionEmail = document.getElementById("sessionEmail");
      const btnPanel = document.getElementById("btnPanel");
      const btnLeccion = document.getElementById("btnLeccion");
      const btnInicio = document.getElementById("btnInicio");
      const btnAtras = document.getElementById("btnAtras");
      const btnLogout = document.getElementById("btnLogout");

      const pillLevel = document.getElementById("pillLevel");
      const pillType = document.getElementById("pillType");
      const pillSlug = document.getElementById("pillSlug");
      const pillCount = document.getElementById("pillCount");

      // Lesson content (public view)
      const lessonContentCard = document.getElementById("lessonContentCard");
      const lessonContentBody = document.getElementById("lessonContentBody");
      const lessonContentEmpty = document.getElementById("lessonContentEmpty");
      const btnOpenLessonPage = document.getElementById("btnOpenLessonPage");

      const topicTitle = document.getElementById("topicTitle");
      const topicDesc = document.getElementById("topicDesc");
      const taskChips = document.getElementById("taskChips");

      const exerciseList = document.getElementById("exerciseList");
      const emptyExercises = document.getElementById("emptyExercises");
      const adminWrap = document.getElementById("adminWrap");

      // admin fields
      const exType = document.getElementById("exType");
      const exPrompt = document.getElementById("exPrompt");
      const exImageUrl = document.getElementById("exImageUrl");
      const exOptions = document.getElementById("exOptions");
      const exAnswer = document.getElementById("exAnswer");
      const exCategory = document.getElementById("exCategory");
      const exTags = document.getElementById("exTags");
      const exOrder = document.getElementById("exOrder");
      const exNotes = document.getElementById("exNotes");
      const btnAddExercise = document.getElementById("btnAddExercise");
      const btnTplFill = document.getElementById("btnTplFill");
      const btnTplChoice = document.getElementById("btnTplChoice");
      const btnTplTF = document.getElementById("btnTplTF");
      const importJsonArea = document.getElementById("importJsonArea");
      const btnImportJson = document.getElementById("btnImportJson");
      const btnClearImport = document.getElementById("btnClearImport");
      const importStatus = document.getElementById("importStatus");


      // ===== Lesson meta (course_meta) =====
      const lessonMetaWrap = document.getElementById("lessonMetaWrap");
      const lessonTitleEs = document.getElementById("lessonTitleEs");
      const lessonDescEs = document.getElementById("lessonDescEs");
      const lessonImageUrl = document.getElementById("lessonImageUrl");
      const lessonHtml = document.getElementById("lessonHtml");
      const lessonObjectives = document.getElementById("lessonObjectives");
      const lessonGrammar = document.getElementById("lessonGrammar");
      const lessonVocab = document.getElementById("lessonVocab");
      const lessonDialog = document.getElementById("lessonDialog");
      const lessonSpeaking = document.getElementById("lessonSpeaking");
      const btnSaveLessonMeta = document.getElementById("btnSaveLessonMeta");
      const btnClearLessonMeta = document.getElementById("btnClearLessonMeta");
      const lessonMetaStatus = document.getElementById("lessonMetaStatus");

      function linesToArray(text) {
        return (text || "")
          .split("\n")
          .map(s => s.replace(/^\s*[-•]\s*/,"").trim())
          .filter(Boolean);
      }
      function arrayToLines(arr) {
        return Array.isArray(arr) ? arr.join("\n") : "";
      }

      function getLessonMetaDocId(topic) {
        const slug = topic && (topic.slug || topic.id) ? String(topic.slug || topic.id) : "";
        return `${LEVEL}__${slug}`;

      }
      function syncLessonPageLink(){
        if(!btnOpenLessonPage) return;
        if(!currentTopic) { btnOpenLessonPage.style.display = "none"; return; }
        const slug = String(currentTopic.slug || currentTopic.id || "");
        const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(slug)}`;
        btnOpenLessonPage.href = url;
        btnOpenLessonPage.style.display = "inline-flex";
      }

      function renderLessonContent(data){
        if(!lessonContentCard || !lessonContentBody || !lessonContentEmpty) return;

        // show only when there's anything to show (image or html or objectives etc.)
        if(!data){
          lessonContentCard.style.display = "none";
          lessonContentBody.innerHTML = "";
          lessonContentEmpty.style.display = "none";
          return;
        }

        const parts = [];

        const img = (data.imageUrl || "").trim();
        if(img){
          const safe = escapeHtml(img);
          parts.push(`<img src="${safe}" alt="" style="max-width:100%; border-radius:18px; border:1px solid rgba(255,255,255,0.14); display:block; margin: 10px auto 14px;">`);
        }

        const html = (data.html || "").trim();
        if(html){
          // trusted admin content
          parts.push(`<div class="lessonText">${html}</div>`);
        }

        // If no html, we can render simple sections from arrays/dialog
        if(!html){
          const obj = Array.isArray(data.objectives) ? data.objectives : [];
          const gram = Array.isArray(data.grammar) ? data.grammar : [];
          const voc = Array.isArray(data.vocab) ? data.vocab : [];
          const dialog = (data.dialog || "").trim();
          const speak = (data.speakingTask || "").trim();

          if(obj.length){
            parts.push(`<div class="lessonText"><b>🎯 Cele:</b><ul>${obj.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`);
          }
          if(dialog){
            parts.push(`<div class="lessonText"><b>💬 Diálogo:</b><div style="white-space:pre-wrap; margin-top:6px">${escapeHtml(dialog)}</div></div>`);
          }
          if(gram.length){
            parts.push(`<div class="lessonText"><b>📚 Gramatyka:</b><ul>${gram.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`);
          }
          if(voc.length){
            parts.push(`<div class="lessonText"><b>🧠 Słownictwo:</b><ul>${voc.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`);
          }
          if(speak){
            parts.push(`<div class="lessonText"><b>🗣 Zadanie mówione:</b><div style="margin-top:6px">${escapeHtml(speak)}</div></div>`);
          }
        }

        const hasAny = parts.length > 0;
        lessonContentCard.style.display = hasAny ? "block" : "none";
        lessonContentEmpty.style.display = hasAny ? "none" : "block";
        lessonContentBody.innerHTML = parts.join("");
      }

      async function loadLessonMetaPublic(topic){
        if(!topic) return;
        try{
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, "course_meta", docId);
          const snap = await getDoc(ref);
          if(!snap.exists()){
            renderLessonContent(null);
            syncLessonPageLink();
            return;
          }
          renderLessonContent(snap.data());
          syncLessonPageLink();
        }catch(e){
          console.error(e);
          renderLessonContent(null);
          syncLessonPageLink();
        }
      }

      async function loadLessonMeta(topic) {
        if (!isAdmin) return;
        if (!topic || !(topic.slug || topic.id)) return;

        lessonMetaStatus.textContent = "Cargando...";
        try {
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, "course_meta", docId);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            lessonMetaStatus.textContent = "Sin lección guardada aún.";
            return;
          }

          const data = snap.data() || {};
          lessonTitleEs.value = data.titleEs || "";
          lessonDescEs.value = data.descriptionEs || "";
          lessonObjectives.value = arrayToLines(data.objectives || data.objectivesEs || []);
          lessonGrammar.value = arrayToLines(data.grammar || data.grammarEs || []);
          lessonVocab.value = arrayToLines(data.vocab || data.vocabEs || []);
          lessonDialog.value = data.dialog || data.dialogEs || "";
          lessonSpeaking.value = data.speakingTask || data.speakingTaskEs || "";
          lessonImageUrl.value = data.imageUrl || "";
          lessonHtml.value = data.html || "";

          lessonMetaStatus.textContent = "Lección cargada ✅";
          renderLessonContent(data);
          syncLessonPageLink();
        } catch (e) {
          console.error(e);
          lessonMetaStatus.textContent = "Error cargando lección ❌";
        }
      }

      async function saveLessonMeta(topic) {
        if (!isAdmin) return;
        if (!topic || !(topic.slug || topic.id)) {
          showToast("Primero elige un tema desde course.html", "warn", 3000);
          return;
        }

        lessonMetaStatus.textContent = "Guardando...";
        try {
          const slug = String(topic.slug || topic.id);
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, "course_meta", docId);

          const payload = {
            level: LEVEL,
            topicSlug: slug,
            titleEs: (lessonTitleEs.value || "").trim(),
            descriptionEs: (lessonDescEs.value || "").trim(),
            objectives: linesToArray(lessonObjectives.value),
            grammar: linesToArray(lessonGrammar.value),
            vocab: linesToArray(lessonVocab.value),
            dialog: (lessonDialog.value || "").trim(),
            speakingTask: (lessonSpeaking.value || "").trim(),
            imageUrl: (lessonImageUrl.value || "").trim(),
            html: (lessonHtml.value || "").trim(),
            updatedAt: new Date().toISOString()};

          await setDoc(ref, payload, { merge: true });

          lessonMetaStatus.textContent = "Guardado ✅";
          showToast("Lección guardada ✅", "ok", 2200);
        } catch (e) {
          console.error(e);
          lessonMetaStatus.textContent = "Error ❌";
          showToast("Error guardando lección", "err", 2600);
        }
      }

      function clearLessonMeta() {
        lessonTitleEs.value = "";
        lessonDescEs.value = "";
        lessonObjectives.value = "";
        lessonGrammar.value = "";
        lessonVocab.value = "";
        lessonDialog.value = "";
        lessonSpeaking.value = "";
        lessonImageUrl.value = "";
        lessonHtml.value = "";
        lessonMetaStatus.textContent = "";
        renderLessonContent(null);
      }

      if (btnSaveLessonMeta) btnSaveLessonMeta.onclick = () => saveLessonMeta(currentTopic);
      if (btnClearLessonMeta) btnClearLessonMeta.onclick = clearLessonMeta;

const btnAutoOrder = document.getElementById("btnAutoOrder");

      // Filters + reorder
      const filterSearch = document.getElementById("filterSearch");
      const filterType = document.getElementById("filterType");
      const filterCategory = document.getElementById("filterCategory");
      const btnClearFilters = document.getElementById("btnClearFilters");
      const toggleReorder = document.getElementById("toggleReorder");
      const btnSaveOrder = document.getElementById("btnSaveOrder");

      // Preview modal
      const previewModal = document.getElementById("previewModal");
      const previewBackdrop = document.getElementById("previewBackdrop");
      const btnClosePreview = document.getElementById("btnClosePreview");
      const previewBody = document.getElementById("previewBody");
      const btnCheckPreview = document.getElementById("btnCheckPreview");
      const previewResult = document.getElementById("previewResult");

      // ===== helpers =====
      function escapeHtml(s) {
        return String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function normalizeAnswer(a) {
        return String(a ?? "").trim();
      }

      function parseOptions(raw) {
        return String(raw ?? "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
      }

      function showToast(msg, kind = "ok", ms = 2200) {
        toast.className = "";
        toast.style.display = "block";
        toast.textContent = msg;

        if (kind === "ok") toast.classList.add("toast-ok");
        if (kind === "bad") toast.classList.add("toast-bad");
        if (kind === "warn") toast.classList.add("toast-warn");

        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
          toast.style.display = "none";
        }, ms);
      }

      function markBad(el, bad) {
        if (!el) return;
        if (bad) el.classList.add("field-bad");
        else el.classList.remove("field-bad");
      }

      function setSaving(isSaving) {
        if (btnAddExercise) {
          btnAddExercise.disabled = isSaving;
          btnAddExercise.textContent = isSaving ? "⏳ Guardando..." : "➕ Guardar ejercicio";
        }
        if (btnAutoOrder) {
          btnAutoOrder.disabled = isSaving;
        }
      }

      // ===== UX buttons =====
      pillLevel.textContent = `Nivel ${LEVEL}`;

      // ===== Top navigation =====
      if (btnPanel) btnPanel.href = "espanel.html";
      if (btnInicio) btnInicio.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
      if (btnLeccion) btnLeccion.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent((idParam || slugParam) || "")}`;
      if (btnAtras) btnAtras.addEventListener("click", () => history.back());
      if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
          try { await signOut(auth); } finally { window.location.href = "login.html"; }
        });
      }

      // ===== Exercise types (Twoja lista) =====
      const TASK_OPTIONS = [
        "Rellenar los espacios",
        "Relacionar palabra con imagen",
        "Relacionar palabra con traducción",
        "Elegir la palabra correcta",
        "Tarjetas interactivas",
        "Agrupar palabras",
        "Verdadero o falso",
        "Completar la frase con una imagen",
        "Juego de memoria (pares)",
        "Opción múltiple",
        "Completar la forma correcta",
        "Elegir la forma correcta",
        "Transformaciones",
        "Relacionar pregunta con respuesta",
        "Ordenar palabras para formar una frase",
        "Corregir errores",
        "Unir dos partes de la frase",
        "Completar con preposición o terminación",
        "Opción única",
        "Escribir tu propia respuesta",
        "Repetir después del narrador",
        "Completar la frase con tu voz",
        "Responder a una pregunta",
        "Describir una imagen",
        "Juego de roles",
        "Mini-monólogo",
        "Diálogo semiabierto",
        "Decirlo de otra manera",
        "Escuchar y elegir la respuesta",
        "Escuchar y completar los espacios",
        "Escuchar y marcar verdadero o falso",
        "Escuchar y relacionar personas",
        "Escuchar y ordenar la secuencia",
        "Dictado con audio",
        "Escuchar y repetir",
        "Diálogo interactivo",
        "Misión del día",
        "Quiz situacional",
        "Video con preguntas",
        "Test final del tema",
        "Debate grabado",
        "Contar una historia",
        "Simulación de entrevista de trabajo",
        "Retroalimentación por voz",
      ];

      // ===== Plantillas (1:1 con TASK_OPTIONS) =====
      // Uwaga: nie zmieniamy struktury Firestore. Szablony wypełniają istniejące pola formularza.
      const TEMPLATE_GROUPS = {
        choice: new Set([
          "Opción múltiple",
          "Opción única",
          "Elegir la palabra correcta",
          "Elegir la forma correcta",
          "Escuchar y elegir la respuesta",
          "Video con preguntas",
          "Quiz situacional",
          "Test final del tema",
        ]),
        trueFalse: new Set([
          "Verdadero o falso",
          "Escuchar y marcar verdadero o falso",
        ]),
        fill: new Set([
          "Rellenar los espacios",
          "Completar la forma correcta",
          "Completar con preposición o terminación",
          "Escuchar y completar los espacios",
          "Dictado con audio",
        ]),
        matching: new Set([
          "Relacionar palabra con imagen",
          "Relacionar palabra con traducción",
          "Relacionar pregunta con respuesta",
          "Escuchar y relacionar personas",
          "Unir dos partes de la frase",
        ]),
        ordering: new Set([
          "Ordenar palabras para formar una frase",
          "Escuchar y ordenar la secuencia",
        ]),
        speaking: new Set([
          "Escribir tu propia respuesta",
          "Repetir después del narrador",
          "Completar la frase con tu voz",
          "Responder a una pregunta",
          "Juego de roles",
          "Mini-monólogo",
          "Diálogo semiabierto",
          "Diálogo interactivo",
          "Debate grabado",
          "Contar una historia",
          "Simulación de entrevista de trabajo",
          "Retroalimentación por voz",
          "Escuchar y repetir",
          "Misión del día",
          "Describir una imagen",
          "Decirlo de otra manera",
        ]),
        memory: new Set(["Juego de memoria (pares)"]),
        grouping: new Set(["Agrupar palabras"]),
        cards: new Set(["Tarjetas interactivas"]),
        imageSentence: new Set(["Completar la frase con una imagen"]),
        transform: new Set(["Transformaciones", "Corregir errores"])};

      function templateForType(type) {
        // Default scaffold
        const base = { prompt: "", optionsText: "", answer: "", category: "both", notes: "" };

        // Helpers
        const opt = (...lines) => lines.filter(Boolean).join("\n");
        const noteAudio = "AUDIO_URL: https://...  (pon aquí URL del audio)";

        if (TEMPLATE_GROUPS.trueFalse.has(type)) {
          return {
            ...base,
            prompt: "Lee/Escucha y marca: ¿verdadero o falso?",
            optionsText: opt("true", "false"),
            answer: "true",
            category: "both",
            notes: type.startsWith("Escuchar") ? noteAudio : ""};
        }

        if (TEMPLATE_GROUPS.choice.has(type)) {
          return {
            ...base,
            prompt: "Elige la respuesta correcta:",
            optionsText: opt("A) ...", "B) ...", "C) ...", "D) ..."),
            answer: "B",
            category: "both",
            notes: type.startsWith("Escuchar") || type === "Video con preguntas" ? noteAudio : ""};
        }

        if (TEMPLATE_GROUPS.fill.has(type)) {
          return {
            ...base,
            prompt: "Completa: ___",
            optionsText: "",
            answer: "respuesta_correcta",
            category: "both",
            notes: type.startsWith("Escuchar") || type === "Dictado con audio" ? noteAudio : ""};
        }

        if (TEMPLATE_GROUPS.matching.has(type)) {
          return {
            ...base,
            prompt: "Relaciona los elementos (usa opciones como pares A=...):",
            optionsText: opt("A) ... = 1) ...", "B) ... = 2) ...", "C) ... = 3) ..."),
            answer: "A-1, B-2, C-3",
            category: "both",
            notes: type.startsWith("Escuchar") ? noteAudio : "Formato sugerido: A-1, B-2, C-3"};
        }

        if (TEMPLATE_GROUPS.ordering.has(type)) {
          return {
            ...base,
            prompt: "Ordena los elementos en el orden correcto:",
            optionsText: opt("1) ...", "2) ...", "3) ...", "4) ..."),
            answer: "1-2-3-4",
            category: "both",
            notes: type.startsWith("Escuchar") ? noteAudio : "Respuesta: números en orden, ej. 2-4-1-3"};
        }

        if (TEMPLATE_GROUPS.memory.has(type)) {
          return {
            ...base,
            prompt: "Encuentra los pares:",
            optionsText: opt("A) palabra = traducción", "B) palabra = traducción", "C) palabra = traducción"),
            answer: "pares correctos",
            category: "vocab",
            notes: "Usa opciones como pares: 'polaco = español'"};
        }

        if (TEMPLATE_GROUPS.grouping.has(type)) {
          return {
            ...base,
            prompt: "Agrupa las palabras en categorías:",
            optionsText: opt("Categoría 1: ..., ...", "Categoría 2: ..., ..."),
            answer: "agrupación",
            category: "vocab",
            notes: "Sugerencia: wpisz kategorie + słowa w jednej linii"};
        }

        if (TEMPLATE_GROUPS.cards.has(type)) {
          return {
            ...base,
            prompt: "Tarjetas: (frente → reverso)",
            optionsText: opt("1) PL: ... | ES: ...", "2) PL: ... | ES: ...", "3) PL: ... | ES: ..."),
            answer: "",
            category: "vocab",
            notes: "Możesz dodać AUDIO_URL w Notas dla kart."};
        }

        if (TEMPLATE_GROUPS.imageSentence.has(type)) {
          return {
            ...base,
            prompt: "Completa la frase usando la imagen:",
            optionsText: "",
            answer: "respuesta",
            category: "both",
            notes: "Dodaj URL obrazka w polu Imagen."};
        }

        if (TEMPLATE_GROUPS.transform.has(type)) {
          return {
            ...base,
            prompt: type === "Corregir errores" ? "Popraw zdanie:" : "Przekształć zdanie według wzoru:",
            optionsText: "",
            answer: "respuesta_correcta",
            category: "grammar",
            notes: "Możesz podać przykład w Notas."};
        }

        if (type === "Responder a una pregunta") {
          return { ...base, prompt: "Responde con una frase completa:", answer: "respuesta", category: "both" };
        }

        if (type === "Describir una imagen") {
          return { ...base, prompt: "Describe la imagen en 2–3 frases:", answer: "", category: "both", notes: "Dodaj URL obrazka." };
        }

        // Fallback
        return { ...base, prompt: `Actividad: ${type}`, answer: "", category: "both" };
      }

      function setOptionsVisibility(type) {
        // Ukryj opcje dla typów otwartych / voice itd.
        const needsOptions =
          TEMPLATE_GROUPS.choice.has(type) ||
          TEMPLATE_GROUPS.trueFalse.has(type) ||
          TEMPLATE_GROUPS.matching.has(type) ||
          TEMPLATE_GROUPS.ordering.has(type) ||
          TEMPLATE_GROUPS.memory.has(type) ||
          TEMPLATE_GROUPS.grouping.has(type) ||
          TEMPLATE_GROUPS.cards.has(type);

        const optWrap = document.getElementById("exOptions")?.closest("div");
        if (optWrap) optWrap.style.display = needsOptions ? "" : "none";
      }

      function applyTemplateForSelectedType(overwrite = false) {
        const type = String(exType.value || "");
        if (!type) return;

        const tpl = templateForType(type);

        // Only fill empty fields unless overwrite=true
        const setVal = (el, val) => {
          if (!el) return;
          const cur = String(el.value || "");
          if (overwrite || cur.trim() === "") el.value = val;
        };

        setOptionsVisibility(type);
        setVal(exPrompt, tpl.prompt);
        setVal(exOptions, tpl.optionsText);
        setVal(exAnswer, tpl.answer);
        setVal(exNotes, tpl.notes);
        if (exCategory && (overwrite || !exCategory.value)) exCategory.value = tpl.category || "both";
      }



      function fillExerciseTypes() {
        if (!exType) return;
        exType.innerHTML = TASK_OPTIONS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
        const saved = localStorage.getItem("lastExerciseType");
        if (saved && TASK_OPTIONS.includes(saved)) exType.value = saved;
        if (exType) exType.addEventListener("change", () => localStorage.setItem("lastExerciseType", exType.value));
      }

      // ===== Safe "no params" screen =====
      if (!params.get("level") && !params.get("id") && !params.get("slug")) {
        topicTitle.textContent = "Brak wybranego tematu";
        topicDesc.textContent =
          "Otwórz najpierw course.html i kliknij temat (lesson otworzy się automatycznie z parametrami).";
        pillType.textContent = "—";
        pillSlug.textContent = "slug: —";
        // keep nav "Lección" pointing to lesson page (no topic selected)
        if (btnLeccion) btnLeccion.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}`;
        pillCount.textContent = "Ejercicios: —";
        exerciseList.innerHTML = "";
        emptyExercises.style.display = "block";
      }

      // ===== Topic loading =====
      let currentTopic = null;
      let isAdmin = false;
      // NOTE: use `var` to avoid temporal-dead-zone issues if referenced before declaration.
      // Admin UI is moved to ejercicioadmin.html, so this stays false here.
      var IS_ADMIN = false; // compat: admin moved to ejercicioadmin.html
      let cachedExercises = [];
      // ===== User progress (Firestore) =====
      let CURRENT_TOPIC_KEY = null; // `${LEVEL}__${slug}`
      let TOTAL_EXERCISES = 0;
      let DONE_SET = new Set();

      const pillProgress = document.getElementById("pillProgress");
      const progressFill = document.getElementById("progressFill");
      const progressText = document.getElementById("progressText");

      function progressDocRef(uid, topicKey){
        return doc(db, "user_progress", uid, "topics", topicKey);
      }

      function renderProgress(doneCount, total){
        const t = Number(total || 0);
        const d = Number(doneCount || 0);
        const pct = t ? Math.round((d / t) * 100) : 0;

        if (pillProgress) pillProgress.textContent = `Progreso: ${pct}%`;
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${d} / ${t} completados`;
      }

      async function loadProgressForTopic(uid){
        if(!uid || !CURRENT_TOPIC_KEY) return;
        try{
          const ref = progressDocRef(uid, CURRENT_TOPIC_KEY);
          const snap = await getDoc(ref);
          DONE_SET = new Set();
          if(snap.exists()){
            const data = snap.data() || {};
            const done = Array.isArray(data.doneIds) ? data.doneIds : [];
            done.forEach(id=> DONE_SET.add(String(id)));
            const total = Number(data.totalExercises || TOTAL_EXERCISES || 0);
            TOTAL_EXERCISES = total || TOTAL_EXERCISES;
          }
          renderProgress(DONE_SET.size, TOTAL_EXERCISES);
        }catch(e){
          // permissions or missing rules -> silently ignore (UI stays 0)
          console.warn("Progress read failed:", e?.code || e);
          renderProgress(DONE_SET.size, TOTAL_EXERCISES);
        }
      }

      async function markDone(uid, exId){
        if(!uid || !CURRENT_TOPIC_KEY || !exId) return;
        const id = String(exId);
        if(DONE_SET.has(id)) return;

        DONE_SET.add(id);
        renderProgress(DONE_SET.size, TOTAL_EXERCISES);

        try{
          const ref = progressDocRef(uid, CURRENT_TOPIC_KEY);
          await setDoc(ref, {
            level: LEVEL,
            topicSlug: (currentTopic && (currentTopic.slug || currentTopic.id)) ? String(currentTopic.slug || currentTopic.id) : null,
            totalExercises: Number(TOTAL_EXERCISES || 0),
            updatedAt: serverTimestamp()
          }, { merge: true });

          // arrayUnion requires write permission to user's own doc
          await updateDoc(ref, { doneIds: arrayUnion(id), updatedAt: serverTimestamp() });
        }catch(e){
          console.warn("Progress write failed:", e?.code || e);
        }
      }

      function normalizeTopic(t) {
        return {
          id: t.id,
          level: (t.level || "").toString().toUpperCase(),
          type: (t.type || "").toString(),
          title: t.title || "",
          desc: t.desc || "",
          slug: (t.slug || slugParam || t.id || "").toString(),
          tasks: Array.isArray(t.tasks) ? t.tasks : []};
      }

      function renderTopic(t) {
        pillType.textContent = t.type === "grammar" ? "Gramática" : "Vocabulario";
        const eff = (t.slug || t.id) ? String(t.slug || t.id) : "";
        pillSlug.textContent = eff ? `slug: ${eff}` : "slug: —";
        topicTitle.textContent = t.title || "Tema";
        topicDesc.textContent = t.desc || "";

        taskChips.innerHTML = "";
        if (t.tasks && t.tasks.length) {
          t.tasks.slice(0, 14).forEach((x) => {
            const span = document.createElement("span");
            span.className = "pill";
            span.textContent = x;
            taskChips.appendChild(span);
          });
        }
      }

      async function loadTopic() {
        // 1) by id
        if (idParam) {
          const ref = doc(db, "courses", idParam);
          const snap = await getDoc(ref);
          if (!snap.exists()) return null;
          const data = snap.data();
          currentTopic = normalizeTopic({ id: snap.id, ...data });
          renderTopic(currentTopic);
          return currentTopic;
        }

        // 2) by slug + level
        if (!slugParam) return null;

        const q = query(collection(db, "courses"), where("level", "==", LEVEL), where("slug", "==", slugParam));
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const d = snap.docs[0];
        currentTopic = normalizeTopic({ id: d.id, ...d.data() });
        renderTopic(currentTopic);
        return currentTopic;
      }

      // ===== Exercises loading/render =====

      function renderExerciseList() {
        exerciseList.innerHTML = "";

        const list = Array.isArray(VIEW_EXERCISES) ? VIEW_EXERCISES : [];
        const total = Array.isArray(ALL_EXERCISES) ? ALL_EXERCISES.length : 0;
        const shown = list.length;

        pillCount.textContent = qLabel(total, shown);

        if (!shown) {
          emptyExercises.style.display = "block";
          return;
        }

        emptyExercises.style.display = "none";

        // Ensure visual order label is consistent with current array order in reorder mode
        list.forEach((ex, idx) => {
          // For display only; actual "order" is saved to Firestore when you click "Zapisz kolejność"
          if (REORDER_MODE && IS_ADMIN) ex.__tmpOrder = idx + 1;
        });

        list.forEach((ex, idx) => {
          const x = { ...ex, order: (REORDER_MODE && IS_ADMIN) ? (ex.__tmpOrder || (idx + 1)) : ex.order };
          exerciseList.insertAdjacentHTML("beforeend", renderExerciseCard(x, idx));
        });

        list.forEach((ex) => attachExerciseHandlers(ex));
      }

      function qLabel(total, shown) {
        if (!filterSearch && !filterType && !filterCategory) return `Ejercicios: ${total}`;
        if (shown === total) return `Ejercicios: ${total}`;
        return `Ejercicios: ${shown} / ${total}`;
      }
      function getNextOrder() {
        if (!cachedExercises.length) return 1;
        const max = Math.max(...cachedExercises.map((x) => Number(x.order || 0)));
        return (max || 0) + 1;
      }

      function renderExerciseCard(ex, idx) {
        const type = ex.type || "Ejercicio";
        const prompt = ex.prompt || "";
        const options = Array.isArray(ex.options) ? ex.options : [];
        const order = Number(ex.order || idx + 1);

        const isChoice = options.length >= 2;
        const isFill = type === "Rellenar los espacios" || !isChoice;

        const optionsHtml = isFill
          ? `
            <div class="inputRow">
              <input class="textInput" id="inp-${ex.id}" placeholder="Escribe tu respuesta..." />
              <button class="btn btn-yellow" id="chk-${ex.id}" type="button">Comprobar</button>
            </div>
          `
          : `
            <div class="opts" id="opts-${ex.id}">
              ${options
                .map((o) => `<button class="optBtn" type="button" data-ex="${ex.id}" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`)
                .join("")}
            </div>
          `;

        const adminControls = ""; // admin moved to ejercicioadmin.html
return `
          <div class="exercise ${REORDER_MODE && IS_ADMIN ? "dragHint" : ""}" id="ex-${ex.id}" data-id="${ex.id}" ${REORDER_MODE && IS_ADMIN ? "draggable=\"true\"" : ""}>
            ${adminControls}
            <div class="type">${escapeHtml(type)} · #${order} ${ex.category ? ` · <span class="pill pill-blue" style="padding:2px 8px; font-size:12px">${escapeHtml(ex.category)}</span>` : ""}</div>
            <h3>${escapeHtml(prompt)}</h3>
            ${ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" style="max-width:100%; border-radius:14px; border:1px solid rgba(0,0,0,0.08); margin: 10px 0 12px;" />` : ""}
            ${optionsHtml}
            <div class="result" id="res-${ex.id}"></div>
            ${ex.notes ? `<div class="smallNote">${escapeHtml(ex.notes)}</div>` : ""}
          </div>
        `;
      }

      function disableChoiceButtons(exId) {
        const wrap = document.getElementById(`opts-${exId}`);
        if (!wrap) return;
        wrap.querySelectorAll("button.optBtn").forEach((b) => (b.disabled = true));
      }

      function attachExerciseHandlers(ex) {
        const correct = String(ex.answer || "").trim();
        const res = document.getElementById(`res-${ex.id}`);

        // delete
        if (isAdmin) {
        document.getElementById('btnStudentPreview')?.addEventListener('click', ()=>{
          const url = `ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(TOPIC_ID)}&preview=1`;
          window.open(url, '_blank', 'noopener,noreferrer');
        });
          const delBtn = document.getElementById(`del-${ex.id}`);
          if (delBtn) {
            delBtn.onclick = async (ev) => {
              ev.stopPropagation();
              if (!confirm("Usunąć to zadanie?")) return;
              try {
                await deleteDoc(doc(db, "exercises", ex.id));
                showToast("🗑 Usunięto", "ok", 1600);
                await loadExercises(currentTopic);
              } catch (e) {
                console.error(e);
                showToast("❌ Błąd usuwania (sprawdź konsolę)", "bad", 3200);
              }
            };
          }
        }

        // preview (admin)
        if (isAdmin) {
          const pvBtn = document.getElementById(`pv-${ex.id}`);
          if (pvBtn) {
            pvBtn.onclick = (ev) => {
              ev.stopPropagation();
              openPreview(ex);
            };
          }
        }

        // drag&drop reorder (admin)
        const card = document.getElementById(`ex-${ex.id}`);
        if (card && isAdmin && REORDER_MODE) {
          card.addEventListener("dragstart", (e) => {
            DRAG_ID = ex.id;
            card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
          });
          card.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          });
          card.addEventListener("drop", (e) => {
            e.preventDefault();
            const targetId = card.getAttribute("data-id");
            if (!DRAG_ID || !targetId || DRAG_ID === targetId) return;

            const fromIdx = ALL_EXERCISES.findIndex((x) => x.id === DRAG_ID);
            const toIdx = ALL_EXERCISES.findIndex((x) => x.id === targetId);
            if (fromIdx < 0 || toIdx < 0) return;

            const [moved] = ALL_EXERCISES.splice(fromIdx, 1);
            ALL_EXERCISES.splice(toIdx, 0, moved);
            HAS_ORDER_CHANGES = true;
            applyFilters();
          });
        }


        // text input mode
        const inp = document.getElementById(`inp-${ex.id}`);
        const chk = document.getElementById(`chk-${ex.id}`);
        if (inp && chk && res) {
          const check = () => {
            const user = String(inp.value || "").trim();
            if (!user) return;

            const ok = user.toLowerCase() === correct.toLowerCase();
            if (ok) { markDone(CURRENT_UID, ex.id); }
            res.innerHTML = ok
              ? `<span class="ok">✅ Correcto</span>`
              : `<span class="bad">❌ Incorrecto</span> <span class="smallNote">Correcta: ${escapeHtml(correct)}</span>`;
          };

          chk.onclick = check;
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") check();
          });
          return;
        }

        // choice mode
        const wrap = document.getElementById(`opts-${ex.id}`);
        if (!wrap || !res) return;

        wrap.querySelectorAll("button.optBtn").forEach((btn) => {
          btn.onclick = () => {
            const picked = btn.getAttribute("data-opt") || "";
            const ok = picked.trim().toLowerCase() === correct.trim().toLowerCase();
            if (ok) { markDone(CURRENT_UID, ex.id); }

            res.innerHTML = ok
              ? `<span class="ok">✅ Correcto</span>`
              : `<span class="bad">❌ Incorrecto</span> <span class="smallNote">Correcta: ${escapeHtml(correct)}</span>`;

            if (ok) disableChoiceButtons(ex.id);
          };
        });
      }

      async function loadExercises(topic) {
        exerciseList.innerHTML = "";
        emptyExercises.style.display = "none";
        cachedExercises = [];

        const effectiveSlug = (topic && (topic.slug || topic.id)) ? String(topic.slug || topic.id) : "";

        if (!effectiveSlug) {
          emptyExercises.style.display = "block";
          pillCount.textContent = "Ejercicios: —";
          return;
        }

        const qx = query(
          collection(db, "exercises"),
          where("level", "==", LEVEL),
          where("topicSlug", "==", effectiveSlug),
          orderBy("order", "asc"),
        );

        const snap = await getDocs(qx);
        if (snap.empty) {
          emptyExercises.style.display = "block";
          pillCount.textContent = "Ejercicios: 0";
          return;
        }

        snap.forEach((d) => cachedExercises.push({ id: d.id, ...d.data() }));

        // state for filters/reorder
        ALL_EXERCISES = cachedExercises.slice();
        TOTAL_EXERCISES = Array.isArray(ALL_EXERCISES) ? ALL_EXERCISES.length : 0;
        CURRENT_TOPIC_KEY = `${LEVEL}__${effectiveSlug}`;
        await loadProgressForTopic(CURRENT_UID);

        VIEW_EXERCISES = cachedExercises.slice();
        buildTypeFilterOptions();
        applyFilters();

        // admin conveniences
        if (isAdmin) {
          exOrder.value = getNextOrder();
        }
      }

      // ===== Auth + boot =====
      let CURRENT_UID = null;

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.href = "login.html";
          return;
        }

        sessionEmail.textContent = user.email || "(sin correo)";
        CURRENT_UID = user.uid || null;
        isAdmin = false; // admin moved to ejercicioadmin.html
        IS_ADMIN = false; // admin moved to ejercicioadmin.html
        adminWrap.style.display = "none";

        fillExerciseTypes();


        if (exType) {

        // ===== Plantilla UI wiring =====
      const btnApplyTemplate = document.getElementById("btnApplyTemplate");
      const tplOverwrite = document.getElementById("tplOverwrite");

      // Apply on type change (fills only empty fields)
      if (exType) exType.addEventListener("change", () => applyTemplateForSelectedType(false));

      if (btnApplyTemplate) {
        btnApplyTemplate.addEventListener("click", () => applyTemplateForSelectedType(!!tplOverwrite?.checked));
      }

      // Upgrade quick buttons: set type + apply
      const wireQuick = (id, type) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.addEventListener("click", () => {
          exType.value = type;
          localStorage.setItem("lastExerciseType", type);
          applyTemplateForSelectedType(!!tplOverwrite?.checked);
          exPrompt?.focus?.();
        });
      };
      wireQuick("btnTplFill", "Rellenar los espacios");
      wireQuick("btnTplChoice", "Opción múltiple");
      wireQuick("btnTplTF", "Verdadero o falso");

      // First paint: ensure options visibility matches current type
      setOptionsVisibility(exType.value);
        }

        // UI wiring
        if (filterType) {
          // default options; real types filled after load
          filterType.innerHTML = `<option value="">Wszystko</option>`;
        }
        if (!IS_ADMIN) {
          if (toggleReorder) toggleReorder.disabled = true;
          if (toggleReorder) toggleReorder.checked = false;
        }

        const onFilter = () => applyFilters();
        filterSearch?.addEventListener("input", onFilter);
        filterType?.addEventListener("change", onFilter);
        filterCategory?.addEventListener("change", onFilter);

        btnClearFilters?.addEventListener("click", () => {
          if (filterSearch) filterSearch.value = "";
          if (filterType) filterType.value = "";
          if (filterCategory) filterCategory.value = "";
          applyFilters();
        });

        toggleReorder?.addEventListener("change", () => {
          if (!IS_ADMIN) return;
          setReorderMode(toggleReorder.checked);
        });

        btnSaveOrder?.addEventListener("click", async () => {
          if (!IS_ADMIN) return;
          if (!currentTopic || !currentTopic.slug) return;
          if (!HAS_ORDER_CHANGES) {
            setToast("Brak zmian w kolejności.", "info");
            return;
          }

          try {
            btnSaveOrder.disabled = true;
            // save sequential order starting at 1
            for (let i = 0; i < ALL_EXERCISES.length; i++) {
              const ex = ALL_EXERCISES[i];
              await updateDoc(doc(db, "exercises", ex.id), { order: i + 1 });
            }
            setToast("💾 Zapisano kolejność.", "ok");
            HAS_ORDER_CHANGES = false;
            await loadExercises(currentTopic);
          } catch (e) {
            console.error(e);
            setToast("❌ Nie udało się zapisać kolejności (konsola).", "error");
          } finally {
            btnSaveOrder.disabled = false;
          }
        });

        // ESC closes preview
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && previewModal?.style.display === "block") {
            previewModal.style.display = "none";
          }
        });


        // If opened without params, do not try to query Firestore
        if (!params.get("id") && !params.get("slug")) return;

        try {
          showToast("⏳ Cargando tema...", "warn", 1200);

          const topic = await loadTopic();
      // Lesson editor will be shown after topic loads
          if (!topic) {
            topicTitle.textContent = "Tema no encontrado";
            topicDesc.textContent = "No se pudo cargar el tema. Verifica el enlace (level/slug/id).";
            pillType.textContent = "—";
            pillSlug.textContent = "slug: —";
            pillCount.textContent = "Ejercicios: —";
            emptyExercises.style.display = "block";
            showToast("⚠️ No se encontró el tema", "warn", 2600);
            return;
          }

          await loadLessonMetaPublic(topic);
          if (isAdmin) await loadLessonMeta(topic);
          await loadExercises(topic);
          if (isAdmin) {
            exOrder.value = String(getNextOrder());
          }
        } catch (e) {
          console.error(e);
          showToast("❌ Error al cargar (mira la consola)", "bad", 3600);
        }
      });

      // ===== Admin actions =====

      // Templates
      function applyTemplate(kind){
        if(!isAdmin) return;
        const next = String(getNextOrder());
        if(kind === "fill"){
          exType.value = "Rellenar los espacios";
          exPrompt.value = "Completa la frase: Yo ___ de España.";
          exOptions.value = "";
          exAnswer.value = "soy";
          exCategory.value = "grammar";
          exNotes.value = "Podpowiedź: czasownik 'być' w 1 os.";
          if (exTags) exTags.value = "czasowniki, być";
          if (exImageUrl) exImageUrl.value = "";
          exOrder.value = next;
        } else if(kind === "choice"){
          exType.value = "Opción múltiple";
          exPrompt.value = "Elige la forma correcta: Ona ___ w domu.";
          exOptions.value = "A) jestem\nB) jest\nC) są";
          exAnswer.value = "B";
          exCategory.value = "grammar";
          exNotes.value = "";
          if (exTags) exTags.value = "być, teraźniejszy";
          if (exImageUrl) exImageUrl.value = "";
          exOrder.value = next;
        } else if(kind === "tf"){
          exType.value = "Verdadero o falso";
          exPrompt.value = "‘Mam’ es la forma de ‘tener’ en polaco (1ª persona).";
          exOptions.value = "true\nfalse";
          exAnswer.value = "true";
          exCategory.value = "vocab";
          exNotes.value = "";
          if (exTags) exTags.value = "mieć, podstawy";
          if (exImageUrl) exImageUrl.value = "";
          exOrder.value = next;
        }
        showToast("✨ Plantilla aplicada", "ok", 1400);
      }

      btnTplFill?.addEventListener("click", () => applyTemplate("fill"));
      btnTplChoice?.addEventListener("click", () => applyTemplate("choice"));
      btnTplTF?.addEventListener("click", () => applyTemplate("tf"));

      // Import JSON (array)
      function safeParseJsonArray(raw){
        const txt = (raw || "").trim();
        if(!txt) return [];
        const parsed = JSON.parse(txt);
        if(!Array.isArray(parsed)) throw new Error("JSON debe ser un ARRAY []");
        return parsed;
      }

      btnClearImport?.addEventListener("click", () => { if(importJsonArea) importJsonArea.value = ""; if(importStatus) importStatus.textContent = ""; });

      btnImportJson?.addEventListener("click", async () => {
        if(!isAdmin || !currentTopic) return;
        if(!importJsonArea) return;

        if(importStatus) importStatus.textContent = "Importando...";
        let items = [];
        try{
          items = safeParseJsonArray(importJsonArea.value);
        }catch(e){
          console.error(e);
          if(importStatus) importStatus.textContent = "JSON inválido ❌";
          showToast("❌ JSON inválido (mira la consola)", "bad", 3200);
          return;
        }

        if(!items.length){
          if(importStatus) importStatus.textContent = "Nada para importar.";
          showToast("⚠️ Wklej tablicę ćwiczeń", "warn", 2200);
          return;
        }

        try{
          setSaving(true);
          const baseSlug = String(currentTopic.slug || currentTopic.id || "");
          let auto = getNextOrder();
          let saved = 0;

          // sequential to keep stable ordering
          for(const it of items){
            if(!it || typeof it !== "object") continue;

            const type = String(it.type || "Rellenar los espacios");
            const prompt = String(it.prompt || "").trim();
            const answer = normalizeAnswer(String(it.answer || ""));
            const options = Array.isArray(it.options) ? it.options.map(x=>String(x)) : parseOptions(String(it.options||""));
            const notes = String(it.notes || "");
            const category = String(it.category || "grammar");
            const tags = Array.isArray(it.tags) ? it.tags.map(x=>String(x)) : toTagsArray(String(it.tags||""));
            const imageUrl = String(it.imageUrl || "").trim();

            if(!prompt || !answer) continue;

            const order = Number(it.order || 0) > 0 ? Number(it.order) : auto++;

            await addDoc(collection(db, "exercises"), {
              level: LEVEL,
              topicSlug: baseSlug,
              topicId: currentTopic.id || null,
              type,
              prompt,
              imageUrl,
              options: options.length ? options : [],
              answer,
              notes,
              category,
              tags,
              order,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()});

            saved++;
          }

          if(importStatus) importStatus.textContent = `Importado: ${saved} ✅`;
          showToast(`✅ Importado: ${saved}`, "ok", 2200);

          await loadExercises(currentTopic);
          exOrder.value = String(getNextOrder());
        }catch(e){
          console.error(e);
          if(importStatus) importStatus.textContent = "Error ❌";
          showToast("❌ Error importando (mira la consola)", "bad", 3600);
        }finally{
          setSaving(false);
        }
      });

      if (btnAutoOrder && exOrder) btnAutoOrder.onclick = () => {
        exOrder.value = String(getNextOrder());
        showToast("✨ Ustawiono order", "ok", 1400);
      };

      if (btnAddExercise) btnAddExercise.onclick = async () => {
        if (!isAdmin || !currentTopic) return;

        // reset validation
        [exPrompt, exOptions, exAnswer, exOrder].forEach((el) => markBad(el, false));

        const type = exType.value;
        const prompt = exPrompt.value.trim();
        const notes = exNotes.value.trim();
        const answer = normalizeAnswer(exAnswer.value);
        const order = Number(exOrder.value || 0);

        let ok = true;

        if (!prompt) { markBad(exPrompt, true); ok = false; }
        if (!answer) { markBad(exAnswer, true); ok = false; }
        if (!order || order < 1) { markBad(exOrder, true); ok = false; }

        const options = parseOptions(exOptions.value);
        const needsOptions = (options.length > 0) || type === "Opción múltiple" || type === "Verdadero o falso";

        if (needsOptions && options.length < 2) {
          markBad(exOptions, true);
          ok = false;
        }

        if (!ok) {
          showToast("⚠️ Completa los campos marcados.", "warn", 2600);
          return;
        }

        try {
          setSaving(true);
          showToast("⏳ Guardando...", "warn", 1200);

          await addDoc(collection(db, "exercises"), {
            level: LEVEL,
            topicSlug: String(currentTopic.slug || currentTopic.id || ""),
            topicId: currentTopic.id || null,
            type,
            prompt,
            imageUrl,
            options: options.length ? options : [],
            answer,
            notes,
            category: (exCategory?.value || "grammar"),
            tags: toTagsArray(exTags?.value),
            order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()});

          // reset form
          exPrompt.value = "";
          if (exImageUrl) exImageUrl.value = "";
          exOptions.value = "";
          exAnswer.value = "";
          exNotes.value = "";
          if (exTags) exTags.value = "";
          exOrder.value = String(order + 1);

          await loadExercises(currentTopic);
          showToast("✅ Ejercicio guardado", "ok", 2200);
        } catch (e) {
          console.error(e);
          showToast("❌ Error al guardar (mira la consola)", "bad", 3600);
        } finally {
          setSaving(false);
        }
      };

      // Enter on answer = save (admin)
      if (exAnswer && btnAddExercise) {
        exAnswer.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && isAdmin) btnAddExercise.click();
        });
      }


      // ===== state =====
      let ALL_EXERCISES = [];
      let VIEW_EXERCISES = [];
      let REORDER_MODE = false;
      let HAS_ORDER_CHANGES = false;
      let DRAG_ID = null;

      function toTagsArray(s) {
        return String(s || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }

      function setToast(msg, kind = "info") {
        const el = document.getElementById("toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.remove("toast-red", "toast-yellow");
        if (kind === "error") el.classList.add("toast-red");
        if (kind === "ok") el.classList.add("toast-yellow");
        el.style.opacity = "1";
        clearTimeout(window.__toastT);
        window.__toastT = setTimeout(() => (el.style.opacity = "0"), 2500);
      }

      function applyFilters() {
        const q = (filterSearch?.value || "").trim().toLowerCase();
        const t = (filterType?.value || "").trim();
        const c = (filterCategory?.value || "").trim();

        VIEW_EXERCISES = ALL_EXERCISES.filter((ex) => {
          const hay = `${ex.prompt || ""} ${ex.answer || ""} ${(ex.options || []).join(" ")} ${(ex.notes || "")}`.toLowerCase();
          const okQ = !q || hay.includes(q);
          const okT = !t || ex.type === t;
          const okC = !c || (ex.category || "grammar") === c;
          return okQ && okT && okC;
        });

        renderExerciseList();
      }

      function buildTypeFilterOptions() {
        if (!filterType) return;
        const unique = Array.from(new Set(ALL_EXERCISES.map((e) => e.type))).sort();
        filterType.innerHTML =
          `<option value="">Wszystko</option>` +
          unique.map((x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
      }

      function setReorderMode(on) {
        REORDER_MODE = !!on;
        HAS_ORDER_CHANGES = false;
        if (btnSaveOrder) btnSaveOrder.style.display = (REORDER_MODE && IS_ADMIN) ? "inline-flex" : "none";
        renderExerciseList();
      }

      function openPreview(ex) {
        if (!previewModal) return;
        previewResult.style.display = "none";
        previewResult.textContent = "";
        previewResult.className = "pill";

        const opt = Array.isArray(ex.options) ? ex.options : [];
        const type = ex.type || "open";

        let body = `<div class="card" style="padding:12px; margin:0">
          <div class="smallNote" style="opacity:.9; margin-bottom:8px">Typ: <b>${escapeHtml(type)}</b> • Kategoria: <b>${escapeHtml(ex.category || "grammar")}</b></div>
          <div style="font-weight:800; font-size:18px">${escapeHtml(ex.prompt || "")}</div>`;

        if (opt.length) {
          body += `<div style="margin-top:10px; display:grid; gap:8px">` +
            opt.map((o, i) => {
              const letter = String.fromCharCode(65 + i);
              return `<label class="card" style="padding:10px; margin:0; cursor:pointer; display:flex; gap:10px; align-items:flex-start">
                <input type="radio" name="pv" value="${escapeHtml(o)}" style="margin-top:2px" />
                <div><b>${letter})</b> ${escapeHtml(o)}</div>
              </label>`;
            }).join("") + `</div>`;
          body += `<div class="smallNote" style="margin-top:8px; opacity:.9">Wybierz odpowiedź i kliknij „Sprawdź”.</div>`;
        } else {
          body += `<div style="margin-top:10px">
            <input id="pvInput" placeholder="Wpisz odpowiedź…" />
          </div>`;
        }

        if (ex.notes) {
          body += `<div class="smallNote" style="margin-top:10px; opacity:.9">Nota: ${escapeHtml(ex.notes)}</div>`;
        }

        body += `</div>`;
        previewBody.innerHTML = body;

		if (btnCheckPreview) btnCheckPreview.onclick = () => {
          let userAnswer = "";
          const picked = previewBody.querySelector('input[name="pv"]:checked');
          if (picked) userAnswer = picked.value;
          else userAnswer = (document.getElementById("pvInput")?.value || "").trim();

          const correct = normalizeAnswer(ex.answer);
          const given = normalizeAnswer(userAnswer);
          const ok = !!given && given === correct;

          previewResult.style.display = "inline-flex";
          previewResult.classList.toggle("pill-yellow", ok);
          previewResult.classList.toggle("pill-red", !ok);
          previewResult.textContent = ok ? "✅ OK" : `❌ Nie. Poprawna: ${ex.answer || ""}`;
		};

		if (previewBackdrop) previewBackdrop.onclick = () => (previewModal && (previewModal.style.display = "none"));
		if (btnClosePreview) btnClosePreview.onclick = () => (previewModal && (previewModal.style.display = "none"));
		if (previewModal) previewModal.style.display = "block";
      }
 </script>
    <script src="assets/js/layout.js" defer></script>

<script>
(function(){
  const GLOBAL_KEY = "AV_COFFEE_CFG_GLOBAL";
  const PREFIX = "AV_COFFEE_CFG::";

  const el = document.getElementById("coffeeFloat");
  if(!el) return;

  const defaults = {
    enabled: true,
    anchor: "right",     // "right" or "left"
    x: -40,              // right/left (px)
    y: 360,              // top (px)
    size: 420,           // px
    opacity: 0.9,        // 0..1
    z: 1,                // z-index
    hideMobile: true
  };

  function clamp(n,min,max){ n=Number(n); if(Number.isNaN(n)) return min; return Math.min(max, Math.max(min, n)); }
  function safePath(){
    try{
      const p = (location && location.pathname) ? location.pathname : "";
      return p.replace(/[^a-z0-9_\-./]/gi,"_");
    }catch(e){ return ""; }
  }
  function pageKey(){ return PREFIX + safePath(); }

  function readJSON(key){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){ return null; }
  }

  function loadCfg(){
    const g = readJSON(GLOBAL_KEY) || {};
    const p = readJSON(pageKey()) || {};
    return { ...defaults, ...g, ...p };
  }

  function applyCfg(cfg){
    cfg = { ...defaults, ...cfg };

    if(!cfg.enabled){
      el.style.display = "none";
      return;
    }else{
      el.style.display = "";
    }

    el.style.top = (Number(cfg.y)||defaults.y) + "px";

    const x = Number(cfg.x);
    if(cfg.anchor === "left"){
      el.style.left = (Number.isFinite(x)?x:defaults.x) + "px";
      el.style.right = "auto";
    }else{
      el.style.right = (Number.isFinite(x)?x:defaults.x) + "px";
      el.style.left = "auto";
    }

    const size = clamp(cfg.size, 120, 900);
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.opacity = clamp(cfg.opacity, 0.05, 1);
    el.style.zIndex = String(Number(cfg.z)||defaults.z);

    // hide mobile toggle (overrides CSS media query)
    if(cfg.hideMobile === false){
      el.style.setProperty("display","", "important");
    }
  }

  function saveCfg(cfg, scope){
    const key = (scope === "page") ? pageKey() : GLOBAL_KEY;
    localStorage.setItem(key, JSON.stringify(cfg));
  }

  function clearCfg(scope){
    const key = (scope === "page") ? pageKey() : GLOBAL_KEY;
    localStorage.removeItem(key);
  }

  // expose for admin page
  window.AV_Coffee = {
    GLOBAL_KEY,
    PREFIX,
    defaults,
    safePath,
    pageKey,
    load: loadCfg,
    apply: applyCfg,
    save: saveCfg,
    clear: clearCfg
  };

  applyCfg(loadCfg());

  window.addEventListener("storage", (e)=>{
    if(!e || !e.key) return;
    if(e.key === GLOBAL_KEY || e.key === pageKey()) applyCfg(loadCfg());
  });
})();
