import { db } from '../firebase-init.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

/**
 * course-page.js
 * Works with course.html (IDs: levelTitle, progressFill, progressText, totalCount, showCount,
 * searchInput, typeFilter, clearFilters, topicsGrid)
 *
 * Data source: Firestore collection 'courses'
 * Required fields: level (string), title (string), desc (string), order (number), type ('gramatica'|'vocabulario' or similar)
 */

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function getLevel(){
  const qs = new URLSearchParams(location.search);
  return (qs.get('level') || 'A1').toUpperCase();
}

function normType(v){
  const s = String(v || '').toLowerCase();
  if (s.startsWith('g')) return 'gramatica';
  if (s.startsWith('v')) return 'vocabulario';
  // allow legacy values
  if (s === 'grammar') return 'gramatica';
  if (s === 'vocab') return 'vocabulario';
  return '';
}

function lsVisitedKey(level){ return `aquivivo_visited_${level}`; }

function getVisited(level){
  try{
    const arr = JSON.parse(localStorage.getItem(lsVisitedKey(level)) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  }catch{ return new Set(); }
}

function setVisited(level, set){
  try{ localStorage.setItem(lsVisitedKey(level), JSON.stringify(Array.from(set))); }catch{}
}

function updateProgress(level, total){
  const visited = getVisited(level).size;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const fill = document.getElementById('progressFill');
  const txt  = document.getElementById('progressText');

  if (fill) fill.style.width = `${pct}%`;
  if (txt) txt.textContent = `${pct}% · ${visited}/${total} temas visitados`;
}

function openTopic(level, topicId){
  const visited = getVisited(level);
  visited.add(topicId);
  setVisited(level, visited);
  // go to lesson page
  window.location.href = `lessonpage.html?level=${encodeURIComponent(level)}&id=${encodeURIComponent(topicId)}`;
}

function render(topics){
  const grid = document.getElementById('topicsGrid');
  if (!grid) return;

  grid.innerHTML = topics.map(t => `
    <div class="card topicCard" role="button" tabindex="0"
      data-id="${esc(t.id)}"
      onclick="window.__openTopic('${esc(t.level)}','${esc(t.id)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.__openTopic('${esc(t.level)}','${esc(t.id)}')}">
      <div class="metaRow">
        ${t.type ? `<span class="pill pill-blue">${t.type === 'gramatica' ? '📘 Gramática' : '📗 Vocabulario'}</span>` : ``}
        ${Number.isFinite(t.order) ? `<span class="pill pill-yellow">#${t.order}</span>` : ``}
      </div>
      <div style="margin-top:10px; font-weight:900; font-size:16px;">${esc(t.title)}</div>
      <div class="hintSmall" style="margin-top:6px;">${esc(t.desc)}</div>
    </div>
  `).join('');
}

function applyFilters(allTopics){
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const type = (document.getElementById('typeFilter')?.value || '').trim().toLowerCase();

  const filtered = allTopics.filter(t => {
    const matchQ = !q || (t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
    const matchT = !type || t.type === type;
    return matchQ && matchT;
  });

  const showCount = document.getElementById('showCount');
  if (showCount) showCount.textContent = String(filtered.length);

  render(filtered);
}

async function loadTopics(level){
  const q = query(
    collection(db, 'courses'),
    where('level', '==', level),
    orderBy('order', 'asc')
  );

  const snap = await getDocs(q);
  const topics = [];
  snap.forEach(docu => {
    const d = docu.data() || {};
    topics.push({
      id: docu.id,
      level,
      title: d.title || '—',
      desc: d.desc || '',
      order: (d.order === 0 || d.order) ? Number(d.order) : NaN,
      type: normType(d.type)
    });
  });

  // fallback sort if order missing
  topics.sort((a,b) => (Number.isFinite(a.order)?a.order:99999) - (Number.isFinite(b.order)?b.order:99999));

  const totalCount = document.getElementById('totalCount');
  if (totalCount) totalCount.textContent = String(topics.length);

  updateProgress(level, topics.length);

  return topics;
}

document.addEventListener('DOMContentLoaded', async () => {
  const level = getLevel();
  const title = document.getElementById('levelTitle');
  if (title) title.textContent = `Nivel ${level}`;

  // expose for onclick in template (keeps file simple)
  window.__openTopic = openTopic;

  let allTopics = [];
  try{
    allTopics = await loadTopics(level);
  }catch(e){
    console.error(e);
    const grid = document.getElementById('topicsGrid');
    if (grid) grid.innerHTML = `<div class="card">No se pudo cargar el curso. Revisa la consola y tu conexión a Firestore.</div>`;
    return;
  }

  const searchInput = document.getElementById('searchInput');
  const typeFilter  = document.getElementById('typeFilter');
  const clearBtn    = document.getElementById('clearFilters');

  if (searchInput) searchInput.addEventListener('input', () => applyFilters(allTopics));
  if (typeFilter)  typeFilter.addEventListener('change', () => applyFilters(allTopics));
  if (clearBtn)    clearBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = '';
    applyFilters(allTopics);
  });

  applyFilters(allTopics);
});
