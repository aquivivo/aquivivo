
import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  collection,
  collectionGroup,
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
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
const avatarFallback = $('profileAvatarFallback');
const avatarEdit = $('profileAvatarEdit');
const avatarEditImg = $('profileAvatarEditImg');
const avatarEditFallback = $('profileAvatarEditFallback');
const avatarInput = $('avatarInput');
const avatarUploadBtn = $('avatarUploadBtn');
const avatarUploadHint = $('avatarUploadHint');
const basicName = $('basicName');
const basicHandle = $('basicHandle');
const basicSaveBtn = $('basicSaveBtn');
const basicSaveMsg = $('basicSaveMsg');

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

const infoWhy = $('infoWhy');
const infoHard = $('infoHard');
const infoGoal = $('infoGoal');
const infoSaveBtn = $('infoSaveBtn');
const infoSaveMsg = $('infoSaveMsg');

const privacyPosts = $('privacyPosts');
const privacyRewards = $('privacyRewards');
const privacyStatus = $('privacyStatus');
const privacyFriendReq = $('privacyFriendReq');
const privacyMessages = $('privacyMessages');
const privacyPublic = $('privacyPublic');

const rewardsGrid = $('rewardsGrid');
const rewardDetail = $('rewardDetail');
const rewardStreak = $('rewardStreak');
const rewardBadges = $('rewardBadges');
const rewardDays = $('rewardDays');
const rewardConsistency = $('rewardConsistency');

const coursesList = $('coursesList');

const friendsCount = $('friendsCount');
const recentReactions = $('recentReactions');
const suggestionsList = $('suggestionsList');
const inviteFriendsBtn = $('inviteFriendsBtn');

const invitesHint = $('invitesHint');
const invitesList = $('invitesList');

const tabButtons = $$('.profile-tab-btn');
const tabPanels = $$('.profile-tab');

const statStreak = $('statStreak');
const statExp = $('statExp');
const statLeague = $('statLeague');
const statTop3 = $('statTop3');

let FEED_ITEMS = [];
let feedUnsub = null;
const COMMENTS_CACHE = new Map();
const COMMENTS_OPEN = new Set();

const storage = getStorage();
let CURRENT_USER_DOC = null;
let CURRENT_PROFILE = null;

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeId(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '_');
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
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(ts) {
  const date = toDateValue(ts);
  if (!date) return '';
  try {
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '';
  }
}

function withinMinutes(ts, minutes) {
  const date = toDateValue(ts);
  if (!date) return false;
  return Date.now() - date.getTime() <= minutes * 60 * 1000;
}

function normalizeHandle(value) {
  return String(value || '').trim().toLowerCase();
}

function isHandleValid(value) {
  return /^[a-z0-9._-]{3,20}$/.test(value || '');
}

function getAllowedLevels(docData) {
  if (!docData) return ['A1'];
  if (docData.admin === true || String(docData.role || '') === 'admin') {
    return ['A1', 'A2', 'B1', 'B2'];
  }
  const until = toDateValue(docData.accessUntil);
  const active = until && until.getTime() > Date.now();
  if (!active) return ['A1'];
  if (docData.access === true || String(docData.plan || '').toLowerCase() === 'premium') {
    return ['A1', 'A2', 'B1', 'B2'];
  }
  if (Array.isArray(docData.levels) && docData.levels.length) {
    return docData.levels.map((lvl) => String(lvl).toUpperCase());
  }
  return ['A1'];
}

function setStatusHint(text) {
  if (!statusHint) return;
  statusHint.textContent = text || '';
}

function setInfoMsg(text) {
  if (!infoSaveMsg) return;
  infoSaveMsg.textContent = text || '';
}

function setBasicMsg(text) {
  if (!basicSaveMsg) return;
  basicSaveMsg.textContent = text || '';
}

