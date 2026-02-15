import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateA1A2Package } from './lib/a1a2-generator.mjs';

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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const t = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(t)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(t)) return false;
  return fallback;
}

function loadModule(name) {
  try {
    return require(name);
  } catch {}
  const local = path.resolve(process.cwd(), '.tmp_codegen', 'node_modules', name);
  if (fs.existsSync(local)) return require(local);
  throw new Error(`Brak pakietu ${name}. Zainstaluj: npm i ${name} (albo do .tmp_codegen).`);
}

function loadServiceAccount(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(`Nie znaleziono service account JSON: ${resolved || '(pusty path)'}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const json = JSON.parse(raw);
  if (String(json.type || '') !== 'service_account') {
    throw new Error(`Plik nie wygląda na service account (type=${json.type || 'brak'}).`);
  }
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Brakuje wymaganych pól service account: project_id/client_email/private_key.');
  }
  return { resolved, json };
}

async function loadTopicsFromFirestore(db, levels = ['A1', 'A2']) {
  const topics = [];
  for (const level of levels) {
    const snap = await db.collection('courses').where('level', '==', String(level)).get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      if (data.isArchived === true) return;
      topics.push({
        id: doc.id,
        slug: String(data.slug || doc.id),
        title: String(data.title || data.name || data.slug || doc.id),
        level: String(data.level || level).toUpperCase(),
      });
    });
  }
  return topics;
}

function normalizeCollectionName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '');
}

function selectCollectionAlias(existingNames, candidates, fallback) {
  const existingNorm = new Map(
    (existingNames || []).map((name) => [normalizeCollectionName(name), name]),
  );
  for (const candidate of candidates || []) {
    const key = normalizeCollectionName(candidate);
    if (existingNorm.has(key)) return existingNorm.get(key);
  }
  return fallback;
}

async function resolveCollectionNames(db) {
  const roots = await db.listCollections();
  const names = roots.map((c) => c.id);
  return {
    roots: names,
    courses: selectCollectionAlias(names, ['courses', 'kursy'], 'courses'),
    exercises: selectCollectionAlias(names, ['exercises', 'cwiczenia', 'ćwiczenia'], 'exercises'),
    lessons: selectCollectionAlias(names, ['lessons', 'lekcje'], 'lessons'),
    modules: selectCollectionAlias(names, ['modules', 'moduly', 'moduły'], 'modules'),
    coursePaths: selectCollectionAlias(
      names,
      ['course_paths', 'sciezki_kursu', 'ścieżki_kursu', 'paths'],
      'course_paths',
    ),
  };
}

async function loadTopicsFromFirestoreCollection(db, coursesCollection, levels = ['A1', 'A2']) {
  const topics = [];
  for (const level of levels) {
    const snap = await db.collection(String(coursesCollection)).where('level', '==', String(level)).get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      if (data.isArchived === true) return;
      topics.push({
        id: doc.id,
        slug: String(data.slug || doc.id),
        title: String(data.title || data.name || data.slug || doc.id),
        level: String(data.level || level).toUpperCase(),
      });
    });
  }
  return topics;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasNestedArray(value) {
  if (Array.isArray(value)) {
    return value.some((item) => Array.isArray(item) || hasNestedArray(item));
  }
  if (isObject(value)) {
    return Object.values(value).some((item) => hasNestedArray(item));
  }
  return false;
}

function findFirstNestedArrayPath(value, pathPrefix = '') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      const path = `${pathPrefix}[${i}]`;
      if (Array.isArray(item)) return path;
      const inner = findFirstNestedArrayPath(item, path);
      if (inner) return inner;
    }
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const inner = findFirstNestedArrayPath(item, path);
      if (inner) return inner;
    }
  }
  return '';
}

function normalizeOptionText(value) {
  return String(value ?? '').trim();
}

function parseOptionsAsText(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((item) => {
      if (typeof item === 'string') return normalizeOptionText(item);
      if (item && typeof item === 'object') {
        const text = item.text ?? item.label ?? item.value ?? '';
        return normalizeOptionText(text);
      }
      return '';
    })
    .filter(Boolean);
}

function ensurePromptHasBlanks(promptRaw, blankCount = 1) {
  const prompt = String(promptRaw || '').trim();
  const count = Math.max(1, Number(blankCount || 1));
  if (prompt.includes('___')) return prompt;
  const blanks = Array.from({ length: count }, () => '___').join(' ');
  if (!prompt) return blanks;
  return `${prompt} ${blanks}`.trim();
}

function normalizeBlankGroups(answer) {
  if (!isObject(answer)) return [];
  const candidates = [answer.acceptedByBlank, answer.expectedByBlank, answer.byBlank, answer.blanks];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    if (candidate.some((item) => Array.isArray(item))) {
      const nested = candidate
        .map((group) => normalizeAnswerGroup(group))
        .filter((group) => group.length);
      if (nested.length) return nested;
      continue;
    }
    const flat = normalizeAnswerGroup(candidate);
    if (flat.length) return [flat];
  }
  if (Array.isArray(answer.accepted)) {
    if (answer.accepted.some((item) => Array.isArray(item))) {
      const nested = answer.accepted
        .map((group) => normalizeAnswerGroup(group))
        .filter((group) => group.length);
      if (nested.length) return nested;
    }
    const flat = normalizeAnswerGroup(answer.accepted);
    if (flat.length) return [flat];
  }
  return [];
}

function toLegacyStringAnswer(answer, fallback = '') {
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  if (!isObject(answer)) return String(fallback || '');

  const groups = normalizeBlankGroups(answer);
  const fromGroups = legacyAnswerFromAcceptedByBlank(groups);
  if (fromGroups) return fromGroups;

  if (Array.isArray(answer.accepted)) {
    const accepted = normalizeAnswerGroup(answer.accepted);
    if (accepted.length === 1) return accepted[0];
    if (accepted.length > 1) return accepted.join('|');
  }

  if (typeof answer.value === 'string') return answer.value;
  return String(fallback || '');
}

function normalizedBaseType(raw) {
  const t = normalizeText(raw || '');
  if (!t) return '';
  if (t.includes('matching')) return 'matching';
  if (t.includes('fill')) return 'fill_blank';
  if (t.includes('listen_arrange') || t.includes('listen arrange') || t.includes('drag')) {
    return 'listen_arrange';
  }
  if (t.includes('dictation')) return 'dictation';
  if (t.includes('word tiles') || t.includes('word_tiles') || t.includes('reorder')) return 'word_tiles';
  if (t.includes('scene') || t.includes('dialogue')) return 'scene';
  if (t.includes('translate')) return 'translate';
  if (t.includes('binary') || t.includes('true false') || t.includes('true_false')) return 'binary_choice';
  if (t.includes('multiple') || t.includes('choice')) return 'multiple_choice';
  return t;
}

function normalizeMatchingPairs(docData) {
  const pools = [
    docData?.pairs,
    docData?.matching?.pairs,
    isObject(docData?.answer) ? docData.answer.pairs : null,
  ];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const out = [];
    for (const entry of pool) {
      if (!isObject(entry)) continue;
      const left = String(entry.left ?? entry.l ?? entry.source ?? entry.a ?? '').trim();
      const right = String(entry.right ?? entry.r ?? entry.target ?? entry.b ?? '').trim();
      if (!left || !right) continue;
      out.push({ left, right });
    }
    if (out.length) return out;
  }
  return [];
}

function mapPairsToLegacyMatching(pairs) {
  const list = Array.isArray(pairs) ? pairs : [];
  const options = [];
  const links = [];
  list.forEach((pair, index) => {
    const leftLabel = String.fromCharCode(65 + (index % 26));
    const rightLabel = String(index + 1);
    const left = String(pair.left || '').trim();
    const right = String(pair.right || '').trim();
    if (!left || !right) return;
    options.push(`${leftLabel}) ${left} = ${rightLabel}) ${right}`);
    links.push(`${leftLabel}-${rightLabel}`);
  });
  return { options, answer: links.join(', ') };
}

function ensureSeedMeta(list, collectionName) {
  for (const entry of list || []) {
    const data = entry?.data || {};
    const id = String(entry?.id || '(missing-id)');
    if (!String(data.seedVersion || '').trim()) {
      throw new Error(`Missing seedVersion before write: ${collectionName}/${id}`);
    }
    if (!String(data.seedSource || '').trim()) {
      throw new Error(`Missing seedSource before write: ${collectionName}/${id}`);
    }
  }
}

function ensureNoNestedArrays(list, collectionName) {
  for (const entry of list || []) {
    const data = entry?.data || {};
    if (!hasNestedArray(data)) continue;
    const path = findFirstNestedArrayPath(data);
    throw new Error(`Nested array detected before write: ${collectionName}/${entry?.id || ''} @ ${path}`);
  }
}

function ensureUniqueIds(list, collectionName) {
  const seen = new Set();
  const duplicates = [];
  for (const entry of list || []) {
    const id = String(entry?.id || '').trim();
    if (!id) {
      duplicates.push('(missing-id)');
      continue;
    }
    if (seen.has(id)) duplicates.push(id);
    else seen.add(id);
  }
  if (duplicates.length) {
    const preview = duplicates.slice(0, 12).join(', ');
    throw new Error(`Duplicate document IDs in ${collectionName}: ${duplicates.length} (e.g. ${preview})`);
  }
}

async function commitCollection(
  db,
  collectionName,
  docs,
  { merge = true, chunkSize = 400, maxRetries = 3, retryDelayMs = 600 } = {},
) {
  const list = Array.isArray(docs) ? docs : [];
  const totalChunks = Math.max(1, Math.ceil(list.length / chunkSize));
  let written = 0;
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
          `[write] ${collectionName} chunk ${chunkNo}/${totalChunks} committed (${chunk.length} docs, total ${written}/${list.length})`,
        );
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(
          `[retry] ${collectionName} chunk ${chunkNo}/${totalChunks} attempt ${attempt}/${maxRetries} failed: ${err?.message || err}`,
        );
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    if (!success) {
      throw new Error(
        `Batch write failed for ${collectionName} chunk ${chunkNo}/${totalChunks}: ${lastErr?.message || lastErr}`,
      );
    }
  }
  return written;
}

function unresolvedMappingList(pkg) {
  const out = [];
  for (const levelKey of Object.keys(pkg.levels || {})) {
    const levelData = pkg.levels[levelKey];
    for (const topicPkg of levelData.topicPackages || []) {
      if (topicPkg.topic.unresolved === true) {
        out.push({
          level: levelKey,
          topicId: topicPkg.topic.topicId,
          topicSlug: topicPkg.topic.topicSlug,
          topicTitle: topicPkg.topic.topicTitle,
          mappingScore: topicPkg.topic.score,
        });
      }
    }
  }
  return out;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, ' ')
    .trim();
}

function normalizeAnswerGroup(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const item of list) {
    if (Array.isArray(item)) {
      item.forEach((inner) => {
        const text = String(inner || '').trim();
        if (text) out.push(text);
      });
    } else {
      const text = String(item || '').trim();
      if (text) out.push(text);
    }
  }
  return Array.from(new Set(out));
}

function legacyAnswerFromAcceptedByBlank(acceptedByBlank) {
  if (!Array.isArray(acceptedByBlank)) return '';
  const groups = acceptedByBlank
    .map((group) => normalizeAnswerGroup(group).join('|'))
    .filter(Boolean);
  if (!groups.length) return '';
  if (groups.length === 1) return groups[0];
  return groups.join('||');
}

function sanitizeForFirestoreValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        const flat = normalizeAnswerGroup(item);
        out.push(flat.join('|'));
      } else {
        out.push(sanitizeForFirestoreValue(item));
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      const safe = sanitizeForFirestoreValue(inner);
      if (safe !== undefined) out[key] = safe;
    }
    return out;
  }
  return String(value);
}

function sanitizeDocDataForFirestore(data, counters = null) {
  const out = { ...(data || {}) };
  const baseTypeKey = normalizedBaseType(out.baseType || out.type || '');
  const typeNorm = normalizeText(out.type || '');
  const answer = out.answer;

  if (baseTypeKey === 'matching') {
    const optionsText = parseOptionsAsText(out.options);
    const pairs = normalizeMatchingPairs(out);
    const hasLegacyOptions = optionsText.some((line) => /(?:=|->|\u2192|\u2014)/.test(String(line || '')));
    if (pairs.length && !hasLegacyOptions) {
      const mapped = mapPairsToLegacyMatching(pairs);
      out.options = mapped.options;
      out.answer = toLegacyStringAnswer(out.answer, mapped.answer) || mapped.answer;
    } else if (optionsText.length) {
      out.options = optionsText;
    }
  }

  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    const acceptedByBlank = answer.acceptedByBlank ?? answer.expectedByBlank ?? answer.byBlank;
    if (Array.isArray(acceptedByBlank)) {
      if (counters) counters.withAcceptedByBlank += 1;
      const legacy = legacyAnswerFromAcceptedByBlank(acceptedByBlank);
      if (
        baseTypeKey === 'fill_blank' ||
        baseTypeKey === 'listen_arrange' ||
        typeNorm.includes('fill_blank') ||
        typeNorm.includes('listen_arrange') ||
        typeNorm.includes('complete_dialogue') ||
        typeNorm.includes('simple_grammar_fill_blank')
      ) {
        out.answer = legacy || '';
        if (counters) counters.legacyToString += 1;
      } else {
        out.answer = {
          ...answer,
          acceptedByBlank: acceptedByBlank.map((group) => normalizeAnswerGroup(group).join('|')),
        };
        if (counters) counters.keptAsObject += 1;
      }
    }
  }

  if (baseTypeKey === 'fill_blank' || baseTypeKey === 'listen_arrange') {
    if (typeof out.answer !== 'string') {
      out.answer = toLegacyStringAnswer(out.answer, '');
      if (counters) counters.legacyToString += 1;
    }
    const blankCount = Math.max(
      1,
      String(out.prompt || '').includes('___') ? String(out.prompt || '').split('___').length - 1 : 0,
    );
    out.prompt = ensurePromptHasBlanks(out.prompt, blankCount);
    if (baseTypeKey === 'listen_arrange') {
      out.options = parseOptionsAsText(out.options);
    }
  }

  if (baseTypeKey === 'matching') {
    out.options = parseOptionsAsText(out.options);
    if (!Array.isArray(out.options) || !out.options.length) {
      const pairs = normalizeMatchingPairs(out);
      const mapped = mapPairsToLegacyMatching(pairs);
      out.options = mapped.options;
      out.answer = toLegacyStringAnswer(out.answer, mapped.answer) || mapped.answer;
    } else if (typeof out.answer !== 'string' && !isObject(out.answer)) {
      out.answer = toLegacyStringAnswer(out.answer, '');
    }
  }

  return sanitizeForFirestoreValue(out);
}

function withSeedMeta(list, seedSource, seedVersion, counters = null) {
  return (list || []).map((entry) => {
    const merged = {
      ...(entry.data || {}),
      seedSource: String(entry.data?.seedSource || seedSource || ''),
      seedVersion: String(entry.data?.seedVersion || seedVersion || ''),
      updatedAt: new Date().toISOString(),
    };
    return {
      ...entry,
      data: sanitizeDocDataForFirestore(merged, counters),
    };
  });
}

function pickOneByBaseType(list, baseType) {
  const target = String(baseType || '').trim();
  const candidates = (list || []).filter((entry) => {
    const bt = normalizedBaseType(entry?.data?.baseType || entry?.data?.type || '');
    return bt === target;
  });
  if (!candidates.length) return null;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

function validateSmokeDocShape(baseType, docData) {
  if (!docData || typeof docData !== 'object') {
    return `brak danych`;
  }
  if (baseType === 'matching') {
    if (!Array.isArray(docData.options) || !docData.options.length) {
      return 'matching: missing options[]';
    }
    if (!docData.options.every((x) => typeof x === 'string')) {
      return 'matching: options not string[]';
    }
    if (!(typeof docData.answer === 'string' || isObject(docData.answer))) {
      return 'matching: invalid answer';
    }
  }
  if (baseType === 'fill_blank' || baseType === 'listen_arrange') {
    if (typeof docData.answer !== 'string') {
      return `${baseType}: answer is not string`;
    }
    if (!String(docData.prompt || '').includes('___')) {
      return `${baseType}: prompt missing ___`;
    }
  }
  return '';
}

async function smokeTestExercises(db, collectionName, importedExercises) {
  const targets = ['matching', 'fill_blank', 'listen_arrange'];
  const results = [];
  for (const baseType of targets) {
    const sample = pickOneByBaseType(importedExercises, baseType);
    if (!sample) {
      results.push({ baseType, ok: false, id: '', error: 'no sample in import payload' });
      continue;
    }
    try {
      const snap = await db.collection(collectionName).doc(String(sample.id)).get();
      if (!snap.exists) {
        results.push({ baseType, ok: false, id: sample.id, error: 'document not found in Firestore' });
        continue;
      }
      const data = snap.data() || {};
      const shapeErr = validateSmokeDocShape(baseType, data);
      if (shapeErr) {
        results.push({ baseType, ok: false, id: sample.id, error: shapeErr });
      } else {
        results.push({
          baseType,
          ok: true,
          id: sample.id,
          prompt: String(data.prompt || '').slice(0, 120),
        });
      }
    } catch (err) {
      results.push({
        baseType,
        ok: false,
        id: sample.id,
        error: err?.message || String(err),
      });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const xlsx = loadModule('xlsx');
  const firebaseAdmin = loadModule('firebase-admin');

  const servicePath = args['service-account'] || args.sa || '';
  if (!servicePath) {
    throw new Error('Podaj --service-account <path-to-json>.');
  }
  const { resolved: serviceResolved, json: serviceAccount } = loadServiceAccount(servicePath);

  const a1Path = args.a1 ? path.resolve(String(args.a1)) : '';
  const a2Path = args.a2 ? path.resolve(String(args.a2)) : '';
  if (!a1Path && !a2Path) {
    throw new Error('Podaj co najmniej jeden plik: --a1 <xlsx> i/lub --a2 <xlsx>.');
  }

  const outDir = path.resolve(String(args['out-dir'] || 'import/generated'));
  const prefix = String(args.prefix || 'a1-a2-firestore');
  const seedSource = String(args['seed-source'] || 'a1_a2_excel_grammar');
  const seedVersion = String(args['seed-version'] || 'v1_2026-02-14');
  const topicLimit = Number(args['topic-limit'] || 0);
  const dryRun = toBool(args['dry-run'], false);
  const strictMapping = toBool(args['strict-mapping'], true);

  const apps = firebaseAdmin.apps || [];
  if (!apps.length) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = firebaseAdmin.firestore();

  const collections = await resolveCollectionNames(db);
  const topics = await loadTopicsFromFirestoreCollection(db, collections.courses, ['A1', 'A2']);
  if (!topics.length) throw new Error('Nie znaleziono tematów w collection courses (A1/A2).');

  const workbooks = [];
  if (a1Path) {
    if (!fs.existsSync(a1Path)) throw new Error(`Brak pliku A1: ${a1Path}`);
    workbooks.push({ level: 'A1', fileName: path.basename(a1Path), workbook: xlsx.readFile(a1Path) });
  }
  if (a2Path) {
    if (!fs.existsSync(a2Path)) throw new Error(`Brak pliku A2: ${a2Path}`);
    workbooks.push({ level: 'A2', fileName: path.basename(a2Path), workbook: xlsx.readFile(a2Path) });
  }

  const pkg = generateA1A2Package({
    XLSX: xlsx,
    workbooks,
    topics,
    seedSource,
    seedVersion,
    topicLimit: Number.isFinite(topicLimit) ? Math.max(0, topicLimit) : 0,
  });

  const unresolved = unresolvedMappingList(pkg);
  if (strictMapping && unresolved.length) {
    throw new Error(
      `Wykryto unresolved mapping (${unresolved.length}). Uruchom z --strict-mapping=false lub popraw mapowanie.`,
    );
  }

  ensureDir(outDir);
  const seedFile = path.join(outDir, `${prefix}-seed.json`);
  const importFile = path.join(outDir, `${prefix}-firestore-import.json`);
  const reportFile = path.join(outDir, `${prefix}-report.json`);

  const answerConversionStats = {
    withAcceptedByBlank: 0,
    legacyToString: 0,
    keptAsObject: 0,
  };

  const toWrite = {
    exercises: withSeedMeta(pkg.collections.exercises, seedSource, seedVersion, answerConversionStats),
    lessons: withSeedMeta(pkg.collections.lessons, seedSource, seedVersion),
    modules: withSeedMeta(pkg.collections.modules, seedSource, seedVersion),
    courses: withSeedMeta(pkg.collections.courses, seedSource, seedVersion),
  };

  ensureSeedMeta(toWrite.exercises, 'exercises');
  ensureSeedMeta(toWrite.lessons, 'lessons');
  ensureSeedMeta(toWrite.modules, 'modules');
  ensureSeedMeta(toWrite.courses, 'courses');

  ensureNoNestedArrays(toWrite.exercises, 'exercises');
  ensureNoNestedArrays(toWrite.lessons, 'lessons');
  ensureNoNestedArrays(toWrite.modules, 'modules');
  ensureNoNestedArrays(toWrite.courses, 'courses');
  ensureUniqueIds(toWrite.exercises, 'exercises');
  ensureUniqueIds(toWrite.lessons, 'lessons');
  ensureUniqueIds(toWrite.modules, 'modules');
  ensureUniqueIds(toWrite.courses, 'courses');

  const report = {
    generatedAt: pkg.generatedAt,
    serviceAccountPath: serviceResolved,
    projectId: serviceAccount.project_id,
    topicsFetched: topics.length,
    unresolvedMappings: unresolved,
    levels: {
      A1: pkg.levels.A1?.report || null,
      A2: pkg.levels.A2?.report || null,
    },
    answerConversionStats,
    importSummary: {
      exercises: toWrite.exercises.length,
      lessons: toWrite.lessons.length,
      modules: toWrite.modules.length,
      courses: toWrite.courses.length,
    },
  };

  fs.writeFileSync(seedFile, JSON.stringify(pkg, null, 2), 'utf8');
  fs.writeFileSync(importFile, JSON.stringify(toWrite, null, 2), 'utf8');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Saved: ${seedFile}`);
  console.log(`Saved: ${importFile}`);
  console.log(`Saved: ${reportFile}`);
  console.log(`Topics fetched from Firestore: ${topics.length}`);
  console.log(`Unresolved mappings: ${unresolved.length}`);
  console.log(
    `acceptedByBlank stats: withAcceptedByBlank=${answerConversionStats.withAcceptedByBlank}, legacyToString=${answerConversionStats.legacyToString}, keptAsObject=${answerConversionStats.keptAsObject}`,
  );
  console.log(
    `Import summary: exercises=${toWrite.exercises.length}, lessons=${toWrite.lessons.length}, modules=${toWrite.modules.length}, courses=${toWrite.courses.length}`,
  );
  console.log(
    `Collections: courses=${collections.courses}, exercises=${collections.exercises}, lessons=${collections.lessons}, modules=${collections.modules}, course_paths=${collections.coursePaths}`,
  );

  if (dryRun) {
    console.log('Dry run enabled. Firestore write skipped.');
    return;
  }

  const stats = {};
  stats.exercises = await commitCollection(db, collections.exercises, toWrite.exercises, { merge: true });
  stats.lessons = await commitCollection(db, collections.lessons, toWrite.lessons, { merge: true });
  stats.modules = await commitCollection(db, collections.modules, toWrite.modules, { merge: true });
  stats.course_paths = await commitCollection(db, collections.coursePaths, toWrite.courses, {
    merge: true,
  });

  console.log('Firestore write complete:', stats);
  const smoke = await smokeTestExercises(db, collections.exercises, toWrite.exercises);
  console.log('Firestore smoke test (matching/fill_blank/listen_arrange):', smoke);
}

main().catch((err) => {
  console.error('run-a1-a2-firestore failed:', err?.message || err);
  process.exitCode = 1;
});
