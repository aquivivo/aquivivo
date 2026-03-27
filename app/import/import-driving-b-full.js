// Kompletny import kursu "Prawo jazdy kat. B (PL->ES)" wraz z materialami dodatkowymi
// Uzycie:
//   node import/import-driving-b-full.js --dry-run
//   node import/import-driving-b-full.js --service-account path/to/serviceAccount.json
//   node import/import-driving-b-full.js --project-id aquivivo-platform

const path = require('node:path');
const { runDrivingImport } = require('./lib/driving-b-importer.cjs');

runDrivingImport({
  includeExtras: true,
  root: path.resolve(__dirname, 'driving_b'),
}).catch((err) => {
  console.error('Import nieudany:', err?.message || err);
  process.exitCode = 1;
});

