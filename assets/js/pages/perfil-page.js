import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  limit,
  orderBy,
  onSnapshot,
  query,
  updateDoc,
  setDoc,
  where,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const PROFILE_UID = (qs.get('uid') || '').trim();
const PATH_HANDLE = (() => {
  const m = (location.pathname || '').match(/\/perfil\/([^/]+)$/i);
  return m ? decodeURIComponent(m[1]) : '';
})();
const PROFILE_HANDLE = (qs.get('u') || PATH_HANDLE || '').trim().toLowerCase();

const profileName = $('profileName');
const profileHandle = $('profileHandle');
const profileStatus = $('profileStatus');
const profileMsg = $('profileMsg');
const btnAdd = $('btnProfileAdd');
const btnChat = $('btnProfileChat');
const btnBlock = $('btnProfileBlock');
const avatarWrap = $('profileAvatarWrap');
const avatarImg = $('profileAvatarImg');
const statusCard = $('statusCard');
const statusInput = $('statusInput');
const statusPostBtn = $('statusPostBtn');
const statusHint = $('statusHint');
const statusMood = $('statusMood');
const statusMotivation = $('statusMotivation');
const statusMinutes = $('statusMinutes');
const statusCourse = $('statusCourse');
const statusHeart = $('statusHeart');
const statusAvatar = $('statusAvatar');
const statusAvatarImg = $('statusAvatarImg');
const statusAvatarFallback = $('statusAvatarFallback');
const feedList = $('feedList');
const invitesHint = $('invitesHint');
const invitesList = $('invitesList');
const friendSearchInput = $('friendSearchInput');
const friendSearchBtn = $('friendSearchBtn');
const friendSearchHint = $('friendSearchHint');
const friendSearchResults = $('friendSearchResults');
const rankingList = $('rankingList');
const statStreak = $('statStreak');
const statExp = $('statExp');
const statLeague = $('statLeague');
const statTop3 = $('statTop3');

let FEED_ITEMS = [];
let feedUnsub = null;

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDateValue(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  return null;
}

function formatTime(ts) {
  const date = toDateValue(ts);
  if (!date) return '';
  try {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function setStatusHint(text) {
  if (!statusHint) return;
  statusHint.textContent = text || '';
}

function toggleChip(btn) {
  if (!btn) return;
  btn.classList.toggle('active');
}

function collectTags() {
  const tags = [];
  if (statusMood?.classList.contains('active')) tags.push('Estado');
  if (statusMotivation?.classList.contains('active')) tags.push('Motivación');
  if (statusMinutes?.value) tags.push(`${statusMinutes.value} min`);
  if (statusCourse?.value) tags.push(statusCourse.value);
  return tags;
}

function playHeart() {
  if (!statusCard) return;
  statusCard.classList.add('pulse-heart');
  setTimeout(() => statusCard.classList.remove('pulse-heart'), 700);
}

function renderFeed(list, myUid) {
  if (!feedList) return;
  feedList.innerHTML = '';
  const sorted = [...list].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (!sorted.length) {
    feedList.innerHTML =
      '<div class="card muted">Aún no hay publicaciones. Escribe tu primer estado ✨</div>';
    return;
  }

  sorted.forEach((post) => {
    const card = document.createElement('div');
    card.className = `post-card post-card--${post.type || 'user'}`;
    const isMine = post.authorUid && myUid && post.authorUid === myUid;
    const createdAt = toDateValue(post.createdAt);
    const canEdit =
      isMine && createdAt ? Date.now() - createdAt.getTime() < 10 * 60 * 1000 : false;
    const tags = Array.isArray(post.tags) ? post.tags : [];
    card.innerHTML = `
      <div class="post-head">
        <div class="post-title">${esc(post.authorName || 'AquiVivo')}</div>
        <div class="post-time">${formatTime(post.createdAt)}</div>
      </div>
      <div class="post-body">${esc(post.text || '')}</div>
      ${tags.length ? `<div class="post-meta">${tags.map((t) => `<span>• ${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="post-reactions">❤️ 🔥 ✨</div>
      <div class="post-actions">
        ${post.actionLabel ? `<button class="btn-white-outline" data-action="follow" data-id="${post.id}">${esc(post.actionLabel)}</button>` : ''}
        ${canEdit ? `<button class="btn-white-outline" data-action="edit" data-id="${post.id}">Editar</button>` : ''}
        ${isMine ? `<button class="btn-white-outline" data-action="delete" data-id="${post.id}">Eliminar</button>` : ''}
      </div>
    `;
    feedList.appendChild(card);
  });
}

function subscribeFeed(targetUid, myUid) {
  if (!targetUid) return;
  if (feedUnsub) feedUnsub();
  const q = query(
    collection(db, 'user_feed', targetUid, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  feedUnsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));
      const hasPinned = items.some((p) => p.pinned);
      if (!hasPinned) {
        items.unshift({
          id: 'sys_pinned_local',
          type: 'system',
          text: 'Tu progreso aparece aqui. Sigue aprendiendo 🔥',
          createdAt: new Date(),
          pinned: true,
        });
      }
      FEED_ITEMS = items;
      renderFeed(FEED_ITEMS, myUid);
    },
    (err) => {
      console.warn('feed snapshot failed', err);
      renderFeed([], myUid);
    },
  );
}

async function fetchPublicUser(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'public_users', uid));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
}