function setMsg(text, bad = false) {
  if (!profileMsg) return;
  profileMsg.textContent = text || '';
  profileMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
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

function applyActiveTab(tab) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${tab}`);
  });
  try {
    localStorage.setItem('av_profile_tab', tab);
  } catch {
    // ignore
  }
}

function initTabs() {
  if (!tabButtons.length) return;
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyActiveTab(btn.dataset.tab));
  });
  const saved = localStorage.getItem('av_profile_tab');
  if (saved) applyActiveTab(saved);
}

function renderAvatar(url, name) {
  if (!avatarWrap || !avatarImg) return;
  const letter = (name || 'U').trim()[0]?.toUpperCase() || 'U';
  if (avatarFallback) avatarFallback.textContent = letter;
  if (statusAvatarFallback) statusAvatarFallback.textContent = letter;
  if (avatarEditFallback) avatarEditFallback.textContent = letter;
  if (url) {
    avatarImg.src = url;
    avatarWrap.classList.add('hasImage');
    if (avatarEdit) avatarEdit.classList.add('hasImage');
    if (avatarEditImg) {
      avatarEditImg.src = url;
      avatarEditImg.style.display = 'block';
    }
    if (statusAvatarImg) {
      statusAvatarImg.src = url;
      statusAvatarImg.style.display = 'block';
    }
    if (statusAvatar) statusAvatar.classList.add('nav-avatar--img');
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
    if (avatarEdit) avatarEdit.classList.remove('hasImage');
    if (avatarEditImg) {
      avatarEditImg.removeAttribute('src');
      avatarEditImg.style.display = 'none';
    }
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

function renderFeed(list, ctx) {
  if (!feedList) return;
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

  feedList.innerHTML = sorted
    .map((post) => {
      const isMine = post.authorUid && ctx.myUid && post.authorUid === ctx.myUid;
      const canEdit = isMine && withinMinutes(post.createdAt, 10);
      const tags = Array.isArray(post.tags) ? post.tags : [];
      const postKey = safeId(post.id);
      const comments = COMMENTS_CACHE.get(post.id) || [];
      const isOpen = COMMENTS_OPEN.has(post.id);
      const commentsHtml = comments.length
        ? comments
            .map((c) => {
              const isOwner = c.authorUid === ctx.myUid;
              const canEditComment = isOwner && withinMinutes(c.createdAt, 10);
              return `
                <div class="comment-item" data-comment-id="${esc(c.id)}">
                  <div class="comment-meta">
                    <span>${esc(c.authorName || 'Usuario')}</span>
                    <span>${formatTime(c.createdAt)}</span>
                  </div>
                  <div class="comment-text">${esc(c.text || '')}</div>
                  ${
                    isOwner
                      ? `<div class="comment-actions">
                          ${
                            canEditComment
                              ? `<button class="btn-white-outline" data-comment-action="edit" data-post-id="${esc(
                                  post.id,
                                )}" data-comment-id="${esc(c.id)}">Editar</button>`
                              : ''
                          }
                          <button class="btn-white-outline" data-comment-action="delete" data-post-id="${esc(
                            post.id,
                          )}" data-comment-id="${esc(c.id)}">Eliminar</button>
                        </div>`
                      : ''
                  }
                </div>
              `;
            })
            .join('')
        : '<div class="muted">Sin comentarios todavía.</div>';

      const commentForm = ctx.canComment
        ? `
            <div class="comment-form">
              <input class="input" id="commentInput_${postKey}" placeholder="Escribe un comentario..." />
              <button class="btn-white-outline" data-comment="send" data-id="${esc(post.id)}">Enviar</button>
            </div>
          `
        : '<div class="muted" style="margin-top:8px">Solo amigos pueden comentar.</div>';

      return `
        <div class="post-card post-card--${esc(post.type || 'user')}">
          <div class="post-head">
            <div class="post-title">${esc(post.authorName || 'AquiVivo')}</div>
            <div class="post-time">${formatTime(post.createdAt)}</div>
          </div>
          <div class="post-body">${esc(post.text || '')}</div>
          ${
            tags.length
              ? `<div class="post-meta">${tags.map((t) => `<span>• ${esc(t)}</span>`).join('')}</div>`
              : ''
          }
          <div class="post-reactions">
            <button type="button" data-reaction="heart" data-id="${esc(post.id)}">❤️</button>
            <button type="button" data-reaction="fire" data-id="${esc(post.id)}">🔥</button>
            <button type="button" data-reaction="spark" data-id="${esc(post.id)}">✨</button>
          </div>
          <div class="post-actions">
            ${
              canEdit
                ? `<button class="btn-white-outline" data-action="edit" data-id="${esc(
                    post.id,
                  )}">Editar</button>`
                : ''
            }
            ${
              isMine
                ? `<button class="btn-white-outline" data-action="delete" data-id="${esc(
                    post.id,
                  )}">Eliminar</button>`
                : ''
            }
            <button class="btn-white-outline" data-comment="toggle" data-id="${esc(post.id)}">
              Comentarios (${comments.length})
            </button>
          </div>
          <div class="post-comments" id="comments_${postKey}" style="display:${
        isOpen ? 'block' : 'none'
      };"><div class="comment-list" id="commentsList_${postKey}">${commentsHtml}</div>${commentForm}</div>
        </div>
      `;
    })
    .join('');
}

async function loadComments(targetUid, postId) {
  const snap = await getDocs(
    query(
      collection(db, 'user_feed', targetUid, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(40),
    ),
  );
  const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
  COMMENTS_CACHE.set(postId, items);
}

async function toggleComments(targetUid, postId) {
  if (!postId) return;
  const isOpen = COMMENTS_OPEN.has(postId);
  if (isOpen) {
    COMMENTS_OPEN.delete(postId);
    return;
  }
  if (!COMMENTS_CACHE.has(postId)) {
    await loadComments(targetUid, postId);
  }
  COMMENTS_OPEN.add(postId);
}

async function sendComment(targetUid, postId, myUid, myName, text) {
  if (!text) return;
  await addDoc(collection(db, 'user_feed', targetUid, 'posts', postId, 'comments'), {
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    authorUid: myUid,
    authorName: myName || 'Usuario',
    postOwnerUid: targetUid,
  });
  await loadComments(targetUid, postId);
}

async function editComment(targetUid, postId, commentId, text) {
  if (!text) return;
  await updateDoc(doc(db, 'user_feed', targetUid, 'posts', postId, 'comments', commentId), {
    text,
    editedAt: serverTimestamp(),
  });
  await loadComments(targetUid, postId);
}

async function deleteComment(targetUid, postId, commentId) {
  await deleteDoc(doc(db, 'user_feed', targetUid, 'posts', postId, 'comments', commentId));
  await loadComments(targetUid, postId);
}

async function sendReaction(targetUid, postId, myUid, myName, type) {
  if (!postId || !type) return;
  const ref = doc(db, 'user_feed', targetUid, 'posts', postId, 'reactions', `${myUid}__${type}`);
  await setDoc(ref, {
    type,
    userId: myUid,
    userName: myName || 'Usuario',
    createdAt: serverTimestamp(),
    postOwnerUid: targetUid,
  });
}

function subscribeFeed(targetUid, ctx) {
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
      const items = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
        .filter((p) => ['user', 'system'].includes(p.type || 'user'));
      const hasPinned = items.some((p) => p.pinned);
      if (!hasPinned) {
        items.unshift({
          id: 'sys_pinned_local',
          type: 'system',
          text: 'Tu progreso aparece aquí. Sigue aprendiendo 🔥',
          createdAt: new Date(),
          pinned: true,
        });
      }
      FEED_ITEMS = items;
      renderFeed(FEED_ITEMS, ctx);
    },
    (err) => {
      console.warn('feed snapshot failed', err);
      renderFeed([], ctx);
    },
  );
}

function bindStatusComposer(ctx) {
  if (!statusCard) return;
  if (!ctx.isOwner) {
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

  statusPostBtn.addEventListener('click', async () => {
    const text = statusInput.value.trim();
    if (!text) return;
    const tags = collectTags();
    const post = {
      type: 'user',
      text,
      createdAt: serverTimestamp(),
      editedAt: null,
      authorUid: ctx.myUid,
      authorName: ctx.displayName || 'Usuario',
      tags,
    };
    try {
      await addDoc(collection(db, 'user_feed', ctx.myUid, 'posts'), post);
      statusInput.value = '';
      if (statusMinutes) statusMinutes.value = '';
      if (statusCourse) statusCourse.value = '';
      statusMood?.classList.remove('active');
      statusMotivation?.classList.remove('active');
      updateBtn();
      setStatusHint('Publicado ✅');
      playHeart();
      setTimeout(() => setStatusHint(''), 2000);
    } catch (e) {
      console.warn('add post failed', e);
      setStatusHint('No se pudo publicar.');
    }
  });
}

function bindFeedActions(ctx) {
  if (!feedList || feedList.dataset.wired) return;
  feedList.dataset.wired = '1';

  feedList.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      const id = actionBtn.getAttribute('data-id');
      const action = actionBtn.getAttribute('data-action');
      const idx = FEED_ITEMS.findIndex((p) => p.id === id);
      if (idx < 0) return;

      if (action === 'delete') {
        await deleteDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id));
        return;
      }

      if (action === 'edit') {
        const post = FEED_ITEMS[idx];
        const updated = prompt('Editar tu estado:', post.text || '');
        if (updated && updated.trim()) {
          await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id), {
            text: updated.trim(),
            editedAt: serverTimestamp(),
          });
        }
        return;
      }
    }

    const toggleBtn = event.target.closest('[data-comment="toggle"]');
    if (toggleBtn) {
      const postId = toggleBtn.getAttribute('data-id');
      await toggleComments(ctx.targetUid, postId);
      renderFeed(FEED_ITEMS, ctx);
      return;
    }

    const sendBtn = event.target.closest('[data-comment="send"]');
    if (sendBtn) {
      const postId = sendBtn.getAttribute('data-id');
      const input = document.getElementById(`commentInput_${safeId(postId)}`);
      const value = input?.value?.trim() || '';
      if (!value) return;
      await sendComment(ctx.targetUid, postId, ctx.myUid, ctx.displayName, value);
      if (input) input.value = '';
      renderFeed(FEED_ITEMS, ctx);
      await loadRecentReactions(ctx.targetUid);
      return;
    }

    const commentAction = event.target.closest('[data-comment-action]');
    if (commentAction) {
      const postId = commentAction.getAttribute('data-post-id');
      const commentId = commentAction.getAttribute('data-comment-id');
      const type = commentAction.getAttribute('data-comment-action');
      if (!postId || !commentId) return;
      if (type === 'delete') {
        await deleteComment(ctx.targetUid, postId, commentId);
        renderFeed(FEED_ITEMS, ctx);
        await loadRecentReactions(ctx.targetUid);
        return;
      }
      if (type === 'edit') {
        const current = (COMMENTS_CACHE.get(postId) || []).find((c) => c.id === commentId);
        const updated = prompt('Editar comentario:', current?.text || '');
        if (updated && updated.trim()) {
          await editComment(ctx.targetUid, postId, commentId, updated.trim());
          renderFeed(FEED_ITEMS, ctx);
          await loadRecentReactions(ctx.targetUid);
        }
        return;
      }
    }

    const reactionBtn = event.target.closest('[data-reaction]');
    if (reactionBtn) {
      const postId = reactionBtn.getAttribute('data-id');
      const type = reactionBtn.getAttribute('data-reaction');
      await sendReaction(ctx.targetUid, postId, ctx.myUid, ctx.displayName, type);
      await loadRecentReactions(ctx.targetUid);
    }
  });
}

async function fetchPublicUser(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'public_users', uid));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
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
  await loadFriendCount(myUid);
}

async function loadFriendCount(uid) {
  if (!friendsCount) return new Set();
  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('fromUid', '==', uid),
          where('status', '==', 'accepted'),
        ),
      ),
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('toUid', '==', uid),
          where('status', '==', 'accepted'),
        ),
      ),
    ]);
    const ids = new Set();
    fromSnap.forEach((docSnap) => ids.add(docSnap.data().toUid));
    toSnap.forEach((docSnap) => ids.add(docSnap.data().fromUid));
    friendsCount.textContent = String(ids.size);
    return ids;
  } catch (e) {
    console.warn('friends count failed', e);
    friendsCount.textContent = '0';
    return new Set();
  }
}

async function loadSuggestions(myUid, excludeSet) {
  if (!suggestionsList) return;
  suggestionsList.innerHTML = '<div class="muted">Cargando...</div>';
  try {
    const snap = await getDocs(
      query(collection(db, 'public_users'), orderBy('exp', 'desc'), limit(8)),
    );
    const items = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((item) => item.id !== myUid && !excludeSet.has(item.id));
    if (!items.length) {
      suggestionsList.innerHTML = '<div class="muted">Sin sugerencias por ahora.</div>';
      return;
    }
    suggestionsList.innerHTML = '';
    items.slice(0, 5).forEach((item) => {
      const name = item.displayName || item.handle || 'Usuario';
      const handle = item.handle ? `@${item.handle}` : '';
      const row = document.createElement('div');
      row.className = 'friendItem';
      row.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:800">${esc(name)}</div>
          <div class="muted">${esc(handle)}</div>
        </div>
        <button class="btn-white-outline" data-add-friend="${esc(item.id)}">Seguir</button>
      `;
      suggestionsList.appendChild(row);
    });
  } catch (e) {
    console.warn('suggestions failed', e);
    suggestionsList.innerHTML = '<div class="muted">No se pudieron cargar sugerencias.</div>';
  }
}

