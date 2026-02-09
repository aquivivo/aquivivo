import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { levelsFromPlan, normalizeLevelList } from '../plan-levels.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const QS = new URLSearchParams(window.location.search);
const PRE_LEVEL = String(QS.get('level') || '').toUpperCase();
const TRACK = String(QS.get('track') || '').trim().toLowerCase();
const COURSE_VIEW = String(QS.get('view') || '').trim().toLowerCase();

const passportHint = $('passportHint');
const passportLevel = $('passportLevel');
const passportGrid = $('passportGrid');

const stampModal = $('stampModal');
const stampModalTitle = $('stampModalTitle');
const stampModalBody = $('stampModalBody');
const stampModalClose = $('stampModalClose');

const UNIT_SIZE = 6;
const ADMIN_EMAILS = ['aquivivo.pl@gmail.com'];

const CITIES = [
  {
    id: 'warszawa',
    emoji: '🏙️',
    pl: 'Warszawa',
    es: 'Varsovia',
    descPl:
      'Warszawa to stolica Polski. Miasto ma nowoczesne centrum i piękne parki nad Wisłą.',
    descEs:
      'Varsovia es la capital de Polonia. Tiene un centro moderno y parques bonitos junto al río Vístula.',
    challenge: {
      prompt: 'Warszawa to ___ Polski.',
      answer: 'stolica',
      tts: 'Warszawa to stolica Polski.',
    },
  },
  {
    id: 'krakow',
    emoji: '🐉',
    pl: 'Kraków',
    es: 'Cracovia',
    descPl:
      'Kraków to jedno z najstarszych miast w Polsce. Rynek, Wawel i Kazimierz są bardzo popularne.',
    descEs:
      'Cracovia es una de las ciudades más antiguas de Polonia. La Plaza del Mercado, Wawel y Kazimierz son muy populares.',
    challenge: {
      prompt: 'Kraków jest jednym z ___ miast w Polsce.',
      answer: 'najstarszych',
      tts: 'Kraków jest jednym z najstarszych miast w Polsce.',
    },
  },
  {
    id: 'gdansk',
    emoji: '⚓',
    pl: 'Gdańsk',
    es: 'Gdansk',
    descPl:
      'Gdańsk leży nad morzem. Stare Miasto, Motława i historia Solidarności robią wrażenie.',
    descEs:
      'Gdansk está junto al mar. El casco antiguo, el río Motława y la historia de Solidaridad impresionan.',
    challenge: {
      prompt: 'Gdańsk leży nad ___ .',
      answer: 'morzem',
      tts: 'Gdańsk leży nad morzem.',
    },
  },
  {
    id: 'wroclaw',
    emoji: '🌉',
    pl: 'Wrocław',
    es: 'Breslavia',
    descPl:
      'Wrocław ma wiele mostów i wysp. Na rynku możesz spotkać wrocławskie krasnale.',
    descEs:
      'Breslavia tiene muchos puentes e islas. En la plaza del mercado puedes encontrar los famosos duendes de la ciudad.',
    challenge: {
      prompt: 'Wrocław ma wiele ___ i wysp.',
      answer: 'mostów',
      tts: 'Wrocław ma wiele mostów i wysp.',
    },
  },
  {
    id: 'poznan',
    emoji: '🐐',
    pl: 'Poznań',
    es: 'Poznan',
    descPl:
      'Poznań słynie z koziołków na ratuszu. To miasto targów, biznesu i dobrej energii.',
    descEs:
      'Poznan es famoso por los cabritos del ayuntamiento. Es una ciudad de ferias, negocios y buena energía.',
    challenge: {
      prompt: 'Poznań słynie z ___ na ratuszu.',
      answer: 'koziołków',
      tts: 'Poznań słynie z koziołków na ratuszu.',
    },
  },
  {
    id: 'zakopane',
    emoji: '🏔️',
    pl: 'Zakopane',
    es: 'Zakopane',
    descPl:
      'Zakopane to stolica Tatr. Zimą są narty, a latem piękne szlaki w górach.',
    descEs:
      'Zakopane es la capital de los Tatras. En invierno hay esquí y en verano rutas preciosas en las montañas.',
    challenge: {
      prompt: 'Zakopane to stolica ___ .',
      answer: 'tatr',
      tts: 'Zakopane to stolica Tatr.',
    },
  },
];

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.min(b, Math.max(a, x));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeTrack(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function topicTrackList(topic) {
  const raw = topic?.track;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeTrack).filter(Boolean);
  const one = normalizeTrack(raw);
  return one ? [one] : [];
}