async function loadInvites(myUid) {
  if (!invitesList || !invitesHint) return;
  invitesList.innerHTML = '';
  invitesHint.textContent = 'Cargando...';
  try {
    const snap = await getDocs(
      query(
        collection(db, 'friend_requests'),
        where('toUid', '==', myUid),
        where('status', '==', 'pending'),
        limit(10),
      ),
    );
    if (snap.empty) {
      invitesHint.textContent = 'No tienes invitaciones pendientes.';
      return;
    }
    invitesHint.textContent = '';
    const items = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data() || {};
        const from = await fetchPublicUser(data.fromUid);
        return { id: docSnap.id, data, from };
      }),
    );
    items.forEach((item) => {
      const name = item.from?.displayName || 'Usuario';
      const handle = item.from?.handle ? `@${item.from.handle}` : '';
      const wrap = document.createElement('div');
      wrap.className = 'friendItem';
      wrap.innerHTML = `
        <div style="flex:1">
          <div style="font-weight: 800">${esc(name)}</div>
          <div class="muted">${esc(handle)}</div>
        </div>
        <div class="metaRow" style="gap:6px">
          <button class="btn-white-outline" data-invite="accept" data-id="${item.id}">Seguir</button>
          <button class="btn-white-outline" data-invite="decline" data-id="${item.id}">Ignorar</button>
        </div>
      `;
      invitesList.appendChild(wrap);
    });
  } catch (e) {
    console.warn('load invites failed', e);
    invitesHint.textContent = 'No se pudieron cargar las invitaciones.';
  }
}

async function handleInviteAction(myUid, inviteId, action) {
  if (!inviteId) return;
  const ref = doc(db, 'friend_requests', inviteId);
  const status = action === 'accept' ? 'accepted' : 'declined';
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  await loadInvites(myUid);
}

async function searchFriends(term, myUid) {
  if (!friendSearchResults || !friendSearchHint) return;
  friendSearchResults.innerHTML = '';
  if (!term) {
    friendSearchHint.textContent = 'Escribe un usuario para buscar.';
    return;
  }
  friendSearchHint.textContent = 'Buscando...';
  try {
    const q = query(
      collection(db, 'public_users'),
      where('handleLower', '>=', term),
      where('handleLower', '<=', `${term}\uf8ff`),
      limit(10),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      friendSearchHint.textContent = 'Sin resultados.';
      return;
    }
    friendSearchHint.textContent = '';
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const uid = docSnap.id;
      const name = data.displayName || 'Usuario';
      const handle = data.handle ? `@${data.handle}` : '';
      const wrap = document.createElement('div');
      wrap.className = 'friendItem';
      wrap.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:800">${esc(name)}</div>
          <div class="muted">${esc(handle)}</div>
        </div>
        <div>
          ${
            uid === myUid
              ? '<span class="muted">Tú</span>'
              : `<button class="btn-white-outline" data-add-friend="${uid}">Seguir</button>`
          }
        </div>
      `;
      friendSearchResults.appendChild(wrap);
    });
  } catch (e) {
    console.warn('search friends failed', e);
    friendSearchHint.textContent = 'Error al buscar.';
  }
}

async function loadRanking() {
  if (!rankingList) return;
  rankingList.innerHTML = '<div class="muted">Cargando ranking...</div>';
  try {
    const snap = await getDocs(
      query(collection(db, 'public_users'), orderBy('exp', 'desc'), limit(5)),
    );
    const rows = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((item) => item.rankingOptIn !== false);
    if (!rows.length) {
      rankingList.innerHTML = '<div class="muted">Sin ranking disponible.</div>';
      return;
    }
    rankingList.innerHTML = '';
    rows.forEach((row, idx) => {
      const name = row.displayName || row.handle || 'Usuario';
      const exp = Number(row.exp || 0);
      const item = document.createElement('div');
      item.className = 'rankingItem';
      item.innerHTML = `<span>#${idx + 1}</span><span>${esc(name)}</span><span>${exp}</span>`;
      rankingList.appendChild(item);
    });
  } catch (e) {
    console.warn('ranking failed', e);
    rankingList.innerHTML = '<div class="muted">No se pudo cargar el ranking.</div>';
  }
}