async function loadRecentReactions(targetUid) {
  if (!recentReactions) return;
  recentReactions.textContent = 'Cargando...';
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, 'reactions'),
        where('postOwnerUid', '==', targetUid),
        orderBy('createdAt', 'desc'),
        limit(5),
      ),
    );
    if (snap.empty) {
      recentReactions.textContent = 'Sin reacciones aún.';
      return;
    }
    const names = snap.docs.map((docSnap) => docSnap.data()?.userName || 'Usuario');
    recentReactions.innerHTML = names.map((n) => `<div>❤️ ${esc(n)}</div>`).join('');
  } catch (e) {
    if (String(e?.code || '') === 'permission-denied') {
      recentReactions.textContent = 'Reacciones ocultas.';
      return;
    }
    console.warn('recent reactions failed', e);
    recentReactions.textContent = 'Sin reacciones aún.';
  }
}

function renderRewards(profile) {
  if (rewardStreak) rewardStreak.textContent = `${Number(profile.streakDays || profile.streak || 0)} días`;
  if (rewardBadges) rewardBadges.textContent = String((profile.badges || []).length || 0);
  if (rewardDays) rewardDays.textContent = `${Number(profile.studyDays || profile.daysLearned || 0)} días`;
  if (rewardConsistency) rewardConsistency.textContent = `${Number(profile.consistencyPct || 0)}%`;
}

