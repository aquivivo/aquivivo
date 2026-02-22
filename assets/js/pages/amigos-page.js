import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const myRefCode = $('myRefCode');
const btnCopyMyRefCode = $('btnCopyMyRefCode');
const myRefInfo = $('myRefInfo');
const useRefCode = $('useRefCode');
const btnApplyRefCode = $('btnApplyRefCode');
const applyRefStatus = $('applyRefStatus');
const refStatInvites = $('refStatInvites');
const refStatRewards = $('refStatRewards');
const refRewardsList = $('refRewardsList');
const refRewardsActions = $('refRewardsActions');
const friendInvitesHint = $('friendInvitesHint');
const friendInvitesList = $('friendInvitesList');

let invitesUnsub = null;

function setInlineStatus(el, text, kind = 'ok') {
  if (!el) return;
  el.textContent = text || '';
  el.style.color =
    kind === 'bad'
      ? '#ffd1d7'
      : kind === 'warn'
        ? '#ffe08a'
        : 'rgba(255,255,255,0.92)';
}

function normCode(v) {
  return String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function genRefCode(baseRaw) {
  const base =
    String(baseRaw || 'AQUIVIVO')
      .split('@')[0]
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 6) || 'AQUIVI';

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${base}-${suffix}`;
}

function avatarLetter(name) {
  const safe = String(name || '').trim();
  if (!safe) return 'U';
  const parts = safe.split(/\s+/).filter(Boolean);
  const letters = parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return letters || 'U';
}

async function getPublicProfile(uid) {
  const id = String(uid || '').trim();
  if (!id) return {};
  try {
    const snap = await getDoc(doc(db, 'public_users', id));
    return snap.exists() ? snap.data() || {} : {};
  } catch {
    return {};
  }
}

function renderFriendInvites(items) {
  if (!friendInvitesList) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    friendInvitesList.innerHTML = '<div class="muted">Sin solicitudes pendientes.</div>';
    return;
  }
  friendInvitesList.innerHTML = list
    .map((item) => {
      const name = String(item.name || 'Usuario').trim();
      const handle = String(item.handle || '').trim();
      const handleLine = handle ? `<div class="friendHint">@${handle}</div>` : '';
      return `
        <div class="friendItem">
          <div class="friendMeta">
            <span class="friendAvatar">${avatarLetter(name)}</span>
            <div>
              <div class="friendName">${name}</div>
              ${handleLine}
            </div>
          </div>
          <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
            <button class="btn-yellow" type="button" data-invite-action="accept" data-invite-id="${item.id}">Aceptar</button>
            <button class="btn-white-outline" type="button" data-invite-action="decline" data-invite-id="${item.id}">Rechazar</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function startFriendInvitesListener(uid) {
  if (!friendInvitesList || !friendInvitesHint) return;
  const userId = String(uid || '').trim();
  if (!userId) return;

  if (invitesUnsub) {
    try {
      invitesUnsub();
    } catch {}
    invitesUnsub = null;
  }

  friendInvitesHint.textContent = 'Cargando...';
  friendInvitesList.innerHTML = '';

  const qInv = query(collection(db, 'friend_requests'), where('toUid', '==', userId), limit(40));
  invitesUnsub = onSnapshot(
    qInv,
    async (snap) => {
      const rows = (snap.docs || [])
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((r) => String(r.status || '') === 'pending');

      if (!rows.length) {
        friendInvitesHint.textContent = 'No tienes invitaciones pendientes.';
        renderFriendInvites([]);
        return;
      }

      const enriched = await Promise.all(
        rows.map(async (r) => {
          const profile = await getPublicProfile(r.fromUid);
          return {
            ...r,
            name: profile?.displayName || profile?.name || 'Usuario',
            handle: profile?.handle || '',
          };
        }),
      );

      friendInvitesHint.textContent = '';
      renderFriendInvites(enriched);
    },
    () => {
      friendInvitesHint.textContent = 'No se pudieron cargar las invitaciones.';
      renderFriendInvites([]);
    },
  );
}

async function ensureUserDoc(user) {
  const uid = String(user?.uid || '').trim();
  if (!uid) return {};
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() || {};
  const email = String(user?.email || '').trim();
  const payload = {
    email,
    emailLower: email.toLowerCase(),
    admin: false,
    blocked: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return payload;
}

async function ensureMyRefCode(uid, userDoc) {
  const current = String(userDoc?.refCode || '').trim();
  if (current) return current;
  const code = genRefCode(userDoc?.displayName || userDoc?.email || uid);
  await updateDoc(doc(db, 'users', uid), {
    refCode: code,
    refCodeCreatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return code;
}

function renderMyRefCode(code) {
  if (!myRefCode) return;
  const value = String(code || '').trim();
  myRefCode.value = value;
  if (myRefInfo) myRefInfo.textContent = value ? 'Copialo y compartelo.' : 'El codigo se crea automaticamente.';
}

async function findUserByRefCode(code) {
  const q1 = query(collection(db, 'users'), where('refCode', '==', code), limit(1));
  const snap = await getDocs(q1);
  if (snap.empty) return null;
  return snap.docs[0];
}

async function applyReferralCode(myUid, myDoc) {
  const code = normCode(useRefCode?.value || '');
  if (!code) {
    setInlineStatus(applyRefStatus, 'Escribe un codigo.', 'warn');
    return;
  }

  if (myDoc?.referredByCode) {
    setInlineStatus(applyRefStatus, 'Ya tienes un codigo asociado a tu cuenta.', 'warn');
    return;
  }

  setInlineStatus(applyRefStatus, 'Verificando...');
  if (btnApplyRefCode) btnApplyRefCode.disabled = true;

  try {
    const ownerSnap = await findUserByRefCode(code);
    if (!ownerSnap) {
      setInlineStatus(applyRefStatus, 'No se encontro ese codigo.', 'bad');
      return;
    }

    const ownerUid = ownerSnap.id;
    if (ownerUid === myUid) {
      setInlineStatus(applyRefStatus, 'No puedes usar tu propio codigo.', 'bad');
      return;
    }

    await updateDoc(doc(db, 'users', myUid), {
      referredByUid: ownerUid,
      referredByCode: code,
      referralAppliedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'referrals'), {
      code,
      ownerUid,
      newUserUid: myUid,
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });

    setInlineStatus(applyRefStatus, 'Codigo asociado.', 'ok');
    if (useRefCode) useRefCode.value = '';
  } catch (e) {
    console.error('[amigos] apply referral failed', e);
    setInlineStatus(applyRefStatus, 'Error. Intentalo de nuevo.', 'bad');
  } finally {
    if (btnApplyRefCode) btnApplyRefCode.disabled = false;
  }
}

function genOneTimeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BONO-${suffix}`;
}

async function redeemReward(rewardId, rewardData) {
  if (!rewardId) return;
  const pct = Number(rewardData?.value || 0);
  const scope = String(rewardData?.scope || 'otros servicios');

  const ok = window.confirm(`Usar recompensa -${pct}% (${scope}) y generar cupon de un uso?`);
  if (!ok) return;

  const code = genOneTimeCode();
  await setDoc(
    doc(db, 'promo_codes', code),
    {
      code,
      kind: 'ONE_TIME',
      percent: pct,
      plan: 'reward',
      days: 0,
      usageLimit: 1,
      usedCount: 0,
      active: true,
      scope,
      source: 'REWARD',
      rewardId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await updateDoc(doc(db, 'rewards', rewardId), {
    status: 'USED',
    usedAt: serverTimestamp(),
    promoCode: code,
  });

  if (refRewardsActions) {
    refRewardsActions.innerHTML = `<span class="pill">Cupon generado: ${code}</span>`;
  }
}

async function loadReferralStats(uid) {
  if (!uid) return;

  try {
    const snapInv = await getDocs(
      query(collection(db, 'referrals'), where('ownerUid', '==', uid), limit(300)),
    );
    const invites = snapInv.size || 0;
    if (refStatInvites) refStatInvites.textContent = `Recomendaciones: ${invites}`;
  } catch {
    if (refStatInvites) refStatInvites.textContent = 'Recomendaciones: -';
  }

  let rewards = [];
  try {
    const snapRewards = await getDocs(
      query(
        collection(db, 'rewards'),
        where('ownerUid', '==', uid),
        where('status', '==', 'AVAILABLE'),
        orderBy('createdAt', 'desc'),
        limit(40),
      ),
    );
    rewards = snapRewards.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    try {
      const snapRewardsFallback = await getDocs(
        query(
          collection(db, 'rewards'),
          where('ownerUid', '==', uid),
          where('status', '==', 'AVAILABLE'),
          limit(40),
        ),
      );
      rewards = snapRewardsFallback.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a, b) => {
          const aMs = (a?.createdAt?.seconds || 0) * 1000;
          const bMs = (b?.createdAt?.seconds || 0) * 1000;
          return bMs - aMs;
        });
    } catch {
      rewards = [];
    }
  }

  if (refStatRewards) refStatRewards.textContent = `Recompensas: ${rewards.length}`;

  if (refRewardsList) {
    if (!rewards.length) {
      refRewardsList.textContent = 'No hay recompensas disponibles.';
    } else {
      refRewardsList.innerHTML = rewards
        .map((r) => {
          const pct = Number(r.value || 0);
          const scope = String(r.scope || 'otros servicios');
          return `
            <div class="friendItem" style="gap:8px;">
              <div class="friendMeta" style="min-width:0;">
                <span class="friendAvatar">%</span>
                <div>
                  <div class="friendName">-${pct}%</div>
                  <div class="friendHint">${scope}</div>
                </div>
              </div>
              <button class="btn-yellow" type="button" data-reward-act="use" data-reward-id="${r.id}">
                Usar
              </button>
            </div>
          `;
        })
        .join('');
    }
  }

  if (refRewardsActions && !rewards.length) {
    refRewardsActions.textContent = '';
  }
}

if (btnCopyMyRefCode && !btnCopyMyRefCode.dataset.wired) {
  btnCopyMyRefCode.dataset.wired = '1';
  btnCopyMyRefCode.addEventListener('click', async () => {
    const code = String(myRefCode?.value || '').trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      if (myRefInfo) myRefInfo.textContent = 'Copiado.';
    } catch {
      if (myRefInfo) myRefInfo.textContent = 'No se pudo copiar.';
    }
  });
}

if (btnApplyRefCode && !btnApplyRefCode.dataset.wired) {
  btnApplyRefCode.dataset.wired = '1';
  btnApplyRefCode.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user?.uid) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    const myDoc = snap.exists() ? snap.data() || {} : {};
    await applyReferralCode(user.uid, myDoc);
    await loadReferralStats(user.uid);
  });
}

if (refRewardsList && !refRewardsList.dataset.wired) {
  refRewardsList.dataset.wired = '1';
  refRewardsList.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('button[data-reward-id]');
    if (!btn) return;
    const rewardId = String(btn.getAttribute('data-reward-id') || '').trim();
    if (!rewardId) return;

    try {
      btn.disabled = true;
      const snap = await getDoc(doc(db, 'rewards', rewardId));
      if (!snap.exists()) return;
      await redeemReward(rewardId, snap.data() || {});
      const user = auth.currentUser;
      if (user?.uid) await loadReferralStats(user.uid);
    } catch (err) {
      console.error('[amigos] redeem failed', err);
    } finally {
      btn.disabled = false;
    }
  });
}

if (friendInvitesList && !friendInvitesList.dataset.wired) {
  friendInvitesList.dataset.wired = '1';
  friendInvitesList.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-invite-action]');
    if (!btn) return;
    const action = String(btn.getAttribute('data-invite-action') || '').trim();
    const inviteId = String(btn.getAttribute('data-invite-id') || '').trim();
    if (!inviteId || (action !== 'accept' && action !== 'decline')) return;
    try {
      btn.disabled = true;
      await updateDoc(doc(db, 'friend_requests', inviteId), {
        status: action === 'accept' ? 'accepted' : 'declined',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[amigos] invite action failed', err);
    } finally {
      btn.disabled = false;
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const next = `${location.pathname.split('/').pop() || 'referidos.html'}${location.search || ''}${location.hash || ''}`;
    window.location.href = `login.html?next=${encodeURIComponent(next)}`;
    return;
  }

  try {
    const userDoc = await ensureUserDoc(user);
    const refCode = await ensureMyRefCode(user.uid, userDoc);
    renderMyRefCode(refCode);
    await loadReferralStats(user.uid);
    startFriendInvitesListener(user.uid);
  } catch (e) {
    console.warn('[amigos] init failed', e);
    if (myRefInfo) myRefInfo.textContent = 'No se pudo cargar.';
  }
});
