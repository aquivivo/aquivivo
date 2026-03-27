import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { COURSE_PLAN, LEVEL_ORDER } from './lib/course-plan-a1b2.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.slice(2);
    if (inlineValue !== undefined) {
      out[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const t = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(t)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(t)) return false;
  return fallback;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function loadModule(name) {
  try {
    return require(name);
  } catch {}

  const fallbacks = [
    path.resolve(process.cwd(), 'functions', 'node_modules', name),
    path.resolve(process.cwd(), '.tmp_codegen', 'node_modules', name),
  ];
  for (const candidate of fallbacks) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error(`Missing npm package: ${name}`);
}

function loadServiceAccount(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved || '(empty)'}`);
  }
  const json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (String(json.type || '') !== 'service_account') {
    throw new Error(`Invalid service account JSON (type=${json.type || 'none'})`);
  }
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Service account missing required fields project_id/client_email/private_key');
  }
  return { resolved, json };
}

function normalizeLevel(raw) {
  const lvl = String(raw || '').toUpperCase().trim();
  return LEVEL_ORDER.includes(lvl) ? lvl : '';
}

function uniquePush(set, value, context = '') {
  const v = String(value || '').trim();
  if (!v) throw new Error(`Empty id detected${context ? ` (${context})` : ''}`);
  if (set.has(v)) throw new Error(`Duplicate id detected: ${v}${context ? ` (${context})` : ''}`);
  set.add(v);
}

function buildPlanDocuments({ seedSource, seedVersion }) {
  const now = new Date().toISOString();
  const topicDocs = [];
  const lessonDocs = [];
  const moduleDocs = [];
  const moduleIdsInOrder = [];

  const topicIds = new Set();
  const lessonIds = new Set();
  const moduleIds = new Set();

  for (const levelPlan of COURSE_PLAN) {
    const level = normalizeLevel(levelPlan.level);
    if (!level) continue;
    const topics = Array.isArray(levelPlan.topics) ? levelPlan.topics : [];
    let topicOrder = 0;

    topics.forEach((topic, idx) => {
      const topicId = String(topic.id || topic.slug || '').trim();
      const topicSlug = String(topic.slug || topicId).trim();
      const topicTitle = String(topic.title || topicSlug).trim();
      const topicDesc = String(topic.desc || '').trim();
      const topicType = String(topic.type || 'both').trim().toLowerCase();
      const lifeArea = String(topic.lifeArea || '').trim().toLowerCase();
      const grammarFocus = String(topic.grammarFocus || '').trim();

      uniquePush(topicIds, topicId, `topic ${level}`);
      topicOrder += 1;
      const topicData = {
        id: topicId,
        slug: topicSlug,
        level,
        order: topicOrder,
        title: topicTitle,
        desc: topicDesc,
        type: topicType || 'both',
        category: topicType || 'both',
        lifeArea,
        grammarFocus,
        isArchived: false,
        status: 'active',
        seedSource,
        seedVersion,
        updatedAt: now,
      };

      const lessonTitles = (Array.isArray(topic.lessons) ? topic.lessons : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 3);
      while (lessonTitles.length < 3) lessonTitles.push(`Practica guiada ${lessonTitles.length + 1}`);

      const stageFocuses = ['recognition', 'controlled', 'production'];
      const difficulties = [2, 3, 4];
      const lessonIdList = [];
      const miniTestIds = [];
      const lessonRoadmap = [];

      lessonTitles.forEach((lessonTitle, lessonIdx) => {
        const lessonId = `${level}__${topicSlug}__L${String(lessonIdx + 1).padStart(2, '0')}`;
        uniquePush(lessonIds, lessonId, `lesson ${topicSlug}`);
        lessonIdList.push(lessonId);
        lessonDocs.push({
          id: lessonId,
          data: {
            id: lessonId,
            level,
            topicId,
            topicSlug,
            title: `${topicTitle} - ${lessonTitle}`,
            stageFocus: stageFocuses[lessonIdx] || 'controlled',
            difficultyTarget: difficulties[lessonIdx] || 3,
            exerciseIds: [],
            estimatedMinutes: 12,
            seedSource,
            seedVersion,
            updatedAt: now,
          },
        });

        const miniId = `${level}__${topicSlug}__L${String(lessonIdx + 1).padStart(2, '0')}__MINITEST`;
        uniquePush(lessonIds, miniId, `minitest ${topicSlug}`);
        lessonIdList.push(miniId);
        miniTestIds.push(miniId);
        lessonDocs.push({
          id: miniId,
          data: {
            id: miniId,
            level,
            topicId,
            topicSlug,
            title: `${topicTitle} - mini test ${lessonIdx + 1}`,
            stageFocus: 'mixed',
            difficultyTarget: Math.min(5, (difficulties[lessonIdx] || 3) + 1),
            exerciseIds: [],
            estimatedMinutes: 8,
            miniTest: true,
            miniTestAfterLesson: lessonId,
            seedSource,
            seedVersion,
            updatedAt: now,
          },
        });

        lessonRoadmap.push({
          order: lessonIdx + 1,
          lessonId,
          lessonTitle,
          miniTestId: miniId,
          miniTestTitle: `Mini test ${lessonIdx + 1}`,
        });
      });

      topicData.lessonIds = lessonIdList;
      topicData.miniTestIds = miniTestIds;
      topicData.lessonRoadmap = lessonRoadmap;
      topicDocs.push({
        id: topicId,
        data: topicData,
      });

      const moduleId = `${level}__${topicSlug}__MODULE`;
      uniquePush(moduleIds, moduleId, `module ${topicSlug}`);
      moduleIdsInOrder.push(moduleId);
      moduleDocs.push({
        id: moduleId,
        data: {
          id: moduleId,
          level,
          topicId,
          topicSlug,
          title: `${topicTitle} - modulo`,
          lessonIds: lessonIdList,
          checkpointLessonId: miniTestIds[miniTestIds.length - 1] || '',
          miniTestLessonIds: miniTestIds,
          seedSource,
          seedVersion,
          updatedAt: now,
        },
      });
    });

    const examTopicId = `${level.toLowerCase()}-examen-general`;
    const examTopicSlug = examTopicId;
    uniquePush(topicIds, examTopicId, `level exam topic ${level}`);
    topicOrder += 1;
    topicDocs.push({
      id: examTopicId,
      data: {
        id: examTopicId,
        slug: examTopicSlug,
        level,
        order: topicOrder,
        title: `Examen general ${level}`,
        desc: `Evaluacion final del nivel ${level} antes de pasar al siguiente bloque.`,
        type: 'both',
        category: 'both',
        lifeArea: 'exam',
        grammarFocus: `repaso integral ${level}`,
        isLevelExam: true,
        lessonRoadmap: [
          {
            order: 1,
            lessonId: `${level}__EXAMEN_GENERAL`,
            lessonTitle: `Examen general ${level}`,
            miniTestId: '',
            miniTestTitle: '',
          },
        ],
        lessonIds: [`${level}__EXAMEN_GENERAL`],
        miniTestIds: [],
        isArchived: false,
        status: 'active',
        seedSource,
        seedVersion,
        updatedAt: now,
      },
    });

    const examLessonId = `${level}__EXAMEN_GENERAL`;
    uniquePush(lessonIds, examLessonId, `level exam lesson ${level}`);
    lessonDocs.push({
      id: examLessonId,
      data: {
        id: examLessonId,
        level,
        topicId: examTopicId,
        topicSlug: examTopicSlug,
        title: `Examen general ${level}`,
        stageFocus: 'mixed',
        difficultyTarget: 5,
        exerciseIds: [],
        estimatedMinutes: 20,
        levelExam: true,
        seedSource,
        seedVersion,
        updatedAt: now,
      },
    });

    const examModuleId = `${level}__EXAMEN_GENERAL__MODULE`;
    uniquePush(moduleIds, examModuleId, `level exam module ${level}`);
    moduleIdsInOrder.push(examModuleId);
    moduleDocs.push({
      id: examModuleId,
      data: {
        id: examModuleId,
        level,
        topicId: examTopicId,
        topicSlug: examTopicSlug,
        title: `Examen general ${level}`,
        lessonIds: [examLessonId],
        checkpointLessonId: examLessonId,
        levelExam: true,
        seedSource,
        seedVersion,
        updatedAt: now,
      },
    });
  }

  const coursePathDoc = {
    id: 'COURSE_PATH',
    data: {
      id: 'COURSE_PATH',
      courseKey: 'COURSE_PATH',
      courseType: 'language_life_poland',
      title: 'Curso completo de polaco',
      subtitle: 'Ruta continua A1-B2 con microtemas de idioma y vida en Polonia.',
      scope: 'all_levels',
      level: 'A1',
      levels: [...LEVEL_ORDER],
      moduleIds: moduleIdsInOrder,
      finalExamLessonId: 'B2__EXAMEN_GENERAL',
      adaptiveRules: {
        lowScore: { addRemedialLesson: true, focusDifficulties: [1, 2], repeatMistakes: true },
        highScore: { accelerateTo: [3, 4, 5], increaseListeningDialogue: true },
        reviewInsertionEvery: 6,
        bossMixRatio: { currentTopic: 0.5, previousTopic: 0.3, olderTopics: 0.2 },
      },
      seedSource,
      seedVersion,
      updatedAt: now,
    },
  };

  return {
    topics: topicDocs,
    lessons: lessonDocs,
    modules: moduleDocs,
    coursePath: coursePathDoc,
    topicIds: new Set(topicDocs.map((x) => x.id)),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function commitCollection(
  db,
  collectionName,
  docs,
  { merge = true, chunkSize = 400, maxRetries = 3, retryDelayMs = 500 } = {},
) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return 0;

  let written = 0;
  const chunks = Math.max(1, Math.ceil(list.length / chunkSize));
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const chunkNo = Math.floor(i / chunkSize) + 1;
    let success = false;
    let lastErr = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const batch = db.batch();
        chunk.forEach((entry) => {
          const ref = db.collection(collectionName).doc(String(entry.id));
          batch.set(ref, entry.data, { merge });
        });
        await batch.commit();
        written += chunk.length;
        console.log(
          `[write] ${collectionName} chunk ${chunkNo}/${chunks} committed (${chunk.length} docs, total ${written}/${list.length})`,
        );
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[retry] ${collectionName} chunk ${chunkNo}/${chunks} attempt ${attempt}/${maxRetries} failed: ${err?.message || err}`,
        );
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    if (!success) {
      throw new Error(
        `Batch write failed for ${collectionName} chunk ${chunkNo}/${chunks}: ${lastErr?.message || lastErr}`,
      );
    }
  }
  return written;
}