function bindRewards() {
  if (!rewardsGrid || !rewardDetail) return;
  rewardsGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.achievement-card');
    if (!card) return;
    const key = card.dataset.achievement || '';
    const dateLabel = rewardDetail.dataset.date || '';
    const map = {
      racha: 'Racha: ¡cada día suma! Aquí verás tu nivel y la última fecha activa.',
      insignias: 'Insignias: premios por completar temas y retos.',
      dias: 'Días de aprendizaje: cuenta total de días con actividad.',
      constancia: 'Constancia: promedio de estudio en la última semana.',
    };
    rewardDetail.textContent = `${map[key] || 'Detalle de tu logro.'}${dateLabel ? ` · ${dateLabel}` : ''}`;
  });
}

async function uploadAvatar(uid, emailLower, file) {
  if (!uid || !file) return null;
  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/avatar_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  const updates = {
    photoURL: url,
    photoPath: filePath,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, 'users', uid), updates);
  await setDoc(doc(db, 'public_users', uid), {
    photoURL: url,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { url, path: filePath };
}

function setAvatarHint(text) {
  if (!avatarUploadHint) return;
  avatarUploadHint.textContent = text || '';
}

function bindAvatarUpload(uid, emailLower, isOwner) {
  if (!avatarUploadBtn || !avatarInput) return;
  if (!isOwner) {
    avatarUploadBtn.style.display = 'none';
    return;
  }
  avatarUploadBtn.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      avatarUploadBtn.disabled = true;
      setAvatarHint('Subiendo...');
      const result = await uploadAvatar(uid, emailLower, file);
      if (result?.url) {
        renderAvatar(result.url, basicName?.value || profileName?.textContent || '');
        setAvatarHint('Foto actualizada ✅');
      }
    } catch (err) {
      console.warn('avatar upload failed', err);
      setAvatarHint('No se pudo subir la foto.');
    } finally {
      avatarUploadBtn.disabled = false;
      avatarInput.value = '';
      setTimeout(() => setAvatarHint(''), 2000);
    }
  });
}

