import { auth, db } from "../firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  increment,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const ADMIN_EMAIL = 'aquivivo.pl@gmail.com';
      const LEVELS = ['A1', 'A2', 'B1', 'B2'];
      const PAID_LEVELS = ['A2', 'B1', 'B2'];
      const usersList = document.getElementById('usersList');
      const searchInput = document.getElementById('search');
      const statusEl = document.getElementById('status');

      const btnLoadMore = document.getElementById('btnLoadMore');
      const loadInfo = document.getElementById('loadInfo');
      const PAGE_SIZE = 50;
      let lastDoc = null;
      let loading = false;

      btnLoadMore?.addEventListener('click', () => loadUsers(false));



      const filterEl = document.getElementById('filter');
      const cntActiveEl = document.getElementById('cntActive');
      const cntExpiring7El = document.getElementById('cntExpiring7');
      const cntExpiredEl = document.getElementById('cntExpired');
let allUsers = [];

      // cerrar sesión
      window.logout = function () {
        signOut(auth).then(() => (window.location.href = 'eslogin.html'));
      };

      // verificación de auth
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.href = 'eslogin.html';
          return;
        }
        if ((user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          document.body.innerHTML = `<div class="wrap"><h1>Acceso denegado</h1><p class="sub">Esta página es solo para administradores.</p></div>`;
          return;
        }

        await loadUsers(true);
      });

      // helpers
      function nowDate() {
        return new Date();
      }
      function addDays(date, days) {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + Number(days || 0));
        return d;
      }
      function addMonths(date, months) {
        const d = new Date(date.getTime());
        d.setMonth(d.getMonth() + Number(months || 0));
        return d;
      }
      function parseIso(s) {
        if (!s) return null;
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      }
      function fmt(d) {
        if (!d) return '-';
        return d.toLocaleString('es-MX');
      }
      function hasActiveAccess(userData, level) {
        const expireIso = userData?.access?.[level]?.freeUntil;
        const exp = parseIso(expireIso);
        if (!exp) return false;
        return exp > nowDate();
      }

      function getExpireDate(userData, level) {
        const iso = userData?.access?.[level]?.freeUntil;
        return parseIso(iso);
      }

      function userHasAnyAccess(userData) {
        return LEVELS.some((lvl) => !!userData?.access?.[lvl]?.freeUntil);
      }

      function userIsActive(userData) {
        return LEVELS.some((lvl) => hasActiveAccess(userData, lvl));
      }

      function userIsExpiringSoon(userData, days) {
        const now = nowDate();
        const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        return LEVELS.some((lvl) => {
          const exp = getExpireDate(userData, lvl);
          return exp && exp > now && exp <= limit;
        });
      }
      function pillHtml(label, kind) {
        const cls = kind === 'ok' ? 'pill ok' : kind === 'no' ? 'pill no' : 'pill soon';
        return `<span class="${cls}">${label}</span>`;
      }
      function esc(s) {
        return String(s || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');
      }

      async function loadUsers(reset = false) {
        if (loading) return;
        loading = true;

        if (reset) {
          allUsers = [];
          lastDoc = null;
          usersList.innerHTML = '';
        }

        statusEl.textContent = allUsers.length ? `Cargando más…` : 'Cargando usuarios…';

        let q = query(collection(db, 'users'), orderBy('email'), limit(PAGE_SIZE));
        if (lastDoc) q = query(collection(db, 'users'), orderBy('email'), startAfter(lastDoc), limit(PAGE_SIZE));

        const snap = await getDocs(q);
        snap.forEach((d) => allUsers.push({ uid: d.id, ...d.data() }));
        lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;

        // UI
        statusEl.textContent = `Usuarios cargados: ${allUsers.length}`;
        loadInfo.textContent = snap.size < PAGE_SIZE ? 'No hay más usuarios para cargar.' : '';
        btnLoadMore.style.display = snap.size < PAGE_SIZE ? 'none' : 'inline-flex';

        renderUsers();
        loading = false;
      }

      function renderUsers() {
        const q = (searchInput.value || '').toLowerCase().trim();
        const f = (filterEl?.value || 'all');

        // base set (only text search)
        const base = allUsers.filter((u) => {
          if (!q) return true;
          return (
            (u.email || '').toLowerCase().includes(q) ||
            (u.uid || '').toLowerCase().includes(q)
          );
        });

        // Counters (based on base set)
        const activeCount = base.filter((u) => userIsActive(u)).length;
        const expiredCount = base.filter((u) => {
          const hasAny = userHasAnyAccess(u);
          const isActive = userIsActive(u);
          return hasAny && !isActive;
        }).length;
        const expiring7Count = base.filter((u) => userIsExpiringSoon(u, 7)).length;

        if (cntActiveEl) cntActiveEl.textContent = String(activeCount);
        if (cntExpiredEl) cntExpiredEl.textContent = String(expiredCount);
        if (cntExpiring7El) cntExpiring7El.textContent = String(expiring7Count);

        // Apply status filter on top
        const filtered = base.filter((u) => {
          if (f === 'all') return true;

          const hasAny = userHasAnyAccess(u);
          const isActive = userIsActive(u);
          const isExpired = hasAny && !isActive;
          const isExpiring7 = userIsExpiringSoon(u, 7);

          if (f === 'active') return isActive;
          if (f === 'expired') return isExpired;
          if (f === 'expiring7') return isExpiring7;
          return true;
        });

        usersList.innerHTML = filtered.length
          ? filtered.map(renderUserCard).join('')
          : `<div class="card"><b>Sin resultados.</b></div>`;

        statusEl.textContent = `Mostrando ${filtered.length} de ${allUsers.length}`;
      }

function renderUserCard(u) {
        const uid = esc(u.uid);
        const email = esc(u.email || '(ninguno)');
        const activeAny = userIsActive(u);
        const expiring7 = userIsExpiringSoon(u, 7);

        const badges = [
          pillHtml(activeAny ? 'ACTIVO' : 'INACTIVO', activeAny ? 'ok' : 'no'),
          expiring7 ? pillHtml('⏳ < 7 días', 'warn') : ''
        ].join(' ');

        return `
          <div class="card userCard" data-uid="${uid}">
            <div class="userSummary">
              <div class="left">
                <div><b>${email}</b></div>
                <div class="mutedSmall">UID: ${uid}</div>
              </div>
              <div class="right">
                ${badges}
                <button class="btn btnBlue btnTiny"
                  data-action="grantA1_7"
                  data-uid="${uid}">
                  ➕ A1 +7d
                </button>
                <button class="btn btnGray btnTiny"
                  data-action="toggleDetails"
                  data-uid="${uid}">
                  Abrir ▾
                </button>
              </div>
            </div>
            <div class="detailsBody" data-loaded="0" style="display:none;"></div>
          </div>
        `;
      }


      function renderUserDetails(u) {
        const uid = esc(u.uid);

        const pills = LEVELS.map((lvl) => {
          const active = hasActiveAccess(u, lvl);
          return pillHtml(`${lvl}: ${active ? 'ACTIVO' : 'SIN ACCESO'}`, active ? 'ok' : 'no');
        }).join(' ');

        const meta = `
          <div class="userMeta">
            <div><b>Correo:</b> ${esc(u.email || '(ninguno)')}</div>
            <div><b>UID:</b> <span class="muted">${esc(u.uid)}</span></div>
            <div style="margin-top:8px;"><b>Curso activo:</b> <span class="tag">${esc(u.activeCourse || '-')}</span></div>

            <div class="small" style="margin-top:10px;">
              A1 hasta: <b>${fmt(parseIso(u?.access?.A1?.freeUntil))}</b>
              <br/>A2 hasta: <b>${fmt(parseIso(u?.access?.A2?.freeUntil))}</b>
              <br/>B1 hasta: <b>${fmt(parseIso(u?.access?.B1?.freeUntil))}</b>
              <br/>B2 hasta: <b>${fmt(parseIso(u?.access?.B2?.freeUntil))}</b>
            </div>

            <div style="margin-top:10px;">${pills}</div>

            <div class="btnRow" style="margin-top:10px;">
              ${LEVELS.map((lvl) => `<button class="btn btnGray" onclick="setActiveCourse('${esc(u.uid)}','${lvl}')">🎯 Curso activo: ${lvl}</button>`).join('')}
              <button class="btn btnRed" onclick="clearActiveCourse('${esc(u.uid)}')">🧹 Quitar curso activo</button>
            </div>
          </div>
        `;

        const a1Box = `
          <div class="levelBox">
            <div class="levelTitle">A1 <span class="tag">meses/días</span></div>
            <div class="btnRow">
              <button class="btn btnBlue" onclick="grantDays('${esc(u.uid)}','A1',7)">➕ Dar 7 días</button>
              <button class="btn btnYellow" onclick="extendDays('${esc(u.uid)}','A1',7)">⏳ Extender 7 días</button>

              <button class="btn btnBlue" onclick="grantMonths('${esc(u.uid)}','A1',1)">➕ Dar 1 mes</button>
              <button class="btn btnYellow" onclick="extendMonths('${esc(u.uid)}','A1',1)">⏳ Extender 1 mes</button>

              <button class="btn btnBlue" onclick="grantMonths('${esc(u.uid)}','A1',3)">➕ Dar 3 meses</button>
              <button class="btn btnYellow" onclick="extendMonths('${esc(u.uid)}','A1',3)">⏳ Extender 3 meses</button>

              <button class="btn btnBlue" onclick="grantDaysPrompt('${esc(u.uid)}','A1')">➕ Dar días…</button>
              <button class="btn btnYellow" onclick="extendDaysPrompt('${esc(u.uid)}','A1')">⏳ Extender días…</button>

              <button class="btn btnBlue" onclick="grantMonthsPrompt('${esc(u.uid)}','A1')">➕ Dar meses…</button>
              <button class="btn btnYellow" onclick="extendMonthsPrompt('${esc(u.uid)}','A1')">⏳ Extender meses…</button>

              <button class="btn btnRed" onclick="revokeAccess('${esc(u.uid)}','A1')">❌ Revocar</button>
            </div>
          </div>
        `;

        const paidBoxes = PAID_LEVELS.map((lvl) => `
          <div class="levelBox">
            <div class="levelTitle">${lvl} <span class="tag">meses/días</span></div>
            <div class="btnRow">
              <button class="btn btnBlue" onclick="grantDays('${esc(u.uid)}','${lvl}',7)">➕ Dar 7 días</button>
              <button class="btn btnYellow" onclick="extendDays('${esc(u.uid)}','${lvl}',7)">⏳ Extender 7 días</button>

              <button class="btn btnBlue" onclick="grantMonths('${esc(u.uid)}','${lvl}',1)">➕ Dar 1 mes</button>
              <button class="btn btnYellow" onclick="extendMonths('${esc(u.uid)}','${lvl}',1)">⏳ Extender 1 mes</button>

              <button class="btn btnBlue" onclick="grantMonths('${esc(u.uid)}','${lvl}',3)">➕ Dar 3 meses</button>
              <button class="btn btnYellow" onclick="extendMonths('${esc(u.uid)}','${lvl}',3)">⏳ Extender 3 meses</button>

              <button class="btn btnBlue" onclick="grantDaysPrompt('${esc(u.uid)}','${lvl}')">➕ Dar días…</button>
              <button class="btn btnYellow" onclick="extendDaysPrompt('${esc(u.uid)}','${lvl}')">⏳ Extender días…</button>

              <button class="btn btnBlue" onclick="grantMonthsPrompt('${esc(u.uid)}','${lvl}')">➕ Dar meses…</button>
              <button class="btn btnYellow" onclick="extendMonthsPrompt('${esc(u.uid)}','${lvl}')">⏳ Extender meses…</button>

              <button class="btn btnRed" onclick="revokeAccess('${esc(u.uid)}','${lvl}')">❌ Revocar</button>
            </div>
          </div>
        `).join('');

        return `${meta}${a1Box}${paidBoxes}`;
      }


      // Lazy-load user controls when opening a card (custom toggle for performance)
      usersList.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-action="toggleDetails"]');
        if (!btn) return;

        const uid = btn.getAttribute('data-uid');
        const card = btn.closest('.userCard');
        const body = card?.querySelector('.detailsBody');
        if (!uid || !card || !body) return;

        const isOpen = body.style.display !== 'none';
        if (isOpen) {
          body.style.display = 'none';
          btn.textContent = 'Abrir ▾';
          return;
        }

        // open
        if (body.getAttribute('data-loaded') !== '1') {
          const u = allUsers.find((x) => (x.uid || x.id) === uid);
          if (!u) return;
          body.innerHTML = renderUserDetails(u);
          body.setAttribute('data-loaded', '1');
        }
        body.style.display = 'block';
        btn.textContent = 'Cerrar ▴';
      });

      // Quick action: A1 +7d
      usersList.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-action="grantA1_7"]');
        if (!btn) return;
        const uid = btn.getAttribute('data-uid');
        if (!uid) return;
        grantDays(uid, 'A1', 7);
      });