function topicMatchesTrack(topic) {
  const tracks = topicTrackList(topic);
  if (TRACK) return tracks.includes(TRACK);
  return tracks.length === 0;
}

function parseList(raw) {
  return String(raw || '')
    .split(/[\n;|,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function canRecordVoice() {
  return (
    typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function speakPolish(text) {
  const t = String(text || '').trim();
  if (!t) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;

  try {
    const utter = new SpeechSynthesisUtterance(t);
    utter.lang = 'pl-PL';
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const plVoice = voices.find((v) =>
      String(v.lang || '').toLowerCase().startsWith('pl'),
    );
    if (plVoice) utter.voice = plVoice;

    window.speechSynthesis?.cancel?.();
    window.speechSynthesis?.speak?.(utter);
  } catch {}
}

function topicKey(level, topic) {
  const lvl = String(level || '').toUpperCase();
  const slug = String(topic?.slug || topic?.id || '').trim();
  return slug ? `${lvl}__${slug}` : null;
}

function progressPct(progress) {
  if (!progress) return 0;
  if (progress.completed === true) return 100;
  const practice = Number(progress.practicePercent || 0);
  const testTotal = Number(progress.testTotal || 0);
  const testScore = Number(progress.testScore || 0);
  const best = testTotal > 0 ? Math.max(practice, testScore) : practice;
  return clamp(Math.round(best), 0, 100);
}

function progressState(progress) {
  const pct = progressPct(progress);
  const done = progress?.completed === true || pct >= 100;
  return { pct, done };
}

function cityForUnit(unitIndex) {
  const idx = Math.max(0, Number(unitIndex || 0));
  return CITIES[idx % CITIES.length];
}

async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase());
}

function computeAvailableLevels(userDoc, email) {
  const isAdmin =
    isAdminEmail(email) ||
    userDoc?.admin === true ||
    String(userDoc?.role || '').toLowerCase() === 'admin';
  if (isAdmin) return ['A1', 'A2', 'B1', 'B2'];

  const until = userDoc?.accessUntil || null;
  const untilDate = until?.toDate ? until.toDate() : until ? new Date(until) : null;
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? untilDate.getTime() > Date.now() : false;

  const raw = normalizeLevelList(userDoc?.levels);
  const levels = raw.length ? raw : normalizeLevelList(levelsFromPlan(userDoc?.plan));

  const plan = String(userDoc?.plan || '').toLowerCase();
  const hasGlobal = plan === 'premium' || (userDoc?.access === true && levels.length === 0);
  const allowed = hasGlobal ? ['A1', 'A2', 'B1', 'B2'] : levels;

  // Always show A1 as preview; add other levels only if access is valid.
  const list = ['A1', ...allowed.filter((x) => x && x !== 'A1')];
  return isUntilValid ? Array.from(new Set(list)) : ['A1'];
}

function fillLevelSelect(levels, preferred) {
  if (!passportLevel) return;
  passportLevel.innerHTML = '';
  levels.forEach((lvl) => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = `Nivel ${lvl}`;
    passportLevel.appendChild(opt);
  });
  if (preferred && levels.includes(preferred)) passportLevel.value = preferred;
}

async function loadProgressMap(uid, level) {
  const map = {};
  if (!uid) return map;
  try {
    const snap = await getDocs(
      query(collection(db, 'user_progress', uid, 'topics'), where('level', '==', level)),
    );
    snap.forEach((d) => {
      map[d.id] = d.data() || {};
    });
  } catch (e) {
    console.warn('[passport] loadProgressMap failed', e);
  }
  return map;
}

async function loadTopics(level) {
  const list = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'courses'), where('level', '==', level), orderBy('order')),
    );
    snap.forEach((d) => {
      const t = { id: d.id, ...(d.data() || {}) };
      if (t.isArchived === true) return;
      if (!topicMatchesTrack(t)) return;
      list.push(t);
    });
  } catch (e) {
    console.warn('[passport] loadTopics failed', e);
  }
  return list;
}