async function loadCourseProgress(uid, levelsToShow) {
  if (!coursesList) return;
  coursesList.innerHTML = '<div class="muted">Cargando cursos...</div>';
  try {
    const levelSet = levelsToShow?.length ? levelsToShow : ['A1', 'A2', 'B1', 'B2'];
    const courseSnap = await getDocs(
      query(collection(db, 'courses'), where('level', 'in', levelSet)),
    );
    const totals = {};
    courseSnap.forEach((docSnap) => {
      const level = docSnap.data()?.level || '';
      totals[level] = (totals[level] || 0) + 1;
    });

    const progressSnap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const completed = {};
    progressSnap.forEach((docSnap) => {
      const key = docSnap.id || '';
      const level = key.split('__')[0] || '';
      if (!levelSet.includes(level)) return;
      if (docSnap.data()?.completed === true) {
        completed[level] = (completed[level] || 0) + 1;
      }
    });

    const rows = levelSet.map((level) => {
      const total = totals[level] || 0;
      const done = completed[level] || 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { level, total, done, pct };
    });

    coursesList.innerHTML = rows
      .map((row) => {
        const label = row.total ? `${row.done}/${row.total}` : '0/0';
        const cta = row.pct > 0 ? 'Continuar' : 'Explorar';
        return `
          <div class="course-row">
            <div class="course-info">
              <div class="course-title">${esc(row.level)}</div>
              <div class="muted">${esc(label)} completados</div>
            </div>
            <div class="course-progress">
              <div class="progress-bar"><div class="progress-fill" style="width:${row.pct}%"></div></div>
              <div class="progress-percent">${row.pct}%</div>
              <a class="btn-white-outline" href="course.html?level=${encodeURIComponent(row.level)}">${cta}</a>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (e) {
    console.warn('course progress failed', e);
    coursesList.innerHTML = '<div class="muted">No se pudieron cargar los cursos.</div>';
  }
}

async function claimHandle(uid, handleLower, emailLower) {
  if (!uid || !handleLower) return;
  const ref = doc(db, 'login_index', handleLower);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.uid && snap.data()?.uid !== uid) {
    throw new Error('handle_taken');
  }
  await setDoc(
    ref,
    {
      uid,
      handleLower,
      emailLower: emailLower || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function releaseHandle(uid, handleLower) {
  if (!uid || !handleLower) return;
  const ref = doc(db, 'login_index', handleLower);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.uid === uid) {
    await deleteDoc(ref);
  }
}

async function saveProfileInfo(uid) {
  if (!uid) return;
  const displayName = basicName?.value?.trim() || '';
  const handle = basicHandle?.value?.trim() || '';
  const handleLower = normalizeHandle(handle);
  if (handle && !isHandleValid(handleLower)) {
    setBasicMsg('Usuario inválido. Usa 3-20 letras/números y ._-');
    return;
  }
  const updates = {
    bioWhy: infoWhy?.value?.trim() || '',
    bioHard: infoHard?.value?.trim() || '',
    bioGoal: infoGoal?.value?.trim() || '',
    displayName: displayName || null,
    handle: handle || null,
    handleLower: handleLower || null,
    postsVisibility: privacyPosts?.value || 'public',
    rewardsVisibility: privacyRewards?.value || 'public',
    statusVisibility: privacyStatus?.value || 'public',
    publicProfile: privacyPublic?.value !== 'false',
    allowFriendRequests: privacyFriendReq?.value !== 'false',
    allowMessages: privacyMessages?.value !== 'false',
    updatedAt: serverTimestamp(),
  };
  try {
    if (handleLower && handleLower !== CURRENT_PROFILE?.handleLower) {
      await claimHandle(uid, handleLower, CURRENT_USER_DOC?.emailLower);
      if (CURRENT_PROFILE?.handleLower) {
        await releaseHandle(uid, CURRENT_PROFILE.handleLower);
      }
    }
    await setDoc(doc(db, 'public_users', uid), updates, { merge: true });
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName || null,
      handle: handle || null,
      handleLower: handleLower || null,
      publicProfile: updates.publicProfile,
      allowFriendRequests: updates.allowFriendRequests,
      allowMessages: updates.allowMessages,
      updatedAt: serverTimestamp(),
    });
    setInfoMsg('Guardado ✅');
    setBasicMsg('Guardado ✅');
    setTimeout(() => {
      setInfoMsg('');
      setBasicMsg('');
    }, 2000);
  } catch (e) {
    console.warn('save profile info failed', e);
    if (String(e?.message || '').includes('handle_taken')) {
      setBasicMsg('Este usuario ya existe.');
    } else {
      setInfoMsg('No se pudo guardar.');
      setBasicMsg('No se pudo guardar.');
    }
  }
}

function bindInfoSave(uid, isOwner) {
  if (!isOwner) {
    if (infoSaveBtn) infoSaveBtn.style.display = 'none';
    if (basicSaveBtn) basicSaveBtn.style.display = 'none';
    return;
  }
  infoSaveBtn?.addEventListener('click', () => saveProfileInfo(uid));
  basicSaveBtn?.addEventListener('click', () => saveProfileInfo(uid));
}

function applyInfo(profile, isOwner) {
  if (infoWhy) infoWhy.value = profile.bioWhy || '';
  if (infoHard) infoHard.value = profile.bioHard || '';
  if (infoGoal) infoGoal.value = profile.bioGoal || '';
  if (basicName) basicName.value = profile.displayName || profile.name || '';
  if (basicHandle) basicHandle.value = profile.handle || '';

  if (!isOwner) {
    [infoWhy, infoHard, infoGoal, basicName, basicHandle].forEach((el) => {
      if (el) el.setAttribute('readonly', 'readonly');
    });
  }

  if (privacyPosts) privacyPosts.value = profile.postsVisibility || 'public';
  if (privacyRewards) privacyRewards.value = profile.rewardsVisibility || 'public';
  if (privacyStatus) privacyStatus.value = profile.statusVisibility || 'public';
  if (privacyFriendReq)
    privacyFriendReq.value = profile.allowFriendRequests === false ? 'false' : 'true';
  if (privacyMessages) privacyMessages.value = profile.allowMessages === false ? 'false' : 'true';
  if (privacyPublic) privacyPublic.value = profile.publicProfile === false ? 'false' : 'true';

  if (!isOwner) {
    [privacyPosts, privacyRewards, privacyStatus, privacyFriendReq, privacyMessages, privacyPublic].forEach(
      (el) => {
        if (el) el.setAttribute('disabled', 'disabled');
      },
    );
  }
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
    const [profileSnap, blockedInfo, currentSnap] = await Promise.all([
      getDoc(doc(db, 'public_users', targetUid)),
      isBlockedPair(user.uid, targetUid),
      getDoc(doc(db, 'users', user.uid)),
    ]);

    if (!profileSnap.exists()) {
      if (profileStatus) profileStatus.textContent = 'Perfil no encontrado.';
      return;
    }

    const profile = profileSnap.data() || {};
    CURRENT_PROFILE = profile;
    CURRENT_USER_DOC = currentSnap.exists() ? currentSnap.data() : null;
    const isAdminUser =
      CURRENT_USER_DOC?.role === 'admin' || CURRENT_USER_DOC?.admin === true;
    const name = profile.displayName || profile.name || 'Usuario';
    const isOwner = user.uid === targetUid;

    if (profileName) profileName.textContent = name;
    if (profileHandle) profileHandle.textContent = profile.handle ? `@${profile.handle}` : '';
    renderAvatar(profile.photoURL || '', name);

    if (statStreak) statStreak.textContent = Number(profile.streakDays || profile.streak || 0);
    if (statExp) statExp.textContent = Number(profile.exp || 0);
    if (statLeague) statLeague.textContent = profile.league || '—';
    if (statTop3) statTop3.textContent = Number(profile.top3 || 0);

    renderRewards(profile);
    if (rewardDetail) {
      rewardDetail.dataset.date = formatDate(profile.updatedAt || profile.createdAt || new Date());
    }
    bindRewards();

    applyInfo(profile, isOwner);
    bindInfoSave(user.uid, isOwner);
    bindAvatarUpload(targetUid, CURRENT_USER_DOC?.emailLower, isOwner);

    const friendStatus = await getFriendStatus(user.uid, targetUid);
    const isFriend = friendStatus?.status === 'accepted';
    const canMessage = profile.allowMessages !== false;

    const publicProfile = profile.publicProfile !== false;
    const postsVisibility = profile.postsVisibility || (publicProfile ? 'public' : 'private');
    const rewardsVisibility = profile.rewardsVisibility || 'public';
    const canViewFeed =
      isOwner ||
      postsVisibility === 'public' ||
      (postsVisibility === 'friends' && isFriend);

    if (!isOwner && !publicProfile && !isFriend) {
      if (profileStatus) profileStatus.textContent = 'Perfil privado.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.classList.add('disabled');
      if (btnBlock) btnBlock.disabled = true;
      return;
    }

    if (blockedInfo.blockedByOther) {
      if (profileStatus) profileStatus.textContent = 'No puedes interactuar.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.style.pointerEvents = 'none';
    }

    const ctx = {
      myUid: user.uid,
      targetUid,
      displayName: name,
      isOwner,
      canComment: isOwner || isFriend,
    };

    if (!canViewFeed && postsVisibility === 'private' && !isOwner) {
      if (feedList) feedList.innerHTML = '<div class="card muted">Las publicaciones están ocultas.</div>';
      if (statusCard) statusCard.style.display = 'none';
    } else if (!canViewFeed && postsVisibility === 'friends' && !isOwner && !isFriend) {
      if (feedList)
        feedList.innerHTML = '<div class="card muted">Solo amigos pueden ver este feed.</div>';
      if (statusCard) statusCard.style.display = 'none';
    } else {
      subscribeFeed(targetUid, ctx);
      bindFeedActions(ctx);
      bindStatusComposer(ctx);
    }

    if (rewardsVisibility === 'private' && !isOwner) {
      const rewardsTab = $('tab-rewards');
      if (rewardsTab) rewardsTab.innerHTML = '<div class="card muted">Las recompensas están ocultas.</div>';
    }

    if (user.uid === targetUid) {
      loadInvites(user.uid);
    } else if (invitesList) {
      invitesList.innerHTML = '';
      if (invitesHint) invitesHint.textContent = 'Solo visible en tu perfil.';
    }

    const friendSet = (await loadFriendCount(targetUid)) || new Set();
    if (canViewFeed) {
      await loadRecentReactions(targetUid);
    } else if (recentReactions) {
      recentReactions.textContent = 'Reacciones ocultas.';
    }
    await loadSuggestions(user.uid, friendSet);

    if (isOwner || isAdminUser) {
      const levelsToShow = getAllowedLevels(CURRENT_USER_DOC);
      await loadCourseProgress(targetUid, levelsToShow);
    } else if (coursesList) {
      coursesList.innerHTML =
        '<div class="muted">El progreso detallado solo es visible en tu propio perfil.</div>';
    }

    if (suggestionsList && !suggestionsList.dataset.wired) {
      suggestionsList.dataset.wired = '1';
      suggestionsList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-add-friend]');
        if (!btn) return;
        const target = btn.getAttribute('data-add-friend');
        sendFriendRequest(user.uid, target).catch((e) => console.warn('send friend request failed', e));
      });
    }

    if (invitesList && !invitesList.dataset.wired) {
      invitesList.dataset.wired = '1';
      invitesList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-invite]');
        if (!btn) return;
        const action = btn.getAttribute('data-invite');
        const id = btn.getAttribute('data-id');
        handleInviteAction(user.uid, id, action).catch((e) => console.warn('invite action failed', e));
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
      const enabled = (isFriend || isOwner) && canMessage;
      btnChat.style.pointerEvents = enabled ? '' : 'none';
      btnChat.style.opacity = enabled ? '' : '0.5';
      if (isOwner) btnChat.style.display = 'none';
    }

    if (btnAdd) {
      const canAdd =
        targetUid !== user.uid &&
        profile.allowFriendRequests !== false &&
        !isFriend &&
        friendStatus?.status !== 'pending';
      btnAdd.disabled = !canAdd;
      if (isOwner) btnAdd.style.display = 'none';
      if (!btnAdd.dataset.wired) {
        btnAdd.dataset.wired = '1';
        btnAdd.addEventListener('click', async () => {
          await sendFriendRequest(user.uid, targetUid);
        });
      }
    }

    if (btnBlock) {
      let isBlocked = blockedInfo.blockedByMe;
      btnBlock.disabled = targetUid === user.uid;
      if (isOwner) btnBlock.style.display = 'none';
      btnBlock.textContent = isBlocked ? 'Desbloquear' : 'Bloquear';
      if (!btnBlock.dataset.wired) {
        btnBlock.dataset.wired = '1';
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
    }
  } catch (e) {
    console.error('[perfil]', e);
    if (profileStatus) profileStatus.textContent = 'Error al cargar.';
  }
});

initTabs();
