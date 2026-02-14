// assets/js/pages/buscar-page.js
// Community Explore: search people + suggestions

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  deleteDoc,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const buscarAvatar = $('buscarAvatar');
const buscarAvatarImg = $('buscarAvatarImg');
const buscarAvatarFallback = $('buscarAvatarFallback');
const buscarInput = $('buscarInput');
const btnBuscar = $('btnBuscar');
const btnBuscarClear = $('btnBuscarClear');
const buscarStatus = $('buscarStatus');
const buscarResults = $('buscarResults');
const buscarSuggestionsHint = $('buscarSuggestionsHint');
const buscarSuggestions = $('buscarSuggestions');
const buscarTrends = $('buscarTrends');

let MY_FOLLOWING_SET = new Set();

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMsg(text, bad = false) {
  if (!buscarStatus) return;
  buscarStatus.textContent = text || '';
  buscarStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function avatarLetter(name) {
  return String(name || 'U').trim()[0]?.toUpperCase() || 'U';
}

function renderMyAvatar(url, name) {
  if (!buscarAvatar) return;
  if (buscarAvatarFallback) buscarAvatarFallback.textContent = avatarLetter(name || 'Usuario');
  if (!buscarAvatarImg) return;
  const imgUrl = String(url || '').trim();
  if (imgUrl) {
    buscarAvatarImg.src = imgUrl;
    buscarAvatar.classList.add('hasImage');
  } else {
    buscarAvatarImg.removeAttribute('src');
    buscarAvatar.classList.remove('hasImage');
  }
}

function usePrettyProfile() {
  const host = location.hostname || '';
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('github.io')) return false;
  return true;
}

function buildProfileHref(handle, uid) {
  const safeHandle = String(handle || '').trim();
  if (safeHandle) {
    return usePrettyProfile()
      ? `/perfil/${encodeURIComponent(safeHandle)}`
      : `perfil.html?u=${encodeURIComponent(safeHandle)}`;
  }
  return `perfil.html?uid=${encodeURIComponent(uid || '')}`;
}

function followDocId(fromUid, toUid) {
  const a = String(fromUid || '').trim();
  const b = String(toUid || '').trim();
  return a && b ? `${a}__${b}` : '';
}

async function loadMyFollowingSet(myUid) {
  if (!myUid) return new Set();
  try {
    const snap = await getDocs(
      query(collection(db, 'user_follows'), where('fromUid', '==', myUid), limit(500)),
    );
    const ids = new Set();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const toUid = String(data.toUid || '').trim();
      if (toUid) ids.add(toUid);
    });
    MY_FOLLOWING_SET = ids;
    return ids;
  } catch (e) {
    console.warn('[buscar] load following set failed', e);
    MY_FOLLOWING_SET = new Set();
    return MY_FOLLOWING_SET;
  }
}

async function setFollowing(myUid, targetUid, follow) {
  const from = String(myUid || '').trim();
  const to = String(targetUid || '').trim();
  const id = followDocId(from, to);
  if (!id || from === to) return false;
  if (follow) {
    await setDoc(
      doc(db, 'user_follows', id),
      { fromUid: from, toUid: to, createdAt: serverTimestamp() },
      { merge: true },
    );
    MY_FOLLOWING_SET.add(to);
    return true;
  }
  await deleteDoc(doc(db, 'user_follows', id));
  MY_FOLLOWING_SET.delete(to);
  return false;
}

async function getFriendStatus(myUid, targetUid) {
  const directId = `${myUid}__${targetUid}`;
  const reverseId = `${targetUid}__${myUid}`;
  const [directSnap, reverseSnap] = await Promise.all([
    getDoc(doc(db, 'friend_requests', directId)),
    getDoc(doc(db, 'friend_requests', reverseId)),
  ]);
  if (directSnap.exists()) return { id: directId, ...directSnap.data() };
  if (reverseSnap.exists()) return { id: reverseId, ...reverseSnap.data() };
  return null;
}

