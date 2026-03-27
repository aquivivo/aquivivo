import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, rawVal] = token.split('=');
    const name = key.slice(2);
    if (rawVal !== undefined) {
      out[name] = rawVal;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[name] = true;
    else {
      out[name] = next;
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

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function uniq(list) {
  return Array.from(new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean)));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function loadModule(name) {
  try {
    return require(name);
  } catch {}
  const localTmp = path.resolve(process.cwd(), '.tmp_codegen', 'node_modules', name);
  if (fs.existsSync(localTmp)) return require(localTmp);
  const localFunctions = path.resolve(process.cwd(), 'functions', 'node_modules', name);
  if (fs.existsSync(localFunctions)) return require(localFunctions);
  throw new Error(
    `Brak pakietu ${name}. Zainstaluj np. "npm i --prefix .tmp_codegen ${name}".`,
  );
}

function loadServiceAccount(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`Nie znaleziono service account JSON: ${resolved || '(pusty path)'}`);
  }
  const json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (String(json.type || '') !== 'service_account') {
    throw new Error(`Plik nie wyglada na service account (type=${json.type || 'brak'}).`);
  }
  return { resolved, json };
}

function normalizeCollectionName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '');
}

function selectCollectionAlias(existingNames, candidates, fallback) {
  const normMap = new Map(
    (existingNames || []).map((name) => [normalizeCollectionName(name), name]),
  );
  for (const candidate of candidates || []) {
    const key = normalizeCollectionName(candidate);
    if (normMap.has(key)) return normMap.get(key);
  }
  return fallback;
}

async function resolveCollectionNames(db) {
  const roots = await db.listCollections();
  const names = roots.map((c) => c.id);
  return {
    roots: names,
    courses: selectCollectionAlias(names, ['courses', 'kursy'], 'courses'),
    lessons: selectCollectionAlias(names, ['lessons', 'lekcje'], 'lessons'),
  };
}

function randomPick(list, count) {
  const arr = Array.isArray(list) ? [...list] : [];
  const out = [];
  while (arr.length && out.length < count) {
    const idx = Math.floor(Math.random() * arr.length);
    out.push(arr.splice(idx, 1)[0]);
  }
  return out;
}

function urlJoin(baseUrl, relPath) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const rel = String(relPath || '').replace(/^\/+/, '');
  return `${base}/${rel}`;
}

function navParamsForLesson(lesson) {
  const level = String(lesson.level || '').toUpperCase();
  const topicId = String(lesson.topicId || '').trim();
  const params = new URLSearchParams();
  params.set('level', level);
  params.set('id', topicId);
  params.set('view', 'pro');
  params.set('flow', 'continuous');
  return params.toString();
}

async function login(page, { baseUrl, email, password }) {
  const url = urlJoin(baseUrl, 'login.html?next=espanel.html');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('#email', String(email || ''));
  await page.fill('#password', String(password || ''));
  await Promise.all([
    page.click('#loginBtn'),
    page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => null),
  ]);

  const finalUrl = page.url();
  if (finalUrl.includes('espanel.html')) return true;

  // Fallback: one more wait for redirects.
  try {
    await page.waitForURL(/espanel\.html/i, { timeout: 15000 });
    return true;
  } catch {
    const msg = await page.locator('#message').first().textContent().catch(() => '');
    throw new Error(`Logowanie nieudane. URL=${finalUrl} MSG=${String(msg || '').trim()}`);
  }
}

