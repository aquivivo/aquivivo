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

const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];
        const isAdmin = (email) =>
          ADMIN_EMAILS.some(
            (a) => (a || '').toLowerCase() === (email || '').toLowerCase(),
          );
        const $ = (id) => document.getElementById(id);

        const toast = $('toast');
        const btnLogout = $('btnLogout');
        const btnPanel = $('btnPanel');
        const btnEjercicios = $('btnEjercicios');
        const btnInicio = $('btnInicio');
        const btnAtras = $('btnAtras');
        const pillAdminLink = $('pillAdminLink');

        const lessonTitleEl = $('lessonTitle');
        const lessonDescEl = $('lessonDesc');
        const pillLevel = $('pillLevel');
        const pillTopic = $('pillTopic');
        const pillType = $('pillType');
        const pillDuration = $('pillDuration');
        const pillPub = $('pillPub');

        const tocWrap = $('tocWrap');
        const tocList = $('tocList');
        const readTools = $('readTools');
        const readProgressFill = $('readProgressFill');
        const readProgressText = $('readProgressText');
        const exerciseLinksWrap = $('exerciseLinksWrap');

        const lessonContent = $('lessonContent');
        const lessonEmpty = $('lessonEmpty');
        const studentHint = $('studentHint');

        const params = new URLSearchParams(location.search);
        let LEVEL = (params.get('level') || '').toUpperCase();
        let TOPIC_ID = (params.get('id') || '').trim();
        let TOPIC_INFO = null;

        function getLastLessonFromStorage() {
          try {
            const global = localStorage.getItem('aquivivo_lastLesson_global');
            if (global) {
              const parsed = JSON.parse(global);
              if (parsed?.level && parsed?.id) {
                return {
                  level: String(parsed.level).toUpperCase(),
                  id: String(parsed.id)};
              }
            }
            let fallback = null;
            for (let i = 0; i < localStorage.length; i += 1) {
              const k = localStorage.key(i);
              if (!k || !k.startsWith('aquivivo_lastLesson_')) continue;
              const level = k.replace('aquivivo_lastLesson_', '').toUpperCase();
              const id = localStorage.getItem(k);
              if (level && id) fallback = { level, id };
            }
            return fallback;
          } catch (e) {
            return null;
          }
        }

        if (!LEVEL || !TOPIC_ID) {
          const last = getLastLessonFromStorage();
          if (last?.level && last?.id) {
            LEVEL = last.level;
            TOPIC_ID = last.id;
            const url = new URL(location.href);
            url.searchParams.set('level', LEVEL);
            url.searchParams.set('id', TOPIC_ID);
            history.replaceState(null, '', url.toString());
          }
        }

        function getLessonDocId(topicInfo) {
          const slug = (topicInfo?.slug || TOPIC_ID || '').toString().trim();
          return `${LEVEL}__${slug}`;
        }

        async function loadTopicInfo() {
          const fallback = { title: '', desc: '', slug: TOPIC_ID };
          if (!LEVEL || !TOPIC_ID) return fallback;
          try {
            // 1) treat TOPIC_ID as Firestore doc id
            const byId = await getDoc(doc(db, 'courses', TOPIC_ID));
            if (byId.exists()) {
              const d = byId.data() || {};
              return {
                title: (d.title || d.name || d.topic || '').toString(),
                desc: (d.desc || d.description || '').toString(),
                slug: (d.slug || TOPIC_ID || '').toString()};
            }
          } catch (e) {
            /* ignore and try slug query */
          }

          try {
            // 2) treat TOPIC_ID as slug
            const qy = query(
              collection(db, 'courses'),
              where('level', '==', LEVEL),
              where('slug', '==', TOPIC_ID),
            );
            const snap = await getDocs(qy);
            if (!snap.empty) {
              const d = snap.docs[0].data() || {};
              return {
                title: (d.title || d.name || d.topic || '').toString(),
                desc: (d.desc || d.description || '').toString(),
                slug: (d.slug || TOPIC_ID || '').toString()};
            }
          } catch (e) {
            /* ignore */
          }

          return fallback;
        }

        if (btnInicio)
          btnInicio.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
        // btnEjercicios href is set after we resolve TOPIC_INFO (slug vs id)
        if (btnAtras) btnAtras.addEventListener('click', () => history.back());

        function showToast(msg, kind = 'toast-ok') {
          if (!toast) return;
          toast.className = kind;
          toast.textContent = msg;
          toast.style.display = 'block';
          clearTimeout(showToast._t);
          showToast._t = setTimeout(() => {
            toast.style.display = 'none';
          }, 2500);
        }

        function escapeHtml(s) {
          return String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
        }

        function slugifyHeading(text) {
          return (text || '')
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, '-')
            .slice(0, 60);
        }

        function buildTOC() {
          if (!tocWrap || !tocList) return;

          tocList.innerHTML = '';
          const root = lessonContent;
          if (!root || root.style.display === 'none') {
            tocWrap.style.display = 'none';
            return;
          }

          const headings = root.querySelectorAll('h2, h3');
          if (!headings.length) {
            tocWrap.style.display = 'none';
            return;
          }

          const used = new Set();
          headings.forEach((h) => {
            if (h.id) {
              used.add(h.id);
              return;
            }
            let id = slugifyHeading(h.textContent);
            if (!id) id = 'section';
            const base = id;
            let i = 2;
            while (used.has(id) || document.getElementById(id)) {
              id = `${base}-${i++}`;
            }
            used.add(id);
            h.id = id;
          });

          headings.forEach((h) => {
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.className = 'tocLink' + (h.tagName === 'H3' ? ' tocSub' : '');
            a.textContent =
              (h.textContent || '').trim() ||
              (h.tagName === 'H3' ? 'Subsección' : 'Sección');
            a.addEventListener('click', (e) => {
              e.preventDefault();
              document
                .getElementById(h.id)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              history.replaceState(null, '', `#${h.id}`);
            });
            tocList.appendChild(a);
          });

          tocWrap.style.display = 'block';
        }

        let _rpScheduled = false;
        function updateReadProgress() {
          if (!lessonContent || lessonContent.style.display === 'none') return;
          const docEl = document.documentElement;
          const scrollTop = docEl.scrollTop || document.body.scrollTop || 0;
          const scrollHeight =
            (docEl.scrollHeight || document.body.scrollHeight || 0) -
            (docEl.clientHeight || window.innerHeight || 0);
          const pct =
            scrollHeight <= 0
              ? 100
              : Math.max(
                  0,
                  Math.min(100, Math.round((scrollTop / scrollHeight) * 100)),
                );
          readProgressFill.style.width = `${pct}%`;
          readProgressText.textContent = `📖 Progreso de lectura: ${pct}%`;
        }
        function scheduleReadProgress() {
          if (_rpScheduled) return;
          _rpScheduled = true;
          requestAnimationFrame(() => {
            _rpScheduled = false;
            try {
              updateReadProgress();
            } catch (e) {}
          });
        }
        window.addEventListener('scroll', scheduleReadProgress, {
          passive: true});
        window.addEventListener('resize', scheduleReadProgress);

        function buildExerciseLinks(docData, topicInfo) {
          if (!exerciseLinksWrap) return;
          exerciseLinksWrap.innerHTML = '';

          // Minimal: one button to exercises page (keeps UI consistent)
          const a = document.createElement('a');
          a.className = 'btn btn-yellow';
          const eff = (topicInfo?.slug || TOPIC_ID || '').toString();
          a.href = `ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(eff)}`;
          a.textContent = '🧩 Ir a ejercicios';
          exerciseLinksWrap.appendChild(a);

          readTools.style.display = 'flex';
        }

        function renderLesson(docData, topicInfo) {
          pillLevel.textContent = `Nivel: ${LEVEL || '—'}`;
          const tName = (topicInfo?.title || '').trim();
          const tDesc = (topicInfo?.desc || '').trim();
          pillTopic.textContent = `Tema: ${tName || TOPIC_ID || '—'}`;

          const title = (docData?.title || '').trim();
          const desc = (docData?.desc || '').trim();
          const type = (docData?.type || '').trim();
          const dur = Number(docData?.durationMin || 0);
          const pub = !!docData?.published;

          lessonTitleEl.textContent =
            title || `Lección — ${tName || TOPIC_ID || 'tema'}`;
          lessonDescEl.textContent = desc || tDesc || '—';

          if (type) {
            pillType.style.display = 'inline-flex';
            pillType.textContent = `Tipo: ${type}`;
          } else {
            pillType.style.display = 'none';
          }
          if (dur > 0) {
            pillDuration.style.display = 'inline-flex';
            pillDuration.textContent = `Duración: ${dur} min`;
          } else {
            pillDuration.style.display = 'none';
          }

          pillPub.style.display = 'inline-flex';
          pillPub.className = 'pill ' + (pub ? 'pill-green' : 'pill-red');
          pillPub.textContent = pub ? 'Publicado' : 'Borrador';

          // Publication gating for students (if not published: show hint)
          if (!pub) {
            studentHint.style.display = 'block';
            studentHint.textContent =
              'Esta lección todavía no está publicada. Vuelve más tarde.';
            lessonContent.style.display = 'none';
            lessonEmpty.style.display = 'none';
            tocWrap.style.display = 'none';
            readTools.style.display = 'none';
            return;
          }

          const html = (docData?.html || '').trim();
          if (!html) {
            lessonContent.style.display = 'none';
            lessonEmpty.style.display = 'block';
            lessonEmpty.textContent = 'Todavía no hay contenido de la lección.';
            studentHint.style.display = 'none';
            tocWrap.style.display = 'none';
            readTools.style.display = 'none';
            return;
          }

          studentHint.style.display = 'none';
          lessonEmpty.style.display = 'none';
          lessonContent.style.display = 'block';
          lessonContent.innerHTML = html;

          setTimeout(buildTOC, 0);
          buildExerciseLinks(docData, topicInfo);
          updateReadProgress();
        }

        async function loadLesson(topicInfo) {
          if (!LEVEL || !TOPIC_ID) {
            lessonTitleEl.textContent = 'Error';
            lessonDescEl.textContent =
              'Faltan parámetros en la URL (level, id).';
            lessonEmpty.style.display = 'block';
            lessonEmpty.textContent =
              'Abre por ejemplo: lessonpage.html?level=A1&id=tuTopicSlug';
            return;
          }

          const ref = doc(db, 'course_meta', getLessonDocId(topicInfo));
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            renderLesson({ published: false, html: '' }, topicInfo);
            lessonEmpty.style.display = 'block';
            lessonEmpty.textContent = 'No existe esta lección todavía.';
            return;
          }
          renderLesson(snap.data() || {}, topicInfo);
        }

        window.logout = async () => {
          try {
            await signOut(auth);
          } catch (e) {}
          location.href = 'login.html';
        };

        onAuthStateChanged(auth, async (user) => {
          if (!user) {
            location.href = 'login.html';
            return;
          }

          // Resolve topic title/desc + slug (so we don't show random IDs)
          TOPIC_INFO = await loadTopicInfo();
          const eff = (TOPIC_INFO?.slug || TOPIC_ID || '').toString();
          if (btnEjercicios)
            btnEjercicios.href = `ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(eff)}`;

          try {
            localStorage.setItem(
              'aquivivo_lastLesson_global',
              JSON.stringify({ level: LEVEL, id: eff, ts: Date.now() }),
            );
          } catch (e) {}

          // show admin link only for admin
          if (isAdmin(user.email)) {
            pillAdminLink.style.display = 'inline-flex';
            pillAdminLink.href = `lessonadmin.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(eff)}`;
          }
          try {
            await loadLesson(TOPIC_INFO);
          } catch (e) {
            console.error(e);
            showToast('Error cargando la lección.', 'toast-bad');
          }
        });
      });