async function archiveOldTopics(db, topicIdsToKeep, { seedSource, seedVersion }) {
  const keep = new Set(Array.from(topicIdsToKeep || []).map((x) => String(x || '').trim()).filter(Boolean));
  const now = new Date().toISOString();
  const toArchive = [];

  for (const level of LEVEL_ORDER) {
    const snap = await db.collection('courses').where('level', '==', level).get();
    snap.forEach((docSnap) => {
      if (keep.has(docSnap.id)) return;
      const data = docSnap.data() || {};
      if (data.isArchived === true) return;
      toArchive.push({
        id: docSnap.id,
        data: {
          isArchived: true,
          status: 'archived',
          archivedAt: now,
          seedSource,
          seedVersion,
          updatedAt: now,
        },
      });
    });
  }

  if (!toArchive.length) return 0;
  return commitCollection(db, 'courses', toArchive, { merge: true, chunkSize: 300 });
}

async function main() {
  const args = parseArgs(process.argv);
  const firebaseAdmin = loadModule('firebase-admin');

  const servicePath = args['service-account'] || args.sa || '';
  if (!servicePath) throw new Error('Provide --service-account <path>');
  const { resolved: serviceResolved, json: serviceAccount } = loadServiceAccount(servicePath);

  const seedSource = String(args['seed-source'] || 'course_plan_micro_a1_b2');
  const seedVersion = String(args['seed-version'] || 'course_plan_v1_2026-02-14');
  const outDir = path.resolve(String(args['out-dir'] || 'import/generated'));
  const dryRun = toBool(args['dry-run'], false);

  if (!firebaseAdmin.apps?.length) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = firebaseAdmin.firestore();

  const docs = buildPlanDocuments({ seedSource, seedVersion });
  const report = {
    generatedAt: new Date().toISOString(),
    projectId: serviceAccount.project_id,
    serviceAccountPath: serviceResolved,
    dryRun,
    importSummary: {
      topics: docs.topics.length,
      lessons: docs.lessons.length,
      modules: docs.modules.length,
      coursePaths: 1,
    },
    levels: COURSE_PLAN.map((levelPlan) => ({
      level: levelPlan.level,
      topics: Array.isArray(levelPlan.topics) ? levelPlan.topics.length : 0,
    })),
  };

  ensureDir(outDir);
  const reportPath = path.join(outDir, 'course-plan-sync-report.json');
  const previewPath = path.join(outDir, 'course-plan-sync-preview.json');

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    previewPath,
    JSON.stringify(
      {
        topics: docs.topics,
        lessons: docs.lessons,
        modules: docs.modules,
        course_paths: [docs.coursePath],
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Preview saved: ${previewPath}`);
  console.log(`Report saved: ${reportPath}`);
  console.log(
    `Prepared docs: topics=${docs.topics.length}, lessons=${docs.lessons.length}, modules=${docs.modules.length}, course_paths=1`,
  );

  if (dryRun) {
    console.log('Dry run enabled. Firestore write skipped.');
    return;
  }

  const archived = await archiveOldTopics(db, docs.topicIds, { seedSource, seedVersion });
  const writtenTopics = await commitCollection(db, 'courses', docs.topics, { merge: true });
  const writtenLessons = await commitCollection(db, 'lessons', docs.lessons, { merge: true });
  const writtenModules = await commitCollection(db, 'modules', docs.modules, { merge: true });
  const writtenPath = await commitCollection(db, 'course_paths', [docs.coursePath], { merge: true });

  console.log(
    `Firestore write complete: archivedTopics=${archived}, topics=${writtenTopics}, lessons=${writtenLessons}, modules=${writtenModules}, course_paths=${writtenPath}`,
  );
}

main().catch((err) => {
  console.error('\nCourse plan sync failed:', err?.message || err);
  process.exitCode = 1;
});
