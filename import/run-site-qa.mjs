import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HTML_EXT = '.html';
const JS_EXT = new Set(['.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  '.git',
  '.firebase',
  '.vscode',
  'node_modules',
  '.tmp_codegen',
  '.tmp_xlsx_a1_184343842',
  '.tmp_xlsx_a1_886702578',
  'import/generated',
]);

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

function shouldSkipDir(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized) return false;
  if (SKIP_DIRS.has(normalized)) return true;
  const parts = normalized.split('/');
  return parts.some((part, idx) => {
    const left = parts.slice(0, idx + 1).join('/');
    return SKIP_DIRS.has(part) || SKIP_DIRS.has(left);
  });
}

function walkFiles(rootDir) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(rootDir, rel) : rootDir;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      const childAbs = path.join(rootDir, childRel);
      if (entry.isDirectory()) {
        if (shouldSkipDir(childRel)) continue;
        stack.push(childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push({
        abs: childAbs,
        rel: childRel.replace(/\\/g, '/'),
      });
    }
  }
  return out;
}

function isExternalRef(value) {
  const ref = String(value || '').trim();
  if (!ref) return true;
  if (ref.startsWith('#')) return true;
  if (ref.startsWith('data:')) return true;
  if (ref.startsWith('mailto:')) return true;
  if (ref.startsWith('tel:')) return true;
  if (ref.startsWith('javascript:')) return true;
  if (/^[a-z]+:\/\//i.test(ref)) return true;
  return false;
}

function cleanRef(value) {
  return String(value || '').split('#')[0].split('?')[0].trim();
}

function resolveRefPath(rootDir, fromFile, ref) {
  const normalized = cleanRef(ref);
  if (!normalized) return null;
  if (normalized.startsWith('/')) {
    return path.resolve(rootDir, normalized.slice(1));
  }
  return path.resolve(path.dirname(fromFile), normalized);
}

function checkLocalLinks(rootDir, htmlFiles) {
  const refRe = /\b(?:href|src)=["']([^"']+)["']/gi;
  const missing = [];
  const perFile = {};
  let totalRefs = 0;

  for (const file of htmlFiles) {
    const text = fs.readFileSync(file.abs, 'utf8');
    let match;
    while ((match = refRe.exec(text))) {
      const rawRef = match[1];
      if (isExternalRef(rawRef)) continue;
      totalRefs += 1;
      const resolved = resolveRefPath(rootDir, file.abs, rawRef);
      if (!resolved) continue;
      if (fs.existsSync(resolved)) continue;
      const target = path.relative(rootDir, resolved).replace(/\\/g, '/');
      const item = {
        file: file.rel,
        ref: rawRef,
        missingTarget: target,
      };
      missing.push(item);
      if (!perFile[file.rel]) perFile[file.rel] = [];
      perFile[file.rel].push(item);
    }
  }

  return {
    htmlFilesScanned: htmlFiles.length,
    totalRefs,
    missingCount: missing.length,
    missing,
    perFile,
  };
}

function checkJsSyntax(jsFiles) {
  const failed = [];
  for (const file of jsFiles) {
    const run = spawnSync(process.execPath, ['--check', file.abs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (run.status === 0) continue;
    failed.push({
      file: file.rel,
      code: run.status,
      stderr: String(run.stderr || '').trim().slice(0, 8000),
    });
  }
  return {
    filesScanned: jsFiles.length,
    failedCount: failed.length,
    failed,
  };
}

function runEncodingScan(rootDir, reportPath) {
  const script = path.join(rootDir, 'import', 'fix-encoding.mjs');
  const run = spawnSync(process.execPath, [script, '--root', rootDir, '--report', reportPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let parsed = null;
  if (fs.existsSync(reportPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch {}
  }

  return {
    exitCode: run.status ?? 1,
    stdout: String(run.stdout || '').trim(),
    stderr: String(run.stderr || '').trim(),
    reportPath: path.relative(rootDir, reportPath).replace(/\\/g, '/'),
    summary: parsed?.summary || null,
    flaggedFiles: parsed?.files?.slice(0, 200) || [],
  };
}

function summarize({ links, syntax, encoding, startedAt, finishedAt, rootDir }) {
  const criticalErrors =
    Number(links?.missingCount || 0) + Number(syntax?.failedCount || 0) + (encoding?.exitCode ? 1 : 0);

  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    finishedAt,
    rootDir,
    checks: {
      links,
      syntax,
      encoding: {
        exitCode: encoding.exitCode,
        summary: encoding.summary,
        reportPath: encoding.reportPath,
        stdout: encoding.stdout,
        stderr: encoding.stderr,
        flaggedSample: encoding.flaggedFiles,
      },
    },
    status: {
      ok: criticalErrors === 0,
      criticalErrors,
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(String(args.root || process.cwd()));
  const reportPath = path.resolve(
    String(args.report || path.join(rootDir, 'import', 'generated', 'site-qa-report.json')),
  );
  const encodingReportPath = path.resolve(
    String(args.encodingReport || path.join(rootDir, 'import', 'generated', 'encoding-report.json')),
  );
  const failOnError = toBool(args.failOnError, true);
  const startedAt = new Date().toISOString();

  const files = walkFiles(rootDir);
  const htmlFiles = files.filter((f) => path.extname(f.abs).toLowerCase() === HTML_EXT);
  const jsFiles = files.filter((f) => JS_EXT.has(path.extname(f.abs).toLowerCase()));

  const links = checkLocalLinks(rootDir, htmlFiles);
  const syntax = checkJsSyntax(jsFiles);
  const encoding = runEncodingScan(rootDir, encodingReportPath);
  const finishedAt = new Date().toISOString();
  const report = summarize({ links, syntax, encoding, startedAt, finishedAt, rootDir });

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    [
      `qa: linksMissing=${links.missingCount}`,
      `jsFailed=${syntax.failedCount}`,
      `encodingFlagged=${encoding.summary?.flaggedFiles ?? 'n/a'}`,
      `status=${report.status.ok ? 'OK' : 'FAIL'}`,
    ].join(' | '),
  );
  console.log(`report=${path.relative(rootDir, reportPath).replace(/\\/g, '/')}`);

  if (failOnError && !report.status.ok) process.exitCode = 1;
}

main();
