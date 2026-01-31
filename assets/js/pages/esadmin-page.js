import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  Timestamp,
  addDoc,
  getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

/* ----------------------- Guard: admin only ----------------------- */
async function ensureAdmin(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().admin !== true) {
    window.location.href = 'espanel.html?reason=admin';
    return false;
  }
  return true;
}

let ADMIN_UID = null;
let ADMIN_EMAIL = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  const ok = await ensureAdmin(user);
  if (!ok) return;
  ADMIN_UID = user.uid;
  ADMIN_EMAIL = user.email || '';
});

/* ----------------------- Helpers ----------------------- */
function toCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function fmtUntil(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '';
  }
}

function toInputDatetimeLocal(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return '';
  }
}

function parseInputDatetimeLocal(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function setStatus(el, msg, kind = 'ok') {
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = kind === 'bad' ? '#ffd1d7' : (kind === 'warn' ? '#ffe08a' : 'rgba(255,255,255,0.92)');
}

async function logAccess(uid, action, details = {}) {
  try {
    await addDoc(collection(db, 'users', uid, 'access_logs'), {
      action,
      details,
      byUid: ADMIN_UID || null,
      byEmail: ADMIN_EMAIL || null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('logAccess failed', e);
  }
}

/* ----------------------- PROMO CODES ----------------------- */
const promoCode = $('promoCode');
const promoDays = $('promoDays');
const promoPlan = $('promoPlan');
const promoActive = $('promoActive');
const btnSavePromoCode = $('btnSavePromoCode');
const btnClearPromoForm = $('btnClearPromoForm');
const promoStatus = $('promoStatus');
const promoListAdmin = $('promoListAdmin');

async function loadPromoCodes() {
  if (!promoListAdmin) return;

  promoListAdmin.innerHTML = '<div class="hintSmall">Cargando…</div>';
  try {
    const q = query(collection(db, 'promo_codes'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      promoListAdmin.innerHTML = '<div class="hintSmall">— No hay códigos todavía —</div>';
      return;
    }

    const rows = [];
    snap.forEach((d) => {
      const code = d.id;
      const data = d.data() || {};
      const days = Number(data.days || 0);
      const plan = String(data.plan || 'premium');
      const active = data.active !== false;

      rows.push(`
        <div class="userRow" style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="pill ${active ? 'pill-green' : 'pill-red'}">${active ? 'Activo' : 'Off'}</span>
            <span class="pill">🏷️ <b>${code}</b></span>
            <span class="pill">⏳ ${days} días</span>
            <span class="pill">💎 ${plan}</span>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn-white-outline" data-promo-act="copy" data-code="${code}">📋 Copiar</button>
            <button class="${active ? 'btn-red' : 'btn-yellow'}" data-promo-act="toggle" data-code="${code}">${active ? 'Desactivar' : 'Activar'}</button>
            <button class="btn-white-outline" data-promo-act="edit" data-code="${code}">✏️ Editar</button>
          </div>
        </div>
      `);
    });

    promoListAdmin.innerHTML = rows.join('');
  } catch (e) {
    console.error(e);
    promoListAdmin.innerHTML = '<div class="hintSmall">Error cargando códigos.</div>';
  }
}

async function savePromo() {
  const code = toCode(promoCode?.value);
  if (!code) {
    setStatus(promoStatus, 'Introduce un código.', 'warn');
    return;
  }

  const days = Math.max(0, Number(promoDays?.value || 0));
  const plan = String(promoPlan?.value || 'premium').toLowerCase();
  const active = promoActive?.checked !== false;

  try {
    await setDoc(
      doc(db, 'promo_codes', code),
      {
        active,
        days,
        plan,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

    setStatus(promoStatus, 'Guardado ✅');
    await loadPromoCodes();
  } catch (e) {
    console.error(e);
    setStatus(promoStatus, 'Error guardando.', 'bad');
  }
}

function clearPromoForm() {
  if (promoCode) promoCode.value = '';
  if (promoDays) promoDays.value = '';
  if (promoPlan) promoPlan.value = 'premium';
  if (promoActive) promoActive.checked = true;
  setStatus(promoStatus, '');
}

promoListAdmin?.addEventListener('click', async (e) => {
  const btn = e.target?.closest?.('button');
  if (!btn) return;

  const act = btn.getAttribute('data-promo-act');
  const code = btn.getAttribute('data-code');
  if (!act || !code) return;

  if (act === 'copy') {
    try {
      await navigator.clipboard.writeText(code);
      setStatus(promoStatus, 'Copiado 📋');
    } catch {
      setStatus(promoStatus, 'No se pudo copiar.', 'bad');
    }
    return;
  }

  if (act === 'edit') {
    try {
      const snap = await getDoc(doc(db, 'promo_codes', code));
      if (!snap.exists()) return;
      const d = snap.data() || {};
      if (promoCode) promoCode.value = code;
      if (promoDays) promoDays.value = String(Number(d.days || 0));
      if (promoPlan) promoPlan.value = String(d.plan || 'premium').toLowerCase();
      if (promoActive) promoActive.checked = d.active !== false;
      setStatus(promoStatus, 'Editando…');
    } catch (err) {
      console.error(err);
      setStatus(promoStatus, 'Error abriendo el código.', 'bad');
    }
    return;
  }

  if (act === 'toggle') {
    try {
      const ref = doc(db, 'promo_codes', code);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const d = snap.data() || {};
      const next = !(d.active !== false);
      await updateDoc(ref, { active: next, updatedAt: serverTimestamp() });
      setStatus(promoStatus, next ? 'Activado ✅' : 'Desactivado ✅');
      await loadPromoCodes();
    } catch (err) {
      console.error(err);
      setStatus(promoStatus, 'Error cambiando estado.', 'bad');
    }
  }
});

btnSavePromoCode?.addEventListener('click', savePromo);
btnClearPromoForm?.addEventListener('click', clearPromoForm);

/* ----------------------- USERS LIST + EDITOR ----------------------- */
const btnLoadUsers = $('btnLoadUsers');
const usersSection = $('usersSection');
const usersList = $('usersList');
const btnLoadMore = $('btnLoadMore');
const userSearch = $('userSearch');
const btnSearch = $('btnSearch');
const btnClear = $('btnClear');
const roleFilter = $('roleFilter');

let lastDoc = null;
let mode = 'all'; // all | email | admins | premium | free
let loadedOnce = false;

function showUsersUI() {
  if (usersSection) usersSection.style.display = 'block';
}

function clearList() {
  if (usersList) usersList.innerHTML = '';
  lastDoc = null;
}

function computeUserAccessFlags(u) {
  const isAdmin = u.admin === true;
  const plan = String(u.plan || 'free').toLowerCase();
  const access = u.access === true;

  const until = u.accessUntil || null;
  const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? (untilDate.getTime() > Date.now()) : false;

  const blocked = u.blocked === true;
  const hasAccess = isAdmin || access || plan === 'premium' || isUntilValid;

  return { isAdmin, plan, access, hasAccess, until, isUntilValid, blocked };
}

function makeRow(docSnap) {
  const u = docSnap.data() || {};
  const uid = docSnap.id;
  const flags = computeUserAccessFlags(u);

  const div = document.createElement('div');
  div.className = 'userRow';
  div.style.display = 'flex';
  div.style.gap = '10px';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'space-between';
  div.style.cursor = 'pointer';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.gap = '10px';
  left.style.alignItems = 'center';
  left.style.flexWrap = 'wrap';

  const pill = (text, cls='pill') => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  };

  left.appendChild(pill(flags.hasAccess ? '🔓 acceso' : '🔒 free', 'pill ' + (flags.hasAccess ? 'pill-green' : 'pill-red')));
  if (flags.isAdmin) left.appendChild(pill('🛡️ admin', 'pill pill-yellow'));
  if (flags.blocked) left.appendChild(pill('⛔ bloqueado', 'pill pill-red'));
  left.appendChild(pill(`💎 ${flags.plan}` , 'pill pill-blue'));
  if (flags.isUntilValid) left.appendChild(pill(`⏳ ${fmtUntil(u.accessUntil)}`, 'pill'));

  const email = u.email || '(sin email)';
  const main = document.createElement('div');
  main.style.fontWeight = '900';
  main.textContent = email;
  left.appendChild(main);

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';
  right.style.flexWrap = 'wrap';
  right.style.justifyContent = 'flex-end';

  const btnQuick = (label, act) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-white-outline';
    b.textContent = label;
    b.dataset.act = act;
    b.dataset.uid = uid;
    return b;
  };

  right.appendChild(btnQuick('Editar', 'edit'));
  right.appendChild(btnQuick('+30d', 'extend30'));
  const revoke = document.createElement('button');
  revoke.type = 'button';
  revoke.className = 'btn-red';
  revoke.textContent = 'Quitar';
  revoke.dataset.act = 'revoke';
  revoke.dataset.uid = uid;
  right.appendChild(revoke);

  div.appendChild(left);
  div.appendChild(right);

  div.addEventListener('click', (e) => {
    const isBtn = e.target?.closest?.('button');
    if (isBtn) return;
    openUserModal(uid);
  });

  return div;
}

async function loadUsers() {
  if (!usersList) return;

  if (btnLoadMore) btnLoadMore.style.display = (mode === 'all') ? 'inline-flex' : 'none';

  if (mode === 'admins') {
    clearList();
    const q = query(collection(db, 'users'), where('admin', '==', true), limit(80));
    const snap = await getDocs(q);
    if (snap.empty) {
      usersList.innerHTML = '<div class="hintSmall">No hay administradores (admin: true).</div>';
      return;
    }
    snap.forEach(d => usersList.appendChild(makeRow(d)));
    return;
  }

  if (mode === 'premium') {
    clearList();
    const q = query(collection(db, 'users'), where('access', '==', true), limit(80));
    const snap = await getDocs(q);
    if (snap.empty) {
      usersList.innerHTML = '<div class="hintSmall">No hay usuarios con access:true.</div>';
      return;
    }
    snap.forEach(d => usersList.appendChild(makeRow(d)));
    return;
  }

  if (mode === 'free') {
    clearList();
    const q = query(collection(db, 'users'), where('access', '==', false), limit(80));
    const snap = await getDocs(q);
    if (snap.empty) {
      usersList.innerHTML = '<div class="hintSmall">No hay usuarios con access:false.</div>';
      return;
    }
    snap.forEach(d => usersList.appendChild(makeRow(d)));
    return;
  }

  let q1 = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(10));
  if (lastDoc) q1 = query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(10));

  const snap = await getDocs(q1);

  if (snap.empty && !lastDoc) {
    usersList.innerHTML = '<div class="hintSmall">No hay usuarios.</div>';
    return;
  }

  snap.forEach(d => usersList.appendChild(makeRow(d)));
  lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
}

btnLoadUsers?.addEventListener('click', async () => {
  showUsersUI();
  if (!loadedOnce) {
    mode = roleFilter?.value || 'all';
    clearList();
    await loadUsers();
    loadedOnce = true;
  }
});

btnLoadMore?.addEventListener('click', async () => {
  showUsersUI();
  if (mode !== 'all') return;
  await loadUsers();
});

roleFilter?.addEventListener('change', async () => {
  if (!usersSection || usersSection.style.display === 'none') return;
  mode = roleFilter.value || 'all';
  clearList();
  await loadUsers();
});

btnSearch?.addEventListener('click', async () => {
  const email = (userSearch?.value || '').trim().toLowerCase();
  showUsersUI();
  clearList();

  if (!email) {
    mode = roleFilter?.value || 'all';
    await loadUsers();
    return;
  }

  mode = 'email';
  if (btnLoadMore) btnLoadMore.style.display = 'none';

  const q = query(collection(db, 'users'), where('email', '==', email), limit(20));
  const snap = await getDocs(q);

  if (snap.empty) {
    usersList.innerHTML = '<div class="hintSmall">No se encontró ningún usuario con ese email.</div>';
    return;
  }

  snap.forEach(d => usersList.appendChild(makeRow(d)));
});

btnClear?.addEventListener('click', async () => {
  if (userSearch) userSearch.value = '';
  if (roleFilter) roleFilter.value = 'all';
  showUsersUI();
  clearList();
  mode = 'all';
  if (btnLoadMore) btnLoadMore.style.display = 'inline-flex';
  await loadUsers();
});

userSearch?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSearch?.click();
});