function bindFeedActions(myUid, displayName, targetUid) {
  if (!feedList) return;
  feedList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    const idx = FEED_ITEMS.findIndex((p) => p.id === id);
    if (idx < 0) return;

    if (action === 'delete') {
      deleteDoc(doc(db, 'user_feed', targetUid, 'posts', id)).catch((e) =>
        console.warn('delete post failed', e),
      );
      return;
    }

    if (action === 'edit') {
      const post = FEED_ITEMS[idx];
      const updated = prompt('Editar tu estado:', post.text || '');
      if (updated && updated.trim()) {
        updateDoc(doc(db, 'user_feed', targetUid, 'posts', id), {
          text: updated.trim(),
          editedAt: serverTimestamp(),
        }).catch((e) => console.warn('update post failed', e));
      }
      return;
    }

    if (action === 'follow') {
      setStatusHint('Siguiendo ✅');
      setTimeout(() => setStatusHint(''), 2000);
    }
  });
}

function bindStatusComposer(myUid, displayName, isOwner) {
  if (!statusCard) return;
  if (!isOwner) {
    statusCard.style.display = 'none';
    return;
  }
  if (!statusInput || !statusPostBtn) return;

  const updateBtn = () => {
    statusPostBtn.disabled = !statusInput.value.trim();
  };
  statusInput.addEventListener('input', updateBtn);
  updateBtn();

  statusMood?.addEventListener('click', () => toggleChip(statusMood));
  statusMotivation?.addEventListener('click', () => toggleChip(statusMotivation));

  statusPostBtn.addEventListener('click', () => {
    const text = statusInput.value.trim();
    if (!text) return;
    const tags = collectTags();
    const post = {
      type: 'user',
      text,
      createdAt: serverTimestamp(),
      editedAt: null,
      authorUid: myUid,
      authorName: displayName || 'Usuario',
      tags,
    };
    addDoc(collection(db, 'user_feed', myUid, 'posts'), post).catch((e) =>
      console.warn('add post failed', e),
    );
    statusInput.value = '';
    if (statusMinutes) statusMinutes.value = '';
    if (statusCourse) statusCourse.value = '';
    statusMood?.classList.remove('active');
    statusMotivation?.classList.remove('active');
    updateBtn();
    setStatusHint('Publicado ✅');
    playHeart();
    setTimeout(() => setStatusHint(''), 2000);
  });
}

