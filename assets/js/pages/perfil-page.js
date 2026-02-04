import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  query,
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
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
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
  await setDoc(doc(db, 'friend_requests', `${myUid}__${targetUid}`), {
    fromUid: myUid,
    toUid: targetUid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  setMsg('Solicitud enviada.');
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

    if (profileStatus) {
      profileStatus.textContent = isFriend
        ? 'Amigos'
        : friendStatus?.status === 'pending'
          ? 'Solicitud pendiente'
          : 'No son amigos';
    }

    if (btnChat) {
      btnChat.href = `espanel.html?chat=${encodeURIComponent(targetUid)}`;
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