/* ----------------------- USER MODAL ----------------------- */
const userModal = $('userModal');
const userModalClose = $('userModalClose');
const umEmail = $('um_email');
const umUid = $('um_uid');
const umAdmin = $('um_admin');
const umAccess = $('um_access');
const umBlocked = $('um_blocked');
const umPlan = $('um_plan');
const umNote = $('um_note');
const umUntil = $('um_until');
const umOpenPanelAs = $('um_openPanelAs');

const umGrant30 = $('um_grant30');
const umExtend30 = $('um_extend30');
const umRevoke = $('um_revoke');
const umSave = $('um_save');
const umCancel = $('um_cancel');
const umStatus = $('um_status');
const umLogs = $('um_logs');

let CURRENT_UID = null;

function openModal() {
  if (!userModal) return;
  userModal.style.display = 'block';
  userModal.setAttribute('aria-hidden', 'false');
}
function closeModal() {
  if (!userModal) return;
  userModal.style.display = 'none';
  userModal.setAttribute('aria-hidden', 'true');
  CURRENT_UID = null;
  setStatus(umStatus, '');
  if (umLogs) umLogs.innerHTML = '';
}

userModalClose?.addEventListener('click', closeModal);
umCancel?.addEventListener('click', closeModal);
userModal?.addEventListener('click', (e) => {
  if (e.target === userModal) closeModal();
});

