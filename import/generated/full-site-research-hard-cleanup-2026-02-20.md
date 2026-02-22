# Full Site Research – Hard Cleanup Pass (2026-02-20)

## Executed
1. Removed legacy mini-chat CSS stacks and kept only `v4`.
2. Removed unreachable branch in lesson route loader.
3. Re-ran full static QA.

## Changes
- CSS cleanup:
  - removed obsolete mini-chat sections:
    - `Global mini chat windows`
    - `Global quick reply popup`
    - `messenger-clone`
    - `mini-chat-v3`
  - retained only:
    - `Mini Chat v4: messenger-like popup (layout reset)`
  - file: `assets/css/styles.css`

- Dead code removed:
  - removed unreachable code block after early `return` in lesson flow
  - file: `assets/js/pages/lessonpage-page.js`

- UX/i18n corrections (from previous pass, preserved):
  - mini-chat labels and placeholders in Spanish
  - lesson/exercise/review/versions wording normalization
  - broadcast read-mark behavior in header message dropdown

## Validation
- `node --check assets/js/pages/lessonpage-page.js` ?
- `node --check assets/js/global-mini-chat.js` ?
- `node --check assets/js/layout.js` ?
- `node import/run-site-qa.mjs --root . --report import/generated/site-qa-after-hard-cleanup.json` ?
  - linksMissing=0
  - jsFailed=0
  - encodingFlagged=0

## Pending (requires credentials)
To run full authenticated UI smoke test:
- script: `import/run-qa-ui-smoke.mjs`
- required args:
  - `--service-account` (available)
  - `--email`
  - `--password`

Example command:
`node import/run-qa-ui-smoke.mjs --service-account "c:\Users\melle\Downloads\aquivivo-platform-firebase-adminsdk-fbsvc-3c66d5cea3.json" --email "<QA_EMAIL>" --password "<QA_PASSWORD>" --base-url "http://127.0.0.1:5501" --levels "A1,A2" --output "import/generated/qa-ui-report.json"`
