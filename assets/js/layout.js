
function removeLegacyHeaders(){
  const selectors = [
    '.topActionBar',
    'header.siteHeader',
    'header',
    '.nav-glass',
    '.headerBar',
    '.navbar',
    '#topbar',
    '#header',
    '[data-legacy-header]'
  ];
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      // Do not remove the injected header itself
      if (el && !el.hasAttribute('data-av-header')) el.remove();
    });
  });
}


(function(){
  const path = (location.pathname.split('/').pop() || '').toLowerCase();

  function el(tag, attrs={}, children=[]){
    const n=document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    children.forEach(c=>{
      if (c == null) return;
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    });
    return n;
  }

  function goBack(){
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'index.html';
  }
  window.goBack = window.goBack || goBack;

  function safeLogout(){
    try{
      if (typeof window.logout === 'function') return window.logout();
    }catch(e){}
    window.location.href = 'eslogin.html';
  }

  function getQS(name){
    const u=new URL(location.href);
    return u.searchParams.get(name);
  }

  function buildHeader(){
    const header = el('header', {class:'nav-glass av-layout'});
    const inner = el('div', {class:'container nav-inner'});
    const brand = el('div', {class:'brand'}, [
      el('div', {class:'brandLogoWrap'}, [
        el('img', {src:'assets/img/logo.png', class:'brandLogo', alt:'AquiVivo'})
      ])
    ]);

    const actions = el('div', {class:'nav-actions'});
    // Lesson-specific (Option B)
    const isLesson = (path === 'lesson.html' || path === 'lessonpage.html');
    if (isLesson){
      const level = getQS('level') || 'A1';
      // Prefer returning to course filtered by level
      actions.appendChild(el('a', {class:'btn-white-outline', href:`course.html?level=${encodeURIComponent(level)}`}, ['⬅️ Volver al curso']));
      actions.appendChild(el('a', {class:'btn-white-outline', href:`course.html?level=${encodeURIComponent(level)}`}, ['📚 Niveles']));
    }

    actions.appendChild(el('a', {class:'btn-white-outline', href:'index.html'}, ['Inicio']));
    actions.appendChild(el('button', {class:'btn-white-outline', type:'button', onclick:goBack}, ['Atrás']));

    // Helpful utilities only on lesson
    if (isLesson){
      actions.appendChild(el('button', {class:'btn-yellow', type:'button', onclick: async ()=> {
        try{
          await navigator.clipboard.writeText(location.href);
          toast('✅ Enlace copiado');
        }catch(e){
          toast('⚠️ No se pudo copiar');
        }
      }}, ['🔗 Copiar enlace']));
      actions.appendChild(el('button', {class:'btn-white-outline', type:'button', onclick: ()=>location.reload()}, ['🔄 Recargar']));
    }

    // Show logout on pages that usually need auth (panel/admin/lesson/course)
    const showLogout = ['espanel.html','esadmin.html','lesson.html','lessonpage.html','course.html'].includes(path);
    if (showLogout){
      actions.appendChild(el('button', {class:'btn-red', type:'button', onclick:safeLogout}, ['Cerrar sesión']));
    }

    inner.appendChild(brand);
    inner.appendChild(actions);
    header.appendChild(inner);

    return header;
  }

  function buildFooter(){
    const foot = el('footer', {class:'av-footer'});
    const inner = el('div', {class:'container av-footer__inner'});
    inner.appendChild(el('div', {class:'av-footer__left'}, [`© ${new Date().getFullYear()} AquiVivo`]));
    const right = el('div', {class:'av-footer__right'});
    right.appendChild(el('a', {href:'index.html'}, ['Inicio']));
    right.appendChild(el('button', {type:'button', class:'av-linklike', onclick:goBack}, ['Atrás']));
    inner.appendChild(right);
    foot.appendChild(inner);
    return foot;
  }

  function injectStyles(){
    if (document.getElementById('avLayoutStyle')) return;
    const css = `
      .av-footer{margin-top:24px;padding:18px 0;border-top:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.08)}
      .av-footer__inner{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .av-footer a,.av-linklike{color:rgba(255,255,255,.92);text-decoration:none;font-weight:800;font-size:14px}
      .av-footer a:hover,.av-linklike:hover{text-decoration:underline}
      .av-linklike{background:none;border:none;padding:0;cursor:pointer}
      .av-layout .nav-actions{gap:10px;flex-wrap:wrap}
      .brand{display:flex;align-items:center;gap:12px;min-width:180px}
      .brandLogo{width:56px;height:56px;object-fit:contain;display:block;filter:drop-shadow(0 10px 20px rgba(0,0,0,.25))}
      .btn-yellow{background:#f7d34a;color:#0b1a44;border:none;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
      .btn-yellow:hover{filter:brightness(0.98)}
      .av-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;background:rgba(10,15,30,.9);color:#fff;
        padding:10px 14px;border-radius:14px;font-weight:800;z-index:99999;border:1px solid rgba(255,255,255,.12)}
    `;
    const style=document.createElement('style');
    style.id='avLayoutStyle';
    style.textContent=css;
    document.head.appendChild(style);
  }

  function toast(msg){
    const t=document.createElement('div');
    t.className='av-toast';
    t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .25s'; }, 1400);
    setTimeout(()=>t.remove(), 1800);
  }
  window.toast = window.toast || toast;

  function init(){
    injectStyles();
    const h=document.getElementById('appHeader');
    const f=document.getElementById('appFooter');
    if (h) { h.innerHTML=''; h.appendChild(buildHeader()); }
    if (f) { f.innerHTML=''; f.appendChild(buildFooter()); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
