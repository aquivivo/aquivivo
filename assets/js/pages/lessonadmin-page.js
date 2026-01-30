import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
    import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { auth, db } from "../firebase-init.js";

    const ADMIN_EMAILS = ["aquivivo.pl@gmail.com"];
    const isAdmin = (email) => ADMIN_EMAILS.some(a => (a||"").toLowerCase() === (email||"").toLowerCase());
    const $ = (id) => document.getElementById(id);

    const toast = $("toast");
    const btnLogout = $("btnLogout");
    const btnBackCourse = $("btnBackCourse");
    const btnOpenLesson = $("btnOpenLesson");
    const btnOpenExercises = $("btnOpenExercises");

    const pillLevel = $("pillLevel");
    const pillTopic = $("pillTopic");
    const pillDoc = $("pillDoc");
    const pillPub = $("pillPub");

    const adminOnly = $("adminOnly");
    const noAdmin = $("noAdmin");

    const titleInput = $("titleInput");
    const descInput = $("descInput");
    const typeSelect = $("typeSelect");
    const durationInput = $("durationInput");
    const publishedToggle = $("publishedToggle");
    const htmlArea = $("htmlArea");

    // Blocks builder
    const btnAddHeading = $("btnAddHeading");
    const btnAddText = $("btnAddText");
    const btnAddImage = $("btnAddImage");
    const btnAddTip = $("btnAddTip");
    const btnAddExample = $("btnAddExample");
    const btnAddDivider = $("btnAddDivider");

    const defaultTextColor = $("defaultTextColor");
    const defaultTextSize = $("defaultTextSize");
    const defaultBlockBg = $("defaultBlockBg");


    const btnTplGrammar = $("btnTplGrammar");
    const btnTplVocab = $("btnTplVocab");
    const btnTplPremium = $("btnTplPremium");
    const btnTplRepaso = $("btnTplRepaso");

    const blocksList = $("blocksList");
    const btnClearBlocks = $("btnClearBlocks");
    const htmlMode = $("htmlMode");
    const btnWrapHtml = $("btnWrapHtml");

    let BLOCKS = [];
    let IS_SYNCING_HTML = false;

    const btnLoad = $("btnLoad");
    const btnSave = $("btnSave");

    const previewTitle = $("previewTitle");
    const previewDesc = $("previewDesc");
    const previewBody = $("previewBody");

    const params = new URLSearchParams(location.search);
    const LEVEL = (params.get("level") || "").toUpperCase();
    const TOPIC_ID = (params.get("id") || "").trim();
    const DOC_ID = `${LEVEL}__${TOPIC_ID}`;

    btnBackCourse.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
    btnOpenLesson.href = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(TOPIC_ID)}`;
    btnOpenExercises.href = `ejercicioadmin.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(TOPIC_ID)}`;

    function showToast(msg, kind="toast-ok"){
      if(!toast) return;
      toast.className = kind;
      toast.textContent = msg;
      toast.style.display = "block";
      clearTimeout(showToast._t);
      showToast._t = setTimeout(()=>{ toast.style.display = "none"; }, 2500);
    }

    function setMetaPills(published){
      pillLevel.textContent = `Nivel: ${LEVEL || "—"}`;
      pillTopic.textContent = `Tema: ${TOPIC_ID || "—"}`;
      pillDoc.textContent = `Doc: ${DOC_ID || "—"}`;
      pillPub.className = "pill " + (published ? "pill-green" : "pill-red");
      pillPub.textContent = published ? "Publicado" : "Borrador";
    }

    function renderPreview(){
      const t = (titleInput.value || "").trim();
      const d = (descInput.value || "").trim();
      const h = (htmlArea.value || "").trim();

      previewTitle.textContent = t || "—";
      previewDesc.textContent = d || "—";
      previewBody.innerHTML = h || "<div style='opacity:.8'>Sin contenido todavía.</div>";
    }

    function uid(){
      return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }

    function escapeHtml(s){
      return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    function colorToCss(c){
      // limited palette (premium look, no chaos)
      if(c === "yellow") return "var(--yellow)";
      if(c === "blue") return "#bcd3ff";
      if(c === "red") return "#ffd1d7";
      if(c === "muted") return "rgba(255,255,255,0.86)";
      return "#ffffff";
    }

    function bgToCss(bg){
      if(bg === "white") return "rgba(255,255,255,0.10)";
      if(bg === "yellow") return "rgba(252,209,22,0.14)";
      if(bg === "blue") return "rgba(0,56,147,0.18)";
      if(bg === "red") return "rgba(206,17,38,0.14)";
      return "";
    }

    function sizeToCss(s){
      if(s === "xs") return "12px";
      if(s === "sm") return "13px";
      if(s === "lg") return "18px";
      if(s === "xl") return "20px";
      return "15px";
    }

    function newBlock(kind){
      const base = { id: uid(), kind, color: "muted", size: "md", align: "left", bg: "none" };
      if(kind === "heading") return { ...base, text: "Nuevo título", level: "h2", color: "yellow" };
      if(kind === "text") return { ...base, text: "Escribe aquí el texto…" };
      if(kind === "image") return { ...base, url: "", caption: "", width: "full" };
      if(kind === "tip") return { ...base, title: "Tip", text: "Consejo importante…", accent: "yellow" };
      if(kind === "example") return { ...base, title: "Ejemplo", text: "", accent: "blue" };
      if(kind === "divider") return { ...base };
      if(kind === "rawHtml") return { ...base, html: (htmlArea.value || "").trim() };
      return base;
    }

    function compileBlocksToHtml(blocks){
      const out = [];
      for(const b of (blocks || [])){
        if(!b || !b.kind) continue;

        const align = (b.align === "center" ? "center" : (b.align === "right" ? "right" : "left"));
        const fontSize = sizeToCss(b.size || "md");
        const color = colorToCss(b.color || "muted");

        if(b.kind === "divider"){
          out.push(`<hr style="border:none; border-top:1px solid rgba(255,255,255,0.14); margin: 18px 0;" />`);
          continue;
        }

        if(b.kind === "rawHtml"){
          out.push(String(b.html || ""));
          continue;
        }

        if(b.kind === "heading"){
          const lvl = (b.level === "h3" ? "h3" : "h2");
          const text = escapeHtml(b.text || "");
          const bg = bgToCss(b.bg);
          if(bg){
            out.push(`<div style="margin: 12px 0; padding: 14px 14px; border-radius: 16px; background:${bg}; border:1px solid rgba(255,255,255,0.14);">
              <${lvl} style="margin: 0; text-align:${align}; color:${color};">${text}</${lvl}>
            </div>`);
          }else{
            out.push(`<${lvl} style="margin: 18px 0 10px; text-align:${align}; color:${color};">${text}</${lvl}>`);
          }
          continue;
        }

        if(b.kind === "text"){
          const text = escapeHtml(b.text || "").replaceAll("\n","<br>");
          const bg = bgToCss(b.bg);
          if(bg){
            out.push(`<div style="margin: 12px 0; padding: 14px 14px; border-radius: 16px; background:${bg}; border:1px solid rgba(255,255,255,0.14); text-align:${align};">
              <div style="color:${color}; font-size:${fontSize}; line-height:1.65; text-align:${align};">${text}</div>
            </div>`);
          }else{
            out.push(`<div style="margin: 10px 0; text-align:${align}; color:${color}; font-size:${fontSize}; line-height:1.65;">${text}</div>`);
          }
          continue;
        }

        if(b.kind === "image"){
          const url = (b.url || "").trim();
          if(url){
            const safe = escapeHtml(url);
            const maxW = (b.width === "narrow" ? "780px" : "100%");
            const bg = bgToCss(b.bg);
            if(bg){
              out.push(`<div style="margin: 12px 0; padding: 14px 14px; border-radius: 16px; background:${bg}; border:1px solid rgba(255,255,255,0.14); text-align:${align};">
                <img src="${safe}" alt="" style="max-width:${maxW}; width:100%; border-radius: 18px; border: 1px solid rgba(255,255,255,0.14); display:block; margin: 0 auto;" />
                ${b.caption ? `<div style="margin-top:8px; font-size:12px; opacity:0.86;">${escapeHtml(b.caption)}</div>` : ""}
              </div>`);
            }else{
              out.push(`<div style="margin: 14px 0; text-align:${align};">
                <img src="${safe}" alt="" style="max-width:${maxW}; width:100%; border-radius: 18px; border: 1px solid rgba(255,255,255,0.14); display:block; margin: 0 auto;" />
                ${b.caption ? `<div style="margin-top:8px; font-size:12px; opacity:0.86;">${escapeHtml(b.caption)}</div>` : ""}
              </div>`);
            }
          }
          continue;
        }

        if(b.kind === "tip" || b.kind === "example"){
          const accent = (b.accent === "red" ? "var(--red)" : (b.accent === "yellow" ? "var(--yellow)" : "#86b7ff"));
          const title = escapeHtml(b.title || (b.kind === "tip" ? "Tip" : "Ejemplo"));
          const text = escapeHtml(b.text || "").replaceAll("\n","<br>");
          out.push(`<div style="margin: 12px 0; border-radius: 16px; padding: 12px 14px; background: rgba(0,0,0,0.18); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 14px 34px rgba(0,0,0,0.12);">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              <span style="width:10px; height:10px; border-radius:999px; background:${accent}; box-shadow: 0 0 0 3px rgba(255,255,255,0.10);"></span>
              <div style="font-weight: 900; color:#fff;">${title}</div>
            </div>
            <div style="color:${color}; font-size:${fontSize}; line-height:1.65; text-align:${align};">${text}</div>
          </div>`);
          continue;
        }
      }
      return out.join("\n");
    }

    function syncHtmlFromBlocks(){
      if(IS_SYNCING_HTML) return;
      IS_SYNCING_HTML = true;
      try{
        const mode = (htmlMode && htmlMode.value) ? htmlMode.value : "auto";
        if(mode === "auto" && BLOCKS.length){
          htmlArea.value = compileBlocksToHtml(BLOCKS);
        }
        // Preview siempre se renderiza desde htmlArea (auto o manual)
        renderPreview();
      } finally {
        IS_SYNCING_HTML = false;
      }
    }

    function renderBlocks(){
      if(!blocksList) return;
      blocksList.innerHTML = "";
      if(!BLOCKS.length) return;

      for(let idx=0; idx<BLOCKS.length; idx++){
        const b = BLOCKS[idx];
        const card = document.createElement("div");
        card.className = "blockCard";

        const kindLabel = ({
          heading: "Título",
          text: "Texto",
          image: "Imagen",
          tip: "Tip",
          example: "Ejemplo",
          divider: "Separador",
          rawHtml: "HTML"
        })[b.kind] || b.kind;

        card.innerHTML = `
          <div class="blockHead">
            <div class="blockTitle">🧩 ${escapeHtml(kindLabel)}</div>
            <div class="blockTools">
              <button class="toolBtn" data-act="up" title="Subir">⬆️</button>
              <button class="toolBtn" data-act="down" title="Bajar">⬇️</button>
              <button class="toolBtn danger" data-act="del" title="Eliminar">🗑</button>
            </div>
          </div>
          <div class="blockBody"></div>
        `;

        const body = card.querySelector(".blockBody");

        // Common styling controls (not for divider)
        if(b.kind !== "divider"){
          const common = document.createElement("div");
          common.className = "inlineRow";
          common.innerHTML = `
            <div class="field">
              <label>Color</label>
              <select class="select" data-k="color">
                <option value="muted">Blanco</option>
                <option value="yellow">Amarillo</option>
                <option value="blue">Azul</option>
                <option value="red">Rojo</option>
              </select>
            </div>
            <div class="field">
              <label>Tamaño</label>
              <select class="select" data-k="size">
                <option value="xs">XS</option>
                <option value="sm">S</option>
                <option value="md">M</option>
                <option value="lg">L</option>
                <option value="xl">XL</option>
              </select>
            </div>
            <div class="field">
              <label>Alineación</label>
              <select class="select" data-k="align">
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </div>
            <div class="field">
              <label>Fondo del bloque</label>
              <select class="select" data-k="bg">
                <option value="none">Sin fondo</option>
                <option value="white">Blanco</option>
                <option value="yellow">Amarillo</option>
                <option value="blue">Azul</option>
                <option value="red">Rojo</option>
              </select>
            </div>
          `;

          body.appendChild(common);

          const selColor = common.querySelector('[data-k="color"]');
          const selSize = common.querySelector('[data-k="size"]');
          const selAlign = common.querySelector('[data-k="align"]');
          if(selColor) selColor.value = b.color || "muted";
          if(selSize) selSize.value = b.size || "md";
          if(selAlign) selAlign.value = b.align || "left";

          common.addEventListener("change", (e)=>{
            const t = e.target;
            const k = t?.getAttribute?.("data-k");
            if(!k) return;
            b[k] = t.value;
            syncHtmlFromBlocks();
          });
        }

        // Kind-specific UI
        const wrap = document.createElement("div");
        wrap.className = "blockGrid";

        if(b.kind === "heading"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>Texto del título</label>
              <input class="input" data-k="text" />
            </div>
            <div class="field">
              <label>Nivel</label>
              <select class="select" data-k="level">
                <option value="h2">H2 (sección)</option>
                <option value="h3">H3 (subsección)</option>
              </select>
            </div>
          `;
        } else if(b.kind === "text"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>Texto</label>
              <textarea data-k="text" style="min-height:150px"></textarea>
            </div>
          `;
        } else if(b.kind === "image"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>URL de imagen</label>
              <input class="input" data-k="url" placeholder="https://..." />
              <div class="mutedTiny">Tip: por ahora usamos URL. Más adelante podemos añadir upload a Firebase Storage.</div>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Caption (opcional)</label>
              <input class="input" data-k="caption" placeholder="Texto bajo la imagen" />
            </div>
            <div class="field">
              <label>Ancho</label>
              <select class="select" data-k="width">
                <option value="full">Completo</option>
                <option value="narrow">Más estrecho</option>
              </select>
            </div>
          `;
        } else if(b.kind === "tip" || b.kind === "example"){
          wrap.innerHTML = `
            <div class="field">
              <label>Título del bloque</label>
              <input class="input" data-k="title" />
            </div>
            <div class="field">
              <label>Color acento</label>
              <select class="select" data-k="accent">
                <option value="yellow">Amarillo</option>
                <option value="blue">Azul</option>
                <option value="red">Rojo</option>
              </select>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Contenido</label>
              <textarea data-k="text" style="min-height:150px"></textarea>
            </div>
          `;
        } else if(b.kind === "rawHtml"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>HTML (sin cambios)</label>
              <textarea data-k="html" style="min-height:220px"></textarea>
              <div class="mutedTiny">Este bloque inserta HTML tal cual. Úsalo solo si lo necesitas.</div>
            </div>
          `;
        } else if(b.kind === "divider"){
          wrap.innerHTML = `
            <div class="mutedTiny">Separador visual (línea).</div>
          `;
        }

        if(wrap.innerHTML.trim()) body.appendChild(wrap);

        // Fill values + bind
        wrap.querySelectorAll("[data-k]").forEach((el)=>{
          const k = el.getAttribute("data-k");
          if(!k) return;
          if(el.tagName === "SELECT") el.value = (b[k] ?? "");
          else el.value = (b[k] ?? "");
          el.addEventListener("input", ()=>{
            b[k] = el.value;
            syncHtmlFromBlocks();
          });
          el.addEventListener("change", ()=>{
            b[k] = el.value;
            syncHtmlFromBlocks();
          });
        });

        // tools
        card.querySelectorAll(".toolBtn").forEach((btn)=>{
          btn.addEventListener("click", ()=>{
            const act = btn.getAttribute("data-act");
            if(act === "del"){
              BLOCKS.splice(idx,1);
              renderBlocks();
              syncHtmlFromBlocks();
              return;
            }
            if(act === "up" && idx > 0){
              const tmp = BLOCKS[idx-1];
              BLOCKS[idx-1] = BLOCKS[idx];
              BLOCKS[idx] = tmp;
              renderBlocks();
              syncHtmlFromBlocks();
              return;
            }
            if(act === "down" && idx < BLOCKS.length-1){
              const tmp = BLOCKS[idx+1];
              BLOCKS[idx+1] = BLOCKS[idx];
              BLOCKS[idx] = tmp;
              renderBlocks();
              syncHtmlFromBlocks();
              return;
            }
          });
        });

        blocksList.appendChild(card);
      }
    }

    function addBlock(kind){
      const b = newBlock(kind);
      // apply defaults from right dock to new blocks (only where it makes sense)
      try{
        const dc = (defaultTextColor && defaultTextColor.value) ? defaultTextColor.value : null;
        const ds = (defaultTextSize && defaultTextSize.value) ? defaultTextSize.value : null;
        const dbg = (defaultBlockBg && defaultBlockBg.value) ? defaultBlockBg.value : null;
        if(dc && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.color = dc;
        if(ds && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.size = ds;
        if(dbg && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.bg = dbg;
      }catch(e){}
      BLOCKS.push(b);
      renderBlocks();
      syncHtmlFromBlocks();
    }

    function setTemplate(kind){
      if(kind === "grammar"){
        BLOCKS = [
          { ...newBlock("heading"), text: "🎯 Objetivo de la lección", level:"h2" },
          { ...newBlock("text"), text: "Después de esta lección podrás…\n• …\n• …\n• …" },
          { ...newBlock("heading"), text: "📚 Explicación (gramática)", level:"h2" },
          { ...newBlock("text"), text: "Explica la regla en 3–6 puntos.\nAñade ejemplos cortos." },
          { ...newBlock("example"), title:"Ejemplos", text:"1) …\n2) …\n3) …", accent:"blue" },
          { ...newBlock("tip"), title:"⚠️ Ojo", text:"Errores típicos / regla importante…", accent:"yellow" },
          { ...newBlock("heading"), text: "🧩 Mini práctica", level:"h2" },
          { ...newBlock("text"), text: "2–4 frases para traducir / completar (sin ejercicios interactivos aquí)." },
        ];
      } else if(kind === "vocab"){
        BLOCKS = [
          { ...newBlock("heading"), text: "🎯 Objetivo de la lección", level:"h2" },
          { ...newBlock("text"), text: "Hoy aprenderás vocabulario de…\nAl final podrás…" },
          { ...newBlock("image"), url: "", caption:"Imagen temática (opcional)", width:"full" },
          { ...newBlock("heading"), text: "🧠 Vocabulario clave", level:"h2" },
          { ...newBlock("text"), text: "• palabra — traducción\n• palabra — traducción\n• …" },
          { ...newBlock("heading"), text: "💬 Frases útiles", level:"h2" },
          { ...newBlock("example"), title:"Frases", text:"1) …\n2) …\n3) …", accent:"blue" },
          { ...newBlock("tip"), title:"Tip de pronunciación", text:"Escribe aquí una mini guía / truco…", accent:"yellow" },
        ];
      } else if(kind === "premium"){
        BLOCKS = [
          { ...newBlock("heading"), text: "💎 Lección Premium", level:"h2", color:"yellow" },
          { ...newBlock("text"), text: "✅ Formato premium: más ejemplos, mini tests y cajas de repaso." },
          { ...newBlock("heading"), text: "📌 Warm‑up", level:"h2" },
          { ...newBlock("text"), text: "2–3 preguntas rápidas para activar el tema…" },
          { ...newBlock("heading"), text: "📚 Contenido principal", level:"h2" },
          { ...newBlock("text"), text: "Explicación + estructura." },
          { ...newBlock("example"), title:"Ejemplos premium", text:"• …\n• …\n• …", accent:"blue" },
          { ...newBlock("tip"), title:"Errores típicos", text:"…", accent:"red" },
          { ...newBlock("divider") },
          { ...newBlock("heading"), text: "🔁 Repaso", level:"h2" },
          { ...newBlock("text"), text: "Mini‑resumen + 5 preguntas tipo test (texto)." },
        ];
      } else if(kind === "repaso"){
        BLOCKS = [
          { ...newBlock("heading"), text: "🔁 Repaso / Test", level:"h2", color:"yellow" },
          { ...newBlock("text"), text: "✅ Objetivo: comprobar lo que ya sabes (rápido y claro)." },
          { ...newBlock("heading"), text: "📌 Resumen en 5 puntos", level:"h2" },
          { ...newBlock("text"), text: "1) …\n2) …\n3) …\n4) …\n5) …" },
          { ...newBlock("heading"), text: "🧩 Mini test (elige / completa)", level:"h2" },
          { ...newBlock("example"), title:"Preguntas", text:"1) …\n2) …\n3) …\n4) …\n5) …", accent:"blue" },
          { ...newBlock("tip"), title:"💡 Tip", text:"Si fallas, vuelve a la sección X y repite el ejemplo…", accent:"yellow" },
        ];
      }
      if(htmlMode) htmlMode.value = "auto";
      renderBlocks();
      syncHtmlFromBlocks();
      showToast("Plantilla aplicada ✅", "toast-ok");
    }

    async function loadDoc(){
      if(!LEVEL || !TOPIC_ID){
        showToast("Faltan parámetros en la URL (level, id).", "toast-bad");
        return;
      }

      setMetaPills(false);

      const ref = doc(db, "course_meta", DOC_ID);
      const snap = await getDoc(ref);

      if(!snap.exists()){
        // empty
        titleInput.value = "";
        descInput.value = "";
        typeSelect.value = "";
        durationInput.value = "";
        publishedToggle.value = "false";
        htmlArea.value = "";
        BLOCKS = [];
        setMetaPills(false);
        renderPreview();
        renderBlocks();
        return;
      }

      const d = snap.data() || {};
      titleInput.value = d.title || "";
      descInput.value = d.desc || "";
      typeSelect.value = d.type || "";
      durationInput.value = (d.durationMin ?? "") === 0 ? "" : (d.durationMin ?? "");
      publishedToggle.value = d.published ? "true" : "false";
      htmlArea.value = d.html || "";

      // Blocks (preferred)
      if(Array.isArray(d.blocks) && d.blocks.length){
        BLOCKS = d.blocks;
        if(htmlMode) htmlMode.value = "auto";
      } else {
        BLOCKS = [];
        if(htmlMode) htmlMode.value = "manual";
      }

      setMetaPills(!!d.published);
      renderPreview();
      renderBlocks();
    }

    async function saveDoc(){
      const title = (titleInput.value || "").trim();
      const desc = (descInput.value || "").trim();
      const type = (typeSelect.value || "").trim();
      const durationMin = Number(durationInput.value || 0);
      const published = publishedToggle.value === "true";
      const mode = (htmlMode && htmlMode.value) ? htmlMode.value : "auto";
      // If blocks exist + auto mode, generate HTML from blocks
      const html = (mode === "auto" && BLOCKS.length)
        ? compileBlocksToHtml(BLOCKS)
        : (htmlArea.value || "").trim();

      const payload = {
        title, desc, type,
        durationMin: durationMin > 0 ? durationMin : 0,
        published,
        html,
        blocks: BLOCKS.length ? BLOCKS : [],
        updatedAt: serverTimestamp()
      };

      // Create createdAt only on first save (merge + if missing)
      const ref = doc(db, "course_meta", DOC_ID);
      const snap = await getDoc(ref);
      if(!snap.exists()){
        payload.createdAt = serverTimestamp();
      }

      await setDoc(ref, payload, { merge: true });
      setMetaPills(published);
      renderPreview();
      showToast("Guardado ✅", "toast-ok");
    }

    btnLoad.addEventListener("click", async ()=>{
      try{ await loadDoc(); showToast("Recargado", "toast-warn"); }catch(e){ console.error(e); showToast("Error al recargar.", "toast-bad"); }
    });

    const btnPublish = document.getElementById("btnPublish");
    btnPublish?.addEventListener("click", async ()=>{
      try{
        publishedToggle.value = "true";
        await saveDoc();
        showToast("Lección publicada 🚀", "toast-ok");
      }catch(e){
        console.error(e);
        showToast("Error al publicar.", "toast-bad");
      }
    });

btnSave.addEventListener("click", async ()=>{
      try{ await saveDoc(); }catch(e){ console.error(e); showToast("Error al guardar.", "toast-bad"); }
    });
    htmlArea.addEventListener("input", ()=>{ try{ renderPreview(); }catch(e){} });

    // Builder events
    btnAddHeading?.addEventListener("click", ()=> addBlock("heading"));
    btnAddText?.addEventListener("click", ()=> addBlock("text"));
    btnAddImage?.addEventListener("click", ()=> addBlock("image"));
    btnAddTip?.addEventListener("click", ()=> addBlock("tip"));
    btnAddExample?.addEventListener("click", ()=> addBlock("example"));
    btnAddDivider?.addEventListener("click", ()=> addBlock("divider"));

    btnTplGrammar?.addEventListener("click", ()=> setTemplate("grammar"));
    btnTplVocab?.addEventListener("click", ()=> setTemplate("vocab"));
    btnTplPremium?.addEventListener("click", ()=> setTemplate("premium"));
    btnTplRepaso?.addEventListener("click", ()=> setTemplate("repaso"));

    htmlMode?.addEventListener("change", ()=>{
      const mode = htmlMode.value;
      if(mode === "auto"){
        syncHtmlFromBlocks();
        showToast("HTML en modo AUTO", "toast-warn");
      } else {
        showToast("HTML en modo MANUAL", "toast-warn");
      }
    });

    btnWrapHtml?.addEventListener("click", ()=>{
      const h = (htmlArea.value || "").trim();
      if(!h){ showToast("No hay HTML para convertir.", "toast-warn"); return; }
      BLOCKS = [ newBlock("rawHtml") ];
      if(htmlMode) htmlMode.value = "auto";
      renderBlocks();
      syncHtmlFromBlocks();
      showToast("Convertido a bloque ✅", "toast-ok");
    });

    btnClearBlocks?.addEventListener("click", ()=>{
      BLOCKS = [];
      renderBlocks();
      if(htmlMode && htmlMode.value === "auto"){
        htmlArea.value = "";
        renderPreview();
      }
      showToast("Bloques limpiados", "toast-warn");
    });

    btnLogout.addEventListener("click", async ()=>{
      try{ await signOut(auth); }catch(e){}
      location.href = "login.html";
    });

    onAuthStateChanged(auth, async (user)=>{
      if(!user){
        location.href = "login.html";
        return;
      }
      if(!isAdmin(user.email)){
        adminOnly.style.display = "none";
        noAdmin.style.display = "block";
        return;
      }
      adminOnly.style.display = "block";
      noAdmin.style.display = "none";
      try{ await loadDoc(); }catch(e){ console.error(e); showToast("Error cargando doc.", "toast-bad"); }
    });
  </script>

  <!-- Right dock: add blocks + defaults -->
  <div class="addDock" id="addDock">
    <div class="addDockTitle">➕ Añadir bloque <span style="opacity:.75;">(siempre visible)</span></div>

    <div class="dockGrid">
      <button class="dockBtn" id="btnAddHeading" type="button">➕ Título</button>
      <button class="dockBtn" id="btnAddText" type="button">➕ Texto</button>
      <button class="dockBtn" id="btnAddImage" type="button">➕ Imagen</button>
      <button class="dockBtn" id="btnAddTip" type="button">➕ Tip</button>
      <button class="dockBtn" id="btnAddExample" type="button">➕ Ejemplo</button>
      <button class="dockBtn" id="btnAddDivider" type="button">➕ Separador</button>
    </div>

    <div class="dockDivider"></div>
    <div class="addDockTitle">🎨 Estilo por defecto</div>

    <label style="font-weight:900; font-size:12px; opacity:.9;">Color de texto</label>
    <select class="dockSelect" id="defaultTextColor">
      <option value="muted">Blanco / por defecto</option>
      <option value="yellow">Amarillo</option>
      <option value="blue">Azul</option>
      <option value="red">Rojo</option>
    </select>

    <label style="font-weight:900; font-size:12px; opacity:.9;">Tamaño de texto</label>
    <select class="dockSelect" id="defaultTextSize">
      <option value="xs">XS</option>
      <option value="sm">S</option>
      <option value="md" selected>M</option>
      <option value="lg">L</option>
      <option value="xl">XL</option>
    </select>

    <label style="font-weight:900; font-size:12px; opacity:.9;">Color del bloque</label>
    <select class="dockSelect" id="defaultBlockBg">
      <option value="none" selected>Sin fondo</option>
      <option value="white">Blanco</option>
      <option value="yellow">Amarillo</option>
      <option value="blue">Azul</option>
      <option value="red">Rojo</option>
    </select>

    <div style="font-size:12px; opacity:.8; line-height:1.35;">
      Estos valores se aplican automáticamente a los nuevos bloques (Texto/Título/Imagen).
    </div>
  </div>

  <script src="assets/js/layout.js">