function renderGrid({ level, topics, progressMap }) {
  if (!passportGrid) return;
  passportGrid.innerHTML = '';

  if (!topics.length) {
    passportGrid.innerHTML = `<div class="muted">No hay temas para este nivel.</div>`;
    return;
  }

  const units = [];
  for (let i = 0; i < topics.length; i += UNIT_SIZE) {
    const chunk = topics.slice(i, i + UNIT_SIZE);
    units.push(chunk);
  }

  let unlocked = 0;

  units.forEach((unitTopics, unitIdx) => {
    const city = cityForUnit(unitIdx);

    const states = unitTopics.map((t) => {
      const key = topicKey(level, t);
      const prog = key ? progressMap[key] : null;
      return progressState(prog);
    });

    const total = unitTopics.length;
    const doneCount = states.filter((s) => s.done).length;
    const pct = total ? Math.round(states.reduce((sum, s) => sum + s.pct, 0) / total) : 0;
    const isDone = total > 0 && doneCount >= total;
    if (isDone) unlocked += 1;

    const stamp = document.createElement('button');
    stamp.type = 'button';
    stamp.className = `passportStamp ${isDone ? 'is-unlocked' : 'is-locked'}`;
    stamp.setAttribute('aria-label', `Sello: ${city.es}`);

    const top = document.createElement('div');
    top.className = 'passportStampTop';

    const emoji = document.createElement('div');
    emoji.className = 'passportStampEmoji';
    emoji.textContent = city.emoji;

    const textWrap = document.createElement('div');
    textWrap.style.minWidth = '0';
    textWrap.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'passportStampTitle';
    title.textContent = `${city.pl} · ${city.es}`;

    const meta = document.createElement('div');
    meta.className = 'passportStampMeta';
    meta.textContent = `Unidad ${unitIdx + 1} · ${doneCount}/${total} temas · ${pct}%`;

    textWrap.appendChild(title);
    textWrap.appendChild(meta);

    top.appendChild(emoji);
    top.appendChild(textWrap);
    stamp.appendChild(top);

    const pills = document.createElement('div');
    pills.className = 'passportStampPillRow';

    const p1 = document.createElement('span');
    p1.className = 'pill';
    p1.textContent = `Unidad ${unitIdx + 1}`;
    pills.appendChild(p1);

    const p2 = document.createElement('span');
    p2.className = isDone ? 'pill pill-blue' : 'pill';
    p2.textContent = isDone ? 'Sello ganado' : 'En curso';
    pills.appendChild(p2);

    const p3 = document.createElement('span');
    p3.className = 'pill pill-yellow';
    p3.textContent = `${pct}%`;
    pills.appendChild(p3);

    stamp.appendChild(pills);

    stamp.addEventListener('click', () =>
      openStampModal({
        level,
        unitIdx,
        isDone,
        topics: unitTopics,
        progress: { doneCount, total, pct },
        city,
      }),
    );

    passportGrid.appendChild(stamp);
  });

  if (passportHint) {
    passportHint.textContent = `Unidades: ${units.length} · Sellos: ${unlocked}/${units.length}`;
  }
}

