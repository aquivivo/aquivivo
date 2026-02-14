import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateA1A2Package, REQUIRED_VARIANTS } from './lib/a1a2-generator.mjs';

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

function loadXlsxModule() {
  try {
    return require('xlsx');
  } catch {}
  const local = path.resolve(process.cwd(), '.tmp_codegen', 'node_modules', 'xlsx');
  if (fs.existsSync(local)) return require(local);
  throw new Error('Brak pakietu xlsx. Zainstaluj: npm i xlsx (albo użyj .tmp_codegen/node_modules/xlsx).');
}

function readJsonIfExists(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function pickReportView(levelData) {
  if (!levelData) return null;
  return {
    level: levelData.level,
    counts: levelData.report?.counts || {},
    samples: {
      variants: levelData.report?.samples?.variants || {},
      lesson: levelData.report?.samples?.lesson || null,
      module: levelData.report?.samples?.module || null,
      course: levelData.report?.samples?.course || null,
    },
    topicMapping: (levelData.topicPackages || []).map((pkg) => ({
      topicId: pkg.topic.topicId,
      topicSlug: pkg.topic.topicSlug,
      topicTitle: pkg.topic.topicTitle,
      unresolved: pkg.topic.unresolved === true,
      mappingScore: pkg.topic.score,
      rows: pkg.rows.length,
      exercises: pkg.exercises.length,
    })),
  };
}

function buildCoverageSummary(levelData) {
  const counts = levelData?.report?.counts || {};
  const perTopic = counts.perTopic || {};
  const rows = Object.entries(perTopic).map(([slug, item]) => ({
    topicSlug: slug,
    wordCoveragePct: item?.coverage?.words?.pct ?? 0,
    wordMissing: item?.coverage?.words?.missing ?? [],
    exampleCoveragePct: item?.coverage?.examples?.pct ?? 0,
    exampleMissing: item?.coverage?.examples?.missing ?? [],
  }));
  return rows;
}

function validateVariantCoverage(levelData) {
  const seen = new Set((levelData?.exercises || []).map((x) => x.type));
  return REQUIRED_VARIANTS.filter((variant) => !seen.has(variant));
}

function summarizeCollections(pkg) {
  return {
    exercises: pkg.collections.exercises.length,
    lessons: pkg.collections.lessons.length,
    modules: pkg.collections.modules.length,
    courses: pkg.collections.courses.length,
  };
}

function printMiniConsoleSummary(label, levelData) {
  const counts = levelData?.report?.counts || {};
  const perType = counts.perType || {};
  const typesN = Object.keys(perType).length;
  console.log(`\n[${label}] level=${levelData?.level} exercises=${counts.exercisesTotal || 0} types=${typesN}`);
  const topTypes = Object.entries(perType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  topTypes.forEach(([type, n]) => console.log(`  - ${type}: ${n}`));
}

function buildTopicTemplate(pkg) {
  const out = [];
  for (const levelKey of Object.keys(pkg.levels || {})) {
    const levelData = pkg.levels[levelKey];
    for (const topicPkg of levelData.topicPackages || []) {
      out.push({
        level: levelKey,
        id: topicPkg.topic.topicId,
        slug: topicPkg.topic.topicSlug,
        title: topicPkg.topic.topicTitle,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const XLSX = loadXlsxModule();

  const a1Path = args.a1 ? path.resolve(String(args.a1)) : '';
  const a2Path = args.a2 ? path.resolve(String(args.a2)) : '';
  const outDir = path.resolve(String(args['out-dir'] || 'import/generated'));
  const prefix = String(args.prefix || 'a1-a2');
  const seedSource = String(args['seed-source'] || 'a1_a2_excel_grammar');
  const seedVersion = String(args['seed-version'] || 'v1_2026-02-14');
  const topicLimit = Number(args['topic-limit'] || 0);

  const topicsRaw = readJsonIfExists(args.topics);
  const topics = Array.isArray(topicsRaw) ? topicsRaw : [];

  const workbooks = [];
  if (a1Path && fs.existsSync(a1Path)) {
    workbooks.push({
      level: 'A1',
      fileName: path.basename(a1Path),
      workbook: XLSX.readFile(a1Path),
    });
  }
  if (a2Path && fs.existsSync(a2Path)) {
    workbooks.push({
      level: 'A2',
      fileName: path.basename(a2Path),
      workbook: XLSX.readFile(a2Path),
    });
  }
  if (!workbooks.length) {
    throw new Error('Nie znaleziono plików wejściowych. Użyj --a1 i/lub --a2.');
  }

  const pkg = generateA1A2Package({
    XLSX,
    workbooks,
    topics,
    seedSource,
    seedVersion,
    topicLimit: Number.isFinite(topicLimit) ? Math.max(0, topicLimit) : 0,
  });

  ensureDir(outDir);
  const seedFile = path.join(outDir, `${prefix}-seed.json`);
  const importFile = path.join(outDir, `${prefix}-firestore-import.json`);
  const reportFile = path.join(outDir, `${prefix}-report.json`);
  const topicsTemplateFile = path.join(outDir, `${prefix}-topics-template.json`);

  const report = {
    generatedAt: pkg.generatedAt,
    grammarSource: pkg.grammarSource,
    summary: summarizeCollections(pkg),
    levels: {
      A1: pickReportView(pkg.levels.A1 || null),
      A2: pickReportView(pkg.levels.A2 || null),
    },
    coverage: {
      A1: buildCoverageSummary(pkg.levels.A1 || null),
      A2: buildCoverageSummary(pkg.levels.A2 || null),
    },
    missingVariants: {
      A1: validateVariantCoverage(pkg.levels.A1 || null),
      A2: validateVariantCoverage(pkg.levels.A2 || null),
    },
  };

  fs.writeFileSync(seedFile, JSON.stringify(pkg, null, 2), 'utf8');
  fs.writeFileSync(importFile, JSON.stringify(pkg.collections, null, 2), 'utf8');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(topicsTemplateFile, JSON.stringify(buildTopicTemplate(pkg), null, 2), 'utf8');

  console.log(`\nSaved: ${seedFile}`);
  console.log(`Saved: ${importFile}`);
  console.log(`Saved: ${reportFile}`);
  console.log(`Saved: ${topicsTemplateFile}`);
  printMiniConsoleSummary('A1', pkg.levels.A1 || null);
  printMiniConsoleSummary('A2', pkg.levels.A2 || null);
}

main().catch((err) => {
  console.error('\nGenerator failed:', err?.message || err);
  process.exitCode = 1;
});
