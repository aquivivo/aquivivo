const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;

    const eq = token.indexOf('=');
    if (eq >= 0) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || String(next).startsWith('--')) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    i += 1;
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

function resolveExistingPath(rawPath) {
  const p = String(rawPath || '').trim();
  if (!p) return '';
  const resolved = path.resolve(p);
  return fs.existsSync(resolved) ? resolved : '';
}

function loadModule(name) {
  try {
    return require(name);
  } catch {}

  const candidates = [
    path.resolve(process.cwd(), 'functions', 'node_modules', name),
    path.resolve(process.cwd(), '.tmp_codegen', 'node_modules', name),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return require(candidate);
    } catch {}
  }

  throw new Error(
    `Brak pakietu ${name}. Zainstaluj go (np. npm i ${name}) albo uruchom po npm i w functions/.`,
  );
}

function normalizeDocId(raw, { lower = false } = {}) {
  const base = String(raw || '')
    .trim()
    .replace(/[\\/#?[\]]+/g, '_')
    .replace(/\s+/g, '_');
  if (!base) return '';
  return lower ? base.toLowerCase() : base;
}

function slugDocId(raw, fallback) {
  const base = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safe = base.slice(0, 160);
  return safe || fallback;
}

function pickFallbackId(row, idx, prefix = 'row') {
  const candidate =
    row?.word ??
    row?.abbr ??
    row?.situation ??
    row?.titlePl ??
    row?.questionPl ??
    row?.question ??
    row?.title ??
    row?.slug ??
    row?.name ??
    '';
  return slugDocId(candidate, `${prefix}_${String(idx + 1).padStart(4, '0')}`);
}

function uniqueId(baseId, used) {
  const n = used.get(baseId) || 0;
  used.set(baseId, n + 1);
  if (n === 0) return baseId;
  return `${baseId}_${n + 1}`;
}

async function runCollectionImport({
  db,
  dryRun = false,
  collectionName,
  rows,
  idField = 'id',
  lowerFallbackIds = true,
  fallbackPrefix = '',
}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    console.log(`Skip ${collectionName}: empty`);
    return 0;
  }

  const used = new Map();
  let imported = 0;

  let batch = null;
  let batchSize = 0;
  if (!dryRun) batch = db.batch();

  const flush = async () => {
    if (dryRun) return;
    if (batch && batchSize > 0) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  };

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};

    let baseId = '';
    if (idField && row[idField] !== undefined && row[idField] !== null) {
      baseId = normalizeDocId(row[idField], { lower: false });
    } else {
      baseId = normalizeDocId(
        pickFallbackId(row, i, fallbackPrefix || collectionName),
        {
          lower: lowerFallbackIds,
        },
      );
    }
    if (!baseId) {
      baseId = `${fallbackPrefix || collectionName}_${String(i + 1).padStart(4, '0')}`;
    }
    const docId = uniqueId(baseId, used);

    if (dryRun) {
      console.log(`[DRY RUN] ${collectionName}/${docId}`);
      imported += 1;
      continue;
    }

    const ref = db.collection(collectionName).doc(docId);
    batch.set(ref, row, { merge: true });
    batchSize += 1;
    imported += 1;

    if (batchSize >= 400) await flush();
  }

  await flush();
  console.log(`${dryRun ? '[DRY RUN] ' : ''}${collectionName}: ${imported}`);
  return imported;
}

async function runDrivingImport({
  includeExtras = false,
  root = path.resolve('import', 'driving_b'),
} = {}) {
  const args = parseArgs(process.argv);
  const dryRun = toBool(args['dry-run'], process.argv.includes('--dry-run'));
  const serviceAccountPath = resolveExistingPath(
    args['service-account'] || process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
  const explicitProjectId = String(
    args['project-id'] ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      '',
  ).trim();

  const loadJson = (file) => {
    const abs = path.join(root, file);
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  };

  let db = null;
  if (!dryRun) {
    const admin = loadModule('firebase-admin');
    if (!admin.apps.length) {
      const options = {};
      if (serviceAccountPath) {
        const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        options.credential = admin.credential.cert(sa);
        if (sa.project_id) options.projectId = sa.project_id;
      } else if (explicitProjectId) {
        options.projectId = explicitProjectId;
      }
      admin.initializeApp(options);
    }
    db = admin.firestore();
  }

  const jobs = [
    {
      collectionName: 'course_paths',
      file: 'course_paths.json',
      idField: 'id',
      idPrefix: 'course_paths',
    },
    {
      collectionName: 'modules',
      file: 'modules.json',
      idField: 'id',
      idPrefix: 'modules',
    },
    {
      collectionName: 'courses',
      file: 'courses.json',
      idField: 'id',
      idPrefix: 'courses',
    },
  ];

  if (includeExtras) {
    jobs.push(
      {
        collectionName: 'driving_vocab',
        file: 'vocab_explained.json',
        idField: null,
        idPrefix: 'vocab_explained',
      },
      {
        collectionName: 'driving_vocab',
        file: 'vocab_explained_extra.json',
        idField: null,
        idPrefix: 'vocab_explained_extra',
      },
      {
        collectionName: 'driving_signs',
        file: 'road_signs.json',
        idField: null,
        idPrefix: 'road_signs',
      },
      {
        collectionName: 'driving_signs',
        file: 'road_signs_extra.json',
        idField: null,
        idPrefix: 'road_signs_extra',
      },
      {
        collectionName: 'driving_faq',
        file: 'faq.json',
        idField: null,
        idPrefix: 'faq',
      },
      {
        collectionName: 'driving_checklist',
        file: 'checklist.json',
        idField: null,
        idPrefix: 'checklist',
      },
      {
        collectionName: 'driving_dialogues',
        file: 'dialogues.json',
        idField: null,
        idPrefix: 'dialogues',
      },
      {
        collectionName: 'driving_exam_traps',
        file: 'exam_traps.json',
        idField: null,
        idPrefix: 'exam_traps',
      },
      {
        collectionName: 'driving_audio',
        file: 'audio_examples.json',
        idField: null,
        idPrefix: 'audio_examples',
      },
      {
        collectionName: 'driving_images',
        file: 'image_examples.json',
        idField: null,
        idPrefix: 'image_examples',
      },
      {
        collectionName: 'driving_abbr',
        file: 'tech_abbreviations.json',
        idField: null,
        idPrefix: 'tech_abbreviations',
      },
      {
        collectionName: 'driving_quiz',
        file: 'mixed_quiz.json',
        idField: null,
        idPrefix: 'mixed_quiz',
      },
    );
  }

  const totals = {};
  for (const job of jobs) {
    const rows = loadJson(job.file);
    totals[`${job.collectionName}:${job.file}`] = await runCollectionImport({
      db,
      dryRun,
      collectionName: job.collectionName,
      rows,
      idField: job.idField,
      lowerFallbackIds: true,
      fallbackPrefix: job.idPrefix || job.collectionName,
    });
  }

  console.log('Import zakonczony.');
  return totals;
}

module.exports = {
  runDrivingImport,
};