async function loadUserLogs(uid) {
  if (!umLogs) return;
  umLogs.innerHTML = '<div class="hintSmall">Cargando…</div>';

  try {
    const q = query(
      collection(db, 'users', uid, 'access_logs'),
      orderBy('createdAt', 'desc'),
      limit(25),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      umLogs.innerHTML = '<div class="hintSmall">— Sin historial —</div>';
      return;
    }

    const rows = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      const action = x.action || '—';
      const who = x.byEmail || x.byUid || '—';
      const when = x.createdAt ? fmtUntil(x.createdAt) : '—';
      rows.push(`
        <div class="userRow" style="display:flex; gap:10px; align-items:flex-start; justify-content:space-between;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-weight:900;">${action}</div>
            <div class="hintSmall">por: ${who}</div>
          </div>
          <div class="hintSmall">${when}</div>
        </div>
      `);
    });

    umLogs.innerHTML = rows.join('');
  } catch (e) {
    console.error(e);
    umLogs.innerHTML = '<div class="hintSmall">Error cargando historial.</div>';
  }
}

async function openUserModal(uid) {
  CURRENT_UID = uid;
  setStatus(umStatus, 'Cargando…');

  openModal();

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      setStatus(umStatus, 'No existe el documento del usuario.', 'bad');
      return;
    }
    const u = snap.data() || {};

    if (umEmail) umEmail.textContent = u.email || '—';
    if (umUid) umUid.textContent = uid;

    if (umAdmin) umAdmin.checked = u.admin === true;
    if (umAccess) umAccess.checked = u.access === true;
    if (umBlocked) umBlocked.checked = u.blocked === true;
    if (umPlan) umPlan.value = String(u.plan || 'free').toLowerCase() === 'premium' ? 'premium' : 'free';
    if (umUntil) umUntil.value = toInputDatetimeLocal(u.accessUntil);
    if (umNote) umNote.value = u.adminNote || '';

    if (umOpenPanelAs) {
      umOpenPanelAs.onclick = () => {
        const url = `espanel.html?as=${encodeURIComponent(uid)}`;
        window.open(url, '_blank');
      };
    }

    await loadUserLogs(uid);

    setStatus(umStatus, '');
  } catch (e) {
    console.error(e);
    setStatus(umStatus, 'Error cargando usuario.', 'bad');
  }
}