function openStampModal({ level, unitIdx, isDone, topics, progress, city }) {
  if (!stampModal || !stampModalTitle || !stampModalBody) return;

  stampModalTitle.textContent = `${city.emoji} ${city.es}`;
  stampModalBody.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'stampBodyGrid';

  const status = document.createElement('div');
  status.className = 'hintSmall';
  status.style.marginBottom = '8px';
  status.textContent = isDone
    ? `✅ Sello ganado · Unidad ${unitIdx + 1} · Nivel ${level}`
    : `🔒 Bloqueado · Unidad ${unitIdx + 1} · Progreso ${progress.doneCount}/${progress.total}`;
  wrap.appendChild(status);

  if (!isDone) {
    const lock = document.createElement('div');
    lock.className = 'muted';
    lock.textContent =
      'Completa todos los temas de esta unidad para ganar el sello.';
    wrap.appendChild(lock);
  }

  const boxPl = document.createElement('div');
  boxPl.className = 'stampTextBox';
  boxPl.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Texto (PL)</div>
    <div class="mutedStrong" style="margin-top:6px;">${city.descPl}</div>
  `;
  wrap.appendChild(boxPl);

  const boxEs = document.createElement('div');
  boxEs.className = 'stampTextBox';
  boxEs.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Traducci&oacute;n (ES)</div>
    <div class="mutedStrong" style="margin-top:6px;">${city.descEs}</div>
  `;
  wrap.appendChild(boxEs);

  const challenge = document.createElement('div');
  challenge.className = 'stampChallenge';

  const cTitle = document.createElement('div');
  cTitle.className = 'sectionTitle';
  cTitle.style.marginTop = '0';
  cTitle.textContent = 'Mini-misión: escucha y completa';
  challenge.appendChild(cTitle);

  const cPrompt = document.createElement('div');
  cPrompt.className = 'stampChallengePrompt';

  const inputs = [];
  const parts = String(city?.challenge?.prompt || '').split('___');
  if (parts.length > 1) {
    parts.forEach((part, idx) => {
      cPrompt.appendChild(document.createTextNode(part));
      if (idx === parts.length - 1) return;
      const inp = document.createElement('input');
      inp.className = 'exerciseInlineInput';
      inp.type = 'text';
      inp.placeholder = '...';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inputs.push(inp);
      cPrompt.appendChild(inp);
    });
  } else {
    cPrompt.textContent = String(city?.challenge?.prompt || '').trim();
  }
  challenge.appendChild(cPrompt);

  const cActions = document.createElement('div');
  cActions.className = 'exerciseActions';
  cActions.style.marginTop = '10px';

  const btnListen = document.createElement('button');
  btnListen.className = 'btn-white-outline';
  btnListen.type = 'button';
  btnListen.textContent = 'Escuchar';
  btnListen.addEventListener('click', () => speakPolish(city?.challenge?.tts || city.descPl));

  const btnCheck = document.createElement('button');
  btnCheck.className = 'btn-yellow';
  btnCheck.type = 'button';
  btnCheck.textContent = 'Comprobar';

  const cRes = document.createElement('div');
  cRes.className = 'stampChallengeResult';

  btnCheck.addEventListener('click', () => {
    const expected = parseList(city?.challenge?.answer || '');
    const exp = expected.map((x) => normalizeText(x));
    const vals = inputs.length ? inputs.map((i) => String(i.value || '').trim()) : [];
    if (!inputs.length) return;
    if (vals.some((v) => !v)) {
      cRes.className = 'stampChallengeResult bad';
      cRes.textContent = 'Completa los espacios.';
      return;
    }

    const ok = vals.every((v) => exp.includes(normalizeText(v)));
    cRes.className = `stampChallengeResult ${ok ? 'ok' : 'bad'}`;
    cRes.textContent = ok ? '¡Perfecto!' : 'Intenta de nuevo.';
  });

  cActions.appendChild(btnListen);
  cActions.appendChild(btnCheck);
  challenge.appendChild(cActions);
  challenge.appendChild(cRes);
  wrap.appendChild(challenge);

  // Optional voice recorder (local only)
  const voice = document.createElement('div');
  voice.className = 'stampChallenge';
  voice.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Voz: lee y graba</div>
    <div class="muted" style="margin-top:6px;">Graba tu voz leyendo el texto (no se publica).</div>
  `;

  const vActions = document.createElement('div');
  vActions.className = 'exerciseActions';
  vActions.style.marginTop = '10px';

  const vAudio = document.createElement('audio');
  vAudio.controls = true;
  vAudio.className = 'exerciseAudioPreview';
  vAudio.style.display = 'none';

  const vCan = canRecordVoice();
  let vRecording = false;
  let vRecorder = null;
  let vStream = null;
  let vChunks = [];
  let vUrl = '';

  const vBtnListen = document.createElement('button');
  vBtnListen.className = 'btn-white-outline';
  vBtnListen.type = 'button';
  vBtnListen.textContent = 'Escuchar (PL)';
  vBtnListen.addEventListener('click', () => speakPolish(city.descPl));

  const vBtnRec = document.createElement('button');
  vBtnRec.className = 'btn-white-outline';
  vBtnRec.type = 'button';
  vBtnRec.textContent = 'Grabar voz';
  vBtnRec.disabled = !vCan;

  const vBtnClear = document.createElement('button');
  vBtnClear.className = 'btn-white-outline';
  vBtnClear.type = 'button';
  vBtnClear.textContent = 'Quitar voz';
  vBtnClear.style.display = 'none';

  const vCleanup = () => {
    try {
      vStream?.getTracks?.()?.forEach((t) => t.stop());
    } catch {}
    vStream = null;
    vRecorder = null;
    vChunks = [];
    vRecording = false;
  };

  const vClear = () => {
    if (vUrl) {
      try {
        URL.revokeObjectURL(vUrl);
      } catch {}
    }
    vUrl = '';
    try {
      vAudio.pause?.();
    } catch {}
    vAudio.removeAttribute('src');
    vAudio.style.display = 'none';
    vBtnClear.style.display = 'none';
  };

  vBtnClear.addEventListener('click', () => vClear());

  vBtnRec.addEventListener('click', async () => {
    if (!vCan) return;
    if (vRecording) {
      try {
        vRecorder?.stop();
      } catch {}
      return;
    }

    try {
      vClear();
      vCleanup();

      vStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      vRecorder = new MediaRecorder(vStream);
      vChunks = [];
      vRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) vChunks.push(e.data);
      };
      vRecorder.onstop = () => {
        vRecording = false;
        vBtnRec.textContent = 'Grabar voz';

        const blob = new Blob(vChunks, { type: vRecorder?.mimeType || 'audio/webm' });
        vUrl = URL.createObjectURL(blob);
        vAudio.src = vUrl;
        vAudio.style.display = 'block';
        vBtnClear.style.display = '';

        vCleanup();
      };

      vRecorder.start();
      vRecording = true;
      vBtnRec.textContent = 'Detener';
    } catch (e) {
      console.warn('[stamp] record failed', e);
      vCleanup();
    }
  });

  vActions.appendChild(vBtnListen);
  vActions.appendChild(vBtnRec);
  vActions.appendChild(vBtnClear);

  voice.appendChild(vActions);
  voice.appendChild(vAudio);

  if (!vCan) {
    const warn = document.createElement('div');
    warn.className = 'hintSmall';
    warn.style.marginTop = '8px';
    warn.textContent = 'Grabación no disponible en este navegador.';
    voice.appendChild(warn);
  }

  wrap.appendChild(voice);

  stampModalBody.appendChild(wrap);

  const close = () => {
    stampModal.style.display = 'none';
    vClear();
    vCleanup();
  };

  if (stampModalClose) stampModalClose.onclick = close;

  stampModal.addEventListener(
    'click',
    (e) => {
      if (e.target === stampModal) close();
    },
    { once: true },
  );

  stampModal.style.display = 'flex';
}

let CURRENT_UID = null;
let USER_DOC = null;
let loading = false;

async function loadForLevel(level) {
  if (loading) return;
  loading = true;
  try {
    if (passportHint) passportHint.textContent = 'Cargando...';
    if (passportGrid) passportGrid.innerHTML = '';
    const topics = await loadTopics(level);
    const progress = await loadProgressMap(CURRENT_UID, level);
    renderGrid({ level, topics, progressMap: progress });
  } finally {
    loading = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=recompensas.html';
    return;
  }

  CURRENT_UID = user.uid;
  USER_DOC = await getUserDoc(user.uid);

  const levels = computeAvailableLevels(USER_DOC, user.email);
  const preferred =
    PRE_LEVEL && levels.includes(PRE_LEVEL)
      ? PRE_LEVEL
      : levels.includes('A2')
        ? 'A2'
        : levels[0] || 'A1';
  fillLevelSelect(levels, preferred);

  passportLevel?.addEventListener('change', () => loadForLevel(passportLevel.value));
  await loadForLevel(passportLevel?.value || preferred);
});
