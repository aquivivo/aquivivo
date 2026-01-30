/* AquiVivo Layout — unified header/footer (FINAL)
   - Uses logo: assets/img/logo.png
   - Normalizes header width + colored stripe
   - Avoids duplicate legacy headers
*/
(function(){
  const LOGO_SRC = "assets/img/logo.png";

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function getPageName(){
    try{
      const p = location.pathname.split("/").pop() || "";
      return p.toLowerCase();
    }catch(e){ return ""; }
  }

  function getParams(){
    const sp = new URLSearchParams(location.search || "");
    return {
      level: sp.get("level") || "",
      id: sp.get("id") || "",
      topic: sp.get("topic") || ""
    };
  }

  function withParams(url, params){
    const u = new URL(url, location.origin);
    if(params.level) u.searchParams.set("level", params.level);
    if(params.id) u.searchParams.set("id", params.id);
    if(params.topic) u.searchParams.set("topic", params.topic);
    return u.pathname + (u.search ? u.search : "");
  }

  function removeLegacyHeaders(){
    // Remove known old headers/toolbars to prevent duplicates.
    const legacySelectors = [
      "div.topActionBar",
      "header.siteHeader",
      "header.headerBar",
      "header.nav-glass:not([data-av-header])",
      "nav.nav-glass:not([data-av-header])",
      "#topbar",
      "#header",
      "div.navbar"
    ];
    legacySelectors.forEach(sel => {
      qsa(sel).forEach(el => {
        // never remove our injected header
        if(el && el.getAttribute && el.getAttribute("data-av-header")==="1") return;
        el.remove();
      });
    });
  }

  function buildButtons(){
    const page = getPageName();
    const p = getParams();

    const btn = (label, options={}) => ({
      label,
      href: options.href || null,
      onClick: options.onClick || null,
      variant: options.variant || "blue",
      icon: options.icon || ""
    });

    // Common
    const goHome = () => { location.href = "espanel.html"; };
    const goBack = () => { history.back(); };
    const doReload = () => { location.reload(); };
    const copyLink = async () => {
      try{
        await navigator.clipboard.writeText(location.href);
        toast("Enlace copiado ✅");
      }catch(e){
        // fallback
        const ta = document.createElement("textarea");
        ta.value = location.href; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); ta.remove();
        toast("Enlace copiado ✅");
      }
    };

    // Decide per page
    if(page.includes("lessonpage")){
      return [
        btn("Panel", { href: "espanel.html", icon:"🧩" }),
        btn("Ejercicios", { href: withParams("ejercicio.html", p), icon:"🧩" , variant:"yellow"}),
        btn("Inicio", { href: "espanel.html", icon:"🏠" }),
        btn("Atrás", { onClick: goBack, icon:"⬅️" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    if(page.includes("ejercicio.html")){
      return [
        btn("Panel", { href: "espanel.html", icon:"🧩" }),
        btn("Lección", { href: withParams("lessonpage.html", p), icon:"📖", variant:"yellow" }),
        btn("Inicio", { href: "espanel.html", icon:"🏠" }),
        btn("Atrás", { onClick: goBack, icon:"⬅️" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    if(page.includes("ejercicioadmin")){
      return [
        btn("Volver al curso", { href: withParams("course.html", p), icon:"⬅️" }),
        btn("Niveles", { href: "espanel.html", icon:"📚" }),
        btn("Copiar enlace", { onClick: copyLink, icon:"🔗", variant:"yellow" }),
        btn("Vista alumno", { href: withParams("ejercicio.html", p), icon:"👀" }),
        btn("Admin lección", { href: withParams("lessonadmin.html", p), icon:"🛠️" }),
        btn("Recargar", { onClick: doReload, icon:"🔄" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    if(page.includes("lessonadmin")){
      return [
        btn("Curso", { href: withParams("course.html", p), icon:"⬅️" }),
        btn("Vista alumno", { href: withParams("lessonpage.html", p), icon:"👀" }),
        btn("Ejercicios", { href: withParams("ejercicioadmin.html", p), icon:"🧩" }),
        btn("Inicio", { href: "espanel.html", icon:"🏠" }),
        btn("Atrás", { onClick: goBack, icon:"⬅️" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    if(page.includes("course")){
      return [
        btn("Atrás", { onClick: goBack, icon:"⬅️" }),
        btn("Inicio", { href: "espanel.html", icon:"🏠" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    if(page.includes("espanel") || page.includes("esadmin") || page.includes("ebooks")){
      return [
        btn("Inicio", { href: "espanel.html", icon:"🏠" }),
        btn("Atrás", { onClick: goBack, icon:"⬅️" }),
        btn("Cerrar sesión", { href: "login.html", variant:"red" })
      ];
    }

    // login or any other page: logo only
    return [];
  }

  function toast(msg){
    let t = qs("#avToast");
    if(!t){
      t = document.createElement("div");
      t.id = "avToast";
      t.style.position="fixed";
      t.style.right="14px";
      t.style.bottom="14px";
      t.style.zIndex="99999";
      t.style.padding="10px 12px";
      t.style.borderRadius="14px";
      t.style.background="rgba(15, 26, 51, .95)";
      t.style.color="rgba(255,255,255,.92)";
      t.style.border="1px solid rgba(255,255,255,.18)";
      t.style.boxShadow="0 10px 30px rgba(0,0,0,.35)";
      t.style.fontSize="14px";
      t.style.opacity="0";
      t.style.transform="translateY(8px)";
      t.style.transition="opacity .18s ease, transform .18s ease";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity="1";
    t.style.transform="translateY(0)";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(()=>{
      t.style.opacity="0";
      t.style.transform="translateY(8px)";
    }, 1800);
  }

  function makeBtnEl(b){
    const a = document.createElement("a");
    a.className = "btn";
    if(b.variant==="yellow") a.classList.add("btn-yellow");
    if(b.variant==="red") a.classList.add("btn-red");
    if(b.variant==="blue") a.classList.add("btn-blue");
    a.href = b.href || "#";
    a.innerHTML = (b.icon ? `<span class="btnIcon">${b.icon}</span>` : "") + `<span class="btnText">${escapeHtml(b.label)}</span>`;
    if(b.onClick){
      a.addEventListener("click", (e)=>{ e.preventDefault(); b.onClick(); });
    }
    return a;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderHeader(){
    const host = qs("#appHeader") || document.body;
    const header = document.createElement("header");
    header.className = "nav-glass av-layout";
    header.setAttribute("data-av-header","1");

    const inner = document.createElement("div");
    inner.className = "navInner";

    const brand = document.createElement("div");
    brand.className = "brand";
    const wrap = document.createElement("div");
    wrap.className = "brandLogoWrap";
    const img = document.createElement("img");
    img.className = "brandLogo";
    img.alt = "AquiVivo";
    img.src = LOGO_SRC;
    wrap.appendChild(img);
    brand.appendChild(wrap);

    const nav = document.createElement("nav");
    nav.className = "navButtons";
    const buttons = buildButtons();
    buttons.forEach(b => nav.appendChild(makeBtnEl(b)));

    inner.appendChild(brand);
    inner.appendChild(nav);

    header.appendChild(inner);

    // stripe
    const stripe = document.createElement("div");
    stripe.className = "navStripe";
    header.appendChild(stripe);

    if(host === document.body){
      document.body.insertBefore(header, document.body.firstChild);
    }else{
      host.innerHTML = "";
      host.appendChild(header);
    }
  }

  function normalizePageScale(){
    // Makes the whole UI slightly smaller (requested), without affecting header height.
    document.documentElement.style.setProperty("--ui-scale", "0.94");
  }

  function init(){
    removeLegacyHeaders();
    normalizePageScale();
    renderHeader();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();