async function isBlockedPair(myUid, targetUid) {
  const [a, b] = await Promise.all([
    getDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`)),
    getDoc(doc(db, 'user_blocks', `${targetUid}__${myUid}`)),
  ]);
  return { blockedByMe: a.exists(), blockedByOther: b.exists() };
}

async function sendFriendRequest(myUid, targetUid) {
  const status = await getFriendStatus(myUid, targetUid);
  if (status?.status === 'accepted') {
    setMsg('Ya son amigos.');
    return;
  }
  if (status?.status === 'pending') {
    setMsg('Solicitud pendiente.');
    return;
  }
  const { blockedByMe, blockedByOther } = await isBlockedPair(myUid, targetUid);
  if (blockedByMe) {
    setMsg('Desbloquea primero.', true);
    return;
  }
  if (blockedByOther) {
    setMsg('No puedes enviar solicitud.', true);
    return;
  }

  await setDoc(doc(db, 'friend_requests', `${myUid}__${targetUid}`), {
    fromUid: myUid,
    toUid: targetUid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  setMsg('Solicitud enviada.');
}

function renderUserRow(item, myUid, opts = {}) {
  const uid = String(item?.uid || item?.id || '').trim();
  if (!uid) return '';
  const name = String(item.displayName || item.name || item.handle || 'Usuario').trim();
  const handle = item.handle ? `@${item.handle}` : '';
  const href = buildProfileHref(item.handle, uid);
  const initial = avatarLetter(name || 'U');
  const photo = String(item.photoURL || '').trim();
  const avatar = photo
    ? `<div class="nav-avatar nav-avatar--small nav-avatar--img"><img src="${esc(
        photo,
      )}" alt="" loading="lazy" /><span>${esc(initial)}</span></div>`
    : `<div class="nav-avatar nav-avatar--small"><span>${esc(initial)}</span></div>`;

  const isMe = uid === myUid;
  const isFollowing = MY_FOLLOWING_SET.has(uid);
  const followBtn = !isMe
    ? `<button class="btn-white-outline" type="button" data-follow="${esc(uid)}" data-following="${
        isFollowing ? '1' : '0'
      }">${isFollowing ? 'Siguiendo' : 'Seguir'}</button>`
    : '';
  const addBtn =
    !isMe && opts.allowAdd !== false
      ? `<button class="btn-white-outline" type="button" data-add="${esc(uid)}">Agregar</button>`
      : '';

  const actionRow = `
    <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
      <a class="btn-white-outline" href="${esc(href)}">Ver perfil</a>
      ${followBtn}
      ${addBtn}
    </div>
  `;

  return `
    <div class="friendItem">
      <div class="friendMeta" style="flex: 1; min-width: 0">
        ${avatar}
        <div style="min-width: 0">
          <div class="friendName">${esc(name)}</div>
          ${handle ? `<div class="friendHint">${esc(handle)}</div>` : ''}
        </div>
      </div>
      ${actionRow}
    </div>
  `;
}

function renderResults(items, myUid) {
  if (!buscarResults) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    buscarResults.innerHTML = '<div class="muted">Sin resultados.</div>';
    return;
  }
  buscarResults.innerHTML = list.map((x) => renderUserRow(x, myUid)).join('');
}

function renderSuggestions(items, myUid) {
  if (!buscarSuggestions) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    buscarSuggestions.innerHTML = '<div class="muted">Sin sugerencias por ahora.</div>';
    return;
  }
  buscarSuggestions.innerHTML = list.map((x) => renderUserRow(x, myUid, { allowAdd: true })).join('');
}

async function searchUsers(term) {
  const raw = String(term || '').trim().toLowerCase();
  const q = raw.startsWith('@') ? raw.slice(1).trim() : raw;
  if (!q) {
    setMsg('Escribe un nombre o @usuario.', true);
    renderResults([], '');
    return [];
  }

  setMsg('Buscando...');
  try {
    const nameQuery = query(
      collection(db, 'public_users'),
      orderBy('displayNameLower'),
      startAt(q),
      endAt(`${q}\uf8ff`),
      limit(12),
    );
    const handleQuery = query(
      collection(db, 'public_users'),
      orderBy('handleLower'),
      startAt(q),
      endAt(`${q}\uf8ff`),
      limit(12),
    );
    const [byName, byHandle] = await Promise.all([getDocs(nameQuery), getDocs(handleQuery)]);

    const merged = new Map();
    [...(byName.docs || []), ...(byHandle.docs || [])].forEach((d) => {
      merged.set(d.id, { uid: d.id, ...(d.data() || {}) });
    });

    const list = [...merged.values()].slice(0, 12);
    setMsg(list.length ? `${list.length} resultado(s).` : 'Sin resultados.');
    return list;
  } catch (e) {
    console.warn('[buscar] search failed', e);
    setMsg('No se pudo buscar. Intenta de nuevo.', true);
    return [];
  }
}

async function loadSuggestions(myUid) {
  if (!buscarSuggestions || !buscarSuggestionsHint) return;
  buscarSuggestionsHint.textContent = 'Cargando...';
  buscarSuggestions.innerHTML = '';
  try {
    const snap = await getDocs(query(collection(db, 'public_users'), orderBy('exp', 'desc'), limit(12)));
    const items = snap.docs
      .map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((item) => item.uid !== myUid)
      .filter((item) => !MY_FOLLOWING_SET.has(item.uid))
      .slice(0, 6);
    buscarSuggestionsHint.textContent = items.length ? 'Personas recomendadas' : 'Sin sugerencias por ahora.';
    renderSuggestions(items, myUid);
  } catch (e) {
    console.warn('[buscar] suggestions failed', e);
    buscarSuggestionsHint.textContent = 'No se pudieron cargar sugerencias.';
    buscarSuggestions.innerHTML = '<div class="muted">Intenta más tarde.</div>';
  }
}

