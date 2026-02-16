// Kompletny import kursu "Prawo jazdy kat. B (PL→ES)" wraz z materiałami dodatkowymi
// Tryb: idempotentny, dry run (--dry-run)
// Użycie: node import/import-driving-b-full.js [--dry-run]

import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve('import/driving_b');

const firebaseConfig = {
  apiKey: 'AIzaSyBoa3Yf82CDW6k1FSwdeoQg-gBTjh9kVZM',
  authDomain: 'aquivivo-platform.firebaseapp.com',
  projectId: 'aquivivo-platform',
  storageBucket: 'aquivivo-platform.firebasestorage.app',
  messagingSenderId: '116115622011',
  appId: '1:116115622011:web:33a4a583eba4368071bade',
  measurementId: 'G-V5RQEWRDGR',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function loadJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
}

async function importCollection(col, arr, idField = 'id') {
  for (const obj of arr) {
    const id =
      obj[idField] ||
      obj.word ||
      obj.abbr ||
      obj.situation ||
      obj.titlePl ||
      obj.questionPl ||
      undefined;
    if (!id) continue;
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would import ${col}/${id}`);
      continue;
    }
    await setDoc(
      doc(db, col, String(id).replace(/\s+/g, '_').toLowerCase()),
      obj,
      { merge: true },
    );
    console.log(`Imported ${col}/${id}`);
  }
}

async function main() {
  await importCollection('course_paths', loadJson('course_paths.json'));
  await importCollection('modules', loadJson('modules.json'));
  await importCollection('courses', loadJson('courses.json'));
  await importCollection(
    'driving_vocab',
    loadJson('vocab_explained.json'),
    false,
  );
  await importCollection(
    'driving_vocab',
    loadJson('vocab_explained_extra.json'),
    false,
  );
  await importCollection('driving_signs', loadJson('road_signs.json'), false);
  await importCollection(
    'driving_signs',
    loadJson('road_signs_extra.json'),
    false,
  );
  await importCollection('driving_faq', loadJson('faq.json'), false);
  await importCollection(
    'driving_checklist',
    loadJson('checklist.json'),
    false,
  );
  await importCollection(
    'driving_dialogues',
    loadJson('dialogues.json'),
    false,
  );
  await importCollection(
    'driving_exam_traps',
    loadJson('exam_traps.json'),
    false,
  );
  await importCollection(
    'driving_audio',
    loadJson('audio_examples.json'),
    false,
  );
  await importCollection(
    'driving_images',
    loadJson('image_examples.json'),
    false,
  );
  await importCollection(
    'driving_abbr',
    loadJson('tech_abbreviations.json'),
    false,
  );
  await importCollection('driving_quiz', loadJson('mixed_quiz.json'), false);
}

main().then(() => {
  console.log('Import zakończony.');
});
