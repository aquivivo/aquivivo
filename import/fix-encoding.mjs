import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.txt',
  '.md',
  '.rules',
]);

const SKIP_DIRS = new Set([
  '.git',
  '.firebase',
  '.vscode',
  'node_modules',
  '.tmp_codegen',
  '.tmp_xlsx_a1_184343842',
  '.tmp_xlsx_a1_886702578',
  'generated',
]);

const SUSPICIOUS_PATTERNS = [
  /Ã./g,
  /Å./g,
  /Ä./g,
  /â€™/g,
  /â€œ/g,
  /â€\x9d/g,
  /â€“/g,
  /â€”/g,
  /â€¦/g,
  /ðŸ/g,
  /�/g,
  /Â(?=[\s.,:;!?])/g,
];

const REPLACEMENTS = new Map(
  [
    ['Ä…', 'ą'],
    ['Ä„', 'Ą'],
    ['Ä‡', 'ć'],
    ['Ä†', 'Ć'],
    ['Ä™', 'ę'],
    ['Ä˜', 'Ę'],
    ['Å‚', 'ł'],
    ['Å\u0081', 'Ł'],
    ['Å„', 'ń'],
    ['Å\u0083', 'Ń'],
    ['Ã³', 'ó'],
    ['Ã“', 'Ó'],
    ['Å›', 'ś'],
    ['Åš', 'Ś'],
    ['Åº', 'ź'],
    ['Å¹', 'Ź'],
    ['Å¼', 'ż'],
    ['Å»', 'Ż'],
    ['Ã¡', 'á'],
    ['Ã', 'Á'],
    ['Ã©', 'é'],
    ['Ã‰', 'É'],
    ['Ã­', 'í'],
    ['Ã', 'Í'],
    ['Ãº', 'ú'],
    ['Ãš', 'Ú'],
    ['Ã±', 'ñ'],
    ['Ã‘', 'Ñ'],
    ['â€™', "'"],
    ['â€˜', "'"],
    ['â€œ', '"'],
    ['â€\x9d', '"'],
    ['â€“', '-'],
    ['â€”', '-'],
    ['â€¦', '...'],
    ['Â ', ' '],
  ].sort((a, b) => b[0].length - a[0].length),
);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [k, rawVal] = token.split('=');
    const key = k.slice(2);
    if (rawVal !== undefined) {
      out[key] = rawVal;
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

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const t = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(t)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(t)) return false;
  return fallback;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isTextCandidate(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return DEFAULT_EXTENSIONS.has(ext);
}

function listFiles(rootDir, onlyList = []) {
  const onlySet = new Set(
    (onlyList || []).map((p) => p.replace(/\\/g, '/').replace(/^\.\/+/, '')),
  );
  const stack = [rootDir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isTextCandidate(abs)) continue;
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      if (rel === 'import/fix-encoding.mjs') continue;
      if (onlySet.size && !onlySet.has(rel)) continue;
      files.push(abs);
    }
  }
  return files;
}

function countSuspicious(text) {
  let total = 0;
  for (const re of SUSPICIOUS_PATTERNS) {
    const matches = text.match(re);
    total += matches ? matches.length : 0;
  }
  return total;
}

function collectSnippets(text, maxSnippets = 6) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length && out.length < maxSnippets; i += 1) {
    const line = lines[i];
    if (
      !SUSPICIOUS_PATTERNS.some((re) => {
        const local = new RegExp(re.source, re.flags);
        return local.test(line);
      })
    ) {
      continue;
    }
    out.push({
      line: i + 1,
      text: line.slice(0, 220),
    });
  }
  return out;
}

function replaceAll(text, search, replacement) {
  let out = text;
  while (out.includes(search)) {
    out = out.replace(search, replacement);
  }
  return out;
}

function normalizeText(text) {
  let out = text;
  for (const [search, replacement] of REPLACEMENTS.entries()) {
    if (!out.includes(search)) continue;
    out = replaceAll(out, search, replacement);
  }
  return out;
}

function processFile(filePath, { apply = false }) {
  const original = fs.readFileSync(filePath, 'utf8');
  const beforeCount = countSuspicious(original);
  if (!beforeCount) {
    return {
      filePath,
      beforeCount: 0,
      afterCount: 0,
      changed: false,
      snippets: [],
    };
  }

  const updated = normalizeText(original);
  const afterCount = countSuspicious(updated);
  const changed = updated !== original && afterCount < beforeCount;

  if (apply && changed) {
    fs.writeFileSync(filePath, updated, 'utf8');
  }

  return {
    filePath,
    beforeCount,
    afterCount: changed ? afterCount : beforeCount,
    changed: apply && changed,
    snippets: collectSnippets(original),
  };
}

function runEncodingPass(options = {}) {
  const root = path.resolve(String(options.root || process.cwd()));
  const reportPath = path.resolve(
    String(options.report || path.join(root, 'import', 'generated', 'encoding-report.json')),
  );
  const apply = toBool(options.apply, false);
  const onlyFiles = parseCsvList(options.only);

  const files = listFiles(root, onlyFiles);
  const results = [];
  for (const filePath of files) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    const info = processFile(filePath, { apply });
    if (!info.beforeCount) continue;
    results.push({
      file: rel,
      beforeCount: info.beforeCount,
      afterCount: info.afterCount,
      changed: info.changed,
      snippets: info.snippets,
    });
  }

  const summary = {
    root,
    scannedFiles: files.length,
    flaggedFiles: results.length,
    changedFiles: results.filter((x) => x.changed).length,
    suspiciousBefore: results.reduce((sum, x) => sum + x.beforeCount, 0),
    suspiciousAfter: results.reduce((sum, x) => sum + x.afterCount, 0),
    apply,
    generatedAt: new Date().toISOString(),
  };

  const report = { summary, files: results };
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  return { reportPath, report };
}

function printSummary({ reportPath, report }) {
  const { summary } = report;
  console.log(
    [
      `encoding: scanned=${summary.scannedFiles}`,
      `flagged=${summary.flaggedFiles}`,
      `changed=${summary.changedFiles}`,
      `before=${summary.suspiciousBefore}`,
      `after=${summary.suspiciousAfter}`,
      `apply=${summary.apply}`,
    ].join(' | '),
  );
  console.log(`report=${reportPath}`);
}

function isMain() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMain()) {
  const args = parseArgs(process.argv);
  try {
    const run = runEncodingPass(args);
    printSummary(run);
  } catch (err) {
    console.error(`encoding-error: ${err?.message || err}`);
    process.exitCode = 1;
  }
}

export { runEncodingPass };