async function clickIfVisible(locator) {
  try {
    const count = await locator.count();
    if (!count) return false;
    const first = locator.first();
    if (!(await first.isVisible())) return false;
    await first.click({ timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function interactWithCard(card, actionLog) {
  let actionDone = false;
  try {
    await card.scrollIntoViewIfNeeded();
  } catch {}

  try {
    const radios = card.locator('input[type="radio"]');
    if ((await radios.count()) > 0) {
      await radios.first().check({ force: true, timeout: 2500 });
      actionLog.push('select_radio');
      actionDone = true;
    }
  } catch {}

  if (!actionDone) {
    try {
      const checks = card.locator('input[type="checkbox"]');
      if ((await checks.count()) > 0) {
        await checks.first().check({ force: true, timeout: 2500 });
        actionLog.push('select_checkbox');
        actionDone = true;
      }
    } catch {}
  }

  if (!actionDone) {
    const clickCandidates = [
      '.optionCard',
      '.choiceOption',
      '.exerciseOption',
      '.answerCard',
      '[data-opt-id]',
      '[data-option-id]',
      '.wordTile',
      '.tile',
    ];
    for (const sel of clickCandidates) {
      const ok = await clickIfVisible(card.locator(sel));
      if (ok) {
        actionLog.push(`click_${sel}`);
        actionDone = true;
        break;
      }
    }
  }

  try {
    const textInput = card.locator('input[type="text"], textarea');
    if ((await textInput.count()) > 0) {
      await textInput.first().fill('test', { timeout: 2500 });
      actionLog.push('fill_input');
      actionDone = true;
    }
  } catch {}

  const checkByName = await clickIfVisible(
    card.locator(
      'button:has-text("Comprobar"), button:has-text("Sprawdz"), button:has-text("Sprawdź"), button:has-text("Check"), button:has-text("Hecho"), button:has-text("Verificar")',
    ),
  );
  if (checkByName) {
    actionLog.push('click_check_named');
    return true;
  }

  const checkByClass = await clickIfVisible(card.locator('button.btn-yellow'));
  if (checkByClass) {
    actionLog.push('click_check_primary');
    return true;
  }

  return actionDone;
}

async function runExerciseInteractions(page, lessonResult, { minActions = 5, maxActions = 10 }) {
  const targetActions = Math.max(minActions, Math.min(maxActions, minActions + Math.floor(Math.random() * (maxActions - minActions + 1))));
  const cards = page.locator('.exerciseCard');
  await page.waitForTimeout(500);
  const totalCards = await cards.count().catch(() => 0);
  lessonResult.totalCards = totalCards;
  if (!totalCards) {
    lessonResult.errors.push('No .exerciseCard found');
    return 0;
  }

  const actionLog = [];
  let done = 0;
  for (let i = 0; i < totalCards && done < targetActions; i += 1) {
    try {
      const card = cards.nth(i);
      if (!(await card.isVisible().catch(() => false))) continue;
      const ok = await interactWithCard(card, actionLog);
      if (ok) done += 1;
      await page.waitForTimeout(180);
    } catch (e) {
      lessonResult.errors.push(`Card interaction error #${i + 1}: ${e?.message || e}`);
    }
  }
  lessonResult.actions = done;
  lessonResult.actionLog = actionLog.slice(0, 120);
  if (done < minActions) {
    lessonResult.errors.push(`Too few interactions: ${done}/${minActions}`);
  }
  return done;
}

async function loadLessonsForLevels(db, collections, levels, lessonsPerTopic) {
  const output = [];
  const lessonsCollection = collections.lessons;
  const coursesCollection = collections.courses;

  const courseMap = new Map();
  for (const level of levels) {
    const courseSnap = await db
      .collection(coursesCollection)
      .where('level', '==', String(level))
      .get();
    courseSnap.forEach((d) => {
      const data = d.data() || {};
      const key = `${String(level)}::${String(data.slug || d.id)}`;
      courseMap.set(key, { id: d.id, slug: String(data.slug || d.id), level: String(level) });
    });
  }

  for (const level of levels) {
    let lessons = [];
    try {
      const snap = await db
        .collection(lessonsCollection)
        .where('level', '==', String(level))
        .get();
      lessons = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    } catch {}

    if (!lessons.length) {
      // Fallback: pseudo-lessons based on courses.
      const fallbackCourses = await db
        .collection(coursesCollection)
        .where('level', '==', String(level))
        .get();
      fallbackCourses.forEach((docSnap) => {
        const data = docSnap.data() || {};
        lessons.push({
          id: `${level}__${docSnap.id}__PSEUDO`,
          level,
          topicId: docSnap.id,
          topicSlug: String(data.slug || docSnap.id),
          title: String(data.title || data.name || data.slug || docSnap.id),
          pseudo: true,
        });
      });
    }

    const byTopic = new Map();
    lessons.forEach((lesson) => {
      const topicId = String(lesson.topicId || '').trim();
      const topicSlug = String(lesson.topicSlug || '').trim();
      const key = `${level}::${topicId || topicSlug || lesson.id}`;
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key).push(lesson);
    });

    for (const list of byTopic.values()) {
      const picked = randomPick(list, Math.max(1, lessonsPerTopic));
      picked.forEach((item) => {
        const topicId = String(item.topicId || '').trim();
        const topicSlug = String(item.topicSlug || '').trim();
        let resolvedTopicId = topicId;
        if (!resolvedTopicId && topicSlug) {
          const key = `${level}::${topicSlug}`;
          resolvedTopicId = courseMap.get(key)?.id || '';
        }
        output.push({
          level: String(level),
          lessonId: String(item.id),
          title: String(item.title || ''),
          topicId: resolvedTopicId,
          topicSlug: topicSlug || '',
          pseudo: item.pseudo === true,
        });
      });
    }
  }

  return output.filter((x) => x.topicId);
}

async function main() {
  const args = parseArgs(process.argv);
  const servicePath = args['service-account'] || args.sa || '';
  const baseUrl = String(args['base-url'] || 'http://127.0.0.1:5501').trim();
  const email = String(args.email || '').trim();
  const password = String(args.password || '').trim();
  const levels = uniq(String(args.levels || 'A1,A2').split(',')).map((x) => x.toUpperCase()).filter((x) => ['A1', 'A2'].includes(x));
  const lessonsPerTopic = Math.max(1, toNum(args['lessons-per-topic'], 1));
  const minActions = Math.max(1, toNum(args['exercise-actions-min'], 5));
  const maxActions = Math.max(minActions, toNum(args['exercise-actions-max'], 10));
  const headless = toBool(args.headless, true);
  const outputFile = path.resolve(String(args.output || 'import/generated/qa-ui-report.json'));

  if (!servicePath) throw new Error('Podaj --service-account <path>.');
  if (!email || !password) {
    throw new Error('Podaj --email oraz --password (konto testowe admin/QA).');
  }
  if (!levels.length) throw new Error('Brak leveli do testu. Uzyj --levels A1,A2');

  const firebaseAdmin = loadModule('firebase-admin');
  const playwright = loadModule('playwright');
  const { chromium } = playwright;
  const { resolved: serviceAccountPath, json: serviceAccount } = loadServiceAccount(servicePath);

  const apps = firebaseAdmin.apps || [];
  if (!apps.length) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = firebaseAdmin.firestore();
  const collections = await resolveCollectionNames(db);
  const sampledLessons = await loadLessonsForLevels(db, collections, levels, lessonsPerTopic);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    serviceAccountPath,
    projectId: serviceAccount.project_id,
    levels,
    config: {
      lessonsPerTopic,
      minActions,
      maxActions,
      headless,
      collections,
    },
    sampledLessons: sampledLessons.map((x) => ({
      level: x.level,
      lessonId: x.lessonId,
      topicId: x.topicId,
      topicSlug: x.topicSlug,
      pseudo: x.pseudo === true,
    })),
    lessons: [],
    summary: {
      totalLessons: sampledLessons.length,
      okLessons: 0,
      failedLessons: 0,
      totalActions: 0,
      consoleErrors: 0,
      pageErrors: 0,
    },
  };

  ensureDir(path.dirname(outputFile));

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    consoleErrors.push({
      ts: new Date().toISOString(),
      url: page.url(),
      text: msg.text(),
    });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({
      ts: new Date().toISOString(),
      url: page.url(),
      text: err?.message || String(err),
    });
  });

  try {
    await login(page, { baseUrl, email, password });

    for (const lesson of sampledLessons) {
      const lessonResult = {
        level: lesson.level,
        lessonId: lesson.lessonId,
        topicId: lesson.topicId,
        topicSlug: lesson.topicSlug,
        urls: {},
        actions: 0,
        totalCards: 0,
        errors: [],
        consoleErrors: [],
        pageErrors: [],
        status: 'ok',
      };

      const consoleStart = consoleErrors.length;
      const pageErrStart = pageErrors.length;

      try {
        const lessonUrl = urlJoin(baseUrl, `lessonpage.html?${navParamsForLesson(lesson)}`);
        lessonResult.urls.lesson = lessonUrl;
        await page.goto(lessonUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);

        const lessonBody = await page.textContent('body').catch(() => '');
        if (/Acceso bloqueado|Acceso premium|Checkpoint wymagany/i.test(String(lessonBody || ''))) {
          lessonResult.errors.push('Lesson page appears locked.');
        }

        const exerciseUrl = urlJoin(baseUrl, `ejercicio.html?${navParamsForLesson(lesson)}`);
        lessonResult.urls.exercise = exerciseUrl;
        await page.goto(exerciseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => null);
        await runExerciseInteractions(page, lessonResult, { minActions, maxActions });
      } catch (e) {
        lessonResult.errors.push(`Lesson smoke error: ${e?.message || e}`);
      }

      lessonResult.consoleErrors = consoleErrors.slice(consoleStart, consoleErrors.length);
      lessonResult.pageErrors = pageErrors.slice(pageErrStart, pageErrors.length);
      if (lessonResult.errors.length || lessonResult.consoleErrors.length || lessonResult.pageErrors.length) {
        lessonResult.status = 'failed';
      }
      report.summary.totalActions += Number(lessonResult.actions || 0);
      report.summary.consoleErrors += lessonResult.consoleErrors.length;
      report.summary.pageErrors += lessonResult.pageErrors.length;
      if (lessonResult.status === 'ok') report.summary.okLessons += 1;
      else report.summary.failedLessons += 1;
      report.lessons.push(lessonResult);
    }
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`QA report saved: ${outputFile}`);
  console.log(
    `Summary: lessons=${report.summary.totalLessons}, ok=${report.summary.okLessons}, failed=${report.summary.failedLessons}, actions=${report.summary.totalActions}, consoleErrors=${report.summary.consoleErrors}, pageErrors=${report.summary.pageErrors}`,
  );
}

main().catch((err) => {
  console.error('run-qa-ui-smoke failed:', err?.message || err);
  process.exitCode = 1;
});