async function saveUserFields(patch, actionName='update') {
  if (!CURRENT_UID) return;
  const ref = doc(db, 'users', CURRENT_UID);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  await logAccess(CURRENT_UID, actionName, patch);
}

async function grantOrExtend(days, forceStartNow = false) {
  if (!CURRENT_UID) return;
  setStatus(umStatus, 'Guardando…');

  try {
    const ref = doc(db, 'users', CURRENT_UID);
    const snap = await getDoc(ref);
    const u = snap.exists() ? (snap.data() || {}) : {};

    const now = new Date();
    const currentUntil = u.accessUntil?.toDate ? u.accessUntil.toDate() : null;

    let base = now;
    if (!forceStartNow && currentUntil && !Number.isNaN(currentUntil.getTime()) && currentUntil.getTime() > now.getTime()) {
      base = currentUntil;
    }

    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const patch = {
      access: true,
      plan: 'premium',
      accessUntil: Timestamp.fromDate(next),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(ref, patch);
    await logAccess(CURRENT_UID, forceStartNow ? 'grant_premium_days' : 'extend_premium_days', { days });

    if (umAccess) umAccess.checked = true;
    if (umPlan) umPlan.value = 'premium';
    if (umUntil) umUntil.value = toInputDatetimeLocal(next);

    setStatus(umStatus, `OK ✅ (+${days} días)`);
    await loadUserLogs(CURRENT_UID);
    clearList();
    lastDoc = null;
    if (mode === 'email') btnSearch?.click();
    else await loadUsers();
  } catch (e) {
    console.error(e);
    setStatus(umStatus, 'Error guardando.', 'bad');
  }
}

umGrant30?.addEventListener('click', async () => {
  await grantOrExtend(30, true);
});

umExtend30?.addEventListener('click', async () => {
  await grantOrExtend(30, false);
});

umRevoke?.addEventListener('click', async () => {
  if (!CURRENT_UID) return;
  setStatus(umStatus, 'Guardando…');

  try {
    const patch = {
      access: false,
      plan: 'free',
      accessUntil: deleteField(),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'users', CURRENT_UID), patch);
    await logAccess(CURRENT_UID, 'revoke_access', {});

    if (umAccess) umAccess.checked = false;
    if (umPlan) umPlan.value = 'free';
    if (umUntil) umUntil.value = '';

    setStatus(umStatus, 'Acceso quitado ✅');
    await loadUserLogs(CURRENT_UID);

    clearList();
    lastDoc = null;
    if (mode === 'email') btnSearch?.click();
    else await loadUsers();
  } catch (e) {
    console.error(e);
    setStatus(umStatus, 'Error quitando acceso.', 'bad');
  }
});

