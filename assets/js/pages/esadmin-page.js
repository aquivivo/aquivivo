import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const btnLoadUsers = document.getElementById('btnLoadUsers');
const usersSection = document.getElementById('usersSection');
const usersList = document.getElementById('usersList');
const btnLoadMore = document.getElementById('btnLoadMore');
const userSearch = document.getElementById('userSearch');
const btnSearch = document.getElementById('btnSearch');
const btnClear = document.getElementById('btnClear');
const roleFilter = document.getElementById('roleFilter');

let lastDoc = null;
let mode = 'all'; // all | email | admins
let loadedOnce = false;

function showUsersUI() {
  usersSection.style.display = 'block';
}

function clearList() {
  usersList.innerHTML = '';
  lastDoc = null;
}

function makeRow(u) {
  const div = document.createElement('div');
  div.className = 'userRow';
  const isAdmin = u.admin === true;
  div.textContent = `${u.email || '(sin email)'}${isAdmin ? '  (admin)' : ''}`;
  return div;
}

async function ensureAdmin(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists() || snap.data().admin !== true) {
    window.location.href = 'espanel.html';
    return false;
  }
  return true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  await ensureAdmin(user);
});

btnLoadUsers?.addEventListener('click', async () => {
  showUsersUI();
  if (!loadedOnce) {
    mode = roleFilter?.value === 'admins' ? 'admins' : 'all';
    clearList();
    await loadUsers();
    loadedOnce = true;
  }
});

btnLoadMore?.addEventListener('click', async () => {
  showUsersUI();
  if (mode !== 'all') return; // pagination only for "all"
  await loadUsers();
});

roleFilter?.addEventListener('change', async () => {
  if (!usersSection || usersSection.style.display === 'none') return;
  mode = roleFilter.value === 'admins' ? 'admins' : 'all';
  clearList();
  await loadUsers();
});

btnSearch?.addEventListener('click', async () => {
  const email = (userSearch?.value || '').trim().toLowerCase();
  showUsersUI();
  clearList();

  if (!email) {
    mode = roleFilter?.value === 'admins' ? 'admins' : 'all';
    await loadUsers();
    return;
  }

  mode = 'email';
  if (btnLoadMore) btnLoadMore.style.display = 'none';

  const q = query(collection(db, 'users'), where('email', '==', email), limit(20));
  const snap = await getDocs(q);

  if (snap.empty) {
    const div = document.createElement('div');
    div.className = 'hintSmall';
    div.textContent = 'No se encontró ningún usuario con ese email.';
    usersList.appendChild(div);
    return;
  }

  snap.forEach(d => usersList.appendChild(makeRow(d.data())));
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

async function loadUsers() {
  if (btnLoadMore) btnLoadMore.style.display = (mode === 'all') ? 'inline-flex' : 'none';

  if (mode === 'admins') {
    clearList();
    const q = query(collection(db, 'users'), where('admin', '==', true), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      const div = document.createElement('div');
      div.className = 'hintSmall';
      div.textContent = 'No hay administradores (admin: true) en Firestore.';
      usersList.appendChild(div);
      return;
    }

    snap.forEach(d => usersList.appendChild(makeRow(d.data())));
    return;
  }

  // mode === 'all' (paged)
  let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(10));
  if (lastDoc) {
    q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(10));
  }

  const snap = await getDocs(q);
  if (snap.empty) {
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    return;
  }

  snap.forEach(d => usersList.appendChild(makeRow(d.data())));
  lastDoc = snap.docs[snap.docs.length - 1];
}
