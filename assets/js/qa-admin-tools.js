import { db } from './firebase-init.js';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { checkpointDocId } from './progress-tools.js';

const LEVELS_A1_A2 = ['A1', 'A2'];
const QA_ADMIN_UIDS = [
  // Optional hard allow-list. Add your Firebase Auth UID(s) here.
  // 'PUT_YOUR_UID_HERE',
];

function normalizeLevel(raw) {
  const lvl = String(raw || '').trim().toUpperCase();
  return LEVELS_A1_A2.includes(lvl) ? lvl : '';
}

function normalizeLevels(rawLevels) {
  const arr = Array.isArray(rawLevels) ? rawLevels : [rawLevels];
  const out = [];
  arr.forEach((item) => {
    const lvl = normalizeLevel(item);
    if (lvl && !out.includes(lvl)) out.push(lvl);
  });
  return out;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function chunk(list, size = 400) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function setDocsInBatches(entries, { merge = true } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  let written = 0;
  for (const part of chunk(list, 400)) {
    const batch = writeBatch(db);
    part.forEach((entry) => {
      batch.set(entry.ref, entry.data, { merge });
    });
    await batch.commit();
    written += part.length;
  }
  return written;
}

async function deleteRefsInBatches(refs) {
  const list = Array.isArray(refs) ? refs : [];
  let deleted = 0;
  for (const part of chunk(list, 400)) {
    const batch = writeBatch(db);
    part.forEach((refItem) => {
      batch.delete(refItem);
    });
    await batch.commit();
    deleted += part.length;
  }
  return deleted;
}

function normTrack(raw) {
  return String(raw || '').trim().toLowerCase();
}

function topicKeyFor(level, topic) {
  const lvl = normalizeLevel(level);
  const slug = String(topic?.slug || topic?.id || '').trim();
  return lvl && slug ? `${lvl}__${slug}` : '';
}

function isArchivedTopic(topic) {
  return topic?.isArchived === true;
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function routeOptionsForCheckpoints() {
  return [
    { flow: 'continuous', view: '', track: '' },
    { flow: 'continuous', view: 'pro', track: '' },
    { flow: 'continuous', view: 'latam', track: 'latam' },
    { flow: 'continuous', view: 'pro', track: 'latam' },
  ];
}

function stableSortByOrder(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const ao = safeNum(a?.order, 999999);
    const bo = safeNum(b?.order, 999999);
    if (ao !== bo) return ao - bo;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

async function fetchLevelTopics(level) {
  const lvl = normalizeLevel(level);
  if (!lvl) return [];
  const snap = await getDocs(query(collection(db, 'courses'), where('level', '==', lvl)));
  return stableSortByOrder(
    snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((topic) => !isArchivedTopic(topic)),
  );
}

async function fetchLevelExercises(level) {
  const lvl = normalizeLevel(level);
  if (!lvl) return [];
  const snap = await getDocs(query(collection(db, 'exercises'), where('level', '==', lvl)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function fetchLevelLessons(level) {
  const lvl = normalizeLevel(level);
  if (!lvl) return [];
  try {
    const snap = await getDocs(query(collection(db, 'lessons'), where('level', '==', lvl)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    return [];
  }
}

async function fetchLevelModules(level) {
  const lvl = normalizeLevel(level);
  if (!lvl) return [];
  try {
    const snap = await getDocs(query(collection(db, 'modules'), where('level', '==', lvl)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    return [];
  }
}

async function fetchLevelCoursePaths(level) {
  const lvl = normalizeLevel(level);
  if (!lvl) return [];
  try {
    const snap = await getDocs(query(collection(db, 'course_paths'), where('level', '==', lvl)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    return [];
  }
}

function groupExercisesByTopic(exercises, topics) {
  const byTopicId = new Map();
  const byTopicSlug = new Map();

  (Array.isArray(exercises) ? exercises : []).forEach((ex) => {
    const topicId = String(ex?.topicId || '').trim();
    const topicSlug = String(ex?.topicSlug || '').trim();
    if (topicId) {
      if (!byTopicId.has(topicId)) byTopicId.set(topicId, []);
      byTopicId.get(topicId).push(ex);
    }
    if (topicSlug) {
      if (!byTopicSlug.has(topicSlug)) byTopicSlug.set(topicSlug, []);
      byTopicSlug.get(topicSlug).push(ex);
    }
  });

  const out = new Map();
  (Array.isArray(topics) ? topics : []).forEach((topic) => {
    const id = String(topic?.id || '').trim();
    const slug = String(topic?.slug || id).trim();
    let list = [];
    if (id && byTopicId.has(id)) list = byTopicId.get(id);
    else if (slug && byTopicSlug.has(slug)) list = byTopicSlug.get(slug);
    out.set(id || slug, list || []);
  });
  return out;
}

function testExerciseType(ex) {
  const t = String(ex?.type || '').toLowerCase();
  return t.includes('test final');
}

function buildTopicProgressPayload({ level, topic, exercises = [], source = 'qa_admin' }) {
  const now = serverTimestamp();
  const exIds = exercises.map((ex) => String(ex?.id || '').trim()).filter(Boolean);
  const testIds = exercises.filter((ex) => testExerciseType(ex)).map((ex) => String(ex.id));
  const testResults = {};
  testIds.forEach((id) => {
    testResults[id] = { correct: true, answer: 'qa_auto_complete' };
  });

  const totalAll = exIds.length;
  const testTotal = testIds.length;
  const practiceTotal = Math.max(0, totalAll - testTotal);

  return {
    kind: 'topic_progress',
    source,
    level,
    topicId: String(topic?.id || '').trim() || null,
    topicSlug: String(topic?.slug || topic?.id || '').trim() || null,
    topicTitle: String(topic?.title || topic?.name || '').trim() || '',
    totalExercises: totalAll,
    doneIds: exIds,
    doneCount: totalAll,
    overallPercent: 100,
    practiceTotal,
    practiceDone: practiceTotal,
    practicePercent: 100,
    testTotal,
    testAnswered: testTotal,
    testCorrect: testTotal,
    testScore: 100,
    testPassed: true,
    completed: true,
    completedAt: now,
    testResults,
    updatedAt: now,
    lastActivityAt: now,
  };
}

function buildCompletedStatePayload({ level, source = 'qa_admin', topicId = '', topicSlug = '' } = {}) {
  return {
    kind: 'progress_state',
    level: normalizeLevel(level) || String(level || '').toUpperCase(),
    topicId: String(topicId || '').trim() || null,
    topicSlug: String(topicSlug || '').trim() || null,
    available: true,
    unlocked: true,
    completed: true,
    status: 'completed',
    source,
    updatedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  };
}

async function ensureUserHasLevelAccess(uid, levels) {
  const userId = String(uid || '').trim();
  if (!userId) throw new Error('Brak uid.');

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const current = snap.exists() ? snap.data() || {} : {};

  const currentLevels = normalizeLevels(current?.levels || []);
  const wantedLevels = normalizeLevels(levels);
  const merged = [...currentLevels];
  wantedLevels.forEach((lvl) => {
    if (!merged.includes(lvl)) merged.push(lvl);
  });

  const untilNow = current?.accessUntil?.toDate ? current.accessUntil.toDate() : new Date();
  const untilTarget = new Date(Math.max(untilNow.getTime(), new Date('2099-12-31T23:59:59Z').getTime()));

  await setDoc(
    userRef,
    {
      access: true,
      blocked: false,
      levels: merged,
      accessUntil: Timestamp.fromDate(untilTarget),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { levels: merged, accessUntil: untilTarget.toISOString() };
}

async function writeTopicProgressForLevel(uid, level, source) {
  const userId = String(uid || '').trim();
  const lvl = normalizeLevel(level);
  if (!userId || !lvl) throw new Error('Brak uid/level.');

  const topics = await fetchLevelTopics(lvl);
  const exercises = await fetchLevelExercises(lvl);
  const exByTopic = groupExercisesByTopic(exercises, topics);

  const entries = [];
  topics.forEach((topic) => {
    const key = topicKeyFor(lvl, topic);
    if (!key) return;
    const exList = exByTopic.get(String(topic?.id || '').trim() || String(topic?.slug || '').trim()) || [];
    entries.push({
      ref: doc(db, 'user_progress', userId, 'topics', key),
      data: buildTopicProgressPayload({
        level: lvl,
        topic,
        exercises: exList,
        source,
      }),
    });
  });

  const written = await setDocsInBatches(entries, { merge: true });
  return { topics, exercises, written };
}

async function writeCheckpointProgressForLevel(uid, level, topicCount, source) {
  const userId = String(uid || '').trim();
  const lvl = normalizeLevel(level);
  if (!userId || !lvl) return { written: 0, count: 0 };

  const checkpointCount = Math.max(0, Math.ceil(Math.max(0, Number(topicCount || 0)) / 3));
  if (!checkpointCount) return { written: 0, count: 0 };

  const entries = [];
  const routes = routeOptionsForCheckpoints();
  for (let block = 1; block <= checkpointCount; block += 1) {
    for (const routeOpts of routes) {
      const id = checkpointDocId(block, routeOpts);
      entries.push({
        ref: doc(db, 'user_progress', userId, 'topics', id),
        data: {
          kind: 'checkpoint',
          source,
          block,
          routeKey: `${routeOpts.flow || 'continuous'}__${routeOpts.view || 'default'}__${routeOpts.track || 'global'}`,
          passed: true,
          scorePct: 100,
          answered: 10,
          correct: 10,
          level: lvl,
          updatedAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        },
      });
    }
  }
  const written = await setDocsInBatches(entries, { merge: true });
  return { written, count: checkpointCount };
}

async function writeLessonModuleCourseProgress(uid, level, source) {
  const userId = String(uid || '').trim();
  const lvl = normalizeLevel(level);
  if (!userId || !lvl) return { lessons: 0, modules: 0, courses: 0 };

  const [lessons, modules, coursePaths] = await Promise.all([
    fetchLevelLessons(lvl),
    fetchLevelModules(lvl),
    fetchLevelCoursePaths(lvl),
  ]);

  const lessonEntries = lessons.map((lesson) => ({
    ref: doc(db, 'user_progress', userId, 'lessons', String(lesson.id)),
    data: {
      ...buildCompletedStatePayload({
        level: lvl,
        source,
        topicId: lesson?.topicId || '',
        topicSlug: lesson?.topicSlug || '',
      }),
      lessonId: String(lesson.id),
      title: String(lesson?.title || ''),
    },
  }));

  const moduleEntries = modules.map((module) => ({
    ref: doc(db, 'user_progress', userId, 'modules', String(module.id)),
    data: {
      ...buildCompletedStatePayload({
        level: lvl,
        source,
        topicId: module?.topicId || '',
        topicSlug: module?.topicSlug || '',
      }),
      moduleId: String(module.id),
      title: String(module?.title || ''),
      checkpointLessonId: String(module?.checkpointLessonId || '') || null,
    },
  }));

  const courseEntries = coursePaths.map((course) => ({
    ref: doc(db, 'user_progress', userId, 'courses', String(course.id)),
    data: {
      ...buildCompletedStatePayload({ level: lvl, source }),
      courseId: String(course.id),
      finalExamLessonId: String(course?.finalExamLessonId || '') || null,
    },
  }));

  const [lessonWrites, moduleWrites, courseWrites] = await Promise.all([
    setDocsInBatches(lessonEntries, { merge: true }),
    setDocsInBatches(moduleEntries, { merge: true }),
    setDocsInBatches(courseEntries, { merge: true }),
  ]);

  return {
    lessons: lessonWrites,
    modules: moduleWrites,
    courses: courseWrites,
  };
}

export async function isQaAdminUser(authUser, userDoc = {}) {
  const uid = String(authUser?.uid || '').trim();
  if (!uid) return { allowed: false, reasons: [] };

  let claims = {};
  try {
    const token = await authUser.getIdTokenResult(true);
    claims = token?.claims || {};
  } catch {}

  const reasons = [];
  if (claims?.admin === true) reasons.push('claim_admin');
  if (String(claims?.role || '').toLowerCase() === 'admin') reasons.push('claim_role_admin');
  if (userDoc?.admin === true) reasons.push('user_doc_admin');
  if (String(userDoc?.role || '').toLowerCase() === 'admin') reasons.push('user_doc_role_admin');
  if (QA_ADMIN_UIDS.includes(uid)) reasons.push('uid_allowlist');

  return {
    allowed: reasons.length > 0,
    reasons,
    claims,
  };
}

export async function markAllCompleted(level, options = {}) {
  const lvl = normalizeLevel(level);
  if (!lvl) throw new Error(`Nieobslugiwany level: ${String(level || '')}`);

  const userId = String(options?.uid || '').trim();
  if (!userId) throw new Error('Brak uid.');

  const includePrerequisites = options?.includePrerequisites !== false;
  const levelsToProcess = [];
  if (includePrerequisites && lvl === 'A2') levelsToProcess.push('A1');
  levelsToProcess.push(lvl);

  const uniqueLevels = normalizeLevels(levelsToProcess);
  await ensureUserHasLevelAccess(userId, uniqueLevels);

  const summary = {
    uid: userId,
    levels: uniqueLevels,
    topicProgressWrites: 0,
    checkpointWrites: 0,
    checkpointBlocks: 0,
    lessonWrites: 0,
    moduleWrites: 0,
    courseWrites: 0,
  };

  for (const currentLevel of uniqueLevels) {
    const source = String(options?.source || 'qa_admin_mark_all');
    const topicResult = await writeTopicProgressForLevel(userId, currentLevel, source);
    summary.topicProgressWrites += topicResult.written;

    const checkpointResult = await writeCheckpointProgressForLevel(
      userId,
      currentLevel,
      topicResult.topics.length,
      source,
    );
    summary.checkpointWrites += checkpointResult.written;
    summary.checkpointBlocks += checkpointResult.count;

    const lmc = await writeLessonModuleCourseProgress(userId, currentLevel, source);
    summary.lessonWrites += lmc.lessons;
    summary.moduleWrites += lmc.modules;
    summary.courseWrites += lmc.courses;
  }

  return summary;
}

export async function markAllCompletedAllLevels(options = {}) {
  const uid = String(options?.uid || '').trim();
  if (!uid) throw new Error('Brak uid.');

  const source = String(options?.source || 'qa_admin_mark_all_levels');
  const all = await markAllCompleted('A2', {
    uid,
    includePrerequisites: true,
    source,
  });
  return all;
}

export async function resetAllProgress(options = {}) {
  const uid = String(options?.uid || '').trim();
  if (!uid) throw new Error('Brak uid.');

  const refs = [];
  const userProgressRoot = doc(db, 'user_progress', uid);
  const subcollections = ['topics', 'lessons', 'modules', 'courses', 'checkpoints'];

  for (const sub of subcollections) {
    try {
      const snap = await getDocs(collection(userProgressRoot, sub));
      snap.forEach((d) => refs.push(d.ref));
    } catch {}
  }

  const deleted = await deleteRefsInBatches(refs);

  await setDoc(
    doc(db, 'users', uid),
    {
      updatedAt: serverTimestamp(),
      lastProgressResetAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    uid,
    deletedDocs: deleted,
    fromSubcollections: subcollections,
  };
}

function formatResultLine(prefix, obj) {
  const payload = isObject(obj) ? obj : {};
  return `${prefix}: ${JSON.stringify(payload)}`;
}

function ensureQaCardHost() {
  const existing = document.getElementById('qaToolsCardHost');
  if (existing) return existing;

  const container = document.querySelector('main .container');
  if (!container) return null;

  const host = document.createElement('div');
  host.id = 'qaToolsCardHost';
  host.className = 'card';
  host.style.marginTop = '16px';
  host.style.display = 'none';

  const coursesAnchor = document.getElementById('cursos');
  if (coursesAnchor && coursesAnchor.parentElement === container) {
    container.insertBefore(host, coursesAnchor);
  } else {
    container.appendChild(host);
  }
  return host;
}

export function mountQaToolsPanel({
  enabled = false,
  authUid = '',
  targetUid = '',
  targetEmail = '',
  adminReasons = [],
  onStatus = null,
} = {}) {
  const host = ensureQaCardHost();
  if (!host) return null;
  if (!enabled) {
    host.style.display = 'none';
    host.innerHTML = '';
    return null;
  }

  const uid = String(targetUid || authUid || '').trim();
  const qaHint = adminReasons.length ? `(${adminReasons.join(', ')})` : '';
  host.style.display = '';
  host.innerHTML = `
    <div class="sectionTitle" style="margin-top:0;">Admin / QA tools</div>
    <div class="muted" style="margin-top:6px; line-height:1.5;">
      Target UID: <b>${uid}</b>${targetEmail ? ` · ${targetEmail}` : ''}<br/>
      Dostep QA: ${qaHint || '(admin)'}
    </div>
    <div class="metaRow" style="margin-top:12px; gap:10px; flex-wrap:wrap;">
      <button id="qaUnlockA1Btn" class="btn-yellow" type="button">Unlock all A1</button>
      <button id="qaUnlockA2Btn" class="btn-yellow" type="button">Unlock all A2</button>
      <button id="qaUnlockBothBtn" class="btn-yellow" type="button">Unlock all A1 + A2</button>
      <button id="qaResetProgressBtn" class="btn-white-outline" type="button">Reset progress</button>
    </div>
    <div class="hintSmall" id="qaToolsStatus" style="margin-top:10px; display:none;"></div>
    <div class="hintSmall" style="margin-top:10px;">
      QA run (UI smoke): uruchom skrypt terminalowy
      <code>node import/run-qa-ui-smoke.mjs ...</code>
    </div>
  `;

  const statusEl = document.getElementById('qaToolsStatus');
  const setStatus = (text, kind = 'ok') => {
    if (!statusEl) return;
    if (!text) {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
      return;
    }
    statusEl.style.display = 'block';
    statusEl.textContent = text;
    statusEl.style.color = kind === 'bad' ? '#ffd1d6' : kind === 'warn' ? '#ffe08a' : 'rgba(255,255,255,0.92)';
    if (typeof onStatus === 'function') onStatus(text, kind);
  };

  const withBusy = async (btnId, fn) => {
    const btn = document.getElementById(btnId);
    if (!btn) return null;
    const old = btn.textContent || '';
    btn.disabled = true;
    btn.textContent = 'Working...';
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  document.getElementById('qaUnlockA1Btn')?.addEventListener('click', async () => {
    try {
      setStatus('Unlock A1 in progress...');
      const result = await withBusy('qaUnlockA1Btn', () =>
        markAllCompleted('A1', { uid, includePrerequisites: false, source: 'qa_admin_panel' }),
      );
      setStatus(formatResultLine('Unlock A1 OK', result), 'ok');
    } catch (e) {
      setStatus(`Unlock A1 error: ${e?.message || e}`, 'bad');
    }
  });

  document.getElementById('qaUnlockA2Btn')?.addEventListener('click', async () => {
    try {
      setStatus('Unlock A2 in progress...');
      const result = await withBusy('qaUnlockA2Btn', () =>
        markAllCompleted('A2', { uid, includePrerequisites: true, source: 'qa_admin_panel' }),
      );
      setStatus(formatResultLine('Unlock A2 OK', result), 'ok');
    } catch (e) {
      setStatus(`Unlock A2 error: ${e?.message || e}`, 'bad');
    }
  });

  document.getElementById('qaUnlockBothBtn')?.addEventListener('click', async () => {
    try {
      setStatus('Unlock A1+A2 in progress...');
      const result = await withBusy('qaUnlockBothBtn', () =>
        markAllCompletedAllLevels({ uid, source: 'qa_admin_panel' }),
      );
      setStatus(formatResultLine('Unlock A1+A2 OK', result), 'ok');
    } catch (e) {
      setStatus(`Unlock A1+A2 error: ${e?.message || e}`, 'bad');
    }
  });

  document.getElementById('qaResetProgressBtn')?.addEventListener('click', async () => {
    try {
      setStatus('Reset in progress...');
      const result = await withBusy('qaResetProgressBtn', () =>
        resetAllProgress({ uid, source: 'qa_admin_panel' }),
      );
      setStatus(formatResultLine('Reset OK', result), 'ok');
    } catch (e) {
      setStatus(`Reset error: ${e?.message || e}`, 'bad');
    }
  });

  window.markAllCompleted = async (level) =>
    markAllCompleted(level, { uid, includePrerequisites: true, source: 'qa_console_api' });
  window.markAllCompletedAllLevels = async () =>
    markAllCompletedAllLevels({ uid, source: 'qa_console_api' });

  return host;
}