umSave?.addEventListener('click', async () => {
  if (!CURRENT_UID) return;

  setStatus(umStatus, 'Guardando…');

  try {
    const patch = {};
    patch.admin = umAdmin?.checked === true;
    patch.access = umAccess?.checked === true;
    patch.blocked = umBlocked?.checked === true;
    patch.plan = String(umPlan?.value || 'free').toLowerCase() === 'premium' ? 'premium' : 'free';

    const d = parseInputDatetimeLocal(umUntil?.value);
    if (d) patch.accessUntil = Timestamp.fromDate(d);
    else patch.accessUntil = deleteField();

    await saveUserFields(patch, 'update_fields');

    setStatus(umStatus, 'Guardado ✅');
    await loadUserLogs(CURRENT_UID);

    clearList();
    lastDoc = null;
    if (mode === 'email') btnSearch?.click();
    else await loadUsers();
  } catch (e) {
    console.error(e);
    setStatus(umStatus, 'Error guardando.', 'bad');
  }
});

/* Quick buttons in list */
usersList?.addEventListener('click', async (e) => {
  const btn = e.target?.closest?.('button');
  if (!btn) return;

  const act = btn.dataset.act;
  const uid = btn.dataset.uid;
  if (!act || !uid) return;

  e.preventDefault();
  e.stopPropagation();

  if (act === 'edit') {
    openUserModal(uid);
    return;
  }

  if (act === 'extend30') {
    CURRENT_UID = uid;
    openModal();
    await openUserModal(uid);
    await grantOrExtend(30, false);
    return;
  }

  if (act === 'revoke') {
    CURRENT_UID = uid;
    openModal();
    await openUserModal(uid);
    await (async () => umRevoke?.click())();
  }
});


/* ----------------------- DASHBOARD (counts) ----------------------- */
const btnRefreshStats = $('btnRefreshStats');
const statsStatus = $('statsStatus');

