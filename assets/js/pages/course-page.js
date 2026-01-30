import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
    import {
import { auth, db } from "../firebase-init.js";
      collection, query, where, getDocs, addDoc, deleteDoc, updateDoc,
      doc, getDoc, setDoc, limit
    } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
    const ADMIN_EMAIL = 'aquivivo.pl@gmail.com';
    let isAdmin = false;

    const params = new URLSearchParams(window.location.search);
    const LEVEL = (params.get('level') || 'A1').toUpperCase();

    const levelTitle = document.getElementById('levelTitle');
    const levelSubtitle = document.getElementById('levelSubtitle');
    const grammarList = document.getElementById('grammarList');
    const vocabList = document.getElementById('vocabList');
    const adminPanel = document.getElementById('adminPanel');
    const adminBar = document.getElementById('adminBar');

    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const taskFilter = document.getElementById('taskFilter');

    let allTopics = [];

    // --- local progress keys
    const LS_VISITED_KEY = `aquivivo_visited_${LEVEL}`;
    const LS_LAST_KEY = `aquivivo_lastLesson_${LEVEL}`;

    function toast(msg){
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(()=> el.classList.remove('show'), 2200);
    }

    function getVisitedSet(){
      try{
        const arr = JSON.parse(localStorage.getItem(LS_VISITED_KEY) || '[]');
        return new Set(Array.isArray(arr) ? arr : []);
      }catch{ return new Set(); }
    }
    function setVisitedSet(set){
      try{ localStorage.setItem(LS_VISITED_KEY, JSON.stringify(Array.from(set))); }catch{}
    }

    function escapeHtml(s){
      return String(s || '')
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;')
        .replaceAll("'","&#039;");
    }

    function normType(t){
      return String(t || '').toLowerCase().trim();
    }

    function updateStatsAndProgress(showingCount){
      const total = allTopics.length;
      const visited = getVisitedSet();
      const visitedCount = Array.from(visited).filter(id => allTopics.some(t => t.id === id)).length;

      document.getElementById('statTotal').textContent = String(total);
      document.getElementById('statShowing').textContent = String(showingCount);

      const pct = total ? Math.round((visitedCount / total) * 100) : 0;
      document.getElementById('progressText').textContent = `${pct}%`;
      document.getElementById('progressCount').textContent = `${visitedCount}/${total}`;
      document.getElementById('progressFill').style.width = `${pct}%`;

      const last = localStorage.getItem(LS_LAST_KEY);
      const btn = document.getElementById('btnContinue');
      if (last && allTopics.some(t => t.id === last)){
        btn.style.display = 'inline-flex';
        btn.onclick = () => openLesson(last);
      } else {
        btn.style.display = 'none';
      }
    }

    async function loadCourseMeta(){
      const metaRef = doc(db, 'course_meta', LEVEL);
      const metaSnap = await getDoc(metaRef);
      if (metaSnap.exists()){
        const m = metaSnap.data();
        levelTitle.textContent = m.title || `Nivel ${LEVEL}`;
        levelSubtitle.textContent = m.subtitle || '';
      } else {
        levelTitle.textContent = `Nivel ${LEVEL}`;
        levelSubtitle.textContent = '';
      }
    }

    window.editCourseMeta = async function(){
      if (!isAdmin) return;

      const currentTitle = levelTitle.textContent || `Nivel ${LEVEL}`;
      const currentSub = levelSubtitle.textContent || '';

      const newTitle = prompt('Nuevo título del curso (encabezado):', currentTitle);
      if (newTitle === null) return;

      const newSub = prompt('Nueva descripción del curso (debajo del título):', currentSub);
      if (newSub === null) return;

      const metaRef = doc(db, 'course_meta', LEVEL);
      await setDoc(metaRef, {
        title: newTitle.trim() || `Nivel ${LEVEL}`,
        subtitle: newSub.trim() || ''
      }, { merge: true });

      await loadCourseMeta();
      toast('✅ Descripción del curso guardada');
    };

    async function loadTopics(){
      grammarList.innerHTML = '';
      vocabList.innerHTML = '';

      const q = query(collection(db, 'courses'), where('level', '==', LEVEL));
      const snap = await getDocs(q);

      allTopics = [];
      snap.forEach((d) => {
        const data = d.data();
        allTopics.push({
          id: d.id,
          title: data.title || '',
          desc: data.desc || '',
          order: Number(data.order ?? 9999),
          type: normType(data.type),
          status: (data.status || 'published')
        });
      });

      allTopics.sort((a,b) => {
        if (a.type !== b.type) return a.type === 'grammar' ? -1 : 1;
        return a.order - b.order;
      });

      renderFiltered();
      updateStatsAndProgress(allTopics.length);
    }

    function renderTopicCard(t){
      const adminButtons = isAdmin ? `
        <div class="admin-tools">
          <button class="btn-edit" title="Editar" onclick="event.stopPropagation(); editTopic('${t.id}')">✏️</button>
          <button class="btn-edit" title="Duplicar" onclick="event.stopPropagation(); duplicateTopic('${t.id}')">🧩</button>
          <button class="btn-del" title="Eliminar" onclick="event.stopPropagation(); deleteTopic('${t.id}')">❌</button>
        </div>` : '';

      const badge = t.type === 'grammar'
        ? `<span class="badge badge-grammar">Gramática</span>`
        : `<span class="badge badge-vocab">Vocabulario</span>`;

      const statusChip = (isAdmin && (t.status || 'published') === 'draft')
        ? `<span class="chip chip-muted">Draft</span>`
        : '';

      const orderChip = Number.isFinite(t.order) && t.order !== 9999
        ? `<span class="chip">#${t.order}</span>`
        : `<span class="chip chip-muted">#—</span>`;

      return `
        <div class="card topic" role="button" tabindex="0"
          onclick="openLesson('${t.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); openLesson('${t.id}') }">
          ${adminButtons}
          <div class="topic-head">
            <div class="topic-title">
              ${orderChip}
              ${statusChip}
              <strong>${escapeHtml(t.title)}</strong>
            </div>
          ${badge}
          </div>
          <div class=\"markRow\" id=\"marks-${t.id}\"></div>
          <p>${escapeHtml(t.desc)}</p>
        </div>
      `;
    }

    const marksCache = new Map(); // topicId -> {lesson:boolean, exercises:boolean, done:boolean}

    function renderMarksChips(state){
      if(!state || !state.done){
        return `<span class="markChip markNone">⏳ Comprobando…</span>`;
      }
      const chips = [];
      if(state.lesson) chips.push(`<span class="markChip markLesson">📘 Lección</span>`);
      if(state.exercises) chips.push(`<span class="markChip markEx">🧩 Ejercicios</span>`);
      if(!state.lesson && !state.exercises) chips.push(`<span class="markChip markNone">— Sin contenido</span>`);
      return chips.join('');
    }

    function updateMarksDOM(topicId){
      const el = document.getElementById(`marks-${topicId}`);
      if(!el) return;
      const st = marksCache.get(topicId);
      el.innerHTML = renderMarksChips(st);
    }

    async function computeMarks(topicId){
      const st = { lesson:false, exercises:false, done:false };
      try{
        // lesson (course_meta docId: LEVEL__topicId)
        const metaId = `${LEVEL}__${topicId}`;
        const metaSnap = await getDoc(doc(db, 'course_meta', metaId));
        if(metaSnap.exists()){
          const d = metaSnap.data() || {};
          const hasAny =
            !!(String(d.html || '').trim()) ||
            !!(String(d.titleEs || '').trim()) ||
            !!(String(d.descEs || '').trim()) ||
            !!(String(d.grammar || '').trim()) ||
            !!(String(d.vocab || '').trim()) ||
            !!(String(d.dialog || '').trim()) ||
            !!(String(d.imageUrl || '').trim()) ||
            (Array.isArray(d.objectives) && d.objectives.length) ||
            (Array.isArray(d.examples) && d.examples.length);
          st.lesson = !!hasAny;
        }
      }catch{}

      try{
        // exercises (at least 1 exercise exists for this topic)
        const qx = query(
          collection(db, 'exercises'),
          where('level', '==', LEVEL),
          where('topicSlug', '==', topicId),
          limit(1)
        );
        const snap = await getDocs(qx);
        st.exercises = !snap.empty;
      }catch{}

      st.done = true;
      marksCache.set(topicId, st);
      updateMarksDOM(topicId);
    }

    function ensureMarks(topicId){
      if(marksCache.has(topicId) && marksCache.get(topicId)?.done){
        updateMarksDOM(topicId);
        return;
      }
      if(!marksCache.has(topicId)){
        marksCache.set(topicId, {done:false});
      }
      updateMarksDOM(topicId);
      computeMarks(topicId);
    }


    function renderFiltered(){
      const searchTerm = (searchInput.value || '').toLowerCase().trim();
      const selectedType = typeFilter.value;
      const selectedTask = taskFilter.value;

      const grammar = [];
      const vocab = [];

      for (const item of allTopics){
        if (!isAdmin && (item.status || 'published') !== 'published') continue;
        if (searchTerm){
          const inTitle = item.title.toLowerCase().includes(searchTerm);
          const inDesc = item.desc.toLowerCase().includes(searchTerm);
          if (!inTitle && !inDesc) continue;
        }

        if (selectedType && item.type !== selectedType) continue;

        // task filter: simple "contains" in desc (kept as in your current logic)
        if (selectedTask && !item.desc.toLowerCase().includes(selectedTask.toLowerCase())) continue;

        if (item.type === 'grammar') grammar.push(item);
        if (item.type === 'vocabulary') vocab.push(item);
      }

      grammar.sort((a,b)=>a.order-b.order);
      vocab.sort((a,b)=>a.order-b.order);

      grammarList.innerHTML = grammar.length
        ? grammar.map(renderTopicCard).join('')
        : `<div class="card noResults">No hay resultados en gramática</div>`;

      vocabList.innerHTML = vocab.length
        ? vocab.map(renderTopicCard).join('')
        : `<div class="card noResults">No hay resultados en vocabulario</div>`;

      // update markers for visible topics
      [...grammar, ...vocab].forEach(t => ensureMarks(t.id));

      updateStatsAndProgress(grammar.length + vocab.length);
    }

    window.openLesson = function(id){
      try{
        localStorage.setItem(LS_LAST_KEY, id);
        const visited = getVisitedSet();
        visited.add(id);
        setVisitedSet(visited);
      }catch{}

      const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(id)}`;
      window.location.href = url;
    };

    window.addTopic = async function(){
      if (!isAdmin) return;

      const type = document.getElementById('adminType').value;
      const title = document.getElementById('adminTitle').value.trim();
      const desc = document.getElementById('adminDesc').value.trim();
      const status = (document.getElementById('adminStatus')?.value || 'published').toLowerCase();

      if (!title || !desc){
        alert('Completa el título y la descripción');
        return;
      }

      const q = query(collection(db, 'courses'), where('level', '==', LEVEL));
      const snap = await getDocs(q);
      let maxOrder = 0;
      snap.forEach((d)=>{
        const o = Number(d.data().order ?? 0);
        if (o > maxOrder) maxOrder = o;
      });

      await addDoc(collection(db,'courses'), {
        level: LEVEL,
        type,
        title,
        desc,
        status: (status === 'draft' ? 'draft' : 'published'),
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()});

      document.getElementById('adminTitle').value = '';
      document.getElementById('adminDesc').value = '';

      await loadTopics();
      toast('✅ Tema agregado');
    };

    window.deleteTopic = async function(id){
      if (!isAdmin) return;
      if (!confirm('¿Eliminar este tema?')) return;
      await deleteDoc(doc(db,'courses', id));
      await loadTopics();
    };

    window.editTopic = async function(id){
      if (!isAdmin) return;

      const ref = doc(db,'courses', id);
      const snap = await getDoc(ref);
      if (!snap.exists()){
        alert('Tema no encontrado');
        return;
      }

      const cur = snap.data();
      const newTitle = prompt('Nuevo título:', cur.title || '');
      if (newTitle === null) return;
      const newDesc = prompt('Nueva descripción:', cur.desc || '');
      if (newDesc === null) return;

      const t = newTitle.trim();
      const d = newDesc.trim();
      if (!t || !d){
        alert('El título y la descripción no pueden estar vacíos');
        return;
      }

      const curStatus = (cur.status || 'published');
      const st = prompt("Estado (published/draft):", curStatus);
      if (st === null) return;
      const nextStatus = (String(st).toLowerCase().trim() === 'draft') ? 'draft' : 'published';

      await updateDoc(ref, { title: t, desc: d, status: nextStatus, updatedAt: new Date().toISOString() });
      await loadTopics();
    };


    window.duplicateTopic = async function(id){
      if (!isAdmin) return;

      const ref = doc(db,'courses', id);
      const snap = await getDoc(ref);
      if (!snap.exists()){
        alert('Tema no encontrado');
        return;
      }
      const cur = snap.data() || {};
      const baseTitle = (cur.title || '').toString();
      const baseDesc = (cur.desc || '').toString();
      const newTitle = prompt('Título para la copia:', `Copia: ${baseTitle}`) ;
      if (newTitle === null) return;
      const newDesc = prompt('Descripción para la copia:', baseDesc);
      if (newDesc === null) return;

      // default: draft unless you confirm publish
      const publishNow = confirm('¿Publicar la copia ahora? (Cancelar = borrador)');
      const status = publishNow ? 'published' : 'draft';

      // compute next order
      const q = query(collection(db, 'courses'), where('level', '==', LEVEL));
      const all = await getDocs(q);
      let maxOrder = 0;
      all.forEach((d)=>{
        const o = Number(d.data().order ?? 0);
        if (o > maxOrder) maxOrder = o;
      });

      await addDoc(collection(db,'courses'), {
        level: LEVEL,
        type: normType(cur.type),
        title: newTitle.trim(),
        desc: newDesc.trim(),
        status,
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()});

      await loadTopics();
      toast('✅ Copia creada');
    };
    window.dedupeLevel = async function(){
      if (!isAdmin) return;
      if (!confirm('¿Eliminar temas duplicados para el nivel ' + LEVEL + '?')) return;

      const q = query(collection(db,'courses'), where('level','==', LEVEL));
      const snap = await getDocs(q);

      const seen = new Map();
      const toDelete = [];

      snap.forEach((d)=>{
        const data = d.data();
        const key = [
          (data.level || '').toString().toUpperCase(),
          normType(data.type),
          (data.title || '').trim(),
          (data.desc || '').trim()
        ].join('||');

        if (!seen.has(key)) seen.set(key, d.id);
        else toDelete.push(d.id);
      });

      for (const id of toDelete){
        await deleteDoc(doc(db,'courses', id));
      }

      toast(`✅ Duplicados eliminados: ${toDelete.length}`);
      await loadTopics();
    };

    // auth + init
    onAuthStateChanged(auth, async (user)=>{
      if (!user){
        window.location.href = 'login.html';
        return;
      }

      isAdmin = user.email === ADMIN_EMAIL;

      // show/hide admin UI
      adminPanel.style.display = isAdmin ? 'block' : 'none';
      adminBar.style.display = isAdmin ? 'flex' : 'none';

      // header
      await loadCourseMeta();
      await loadTopics();
    });

    // logout
    document.getElementById('btnLogout').addEventListener('click', async ()=>{
      try{ await signOut(auth); }catch{}
      window.location.href = 'login.html';
    });

    // filters events
    searchInput.addEventListener('input', renderFiltered);
    typeFilter.addEventListener('change', renderFiltered);
    taskFilter.addEventListener('change', renderFiltered);

    // clear filters
    document.getElementById('btnClearFilters').addEventListener('click', ()=>{
      searchInput.value = '';
      typeFilter.value = '';
      taskFilter.value = '';
      renderFiltered();
      toast('🧼 Filtros limpiados');
    });

    // shortcuts
    window.addEventListener('keydown', (e)=>{
      if (e.key === '/' && document.activeElement !== searchInput){
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInput){
        searchInput.value = '';
        renderFiltered();
      }
    });
  </script>

<script data-aquivivo-no-new-tab="1">
  // Force same-tab navigation (prevents accidental new tabs)
  (function () {
    try {
      document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
          a.removeAttribute('target');
          var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
          rel = rel.filter(function (x) { return !(/^noopener$/i.test(x) || /^noreferrer$/i.test(x)); });
          if (rel.length) a.setAttribute('rel', rel.join(' '));
          else a.removeAttribute('rel');
        });
      });

      var _open = window.open;
      window.open = function (url, target) {
        if (target && String(target).toLowerCase() === '_blank' && url) {
          window.location.assign(url);
          return null;
        }
        return _open.apply(window, arguments);
      };
    } catch (e) {}
  })();
</script>

</div>
  <script src="assets/js/layout.js" defer>