// --- Active course ---
      window.setActiveCourse = async function (uid, level) {
        if (!confirm(`¿Establecer ${level} como curso activo para ${uid}?`)) return;
        const ref = doc(db, 'users', uid);
        await setDoc(ref, { activeCourse: level, updatedAt: serverTimestamp() }, { merge: true });
        await refreshOne(uid);
        alert(`✅ Curso activo = ${level}`);
      };

      window.clearActiveCourse = async function (uid) {
        if (!confirm(`¿Quitar curso activo para ${uid}?`)) return;
        const ref = doc(db, 'users', uid);
        await updateDoc(ref, { activeCourse: deleteField(), updatedAt: serverTimestamp() });
        await refreshOne(uid);
        alert('✅ Curso activo borrado');
      };

      // --- Access: grant/extend helpers ---
      async function setAccessUntil(uid, level, untilDate) {
        const ref = doc(db, 'users', uid);
        await setDoc(
          ref,
          {
            access: {
              [level]: { freeUntil: untilDate.toISOString() }},
            updatedAt: serverTimestamp()},
          { merge: true },
        );
        await refreshOne(uid);
      }

      function getCurrentUntil(userData, level) {
        const iso = userData?.access?.[level]?.freeUntil;
        const d = parseIso(iso);
        return d && d > nowDate() ? d : null;
      }

      function findUser(uid) {
        return allUsers.find((u) => u.uid === uid) || null;
      }

      // --- Days ---
      window.grantDays = async function (uid, level, days) {
        if (!confirm(`¿Dar acceso a ${level} por ${days} días para ${uid}?`)) return;
        const until = addDays(nowDate(), Number(days) || 0);
        await setAccessUntil(uid, level, until);
        alert(`✅ ${level} activo hasta: ${until.toLocaleString('es-MX')}`);
      };

      window.extendDays = async function (uid, level, days) {
        if (!confirm(`¿Extender acceso a ${level} por ${days} días para ${uid}?`)) return;
        const u = findUser(uid);
        const base = getCurrentUntil(u, level) || nowDate();
        const until = addDays(base, Number(days) || 0);
        await setAccessUntil(uid, level, until);
        alert(`✅ ${level} extendido hasta: ${until.toLocaleString('es-MX')}`);
      };

      window.grantDaysPrompt = async function (uid, level) {
        const raw = prompt(`¿Cuántos días quieres DAR a ${level} para ${uid}?`, '7');
        if (raw === null) return;
        const n = Math.max(1, Number(raw));
        if (!Number.isFinite(n)) return alert('Número inválido.');
        return window.grantDays(uid, level, n);
      };

      window.extendDaysPrompt = async function (uid, level) {
        const raw = prompt(`¿Cuántos días quieres EXTENDER a ${level} para ${uid}?`, '7');
        if (raw === null) return;
        const n = Math.max(1, Number(raw));
        if (!Number.isFinite(n)) return alert('Número inválido.');
        return window.extendDays(uid, level, n);
      };

      // --- Months ---
      window.grantMonths = async function (uid, level, months) {
        if (!confirm(`¿Dar acceso a ${level} por ${months} meses para ${uid}?`)) return;
        const until = addMonths(nowDate(), Number(months) || 0);
        await setAccessUntil(uid, level, until);
        alert(`✅ ${level} activo hasta: ${until.toLocaleString('es-MX')}`);
      };

      window.extendMonths = async function (uid, level, months) {
        if (!confirm(`¿Extender acceso a ${level} por ${months} meses para ${uid}?`)) return;
        const u = findUser(uid);
        const base = getCurrentUntil(u, level) || nowDate();
        const until = addMonths(base, Number(months) || 0);
        await setAccessUntil(uid, level, until);
        alert(`✅ ${level} extendido hasta: ${until.toLocaleString('es-MX')}`);
      };

      window.grantMonthsPrompt = async function (uid, level) {
        const raw = prompt(`¿Cuántos meses quieres DAR a ${level} para ${uid}?`, '3');
        if (raw === null) return;
        const n = Math.max(1, Number(raw));
        if (!Number.isFinite(n)) return alert('Número inválido.');
        return window.grantMonths(uid, level, n);
      };

      window.extendMonthsPrompt = async function (uid, level) {
        const raw = prompt(`¿Cuántos meses quieres EXTENDER a ${level} para ${uid}?`, '3');
        if (raw === null) return;
        const n = Math.max(1, Number(raw));
        if (!Number.isFinite(n)) return alert('Número inválido.');
        return window.extendMonths(uid, level, n);
      };

      // --- Revoke (delete field, not null) ---
      window.revokeAccess = async function (uid, level) {
        if (!confirm(`¿Revocar acceso a ${level} para ${uid}?`)) return;
        const ref = doc(db, 'users', uid);
        await updateDoc(ref, { [`access.${level}`]: deleteField(), updatedAt: serverTimestamp() });
        await refreshOne(uid);
        alert(`✅ ${level} revocado`);
      };

      // search
      searchInput.addEventListener('input', renderUsers);
      filterEl.addEventListener('change', renderUsers);