const statUsers = $('statUsers');
const statPremiumPlan = $('statPremiumPlan');
const statAccessTrue = $('statAccessTrue');
const statBlocked = $('statBlocked');
const statCourses = $('statCourses');
const statExercises = $('statExercises');

function setStat(el, v) {
  if (!el) return;
  el.textContent = (v === null || typeof v === 'undefined') ? '—' : String(v);
}

async function countDocs(qOrCol) {
  const snap = await getCountFromServer(qOrCol);
  return snap.data().count || 0;
}

async function loadStats() {
  if (statsStatus) setStatus(statsStatus, 'Cargando…');
  try {
    const usersCol = collection(db, 'users');
    const coursesCol = collection(db, 'courses');
    const exercisesCol = collection(db, 'exercises');

    const qPremium = query(usersCol, where('plan', '==', 'premium'));
    const qAccess = query(usersCol, where('access', '==', true));
    const qBlocked = query(usersCol, where('blocked', '==', true));

    const [cUsers, cPremium, cAccess, cBlocked, cCourses, cExercises] = await Promise.all([
      countDocs(usersCol),
      countDocs(qPremium),
      countDocs(qAccess),
      countDocs(qBlocked),
      countDocs(coursesCol),
      countDocs(exercisesCol),
    ]);

    setStat(statUsers, cUsers);
    setStat(statPremiumPlan, cPremium);
    setStat(statAccessTrue, cAccess);
    setStat(statBlocked, cBlocked);
    setStat(statCourses, cCourses);
    setStat(statExercises, cExercises);

    if (statsStatus) setStatus(statsStatus, 'OK ✅');
  } catch (e) {
    console.error(e);
    if (statsStatus) setStatus(statsStatus, 'Error cargando stats.', 'bad');
  }
}

btnRefreshStats?.addEventListener('click', loadStats);


/* ----------------------- DASHBOARD: expandable tiles ----------------------- */
function toggleDetailsBox(box, show) {
  if (!box) return;
  box.style.display = show ? 'block' : 'none';
}

function renderDetails(box, rows) {
  if (!box) return;
  if (!rows || !rows.length) {
    box.innerHTML = '<div class="hintSmall">— Sin detalles —</div>';
    return;
  }
  box.innerHTML = rows.map(r => `
    <div class="userRow" style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="font-weight:900;">${r.title || r.email || '(sin título)'}</div>
        <div class="hintSmall">${r.sub || r.uid || ''}</div>
      </div>
      <div class="hintSmall">${r.right || ''}</div>
    </div>
  `).join('');
}

async function loadTileDetails(type) {
  // returns array of {email/title, sub, right}
  if (type === 'users') {
    const q1 = query(collection(db,'users'), orderBy('createdAt','desc'), limit(20));
    const snap = await getDocs(q1);
    const rows = [];
    snap.forEach(d => {
      const u=d.data()||{};
      rows.push({
        email: (u.email || '(sin email)'),
        uid: d.id,
        sub: `uid: ${d.id}`,
        right: u.lastSeenAt ? fmtUntil(u.lastSeenAt) : '',
      });
    });
    return rows;
  }

  if (type === 'premium') {
    const q1 = query(collection(db,'users'), where('plan','==','premium'), limit(50));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        email: (u.email || '(sin email)'),
        uid: d.id,
        sub: 'plan: premium',
        right: u.accessUntil ? fmtUntil(u.accessUntil) : '',
      });
    });
    return rows;
  }

  if (type === 'access') {
    const q1 = query(collection(db,'users'), where('access','==', true), limit(50));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        email: (u.email || '(sin email)'),
        uid: d.id,
        sub: `access: true · plan: ${String(u.plan||'free')}`,
        right: u.accessUntil ? fmtUntil(u.accessUntil) : '',
      });
    });
    return rows;
  }

  if (type === 'blocked') {
    const q1 = query(collection(db,'users'), where('blocked','==', true), limit(50));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        email: (u.email || '(sin email)'),
        uid: d.id,
        sub: 'blocked: true',
        right: u.lastSeenAt ? fmtUntil(u.lastSeenAt) : '',
      });
    });
    return rows;
  }

  if (type === 'oneTopic') {
    const q1 = query(collection(db,'users'), where('openedTopicsCount','==', 1), limit(50));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        email: (u.email || '(sin email)'),
        uid: d.id,
        sub: 'openedTopicsCount: 1',
        right: u.lastSeenAt ? fmtUntil(u.lastSeenAt) : '',
      });
    });
    return rows;
  }

  if (type === 'courses') {
    const q1 = query(collection(db,'courses'), orderBy('order','asc'), limit(20));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const c=d.data()||{};
      rows.push({
        title: c.title || d.id,
        sub: `level: ${c.level || ''} · id: ${d.id}`,
        right: c.type ? String(c.type) : '',
      });
    });
    return rows;
  }

  if (type === 'exercises') {
    const q1 = query(collection(db,'exercises'), orderBy('order','asc'), limit(20));
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const x=d.data()||{};
      rows.push({
        title: x.prompt ? String(x.prompt).slice(0,60) : d.id,
        sub: `level: ${x.level || ''} · topicId: ${x.topicId || ''}`,
        right: x.type ? String(x.type) : '',
      });
    });
    return rows;
  }

  return [];
}