function wireActions(myUid) {
  if (btnBuscar && !btnBuscar.dataset.wired) {
    btnBuscar.dataset.wired = '1';
    btnBuscar.addEventListener('click', async () => {
      const list = await searchUsers(buscarInput?.value || '');
      renderResults(list, myUid);
    });
  }

  if (btnBuscarClear && !btnBuscarClear.dataset.wired) {
    btnBuscarClear.dataset.wired = '1';
    btnBuscarClear.addEventListener('click', () => {
      if (buscarInput) buscarInput.value = '';
      if (buscarResults) buscarResults.innerHTML = '';
      setMsg('');
      buscarInput?.focus?.();
    });
  }

  if (buscarInput && !buscarInput.dataset.wired) {
    buscarInput.dataset.wired = '1';
    buscarInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const list = await searchUsers(buscarInput.value);
      renderResults(list, myUid);
    });
    buscarInput.addEventListener('input', () => {
      const value = String(buscarInput.value || '').trim();
      if (!value) {
        setMsg('');
        if (buscarResults) buscarResults.innerHTML = '';
      }
    });
  }

  const onListClick = async (e) => {
    const followBtn = e.target?.closest?.('button[data-follow]');
    if (followBtn) {
      const targetUid = String(followBtn.getAttribute('data-follow') || '').trim();
      if (!targetUid || targetUid === myUid) return;
      const isFollowing = followBtn.getAttribute('data-following') === '1';
      const next = !isFollowing;
      try {
        followBtn.disabled = true;
        await setFollowing(myUid, targetUid, next);
        followBtn.setAttribute('data-following', next ? '1' : '0');
        followBtn.textContent = next ? 'Siguiendo' : 'Seguir';
        setMsg(next ? 'Siguiendo ✅' : 'Listo ✅');
        setTimeout(() => setMsg(''), 1200);
        loadSuggestions(myUid).catch(() => {});
      } catch (err) {
        console.warn('[buscar] follow failed', err);
        setMsg('No se pudo actualizar.', true);
      } finally {
        followBtn.disabled = false;
      }
      return;
    }

    const addBtn = e.target?.closest?.('button[data-add]');
    if (addBtn) {
      const targetUid = String(addBtn.getAttribute('data-add') || '').trim();
      if (!targetUid || targetUid === myUid) return;
      try {
        addBtn.disabled = true;
        await sendFriendRequest(myUid, targetUid);
      } catch (err) {
        console.warn('[buscar] add failed', err);
        setMsg('No se pudo enviar la solicitud.', true);
      } finally {
        addBtn.disabled = false;
      }
    }
  };

  if (buscarResults && !buscarResults.dataset.wired) {
    buscarResults.dataset.wired = '1';
    buscarResults.addEventListener('click', onListClick);
  }
  if (buscarSuggestions && !buscarSuggestions.dataset.wired) {
    buscarSuggestions.dataset.wired = '1';
    buscarSuggestions.addEventListener('click', onListClick);
  }
}

function renderTrends() {
  if (!buscarTrends) return;
  const chips = [
    { label: '@', value: '@' },
    { label: 'An', value: 'an' },
    { label: 'Ma', value: 'ma' },
    { label: 'Ka', value: 'ka' },
  ];
  buscarTrends.innerHTML = chips
    .map(
      (c) =>
        `<button class="filterChip" type="button" data-trend="${esc(c.value)}">${esc(c.label)}</button>`,
    )
    .join('');

  if (!buscarTrends.dataset.wired) {
    buscarTrends.dataset.wired = '1';
    buscarTrends.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-trend]');
      if (!btn) return;
      const value = String(btn.getAttribute('data-trend') || '').trim();
      if (!buscarInput) return;
      buscarInput.value = value;
      buscarInput.focus();
    });
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const next = `${location.pathname.split('/').pop() || 'buscar.html'}${location.search || ''}${location.hash || ''}`;
    window.location.href = `login.html?next=${encodeURIComponent(next)}`;
    return;
  }

  try {
    await loadMyFollowingSet(user.uid);
  } catch {}

  try {
    const snap = await getDoc(doc(db, 'public_users', user.uid));
    const profile = snap.exists() ? snap.data() : {};
    const photoURL = String(profile?.photoURL || '').trim();
    const name = String(profile?.displayName || profile?.name || user?.displayName || user?.email || '').trim();
    renderMyAvatar(photoURL, name || 'Usuario');
  } catch (e) {
    console.warn('[buscar] load my profile failed', e);
    renderMyAvatar('', user?.email || 'Usuario');
  }

  wireActions(user.uid);
  renderTrends();
  loadSuggestions(user.uid).catch(() => {});
  setTimeout(() => buscarInput?.focus?.(), 120);
});

