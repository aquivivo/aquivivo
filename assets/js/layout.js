/* AquiVivo unified header */
(function(){
  const LOGO_SRC = "assets/img/logo.png";

  function pageName(){
    const p = (location.pathname || "").split("/").pop() || "";
    return p.toLowerCase();
  }

  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") n.className = v;
      else if(k==="html") n.innerHTML = v;
      else if(k==="text") n.textContent = v;
      else if(k.startsWith("on") && typeof v==="function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c=> n.appendChild(c));
    return n;
  }

  function makeBtn({label, icon, variant, href, onClick}){
    const a = el("a", { class: `av-btn ${variant||""}`.trim(), href: href || "#", role:"button" });
    a.appendChild(el("span",{text: icon || ""}));
    a.appendChild(el("span",{text: label}));
    if(onClick){
      a.addEventListener("click", (e)=>{ e.preventDefault(); onClick(); });
      a.setAttribute("href","#");
    }
    return a;
  }

  function signOut(){
    try{
      if(window.firebase && firebase.auth){
        return firebase.auth().signOut();
      }
      if(window.auth && auth.signOut){
        return auth.signOut();
      }
    }catch(e){}
    return Promise.resolve();
  }

  function go(url){ location.href = url; }

  function buildHeader(){
    const header = el("div", { class:"av-header" });

    const inner = el("div", { class:"av-header-inner" });

    const brand = el("a", { class:"av-brand", href:"espanel.html", title:"AquiVivo" });
    const img = el("img", { class:"av-brandLogo", src: LOGO_SRC, alt:"AquiVivo" });
    brand.appendChild(img);

    const nav = el("div", { class:"av-nav" });

    const p = pageName();

    const common = {
      inicio: {label:"Inicio", icon:"🏠", variant:"", href:"espanel.html"},
      atras: {label:"Atrás", icon:"⬅️", variant:"", onClick: ()=> history.back()},
      logout:{label:"Cerrar sesión", icon:"", variant:"red", onClick: ()=> signOut().finally(()=> go("login.html"))}
    };

    let buttons = [];
    if(p==="lessonpage.html"){
      buttons = [
        {label:"Panel", icon:"🧩", href:"espanel.html"},
        {label:"Ejercicios", icon:"🧩", href:"ejercicio.html"+location.search},
        common.inicio, common.atras, common.logout
      ];
    } else if(p==="ejercicio.html"){
      buttons = [
        {label:"Panel", icon:"🧩", href:"espanel.html"},
        {label:"Lección", icon:"📖", href:"lessonpage.html"+location.search},
        common.inicio, common.atras, common.logout
      ];
    } else if(p==="lessonadmin.html" || p==="ejercicioadmin.html" || p==="esadmin.html"){
      // Keep admin pages simple (avoid duplicates with page controls)
      buttons = [common.inicio, common.atras, common.logout];
    } else if(p==="course.html"){
      buttons = [common.atras, common.inicio, common.logout];
    } else if(p==="espanel.html"){
      buttons = [common.inicio, common.atras, common.logout];
    } else {
      buttons = [common.inicio, common.atras, common.logout];
    }

    buttons.forEach(b=>{
      nav.appendChild(makeBtn(b));
    });

    inner.appendChild(brand);
    inner.appendChild(nav);

    header.appendChild(inner);
    header.appendChild(el("div",{class:"av-stripe"}));
    return header;
  }

  function mount(){
    // ensure placeholder exists
    let host = document.getElementById("appHeader");
    if(!host){
      const b = document.body;
      host = document.createElement("div");
      host.id = "appHeader";
      b.insertBefore(host, b.firstChild);
    }
    // clear old injected header
    host.innerHTML = "";
    host.appendChild(buildHeader());
  }

  document.addEventListener("DOMContentLoaded", mount);
})();
