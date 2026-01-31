// assets/js/pages/panel-page.js
// Stabilny panel: email użytkownika, admin z Firestore users/{uid}.admin,
// oraz kafelki kursów A1/A2/B1/B2.

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

async function ensureUserDoc(user) {
  if (!user?.uid) return { admin: false, access: true };

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        email: user.email || '',
        admin: false,
        access: true,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { admin: false, access: true };
  }

  const data = snap.data() || {};
  const patch = {};
  let needPatch = false;

  if (typeof data.email !== 'string') {
    patch.email = user.email || '';
    needPatch = true;
  }
  if (typeof data.admin !== 'boolean') {
    patch.admin = false;
    needPatch = true;
  }
  if (typeof data.access === 'undefined') {
    patch.access = true;
    needPatch = true;
  }
  if (!data.createdAt) {
    patch.createdAt = serverTimestamp();
    needPatch = true;
  }

  if (needPatch) await setDoc(ref, patch, { merge: true });

  return { admin: data.admin === true, access: data.access !== false };
}

function renderAdminUI(isAdmin) {
  const badge = $('adminBadge');
  if (badge) badge.textContent = `(admin: ${isAdmin ? 'sí' : 'no'})`;

  const wrap = $('adminLinkWrap');
  if (wrap) {
    wrap.innerHTML = isAdmin
      ? `<a class="btn-yellow" href="esadmin.html">🛡️ Admin</a>`
      : '';
  }
}

function renderCourses() {
  const host = $('coursesCards');
  if (!host) return;

  const levels = [
    { lvl: 'A1', title: 'A1 — Principiante', subtitle: 'Empieza desde cero.' },
    { lvl: 'A2', title: 'A2 — Básico', subtitle: 'Refuerza lo esencial.' },
    { lvl: 'B1', title: 'B1 — Intermedio', subtitle: 'Comunicación diaria.' },
    { lvl: 'B2', title: 'B2 — Avanzado', subtitle: 'Fluidez y matices.' },
  ];

  host.innerHTML = levels
    .map(({ lvl, title, subtitle }) => {
      const href = `course.html?level=${encodeURIComponent(lvl)}`;
      return `
        <a class="courseCard" href="${href}" style="text-decoration:none; color:inherit;">
          <div class="courseTop">
            <div class="courseBadge">📚 ${lvl}</div>
            <div class="pill pill-yellow">Entrar →</div>
          </div>
          <div class="courseTitle" style="margin-top:10px;">${title}</div>
          <div class="muted" style="margin-top:6px;">${subtitle}</div>
        </a>
      `;
    })
    .join('');
}

function renderLastActivityFallback() {
  const when = $('lastActivityWhen');
  const title = $('lastActivityTitle');
  const link = $('lastActivityLink');
  if (when) when.textContent = '—';
  if (title) title.textContent = '—';
  if (link) link.href = 'espanel.html';
}

document.addEventListener('DOMContentLoaded', () => {
  renderCourses();
  renderLastActivityFallback();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const emailEl = $('userEmail');
    if (emailEl) emailEl.textContent = user.email || '—';

    const info = await ensureUserDoc(user);
    renderAdminUI(info.admin === true);
  });
});
