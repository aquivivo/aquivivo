# QA Scripts

## 1) Encoding scan (dry-run)

```bash
node import/fix-encoding.mjs --root . --report import/generated/encoding-report.json
```

## 2) Encoding apply (controlled)

```bash
node import/fix-encoding.mjs --root . --apply true --report import/generated/encoding-report.json
```

Notes:
- `--apply` only writes a file when suspicious mojibake patterns are reduced.
- Default mode is dry-run (no file changes).

## 3) Full site QA in one command

```bash
node import/run-site-qa.mjs --root . --report import/generated/site-qa-report.json
```

This runs:
- local link validation (`href/src` in HTML)
- `node --check` syntax validation for JS/MJS/CJS
- encoding anomaly scan (via `import/fix-encoding.mjs`)

If problems are found, script exits with code `1` by default.