const tileCache = new Map();

function wireDashboardTiles() {
  const tiles = document.querySelectorAll('.statCard[data-expand]');
  tiles.forEach(tile => {
    tile.style.cursor = 'pointer';
    tile.title = 'Click para ver detalles';
    tile.addEventListener('click', async (e) => {
      // avoid triggering when user selects text
      const type = tile.getAttribute('data-expand');
      const detailsId = tile.getAttribute('data-details');
      const box = detailsId ? document.getElementById(detailsId) : null;
      if (!type || !box) return;

      const isOpen = box.style.display !== 'none' && box.style.display !== '';
      if (isOpen) {
        toggleDetailsBox(box, false);
        return;
      }

/* ----------------------- SEGMENTACIÓN (lists + CSV) ----------------------- */
const btnLoadExp7 = $('btnLoadExp7');
const btnLoadExp14 = $('btnLoadExp14');
const btnLoadPremiumActive = $('btnLoadPremiumActive');
const btnLoadFreeUsers = $('btnLoadFreeUsers');
const btnExportSegment = $('btnExportSegment');
const segmentStatus = $('segmentStatus');
const segmentList = $('segmentList');

let CURRENT_SEGMENT_ROWS = []; // {email, uid, access, plan, blocked, accessUntil}

function setSegStatus(msg, kind='ok'){
  if(!segmentStatus) return;
  setStatus(segmentStatus, msg, kind);
}

function renderSegment(rows){
  if(!segmentList) return;
  if(!rows.length){
    segmentList.innerHTML = '<div class="hintSmall">— Sin resultados —</div>';
    return;
  }
  segmentList.innerHTML = rows.map(r => {
    const until = r.accessUntil ? fmtUntil(r.accessUntil) : '—';
    const pills = [
      r.blocked ? '<span class="pill pill-red">⛔ blocked</span>' : '',
      r.plan === 'premium' ? '<span class="pill pill-blue">💎 premium</span>' : '<span class="pill">free</span>',
      r.access ? '<span class="pill pill-green">access</span>' : '<span class="pill pill-red">no access</span>',
      r.accessUntil ? `<span class="pill">⏳ ${until}</span>` : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="userRow" style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div style="font-weight:900;">${r.email || '(sin email)'}</div>
          <div class="hintSmall">${r.uid}</div>
          ${pills}
        </div>
        <div>
          <button class="btn-white-outline" data-seg-act="edit" data-uid="${r.uid}">Editar</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadExpiring(days){
  setSegStatus('Cargando…');
  if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Cargando…</div>';
  CURRENT_SEGMENT_ROWS = [];
  try{
    const now = new Date();
    const end = new Date(now.getTime() + days*24*60*60*1000);
    const q1 = query(
      collection(db,'users'),
      where('accessUntil','>=', Timestamp.fromDate(now)),
      where('accessUntil','<=', Timestamp.fromDate(end)),
      orderBy('accessUntil','asc'),
      limit(200),
    );
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        uid:d.id,
        email:(u.email||'').toLowerCase(),
        access:u.access===true,
        plan:String(u.plan||'free').toLowerCase(),
        blocked:u.blocked===true,
        accessUntil:u.accessUntil||null,
      });
    });
    CURRENT_SEGMENT_ROWS = rows;
    renderSegment(rows);
    setSegStatus(`OK ✅ (${rows.length})`);
  }catch(e){
    console.error(e);
    setSegStatus('Error cargando.', 'bad');
    if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Error.</div>';
  }
}

async function loadPremiumActive(){
  setSegStatus('Cargando…');
  if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Cargando…</div>';
  CURRENT_SEGMENT_ROWS = [];
  try{
    const now = new Date();
    const q1 = query(
      collection(db,'users'),
      where('accessUntil','>', Timestamp.fromDate(now)),
      orderBy('accessUntil','asc'),
      limit(200),
    );
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        uid:d.id,
        email:(u.email||'').toLowerCase(),
        access:u.access===true,
        plan:String(u.plan||'free').toLowerCase(),
        blocked:u.blocked===true,
        accessUntil:u.accessUntil||null,
      });
    });
    CURRENT_SEGMENT_ROWS = rows;
    renderSegment(rows);
    setSegStatus(`OK ✅ (${rows.length})`);
  }catch(e){
    console.error(e);
    setSegStatus('Error cargando.', 'bad');
    if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Error.</div>';
  }
}

// "Sin acceso" = approx: access==false AND plan=="free" AND blocked!=true
async function loadFreeApprox(){
  setSegStatus('Cargando…');
  if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Cargando…</div>';
  CURRENT_SEGMENT_ROWS = [];
  try{
    const q1 = query(
      collection(db,'users'),
      where('access','==', false),
      where('plan','==', 'free'),
      limit(200),
    );
    const snap = await getDocs(q1);
    const rows=[];
    snap.forEach(d=>{
      const u=d.data()||{};
      rows.push({
        uid:d.id,
        email:(u.email||'').toLowerCase(),
        access:u.access===true,
        plan:String(u.plan||'free').toLowerCase(),
        blocked:u.blocked===true,
        accessUntil:u.accessUntil||null,
      });
    });
    const filtered = rows.filter(r=>!r.blocked);
    CURRENT_SEGMENT_ROWS = filtered;
    renderSegment(filtered);
    setSegStatus(`OK ✅ (${filtered.length})`);
  }catch(e){
    console.error(e);
    setSegStatus('Error cargando.', 'bad');
    if(segmentList) segmentList.innerHTML = '<div class="hintSmall">Error.</div>';
  }
}

function exportCSV(){
  if(!CURRENT_SEGMENT_ROWS.length){
    setSegStatus('No hay datos para exportar.', 'warn');
    return;
  }
  const header = ['email','uid','plan','access','blocked','accessUntil'];
  const lines = [header.join(',')];
  for(const r of CURRENT_SEGMENT_ROWS){
    const until = r.accessUntil ? (r.accessUntil.toDate ? r.accessUntil.toDate().toISOString() : '') : '';
    const row = [
      (r.email||'').replaceAll('"','""'),
      r.uid,
      r.plan,
      r.access ? 'true' : 'false',
      r.blocked ? 'true' : 'false',
      until,
    ].map(v=>`"${String(v)}"`);
    lines.push(row.join(','));
  }
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aquivivo_segment_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setSegStatus('CSV descargado ✅');
}

btnLoadExp7?.addEventListener('click', ()=>loadExpiring(7));
btnLoadExp14?.addEventListener('click', ()=>loadExpiring(14));
btnLoadPremiumActive?.addEventListener('click', loadPremiumActive);
btnLoadFreeUsers?.addEventListener('click', loadFreeApprox);
btnExportSegment?.addEventListener('click', exportCSV);

// allow edit button
segmentList?.addEventListener('click', (e)=>{
  const btn = e.target?.closest?.('button');
  if(!btn) return;
  if(btn.getAttribute('data-seg-act')==='edit'){
    const uid = btn.getAttribute('data-uid');
    if(uid) openUserModal(uid);
  }
});

/* ----------------------- Boot ----------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadPromoCodes();
  await loadStats();
  wireDashboardTiles();
});
