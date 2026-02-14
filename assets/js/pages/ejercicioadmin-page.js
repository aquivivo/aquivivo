import { auth, db, storage } from "../firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";


async function getIsAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() && snap.data()?.admin === true;
  } catch (e) {
    console.warn("Admin check failed", e);
    return false;
  }
}

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


      // URL params
      const params = new URLSearchParams(window.location.search);
      const LEVEL = (params.get('level') || 'A1').toUpperCase();
      
      const COURSE_ID = String(params.get('id') || '').trim();
      const slugParam = params.get('slug') || '';
      const idParam = params.get('id') || '';
      const HAS_TOPIC_PARAM = !!(idParam || slugParam);

      // UI refs
      const toast = document.getElementById('toast');
      const sessionEmail = document.getElementById('sessionEmail');
      const backToCourse = document.getElementById('backToCourse');
      const levelsBtn = document.getElementById('levelsBtn');
      const btnCopyLink = document.getElementById('btnCopyLink');
      const btnReload = document.getElementById('btnReload');

      const pillLevel = document.getElementById('pillLevel');
      const pillType = document.getElementById('pillType');
      const pillSlug = document.getElementById('pillSlug');
      const pillCount = document.getElementById('pillCount');

      // Lesson content (public view)
      const lessonContentCard = document.getElementById('lessonContentCard');
      const lessonContentBody = document.getElementById('lessonContentBody');
      const lessonContentEmpty = document.getElementById('lessonContentEmpty');
      const btnOpenLessonPage = document.getElementById('btnOpenLessonPage');

      const topicTitle = document.getElementById('topicTitle');
      const topicDesc = document.getElementById('topicDesc');
      const taskChips = document.getElementById('taskChips');

      const exerciseList = document.getElementById('exerciseList');
      const emptyExercises = document.getElementById('emptyExercises');
      const adminWrap = document.getElementById('adminWrap');

      // admin fields
      const exType = document.getElementById('exType');
      const exPrompt = document.getElementById('exPrompt');
      const exImageUrl = document.getElementById('exImageUrl');
      const exOptions = document.getElementById('exOptions');
      const exAnswer = document.getElementById('exAnswer');
      const exCategory = document.getElementById('exCategory');
      const exTags = document.getElementById('exTags');
      const exOrder = document.getElementById('exOrder');
      const exNotes = document.getElementById('exNotes');
      const flashImportArea = document.getElementById('flashImportArea');
      const btnImportFlashcards = document.getElementById('btnImportFlashcards');
      const btnClearFlashcards = document.getElementById('btnClearFlashcards');
      const flashImportStatus = document.getElementById('flashImportStatus');
      const flashAudioFile = document.getElementById('flashAudioFile');
      const btnUploadFlashAudio = document.getElementById('btnUploadFlashAudio');
      const flashAudioUrl = document.getElementById('flashAudioUrl');
      const btnCopyFlashAudio = document.getElementById('btnCopyFlashAudio');
      const flashAudioStatus = document.getElementById('flashAudioStatus');
      const bulkImportArea = document.getElementById('bulkImportArea');
      const btnBulkImport = document.getElementById('btnBulkImport');
      const btnBulkClear = document.getElementById('btnBulkClear');
      const bulkImportStatus = document.getElementById('bulkImportStatus');
      const bulkImportFile = document.getElementById('bulkImportFile');
      const btnLoadBulkFile = document.getElementById('btnLoadBulkFile');
      const bulkMapUse = document.getElementById('bulkMapUse');
      const bulkMapType = document.getElementById('bulkMapType');
      const bulkMapPrompt = document.getElementById('bulkMapPrompt');
      const bulkMapAnswer = document.getElementById('bulkMapAnswer');
      const bulkMapOptions = document.getElementById('bulkMapOptions');
      const bulkMapCategory = document.getElementById('bulkMapCategory');
      const bulkMapTags = document.getElementById('bulkMapTags');
      const bulkMapNotes = document.getElementById('bulkMapNotes');
      const bulkMapImage = document.getElementById('bulkMapImage');
      const bulkMapOrder = document.getElementById('bulkMapOrder');
      const bulkMapChips = document.getElementById('bulkMapChips');
      const mapValEls = {
        type: document.getElementById('mapValType'),
        prompt: document.getElementById('mapValPrompt'),
        answer: document.getElementById('mapValAnswer'),
        options: document.getElementById('mapValOptions'),
        category: document.getElementById('mapValCategory'),
        tags: document.getElementById('mapValTags'),
        notes: document.getElementById('mapValNotes'),
        imageUrl: document.getElementById('mapValImage'),
        order: document.getElementById('mapValOrder'),
      };
      const btnAddExercise = document.getElementById('btnAddExercise');
      const btnCancelEdit = document.getElementById('btnCancelEdit');
      const btnTplFill = document.getElementById('btnTplFill');
      const btnTplChoice = document.getElementById('btnTplChoice');
      const btnTplTF = document.getElementById('btnTplTF');
      const btnTplScene = document.getElementById('btnTplScene');
      const btnTplFindError = document.getElementById('btnTplFindError');
      const importJsonArea = document.getElementById('importJsonArea');
      const btnImportJson = document.getElementById('btnImportJson');
      const btnClearImport = document.getElementById('btnClearImport');
      const importStatus = document.getElementById('importStatus');
      const libLevel = document.getElementById('libLevel');
      const libSet = document.getElementById('libSet');
      const btnInsertLibrary = document.getElementById('btnInsertLibrary');
      const libStatus = document.getElementById('libStatus');

      // ===== Lesson meta (course_meta) =====
      const lessonMetaWrap = document.getElementById('lessonMetaWrap');
      const lessonTitleEs = document.getElementById('lessonTitleEs');
      const lessonDescEs = document.getElementById('lessonDescEs');
      const lessonImageUrl = document.getElementById('lessonImageUrl');
      const lessonHtml = document.getElementById('lessonHtml');
      const lessonObjectives = document.getElementById('lessonObjectives');
      const lessonGrammar = document.getElementById('lessonGrammar');
      const lessonVocab = document.getElementById('lessonVocab');
      const lessonDialog = document.getElementById('lessonDialog');
      const lessonSpeaking = document.getElementById('lessonSpeaking');
      const btnSaveLessonMeta = document.getElementById('btnSaveLessonMeta');
      const btnClearLessonMeta = document.getElementById('btnClearLessonMeta');
      const lessonMetaStatus = document.getElementById('lessonMetaStatus');

      function linesToArray(text) {
        return (text || '')
          .split('\n')
          .map((s) => s.replace(/^\s*[-*]\s*/, '').trim())
          .filter(Boolean);
      }
      function arrayToLines(arr) {
        return Array.isArray(arr) ? arr.join('\n') : '';
      }

      function getLessonMetaDocId(topic) {
        const slug =
          topic && (topic.slug || topic.id)
            ? String(topic.slug || topic.id)
            : '';
        return `${LEVEL}__${slug}`;
      }
      function syncLessonPageLink() {
        if (!btnOpenLessonPage) return;
        if (!currentTopic) {
          btnOpenLessonPage.style.display = 'none';
          return;
        }
        const slug = String(currentTopic.slug || currentTopic.id || '');
        const url = `lessonpage.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(slug)}`;
        btnOpenLessonPage.href = url;
        btnOpenLessonPage.style.display = 'inline-flex';
      }

      function renderLessonContent(data) {
        if (!lessonContentCard || !lessonContentBody || !lessonContentEmpty)
          return;

        // show only when there's anything to show (image or html or objectives etc.)
        if (!data) {
          lessonContentCard.style.display = 'none';
          lessonContentBody.innerHTML = '';
          lessonContentEmpty.style.display = 'none';
          return;
        }

        const parts = [];

        const img = (data.imageUrl || '').trim();
        if (img) {
          const safe = escapeHtml(img);
          parts.push(
            `<img src="${safe}" alt="" style="max-width:100%; border-radius:18px; border:1px solid rgba(255,255,255,0.14); display:block; margin: 10px auto 14px;">`,
          );
        }

        const html = (data.html || '').trim();
        if (html) {
          // trusted admin content
          parts.push(`<div class="lessonText">${html}</div>`);
        }

        // If no html, we can render simple sections from arrays/dialog
        if (!html) {
          const obj = Array.isArray(data.objectives) ? data.objectives : [];
          const gram = Array.isArray(data.grammar) ? data.grammar : [];
          const voc = Array.isArray(data.vocab) ? data.vocab : [];
          const dialog = (data.dialog || '').trim();
          const speak = (data.speakingTask || '').trim();

          if (obj.length) {
            parts.push(
              `<div class="lessonText"><b>Cele:</b><ul>${obj.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`,
            );
          }
          if (dialog) {
            parts.push(
              `<div class="lessonText"><b>Dialog:</b><div style="white-space:pre-wrap; margin-top:6px">${escapeHtml(dialog)}</div></div>`,
            );
          }
          if (gram.length) {
            parts.push(
              `<div class="lessonText"><b>Gramatyka:</b><ul>${gram.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`,
            );
          }
          if (voc.length) {
            parts.push(
              `<div class="lessonText"><b>Slownictwo:</b><ul>${voc.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`,
            );
          }
          if (speak) {
            parts.push(
              `<div class="lessonText"><b>Zadanie mowione:</b><div style="margin-top:6px">${escapeHtml(speak)}</div></div>`,
            );
          }
        }

        const hasAny = parts.length > 0;
        lessonContentCard.style.display = hasAny ? 'block' : 'none';
        lessonContentEmpty.style.display = hasAny ? 'none' : 'block';
        lessonContentBody.innerHTML = parts.join('');
      }

      async function loadLessonMetaPublic(topic) {
        if (!topic) return;
        try {
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, 'course_meta', docId);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            renderLessonContent(null);
            syncLessonPageLink();
            return;
          }
          renderLessonContent(snap.data());
          syncLessonPageLink();
        } catch (e) {
          console.error(e);
          renderLessonContent(null);
          syncLessonPageLink();
        }
      }

      async function loadLessonMeta(topic) {
        if (!lessonTitleEs) return; // moved to lessonadmin.html
        if (!isAdmin) return;
        if (!topic || !(topic.slug || topic.id)) return;

        lessonMetaStatus.textContent = 'Ladowanie...';
        try {
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, 'course_meta', docId);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            lessonMetaStatus.textContent = 'Brak zapisanej lekcji.';
            return;
          }

          const data = snap.data() || {};
          lessonTitleEs.value = data.titleEs || '';
          lessonDescEs.value = data.descriptionEs || '';
          lessonObjectives.value = arrayToLines(
            data.objectives || data.objectivesEs || [],
          );
          lessonGrammar.value = arrayToLines(
            data.grammar || data.grammarEs || [],
          );
          lessonVocab.value = arrayToLines(data.vocab || data.vocabEs || []);
          lessonDialog.value = data.dialog || data.dialogEs || '';
          lessonSpeaking.value = data.speakingTask || data.speakingTaskEs || '';
          lessonImageUrl.value = data.imageUrl || '';
          lessonHtml.value = data.html || '';

          lessonMetaStatus.textContent = 'Lekcja wczytana';
          renderLessonContent(data);
          syncLessonPageLink();
        } catch (e) {
          console.error(e);
          lessonMetaStatus.textContent = 'Blad wczytywania lekcji';
        }
      }

      async function saveLessonMeta(topic) {
        if (!isAdmin) return;
        if (!topic || !(topic.slug || topic.id)) {
          showToast('Najpierw wybierz temat w course.html', 'warn', 3000);
          return;
        }

        lessonMetaStatus.textContent = 'Zapisywanie...';
        try {
          const slug = String(topic.slug || topic.id);
          const docId = getLessonMetaDocId(topic);
          const ref = doc(db, 'course_meta', docId);

          const payload = {
            level: LEVEL,
            topicSlug: slug,
            titleEs: (lessonTitleEs.value || '').trim(),
            descriptionEs: (lessonDescEs.value || '').trim(),
            objectives: linesToArray(lessonObjectives.value),
            grammar: linesToArray(lessonGrammar.value),
            vocab: linesToArray(lessonVocab.value),
            dialog: (lessonDialog.value || '').trim(),
            speakingTask: (lessonSpeaking.value || '').trim(),
            imageUrl: (lessonImageUrl.value || '').trim(),
            html: (lessonHtml.value || '').trim(),
            updatedAt: new Date().toISOString()};

          await setDoc(ref, payload, { merge: true });

          lessonMetaStatus.textContent = 'Zapisano';
          showToast('Lekcja zapisana', 'ok', 2200);
        } catch (e) {
          console.error(e);
          lessonMetaStatus.textContent = 'Blad';
          showToast('Blad zapisu lekcji', 'err', 2600);
        }
      }

      function clearLessonMeta() {
        if (!lessonTitleEs) return; // moved to lessonadmin.html
        lessonTitleEs.value = '';
        lessonDescEs.value = '';
        lessonObjectives.value = '';
        lessonGrammar.value = '';
        lessonVocab.value = '';
        lessonDialog.value = '';
        lessonSpeaking.value = '';
        lessonImageUrl.value = '';
        lessonHtml.value = '';
        lessonMetaStatus.textContent = '';
        renderLessonContent(null);
      }

      if (btnSaveLessonMeta)
        btnSaveLessonMeta.onclick = () => saveLessonMeta(currentTopic);
      if (btnClearLessonMeta) btnClearLessonMeta.onclick = clearLessonMeta;

      const btnAutoOrder = document.getElementById('btnAutoOrder');

      // Filters + reorder
      const filterSearch = document.getElementById('filterSearch');
      const filterType = document.getElementById('filterType');
      const filterCategory = document.getElementById('filterCategory');
      const filterSort = document.getElementById('filterSort');
      const btnClearFilters = document.getElementById('btnClearFilters');
      const toggleReorder = document.getElementById('toggleReorder');
      const btnSaveOrder = document.getElementById('btnSaveOrder');

      // Preview modal
      const previewModal = document.getElementById('previewModal');
      const previewBackdrop = document.getElementById('previewBackdrop');
      const btnClosePreview = document.getElementById('btnClosePreview');
      const previewBody = document.getElementById('previewBody');
      const btnCheckPreview = document.getElementById('btnCheckPreview');
      const previewResult = document.getElementById('previewResult');

      // ===== helpers =====
      function escapeHtml(s) {
        return String(s ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');
      }

      function normalizeAnswer(a) {
        return String(a ?? '').trim();
      }

      function parseOptions(raw) {
        return String(raw ?? '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);
      }

      function parseFlashcardLine(line) {
        const raw = String(line || '').trim();
        if (!raw) return '';
        // If user already pasted labeled format, keep it.
        if (/\bPL\s*:/i.test(raw) && /\bES\s*:/i.test(raw)) return raw;

        let parts = raw.split('\t').map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) {
          parts = raw.split(' - ').map((x) => x.trim()).filter(Boolean);
        }
        if (parts.length < 2) {
          parts = raw.split(';').map((x) => x.trim()).filter(Boolean);
        }
        if (parts.length < 2) return '';

        const pl = parts[0];
        const es = parts[1];
        const exRaw = parts[2] || '';
        const ex = exRaw.replace(/^EX\s*:\s*/i, '').trim();

        return ex ? `PL: ${pl} | ES: ${es} | EX: ${ex}` : `PL: ${pl} | ES: ${es}`;
      }

      function splitBulkColumns(line) {
        if (line.includes('\t')) return line.split('\t');
        if (line.includes(';')) return line.split(';');
        if (line.includes(',')) return line.split(',');
        return [line];
      }

      function normalizeHeaderKey(raw) {
        return String(raw || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '');
      }

      function parseOptionsCell(raw) {
        const txt = String(raw || '').trim();
        if (!txt) return [];
        let parts = [];
        if (txt.includes('||')) parts = txt.split('||');
        else if (txt.includes('|')) parts = txt.split('|');
        else if (txt.includes(';')) parts = txt.split(';');
        else parts = [txt];
        return parts.map((x) => x.trim()).filter(Boolean);
      }

      function parseBulkRows(raw, mapping = null) {
        const lines = String(raw || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (!lines.length) return { items: [], errors: 0 };

        const headerAliases = {
          type: 'type',
          prompt: 'prompt',
          question: 'prompt',
          pytanie: 'prompt',
          answer: 'answer',
          odpowiedz: 'answer',
          options: 'options',
          opcje: 'options',
          category: 'category',
          kategoria: 'category',
          tags: 'tags',
          tagi: 'tags',
          notes: 'notes',
          notatki: 'notes',
          imageurl: 'imageUrl',
          image: 'imageUrl',
          obraz: 'imageUrl',
          order: 'order',
          kolejnosc: 'order',
        };

        const headerMap = {};
        let start = 0;
        if (mapping && mapping.use) {
          Object.keys(mapping.map || {}).forEach((k) => {
            const idx = mapping.map[k];
            if (typeof idx === 'number' && idx >= 0) headerMap[k] = idx;
          });
          start = 0;
        } else {
          const first = splitBulkColumns(lines[0]).map((x) => x.trim());
          const headerKeys = first.map(normalizeHeaderKey);
          const hasHeader = headerKeys.some((k) => headerAliases[k]);
          if (hasHeader) {
            headerKeys.forEach((k, idx) => {
              const key = headerAliases[k];
              if (key) headerMap[key] = idx;
            });
            start = 1;
          } else {
            headerMap.prompt = 0;
            headerMap.answer = 1;
            headerMap.options = 2;
            headerMap.category = 3;
            headerMap.tags = 4;
            headerMap.notes = 5;
            headerMap.imageUrl = 6;
            headerMap.order = 7;
            start = 0;
          }
        }

        const items = [];
        let errors = 0;

        for (let i = start; i < lines.length; i++) {
          const cols = splitBulkColumns(lines[i]).map((x) => x.trim());
          const pick = (key) => {
            const idx = headerMap[key];
            if (idx == null) return '';
            return cols[idx] || '';
          };

          const prompt = pick('prompt');
          const answer = pick('answer');
          if (!prompt || !answer) {
            errors += 1;
            continue;
          }

          items.push({
            type: pick('type'),
            prompt,
            answer,
            options: parseOptionsCell(pick('options')),
            category: pick('category'),
            tags: pick('tags'),
            notes: pick('notes'),
            imageUrl: pick('imageUrl'),
            order: pick('order'),
          });
        }

        return { items, errors };
      }

      function buildMapOptionsFromSample() {
        const raw = String(bulkImportArea?.value || '').trim();
        if (!raw) return [];
        const firstLine = raw.split(/\r?\n/).find((l) => l.trim()) || '';
        const cols = splitBulkColumns(firstLine).map((x) => x.trim());
        if (!cols.length) return [];
        return cols.map((c, idx) => ({
          idx,
          label: `${idx + 1}: ${c.slice(0, 18)}${c.length > 18 ? '…' : ''}`,
        }));
      }

      function getColumnLabel(idx) {
        const options = buildMapOptionsFromSample();
        const found = options.find((o) => o.idx === idx);
        return found ? found.label : `Kolumna ${idx + 1}`;
      }

      function fillMapSelect(selectEl, label) {
        if (!selectEl) return;
        const options = buildMapOptionsFromSample();
        selectEl.innerHTML = '';
        selectEl.appendChild(new Option(`${label} — auto`, ''));
        selectEl.appendChild(new Option(`${label} — brak`, '-1'));
        options.forEach((o) => {
          selectEl.appendChild(new Option(o.label, String(o.idx + 1)));
        });
      }

      function updateMapLabelsFromSelects() {
        const map = {
          type: mapSelectValue(bulkMapType),
          prompt: mapSelectValue(bulkMapPrompt),
          answer: mapSelectValue(bulkMapAnswer),
          options: mapSelectValue(bulkMapOptions),
          category: mapSelectValue(bulkMapCategory),
          tags: mapSelectValue(bulkMapTags),
          notes: mapSelectValue(bulkMapNotes),
          imageUrl: mapSelectValue(bulkMapImage),
          order: mapSelectValue(bulkMapOrder),
        };
        Object.keys(mapValEls).forEach((key) => {
          const el = mapValEls[key];
          if (!el) return;
          const idx = map[key];
          if (idx == null || idx < 0) {
            el.textContent = '-';
          } else {
            el.textContent = getColumnLabel(idx);
          }
        });
      }

      function renderMapChips() {
        if (!bulkMapChips) return;
        const options = buildMapOptionsFromSample();
        bulkMapChips.innerHTML = '';
        if (!options.length) {
          bulkMapChips.innerHTML = '<span class="smallNote">Brak danych do mapowania.</span>';
          return;
        }
        options.forEach((o) => {
          const chip = document.createElement('div');
          chip.className = 'mapChip';
          chip.textContent = o.label;
          chip.draggable = true;
          chip.dataset.col = String(o.idx);
          chip.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', String(o.idx));
            e.dataTransfer.effectAllowed = 'copy';
          });
          bulkMapChips.appendChild(chip);
        });
      }

      function refreshBulkMapOptions() {
        fillMapSelect(bulkMapType, 'type');
        fillMapSelect(bulkMapPrompt, 'prompt');
        fillMapSelect(bulkMapAnswer, 'answer');
        fillMapSelect(bulkMapOptions, 'options');
        fillMapSelect(bulkMapCategory, 'category');
        fillMapSelect(bulkMapTags, 'tags');
        fillMapSelect(bulkMapNotes, 'notes');
        fillMapSelect(bulkMapImage, 'imageUrl');
        fillMapSelect(bulkMapOrder, 'order');
        renderMapChips();
        updateMapLabelsFromSelects();
      }

      function mapSelectValue(selectEl) {
        const v = String(selectEl?.value || '');
        if (!v) return null;
        if (v === '-1') return -1;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n - 1; // 1-based -> 0-based
      }

      function getBulkMapping() {
        if (!bulkMapUse?.checked) return null;
        const map = {
          type: mapSelectValue(bulkMapType),
          prompt: mapSelectValue(bulkMapPrompt),
          answer: mapSelectValue(bulkMapAnswer),
          options: mapSelectValue(bulkMapOptions),
          category: mapSelectValue(bulkMapCategory),
          tags: mapSelectValue(bulkMapTags),
          notes: mapSelectValue(bulkMapNotes),
          imageUrl: mapSelectValue(bulkMapImage),
          order: mapSelectValue(bulkMapOrder),
        };
        return { use: true, map };
      }

      function selectForMapKey(key) {
        if (key === 'type') return bulkMapType;
        if (key === 'prompt') return bulkMapPrompt;
        if (key === 'answer') return bulkMapAnswer;
        if (key === 'options') return bulkMapOptions;
        if (key === 'category') return bulkMapCategory;
        if (key === 'tags') return bulkMapTags;
        if (key === 'notes') return bulkMapNotes;
        if (key === 'imageUrl') return bulkMapImage;
        if (key === 'order') return bulkMapOrder;
        return null;
      }

      function bindMapTargets() {
        const targets = document.querySelectorAll('.mapTarget[data-map]');
        targets.forEach((t) => {
          t.addEventListener('dragover', (e) => {
            e.preventDefault();
            t.classList.add('dragOver');
          });
          t.addEventListener('dragleave', () => {
            t.classList.remove('dragOver');
          });
          t.addEventListener('drop', (e) => {
            e.preventDefault();
            t.classList.remove('dragOver');
            const idx = Number(e.dataTransfer.getData('text/plain'));
            if (!Number.isFinite(idx)) return;
            const key = t.getAttribute('data-map');
            const sel = selectForMapKey(key);
            if (!sel) return;
            sel.value = String(idx + 1);
            if (bulkMapUse) bulkMapUse.checked = true;
            updateMapLabelsFromSelects();
          });
        });

        [
          bulkMapType,
          bulkMapPrompt,
          bulkMapAnswer,
          bulkMapOptions,
          bulkMapCategory,
          bulkMapTags,
          bulkMapNotes,
          bulkMapImage,
          bulkMapOrder,
        ].forEach((sel) => sel?.addEventListener('change', updateMapLabelsFromSelects));
      }

      const EXERCISE_LIBRARY = {
        A1: [
          {
            id: 'a1_saludos',
            label: 'A1 - Saludos y presentaciones',
            items: [
              {
                type: 'Opción múltiple',
                prompt: 'Elige la respuesta correcta: "Buenos días" significa...',
                options: ['A) Buenas noches', 'B) Buenas tardes', 'C) Buenos días'],
                answer: 'C',
                category: 'vocab',
                notes: '',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Yo ___ Marta.',
                answer: 'soy',
                category: 'grammar',
                notes: 'Verbo ser (1a persona).',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Adiós" es un saludo de despedida.',
                options: ['true', 'false'],
                answer: 'true',
                category: 'vocab',
              },
              {
                type: 'Opción múltiple',
                prompt: '¿Cómo te llamas? — ____.',
                options: ['A) Me llamo Ana', 'B) Soy en casa', 'C) Estoy 20 años'],
                answer: 'A',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'a1_numeros_tiempo',
            label: 'A1 - Numeros y tiempo',
            items: [
              {
                type: 'Opción múltiple',
                prompt: '¿Cómo se dice "15"?',
                options: ['A) quince', 'B) cincuenta', 'C) dieciséis'],
                answer: 'A',
                category: 'vocab',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Son las ___ (3:30).',
                answer: 'tres y media',
                category: 'vocab',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Hoy es lunes" habla del día de la semana.',
                options: ['true', 'false'],
                answer: 'true',
                category: 'vocab',
              },
            ],
          },
          {
            id: 'a1_ser_estar',
            label: 'A1 - Ser y estar (basico)',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: 'Madrid ___ en España.',
                answer: 'está',
                category: 'grammar',
                notes: 'Ubicacion -> estar.',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Yo ___ de Polonia.',
                answer: 'soy',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: 'Ella ___ cansada hoy.',
                options: ['A) es', 'B) está', 'C) soy'],
                answer: 'B',
                category: 'grammar',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Soy en casa" es correcto.',
                options: ['true', 'false'],
                answer: 'false',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'a1_familia',
            label: 'A1 - Familia y personas',
            items: [
              {
                type: 'Opción múltiple',
                prompt: 'Selecciona la palabra: "hermana" =',
                options: ['A) hermano', 'B) hermana', 'C) padre'],
                answer: 'B',
                category: 'vocab',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Mi ___ se llama Carlos.',
                answer: 'padre',
                category: 'vocab',
              },
              {
                type: 'Opción múltiple',
                prompt: '¿Quién es la hija de tu madre?',
                options: ['A) tía', 'B) hermana', 'C) abuelo'],
                answer: 'B',
                category: 'vocab',
              },
            ],
          },
        ],
        A2: [
          {
            id: 'a2_pasado',
            label: 'A2 - Pretérito perfecto',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: 'Hoy ___ (comer) pasta.',
                answer: 'he comido',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: '¿Has ___ al museo?',
                options: ['A) ido', 'B) ido a', 'C) iendo'],
                answer: 'A',
                category: 'grammar',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Hemos visto" es pretérito perfecto.',
                options: ['true', 'false'],
                answer: 'true',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'a2_viajes',
            label: 'A2 - Viajes y transporte',
            items: [
              {
                type: 'Opción múltiple',
                prompt: '¿Cómo se dice "platforma" en español?',
                options: ['A) andén', 'B) estación', 'C) billete'],
                answer: 'A',
                category: 'vocab',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Necesito ___ un billete a Madrid.',
                answer: 'comprar',
                category: 'vocab',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Equipaje" significa "luggage".',
                options: ['true', 'false'],
                answer: 'true',
                category: 'vocab',
              },
            ],
          },
          {
            id: 'a2_compras',
            label: 'A2 - Compras y precios',
            items: [
              {
                type: 'Opción múltiple',
                prompt: '¿Cuánto cuesta? =',
                options: ['A) ¿Qué quieres?', 'B) ¿Qué precio tiene?', 'C) ¿Dónde está?'],
                answer: 'B',
                category: 'vocab',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Quisiera ___ kilo de manzanas.',
                answer: 'un',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: 'Selecciona: "rebaja" significa...',
                options: ['A) descuento', 'B) subida', 'C) caja'],
                answer: 'A',
                category: 'vocab',
              },
            ],
          },
          {
            id: 'a2_pronombres',
            label: 'A2 - Pronombres de objeto',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: '¿Ves a Juan? Sí, ___ veo.',
                answer: 'lo',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: 'Doy el libro a Ana ? Yo ___ doy.',
                options: ['A) lo', 'B) le', 'C) me'],
                answer: 'B',
                category: 'grammar',
              },
            ],
          },
        ],
        B1: [
          {
            id: 'b1_subj',
            label: 'B1 - Subjuntivo basico',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: 'Espero que tú ___ (venir) mañana.',
                answer: 'vengas',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: 'Es importante que ellos ___.',
                options: ['A) estudian', 'B) estudien', 'C) estudiar'],
                answer: 'B',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'b1_estilo_indirecto',
            label: 'B1 - Estilo indirecto',
            items: [
              {
                type: 'Opción múltiple',
                prompt: 'Ella dijo: "Voy mañana". ? Ella dijo que ___ mañana.',
                options: ['A) voy', 'B) iba', 'C) irá'],
                answer: 'B',
                category: 'grammar',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'Me contó que ___ (tener) trabajo.',
                answer: 'tenía',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'b1_opinion',
            label: 'B1 - Expresar opinion',
            items: [
              {
                type: 'Opción múltiple',
                prompt: 'Elige la expresion de opinion:',
                options: ['A) Creo que...', 'B) Tengo que...', 'C) Voy a...'],
                answer: 'A',
                category: 'vocab',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'En mi ___, es mejor estudiar cada día.',
                answer: 'opinión',
                category: 'vocab',
              },
            ],
          },
          {
            id: 'b1_condicional',
            label: 'B1 - Condicional',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: 'Si tuviera tiempo, ___ (viajar) más.',
                answer: 'viajaría',
                category: 'grammar',
              },
              {
                type: 'Verdadero o falso',
                prompt: '"Comeria" es condicional.',
                options: ['true', 'false'],
                answer: 'true',
                category: 'grammar',
              },
            ],
          },
        ],
        B2: [
          {
            id: 'b2_discursos',
            label: 'B2 - Conectores y discurso',
            items: [
              {
                type: 'Opción múltiple',
                prompt: 'Elige el conector correcto: ___, no puedo venir.',
                options: ['A) Sin embargo', 'B) A pesar de', 'C) Por ejemplo'],
                answer: 'A',
                category: 'grammar',
              },
              {
                type: 'Rellenar los espacios',
                prompt: 'A pesar ___ la lluvia, salimos.',
                answer: 'de',
                category: 'grammar',
              },
            ],
          },
          {
            id: 'b2_subj_avanzado',
            label: 'B2 - Subjuntivo avanzado',
            items: [
              {
                type: 'Rellenar los espacios',
                prompt: 'No creo que ellos ___ (saber) la verdad.',
                answer: 'sepan',
                category: 'grammar',
              },
              {
                type: 'Opción múltiple',
                prompt: 'Si yo ___ más tiempo, estudiaría cada día.',
                options: ['A) tuviera', 'B) tengo', 'C) tendría'],
                answer: 'A',
                category: 'grammar',
              },
            ],
          },
        ],
      };

      function renderLibrarySets() {
        if (!libSet || !libLevel) return;
        const lvl = String(libLevel.value || 'A1').toUpperCase();
        const sets = EXERCISE_LIBRARY[lvl] || [];
        libSet.innerHTML = '';
        if (!sets.length) {
          libSet.appendChild(new Option('Brak zestawow', ''));
          return;
        }
        sets.forEach((s) => {
          libSet.appendChild(new Option(s.label, s.id));
        });
      }

      async function insertLibrarySet() {
        if (!isAdmin || !currentTopic) return;
        if (!libLevel || !libSet) return;
        const lvl = String(libLevel.value || 'A1').toUpperCase();
        const sets = EXERCISE_LIBRARY[lvl] || [];
        const set = sets.find((s) => s.id === libSet.value);
        if (!set) {
          if (libStatus) libStatus.textContent = 'Wybierz zestaw.';
          return;
        }

        if (libStatus) libStatus.textContent = 'Dodawanie...';
        try {
          setSaving(true);
          let order = getNextOrder();
          const batchLimit = 400;
          let batch = writeBatch(db);
          let pending = 0;

          for (const item of set.items || []) {
            const refDoc = doc(collection(db, 'exercises'));
            const options = Array.isArray(item.options) ? item.options : [];
            batch.set(refDoc, {
              level: LEVEL,
              topicSlug: String(currentTopic.slug || currentTopic.id || ''),
              topicId: String(COURSE_ID || currentTopic.id || '').trim() || null,
              type: item.type || 'Rellenar los espacios',
              prompt: String(item.prompt || '').trim(),
              imageUrl: String(item.imageUrl || '').trim(),
              options: options,
              answer: String(item.answer || '').trim(),
              notes: String(item.notes || '').trim(),
              category: String(item.category || 'grammar'),
              tags: Array.isArray(item.tags) ? item.tags : [],
              order: order++,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            pending += 1;
            if (pending >= batchLimit) {
              await batch.commit();
              batch = writeBatch(db);
              pending = 0;
            }
          }
          if (pending > 0) await batch.commit();

          if (libStatus) libStatus.textContent = `Dodano: ${set.items.length}`;
          showToast(`Dodano zestaw: ${set.label}`, 'ok', 2000);
          await loadExercises(currentTopic);
          if (exOrder) exOrder.value = String(getNextOrder());
        } catch (e) {
          console.error(e);
          if (libStatus) libStatus.textContent = 'Blad dodawania.';
          showToast('Blad dodawania zestawu', 'bad', 3000);
        } finally {
          setSaving(false);
        }
      }

      async function uploadFlashAudio() {
        if (!flashAudioFile?.files?.length) {
          if (flashAudioStatus) flashAudioStatus.textContent = 'Wybierz plik audio.';
          return;
        }
        const file = flashAudioFile.files[0];
        if (!file.type.startsWith('audio/')) {
          if (flashAudioStatus) flashAudioStatus.textContent = 'To nie jest plik audio.';
          return;
        }
        const maxMb = 8;
        if (file.size > maxMb * 1024 * 1024) {
          if (flashAudioStatus) flashAudioStatus.textContent = `Max ${maxMb}MB.`;
          return;
        }
        if (flashAudioStatus) flashAudioStatus.textContent = 'Wgrywanie...';

        try {
          const topicSlug = String(currentTopic?.slug || currentTopic?.id || 'general');
          const safeName = String(file.name || 'audio')
            .replace(/[^a-z0-9._-]/gi, '_')
            .toLowerCase();
          const path = `audio/flashcards/${topicSlug}/${Date.now()}_${safeName}`;
          const refObj = storageRef(storage, path);
          await uploadBytes(refObj, file, { contentType: file.type });
          const url = await getDownloadURL(refObj);
          if (flashAudioUrl) flashAudioUrl.value = url;
          if (flashAudioStatus) flashAudioStatus.textContent = 'Wgrano ?';
        } catch (e) {
          console.error('[audio upload]', e);
          if (flashAudioStatus) flashAudioStatus.textContent = 'Blad wgrywania.';
        }
      }

      function showToast(msg, kind = 'ok', ms = 2200) {
        toast.className = '';
        toast.style.display = 'block';
        toast.textContent = msg;

        if (kind === 'ok') toast.classList.add('toast-ok');
        if (kind === 'bad') toast.classList.add('toast-bad');
        if (kind === 'warn') toast.classList.add('toast-warn');

        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
          toast.style.display = 'none';
        }, ms);
      }

      function markBad(el, bad) {
        if (!el) return;
        if (bad) el.classList.add('field-bad');
        else el.classList.remove('field-bad');
      }

      function setSaving(isSaving) {
        btnAddExercise.disabled = isSaving;
        btnAutoOrder.disabled = isSaving;
        btnAddExercise.textContent = isSaving
          ? 'Zapisywanie...'
          : 'Zapisz cwiczenie';
      }

      // ===== UX buttons =====
      // Some pages use the shared header injected by layout.js (no local buttons with these IDs).
      // Guard against missing elements so the admin logic can continue running.
      if (backToCourse)
        backToCourse.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
      if (levelsBtn)
        levelsBtn.href = `course.html?level=${encodeURIComponent(LEVEL)}`;
      if (pillLevel) pillLevel.textContent = `Poziom ${LEVEL}`;

      if (btnCopyLink)
        btnCopyLink.onclick = async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            showToast('Link skopiowany', 'ok', 1800);
          } catch {
            showToast(
              'Nie udalo sie skopiowac (blokada przegladarki)',
              'warn',
              2600,
            );
          }
        };
      if (btnReload) btnReload.onclick = () => window.location.reload();

      // ===== Exercise types (Twoja lista) =====
      const TASK_OPTIONS = [
        'Rellenar los espacios',
        'Arrastrar y soltar palabras',
        'Relacionar palabra con imagen',
        'Relacionar palabra con traducción',
        'Elegir la palabra correcta',
        'Tarjetas interactivas',
        'Agrupar palabras',
        'Verdadero o falso',
        'Completar la frase con una imagen',
        'Juego de memoria (pares)',
        'Opción múltiple',
        'Completar la forma correcta',
        'Elegir la forma correcta',
        'Transformaciones',
        'Relacionar pregunta con respuesta',
        'Ordenar palabras para formar una frase',
        'Corregir errores',
        'Unir dos partes de la frase',
        'Completar con preposición o terminación',
        'Opción única',
        'Escribir tu propia respuesta',
        'Repetir después del narrador',
        'Completar la frase con tu voz',
        'Responder a una pregunta',
        'Describir una imagen',
        'Juego de roles',
        'Mini-monólogo',
        'Diálogo semiabierto',
        'Decirlo de otra manera',
        'Escuchar y elegir la respuesta',
        'Escuchar y completar los espacios',
        'Escuchar y marcar verdadero o falso',
        'Escuchar y relacionar personas',
        'Escuchar y ordenar la secuencia',
        'Dictado con audio',
        'Dictado con tolerancia',
        'Verdadero/Falso (botones)',
        'Escuchar y repetir',
        'Diálogo interactivo',
        'Mikro-scenka (dialog)',
        'Znajdz blad',
        'Misión del día',
        'Quiz situacional',
        'Video con preguntas',
        'Test final del tema',
        'Debate grabado',
        'Contar una historia',
        'Simulación de entrevista de trabajo',
        'Retroalimentación por voz',
      ];

      // ===== Szablony (1:1 z TASK_OPTIONS) =====
      // Uwaga: nie zmieniamy struktury Firestore. Szablony wypelniaja istniejace pola formularza.
      const TEMPLATE_GROUPS = {
        choice: new Set([
          'Opción múltiple',
          'Opción única',
          'Elegir la palabra correcta',
          'Elegir la forma correcta',
          'Escuchar y elegir la respuesta',
          'Video con preguntas',
          'Quiz situacional',
          'Test final del tema',
        ]),
        trueFalse: new Set([
          'Verdadero o falso',
          'Escuchar y marcar verdadero o falso',
          'Verdadero/Falso (botones)',
        ]),
        fill: new Set([
          'Rellenar los espacios',
          'Completar la forma correcta',
          'Completar con preposición o terminación',
          'Escuchar y completar los espacios',
          'Dictado con audio',
          'Dictado con tolerancia',
        ]),
        dragDrop: new Set(['Arrastrar y soltar palabras']),
        matching: new Set([
          'Relacionar palabra con imagen',
          'Relacionar palabra con traducción',
          'Relacionar pregunta con respuesta',
          'Escuchar y relacionar personas',
          'Unir dos partes de la frase',
        ]),
        ordering: new Set([
          'Ordenar palabras para formar una frase',
          'Escuchar y ordenar la secuencia',
        ]),
        speaking: new Set([
          'Escribir tu propia respuesta',
          'Repetir después del narrador',
          'Completar la frase con tu voz',
          'Responder a una pregunta',
          'Juego de roles',
          'Mini-monólogo',
          'Diálogo semiabierto',
          'Diálogo interactivo',
          'Debate grabado',
          'Contar una historia',
          'Simulación de entrevista de trabajo',
          'Retroalimentación por voz',
          'Escuchar y repetir',
          'Misión del día',
          'Describir una imagen',
          'Decirlo de otra manera',
        ]),
        scene: new Set(['Mikro-scenka (dialog)']),
        findError: new Set(['Znajdz blad']),
        memory: new Set(['Juego de memoria (pares)']),
        grouping: new Set(['Agrupar palabras']),
        cards: new Set(['Tarjetas interactivas']),
        imageSentence: new Set(['Completar la frase con una imagen']),
        transform: new Set(['Transformaciones', 'Corregir errores'])};

      function templateForType(type) {
        // Default scaffold
        const base = {
          prompt: '',
          optionsText: '',
          answer: '',
          category: 'both',
          notes: ''};

        // Helpers
        const opt = (...lines) => lines.filter(Boolean).join('\n');
        const noteAudio = 'AUDIO_URL: https://...  (podaj tutaj URL audio)';

        if (TEMPLATE_GROUPS.trueFalse.has(type)) {
          return {
            ...base,
            prompt: 'Lee/Escucha y marca: ¿verdadero o falso?',
            optionsText: opt('true', 'false'),
            answer: 'true',
            category: 'both',
            notes: type.startsWith('Escuchar') ? noteAudio : ''};
        }

        if (TEMPLATE_GROUPS.scene.has(type)) {
          return {
            ...base,
            prompt: 'Sytuacja: spotykasz nowa osobe na kursie jezyka. Wybierz najlepsza reakcje.',
            optionsText: opt(
              'A) Czesc, mam na imie Marta. A ty?',
              'B) Nie lubie poniedzialkow.',
              'C) Mam dwa koty i rower.',
            ),
            answer: 'A',
            category: 'both',
            notes: 'W prompt opisz krotko sytuacje, w opcjach podaj mozliwe reakcje.'};
        }

        if (TEMPLATE_GROUPS.findError.has(type)) {
          return {
            ...base,
            prompt: "Znajdz blad i wybierz poprawna wersje: 'On maja nowy samochod.'",
            optionsText: opt(
              'A) On maja nowy samochod.',
              'B) On ma nowy samochod.',
              'C) On miec nowy samochod.',
            ),
            answer: 'B',
            category: 'grammar',
            notes: 'Daj jedna poprawna odpowiedz i 2-3 odpowiedzi z typowym bledem.'};
        }

        if (TEMPLATE_GROUPS.choice.has(type)) {
          return {
            ...base,
            prompt: 'Elige la respuesta Poprawna:',
            optionsText: opt('A) ...', 'B) ...', 'C) ...', 'D) ...'),
            answer: 'B',
            category: 'both',
            notes:
              type.startsWith('Escuchar') || type === 'Video con preguntas'
                ? noteAudio
                : ''};
        }

        if (TEMPLATE_GROUPS.fill.has(type)) {
          const isDictationType = type.includes('Dictado');
          return {
            ...base,
            prompt: isDictationType
              ? 'Escucha y escribe la frase completa.'
              : 'Completa: ___',
            optionsText: '',
            answer: isDictationType
              ? 'Tu frase de referencia aqui.'
              : 'respuesta_Poprawna',
            category: 'both',
            notes:
              type.startsWith('Escuchar') || isDictationType
                ? noteAudio
                : ''};
        }

        if (TEMPLATE_GROUPS.dragDrop.has(type)) {
          return {
            ...base,
            prompt: 'Yo ___ al trabajo en ___.',
            optionsText: opt('voy', 'bus', 'tren', 'casa'),
            answer: 'voy||bus',
            category: 'both',
            notes:
              'Usa ___ jako huecos. En answer separa cada hueco con ||.'};
        }

        if (TEMPLATE_GROUPS.matching.has(type)) {
          return {
            ...base,
            prompt: 'Relaciona los elementos (usa opciones como pares A=...):',
            optionsText: opt(
              'A) ... = 1) ...',
              'B) ... = 2) ...',
              'C) ... = 3) ...',
            ),
            answer: 'A-1, B-2, C-3',
            category: 'both',
            notes: type.startsWith('Escuchar')
              ? noteAudio
              : 'Formato sugerido: A-1, B-2, C-3'};
        }

        if (TEMPLATE_GROUPS.ordering.has(type)) {
          return {
            ...base,
            prompt: 'Ordena los elementos en el orden correcto:',
            optionsText: opt('1) ...', '2) ...', '3) ...', '4) ...'),
            answer: '1-2-3-4',
            category: 'both',
            notes: type.startsWith('Escuchar')
              ? noteAudio
              : 'Odpowiedz: numery w kolejnosci, np. 2-4-1-3'};
        }

        if (TEMPLATE_GROUPS.memory.has(type)) {
          return {
            ...base,
            prompt: 'Encuentra los pares:',
            optionsText: opt(
              'A) slowo = tlumaczenie',
              'B) slowo = tlumaczenie',
              'C) slowo = tlumaczenie',
            ),
            answer: 'pares correctos',
            category: 'vocab',
            notes: "Usa opciones como pares: 'polaco = hiszpanski'"};
        }

        if (TEMPLATE_GROUPS.grouping.has(type)) {
          return {
            ...base,
            prompt: 'Grupuj slowa w kategorie:',
            optionsText: opt('Kategoria 1: ..., ...', 'Kategoria 2: ..., ...'),
            answer: 'grupowanie',
            category: 'vocab',
            notes: 'Sugerencia: wpisz kategorie + slowa w jednej linii'};
        }

        if (TEMPLATE_GROUPS.cards.has(type)) {
            return {
              ...base,
              prompt: 'Tarjetas: (frente -> reverso)',
              optionsText: opt(
                '1) PL: ... | ES: ... | EX: ...',
                '2) PL: ... | ES: ... | EX: ...',
                '3) PL: ... | ES: ... | EX: ...',
              ),
              answer: '',
              category: 'vocab',
              notes:
                'Opcjonalnie w linii: AUDIO:https://... | EXAUDIO:https://...'};
        }

        if (TEMPLATE_GROUPS.imageSentence.has(type)) {
          return {
            ...base,
            prompt: 'Completa la frase usando la imagen:',
            optionsText: '',
            answer: 'respuesta',
            category: 'both',
            notes: 'Dodaj URL obrazka w polu Imagen.'};
        }

        if (TEMPLATE_GROUPS.transform.has(type)) {
          return {
            ...base,
            prompt:
              type === 'Corregir errores'
                ? 'Popraw zdanie:'
                : 'Przeksztalc zdanie wedlug wzoru:',
            optionsText: '',
            answer: 'respuesta_Poprawna',
            category: 'grammar',
            notes: 'Mozesz podac przyklad w Notas.'};
        }

        if (type === 'Responder a una pregunta') {
          return {
            ...base,
            prompt: 'Responde con una frase completa:',
            answer: 'respuesta',
            category: 'both'};
        }

        if (type === 'Describir una imagen') {
          return {
            ...base,
            prompt: 'Describe la imagen en 2-3 frases:',
            answer: '',
            category: 'both',
            notes: 'Dodaj URL obrazka.'};
        }

        // Fallback
        return {
          ...base,
          prompt: `Actividad: ${type}`,
          answer: '',
          category: 'both'};
      }

      function setOptionsVisibility(type) {
        // Ukryj opcje dla typow otwartych / voice itd.
        const needsOptions =
          TEMPLATE_GROUPS.choice.has(type) ||
          TEMPLATE_GROUPS.trueFalse.has(type) ||
          TEMPLATE_GROUPS.scene.has(type) ||
          TEMPLATE_GROUPS.findError.has(type) ||
          TEMPLATE_GROUPS.dragDrop.has(type) ||
          TEMPLATE_GROUPS.matching.has(type) ||
          TEMPLATE_GROUPS.ordering.has(type) ||
          TEMPLATE_GROUPS.memory.has(type) ||
          TEMPLATE_GROUPS.grouping.has(type) ||
          TEMPLATE_GROUPS.cards.has(type);

        const optWrap = document.getElementById('exOptions')?.closest('div');
        if (optWrap) optWrap.style.display = needsOptions ? '' : 'none';
      }

      function applyTemplateForSelectedType(overwrite = false) {
        const type = String(exType.value || '');
        if (!type) return;

        const tpl = templateForType(type);

        // Only fill empty fields unless overwrite=true
        const setVal = (el, val) => {
          if (!el) return;
          const cur = String(el.value || '');
          if (overwrite || cur.trim() === '') el.value = val;
        };

        setOptionsVisibility(type);
        setVal(exPrompt, tpl.prompt);
        setVal(exOptions, tpl.optionsText);
        setVal(exAnswer, tpl.answer);
        setVal(exNotes, tpl.notes);
        if (exCategory && (overwrite || !exCategory.value))
          exCategory.value = tpl.category || 'both';
      }

      function fillExerciseTypes() {
        exType.innerHTML = TASK_OPTIONS.map(
          (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
        ).join('');
        const saved = localStorage.getItem('lastExerciseType');
        if (saved && TASK_OPTIONS.includes(saved)) exType.value = saved;
        exType.addEventListener('change', () =>
          localStorage.setItem('lastExerciseType', exType.value),
        );
      }

      // ===== Safe "no params" screen =====
      const SKIP_LOAD = !HAS_TOPIC_PARAM;
      if (SKIP_LOAD) {
        topicTitle.textContent = 'Brak wybranego tematu';
        topicDesc.textContent =
          'Otworz najpierw course.html i kliknij temat (lesson otworzy sie automatycznie z parametrami).';
        pillType.textContent = '-';
        pillSlug.textContent = 'slug: -';
        pillCount.textContent = 'Cwiczenia: -';
        exerciseList.innerHTML = '';
        emptyExercises.style.display = 'block';
      }

      // ===== Topic loading =====
      let currentTopic = null;
      let isAdmin = false;
      let cachedExercises = [];
      // ===== User progress (Firestore) =====
      let CURRENT_TOPIC_KEY = null; // `${LEVEL}__${slug}`
      let TOTAL_EXERCISES = 0;
      let DONE_SET = new Set();

      const pillProgress = document.getElementById('pillProgress');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');

      function progressDocRef(uid, topicKey) {
        return doc(db, 'user_progress', uid, 'topics', topicKey);
      }

      function renderProgress(doneCount, total) {
        const t = Number(total || 0);
        const d = Number(doneCount || 0);
        const pct = t ? Math.round((d / t) * 100) : 0;

        if (pillProgress) pillProgress.textContent = `Progreso: ${pct}%`;
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${d} / ${t} completados`;
      }

      async function loadProgressForTopic(uid) {
        if (!uid || !CURRENT_TOPIC_KEY) return;
        try {
          const ref = progressDocRef(uid, CURRENT_TOPIC_KEY);
          const snap = await getDoc(ref);
          DONE_SET = new Set();
          if (snap.exists()) {
            const data = snap.data() || {};
            const done = Array.isArray(data.doneIds) ? data.doneIds : [];
            done.forEach((id) => DONE_SET.add(String(id)));
            const total = Number(data.totalExercises || TOTAL_EXERCISES || 0);
            TOTAL_EXERCISES = total || TOTAL_EXERCISES;
          }
          renderProgress(DONE_SET.size, TOTAL_EXERCISES);
        } catch (e) {
          // permissions or missing rules -> silently ignore (UI stays 0)
          console.warn('Progress read failed:', e?.code || e);
          renderProgress(DONE_SET.size, TOTAL_EXERCISES);
        }
      }

      async function markDone(uid, exId) {
        if (!uid || !CURRENT_TOPIC_KEY || !exId) return;
        const id = String(exId);
        if (DONE_SET.has(id)) return;

        DONE_SET.add(id);
        renderProgress(DONE_SET.size, TOTAL_EXERCISES);

        try {
          const ref = progressDocRef(uid, CURRENT_TOPIC_KEY);
          await setDoc(
            ref,
            {
              level: LEVEL,
              topicSlug:
                currentTopic && (currentTopic.slug || currentTopic.id)
                  ? String(currentTopic.slug || currentTopic.id)
                  : null,
              totalExercises: Number(TOTAL_EXERCISES || 0),
              updatedAt: serverTimestamp()},
            { merge: true },
          );

          // arrayUnion requires write permission to user's own doc
          await updateDoc(ref, {
            doneIds: arrayUnion(id),
            updatedAt: serverTimestamp()});
        } catch (e) {
          console.warn('Progress write failed:', e?.code || e);
        }
      }

      function normalizeTopic(t) {
        return {
          id: t.id,
          level: (t.level || '').toString().toUpperCase(),
          type: (t.type || '').toString(),
          title: t.title || '',
          desc: t.desc || '',
          slug: (t.slug || slugParam || t.id || '').toString(),
          tasks: Array.isArray(t.tasks) ? t.tasks : []};
      }

      function renderTopic(t) {
        pillType.textContent =
          t.type === 'grammar' ? 'Gramatyka' : 'Slownictwo';
        const eff = t.slug || t.id ? String(t.slug || t.id) : '';
        pillSlug.textContent = eff ? `slug: ${eff}` : 'slug: -';
        topicTitle.textContent = t.title || 'Temat';
        topicDesc.textContent = t.desc || '';

        taskChips.innerHTML = '';
        if (t.tasks && t.tasks.length) {
          t.tasks.slice(0, 14).forEach((x) => {
            const span = document.createElement('span');
            span.className = 'pill';
            span.textContent = x;
            taskChips.appendChild(span);
          });
        }
      }

      async function loadTopic() {
        // 1) by id
        if (idParam) {
          const ref = doc(db, 'courses', idParam);
          const snap = await getDoc(ref);
          if (!snap.exists()) return null;
          const data = snap.data();
          currentTopic = normalizeTopic({ id: snap.id, ...data });
          renderTopic(currentTopic);
          return currentTopic;
        }

        // 2) by slug + level
        if (!slugParam) return null;

        const q = query(
          collection(db, 'courses'),
          where('level', '==', LEVEL),
          where('slug', '==', slugParam),
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const d = snap.docs[0];
        currentTopic = normalizeTopic({ id: d.id, ...d.data() });
        renderTopic(currentTopic);
        return currentTopic;
      }

      // ===== Exercises loading/render =====

      function renderExerciseList() {
        exerciseList.innerHTML = '';

        const list = Array.isArray(VIEW_EXERCISES) ? VIEW_EXERCISES : [];
        const total = Array.isArray(ALL_EXERCISES) ? ALL_EXERCISES.length : 0;
        const shown = list.length;

        pillCount.textContent = qLabel(total, shown);

        if (!shown) {
          emptyExercises.style.display = 'block';
          return;
        }

        emptyExercises.style.display = 'none';

        // Ensure visual order label is consistent with current array order in reorder mode
        list.forEach((ex, idx) => {
          // For display only; actual "order" is saved to Firestore when you click "Zapisz kolejnosc"
          if (REORDER_MODE && IS_ADMIN) ex.__tmpOrder = idx + 1;
        });

        list.forEach((ex, idx) => {
          const x = {
            ...ex,
            order:
              REORDER_MODE && IS_ADMIN ? ex.__tmpOrder || idx + 1 : ex.order};
          exerciseList.insertAdjacentHTML(
            'beforeend',
            renderExerciseCard(x, idx),
          );
        });

        list.forEach((ex) => attachExerciseHandlers(ex));
      }

      function qLabel(total, shown) {
        if (!filterSearch && !filterType && !filterCategory)
          return `Cwiczenia: ${total}`;
        if (shown === total) return `Cwiczenia: ${total}`;
        return `Cwiczenia: ${shown} / ${total}`;
      }
      function getNextOrder() {
        if (!cachedExercises.length) return 1;
        const max = Math.max(
          ...cachedExercises.map((x) => Number(x.order || 0)),
        );
        return (max || 0) + 1;
      }

      function renderExerciseCard(ex, idx) {
        const type = ex.type || 'Cwiczenie';
        const prompt = ex.prompt || '';
        const options = Array.isArray(ex.options) ? ex.options : [];
        const order = Number(ex.order || idx + 1);

        const isChoice = options.length >= 2;
        const isFill = type === 'Rellenar los espacios' || !isChoice;

        const optionsHtml = isFill
          ? `
            <div class="inputRow">
              <input class="textInput" id="inp-${ex.id}" placeholder="Escribe tu respuesta..." />
              <button class="btn btn-yellow" id="chk-${ex.id}" type="button">Comprobar</button>
            </div>
          `
          : `
            <div class="opts" id="opts-${ex.id}">
              ${options
                .map(
                  (o) =>
                    `<button class="optBtn" type="button" data-ex="${ex.id}" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`,
                )
                .join('')}
            </div>
          `;

        const adminControls = isAdmin
          ? `
              <div style="display:flex; gap:8px; align-items:center">
                <button class="btn" id="pv-${ex.id}" type="button" title="Podglad (uczen)">Podglad</button>
                <button class="btn-white-outline" id="edit-${ex.id}" type="button" title="Edytuj">Edytuj</button>
                <button class="btn-white-outline" id="dup-${ex.id}" type="button" title="Duplikuj">Duplikuj</button>
                <button class="dangerMini" id="del-${ex.id}" type="button" title="Usun">Usun</button>
              </div>
            `
          : '';

        return `
          <div class="exercise ${REORDER_MODE && IS_ADMIN ? 'dragHint' : ''}" id="ex-${ex.id}" data-id="${ex.id}" ${REORDER_MODE && IS_ADMIN ? 'draggable="true"' : ''}>
            ${adminControls}
            <div class="type">${escapeHtml(type)} · #${order} ${ex.category ? ` · <span class="pill pill-blue" style="padding:2px 8px; font-size:12px">${escapeHtml(ex.category)}</span>` : ''}</div>
            <h3>${escapeHtml(prompt)}</h3>
            ${ex.imageUrl ? `<img src="${escapeHtml(ex.imageUrl)}" alt="" style="max-width:100%; border-radius:14px; border:1px solid rgba(0,0,0,0.08); margin: 10px 0 12px;" />` : ''}
            ${optionsHtml}
            <div class="result" id="res-${ex.id}"></div>
            ${ex.notes ? `<div class="smallNote">${escapeHtml(ex.notes)}</div>` : ''}
          </div>
        `;
      }

      function disableChoiceButtons(exId) {
        const wrap = document.getElementById(`opts-${exId}`);
        if (!wrap) return;
        wrap
          .querySelectorAll('button.optBtn')
          .forEach((b) => (b.disabled = true));
      }

      function attachExerciseHandlers(ex) {
        const correct = String(ex.answer || '').trim();
        const res = document.getElementById(`res-${ex.id}`);

        // delete
        if (isAdmin) {
          document
            .getElementById('btnStudentPreview')
            ?.addEventListener('click', () => {
              const url = `ejercicio.html?level=${encodeURIComponent(LEVEL)}&id=${encodeURIComponent(TOPIC_ID)}&preview=1`;
              window.open(url, '_blank', 'noopener,noreferrer');
            });
          const delBtn = document.getElementById(`del-${ex.id}`);
          if (delBtn) {
            delBtn.onclick = async (ev) => {
              ev.stopPropagation();
              if (!confirm('Usunac to zadanie?')) return;
              try {
                await deleteDoc(doc(db, 'exercises', ex.id));
                showToast('Usunieto', 'ok', 1600);
                await loadExercises(currentTopic);
              } catch (e) {
                console.error(e);
                showToast('Blad usuwania (sprawdz konsole)', 'bad', 3200);
              }
            };
          }
        }

        // preview (admin)
        if (isAdmin) {
          const pvBtn = document.getElementById(`pv-${ex.id}`);
          if (pvBtn) {
            pvBtn.onclick = (ev) => {
              ev.stopPropagation();
              openPreview(ex);
            };
          }
        }

        if (isAdmin) {
          const editBtn = document.getElementById(`edit-${ex.id}`);
          if (editBtn) {
            editBtn.onclick = (ev) => {
              ev.stopPropagation();
              enterEditMode(ex);
            };
          }
          const dupBtn = document.getElementById(`dup-${ex.id}`);
          if (dupBtn) {
            dupBtn.onclick = async (ev) => {
              ev.stopPropagation();
              await duplicateExercise(ex);
            };
          }
        }

        // drag&drop reorder (admin)
        const card = document.getElementById(`ex-${ex.id}`);
        if (card && isAdmin && REORDER_MODE) {
          card.addEventListener('dragstart', (e) => {
            DRAG_ID = ex.id;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
          });
          card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
          });
          card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          });
          card.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetId = card.getAttribute('data-id');
            if (!DRAG_ID || !targetId || DRAG_ID === targetId) return;

            const fromIdx = ALL_EXERCISES.findIndex((x) => x.id === DRAG_ID);
            const toIdx = ALL_EXERCISES.findIndex((x) => x.id === targetId);
            if (fromIdx < 0 || toIdx < 0) return;

            const [moved] = ALL_EXERCISES.splice(fromIdx, 1);
            ALL_EXERCISES.splice(toIdx, 0, moved);
            HAS_ORDER_CHANGES = true;
            applyFilters();
          });
        }

        // text input mode
        const inp = document.getElementById(`inp-${ex.id}`);
        const chk = document.getElementById(`chk-${ex.id}`);
        if (inp && chk && res) {
          const check = () => {
            const user = String(inp.value || '').trim();
            if (!user) return;

            const ok = user.toLowerCase() === correct.toLowerCase();
            if (ok) {
              markDone(CURRENT_UID, ex.id);
            }
            res.innerHTML = ok
            ? `<span class="ok">Poprawne</span>`
              : `<span class="bad">Niepoprawne</span> <span class="smallNote">Poprawna: ${escapeHtml(correct)}</span>`;
          };

          chk.onclick = check;
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') check();
          });
          return;
        }

        // choice mode
        const wrap = document.getElementById(`opts-${ex.id}`);
        if (!wrap || !res) return;

        wrap.querySelectorAll('button.optBtn').forEach((btn) => {
          btn.onclick = () => {
            const picked = btn.getAttribute('data-opt') || '';
            const ok =
              picked.trim().toLowerCase() === correct.trim().toLowerCase();
            if (ok) {
              markDone(CURRENT_UID, ex.id);
            }

            res.innerHTML = ok
            ? `<span class="ok">Poprawne</span>`
              : `<span class="bad">Niepoprawne</span> <span class="smallNote">Poprawna: ${escapeHtml(correct)}</span>`;

            if (ok) disableChoiceButtons(ex.id);
          };
        });
      }

      async function loadExercises(topic) {
        exerciseList.innerHTML = '';
        emptyExercises.style.display = 'none';
        cachedExercises = [];

        const effectiveSlug =
          topic && (topic.slug || topic.id)
            ? String(topic.slug || topic.id)
            : '';

        if (!effectiveSlug) {
          emptyExercises.style.display = 'block';
          pillCount.textContent = 'Cwiczenia: -';
          return;
        }

        // Prefer topicId (courses docId) - our canonical contract
        let snap = null;
        try {
          const qx = query(
            collection(db, 'exercises'),
            where('level', '==', LEVEL),
            where('topicId', '==', String(COURSE_ID || currentTopic.id || '').trim()),
          );
          snap = await getDocs(qx);
        } catch (e) {
          // Often means missing composite index or field mismatch - keep fallback below
          console.warn('Primary exercises query failed', e);
        }

        // Fallback for legacy data that used topicSlug
        if (!snap || snap.empty) {
          const qx2 = query(
            collection(db, 'exercises'),
            where('level', '==', LEVEL),
            where('topicSlug', '==', effectiveSlug),
          );
          snap = await getDocs(qx2);
        }
        if (snap.empty) {
          emptyExercises.style.display = 'block';
          pillCount.textContent = 'Cwiczenia: 0';
          return;
        }

        snap.forEach((d) => cachedExercises.push({ id: d.id, ...d.data() }));
        cachedExercises.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        // state for filters/reorder
        ALL_EXERCISES = cachedExercises.slice();
        TOTAL_EXERCISES = Array.isArray(ALL_EXERCISES)
          ? ALL_EXERCISES.length
          : 0;
        CURRENT_TOPIC_KEY = `${LEVEL}__${effectiveSlug}`;
        await loadProgressForTopic(CURRENT_UID);

        VIEW_EXERCISES = cachedExercises.slice();
        buildTypeFilterOptions();
        applyFilters();

        // admin conveniences
        if (isAdmin) {
          exOrder.value = getNextOrder();
        }
      }

      // ===== Auth + boot =====
      let CURRENT_UID = null;

      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          window.location.href = 'login.html';
          return;
        }

        sessionEmail.textContent = user.email || '(brak emaila)';
        CURRENT_UID = user.uid || null;
        isAdmin = await getIsAdmin(user.uid);
        IS_ADMIN = isAdmin;
        adminWrap.style.display = isAdmin ? 'block' : 'none';
        const noAdminCard = document.getElementById('noAdminCard');
        if (noAdminCard) noAdminCard.style.display = isAdmin ? 'none' : 'block';

        fillExerciseTypes();
        refreshBulkMapOptions();
        bindMapTargets();
        if (libLevel) {
          libLevel.value = LEVEL;
          renderLibrarySets();
        }
        libLevel?.addEventListener('change', renderLibrarySets);
        btnInsertLibrary?.addEventListener('click', insertLibrarySet);
        if (btnCancelEdit) btnCancelEdit.style.display = 'none';

        // ===== Podpiecie UI szablonow =====
        const btnApplyTemplate = document.getElementById('btnApplyTemplate');
        const tplOverwrite = document.getElementById('tplOverwrite');

        // Apply on type change (fills only empty fields)
        exType.addEventListener('change', () =>
          applyTemplateForSelectedType(false),
        );

        if (btnApplyTemplate) {
          btnApplyTemplate.addEventListener('click', () =>
            applyTemplateForSelectedType(!!tplOverwrite?.checked),
          );
        }

        // Upgrade quick buttons: set type + apply
        const wireQuick = (id, type) => {
          const b = document.getElementById(id);
          if (!b) return;
          b.addEventListener('click', () => {
            exType.value = type;
            localStorage.setItem('lastExerciseType', type);
            applyTemplateForSelectedType(!!tplOverwrite?.checked);
            exPrompt?.focus?.();
          });
        };
        wireQuick('btnTplFill', 'Rellenar los espacios');
        wireQuick('btnTplChoice', 'Opción múltiple');
        wireQuick('btnTplTF', 'Verdadero o falso');
        wireQuick('btnTplScene', 'Mikro-scenka (dialog)');
        wireQuick('btnTplFindError', 'Znajdz blad');

        // First paint: ensure options visibility matches current type
        setOptionsVisibility(exType.value);

        // UI wiring
        if (filterType) {
          // default options; real types filled after load
          filterType.innerHTML = `<option value="">Wszystko</option>`;
        }
        if (!IS_ADMIN) {
          if (toggleReorder) toggleReorder.disabled = true;
          if (toggleReorder) toggleReorder.checked = false;
        }

        const onFilter = () => applyFilters();
        filterSearch?.addEventListener('input', onFilter);
        filterType?.addEventListener('change', onFilter);
        filterCategory?.addEventListener('change', onFilter);
        filterSort?.addEventListener('change', onFilter);

        btnClearFilters?.addEventListener('click', () => {
          if (filterSearch) filterSearch.value = '';
          if (filterType) filterType.value = '';
          if (filterCategory) filterCategory.value = '';
          if (filterSort) filterSort.value = 'order_asc';
          applyFilters();
        });

        toggleReorder?.addEventListener('change', () => {
          if (!IS_ADMIN) return;
          setReorderMode(toggleReorder.checked);
        });

        btnSaveOrder?.addEventListener('click', async () => {
          if (!IS_ADMIN) return;
          if (!currentTopic || !currentTopic.slug) return;
          if (!HAS_ORDER_CHANGES) {
            setToast('Brak zmian w kolejnosci.', 'info');
            return;
          }

          try {
            btnSaveOrder.disabled = true;
            // save sequential order starting at 1
            for (let i = 0; i < ALL_EXERCISES.length; i++) {
              const ex = ALL_EXERCISES[i];
              await updateDoc(doc(db, 'exercises', ex.id), { order: i + 1 });
            }
            setToast('Zapisano kolejnosc.', 'ok');
            HAS_ORDER_CHANGES = false;
            await loadExercises(currentTopic);
          } catch (e) {
            console.error(e);
            setToast('Nie udalo sie zapisac kolejnosci (konsola).', 'error');
          } finally {
            btnSaveOrder.disabled = false;
          }
        });

        // ESC closes preview
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && previewModal?.style.display === 'block') {
            previewModal.style.display = 'none';
          }
        });

        // If opened without params, do not try to query Firestore
        if (SKIP_LOAD) return;

        try {
          showToast('Ladowanie tematu...', 'warn', 1200);

          const topic = await loadTopic();
          // Lesson editor will be shown after topic loads
          if (!topic) {
            topicTitle.textContent = 'Nie znaleziono tematu';
            topicDesc.textContent =
              'Nie mozna wczytac tematu. Sprawdz link (level/slug/id).';
            pillType.textContent = '-';
            pillSlug.textContent = 'slug: -';
            pillCount.textContent = 'Cwiczenia: -';
            emptyExercises.style.display = 'block';
            showToast('Nie znaleziono tematu', 'warn', 2600);
            return;
          }

          await loadLessonMetaPublic(topic);
          if (isAdmin) await loadLessonMeta(topic);
          await loadExercises(topic);
          if (isAdmin) {
            exOrder.value = String(getNextOrder());
          }
        } catch (e) {
          console.error(e);
          showToast('Blad ladowania (sprawdz konsole)', 'bad', 3600);
        }
      });

      // ===== Admin actions =====

      // Templates
      function applyTemplate(kind) {
        if (!isAdmin) return;
        const next = String(getNextOrder());
        if (kind === 'fill') {
          exType.value = 'Rellenar los espacios';
          exPrompt.value = 'Completa la frase: Yo ___ de Espana.';
          exOptions.value = '';
          exAnswer.value = 'soy';
          exCategory.value = 'grammar';
          exNotes.value = "Podpowiedz: czasownik 'byc' w 1 os.";
          if (exTags) exTags.value = 'czasowniki, byc';
          if (exImageUrl) exImageUrl.value = '';
          exOrder.value = next;
        } else if (kind === 'choice') {
          exType.value = 'Opción múltiple';
          exPrompt.value = 'Elige la forma Poprawna: Ona ___ w domu.';
          exOptions.value = 'A) jestem\nB) jest\nC) sa';
          exAnswer.value = 'B';
          exCategory.value = 'grammar';
          exNotes.value = '';
          if (exTags) exTags.value = 'byc, terazniejszy';
          if (exImageUrl) exImageUrl.value = '';
          exOrder.value = next;
        } else if (kind === 'tf') {
          exType.value = 'Verdadero o falso';
          exPrompt.value =
            "'Mam' es la forma de 'tener' en polaco (1a persona).";
          exOptions.value = 'true\nfalse';
          exAnswer.value = 'true';
          exCategory.value = 'vocab';
          exNotes.value = '';
          if (exTags) exTags.value = 'miec, podstawy';
          if (exImageUrl) exImageUrl.value = '';
          exOrder.value = next;
        } else if (kind === 'scene') {
          exType.value = 'Mikro-scenka (dialog)';
          exPrompt.value =
            'Sytuacja: jestes w kawiarni i chcesz zamowic kawe. Wybierz najlepsza odpowiedz.';
          exOptions.value =
            'A) Poprosze kawe i wode.\nB) Ja jutro bylem w pracy.\nC) Mam niebieski plecak.';
          exAnswer.value = 'A';
          exCategory.value = 'both';
          exNotes.value =
            'Mikro-scenka: prompt = sytuacja, opcje = reakcje ucznia.';
          if (exTags) exTags.value = 'dialog, sytuacje, komunikacja';
          if (exImageUrl) exImageUrl.value = '';
          exOrder.value = next;
        } else if (kind === 'findError') {
          exType.value = 'Znajdz blad';
          exPrompt.value =
            "Znajdz blad i wybierz poprawna wersje: 'My jestesmy zmeczony.'";
          exOptions.value =
            'A) My jestesmy zmeczony.\nB) My jestesmy zmeczeni.\nC) My byc zmeczeni.';
          exAnswer.value = 'B';
          exCategory.value = 'grammar';
          exNotes.value =
            'Daj jedna poprawna odpowiedz i 2-3 czeste bledy.';
          if (exTags) exTags.value = 'gramatyka, znajdz blad';
          if (exImageUrl) exImageUrl.value = '';
          exOrder.value = next;
        }
        showToast('Szablon zastosowany', 'ok', 1400);
      }

      btnTplFill?.addEventListener('click', () => applyTemplate('fill'));
      btnTplChoice?.addEventListener('click', () => applyTemplate('choice'));
      btnTplTF?.addEventListener('click', () => applyTemplate('tf'));
      btnTplScene?.addEventListener('click', () => applyTemplate('scene'));
      btnTplFindError?.addEventListener('click', () =>
        applyTemplate('findError'),
      );

      // Import JSON (array)
      function safeParseJsonArray(raw) {
        const txt = (raw || '').trim();
        if (!txt) return [];
        const parsed = JSON.parse(txt);
        if (!Array.isArray(parsed))
          throw new Error('JSON musi byc tablica []');
        return parsed;
      }

      btnClearImport?.addEventListener('click', () => {
        if (importJsonArea) importJsonArea.value = '';
        if (importStatus) importStatus.textContent = '';
      });

      btnImportFlashcards?.addEventListener('click', () => {
        if (!flashImportArea || !exOptions || !exType) return;
        const raw = flashImportArea.value || '';
        const lines = String(raw)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const out = lines
          .map(parseFlashcardLine)
          .filter(Boolean);

        if (!out.length) {
          if (flashImportStatus) flashImportStatus.textContent = 'Brak poprawnych linii.';
          return;
        }

        exType.value = 'Tarjetas interactivas';
        setOptionsVisibility(exType.value);
        exOptions.value = out.join('\n');
        if (exPrompt && !exPrompt.value.trim())
          exPrompt.value = 'Fiszki (import)';

        if (flashImportStatus) flashImportStatus.textContent = `Wgrano: ${out.length}`;
      });

      btnClearFlashcards?.addEventListener('click', () => {
        if (flashImportArea) flashImportArea.value = '';
        if (flashImportStatus) flashImportStatus.textContent = '';
      });

      btnUploadFlashAudio?.addEventListener('click', uploadFlashAudio);
      btnCopyFlashAudio?.addEventListener('click', async () => {
        const url = String(flashAudioUrl?.value || '').trim();
        if (!url) return;
        try {
          await navigator.clipboard.writeText(url);
          if (flashAudioStatus) flashAudioStatus.textContent = 'Skopiowano ?';
        } catch {
          if (flashAudioStatus) flashAudioStatus.textContent = 'Nie udalo sie skopiowac.';
        }
      });

      btnImportJson?.addEventListener('click', async () => {
        if (!isAdmin || !currentTopic) return;
        if (!importJsonArea) return;

        if (importStatus) importStatus.textContent = 'Importando...';
        let items = [];
        try {
          items = safeParseJsonArray(importJsonArea.value);
        } catch (e) {
          console.error(e);
          if (importStatus) importStatus.textContent = 'Niepoprawny JSON';
          showToast('Niepoprawny JSON (sprawdz konsole)', 'bad', 3200);
          return;
        }

        if (!items.length) {
          if (importStatus) importStatus.textContent = 'Nada para importar.';
          showToast('Wklej tablice cwiczen', 'warn', 2200);
          return;
        }

        try {
          setSaving(true);
          const baseSlug = String(currentTopic.slug || currentTopic.id || '');
          let auto = getNextOrder();
          let saved = 0;

          // sequential to keep stable ordering
          for (const it of items) {
            if (!it || typeof it !== 'object') continue;

            const type = String(it.type || 'Rellenar los espacios');
            const prompt = String(it.prompt || '').trim();
            const answer = normalizeAnswer(String(it.answer || ''));
            const options = Array.isArray(it.options)
              ? it.options.map((x) => String(x))
              : parseOptions(String(it.options || ''));
            const notes = String(it.notes || '');
            const category = String(it.category || 'grammar');
            const tags = Array.isArray(it.tags)
              ? it.tags.map((x) => String(x))
              : toTagsArray(String(it.tags || ''));
            const imageUrl = String(it.imageUrl || '').trim();

            if (!prompt || !answer) continue;

            const order = Number(it.order || 0) > 0 ? Number(it.order) : auto++;

            await addDoc(collection(db, 'exercises'), {
              level: LEVEL,
              topicSlug: baseSlug,
              topicId: (String(COURSE_ID || currentTopic.id || '').trim() || null),
              type,
              prompt,
              imageUrl,
              options: options.length ? options : [],
              answer,
              notes,
              category,
              tags,
              order,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()});

            saved++;
          }

          if (importStatus) importStatus.textContent = `Zaimportowano: ${saved}`;
          showToast(`Zaimportowano: ${saved}`, 'ok', 2200);

          await loadExercises(currentTopic);
          exOrder.value = String(getNextOrder());
        } catch (e) {
          console.error(e);
          if (importStatus) importStatus.textContent = 'Blad';
          showToast('Blad importu (sprawdz konsole)', 'bad', 3600);
        } finally {
          setSaving(false);
        }
      });

      btnBulkClear?.addEventListener('click', () => {
        if (bulkImportArea) bulkImportArea.value = '';
        if (bulkImportStatus) bulkImportStatus.textContent = '';
        refreshBulkMapOptions();
      });

      btnLoadBulkFile?.addEventListener('click', () => {
        const file = bulkImportFile?.files?.[0];
        if (!file) {
          if (bulkImportStatus) bulkImportStatus.textContent = 'Wybierz plik CSV/TSV.';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          if (bulkImportArea) bulkImportArea.value = text;
          if (bulkImportStatus) bulkImportStatus.textContent = 'Plik wczytany ?';
          refreshBulkMapOptions();
        };
        reader.onerror = () => {
          if (bulkImportStatus) bulkImportStatus.textContent = 'Blad wczytywania pliku.';
        };
        reader.readAsText(file);
      });

      bulkImportArea?.addEventListener('blur', refreshBulkMapOptions);

      btnBulkImport?.addEventListener('click', async () => {
        if (!isAdmin || !currentTopic) return;
        if (!bulkImportArea) return;

        const raw = bulkImportArea.value || '';
        const mapping = getBulkMapping();
        if (mapping?.use) {
          if (mapping.map.prompt == null || mapping.map.answer == null) {
            if (bulkImportStatus)
              bulkImportStatus.textContent = 'Mapowanie: wybierz kolumny prompt + answer.';
            return;
          }
        }
        const { items, errors } = parseBulkRows(raw, mapping);
        if (!items.length) {
          if (bulkImportStatus)
            bulkImportStatus.textContent = 'Brak poprawnych wierszy.';
          return;
        }

        if (bulkImportStatus) bulkImportStatus.textContent = 'Importuje...';
        try {
          setSaving(true);
          let auto = getNextOrder();
          let saved = 0;
          const BATCH_LIMIT = 400;
          let batch = writeBatch(db);
          let pending = 0;

          for (const it of items) {
            const type = String(it.type || exType.value || 'Rellenar los espacios');
            const prompt = String(it.prompt || '').trim();
            const answer = String(it.answer || '').trim();
            if (!prompt || !answer) continue;

            const options = Array.isArray(it.options) ? it.options : [];
            const category = String(it.category || exCategory?.value || 'grammar');
            const tags = toTagsArray(it.tags || '');
            const notes = String(it.notes || '').trim();
            const imageUrl = String(it.imageUrl || '').trim();
            const orderNum = Number(it.order || 0) > 0 ? Number(it.order) : auto++;

            const refDoc = doc(collection(db, 'exercises'));
            batch.set(refDoc, {
              level: LEVEL,
              topicSlug: String(currentTopic.slug || currentTopic.id || ''),
              topicId: String(COURSE_ID || currentTopic.id || '').trim() || null,
              type,
              prompt,
              imageUrl,
              options: options.length ? options : [],
              answer,
              notes,
              category,
              tags,
              order: orderNum,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            pending += 1;
            saved += 1;

            if (pending >= BATCH_LIMIT) {
              await batch.commit();
              batch = writeBatch(db);
              pending = 0;
            }
          }
          if (pending > 0) await batch.commit();

          if (bulkImportStatus)
            bulkImportStatus.textContent = `Zaimportowano: ${saved} (bledy: ${errors})`;
          await loadExercises(currentTopic);
          exOrder.value = String(getNextOrder());
          showToast(`Import: ${saved} pozycji`, 'ok', 2200);
        } catch (e) {
          console.error(e);
          if (bulkImportStatus) bulkImportStatus.textContent = 'Blad importu.';
          showToast('Blad importu (sprawdz konsole)', 'bad', 3200);
        } finally {
          setSaving(false);
        }
      });

      function enterEditMode(ex) {
        if (!ex) return;
        EDIT_ID = ex.id;
        if (btnAddExercise) btnAddExercise.textContent = 'Zapisz zmiany';
        if (btnCancelEdit) btnCancelEdit.style.display = 'inline-flex';

        if (exType) exType.value = ex.type || exType.value;
        setOptionsVisibility(exType?.value || '');
        if (exPrompt) exPrompt.value = ex.prompt || '';
        if (exImageUrl) exImageUrl.value = ex.imageUrl || '';
        if (exOptions)
          exOptions.value = Array.isArray(ex.options) ? ex.options.join('\n') : '';
        if (exAnswer) exAnswer.value = ex.answer || '';
        if (exNotes) exNotes.value = ex.notes || '';
        if (exCategory) exCategory.value = ex.category || 'grammar';
        if (exTags)
          exTags.value = Array.isArray(ex.tags)
            ? ex.tags.join(', ')
            : String(ex.tags || '');
        if (exOrder) exOrder.value = String(Number(ex.order || getNextOrder()));

        window.scrollTo({ top: adminWrap?.offsetTop || 0, behavior: 'smooth' });
      }

      function exitEditMode() {
        EDIT_ID = null;
        if (btnAddExercise) btnAddExercise.textContent = 'Zapisz cwiczenie';
        if (btnCancelEdit) btnCancelEdit.style.display = 'none';
      }

      function clearExerciseForm() {
        if (exPrompt) exPrompt.value = '';
        if (exImageUrl) exImageUrl.value = '';
        if (exOptions) exOptions.value = '';
        if (exAnswer) exAnswer.value = '';
        if (exNotes) exNotes.value = '';
        if (exTags) exTags.value = '';
        if (exOrder) exOrder.value = String(getNextOrder());
      }

      async function duplicateExercise(ex) {
        if (!isAdmin || !currentTopic || !ex) return;
        try {
          const order = getNextOrder();
          await addDoc(collection(db, 'exercises'), {
            level: LEVEL,
            topicSlug: String(currentTopic.slug || currentTopic.id || ''),
            topicId: String(COURSE_ID || currentTopic.id || '').trim() || null,
            type: ex.type || '',
            prompt: ex.prompt || '',
            imageUrl: ex.imageUrl || '',
            options: Array.isArray(ex.options) ? ex.options : [],
            answer: ex.answer || '',
            notes: ex.notes || '',
            category: ex.category || 'grammar',
            tags: Array.isArray(ex.tags) ? ex.tags : [],
            order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showToast('Zduplikowano', 'ok', 1800);
          await loadExercises(currentTopic);
          exOrder.value = String(getNextOrder());
        } catch (e) {
          console.error(e);
          showToast('Blad duplikacji (sprawdz konsole)', 'bad', 3200);
        }
      }

      btnAutoOrder.onclick = () => {
        exOrder.value = String(getNextOrder());
        showToast('Ustawiono kolejnosc', 'ok', 1400);
      };

      btnCancelEdit?.addEventListener('click', () => {
        exitEditMode();
        clearExerciseForm();
        showToast('Edycja anulowana', 'warn', 1600);
      });

      btnAddExercise.onclick = async () => {
        if (!isAdmin || !currentTopic) return;

        // reset validation
        [exPrompt, exOptions, exAnswer, exOrder].forEach((el) =>
          markBad(el, false),
        );

        const type = exType.value;
        const prompt = exPrompt.value.trim();
        const notes = exNotes.value.trim();
        const answer = normalizeAnswer(exAnswer.value);
        let order = Number(exOrder.value || 0);

        let ok = true;

        if (!prompt) {
          markBad(exPrompt, true);
          ok = false;
        }
        if (!answer) {
          markBad(exAnswer, true);
          ok = false;
        }
        if (!order || order < 1) {
          order = getNextOrder();
          if (exOrder) exOrder.value = String(order);
        }

        const options = parseOptions(exOptions.value);
        const typeNeedsOptions =
          TEMPLATE_GROUPS.choice.has(type) ||
          TEMPLATE_GROUPS.trueFalse.has(type) ||
          TEMPLATE_GROUPS.scene.has(type) ||
          TEMPLATE_GROUPS.findError.has(type) ||
          TEMPLATE_GROUPS.dragDrop.has(type) ||
          TEMPLATE_GROUPS.matching.has(type) ||
          TEMPLATE_GROUPS.ordering.has(type) ||
          TEMPLATE_GROUPS.memory.has(type) ||
          TEMPLATE_GROUPS.grouping.has(type) ||
          TEMPLATE_GROUPS.cards.has(type);
        const needsOptions = options.length > 0 || typeNeedsOptions;

        if (needsOptions && options.length < 2) {
          markBad(exOptions, true);
          ok = false;
        }

        if (!ok) {
          showToast('Uzupelnij wymagane pola.', 'warn', 2600);
          return;
        }

        const imageUrl = (exImageUrl?.value || '').trim();
        try {
          setSaving(true);
          showToast('Zapisywanie...', 'warn', 1200);

          if (EDIT_ID) {
            await updateDoc(doc(db, 'exercises', EDIT_ID), {
              level: LEVEL,
              topicSlug: String(currentTopic.slug || currentTopic.id || ''),
              topicId: (String(COURSE_ID || currentTopic.id || '').trim() || null),
              type,
              prompt,
              imageUrl,
              options: options.length ? options : [],
              answer,
              notes,
              category: exCategory?.value || 'grammar',
              tags: toTagsArray(exTags?.value),
              order,
              updatedAt: serverTimestamp(),
            });
            exitEditMode();
            clearExerciseForm();
            await loadExercises(currentTopic);
            showToast('Zapisano zmiany', 'ok', 2000);
            return;
          }

          await addDoc(collection(db, 'exercises'), {
            level: LEVEL,
            topicSlug: String(currentTopic.slug || currentTopic.id || ''),
            topicId: (String(COURSE_ID || currentTopic.id || '').trim() || null),
            type,
            prompt,
            imageUrl,
            options: options.length ? options : [],
            answer,
            notes,
            category: exCategory?.value || 'grammar',
            tags: toTagsArray(exTags?.value),
            order,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // reset form
          clearExerciseForm();
          await loadExercises(currentTopic);
          showToast('Cwiczenie zapisane', 'ok', 2200);
        } catch (e) {
          console.error(e);
          showToast('Blad zapisu (sprawdz konsole)', 'bad', 3600);
        } finally {
          setSaving(false);
        }
      };

      // Enter on answer = save (admin)
      exAnswer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && isAdmin) btnAddExercise.click();
      });

      // ===== state =====
      let ALL_EXERCISES = [];
      let VIEW_EXERCISES = [];
      let IS_ADMIN = false;
      let EDIT_ID = null;
      let REORDER_MODE = false;
      let HAS_ORDER_CHANGES = false;
      let DRAG_ID = null;

      function toTagsArray(s) {
        return String(s || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      }

      function setToast(msg, kind = 'info') {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('toast-red', 'toast-yellow');
        if (kind === 'error') el.classList.add('toast-red');
        if (kind === 'ok') el.classList.add('toast-yellow');
        el.style.opacity = '1';
        clearTimeout(window.__toastT);
        window.__toastT = setTimeout(() => (el.style.opacity = '0'), 2500);
      }

      function applyFilters() {
        const q = (filterSearch?.value || '').trim().toLowerCase();
        const t = (filterType?.value || '').trim();
        const c = (filterCategory?.value || '').trim();
        const s = (filterSort?.value || 'order_asc').trim();

        VIEW_EXERCISES = ALL_EXERCISES.filter((ex) => {
          const hay =
            `${ex.prompt || ''} ${ex.answer || ''} ${(ex.options || []).join(' ')} ${ex.notes || ''}`.toLowerCase();
          const okQ = !q || hay.includes(q);
          const okT = !t || ex.type === t;
          const okC = !c || (ex.category || 'grammar') === c;
          return okQ && okT && okC;
        });

        if (!REORDER_MODE) {
          const [field, dirRaw] = s.split('_');
          const dir = dirRaw === 'desc' ? -1 : 1;
          VIEW_EXERCISES.sort((a, b) => {
            let va = 0;
            let vb = 0;
            if (field === 'prompt') {
              va = String(a.prompt || '').toLowerCase();
              vb = String(b.prompt || '').toLowerCase();
            } else {
              va = Number(a.order || 0);
              vb = Number(b.order || 0);
            }
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
          });
        }

        renderExerciseList();
      }

      function buildTypeFilterOptions() {
        if (!filterType) return;
        const unique = Array.from(
          new Set(ALL_EXERCISES.map((e) => e.type)),
        ).sort();
        filterType.innerHTML =
          `<option value="">Wszystko</option>` +
          unique
            .map(
              (x) =>
                `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
            )
            .join('');
      }

      function setReorderMode(on) {
        REORDER_MODE = !!on;
        HAS_ORDER_CHANGES = false;
        if (btnSaveOrder)
          btnSaveOrder.style.display =
            REORDER_MODE && IS_ADMIN ? 'inline-flex' : 'none';
        renderExerciseList();
      }

      function openPreview(ex) {
        if (!previewModal) return;
        previewResult.style.display = 'none';
        previewResult.textContent = '';
        previewResult.className = 'pill';

        const opt = Array.isArray(ex.options) ? ex.options : [];
        const type = ex.type || 'open';

        let body = `<div class="card" style="padding:12px; margin:0">
          <div class="smallNote" style="opacity:.9; margin-bottom:8px">Typ: <b>${escapeHtml(type)}</b> - Kategoria: <b>${escapeHtml(ex.category || 'grammar')}</b></div>
          <div style="font-weight:800; font-size:18px">${escapeHtml(ex.prompt || '')}</div>`;

        if (opt.length) {
          body +=
            `<div style="margin-top:10px; display:grid; gap:8px">` +
            opt
              .map((o, i) => {
                const letter = String.fromCharCode(65 + i);
                return `<label class="card" style="padding:10px; margin:0; cursor:pointer; display:flex; gap:10px; align-items:flex-start">
                <input type="radio" name="pv" value="${escapeHtml(o)}" style="margin-top:2px" />
                <div><b>${letter})</b> ${escapeHtml(o)}</div>
              </label>`;
              })
              .join('') +
            `</div>`;
          body += `<div class="smallNote" style="margin-top:8px; opacity:.9">Wybierz odpowiedz i kliknij "Sprawdz".</div>`;
        } else {
          body += `<div style="margin-top:10px">
            <input id="pvInput" placeholder="Wpisz odpowiedz..." />
          </div>`;
        }

        if (ex.notes) {
          body += `<div class="smallNote" style="margin-top:10px; opacity:.9">Nota: ${escapeHtml(ex.notes)}</div>`;
        }

        body += `</div>`;
        previewBody.innerHTML = body;

        btnCheckPreview.onclick = () => {
          let userAnswer = '';
          const picked = previewBody.querySelector('input[name="pv"]:checked');
          if (picked) userAnswer = picked.value;
          else
            userAnswer = (
              document.getElementById('pvInput')?.value || ''
            ).trim();

          const correct = normalizeAnswer(ex.answer);
          const given = normalizeAnswer(userAnswer);
          const ok = !!given && given === correct;

          previewResult.style.display = 'inline-flex';
          previewResult.classList.toggle('pill-yellow', ok);
          previewResult.classList.toggle('pill-red', !ok);
          previewResult.textContent = ok
            ? 'OK'
            : `Nie. Poprawna: ${ex.answer || ''}`;
        };

        previewBackdrop.onclick = () => (previewModal.style.display = 'none');
        btnClosePreview.onclick = () => (previewModal.style.display = 'none');
        previewModal.style.display = 'block';
      }



