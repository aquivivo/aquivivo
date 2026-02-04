import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
    import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { auth, db } from "../firebase-init.js";
    const $ = (id) => document.getElementById(id);

async function isAdminUid(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : null;
    return !!data?.admin;
  } catch (e) {
    console.error("lessonadmin: cannot read users doc", e);
    return false;
  }
}

    const toast = $("toast");
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
    const extraSummary = $("extraSummary");
    const extraVocab = $("extraVocab");
    const extraResources = $("extraResources");
    const extraHomework = $("extraHomework");
    const outlineArea = $("outlineArea");
    const btnOutlineReplace = $("btnOutlineReplace");
    const btnOutlineAppend = $("btnOutlineAppend");
    const outlineStatus = $("outlineStatus");

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
      pillLevel.textContent = `Poziom: ${LEVEL || ""}`;
      pillTopic.textContent = `Temat: ${TOPIC_ID || ""}`;
      pillDoc.textContent = `Doc: ${DOC_ID || ""}`;
      pillPub.className = "pill " + (published ? "pill-green" : "pill-red");
      pillPub.textContent = published ? "Opublikowano" : "Wersja robocza";
    }

    function renderPreview(){
      const t = (titleInput.value || "").trim();
      const d = (descInput.value || "").trim();
      const h = (htmlArea.value || "").trim();

      previewTitle.textContent = t || "";
      previewDesc.textContent = d || "";
      previewBody.innerHTML = h || "<div style='opacity:.8'>Brak tresci.</div>";
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

    function parseLines(raw){
      return String(raw || "")
        .split(/\r?\n/)
        .map((x)=>x.trim())
        .filter(Boolean);
    }

    function parseResources(raw){
      const lines = parseLines(raw);
      const out = [];
      lines.forEach((line)=>{
        const parts = line.split("|").map((x)=>x.trim()).filter(Boolean);
        if(parts.length >= 2){
          out.push({ label: parts[0], url: parts.slice(1).join("|") });
        }
      });
      return out;
    }

    function applyDefaultsToBlock(b){
      try{
        const dc = defaultTextColor?.value || null;
        const ds = defaultTextSize?.value || null;
        const dbg = defaultBlockBg?.value || null;
        if(dc && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.color = dc;
        if(ds && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.size = ds;
        if(dbg && (b.kind === "text" || b.kind === "heading" || b.kind === "image")) b.bg = dbg;
      }catch(e){}
      return b;
    }

    function parseOutlineToBlocks(raw){
      const lines = String(raw || "").split(/\r?\n/);
      const blocks = [];
      let buffer = [];

      const flushText = () => {
        if(!buffer.length) return;
        const text = buffer.join("\n").trim();
        if(text){
          blocks.push(applyDefaultsToBlock({ ...newBlock("text"), text }));
        }
        buffer = [];
      };

      const setMeta = (line) => {
        const t = line.replace(/^title:\s*/i,"").trim();
        if(t) titleInput.value = t;
      };

      const setDesc = (line) => {
        const d = line.replace(/^(desc|description):\s*/i,"").trim();
        if(d) descInput.value = d;
      };

      const setTime = (line) => {
        const v = line.replace(/^(time|duration):\s*/i,"").trim();
        const n = Number(String(v).replace(/[^\d]/g,""));
        if(!Number.isNaN(n)) durationInput.value = n ? String(n) : "";
      };

      for(const rawLine of lines){
        const line = String(rawLine || "");
        const trimmed = line.trim();

        if(!trimmed){
          flushText();
          continue;
        }
        if(/^title:\s*/i.test(trimmed)){ flushText(); setMeta(trimmed); continue; }
        if(/^(desc|description):\s*/i.test(trimmed)){ flushText(); setDesc(trimmed); continue; }
        if(/^(time|duration):\s*/i.test(trimmed)){ flushText(); setTime(trimmed); continue; }

        if(/^---+$/.test(trimmed)){
          flushText();
          blocks.push(newBlock("divider"));
          continue;
        }

        if(/^###\s+/.test(trimmed) || /^h3:\s*/i.test(trimmed)){
          flushText();
          const text = trimmed.replace(/^###\s+|^h3:\s*/i,"").trim();
          blocks.push(applyDefaultsToBlock({ ...newBlock("heading"), level:"h3", text: text || "Podsekcja" }));
          continue;
        }
        if(/^##\s+/.test(trimmed) || /^h2:\s*/i.test(trimmed)){
          flushText();
          const text = trimmed.replace(/^##\s+|^h2:\s*/i,"").trim();
          blocks.push(applyDefaultsToBlock({ ...newBlock("heading"), level:"h2", text: text || "Sekcja" }));
          continue;
        }

        if(/^tip:\s*/i.test(trimmed)){
          flushText();
          const body = trimmed.replace(/^tip:\s*/i,"").trim();
          const parts = body.split("|").map((x)=>x.trim()).filter(Boolean);
          const title = parts.length > 1 ? parts[0] : "Wskazowka";
          const text = parts.length > 1 ? parts.slice(1).join(" | ") : parts[0] || "";
          blocks.push(applyDefaultsToBlock({ ...newBlock("tip"), title, text }));
          continue;
        }

        if(/^ex:\s*/i.test(trimmed)){
          flushText();
          const body = trimmed.replace(/^ex:\s*/i,"").trim();
          const parts = body.split("|").map((x)=>x.trim()).filter(Boolean);
          const title = parts.length > 1 ? parts[0] : "Przyklad";
          const text = parts.length > 1 ? parts.slice(1).join(" | ") : parts[0] || "";
          blocks.push(applyDefaultsToBlock({ ...newBlock("example"), title, text }));
          continue;
        }

        if(/^img:\s*/i.test(trimmed)){
          flushText();
          const body = trimmed.replace(/^img:\s*/i,"").trim();
          const parts = body.split("|").map((x)=>x.trim()).filter(Boolean);
          const url = parts[0] || "";
          const caption = parts[1] || "";
          blocks.push(applyDefaultsToBlock({ ...newBlock("image"), url, caption }));
          continue;
        }

        buffer.push(line);
      }

      flushText();
      return blocks;
    }

    function resourcesToText(list){
      if(!Array.isArray(list)) return "";
      return list.map((r)=>`${r.label || ""} | ${r.url || ""}`.trim()).join("\n");
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
      if(kind === "heading") return { ...base, text: "Nowy tytul", level: "h2", color: "yellow" };
      if(kind === "text") return { ...base, text: "Wpisz tutaj tekst..." };
      if(kind === "image") return { ...base, url: "", caption: "", width: "full" };
      if(kind === "tip") return { ...base, title: "Wskazowka", text: "Wazna wskazowka...", accent: "yellow" };
      if(kind === "example") return { ...base, title: "Przyklad", text: "", accent: "blue" };
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
          const title = escapeHtml(b.title || (b.kind === "tip" ? "Wskazowka" : "Przyklad"));
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
        // Podglad zawsze renderuje sie z htmlArea (auto lub manual)
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
          heading: "Tytul",
          text: "Tekst",
          image: "Obraz",
          tip: "Wskazowka",
          example: "Przyklad",
          divider: "Separator",
          rawHtml: "HTML"
        })[b.kind] || b.kind;

        card.innerHTML = `
          <div class="blockHead">
            <div class="blockTitle"> ${escapeHtml(kindLabel)}</div>
            <div class="blockTools">
              <button class="toolBtn" data-act="up" title="W gore"></button>
              <button class="toolBtn" data-act="down" title="W dol"></button>
              <button class="toolBtn danger" data-act="del" title="Usun"></button>
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
              <label>Kolor</label>
              <select class="select" data-k="color">
                <option value="muted">Bialy</option>
                <option value="yellow">Zolty</option>
                <option value="blue">Niebieski</option>
                <option value="red">Czerwony</option>
              </select>
            </div>
            <div class="field">
              <label>Rozmiar</label>
              <select class="select" data-k="size">
                <option value="xs">XS</option>
                <option value="sm">S</option>
                <option value="md">M</option>
                <option value="lg">L</option>
                <option value="xl">XL</option>
              </select>
            </div>
            <div class="field">
              <label>Wyrownanie</label>
              <select class="select" data-k="align">
                <option value="left">Lewa</option>
                <option value="center">Srodek</option>
                <option value="right">Prawa</option>
              </select>
            </div>
            <div class="field">
              <label>Tlo bloku</label>
              <select class="select" data-k="bg">
                <option value="none">Bez tla</option>
                <option value="white">Bialy</option>
                <option value="yellow">Zolty</option>
                <option value="blue">Niebieski</option>
                <option value="red">Czerwony</option>
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
              <label>Tekst tytulu</label>
              <input class="input" data-k="text" />
            </div>
            <div class="field">
              <label>Poziom</label>
              <select class="select" data-k="level">
                <option value="h2">H2 (sekcja)</option>
                <option value="h3">H3 (podsekcja)</option>
              </select>
            </div>
          `;
        } else if(b.kind === "text"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>Tekst</label>
              <textarea data-k="text" style="min-height:150px"></textarea>
            </div>
          `;
        } else if(b.kind === "image"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>URL obrazu</label>
              <input class="input" data-k="url" placeholder="https://..." />
              <div class="mutedTiny">Wskazowka: na razie uzywamy URL. Pozniej mozemy dodac upload do Firebase Storage.</div>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Podpis (opcjonalny)</label>
              <input class="input" data-k="caption" placeholder="Tekst pod obrazem" />
            </div>
            <div class="field">
              <label>Szerokosc</label>
              <select class="select" data-k="width">
                <option value="full">Pelna</option>
                <option value="narrow">Wezsze</option>
              </select>
            </div>
          `;
        } else if(b.kind === "tip" || b.kind === "example"){
          wrap.innerHTML = `
            <div class="field">
              <label>Tytul bloku</label>
              <input class="input" data-k="title" />
            </div>
            <div class="field">
              <label>Kolor akcentu</label>
              <select class="select" data-k="accent">
                <option value="yellow">Zolty</option>
                <option value="blue">Niebieski</option>
                <option value="red">Czerwony</option>
              </select>
            </div>
            <div class="field" style="grid-column:1/-1">
              <label>Tresc</label>
              <textarea data-k="text" style="min-height:150px"></textarea>
            </div>
          `;
        } else if(b.kind === "rawHtml"){
          wrap.innerHTML = `
            <div class="field" style="grid-column:1/-1">
              <label>HTML (bez zmian)</label>
              <textarea data-k="html" style="min-height:220px"></textarea>
              <div class="mutedTiny">Ten blok wstawia HTML bez zmian. Uzyj tylko gdy potrzebujesz.</div>
            </div>
          `;
        } else if(b.kind === "divider"){
          wrap.innerHTML = `
            <div class="mutedTiny">Separator wizualny (linia).</div>
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
          { ...newBlock("heading"), text: " Cel lekcji", level:"h2" },
          { ...newBlock("text"), text: "Po tej lekcji bedziesz mogl...\n- ...\n- ...\n- ..." },
          { ...newBlock("heading"), text: " Wyjasnienie (gramatyka)", level:"h2" },
          { ...newBlock("text"), text: "Wyjasnij zasade w 3-6 punktach.\nDodaj krotkie przyklady." },
          { ...newBlock("example"), title:"Przyklady", text:"1) ...\n2) ...\n3) ...", accent:"blue" },
          { ...newBlock("tip"), title:" Uwaga", text:"Typowe bledy / wazna zasada...", accent:"yellow" },
          { ...newBlock("heading"), text: " Mini praktyka", level:"h2" },
          { ...newBlock("text"), text: "2-4 zdania do tlumaczenia / uzupelnienia (bez interaktywnych cwiczen tutaj)." },
        ];
      } else if(kind === "vocab"){
        BLOCKS = [
          { ...newBlock("heading"), text: " Cel lekcji", level:"h2" },
          { ...newBlock("text"), text: "Dzis nauczysz sie slownictwa z...\nNa koncu bedziesz mogl..." },
          { ...newBlock("image"), url: "", caption:"Obraz tematyczny (opcjonalnie)", width:"full" },
          { ...newBlock("heading"), text: " Slownictwo kluczowe", level:"h2" },
          { ...newBlock("text"), text: "- slowo - tlumaczenie\n- slowo - tlumaczenie\n- ..." },
          { ...newBlock("heading"), text: " Przydatne zwroty", level:"h2" },
          { ...newBlock("example"), title:"Zwroty", text:"1) ...\n2) ...\n3) ...", accent:"blue" },
          { ...newBlock("tip"), title:"Wskazowka wymowy", text:"Wpisz tutaj mini poradnik / trik...", accent:"yellow" },
        ];
      } else if(kind === "premium"){
        BLOCKS = [
          { ...newBlock("heading"), text: " Lekcja Premium", level:"h2", color:"yellow" },
          { ...newBlock("text"), text: " Format premium: wiecej przykladow, mini testy i bloki powtorki." },
          { ...newBlock("heading"), text: " Warm-up", level:"h2" },
          { ...newBlock("text"), text: "2-3 szybkie pytania na rozgrzewke tematu..." },
          { ...newBlock("heading"), text: " Tresc glowna", level:"h2" },
          { ...newBlock("text"), text: "Wyjasnienie + struktura." },
          { ...newBlock("example"), title:"Przyklady premium", text:"- ...\n- ...\n- ...", accent:"blue" },
          { ...newBlock("tip"), title:"Typowe bledy", text:"...", accent:"red" },
          { ...newBlock("divider") },
          { ...newBlock("heading"), text: " Powtorka", level:"h2" },
          { ...newBlock("text"), text: "Mini-podsumowanie + 5 pytan testowych (tekst)." },
        ];
      } else if(kind === "repaso"){
        BLOCKS = [
          { ...newBlock("heading"), text: " Powtorka / Test", level:"h2", color:"yellow" },
          { ...newBlock("text"), text: " Cel: sprawdzic to, co juz wiesz (szybko i jasno)." },
          { ...newBlock("heading"), text: " Podsumowanie w 5 punktach", level:"h2" },
          { ...newBlock("text"), text: "1) ...\n2) ...\n3) ...\n4) ...\n5) ..." },
          { ...newBlock("heading"), text: " Mini test (wybierz / uzupelnij)", level:"h2" },
          { ...newBlock("example"), title:"Pytania", text:"1) ...\n2) ...\n3) ...\n4) ...\n5) ...", accent:"blue" },
          { ...newBlock("tip"), title:" Wskazowka", text:"Jesli sie pomylisz, wroc do sekcji X i powtorz przyklad...", accent:"yellow" },
        ];
      }
      if(htmlMode) htmlMode.value = "auto";
      renderBlocks();
      syncHtmlFromBlocks();
      showToast("Szablon zastosowany ", "toast-ok");
    }

    async function loadDoc(){
      if(!LEVEL || !TOPIC_ID){
        showToast("Brakuje parametrow w URL (level, id).", "toast-bad");
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
      if(extraSummary) extraSummary.value = d.summary || "";
      if(extraVocab) extraVocab.value = Array.isArray(d.vocab) ? d.vocab.join("\n") : (d.vocabText || "");
      if(extraResources) extraResources.value = resourcesToText(d.resources);
      if(extraHomework) extraHomework.value = d.homework || "";

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
      const summary = extraSummary ? (extraSummary.value || "").trim() : "";
      const vocab = extraVocab ? parseLines(extraVocab.value) : [];
      const resources = extraResources ? parseResources(extraResources.value) : [];
      const homework = extraHomework ? (extraHomework.value || "").trim() : "";

      const payload = {
        title, desc, type,
        durationMin: durationMin > 0 ? durationMin : 0,
        published,
        html,
        blocks: BLOCKS.length ? BLOCKS : [],
        summary,
        vocab,
        resources,
        homework,
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
      showToast("Zapisano", "toast-ok");
    }

    btnLoad.addEventListener("click", async ()=>{
      try{ await loadDoc(); showToast("Odswiezono", "toast-warn"); }catch(e){ console.error(e); showToast("Blad przy odswiezaniu.", "toast-bad"); }
    });

    const btnPublish = document.getElementById("btnPublish");
    btnPublish?.addEventListener("click", async ()=>{
      try{
        publishedToggle.value = "true";
        await saveDoc();
        showToast("Lekcja opublikowana ", "toast-ok");
      }catch(e){
        console.error(e);
        showToast("Blad publikacji.", "toast-bad");
      }
    });

btnSave.addEventListener("click", async ()=>{
      try{ await saveDoc(); }catch(e){ console.error(e); showToast("Blad zapisu.", "toast-bad"); }
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

    const applyOutline = (mode="replace") => {
      const raw = (outlineArea?.value || "").trim();
      if(!raw){
        if(outlineStatus) outlineStatus.textContent = "Brak tresci do importu.";
        showToast("Brak tresci do importu.", "toast-warn");
        return;
      }
      const blocks = parseOutlineToBlocks(raw);
      if(!blocks.length){
        if(outlineStatus) outlineStatus.textContent = "Nie wykryto blokow.";
        showToast("Nie wykryto blokow.", "toast-warn");
        return;
      }
      if(mode === "append"){
        BLOCKS = [...BLOCKS, ...blocks];
      }else{
        BLOCKS = blocks;
      }
      if(htmlMode) htmlMode.value = "auto";
      renderBlocks();
      syncHtmlFromBlocks();
      if(outlineStatus) outlineStatus.textContent = `Dodano blokow: ${blocks.length}`;
      showToast("Import outline zakonczony", "toast-ok");
    };

    btnOutlineReplace?.addEventListener("click", ()=> applyOutline("replace"));
    btnOutlineAppend?.addEventListener("click", ()=> applyOutline("append"));

    htmlMode?.addEventListener("change", ()=>{
      const mode = htmlMode.value;
      if(mode === "auto"){
        syncHtmlFromBlocks();
        showToast("HTML w trybie AUTO", "toast-warn");
      } else {
        showToast("HTML w trybie MANUAL", "toast-warn");
      }
    });

    btnWrapHtml?.addEventListener("click", ()=>{
      const h = (htmlArea.value || "").trim();
      if(!h){ showToast("Brak HTML do konwersji.", "toast-warn"); return; }
      BLOCKS = [ newBlock("rawHtml") ];
      if(htmlMode) htmlMode.value = "auto";
      renderBlocks();
      syncHtmlFromBlocks();
      showToast("Zmieniono na blok", "toast-ok");
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
    onAuthStateChanged(auth, async (user)=>{
      if(!user){
        location.href = "login.html";
        return;
      }
      if(!(await isAdminUid(user.uid))){
        adminOnly.style.display = "none";
        noAdmin.style.display = "block";
        return;
      }
      adminOnly.style.display = "block";
      noAdmin.style.display = "none";
      try{ await loadDoc(); }catch(e){ console.error(e); showToast("Blad ladowania dokumentu.", "toast-bad"); }
    });