function setMsg(text, bad = false) {
  if (!profileMsg) return;
  profileMsg.textContent = text || '';
  profileMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function renderAvatar(url) {
  if (!avatarWrap || !avatarImg) return;
  if (url) {
    avatarImg.src = url;
    avatarWrap.classList.add('hasImage');
    if (statusAvatarImg) {
      statusAvatarImg.src = url;
      statusAvatarImg.style.display = 'block';
    }
    if (statusAvatar) statusAvatar.classList.add('nav-avatar--img');
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
    if (statusAvatarImg) {
      statusAvatarImg.removeAttribute('src');
      statusAvatarImg.style.display = 'none';
    }
    if (statusAvatar) statusAvatar.classList.remove('nav-avatar--img');
  }
}

async function resolveUidFromHandle(handle) {
  if (!handle) return '';
  const snap = await getDocs(
    query(collection(db, 'public_users'), where('handleLower', '==', handle), limit(1)),
  );
  if (snap.empty) return '';
  return snap.docs[0].id || '';
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
  try {
    await setDoc(doc(db, 'friend_requests', `${myUid}__${targetUid}`), {
      fromUid: myUid,
      toUid: targetUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setMsg('Solicitud enviada.');
  } catch (e) {
    console.warn('send friend request failed', e);
    setMsg('No se pudo enviar la solicitud.', true);
  }
}

async function blockUser(myUid, targetUid) {
  await setDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`), {
    fromUid: myUid,
    toUid: targetUid,
    createdAt: serverTimestamp(),
  });
  setMsg('Usuario bloqueado.');
}

async function unblockUser(myUid, targetUid) {
  await deleteDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`));
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=perfil.html';
    return;
  }
  let targetUid = PROFILE_UID;
  if (!targetUid && PROFILE_HANDLE) {
    targetUid = await resolveUidFromHandle(PROFILE_HANDLE);
  }
  if (!targetUid) {
    setMsg('Falta el usuario.', true);
    return;
  }
  if (profileStatus) profileStatus.textContent = 'Cargando...';

  try {
    const [profileSnap, blockedInfo] = await Promise.all([
      getDoc(doc(db, 'public_users', targetUid)),
      isBlockedPair(user.uid, targetUid),
    ]);

    if (!profileSnap.exists()) {
      if (profileStatus) profileStatus.textContent = 'Perfil no encontrado.';
      return;
    }

    const profile = profileSnap.data() || {};
    const name = profile.displayName || 'Usuario';
    if (profileName) profileName.textContent = name;
    if (profileHandle)
      profileHandle.textContent = profile.handle ? `@${profile.handle}` : '';
    renderAvatar(profile.photoURL || '');
    if (statusAvatarFallback)
      statusAvatarFallback.textContent = (name || 'U')[0].toUpperCase();
    if (statStreak)
      statStreak.textContent = Number(profile.streakDays || profile.streak || 0);
    if (statExp) statExp.textContent = Number(profile.exp || 0);
    if (statLeague) statLeague.textContent = profile.league || '—';
    if (statTop3) statTop3.textContent = Number(profile.top3 || 0);


    if (blockedInfo.blockedByOther) {
      if (profileStatus) profileStatus.textContent = 'No puedes interactuar.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.style.pointerEvents = 'none';
    }

    const friendStatus = await getFriendStatus(user.uid, targetUid);
    const isFriend = friendStatus?.status === 'accepted';
    const canMessage = profile.allowMessages !== false;

    if (profile.publicProfile === false && user.uid !== targetUid && !isFriend) {
      if (profileStatus) profileStatus.textContent = 'Perfil privado.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.classList.add('disabled');
      if (btnBlock) btnBlock.disabled = true;
      return;
    }

    subscribeFeed(targetUid, user.uid);
    bindFeedActions(user.uid, name, targetUid);
    bindStatusComposer(user.uid, name, user.uid === targetUid);

    if (user.uid === targetUid) {
      loadInvites(user.uid);
    } else if (invitesList) {
      invitesList.innerHTML = '';
      if (invitesHint) invitesHint.textContent = 'Solo visible para tu perfil.';
    }

    loadRanking();

    if (friendSearchBtn && !friendSearchBtn.dataset.wired) {
      friendSearchBtn.dataset.wired = '1';
      friendSearchBtn.addEventListener('click', () => {
        const term = (friendSearchInput?.value || '').trim().toLowerCase();
        searchFriends(term, user.uid);
      });
    }

    if (invitesList && !invitesList.dataset.wired) {
      invitesList.dataset.wired = '1';
      invitesList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-invite]');
        if (!btn) return;
        const action = btn.getAttribute('data-invite');
        const id = btn.getAttribute('data-id');
        handleInviteAction(user.uid, id, action).catch((e) =>
          console.warn('invite action failed', e),
        );
      });
    }

    if (friendSearchResults && !friendSearchResults.dataset.wired) {
      friendSearchResults.dataset.wired = '1';
      friendSearchResults.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-add-friend]');
        if (!btn) return;
        const target = btn.getAttribute('data-add-friend');
        sendFriendRequest(user.uid, target).catch((e) =>
          console.warn('send friend request failed', e),
        );
      });
    }

    if (profileStatus) {
      profileStatus.textContent = isFriend
        ? 'Amigos'
        : friendStatus?.status === 'pending'
          ? 'Solicitud pendiente'
          : 'No son amigos';
    }

    if (btnChat) {
      btnChat.href = `mensajes.html?chat=${encodeURIComponent(targetUid)}`;
      const enabled = isFriend && canMessage;
      btnChat.style.pointerEvents = enabled ? '' : 'none';
      btnChat.style.opacity = enabled ? '' : '0.5';
    }

    if (btnAdd) {
      const canAdd =
        targetUid !== user.uid &&
        profile.allowFriendRequests !== false &&
        !isFriend &&
        friendStatus?.status !== 'pending';
      btnAdd.disabled = !canAdd;
      btnAdd.addEventListener('click', async () => {
        await sendFriendRequest(user.uid, targetUid);
      });
    }

    if (btnBlock) {
      let isBlocked = blockedInfo.blockedByMe;
      btnBlock.disabled = targetUid === user.uid;
      btnBlock.textContent = isBlocked ? 'Desbloquear' : 'Bloquear';
      btnBlock.addEventListener('click', async () => {
        if (targetUid === user.uid) return;
        if (isBlocked) {
          await unblockUser(user.uid, targetUid);
          isBlocked = false;
          btnBlock.textContent = 'Bloquear';
          setMsg('Usuario desbloqueado.');
        } else {
          await blockUser(user.uid, targetUid);
          isBlocked = true;
          btnBlock.textContent = 'Desbloquear';
        }
      });
    }
  } catch (e) {
    console.error('[perfil]', e);
    if (profileStatus) profileStatus.textContent = 'Error al cargar.';
  }
});
