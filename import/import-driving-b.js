// Import kursu "Prawo jazdy kat. B (PL->ES)" - wariant podstawowy
// Uzycie:
//   node import/import-driving-b.js --dry-run
//   node import/import-driving-b.js --service-account path/to/serviceAccount.json
//   node import/import-driving-b.js --project-id aquivivo-platform

const path = require('node:path');
const { runDrivingImport } = require('./lib/driving-b-importer.cjs');

runDrivingImport({
  includeExtras: false,
  root: path.resolve(__dirname, 'driving_b'),
}).catch((err) => {
  console.error('Import nieudany:', err?.message || err);
  process.exitCode = 1;
});

