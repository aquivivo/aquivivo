// Import skrypt dla kursu "Prawo jazdy kat. B (PL→ES)"
// Tryb: idempotentny, dry run (ustaw DRY_RUN=true by nie zapisywać)
// Użycie: node import/import-driving-b.js [--dry-run]

import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve('import/driving_b');

const firebaseConfig = {
  // <-- UZUPEŁNIJ DANYMI SWOJEGO PROJEKTU FIREBASE
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function loadJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
}

async function importCollection(col, arr, idField = 'id') {
  for (const obj of arr) {
    const id = obj[idField];
    if (!id) continue;
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would import ${col}/${id}`);
      continue;
    }
    await setDoc(doc(db, col, id), obj, { merge: true });
    console.log(`Imported ${col}/${id}`);
  }
}

async function main() {
  await importCollection('course_paths', loadJson('course_paths.json'));
  await importCollection('modules', loadJson('modules.json'));
  await importCollection('courses', loadJson('courses.json'));
  // Słownictwo, znaki, dialogi, checklisty, FAQ, pułapki, quizy, skróty
  // można zaimportować do osobnych kolekcji lub jako exercises/lessons
  // (tu: tylko główne kolekcje kursu)
}

main().then(() => {
  console.log('Import zakończony.');
});
