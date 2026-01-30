// assets/js/auth.js
// Login / Register dla AquíVivo ☕ — Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// 🔧 Wstaw swoje dane Firebase:
const firebaseConfig = {
  apiKey: "TU_WPROWADZ_SWÓJ_API_KEY",
  authDomain: "TU_WPROWADZ_SWÓJ_PROJECT_ID.firebaseapp.com",
  projectId: "TU_WPROWADZ_SWÓJ_PROJECT_ID",
  storageBucket: "TU_WPROWADZ_SWÓJ_PROJECT_ID.appspot.com",
  messagingSenderId: "NUMER",
  appId: "APP_ID"
};

// 🔥 Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 🧑‍💻 Formularz logowania
const form = document.querySelector('.auth-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPass').value;

  try {
    // Próba logowania
    await signInWithEmailAndPassword(auth, email, pass);
    alert(`Bienvenido ${email} ☕`);
    window.location.href = "espanel.html";
  } catch (err) {
    console.warn("Usuario no encontrado. Creando nueva cuenta...");
    await createUserWithEmailAndPassword(auth, email, pass);
    alert(`Cuenta creada! Bienvenido ${email} ☕`);
    window.location.href = "espanel.html";
  }
});
