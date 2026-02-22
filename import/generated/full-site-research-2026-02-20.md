# Full Site Research – 2026-02-20

## Scope
- Global QA (links, JS syntax, encoding)
- Core user flows: layout/header badges, mini chat popup, lesson route, exercise labels, versions summary
- High-risk i18n and UX consistency checks

## Automated QA
- Command: `node import/run-site-qa.mjs --root . --report import/generated/site-qa-after-full-review-pass.json`
- Result: `linksMissing=0 | jsFailed=0 | encodingFlagged=0 | status=OK`

## Implemented fixes in this pass
1. Rebuilt global quick chat popup (v4 namespace) and stabilized behavior:
   - file: `assets/js/global-mini-chat.js`
   - file: `assets/css/styles.css`

2. Fixed unread broadcast behavior in header messages dropdown:
   - broadcast row click now persists seen timestamp in localStorage
   - file: `assets/js/layout.js`

3. Normalized key user-facing strings to Spanish in runtime pages:
   - `Mensajes/Buscar/Escribe un mensaje...` in mini chat
   - `Lección`, `Todavía`, `módulo` strings in lesson/exercise/versions/review pages
   - files:
     - `assets/js/global-mini-chat.js`
     - `assets/js/pages/lessonpage-page.js`
     - `assets/js/pages/ejercicio-page.js`
     - `assets/js/pages/versions-page.js`
     - `assets/js/pages/review-page.js`
     - `assets/js/layout.js`

## Findings (remaining)

### High
1. Legacy/duplicate mini-chat CSS stacks still exist and can conflict in future edits.
   - evidence: multiple blocks in `assets/css/styles.css` for `.mini-chat-dock`, `.messenger-clone`, `.mini-chat-v3`, `.mini-chat-v4`
   - ref examples: `assets/css/styles.css:9601`, `assets/css/styles.css:11179`, `assets/css/styles.css:11736`, `assets/css/styles.css:12137`
   - impact: hard-to-predict overrides and regressions.

2. Dead/unreachable branch in lesson route flow.
   - ref: `assets/js/pages/lessonpage-page.js:2217` then `return;`, followed by code starting at `assets/js/pages/lessonpage-page.js:2220`
   - impact: maintenance risk; misleading fallback logic.

### Medium
3. Admin-side mixed-language strings remain in some admin tools (PL + ES).
   - refs include `assets/js/pages/esadmin-page.js` and `assets/js/pages/admin-wizard-page.js`
   - impact: inconsistent UX in admin panel.

4. Full authenticated UI smoke was not executed from this run due missing runtime credentials in this shell session.
   - script requires: `--service-account`, `--email`, `--password`
   - file: `import/run-qa-ui-smoke.mjs`

## Recommended next phase (safe order)
1. CSS cleanup sprint: keep only mini-chat v4 rules; remove obsolete `.mini-chat-*` legacy blocks.
2. Remove unreachable block in `lessonpage-page.js` and keep one route-render path.
3. Admin i18n normalization pass (optional if admin-only language can differ).
4. Run authenticated smoke:
   - `node import/run-qa-ui-smoke.mjs --service-account <path> --email <qa_user> --password <qa_pass> --base-url http://127.0.0.1:5501 --levels A1,A2 --output import/generated/qa-ui-report.json`
