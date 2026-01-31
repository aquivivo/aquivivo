import { auth, db } from '../firebase-init.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const level = params.get('level');
const id = params.get('id');

const lessonTitle = document.getElementById('lessonTitle');
const lessonDesc = document.getElementById('lessonDesc');
const lessonContent = document.getElementById('lessonContent');
const lessonEmpty = document.getElementById('lessonEmpty');
const pillLevel = document.getElementById('pillLevel');
const pillTopic = document.getElementById('pillTopic');
const pillAdminLink = document.getElementById('pillAdminLink');

async function loadLesson(user) {
  try {
    if (!level || !id) {
      lessonEmpty.style.display = 'block';
      lessonEmpty.textContent = 'Brak parametrów lekcji.';
      return;
    }

    const userEmail = user?.email || null; // ✅ HOTFIX

    const lessonRef = doc(db, 'lessons', id);
    const snap = await getDoc(lessonRef);

    if (!snap.exists()) {
      lessonEmpty.style.display = 'block';
      lessonEmpty.textContent = 'Lekcja nie istnieje.';
      return;
    }

    const data = snap.data();

    lessonTitle.textContent = data.title || 'Lekcja';
    lessonDesc.textContent = data.description || '';
    pillLevel.textContent = `Nivel: ${level}`;
    pillTopic.textContent = `Tema: ${data.topic || '—'}`;

    if (data.html) {
      lessonContent.innerHTML = data.html;
      lessonContent.style.display = 'block';
    } else {
      lessonEmpty.style.display = 'block';
      lessonEmpty.textContent = 'Brak treści lekcji.';
    }

    // admin link
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists() && userDoc.data().admin === true) {
      pillAdminLink.style.display = 'inline-flex';
      pillAdminLink.href = `lessonadmin.html?level=${level}&id=${id}`;
    }
  } catch (err) {
    console.error(err);
    lessonEmpty.style.display = 'block';
    lessonEmpty.textContent =
      'No se pudo cargar la lección. Revisa la consola.';
  }
}

auth.onAuthStateChanged((user) => {
  if (!user) return;
  loadLesson(user);
});
