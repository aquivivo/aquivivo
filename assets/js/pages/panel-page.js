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

const ADMIN_EMAILS = [
        'aquivivo.pl@gmail.com',
        'DODAJ_DRUGI_EMAIL_TUTAJ@example.com',
      ];

      let IS_ADMIN = false;
      let META_CACHE = {};
      let ACCESS_CACHE = {};
      // <- wpisz tu drugi email (uczeń-test)

      function isAdminEmail(email) {
        const e = (email || '').toLowerCase();
        return ADMIN_EMAILS.some((a) => (a || '').toLowerCase() === e);
      }
      const userEmailEl = document.getElementById('userEmail');
      const coursesCardsEl = document.getElementById('coursesCards');
      const adminLinkWrap = document.getElementById('adminLinkWrap');

      function parseIso(s) {
        if (!s) return null;
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      }

      function daysLeft(accessObj, level) {
        if (!accessObj || !accessObj[level] || !accessObj[level].freeUntil)
          return null;
        const exp = parseIso(accessObj[level].freeUntil);
        if (!exp) return null;
        const ms = exp.getTime() - Date.now();
        return Math.ceil(ms / (1000 * 60 * 60 * 24));
      }

      function formatLeft(accessObj, level) {
        const d = daysLeft(accessObj, level);
        if (d === null) return '—';
        if (d <= 0) return 'expirado';
        if (d === 1) return '1 día';
        return `Quedan ${d} días`;
      }

      function hasAccess(accessObj, level) {
        if (!accessObj || !accessObj[level] || !accessObj[level].freeUntil)
          return false;
        const exp = parseIso(accessObj[level].freeUntil);
        if (!exp) return false;
        return exp > new Date();
      }

      // ===== PROGRESS + LAST ACTIVITY (STEP 3) =====
      function safeJsonParse(s) {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      }

      function getProgress(level) {
        // expected: { completed: number, total: number, lastUrl?: string, lastTitle?: string }
        const raw = localStorage.getItem(`av_progress_${level}`);
        const obj = safeJsonParse(raw || '');
        const completed = Number(obj?.completed || 0);
        const total = Number(obj?.total || 0);
        const pct =
          total > 0
            ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
            : 0;
        return {
          completed,
          total,
          pct,
          lastUrl: obj?.lastUrl || null,
          lastTitle: obj?.lastTitle || null};
      }

      function getLastActivity() {
        // expected: { level: "A1", title: string, url: string, at: number }
        const obj = safeJsonParse(
          localStorage.getItem('av_last_activity') || '',
        );
        if (!obj || !obj.url) return null;
        return obj;
      }

      function renderLastActivity() {
        const card = document.getElementById('lastActivityCard');
        if (!card) return;
        const a = getLastActivity();
        if (!a) {
          card.style.display = 'none';
          return;
        }
        document.getElementById('lastActivityTitle').textContent =
          a.title || `Curso ${a.level}`;
        document.getElementById('lastActivityLink').href = a.url;
        const whenEl = document.getElementById('lastActivityWhen');
        if (a.at) {
          const d = new Date(a.at);
          whenEl.textContent = d.toLocaleDateString();
        } else {
          whenEl.textContent = '';
        }
        card.style.display = 'block';
      }

      async function fetchAllCourseMeta() {
        const metaData = {};
        try {
          const snap = await getDocs(collection(db, 'course_meta'));
          snap.forEach((d) => {
            metaData[d.id] = d.data();
          });
        } catch (e) {
          console.warn('fetchAllCourseMeta failed', e);
        }
        return metaData;
      }

      function renderCourseCards(accessObj, metaData) {
        coursesCardsEl.innerHTML = '';
        const baseLevels = ['A1', 'A2', 'B1', 'B2'];
        const extraLevels = Object.keys(metaData || {})
          .filter((l) => !baseLevels.includes(l))
          .sort();
        const levels = [...baseLevels, ...extraLevels]; // A1/A2/B1/B2 first, then extras

        function tileClass(lvl) {
          if (lvl === 'B2') return 'tile-red';
          if (lvl === 'B1') return 'tile-white';
          return 'tile-blue'; // A1/A2
        }
        function activeCard(lvl) {
          const meta = metaData[lvl] || {};
          const tileStyle = meta.tileBg ? `background:${meta.tileBg};` : '';
          const tileTextStyle = meta.tileText ? `color:${meta.tileText};` : '';
          const primaryLabel =
            meta.primaryLabel ||
            siteSettings?.texts?.enter_label ||
            'Entrar al curso →';
          const primaryHref =
            meta.primaryHref || `course.html?level=${encodeURIComponent(lvl)}`;
          const btnStyle =
            meta.btnBg || meta.btnText
              ? `background:${meta.btnBg || '#FCD34D'}; color:${meta.btnText || '#111'}; border-color:${meta.btnBg || '#FCD34D'};`
              : '';
          const title = meta.title || `Polaco ${lvl}`;
          const subtitle = meta.subtitle || 'Haz clic para acceder al curso.';

          // Mapear nivel a archivo de curso
          const courseFile = `course.html?level=${encodeURIComponent(lvl)}`;

          return `
      <div class="course-tile ${tileClass(lvl)}" style="${tileStyle}${tileTextStyle}">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:6px;">
          <div class="tile-badge">🎓 NIVEL ${lvl}</div>
          <div style="display:flex; align-items:center; gap:10px; font-weight:900; opacity:.9;">
            ${IS_ADMIN ? `<button class="btn-icon" title="Editar tarjeta" onclick="openEditMeta(\'${lvl}\')">✏️</button>` : ``}
            ⏳ <span id="exp_${lvl}">—</span>
          </div>
        </div>

        <div class="tile-title"
 data-editable="true" contenteditable="false"
>${title}</div>
        <div class="tile-subtitle"
 data-editable="true" contenteditable="false"
>${subtitle}</div>

        <div class="progress-wrap" style="margin-top:18px;">
          <div class="progress-meta">
            <div>Progreso</div>
            <div><span id="pct_${lvl}">0</span>%</div>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="fill_${lvl}"></div></div>
        </div>

        <div class="tile-meta"
 data-editable="true" contenteditable="false"
 style="margin-top:16px;">
          ✅ Acceso activo
        </div>

        <div class="tile-actions" style="margin-top:22px;">
          <a class="btn-yellow" id="enter_${lvl}" href="${primaryHref}" style="${btnStyle}"
 data-editable="true" contenteditable="false"
>${primaryLabel}</a>
          <a class="btn-white-outline" href="Contacto.html"
 data-editable="true" contenteditable="false"
>${siteSettings?.texts?.extend_label || 'Extender acceso'}</a>
        </div>
      </div>
`;
        }

        function lockedCard(lvl) {
          const meta = metaData[lvl] || {};
          const tileStyle = meta.tileBg ? `background:${meta.tileBg};` : '';
          const tileTextStyle = meta.tileText ? `color:${meta.tileText};` : '';
          const primaryLabel =
            meta.primaryLabel ||
            siteSettings?.texts?.buy_label ||
            'Comprar acceso';
          const primaryHref = meta.primaryHref || 'Contacto.html';
          const btnStyle =
            meta.btnBg || meta.btnText
              ? `background:${meta.btnBg || '#EF4444'}; color:${meta.btnText || '#fff'}; border-color:${meta.btnBg || '#EF4444'};`
              : '';

          const title = meta.title || `Polaco ${lvl}`;
          const subtitle = meta.subtitle || '';

          return `
      <div class="course-tile ${tileClass(lvl)}" style="${tileStyle}${tileTextStyle}">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:6px;">
          <div class="tile-badge">🎓 NIVEL ${lvl}</div>
          <div style="display:flex; align-items:center; gap:10px;">
            ${IS_ADMIN ? `<button class="btn-icon" title="Editar tarjeta" onclick="openEditMeta(\'${lvl}\')">✏️</button>` : ``}
            <div class="pill pill-lock">🔒 bloqueado</div>
          </div>
        </div>

        <div class="tile-title"
 data-editable="true" contenteditable="false"
>${title}</div>
        <div class="tile-subtitle"
 data-editable="true" contenteditable="false"
>Curso bloqueado</div>

        <div class="tile-meta"
 data-editable="true" contenteditable="false"
>
          Este curso está bloqueado.<br><span style="font-weight:900; color:#FCD116;">Trial: ${siteSettings?.trialDays?.[lvl] ?? 7} días</span>
        </div>

        <div class="tile-actions" style="margin-top:22px;">
          <a class="btn-yellow" href="${primaryHref}" style="${btnStyle}"
 data-editable="true" contenteditable="false"
>${primaryLabel}</a>
        </div>
      </div>
`;
        }

        function expiredCard(lvl) {
          const meta = metaData[lvl] || {};
          const tileStyle = meta.tileBg ? `background:${meta.tileBg};` : '';
          const tileTextStyle = meta.tileText ? `color:${meta.tileText};` : '';
          const primaryLabel =
            meta.primaryLabel ||
            siteSettings?.texts?.renew_label ||
            'Renovar acceso';
          const primaryHref = meta.primaryHref || 'Contacto.html';
          const btnStyle =
            meta.btnBg || meta.btnText
              ? `background:${meta.btnBg || '#EF4444'}; color:${meta.btnText || '#fff'}; border-color:${meta.btnBg || '#EF4444'};`
              : '';
          const title = meta.title || `Polaco ${lvl}`;
          const subtitle = meta.subtitle || '';

          return `
      <div class="course-tile ${tileClass(lvl)}" style="${tileStyle}${tileTextStyle}">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:6px;">
          <div class="tile-badge">🎓 NIVEL ${lvl}</div>
          ${IS_ADMIN ? `<button class="btn-icon" title="Editar tarjeta" onclick="openEditMeta(\'${lvl}\')">✏️</button>` : ``}
            <div class="pill pill-expired">❌ expirado</div>
        </div>

        <div class="tile-title"
 data-editable="true" contenteditable="false"
>${title}</div>
        <div class="tile-subtitle"
 data-editable="true" contenteditable="false"
>Acceso expirado</div>

        <div class="tile-meta"
 data-editable="true" contenteditable="false"
>
          Tu acceso ha expirado. Desbloquea el curso para continuar.
        </div>

        <div class="tile-actions" style="margin-top:22px;">
          <a class="btn-yellow" href="${primaryHref}" style="${btnStyle}"
 data-editable="true" contenteditable="false"
>${primaryLabel}</a>
        </div>
      </div>
`;
        }

        let cActive = 0,
          cLocked = 0,
          cExpired = 0;

        levels.forEach((lvl) => {
          const active = hasAccess(accessObj, lvl);
          coursesCardsEl.innerHTML += active
            ? activeCard(lvl)
            : lockedCard(lvl);
        });

        // Rellenar expiración en tarjetas activas
        levels.forEach((lvl) => {
          const el = document.getElementById(`exp_${lvl}`);
          if (!el) return;
          const left = daysLeft(accessObj, lvl);
          el.textContent = formatLeft(accessObj, lvl);
          const pill = el.parentElement;
          if (left !== null && left <= 2) {
            pill.classList.add('pill-warn');
            pill.classList.remove('pill-neutral');
          }
        });
      }

      let CURRENT_UID = null;

      async function activateTrial(level) {
        if (!CURRENT_UID) return;
        const ref = doc(db, 'users', CURRENT_UID);
        const snap = await getDoc(ref);
        const data = snap.data() || {};

        const trialUsed = data.trialUsed || {};
        if (trialUsed[level]) {
          alert('La prueba ya fue usada para este nivel.');
          return;
        }

        const now = new Date();
        const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const newAccess = { ...(data.access || {}) };
        newAccess[level] = { freeUntil: trialEnd.toISOString() };

        await setDoc(
          ref,
          {
            access: newAccess,
            trialUsed: { ...trialUsed, [level]: true },
            updatedAt: serverTimestamp()},
          { merge: true },
        );

        const refreshed = await getDoc(ref);

        // Cargar metadata otra vez
        const metaData = await fetchAllCourseMeta();

        ACCESS_CACHE = refreshed.data()?.access || {};
        renderCourseCards(ACCESS_CACHE, metaData);
        renderLastActivity();
        alert(`✅ Activado: ${level} por 7 días`);
      }

      // Expose for inline onclick handlers
      window.activateTrial = activateTrial;

      // ===== Admin: edit course tile metadata (title/subtitle) =====
      let __editingLevel = null;

      function openEditMeta(level) {
        if (!IS_ADMIN) return;
        __editingLevel = level;
        const meta = META_CACHE && META_CACHE[level] ? META_CACHE[level] : {};
        document.getElementById('metaLevel').textContent = level;
        document.getElementById('metaTitle').value =
          meta.title || `Polaco ${level}`;
        document.getElementById('metaSubtitle').value = meta.subtitle || '';
        document.getElementById('metaTileBg').value = meta.tileBg || '';
        document.getElementById('metaTileText').value = meta.tileText || '';
        document.getElementById('metaPrimaryLabel').value =
          meta.primaryLabel || '';
        document.getElementById('metaPrimaryHref').value =
          meta.primaryHref || '';
        document.getElementById('metaBtnBg').value = meta.btnBg || '';
        document.getElementById('metaBtnText').value = meta.btnText || '';
        // delete UI (only for non-protected levels)
        const canDelete = !PROTECTED_LEVELS.has(level);
        const delWrap = document.getElementById('metaDeleteWrap');
        const delBtn = document.getElementById('metaDelete');
        const delChk = document.getElementById('metaDeleteWithData');

        if (delWrap) delWrap.style.display = canDelete ? 'block' : 'none';
        if (delBtn) delBtn.style.display = canDelete ? 'inline-flex' : 'none';
        if (delChk) delChk.checked = false;

        document.getElementById('metaModal').style.display = 'flex';
      }

      function closeEditMeta() {
        document.getElementById('metaModal').style.display = 'none';
        __editingLevel = null;
      }

      async function saveEditMeta() {
        if (!IS_ADMIN) return;
        if (!__editingLevel) return;
        const level = __editingLevel;
        const title = document.getElementById('metaTitle').value.trim();
        const subtitle = document.getElementById('metaSubtitle').value.trim();
        const tileBg = document.getElementById('metaTileBg').value.trim();
        const tileText = document.getElementById('metaTileText').value.trim();
        const primaryLabel = document
          .getElementById('metaPrimaryLabel')
          .value.trim();
        const primaryHref = document
          .getElementById('metaPrimaryHref')
          .value.trim();
        const btnBg = document.getElementById('metaBtnBg').value.trim();
        const btnText = document.getElementById('metaBtnText').value.trim();

        try {
          const metaRef = doc(db, 'course_meta', level);
          await setDoc(
            metaRef,
            {
              title,
              subtitle,
              tileBg: tileBg || null,
              tileText: tileText || null,
              primaryLabel: primaryLabel || null,
              primaryHref: primaryHref || null,
              btnBg: btnBg || null,
              btnText: btnText || null,
              updatedAt: serverTimestamp()},
            { merge: true },
          );

          META_CACHE = META_CACHE || {};
          META_CACHE[level] = {
            ...(META_CACHE[level] || {}),
            title,
            subtitle,
            tileBg,
            tileText,
            primaryLabel,
            primaryHref,
            btnBg,
            btnText};

          // refresh tiles
          if (CURRENT_UID) {
            const userRef = doc(db, 'users', CURRENT_UID);
            const userSnap = await getDoc(userRef);
            ACCESS_CACHE = userSnap.data()?.access || {};
            renderCourseCards(ACCESS_CACHE, META_CACHE);
            renderLastActivity();
          }
          closeEditMeta();
        } catch (e) {
          console.error(e);
          alert('No se pudo guardar. Revisa permisos/reglas y consola.');
        }
      }

      const PROTECTED_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);

      async function deleteAllByLevel(collectionName, level) {
        // deletes documents in batches (safe for medium datasets)
        let deleted = 0;
        let lastDoc = null;

        while (true) {
          let q = query(
            collection(db, collectionName),
            where('level', '==', level),
            orderBy('__name__'),
            limit(200),
          );
          if (lastDoc)
            q = query(
              collection(db, collectionName),
              where('level', '==', level),
              orderBy('__name__'),
              startAfter(lastDoc),
              limit(200),
            );

          const snap = await getDocs(q);
          if (snap.empty) break;

          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();

          deleted += snap.size;
          lastDoc = snap.docs[snap.docs.length - 1];

          if (snap.size < 200) break;
        }
        return deleted;
      }

      async function deleteCourseFlow() {
        if (!IS_ADMIN) return;
        if (!__editingLevel) return;

        const level = __editingLevel;
        if (PROTECTED_LEVELS.has(level)) {
          alert('Este curso está protegido y no se puede eliminar desde aquí.');
          return;
        }

        const withData =
          !!document.getElementById('metaDeleteWithData')?.checked;
        const msg = withData
          ? `Vas a ELIMINAR el curso "${level}" (tarjeta + temas + ejercicios).\n\nEscribe ELIMINAR para confirmar:`
          : `Vas a ELIMINAR la tarjeta del curso "${level}".\n(Los temas/ejercicios se quedan.)\n\nEscribe ELIMINAR para confirmar:`;

        const typed = prompt(msg, '');
        if ((typed || '').trim().toUpperCase() !== 'ELIMINAR') return;

        try {
          // delete meta
          await deleteDoc(doc(db, 'course_meta', level));

          // optionally delete data
          let deletedCourses = 0,
            deletedExercises = 0;
          if (withData) {
            deletedCourses = await deleteAllByLevel('courses', level);
            deletedExercises = await deleteAllByLevel('exercises', level);
          }

          // update caches + UI
          if (META_CACHE && META_CACHE[level]) delete META_CACHE[level];
          if (ACCESS_CACHE && ACCESS_CACHE[level]) delete ACCESS_CACHE[level];

          if (CURRENT_UID) {
            const userRef = doc(db, 'users', CURRENT_UID);
            const userSnap = await getDoc(userRef);
            ACCESS_CACHE = userSnap.data()?.access || {};
          }

          renderCourseCards(ACCESS_CACHE || {}, META_CACHE || {});
          renderLastActivity();

          closeEditMeta();
          alert(
            withData
              ? `Eliminado: ${level}.\nBorrados: temas=${deletedCourses}, ejercicios=${deletedExercises}.`
              : `Eliminado: tarjeta ${level}.`,
          );
        } catch (e) {
          console.error(e);
          alert('No se pudo eliminar. Revisa permisos/reglas y consola.');
        }
      }

      // expose for inline onclick
      window.openEditMeta = openEditMeta;

      // ===== Admin: Add new course =====
      function openAddCourse() {
        if (!IS_ADMIN) return;
        document.getElementById('newCourseLevel').value = '';
        document.getElementById('newCourseTitle').value = '';
        document.getElementById('newCourseSubtitle').value = '';
        document.getElementById('newCourseTileBg').value = '';
        document.getElementById('newCourseTileText').value = '';
        document.getElementById('newCoursePrimaryLabel').value = '';
        document.getElementById('newCoursePrimaryHref').value = '';
        document.getElementById('newCourseBtnBg').value = '';
        document.getElementById('newCourseBtnText').value = '';
        document.getElementById('addCourseModal').style.display = 'flex';
        setTimeout(
          () => document.getElementById('newCourseLevel')?.focus(),
          50,
        );
      }
      function closeAddCourse() {
        document.getElementById('addCourseModal').style.display = 'none';
      }

      function normalizeCourseId(raw) {
        const s = (raw || '').trim().toUpperCase();
        // allow A1, B2, C1, "ESP_BASICO", "A1-PLUS"
        if (!/^[A-Z0-9_-]{1,12}$/.test(s)) return null;
        return s;
      }

      async function createNewCourse() {
        if (!IS_ADMIN) return;

        const rawLevel = document.getElementById('newCourseLevel').value;
        const level = normalizeCourseId(rawLevel);
        if (!level) {
          alert(
            '⚠️ El ID debe tener 1–12 caracteres: A-Z, 0-9, _ o - (ej.: C1, A1-PLUS).',
          );
          return;
        }

        const title =
          document.getElementById('newCourseTitle').value.trim() ||
          `Polaco ${level}`;
        const subtitle = document
          .getElementById('newCourseSubtitle')
          .value.trim();
        const tileBg = document.getElementById('newCourseTileBg').value.trim();
        const tileText = document
          .getElementById('newCourseTileText')
          .value.trim();
        const primaryLabel = document
          .getElementById('newCoursePrimaryLabel')
          .value.trim();
        const primaryHref = document
          .getElementById('newCoursePrimaryHref')
          .value.trim();
        const btnBg = document.getElementById('newCourseBtnBg').value.trim();
        const btnText = document
          .getElementById('newCourseBtnText')
          .value.trim();

        try {
          const metaRef = doc(db, 'course_meta', level);
          const exists = await getDoc(metaRef);
          if (exists.exists()) {
            alert('⚠️ Ya existe un curso con este ID. Elige otro.');
            return;
          }

          await setDoc(metaRef, {
            title,
            subtitle,
            tileBg: tileBg || null,
            tileText: tileText || null,
            primaryLabel: primaryLabel || null,
            primaryHref: primaryHref || null,
            btnBg: btnBg || null,
            btnText: btnText || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()});

          // refresh meta + tiles
          const metaData = await fetchAllCourseMeta();
          META_CACHE = metaData;
          renderCourseCards(ACCESS_CACHE || {}, metaData);
          renderLastActivity();

          closeAddCourse();
          alert('✅ Curso creado. Ahora puedes entrar y añadir temas.');
        } catch (e) {
          console.error(e);
          alert('No se pudo crear el curso. Revisa permisos/reglas y consola.');
        }
      }

      window.openAddCourse = openAddCourse;

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.href = 'login.html';
          return;
        }

        userEmailEl.textContent = user.email || '(sin correo)';
        const __isAdmin = isAdminEmail(user.email);
        IS_ADMIN = __isAdmin;
        window.__isAdmin = __isAdmin;
        const adminBadge = document.getElementById('adminBadge');
        if (adminBadge) {
          adminBadge.textContent = __isAdmin ? '(admin: SÍ)' : '(admin: NO)';
          adminBadge.style.color = __isAdmin
            ? '#FCD116'
            : 'rgba(255,255,255,0.75)';
        }

        CURRENT_UID = user.uid;

        // mostrar enlace al administrador (si es email de admin)
        if (__isAdmin) {
          adminLinkWrap.classList.add('show');
        }

        const ref = doc(db, 'users', user.uid);
        let snap = await getDoc(ref);

        // si el usuario no existe en la colección users -> establecer A1 prueba = 7 días
        if (!snap.exists()) {
          const isAdmin = __isAdmin;
          const now = new Date();
          const trialEnd = new Date();

          if (isAdmin) {
            document
              .querySelectorAll('.admin-only')
              .forEach((b) => (b.style.display = 'inline-flex'));
            // Admin: acceso ilimitado a todos los cursos (hasta año 2099)
            trialEnd.setFullYear(2099);
          } else {
            // Usuario regular: A1 por 7 días
            trialEnd.setDate(now.getDate() + 7);
          }

          await setDoc(ref, {
            email: user.email || null,
            createdAt: serverTimestamp(),
            access: isAdmin
              ? {
                  A1: { freeUntil: trialEnd.toISOString() },
                  A2: { freeUntil: trialEnd.toISOString() },
                  B1: { freeUntil: trialEnd.toISOString() },
                  B2: { freeUntil: trialEnd.toISOString() }}
              : {
                  A1: { freeUntil: trialEnd.toISOString() },
                  A2: null,
                  B1: null,
                  B2: null}});

          snap = await getDoc(ref);
        }

        // Si es admin, asegurarse de que tiene acceso a todos los cursos
        if (__isAdmin) {
          const trialEnd = new Date();
          trialEnd.setFullYear(2099);

          await setDoc(
            ref,
            {
              ...snap.data(),
              access: {
                A1: { freeUntil: trialEnd.toISOString() },
                A2: { freeUntil: trialEnd.toISOString() },
                B1: { freeUntil: trialEnd.toISOString() },
                B2: { freeUntil: trialEnd.toISOString() }}},
            { merge: true },
          );

          snap = await getDoc(ref);
        }
        const metaData = await fetchAllCourseMeta();
        const data = snap.data();
        META_CACHE = metaData;
        ACCESS_CACHE = data?.access || {};
        renderCourseCards(ACCESS_CACHE, metaData);
        renderLastActivity();
      });

      window.logout = function () {
        signOut(auth).then(() => (window.location.href = 'login.html'));
      };

      // ===== SITE SETTINGS (Firestore) =====
      const SETTINGS_REF = doc(db, 'site_settings', 'panel_es');

      const DEFAULT_SETTINGS = {
        prices: {
          A1A2: '180 zł / 3 meses',
          B1: '250 zł / 3 meses',
          B2: '350 zł / 3 meses'},
        trialDays: { A1: 7, A2: 7, B1: 7, B2: 7 },
        promos: [], // {code, pct, days}
        extraButtons: [], // {text, href, style}
        texts: {
          pricing_title: 'Planes y precios',
          buy_label: 'Comprar acceso',
          enter_label: 'Entrar al curso →',
          extend_label: 'Extender acceso',
          unlock_label: 'Desbloquear el curso'}};

      let siteSettings = structuredClone(DEFAULT_SETTINGS);

      function isAdminUser(userEmail) {
        return ADMIN_EMAILS.includes(userEmail);
      }

      function applySettingsToUI() {
        // prices
        const p = siteSettings.prices || {};
        const elA = document.getElementById('price_A1A2');
        if (elA && p.A1A2) elA.textContent = p.A1A2;
        const elB1 = document.getElementById('price_B1');
        if (elB1 && p.B1) elB1.textContent = p.B1;
        const elB2 = document.getElementById('price_B2');
        if (elB2 && p.B2) elB2.textContent = p.B2;

        // pricing title
        const t = siteSettings.texts || {};
        const pricingTitle = document.querySelector(
          '[data-editable-key="pricing_title"]',
        );
        if (pricingTitle && t.pricing_title)
          pricingTitle.textContent = t.pricing_title;

        // buy labels in pricing section
        document
          .querySelectorAll('#pricingSection a[data-editable-key="buy_label"]')
          .forEach((a) => {
            if (t.buy_label) a.textContent = t.buy_label;
          });

        // promos list preview
        renderPromoList();

        // extra buttons preview + render into pricing section
        renderExtraButtons();
      }

      async function loadSettings() {
        try {
          const snap = await getDoc(SETTINGS_REF);
          if (snap.exists()) {
            const data = snap.data();
            siteSettings = {
              ...DEFAULT_SETTINGS,
              ...data,
              prices: { ...DEFAULT_SETTINGS.prices, ...(data.prices || {}) },
              trialDays: {
                ...DEFAULT_SETTINGS.trialDays,
                ...(data.trialDays || {})},
              texts: { ...DEFAULT_SETTINGS.texts, ...(data.texts || {}) },
              promos: Array.isArray(data.promos) ? data.promos : [],
              extraButtons: Array.isArray(data.extraButtons)
                ? data.extraButtons
                : []};
          } else {
            siteSettings = structuredClone(DEFAULT_SETTINGS);
          }
          applySettingsToUI();
        } catch (e) {
          console.error('loadSettings', e);
        }
      }

      async function saveSettingsLegacy() {
        if (!window.__isAdmin) return;
        // pull current UI text edits (contenteditable)
        document.querySelectorAll('[data-editable-key]').forEach((el) => {
          const key = el.getAttribute('data-editable-key');
          siteSettings.texts = siteSettings.texts || {};
          siteSettings.texts[key] = el.textContent.trim();
        });

        // pull admin modal inputs
        siteSettings.prices = siteSettings.prices || {};
        siteSettings.prices.A1A2 =
          document.getElementById('adm_price_A1A2').value.trim() ||
          siteSettings.prices.A1A2;
        siteSettings.prices.B1 =
          document.getElementById('adm_price_B1').value.trim() ||
          siteSettings.prices.B1;
        siteSettings.prices.B2 =
          document.getElementById('adm_price_B2').value.trim() ||
          siteSettings.prices.B2;

        siteSettings.trialDays = siteSettings.trialDays || {};
        ['A1', 'A2', 'B1', 'B2'].forEach((lvl) => {
          const v = document.getElementById('adm_trial_' + lvl).value.trim();
          if (v !== '')
            siteSettings.trialDays[lvl] =
              Number(v) || siteSettings.trialDays[lvl];
        });

        try {
          await setDoc(SETTINGS_REF, siteSettings, { merge: true });
          closeAdminPanel();
          await loadSettings();
          alert('✅ Guardado');
        } catch (e) {
          console.error('saveSettings', e);
          alert('❌ Error al guardar (Firestore rules?)');
        }
      }

      async function reloadSettings() {
        await loadSettings();
        alert('↩️ Restaurado');
      }

      // ===== Admin modal =====
      function openAdminPanel() {
        if (!window.__isAdmin) return;
        document.getElementById('adminModal').style.display = 'block';

        // populate inputs from current settings
        document.getElementById('adm_price_A1A2').value =
          siteSettings.prices?.A1A2 || '';
        document.getElementById('adm_price_B1').value =
          siteSettings.prices?.B1 || '';
        document.getElementById('adm_price_B2').value =
          siteSettings.prices?.B2 || '';

        ['A1', 'A2', 'B1', 'B2'].forEach((lvl) => {
          document.getElementById('adm_trial_' + lvl).value = String(
            siteSettings.trialDays?.[lvl] ?? 7,
          );
        });

        renderPromoList();
        renderExtraButtons();
      }
      function closeAdminPanel() {
        document.getElementById('adminModal').style.display = 'none';
      }

      // ===== Promos =====
      function addPromo() {
        if (!window.__isAdmin) return;
        const code = document.getElementById('adm_promo_code').value.trim();
        const pct = Number(
          document.getElementById('adm_promo_pct').value.trim() || 0,
        );
        const days = Number(
          document.getElementById('adm_promo_days').value.trim() || 0,
        );
        if (!code) return;
        siteSettings.promos = siteSettings.promos || [];
        siteSettings.promos.push({ code, pct, days });
        document.getElementById('adm_promo_code').value = '';
        document.getElementById('adm_promo_pct').value = '';
        document.getElementById('adm_promo_days').value = '';
        renderPromoList();
      }
      function clearPromos() {
        if (!window.__isAdmin) return;
        siteSettings.promos = [];
        renderPromoList();
      }
      function renderPromoList() {
        const box = document.getElementById('promoList');
        if (!box) return;
        const promos = siteSettings.promos || [];
        if (!promos.length) {
          box.innerHTML = '<span style="opacity:.85;">Sin códigos</span>';
          return;
        }
        box.innerHTML = promos
          .map((p, i) => {
            const d = p.days ? ` +${p.days} días` : '';
            const pct = p.pct ? `-${p.pct}%` : '';
            return `<div style="display:flex; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:12px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.06); margin-bottom:8px;">
            <div style="font-weight:900;">${p.code}</div>
            <div style="opacity:.9;">${pct}${d}</div>
          </div>`;
          })
          .join('');
      }

      // ===== Extra buttons (pricing section) =====
      function addExtraButton() {
        if (!window.__isAdmin) return;
        const textB = document.getElementById('adm_btn_text').value.trim();
        const href =
          document.getElementById('adm_btn_href').value.trim() || '#';
        const style = document.getElementById('adm_btn_style').value;
        if (!textB) return;
        siteSettings.extraButtons = siteSettings.extraButtons || [];
        siteSettings.extraButtons.push({ text: textB, href, style });
        document.getElementById('adm_btn_text').value = '';
        document.getElementById('adm_btn_href').value = '';
        renderExtraButtons();
      }
      function clearExtraButtons() {
        if (!window.__isAdmin) return;
        siteSettings.extraButtons = [];
        renderExtraButtons();
      }
      function renderExtraButtons() {
        const wrap = document.getElementById('extraButtonsPreview');
        if (!wrap) return;
        const btns = siteSettings.extraButtons || [];
        wrap.innerHTML = btns.length
          ? btns
              .map((b, i) => {
                const cls =
                  b.style === 'yellow' ? 'btn-yellow' : 'btn-white-outline';
                return `<a class="${cls}" style="display:inline-flex; margin:6px 8px 0 0;" href="${b.href}">${b.text}</a>`;
              })
              .join('')
          : '<span style="opacity:.85;">Sin botones</span>';

        // also render into pricing section under the grid
        const sec = document.getElementById('pricingSection');
        if (!sec) return;
        let host = document.getElementById('extraButtonsHost');
        if (!host) {
          host = document.createElement('div');
          host.id = 'extraButtonsHost';
          host.style.marginTop = '16px';
          sec.appendChild(host);
        }
        host.innerHTML = btns.length
          ? btns
              .map((b) => {
                const cls =
                  b.style === 'yellow' ? 'btn-yellow' : 'btn-white-outline';
                return `<a class="${cls}" style="display:inline-flex; margin:6px 8px 0 0;" href="${b.href}">${b.text}</a>`;
              })
              .join('')
          : '';
      }

      // ===== Text editor (whole page) =====
      let editMode = false;
      function toggleEditMode() {
        if (!window.__isAdmin) return;
        editMode = !editMode;

        // only elements explicitly marked by data-editable-key
        document.querySelectorAll('[data-editable-key]').forEach((el) => {
          el.contentEditable = editMode;
          el.style.outline = editMode ? '2px dashed #FCD116' : 'none';
        });

        document.getElementById('toggleEdit').textContent = editMode
          ? '💾 Guardar textos'
          : '✏️ Editar textos';
        if (!editMode) {
          // persist texts into settings (still need Guardar en Firestore to publish)
          document.querySelectorAll('[data-editable-key]').forEach((el) => {
            const key = el.getAttribute('data-editable-key');
            siteSettings.texts = siteSettings.texts || {};
            siteSettings.texts[key] = el.textContent.trim();
          });
          alert('Textos listos. Ahora: ⚙️ Admin → Guardar en Firestore');
        }
      }

      // ===== Hook: admin-only visibility =====

      // Modal hooks
      document
        .getElementById('metaClose')
        ?.addEventListener('click', closeEditMeta);
      document
        .getElementById('metaCancel')
        ?.addEventListener('click', closeEditMeta);
      document
        .getElementById('metaSave')
        ?.addEventListener('click', saveEditMeta);
      document
        .getElementById('metaDelete')
        ?.addEventListener('click', deleteCourseFlow);
      document.getElementById('metaModal')?.addEventListener('click', (e) => {
        if (e.target?.id === 'metaModal') closeEditMeta();
      });

      document
        .getElementById('openSettingsBtn')
        ?.addEventListener('click', openSettings);
      document
        .getElementById('closeSettingsBtn')
        ?.addEventListener('click', closeSettings);
      document
        .getElementById('saveSettingsBtn')
        ?.addEventListener('click', saveSettings);
      document
        .getElementById('resetSettingsBtn')
        ?.addEventListener('click', resetSettings);
      document
        .getElementById('addPromoBtn')
        ?.addEventListener('click', upsertPromo);
      document
        .getElementById('settingsModal')
        ?.addEventListener('click', (e) => {
          if (e.target?.id === 'settingsModal') closeSettings();
        });
      document
        .querySelectorAll('#settingsModal .tabBtn')
        .forEach((b) =>
          b.addEventListener('click', () => switchSettingsTab(b.dataset.tab)),
        );

      document
        .getElementById('addCourseBtn')
        ?.addEventListener('click', openAddCourse);
      document
        .getElementById('addCourseClose')
        ?.addEventListener('click', closeAddCourse);
      document
        .getElementById('addCourseCancel')
        ?.addEventListener('click', closeAddCourse);
      document
        .getElementById('addCourseCreate')
        ?.addEventListener('click', createNewCourse);
      document
        .getElementById('addCourseModal')
        ?.addEventListener('click', (e) => {
          if (e.target?.id === 'addCourseModal') closeAddCourse();
        });

      // ===== Admin: Settings modal (Planes/Precios + Promos) =====
      const SETTINGS_PLANS = ['A1A2', 'B1', 'B2'];

      function ensurePlanUI() {
        if (!siteSettings.planUI) siteSettings.planUI = {};
        SETTINGS_PLANS.forEach((k) => {
          if (!siteSettings.planUI[k]) siteSettings.planUI[k] = {};
        });
      }

      function normHex(v) {
        const s = (v || '').trim();
        if (!s) return '';
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
        return s; // pozwól wpisać też np. 'red' jeśli chcesz, ale preferuj #RRGGBB
      }

      function applyPlanUI() {
        ensurePlanUI();
        SETTINGS_PLANS.forEach((k) => {
          const tile = document.querySelector(
            `#pricingSection .course-tile[data-plan="${k}"]`,
          );
          if (!tile) return;
          const ui = siteSettings.planUI[k] || {};
          const bg = normHex(ui.tileBg);
          const tx = normHex(ui.tileText);
          if (bg) tile.style.background = bg;
          if (tx) tile.style.color = tx;

          const btn = tile.querySelector('a[data-buy-btn="1"]');
          if (btn) {
            if (ui.btnLabel) btn.textContent = ui.btnLabel;
            if (ui.btnHref) btn.setAttribute('href', ui.btnHref);
            const bbg = normHex(ui.btnBg);
            const btx = normHex(ui.btnText);
            if (bbg) btn.style.background = bbg;
            if (btx) btn.style.color = btx;
            if (bbg) btn.style.borderColor = bbg;
          }
        });
      }

      // extend existing applySettingsToUI by re-calling plan UI after settings loaded
      const __origApplySettingsToUI = applySettingsToUI;
      applySettingsToUI = function () {
        __origApplySettingsToUI();
        applyPlanUI();
      };

      function openSettings() {
        if (!IS_ADMIN) return;
        ensurePlanUI();

        // fill fields
        document.getElementById('set_price_A1A2').value =
          siteSettings?.prices?.A1A2 || '';
        document.getElementById('set_price_B1').value =
          siteSettings?.prices?.B1 || '';
        document.getElementById('set_price_B2').value =
          siteSettings?.prices?.B2 || '';

        // plan ui
        const fill = (k) => {
          const ui = siteSettings.planUI[k] || {};
          document.getElementById(`set_tileBg_${k}`).value = ui.tileBg || '';
          document.getElementById(`set_tileText_${k}`).value =
            ui.tileText || '';
          document.getElementById(`set_btnBg_${k}`).value = ui.btnBg || '';
          document.getElementById(`set_btnText_${k}`).value = ui.btnText || '';
          document.getElementById(`set_btnLabel_${k}`).value =
            ui.btnLabel || '';
          document.getElementById(`set_btnHref_${k}`).value = ui.btnHref || '';
        };
        SETTINGS_PLANS.forEach(fill);

        // promos
        loadPromoCodes();

        document.getElementById('settingsModal').style.display = 'flex';
      }

      function closeSettings() {
        document.getElementById('settingsModal').style.display = 'none';
      }

      function switchSettingsTab(tabId) {
        document.querySelectorAll('#settingsModal .tabBtn').forEach((b) => {
          b.classList.toggle('active', b.dataset.tab === tabId);
        });
        document.getElementById('tabPlans').style.display =
          tabId === 'tabPlans' ? '' : 'none';
        document.getElementById('tabPromos').style.display =
          tabId === 'tabPromos' ? '' : 'none';
      }

      async function saveSettings() {
        if (!IS_ADMIN) return;
        ensurePlanUI();

        const next = structuredClone(siteSettings);

        next.prices = {
          ...(next.prices || {}),
          A1A2:
            document.getElementById('set_price_A1A2').value.trim() ||
            next.prices?.A1A2 ||
            '',
          B1:
            document.getElementById('set_price_B1').value.trim() ||
            next.prices?.B1 ||
            '',
          B2:
            document.getElementById('set_price_B2').value.trim() ||
            next.prices?.B2 ||
            ''};

        SETTINGS_PLANS.forEach((k) => {
          next.planUI[k] = {
            ...(next.planUI[k] || {}),
            tileBg: normHex(document.getElementById(`set_tileBg_${k}`).value),
            tileText: normHex(
              document.getElementById(`set_tileText_${k}`).value,
            ),
            btnBg: normHex(document.getElementById(`set_btnBg_${k}`).value),
            btnText: normHex(document.getElementById(`set_btnText_${k}`).value),
            btnLabel: document.getElementById(`set_btnLabel_${k}`).value.trim(),
            btnHref: document.getElementById(`set_btnHref_${k}`).value.trim()};
        });

        try {
          await setDoc(
            SETTINGS_REF,
            {
              ...next,
              updatedAt: serverTimestamp()},
            { merge: true },
          );

          siteSettings = next;
          applySettingsToUI();
          closeSettings();
        } catch (err) {
          console.error(err);
          alert('No se pudo guardar ajustes. Mira consola.');
        }
      }

      function resetSettings() {
        if (!IS_ADMIN) return;
        siteSettings = structuredClone(DEFAULT_SETTINGS);
        applySettingsToUI();
        openSettings(); // reopen with defaults
      }

      // ===== Promo codes (discounts / free days) =====
      const PROMOS_COL = collection(db, 'promo_codes');
      let PROMO_CACHE = [];

      async function loadPromoCodes() {
        try {
          const snap = await getDocs(PROMOS_COL);
          PROMO_CACHE = [];
          snap.forEach((d) => {
            PROMO_CACHE.push({ id: d.id, ...d.data() });
          });
          // sort: newest first if timestamps present
          PROMO_CACHE.sort((a, b) => {
            const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
            const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
            return tb - ta;
          });
          renderPromoCodes();
        } catch (err) {
          console.error(err);
        }
      }

      function renderPromoCodes() {
        const wrap = document.getElementById('promoList');
        if (!wrap) return;
        if (!PROMO_CACHE.length) {
          wrap.innerHTML =
            '<div class="mini" style="margin-top:10px; opacity:.85;">Brak kodów.</div>';
          return;
        }
        wrap.innerHTML = PROMO_CACHE.map((p) => {
          const code = p.code || p.id;
          const pct = Number(p.pct || p.percentOff || 0) || 0;
          const days = Number(p.days || p.freeDays || 0) || 0;
          const active = p.active !== false;
          const note = p.note ? String(p.note) : '';
          return `
            <div class="promoItem">
              <div>
                <strong>${code}</strong> ${active ? '<span class="pill" style="margin-left:8px; background:rgba(34,197,94,.18); border:1px solid rgba(34,197,94,.45);">activo</span>' : '<span class="pill" style="margin-left:8px; background:rgba(239,68,68,.18); border:1px solid rgba(239,68,68,.45);">off</span>'}
                <div class="meta">Rabat: <b>${pct}%</b> • Dni gratis: <b>${days}</b>${note ? ` • ${note}` : ''}</div>
              </div>
              <div class="btns">
                <button class="btn-white-outline" type="button" onclick="editPromo('${code.replace(/'/g, '&#39;')}')">✏️ Editar</button>
                <button class="btn-white-outline" type="button" onclick="togglePromo('${code.replace(/'/g, '&#39;')}')">${active ? '⏸ Desactivar' : '▶ Activar'}</button>
              </div>
            </div>
          `;
        }).join('');
      }

      function editPromo(code) {
        const p = PROMO_CACHE.find((x) => (x.code || x.id) === code);
        if (!p) return;
        document.getElementById('promo_code').value = (
          p.code ||
          p.id ||
          ''
        ).toUpperCase();
        document.getElementById('promo_pct').value = String(
          p.pct ?? p.percentOff ?? 0,
        );
        document.getElementById('promo_days').value = String(
          p.days ?? p.freeDays ?? 0,
        );
        document.getElementById('promo_active').value = String(
          p.active !== false,
        );
        document.getElementById('promo_note').value = p.note || '';
        switchSettingsTab('tabPromos');
      }

      async function togglePromo(code) {
        if (!IS_ADMIN) return;
        const p = PROMO_CACHE.find((x) => (x.code || x.id) === code);
        if (!p) return;
        const nextActive = !(p.active !== false);
        try {
          await setDoc(
            doc(db, 'promo_codes', code),
            {
              code,
              active: nextActive,
              updatedAt: serverTimestamp()},
            { merge: true },
          );
          await loadPromoCodes();
        } catch (err) {
          console.error(err);
          alert('No se pudo actualizar promo. Mira consola.');
        }
      }

      async function upsertPromo() {
        if (!IS_ADMIN) return;
        const code = (document.getElementById('promo_code').value || '')
          .trim()
          .toUpperCase();
        if (!code) {
          alert('Escribe un código.');
          return;
        }
        const pct = Math.max(
          0,
          Math.min(
            100,
            Number(document.getElementById('promo_pct').value || 0) || 0,
          ),
        );
        const days = Math.max(
          0,
          Math.min(
            365,
            Number(document.getElementById('promo_days').value || 0) || 0,
          ),
        );
        const active = document.getElementById('promo_active').value === 'true';
        const note = (document.getElementById('promo_note').value || '').trim();

        try {
          await setDoc(
            doc(db, 'promo_codes', code),
            {
              code,
              pct,
              days,
              note,
              active,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp()},
            { merge: true },
          );
          // clear
          document.getElementById('promo_code').value = '';
          document.getElementById('promo_pct').value = '';
          document.getElementById('promo_days').value = '';
          document.getElementById('promo_note').value = '';
          document.getElementById('promo_active').value = 'true';
          await loadPromoCodes();
        } catch (err) {
          console.error(err);
          alert('No se pudo guardar código. Mira consola.');
        }
      }

      window.__isAdmin = false;

      // (legacy admin settings removed — duplicated declarations)
